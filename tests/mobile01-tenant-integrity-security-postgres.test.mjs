import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import pg from "pg";

// MOBILE-01.3 — real RLS/RPC/DB-invariant enforcement tests for the P1
// confirmed by the independent MOBILE-01 consolidation gate: public.students
// carried both establishment_id and classe_id, but nothing guaranteed they
// referred to the SAME establishment. A malicious (or merely careless) Owner
// could discover a foreign class id via the public "classes" read policy,
// plant a student with their OWN establishment_id but a FOREIGN classe_id,
// and have it read — and its attendance actually marked — by the foreign
// school's teacher. Reproduced fresh against a real Postgres before writing
// this file; every test below asserts the closed state.
//
// Runs against a real, low-privilege role with row_security actually
// enabled (the "postgres" superuser bypasses RLS entirely) — same technique
// as tests/mobile01-roster-security-postgres.test.mjs.

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(testDirectory, "..");
const ADMIN_DATABASE_URL = process.env.MOBILE01_TENANT_TEST_ADMIN_DATABASE_URL ?? "postgres://postgres:testpass@localhost:55432/postgres";
const DATABASE_NAME = process.env.MOBILE01_TENANT_TEST_DATABASE_NAME ?? "mobile01_tenant_integrity_test";
const APP_ROLE = "app_rls_role_tenant";

let adminPool; // superuser connection — bypasses RLS, used only for fixture setup/assertions
let rlsPool; // low-privilege connection — RLS actually enforced, used for the calls under test
let dbAvailable = false;
let unavailableReason = "not checked yet";

test.before(async () => {
  try {
    const bootstrapPool = new pg.Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
    try {
      const existing = await bootstrapPool.query("select 1 from pg_database where datname = $1", [DATABASE_NAME]);
      if (existing.rowCount === 0) {
        await bootstrapPool.query(`create database ${DATABASE_NAME}`);
      }
    } finally {
      await bootstrapPool.end();
    }
  } catch (e) {
    unavailableReason = `Postgres unreachable at ${ADMIN_DATABASE_URL}: ${e.message}`;
    console.error(unavailableReason);
    dbAvailable = false;
    return;
  }

  const dbUrl = new URL(ADMIN_DATABASE_URL);
  dbUrl.pathname = `/${DATABASE_NAME}`;
  adminPool = new pg.Pool({ connectionString: dbUrl.toString(), max: 5 });
  try {
    await adminPool.query("select 1");
    dbAvailable = true;
  } catch (e) {
    unavailableReason = `Postgres unreachable at ${dbUrl.toString()}: ${e.message}`;
    console.error(unavailableReason);
    dbAvailable = false;
    return;
  }

  await adminPool.query(`
    drop schema if exists public cascade;
    drop schema if exists auth cascade;
    create schema public;
    create schema auth;
    create extension if not exists pgcrypto;

    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;

    create table public.profiles (id uuid primary key, role text);
    create table public.establishments (
      id uuid primary key default gen_random_uuid(),
      owner_id uuid,
      forfait text not null default 'gratuit'
    );
    -- establishment_id est nullable ici comme dans le vrai schéma
    -- (auth-setup.sql) — jamais rendu NOT NULL par cette migration,
    -- hors périmètre de MOBILE-01.3 (mission §3 : ne pas élargir le scope).
    create table public.classes (
      id uuid primary key default gen_random_uuid(),
      establishment_id uuid references public.establishments(id)
    );
    alter table public.classes enable row level security;
    create policy "Public can read classes" on public.classes for select using (true);
    create policy "Owners can manage classes" on public.classes for all
      using (establishment_id in (select id from public.establishments where owner_id = auth.uid()));
    create table public.enseignants (
      id uuid primary key default gen_random_uuid(),
      etablissement_id uuid not null references public.establishments(id),
      user_id uuid,
      nom text not null default 'Nom',
      prenom text not null default 'Prenom'
    );
    create table public.matieres (
      id uuid primary key default gen_random_uuid(),
      etablissement_id uuid not null references public.establishments(id),
      nom text not null default 'Matiere',
      departement_disciplinaire text not null default 'General'
    );
    create table public.creneaux_horaires (
      id uuid primary key default gen_random_uuid(),
      etablissement_id uuid not null references public.establishments(id),
      jour_semaine smallint not null default 1,
      heure_debut time not null default '08:00',
      heure_fin time not null default '09:00'
    );
    create table public.emplois_du_temps (
      id uuid primary key default gen_random_uuid(),
      etablissement_id uuid not null references public.establishments(id),
      annee_scolaire text not null default '2026-2027',
      classe_id uuid not null references public.classes(id),
      matiere_id uuid not null references public.matieres(id),
      enseignant_id uuid not null references public.enseignants(id),
      creneau_id uuid not null references public.creneaux_horaires(id)
    );
  `);

  const migrationSql = await readFile(
    path.join(projectRoot, "supabase/migrations/20260910120000_mobile_01_student_roster_attendance.sql"),
    "utf8"
  );
  const lifecycleSql = await readFile(
    path.join(projectRoot, "supabase/migrations/20260911090000_mobile_01_1_student_lifecycle.sql"),
    "utf8"
  );
  const tenantIntegritySql = await readFile(
    path.join(projectRoot, "supabase/migrations/20260913080000_mobile_01_3_student_tenant_integrity.sql"),
    "utf8"
  );

  try {
    await adminPool.query(`
      create table public.sync_mutations (
        mutation_id uuid primary key,
        entity_type text not null,
        operation text not null,
        establishment_id uuid not null references public.establishments(id),
        actor_user_id uuid not null,
        entity_id uuid,
        status text not null,
        error text,
        applied_at timestamptz not null default now()
      );
    `);
    await adminPool.query(migrationSql);
    await adminPool.query(lifecycleSql);
    await adminPool.query(tenantIntegritySql);

    await adminPool.query(`
      do $$
      begin
        if not exists (select 1 from pg_roles where rolname = '${APP_ROLE}') then
          create role ${APP_ROLE} login password 'testpass' nosuperuser;
        end if;
      end
      $$;
      grant usage on schema public, auth to ${APP_ROLE};
      grant select, insert, update, delete on all tables in schema public to ${APP_ROLE};
      grant select on all tables in schema auth to ${APP_ROLE};
      grant execute on all functions in schema public to ${APP_ROLE};
    `);

    const rlsUrl = new URL(dbUrl.toString());
    rlsUrl.username = APP_ROLE;
    rlsUrl.password = "testpass";
    rlsPool = new pg.Pool({ connectionString: rlsUrl.toString(), max: 5 });
    await rlsPool.query("select 1");
  } catch (e) {
    unavailableReason = `Failed to apply the real migration SQL / provision the RLS-enforced role: ${e.message}`;
    console.error(unavailableReason);
    dbAvailable = false;
  }
});

test.after(async () => {
  if (rlsPool) await rlsPool.end();
  if (adminPool) await adminPool.end();
});

async function asUser(userId, fn) {
  const client = await rlsPool.connect();
  try {
    await client.query("select set_config('request.jwt.claim.sub', $1, false)", [userId ?? ""]);
    return await fn(client);
  } finally {
    client.release();
  }
}

function newId() {
  return crypto.randomUUID();
}

// Seeds a full teacher+class+timetable fixture for one establishment, and
// returns everything a caller needs to exercise both RLS and the RPC.
async function seedSchool({ withTeacher = true } = {}) {
  const owner = newId();
  await adminPool.query("insert into auth.users (id) values ($1)", [owner]);
  const establishmentId = (await adminPool.query("insert into public.establishments (owner_id, forfait) values ($1,'pro') returning id", [owner])).rows[0].id;
  const classeId = (await adminPool.query("insert into public.classes (establishment_id) values ($1) returning id", [establishmentId])).rows[0].id;

  if (!withTeacher) return { owner, establishmentId, classeId };

  const teacherUserId = newId();
  await adminPool.query("insert into auth.users (id) values ($1)", [teacherUserId]);
  const enseignantId = (await adminPool.query("insert into public.enseignants (etablissement_id, user_id) values ($1,$2) returning id", [establishmentId, teacherUserId])).rows[0].id;
  const matiereId = (await adminPool.query("insert into public.matieres (etablissement_id) values ($1) returning id", [establishmentId])).rows[0].id;
  const creneauId = (await adminPool.query("insert into public.creneaux_horaires (etablissement_id) values ($1) returning id", [establishmentId])).rows[0].id;
  const emploiDuTempsId = (
    await adminPool.query(
      "insert into public.emplois_du_temps (etablissement_id, classe_id, matiere_id, enseignant_id, creneau_id) values ($1,$2,$3,$4,$5) returning id",
      [establishmentId, classeId, matiereId, enseignantId, creneauId]
    )
  ).rows[0].id;

  return { owner, establishmentId, classeId, teacherUserId, enseignantId, matiereId, creneauId, emploiDuTempsId };
}

async function callAttendance(userId, args) {
  const client = await rlsPool.connect();
  try {
    await client.query("select set_config('request.jwt.claim.sub', $1, false)", [userId ?? ""]);
    const res = await client.query(
      `select * from public.sync_apply_attendance_mark($1, $2, $3, $4, $5, $6)`,
      [args.mutationId, args.establishmentId, args.emploiDuTempsId, args.studentId, args.sessionDate ?? "2026-09-12", args.status ?? "present"]
    );
    return res.rows[0];
  } finally {
    client.release();
  }
}

test.beforeEach(async () => {
  if (dbAvailable) {
    await adminPool.query("delete from public.students");
    await adminPool.query("delete from public.student_attendance");
    await adminPool.query("delete from public.lesson_sessions");
  }
});

// ============================================================================
// TEST 1 — the exact exploit, INSERT path.
// ============================================================================
test("real Postgres — TEST 1: Owner A cannot insert a student with School A's establishment_id and School B's classe_id", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const a = await seedSchool();
  const b = await seedSchool();

  await assert.rejects(
    () => asUser(a.owner, (client) =>
      client.query("insert into public.students (establishment_id, classe_id, first_name, last_name) values ($1,$2,'Owner A','Plant')", [a.establishmentId, b.classeId])
    ),
    "the cross-tenant plant must be rejected, not silently accepted"
  );

  const count = await adminPool.query("select count(*)::int as n from public.students where last_name = 'Plant'");
  assert.equal(count.rows[0].n, 0, "no row must ever be created by this attempt");
});

// ============================================================================
// TEST 2 — legitimate same-tenant insert still works.
// ============================================================================
test("real Postgres — TEST 2: Owner A can insert a student with School A's establishment_id and School A's own classe_id", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const a = await seedSchool();

  const result = await asUser(a.owner, (client) =>
    client.query("insert into public.students (establishment_id, classe_id, first_name, last_name) values ($1,$2,'Jean','Mbarga') returning id", [a.establishmentId, a.classeId])
  );
  assert.equal(result.rows.length, 1);
});

// ============================================================================
// TEST 3 — the exploit via UPDATE instead of INSERT.
// ============================================================================
test("real Postgres — TEST 3: Owner A cannot UPDATE an existing student's classe_id to point at School B's class", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const a = await seedSchool();
  const b = await seedSchool();

  const student = await asUser(a.owner, (client) =>
    client.query("insert into public.students (establishment_id, classe_id, first_name, last_name) values ($1,$2,'Jean','Mbarga') returning id", [a.establishmentId, a.classeId])
  );
  const studentId = student.rows[0].id;

  await assert.rejects(
    () => asUser(a.owner, (client) => client.query("update public.students set classe_id = $1 where id = $2", [b.classeId, studentId])),
    "moving a student to a foreign school's class must be rejected"
  );

  const row = await adminPool.query("select classe_id from public.students where id = $1", [studentId]);
  assert.equal(row.rows[0].classe_id, a.classeId, "the student's classe_id must remain unchanged after the rejected attempt");
});

// ============================================================================
// TEST 4 — Owner A cannot move a student to an establishment they don't own.
// ============================================================================
test("real Postgres — TEST 4: Owner A cannot UPDATE a student's establishment_id to School B without owning School B", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const a = await seedSchool();
  const b = await seedSchool();

  const student = await asUser(a.owner, (client) =>
    client.query("insert into public.students (establishment_id, classe_id, first_name, last_name) values ($1,$2,'Jean','Mbarga') returning id", [a.establishmentId, a.classeId])
  );
  const studentId = student.rows[0].id;

  await assert.rejects(
    () => asUser(a.owner, (client) => client.query("update public.students set establishment_id = $1 where id = $2", [b.establishmentId, studentId])),
    "reassigning a student to an establishment the caller does not own must be rejected"
  );
});

// ============================================================================
// TEST 5 — Teacher B never reads any School A student, even with manipulated
// classe_id/establishment_id combinations (RLS defense in depth, not just
// "no row exists" — asserts the read itself is scoped correctly).
// ============================================================================
test("real Postgres — TEST 5: Teacher B sees no School A student under any classe_id/establishment_id combination", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const a = await seedSchool();
  const b = await seedSchool();

  // A legitimate School A student (never touched by B in a working system).
  await asUser(a.owner, (client) =>
    client.query("insert into public.students (establishment_id, classe_id, first_name, last_name) values ($1,$2,'Jean','Mbarga')", [a.establishmentId, a.classeId])
  );

  const readAsB = await asUser(b.teacherUserId, (client) => client.query("select id from public.students where establishment_id = $1", [a.establishmentId]));
  assert.equal(readAsB.rows.length, 0, "Teacher B must never see a School A student by any query shape");

  const readByClass = await asUser(b.teacherUserId, (client) => client.query("select id from public.students where classe_id = $1", [a.classeId]));
  assert.equal(readByClass.rows.length, 0, "Teacher B must never see School A's class roster either");
});

// ============================================================================
// TEST 6 — Teacher B cannot mark attendance for a School A student.
// ============================================================================
test("real Postgres — TEST 6: Teacher B cannot mark attendance for a School A student via the real RPC", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const a = await seedSchool();
  const b = await seedSchool();

  const student = await asUser(a.owner, (client) =>
    client.query("insert into public.students (establishment_id, classe_id, first_name, last_name) values ($1,$2,'Jean','Mbarga') returning id", [a.establishmentId, a.classeId])
  );
  const studentId = student.rows[0].id;

  const result = await callAttendance(b.teacherUserId, {
    mutationId: newId(),
    establishmentId: b.establishmentId,
    emploiDuTempsId: b.emploiDuTempsId,
    studentId,
  });
  assert.equal(result.result_status, "rejected");
  assert.equal(result.result_entity_id, null);

  const count = await adminPool.query("select count(*)::int as n from public.student_attendance where student_id = $1", [studentId]);
  assert.equal(count.rows[0].n, 0);
});

// ============================================================================
// TEST 7 — the legitimate path still works end to end.
// ============================================================================
test("real Postgres — TEST 7: Teacher A can mark attendance for their own School A / Class A student", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const a = await seedSchool();

  const student = await asUser(a.owner, (client) =>
    client.query("insert into public.students (establishment_id, classe_id, first_name, last_name) values ($1,$2,'Jean','Mbarga') returning id", [a.establishmentId, a.classeId])
  );
  const studentId = student.rows[0].id;

  const result = await callAttendance(a.teacherUserId, {
    mutationId: newId(),
    establishmentId: a.establishmentId,
    emploiDuTempsId: a.emploiDuTempsId,
    studentId,
  });
  assert.equal(result.result_status, "applied");
  assert.ok(result.result_entity_id);
});

// ============================================================================
// TEST 8 — archived student still rejected (MOBILE-01.1 guarantee preserved).
// ============================================================================
test("real Postgres — TEST 8: an archived student is still rejected for attendance after the MOBILE-01.3 hardening", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const a = await seedSchool();

  const student = await asUser(a.owner, (client) =>
    client.query("insert into public.students (establishment_id, classe_id, first_name, last_name) values ($1,$2,'Jean','Mbarga') returning id", [a.establishmentId, a.classeId])
  );
  const studentId = student.rows[0].id;
  await adminPool.query("update public.students set status = 'archived' where id = $1", [studentId]);

  const result = await callAttendance(a.teacherUserId, {
    mutationId: newId(),
    establishmentId: a.establishmentId,
    emploiDuTempsId: a.emploiDuTempsId,
    studentId,
  });
  assert.equal(result.result_status, "rejected", "archived students must remain unmarkable after this migration");
});

// ============================================================================
// TEST 9 — homonyms within the same, correctly-scoped class still both work.
// ============================================================================
test("real Postgres — TEST 9: two students with identical names in the same class are both accepted, never merged/rejected", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const a = await seedSchool();

  const first = await asUser(a.owner, (client) =>
    client.query("insert into public.students (establishment_id, classe_id, first_name, last_name) values ($1,$2,'Paul','Nana') returning id", [a.establishmentId, a.classeId])
  );
  const second = await asUser(a.owner, (client) =>
    client.query("insert into public.students (establishment_id, classe_id, first_name, last_name) values ($1,$2,'Paul','Nana') returning id", [a.establishmentId, a.classeId])
  );
  assert.notEqual(first.rows[0].id, second.rows[0].id, "homonyms must remain distinct rows after the tenant-integrity hardening");
});

// ============================================================================
// TEST 10 — archive/restore within the same, correctly-scoped tenant.
// ============================================================================
test("real Postgres — TEST 10: Owner A can archive then restore their own, correctly-scoped student", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const a = await seedSchool();

  const student = await asUser(a.owner, (client) =>
    client.query("insert into public.students (establishment_id, classe_id, first_name, last_name) values ($1,$2,'Marie','Ngo') returning id", [a.establishmentId, a.classeId])
  );
  const studentId = student.rows[0].id;

  await asUser(a.owner, (client) => client.query("update public.students set status = 'archived' where id = $1", [studentId]));
  let row = await adminPool.query("select status from public.students where id = $1", [studentId]);
  assert.equal(row.rows[0].status, "archived");

  await asUser(a.owner, (client) => client.query("update public.students set status = 'active' where id = $1", [studentId]));
  row = await adminPool.query("select status from public.students where id = $1", [studentId]);
  assert.equal(row.rows[0].status, "active");
});

// ============================================================================
// Section 11 — historical / pre-existing inconsistent data.
// ============================================================================
test("real Postgres — a pre-existing cross-tenant row (created before the invariant existed) blocks the migration explicitly, rather than being silently corrected or left inconsistent", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);

  // Build a SEPARATE, fresh schema at the pre-MOBILE-01.3 state (only the
  // original two MOBILE migrations), plant an inconsistent row exactly as
  // the original exploit did, then attempt to apply the MOBILE-01.3
  // migration on top and assert it refuses rather than silently proceeding.
  const dbUrl = new URL(ADMIN_DATABASE_URL);
  dbUrl.pathname = "/mobile01_tenant_integrity_historical_test";
  const bootstrapPool = new pg.Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
  try {
    const existing = await bootstrapPool.query("select 1 from pg_database where datname = 'mobile01_tenant_integrity_historical_test'");
    if (existing.rowCount === 0) await bootstrapPool.query("create database mobile01_tenant_integrity_historical_test");
  } finally {
    await bootstrapPool.end();
  }

  const histPool = new pg.Pool({ connectionString: dbUrl.toString(), max: 2 });
  try {
    await histPool.query(`
      drop schema if exists public cascade;
      drop schema if exists auth cascade;
      create schema public;
      create schema auth;
      create extension if not exists pgcrypto;
      create table auth.users (id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
      $$;
      create table public.establishments (id uuid primary key default gen_random_uuid(), owner_id uuid, forfait text not null default 'gratuit');
      create table public.classes (id uuid primary key default gen_random_uuid(), establishment_id uuid references public.establishments(id));
      alter table public.classes enable row level security;
      create policy "Public can read classes" on public.classes for select using (true);
      create table public.enseignants (id uuid primary key default gen_random_uuid(), etablissement_id uuid not null references public.establishments(id), user_id uuid, nom text not null default 'Nom', prenom text not null default 'Prenom');
      create table public.matieres (id uuid primary key default gen_random_uuid(), etablissement_id uuid not null references public.establishments(id));
      create table public.creneaux_horaires (id uuid primary key default gen_random_uuid(), etablissement_id uuid not null references public.establishments(id), jour_semaine smallint not null default 1);
      create table public.emplois_du_temps (id uuid primary key default gen_random_uuid(), etablissement_id uuid not null references public.establishments(id), annee_scolaire text not null default '2026-2027', classe_id uuid not null references public.classes(id), matiere_id uuid not null references public.matieres(id), enseignant_id uuid not null references public.enseignants(id), creneau_id uuid not null references public.creneaux_horaires(id));
      create table public.sync_mutations (mutation_id uuid primary key, entity_type text not null, operation text not null, establishment_id uuid not null references public.establishments(id), actor_user_id uuid not null, entity_id uuid, status text not null, error text, applied_at timestamptz not null default now());
    `);
    const migrationSql = await readFile(path.join(projectRoot, "supabase/migrations/20260910120000_mobile_01_student_roster_attendance.sql"), "utf8");
    const lifecycleSql = await readFile(path.join(projectRoot, "supabase/migrations/20260911090000_mobile_01_1_student_lifecycle.sql"), "utf8");
    await histPool.query(migrationSql);
    await histPool.query(lifecycleSql);

    // Plant a pre-existing inconsistent row directly (bypassing RLS as
    // superuser), simulating data left over from before this hardening.
    const estA = (await histPool.query("insert into public.establishments (owner_id, forfait) values (gen_random_uuid(), 'pro') returning id")).rows[0].id;
    const estB = (await histPool.query("insert into public.establishments (owner_id, forfait) values (gen_random_uuid(), 'pro') returning id")).rows[0].id;
    const classB = (await histPool.query("insert into public.classes (establishment_id) values ($1) returning id", [estB])).rows[0].id;
    const attendanceHistoryStudentId = (
      await histPool.query(
        "insert into public.students (establishment_id, classe_id, first_name, last_name) values ($1,$2,'Legacy','Row') returning id",
        [estA, classB]
      )
    ).rows[0].id;

    const tenantIntegritySql = await readFile(path.join(projectRoot, "supabase/migrations/20260913080000_mobile_01_3_student_tenant_integrity.sql"), "utf8");
    await assert.rejects(
      () => histPool.query(tenantIntegritySql),
      /abandonn.e/i,
      "the migration must refuse to proceed when a pre-existing inconsistent row is found, never silently correct or ignore it"
    );

    // The pre-existing row itself must remain completely untouched — never
    // auto-moved to a "correct" school, never deleted.
    const stillThere = await histPool.query("select establishment_id, classe_id from public.students where id = $1", [attendanceHistoryStudentId]);
    assert.equal(stillThere.rows.length, 1, "the pre-existing row must not be deleted by the refused migration");
    assert.equal(stillThere.rows[0].establishment_id, estA, "the pre-existing row's establishment_id must not be silently changed");
    assert.equal(stillThere.rows[0].classe_id, classB, "the pre-existing row's classe_id must not be silently changed");
  } finally {
    await histPool.end();
  }
});

// ============================================================================
// Section 12 — attendance history integrity around the new invariant.
// ============================================================================
test("real Postgres — attendance history, lesson_sessions and idempotency are all unaffected by the tenant-integrity hardening", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const a = await seedSchool();
  const student = await asUser(a.owner, (client) =>
    client.query("insert into public.students (establishment_id, classe_id, first_name, last_name) values ($1,$2,'Jean','Mbarga') returning id", [a.establishmentId, a.classeId])
  );
  const studentId = student.rows[0].id;

  const mutationId = newId();
  const first = await callAttendance(a.teacherUserId, { mutationId, establishmentId: a.establishmentId, emploiDuTempsId: a.emploiDuTempsId, studentId, status: "present" });
  assert.equal(first.result_status, "applied");

  // Idempotent replay of the SAME mutation must return the same result, not
  // a duplicate row.
  const replay = await callAttendance(a.teacherUserId, { mutationId, establishmentId: a.establishmentId, emploiDuTempsId: a.emploiDuTempsId, studentId, status: "present" });
  assert.equal(replay.result_entity_id, first.result_entity_id, "replaying the same mutation_id must be idempotent, never a second row");

  const sessions = await adminPool.query("select count(*)::int as n from public.lesson_sessions where emploi_du_temps_id = $1", [a.emploiDuTempsId]);
  assert.equal(sessions.rows[0].n, 1, "exactly one lesson_session must exist");

  // Archive the student — their attendance history must survive untouched.
  await adminPool.query("update public.students set status = 'archived' where id = $1", [studentId]);
  const historyAfterArchive = await adminPool.query("select status from public.student_attendance where id = $1", [first.result_entity_id]);
  assert.equal(historyAfterArchive.rows.length, 1, "attendance history must never be deleted when a student is archived");
  assert.equal(historyAfterArchive.rows[0].status, "present");
});
