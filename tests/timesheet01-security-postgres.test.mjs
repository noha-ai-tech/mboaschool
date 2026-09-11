import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import pg from "pg";

// TIMESHEET-01 — real RLS/RPC enforcement tests for teacher time tracking,
// against a real Postgres engine with row_security actually enabled for a
// non-superuser role. Same technique as tests/mobile01-roster-security-
// postgres.test.mjs / tests/mobile01-tenant-integrity-security-postgres.test.mjs.
//
// Reuses the REAL public.pointages table (0002_presence.sql), extended
// additively by 20260914090000_timesheet_01_foundation.sql — never a second,
// parallel attendance model. sync_apply_staff_punch is the only write path
// for self-service mobile check-in/out (mirrors sync_apply_attendance_mark's
// security posture: auth.uid() required, actor/establishment resolved
// server-side, idempotent via the shared sync_mutations ledger).

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(testDirectory, "..");
const ADMIN_DATABASE_URL = process.env.TIMESHEET01_TEST_ADMIN_DATABASE_URL ?? "postgres://postgres:testpass@localhost:55432/postgres";
const DATABASE_NAME = process.env.TIMESHEET01_TEST_DATABASE_NAME ?? "timesheet01_security_test";
const APP_ROLE = "app_rls_role_timesheet";

let adminPool;
let rlsPool;
let dbAvailable = false;
let unavailableReason = "not checked yet";

test.before(async () => {
  try {
    const bootstrapPool = new pg.Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
    try {
      const existing = await bootstrapPool.query("select 1 from pg_database where datname = $1", [DATABASE_NAME]);
      if (existing.rowCount === 0) await bootstrapPool.query(`create database ${DATABASE_NAME}`);
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
    do $$
    begin
      if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
      if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
      if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
    end
    $$;

    create table public.establishments (
      id uuid primary key default gen_random_uuid(),
      owner_id uuid,
      forfait text not null default 'gratuit'
    );
    create table public.enseignants (
      id uuid primary key default gen_random_uuid(),
      etablissement_id uuid not null references public.establishments(id),
      user_id uuid,
      nom text not null default 'Nom',
      prenom text not null default 'Prenom'
    );
    create table public.creneaux_horaires (
      id uuid primary key default gen_random_uuid(),
      etablissement_id uuid not null references public.establishments(id)
    );
    -- Réplique fidèle de la table réelle (0002_presence.sql), jamais une
    -- version allégée : photo_path NOT NULL ici comme en production, pour
    -- que la migration testée (qui la rend nullable) soit réellement
    -- exercée, et pointages_scope identique (owner-only via
    -- current_establishment_id()) pour que la lecture teacher self-service
    -- ajoutée par la migration soit la SEULE chose qui ouvre l'accès à un
    -- enseignant — jamais une policy de test permissive qui masquerait un
    -- vrai trou.
    create table public.pointages (
      id uuid primary key default gen_random_uuid(),
      etablissement_id uuid not null references public.establishments(id) on delete cascade,
      enseignant_id uuid not null references public.enseignants(id) on delete cascade,
      type text not null check (type in ('arrivee', 'depart')),
      horodatage timestamptz not null default now(),
      photo_path text not null,
      creneau_id uuid references public.creneaux_horaires(id) on delete set null,
      created_at timestamptz not null default now()
    );
    create or replace function public.current_establishment_id() returns uuid language sql stable as $$
      select id from public.establishments where owner_id = auth.uid();
    $$;
    alter table public.pointages enable row level security;
    create policy pointages_scope on public.pointages for all using (etablissement_id = current_establishment_id());

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

  const migrationSql = await readFile(path.join(projectRoot, "supabase/migrations/20260914090000_timesheet_01_foundation.sql"), "utf8");

  try {
    await adminPool.query(migrationSql);

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

function newId() {
  return crypto.randomUUID();
}

async function asUser(userId, fn) {
  const client = await rlsPool.connect();
  try {
    await client.query("select set_config('request.jwt.claim.sub', $1, false)", [userId ?? ""]);
    return await fn(client);
  } finally {
    client.release();
  }
}

async function punch(userId, establishmentId, type, deviceOccurredAt = null, mutationId = newId()) {
  const result = await asUser(userId, (c) =>
    c.query("select * from public.sync_apply_staff_punch($1, $2, $3, $4)", [mutationId, establishmentId, type, deviceOccurredAt])
  );
  return result.rows[0];
}

async function seedSchool() {
  const owner = newId();
  await adminPool.query("insert into auth.users (id) values ($1)", [owner]);
  const establishmentId = (await adminPool.query("insert into public.establishments (owner_id, forfait) values ($1,'pro') returning id", [owner])).rows[0].id;
  const teacherUserId = newId();
  await adminPool.query("insert into auth.users (id) values ($1)", [teacherUserId]);
  const enseignantId = (
    await adminPool.query("insert into public.enseignants (etablissement_id, user_id) values ($1,$2) returning id", [establishmentId, teacherUserId])
  ).rows[0].id;
  return { owner, establishmentId, teacherUserId, enseignantId };
}

test.beforeEach(async () => {
  if (dbAvailable) {
    await adminPool.query("delete from public.timesheet_approvals");
    await adminPool.query("delete from public.timesheet_corrections");
    await adminPool.query("delete from public.pointages where source = 'mobile_self_service'");
  }
});

test("real Postgres — teacher's own check-in is applied", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const a = await seedSchool();
  const result = await punch(a.teacherUserId, a.establishmentId, "arrivee");
  assert.equal(result.result_status, "applied");
  assert.ok(result.result_entity_id);

  const row = await adminPool.query("select source, photo_path, device_occurred_at from public.pointages where id = $1", [result.result_entity_id]);
  assert.equal(row.rows[0].source, "mobile_self_service");
  assert.equal(row.rows[0].photo_path, null, "self-service punches never require a kiosk photo");
});

test("real Postgres — a stranger with no enseignant record in the target establishment is rejected", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const a = await seedSchool();
  const strangerUserId = newId();
  await adminPool.query("insert into auth.users (id) values ($1)", [strangerUserId]);

  const result = await punch(strangerUserId, a.establishmentId, "arrivee");
  assert.equal(result.result_status, "rejected");
  assert.equal(result.result_entity_id, null);
});

test("real Postgres — cross-school: Teacher A cannot check in against School B's establishment_id", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const a = await seedSchool();
  const b = await seedSchool();

  const result = await punch(a.teacherUserId, b.establishmentId, "arrivee");
  assert.equal(result.result_status, "rejected");

  const count = await adminPool.query("select count(*)::int as n from public.pointages where etablissement_id = $1 and source = 'mobile_self_service'", [b.establishmentId]);
  assert.equal(count.rows[0].n, 0, "no row must ever be created under School B for Teacher A's attempt");
});

test("real Postgres — anonymous cannot read any self-service pointage", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const a = await seedSchool();
  await punch(a.teacherUserId, a.establishmentId, "arrivee");

  const anonRead = await asUser(null, (c) => c.query("select id from public.pointages where source = 'mobile_self_service'"));
  assert.equal(anonRead.rows.length, 0);
});

test("real Postgres — a teacher never sees another school's self-service pointages, even querying broadly", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const a = await seedSchool();
  const b = await seedSchool();
  await punch(b.teacherUserId, b.establishmentId, "arrivee");

  const crossRead = await asUser(a.teacherUserId, (c) => c.query("select id from public.pointages where source = 'mobile_self_service'"));
  assert.equal(crossRead.rows.length, 0);
});

test("real Postgres — a double active check-in is controlled: rejected, never a second open shift", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const a = await seedSchool();
  const first = await punch(a.teacherUserId, a.establishmentId, "arrivee");
  assert.equal(first.result_status, "applied");

  const second = await punch(a.teacherUserId, a.establishmentId, "arrivee");
  assert.equal(second.result_status, "rejected");

  const count = await adminPool.query("select count(*)::int as n from public.pointages where enseignant_id = $1 and type = 'arrivee' and source = 'mobile_self_service'", [a.enseignantId]);
  assert.equal(count.rows[0].n, 1, "only the first check-in must exist");
});

test("real Postgres — a checkout without an active checkin is controlled: rejected", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const a = await seedSchool();
  const result = await punch(a.teacherUserId, a.establishmentId, "depart");
  assert.equal(result.result_status, "rejected");
});

test("real Postgres — a normal check-in then checkout both apply, exactly two rows", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const a = await seedSchool();
  const checkIn = await punch(a.teacherUserId, a.establishmentId, "arrivee");
  assert.equal(checkIn.result_status, "applied");
  const checkOut = await punch(a.teacherUserId, a.establishmentId, "depart");
  assert.equal(checkOut.result_status, "applied");

  const count = await adminPool.query("select count(*)::int as n from public.pointages where enseignant_id = $1 and source = 'mobile_self_service'", [a.enseignantId]);
  assert.equal(count.rows[0].n, 2);
});

test("real Postgres — offline mutation replay is idempotent: same mutation_id twice never creates a second row", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const a = await seedSchool();
  const mutationId = newId();
  const first = await punch(a.teacherUserId, a.establishmentId, "arrivee", null, mutationId);
  const second = await punch(a.teacherUserId, a.establishmentId, "arrivee", null, mutationId);
  assert.equal(first.result_status, "applied");
  assert.equal(second.result_entity_id, first.result_entity_id);

  const count = await adminPool.query("select count(*)::int as n from public.pointages where id = $1", [first.result_entity_id]);
  assert.equal(count.rows[0].n, 1);
});

test("real Postgres — a different actor cannot replay another teacher's mutation_id and read their result", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const a = await seedSchool();
  const b = await seedSchool();
  const mutationId = newId();

  const aResult = await punch(a.teacherUserId, a.establishmentId, "arrivee", null, mutationId);
  assert.equal(aResult.result_status, "applied");

  const bResult = await punch(b.teacherUserId, b.establishmentId, "arrivee", null, mutationId);
  assert.equal(bResult.result_status, "rejected");
  assert.notEqual(bResult.result_entity_id, aResult.result_entity_id);
});

test("real Postgres — an anomalous future device timestamp is flagged, never silently trusted, and never blocks the punch", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const a = await seedSchool();
  const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const result = await punch(a.teacherUserId, a.establishmentId, "arrivee", future);
  assert.equal(result.result_status, "applied", "the punch still applies — this is a flag, not a hard rejection");
  assert.equal(result.result_anomaly, "offline_timestamp_review");

  const row = await adminPool.query("select horodatage, device_occurred_at from public.pointages where id = $1", [result.result_entity_id]);
  assert.notEqual(new Date(row.rows[0].horodatage).getTime(), new Date(row.rows[0].device_occurred_at).getTime(), "server horodatage must never be overwritten by the device-reported time");
});

test("real Postgres — an unauthenticated call raises rather than silently proceeding", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const a = await seedSchool();
  await assert.rejects(
    () => asUser(null, (c) => c.query("select * from public.sync_apply_staff_punch($1,$2,$3,$4)", [newId(), a.establishmentId, "arrivee", null])),
    /non authentifi/i
  );
});

test("real Postgres — a teacher cannot approve their own (or anyone's) timesheet — no INSERT policy grants it", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const a = await seedSchool();
  await assert.rejects(
    () =>
      asUser(a.teacherUserId, (c) =>
        c.query(
          "insert into public.timesheet_approvals (establishment_id, enseignant_id, period_start, period_end, approved_minutes, approved_by) values ($1,$2,current_date,current_date,480,$3)",
          [a.establishmentId, a.enseignantId, a.teacherUserId]
        )
      ),
    "a teacher must never be able to create their own approval row"
  );
});

test("real Postgres — the owner (same school) can approve their teacher's timesheet", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const a = await seedSchool();
  const result = await asUser(a.owner, (c) =>
    c.query(
      "insert into public.timesheet_approvals (establishment_id, enseignant_id, period_start, period_end, approved_minutes, approved_by) values ($1,$2,current_date - 6,current_date,480,$3) returning id, approved_minutes",
      [a.establishmentId, a.enseignantId, a.owner]
    )
  );
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].approved_minutes, 480);
});

test("real Postgres — a foreign-school owner cannot approve another school's teacher", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const a = await seedSchool();
  const b = await seedSchool();
  await assert.rejects(
    () =>
      asUser(b.owner, (c) =>
        c.query(
          "insert into public.timesheet_approvals (establishment_id, enseignant_id, period_start, period_end, approved_minutes, approved_by) values ($1,$2,current_date,current_date,999,$3)",
          [a.establishmentId, a.enseignantId, b.owner]
        )
      ),
    "an owner must never approve hours for a teacher outside their own establishment"
  );
});

test("real Postgres — a manipulated establishment_id (school B's id, school A's real enseignant_id) is rejected by the composite FK invariant, not just RLS", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const a = await seedSchool();
  const b = await seedSchool();
  // Attempt as the SAME owner as the target establishment (would pass a
  // naive RLS-only check that only verifies establishment ownership) —
  // the composite FK must still refuse the impossible (enseignant, wrong
  // establishment) pair.
  await assert.rejects(
    () =>
      asUser(b.owner, (c) =>
        c.query(
          "insert into public.timesheet_approvals (establishment_id, enseignant_id, period_start, period_end, approved_minutes, approved_by) values ($1,$2,current_date,current_date,480,$3)",
          [b.establishmentId, a.enseignantId, b.owner]
        )
      ),
    /foreign key|violates/i,
    "the DB invariant must reject an enseignant_id that does not truly belong to the claimed establishment_id"
  );
});

test("real Postgres — a correction request never modifies the raw pointage record, only adds a reviewable proposal", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const a = await seedSchool();
  const checkIn = await punch(a.teacherUserId, a.establishmentId, "arrivee");
  const beforeRow = await adminPool.query("select horodatage from public.pointages where id = $1", [checkIn.result_entity_id]);

  const correction = await asUser(a.teacherUserId, (c) =>
    c.query(
      "insert into public.timesheet_corrections (establishment_id, enseignant_id, pointage_id, correction_type, target_date, proposed_type, proposed_time, reason, requested_by) values ($1,$2,$3,'missing_check_out',current_date,'depart',now(),'Oubli de pointage',$4) returning id, status",
      [a.establishmentId, a.enseignantId, checkIn.result_entity_id, a.teacherUserId]
    )
  );
  assert.equal(correction.rows[0].status, "pending");

  const afterRow = await adminPool.query("select horodatage from public.pointages where id = $1", [checkIn.result_entity_id]);
  assert.deepEqual(afterRow.rows[0].horodatage, beforeRow.rows[0].horodatage, "the raw pointage must remain byte-for-byte untouched by a pending correction");
});

test("real Postgres — a foreign teacher can never read or review another teacher's correction request", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const a = await seedSchool();
  const b = await seedSchool();
  const correction = await asUser(a.teacherUserId, (c) =>
    c.query(
      "insert into public.timesheet_corrections (establishment_id, enseignant_id, correction_type, target_date, proposed_type, proposed_time, reason, requested_by) values ($1,$2,'missing_check_out',current_date,'depart',now(),'Oubli',$3) returning id",
      [a.establishmentId, a.enseignantId, a.teacherUserId]
    )
  );

  const foreignRead = await asUser(b.teacherUserId, (c) => c.query("select id from public.timesheet_corrections where id = $1", [correction.rows[0].id]));
  assert.equal(foreignRead.rows.length, 0);

  const foreignReview = await asUser(b.owner, (c) => c.query("update public.timesheet_corrections set status = 'approved' where id = $1", [correction.rows[0].id]));
  assert.equal(foreignReview.rowCount, 0, "a foreign-school owner must never be able to review this correction");
});

test("real Postgres — an owner's approval is fully auditable: who approved, when, and the exact minutes, without overwriting a prior approval", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const a = await seedSchool();
  const first = await asUser(a.owner, (c) =>
    c.query(
      "insert into public.timesheet_approvals (establishment_id, enseignant_id, period_start, period_end, approved_minutes, approved_by, note) values ($1,$2,current_date - 6,current_date,480,$3,'Semaine normale') returning id",
      [a.establishmentId, a.enseignantId, a.owner]
    )
  );

  // Re-approval for the same period supersedes the first, but the first
  // row must remain in the table untouched — full history preserved.
  const second = await asUser(a.owner, (c) =>
    c.query(
      "insert into public.timesheet_approvals (establishment_id, enseignant_id, period_start, period_end, approved_minutes, approved_by, note, supersedes_approval_id) values ($1,$2,current_date - 6,current_date,500,$3,'Correction après revue',$4) returning id",
      [a.establishmentId, a.enseignantId, a.owner, first.rows[0].id]
    )
  );

  const history = await adminPool.query("select id, approved_minutes, supersedes_approval_id from public.timesheet_approvals where enseignant_id = $1 order by approved_at", [a.enseignantId]);
  assert.equal(history.rows.length, 2, "both the original and the superseding approval must exist");
  assert.equal(history.rows[0].approved_minutes, 480);
  assert.equal(history.rows[1].approved_minutes, 500);
  assert.equal(history.rows[1].supersedes_approval_id, first.rows[0].id);
});

test("real Postgres — multi-school isolation: the same teacher's punches at School A and School B never mix", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const a = await seedSchool();
  // Same physical person, a second enseignant row at a different school,
  // sharing the same user_id (the established multi-school-same-user
  // pattern already used throughout MOBILE-01).
  const estB = (await adminPool.query("insert into public.establishments (owner_id, forfait) values ($1,'pro') returning id", [newId()])).rows[0].id;
  const enseignantB = (await adminPool.query("insert into public.enseignants (etablissement_id, user_id) values ($1,$2) returning id", [estB, a.teacherUserId])).rows[0].id;

  const punchA = await punch(a.teacherUserId, a.establishmentId, "arrivee");
  const punchB = await punch(a.teacherUserId, estB, "arrivee");
  assert.equal(punchA.result_status, "applied");
  assert.equal(punchB.result_status, "applied");

  const rowA = await adminPool.query("select enseignant_id, etablissement_id from public.pointages where id = $1", [punchA.result_entity_id]);
  const rowB = await adminPool.query("select enseignant_id, etablissement_id from public.pointages where id = $1", [punchB.result_entity_id]);
  assert.equal(rowA.rows[0].enseignant_id, a.enseignantId);
  assert.equal(rowA.rows[0].etablissement_id, a.establishmentId);
  assert.equal(rowB.rows[0].enseignant_id, enseignantB);
  assert.equal(rowB.rows[0].etablissement_id, estB);
  assert.notEqual(rowA.rows[0].enseignant_id, rowB.rows[0].enseignant_id, "each school must record its own distinct enseignant row for the same person, never a shared/merged identity");

  // Checking out at School A must never be satisfiable by School A's open
  // shift bleeding into School B, and vice versa — attempting a checkout
  // at School B (where the teacher hasn't checked in yet in this test)
  // must be rejected independently of School A's open shift.
  const wrongCheckout = await punch(a.teacherUserId, estB, "arrivee");
  assert.equal(wrongCheckout.result_status, "rejected", "School B already has an open shift for this teacher from punchB — a second arrivee must be rejected independently of School A's state");
});
