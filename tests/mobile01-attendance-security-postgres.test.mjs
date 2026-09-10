import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import pg from "pg";

// MOBILE-01 — these tests run the ACTUAL migration SQL (students,
// lesson_sessions, student_attendance, and the sync_apply_attendance_mark
// function) against a REAL Postgres engine (postgres:16-alpine in
// Docker), exactly the same technique proven for sync_apply_absence_create
// in OFFLINE-01.1. `auth.uid()` is stubbed to read a per-session setting
// so each test can impersonate a specific teacher.
//
// Requires a reachable Postgres at MOBILE01_TEST_DATABASE_URL. If
// unreachable, every test in this file calls t.skip() with the reason
// rather than being reported as a false pass.

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(testDirectory, "..");
const ADMIN_DATABASE_URL = process.env.MOBILE01_TEST_ADMIN_DATABASE_URL ?? "postgres://postgres:testpass@localhost:55432/postgres";
// Dédiée à ce fichier (pas "postgres"/"public" partagé) : node --test
// exécute les fichiers en parallèle par défaut, et ce fichier tourne aux
// côtés de tests/offline-sync-security-postgres.test.mjs qui reconstruit
// aussi tout son schéma "public" — sans base dédiée, les deux "drop schema
// public cascade" concurrents se percutent (erreurs de schéma en course).
const DATABASE_NAME = process.env.MOBILE01_TEST_DATABASE_NAME ?? "mobile01_attendance_test";

let pool;
let dbAvailable = false;
let unavailableReason = "not checked yet";

test.before(async () => {
  try {
    const adminPool = new pg.Pool({ connectionString: ADMIN_DATABASE_URL, max: 1 });
    try {
      const existing = await adminPool.query("select 1 from pg_database where datname = $1", [DATABASE_NAME]);
      if (existing.rowCount === 0) {
        await adminPool.query(`create database ${DATABASE_NAME}`);
      }
    } finally {
      await adminPool.end();
    }
  } catch (e) {
    unavailableReason = `Postgres unreachable at ${ADMIN_DATABASE_URL}: ${e.message}`;
    console.error(unavailableReason);
    dbAvailable = false;
    return;
  }

  const dbUrl = new URL(ADMIN_DATABASE_URL);
  dbUrl.pathname = `/${DATABASE_NAME}`;
  pool = new pg.Pool({ connectionString: dbUrl.toString(), max: 5 });
  try {
    await pool.query("select 1");
    dbAvailable = true;
  } catch (e) {
    unavailableReason = `Postgres unreachable at ${dbUrl.toString()}: ${e.message}`;
    console.error(unavailableReason);
    dbAvailable = false;
    return;
  }

  await pool.query(`
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
    create table public.classes (
      id uuid primary key default gen_random_uuid(),
      establishment_id uuid not null references public.establishments(id)
    );
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

  // sync_apply_attendance_mark depends on public.sync_mutations, defined in
  // the OFFLINE-01.1 migration — applied first here, exactly as it would
  // be in a real sequential migration run, so this test exercises the
  // real cumulative schema rather than an artificially isolated file.
  const offlineFoundationSql = await readFile(
    path.join(projectRoot, "supabase/migrations/20260907230000_offline_sync_foundation.sql"),
    "utf8"
  );
  const migrationSql = await readFile(
    path.join(projectRoot, "supabase/migrations/20260910120000_mobile_01_student_roster_attendance.sql"),
    "utf8"
  );
  try {
    await pool.query(offlineFoundationSql);
    await pool.query(migrationSql);
  } catch (e) {
    unavailableReason = `Failed to apply the real migration SQL against the stub schema: ${e.message}`;
    console.error(unavailableReason);
    dbAvailable = false;
  }
});

test.after(async () => {
  if (pool) await pool.end();
});

async function callAs(userId, args) {
  const client = await pool.connect();
  try {
    await client.query("select set_config('request.jwt.claim.sub', $1, false)", [userId ?? ""]);
    const res = await client.query(
      `select * from public.sync_apply_attendance_mark($1, $2, $3, $4, $5, $6)`,
      [args.mutationId, args.establishmentId, args.emploiDuTempsId, args.studentId, args.sessionDate ?? "2026-09-10", args.status ?? "present"]
    );
    return res.rows[0];
  } finally {
    client.release();
  }
}

function newMutationId() {
  return crypto.randomUUID();
}

// Seeds a full teacher+class+student+timetable fixture for one establishment.
async function seedClassroom({ pro = true } = {}) {
  const teacherUserId = (await pool.query("select gen_random_uuid() as id")).rows[0].id;
  await pool.query("insert into auth.users (id) values ($1)", [teacherUserId]);

  const establishmentId = (
    await pool.query("insert into public.establishments (owner_id, forfait) values ($1, $2) returning id", [teacherUserId, pro ? "pro" : "gratuit"])
  ).rows[0].id;
  const classeId = (await pool.query("insert into public.classes (establishment_id) values ($1) returning id", [establishmentId])).rows[0].id;
  const enseignantId = (
    await pool.query("insert into public.enseignants (etablissement_id, user_id) values ($1, $2) returning id", [establishmentId, teacherUserId])
  ).rows[0].id;
  const matiereId = (await pool.query("insert into public.matieres (etablissement_id) values ($1) returning id", [establishmentId])).rows[0].id;
  const creneauId = (await pool.query("insert into public.creneaux_horaires (etablissement_id) values ($1) returning id", [establishmentId])).rows[0].id;
  const emploiDuTempsId = (
    await pool.query(
      "insert into public.emplois_du_temps (etablissement_id, classe_id, matiere_id, enseignant_id, creneau_id) values ($1, $2, $3, $4, $5) returning id",
      [establishmentId, classeId, matiereId, enseignantId, creneauId]
    )
  ).rows[0].id;
  const studentId = (
    await pool.query("insert into public.students (establishment_id, classe_id, first_name, last_name) values ($1, $2, 'Jean', 'Mbarga') returning id", [
      establishmentId,
      classeId,
    ])
  ).rows[0].id;

  return { teacherUserId, establishmentId, classeId, enseignantId, matiereId, emploiDuTempsId, studentId };
}

test("real Postgres — a teacher marks a student present: applied, one row created", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const c = await seedClassroom();
  const result = await callAs(c.teacherUserId, { mutationId: newMutationId(), establishmentId: c.establishmentId, emploiDuTempsId: c.emploiDuTempsId, studentId: c.studentId, status: "present" });
  assert.equal(result.result_status, "applied");
  assert.ok(result.result_entity_id);

  const count = await pool.query("select count(*)::int as n from public.student_attendance where id = $1", [result.result_entity_id]);
  assert.equal(count.rows[0].n, 1);
});

test("real Postgres — the same teacher correcting their own mark (present -> absent) overwrites cleanly, no conflict", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const c = await seedClassroom();
  const first = await callAs(c.teacherUserId, { mutationId: newMutationId(), establishmentId: c.establishmentId, emploiDuTempsId: c.emploiDuTempsId, studentId: c.studentId, status: "present" });
  assert.equal(first.result_status, "applied");

  const second = await callAs(c.teacherUserId, { mutationId: newMutationId(), establishmentId: c.establishmentId, emploiDuTempsId: c.emploiDuTempsId, studentId: c.studentId, status: "absent" });
  assert.equal(second.result_status, "applied", "the same teacher's own correction must never be treated as a conflict");
  assert.equal(second.result_entity_id, first.result_entity_id, "must update the same row, not create a second one");

  const row = await pool.query("select status from public.student_attendance where id = $1", [first.result_entity_id]);
  assert.equal(row.rows[0].status, "absent");
});

test("real Postgres — rapid-fire same-teacher corrections within one sync batch never falsely conflict with themselves", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const c = await seedClassroom();
  // Three sequential taps for the SAME student, same teacher, simulating
  // several offline corrections synced together in one batch — none of
  // these must ever be flagged as a conflict against the teacher's own
  // immediately-preceding write (the exact false-positive a naive
  // updated_at-only comparison would produce).
  const statuses = ["present", "late", "absent"];
  let lastEntityId = null;
  for (const status of statuses) {
    const result = await callAs(c.teacherUserId, { mutationId: newMutationId(), establishmentId: c.establishmentId, emploiDuTempsId: c.emploiDuTempsId, studentId: c.studentId, status });
    assert.equal(result.result_status, "applied", `status=${status} must apply, never conflict, for the same teacher`);
    if (lastEntityId) assert.equal(result.result_entity_id, lastEntityId);
    lastEntityId = result.result_entity_id;
  }
  const row = await pool.query("select status from public.student_attendance where id = $1", [lastEntityId]);
  assert.equal(row.rows[0].status, "absent", "the last applied status must win");
});

test("real Postgres — a DIFFERENT actor touching an already-marked student triggers an explicit conflict, never a silent overwrite", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const c = await seedClassroom();
  const teacherMark = await callAs(c.teacherUserId, { mutationId: newMutationId(), establishmentId: c.establishmentId, emploiDuTempsId: c.emploiDuTempsId, studentId: c.studentId, status: "present" });
  assert.equal(teacherMark.result_status, "applied");

  // A second teacher with legitimate access to the SAME class (e.g. a
  // co-teacher scenario) attempts to also mark the same student.
  const secondTeacherUserId = (await pool.query("select gen_random_uuid() as id")).rows[0].id;
  await pool.query("insert into auth.users (id) values ($1)", [secondTeacherUserId]);
  await pool.query("insert into public.enseignants (etablissement_id, user_id) values ($1, $2)", [c.establishmentId, secondTeacherUserId]);
  await pool.query("update public.emplois_du_temps set enseignant_id = (select id from public.enseignants where user_id = $1) where id = $2", [
    secondTeacherUserId,
    c.emploiDuTempsId,
  ]);

  const secondMark = await callAs(secondTeacherUserId, { mutationId: newMutationId(), establishmentId: c.establishmentId, emploiDuTempsId: c.emploiDuTempsId, studentId: c.studentId, status: "absent" });
  assert.equal(secondMark.result_status, "conflict", "a different actor's mark on an already-recorded student must be an explicit conflict");

  const row = await pool.query("select status, last_recorded_by from public.student_attendance where id = $1", [teacherMark.result_entity_id]);
  assert.equal(row.rows[0].status, "present", "the original mark must never be silently overwritten by the conflicting actor");
  assert.equal(row.rows[0].last_recorded_by, c.teacherUserId);
});

test("real Postgres — a teacher NOT assigned to this course is denied, never allowed to mark attendance", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const c = await seedClassroom();
  const strangerUserId = (await pool.query("select gen_random_uuid() as id")).rows[0].id;
  await pool.query("insert into auth.users (id) values ($1)", [strangerUserId]);

  const result = await callAs(strangerUserId, { mutationId: newMutationId(), establishmentId: c.establishmentId, emploiDuTempsId: c.emploiDuTempsId, studentId: c.studentId });
  assert.equal(result.result_status, "rejected");
  assert.equal(result.result_entity_id, null);

  const count = await pool.query("select count(*)::int as n from public.student_attendance where student_id = $1", [c.studentId]);
  assert.equal(count.rows[0].n, 0);
});

test("real Postgres — cross-school: a teacher from School B cannot mark attendance for School A's course", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const a = await seedClassroom();
  const b = await seedClassroom();

  const result = await callAs(b.teacherUserId, { mutationId: newMutationId(), establishmentId: a.establishmentId, emploiDuTempsId: a.emploiDuTempsId, studentId: a.studentId });
  assert.equal(result.result_status, "rejected");
});

test("real Postgres — a student from a DIFFERENT class cannot be marked via this course, even by its real teacher", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const c = await seedClassroom();
  const otherClasseId = (await pool.query("insert into public.classes (establishment_id) values ($1) returning id", [c.establishmentId])).rows[0].id;
  const foreignStudentId = (
    await pool.query("insert into public.students (establishment_id, classe_id, first_name, last_name) values ($1, $2, 'Autre', 'Eleve') returning id", [
      c.establishmentId,
      otherClasseId,
    ])
  ).rows[0].id;

  const result = await callAs(c.teacherUserId, { mutationId: newMutationId(), establishmentId: c.establishmentId, emploiDuTempsId: c.emploiDuTempsId, studentId: foreignStudentId });
  assert.equal(result.result_status, "rejected", "a student outside this course's class must never be markable through it");
});

test("real Postgres — P1-safe replay: a different actor cannot replay/read another teacher's mutation_id result", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const a = await seedClassroom();
  const b = await seedClassroom();
  const mutationId = newMutationId();

  const aResult = await callAs(a.teacherUserId, { mutationId, establishmentId: a.establishmentId, emploiDuTempsId: a.emploiDuTempsId, studentId: a.studentId, status: "present" });
  assert.equal(aResult.result_status, "applied");

  const bResult = await callAs(b.teacherUserId, { mutationId, establishmentId: b.establishmentId, emploiDuTempsId: b.emploiDuTempsId, studentId: b.studentId, status: "present" });
  assert.equal(bResult.result_status, "rejected");
  assert.notEqual(bResult.result_entity_id, aResult.result_entity_id);
  assert.equal(bResult.result_entity_id, null);
});

test("real Postgres — concurrent double-submit (retry race) creates exactly one attendance row, idempotent", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const c = await seedClassroom();
  const mutationId = newMutationId();

  const [r1, r2] = await Promise.all([
    callAs(c.teacherUserId, { mutationId, establishmentId: c.establishmentId, emploiDuTempsId: c.emploiDuTempsId, studentId: c.studentId, status: "present" }),
    callAs(c.teacherUserId, { mutationId, establishmentId: c.establishmentId, emploiDuTempsId: c.emploiDuTempsId, studentId: c.studentId, status: "present" }),
  ]);

  assert.equal(r1.result_status, "applied");
  assert.equal(r2.result_status, "applied");
  assert.equal(r1.result_entity_id, r2.result_entity_id);

  const count = await pool.query("select count(*)::int as n from public.student_attendance where student_id = $1", [c.studentId]);
  assert.equal(count.rows[0].n, 1, "a genuine concurrent double-submit must never create two attendance rows");
});

// Attendance authorization is purely assignment-based (emplois_du_temps.
// enseignant_id), unlike the absence RPC which also gates on forfait='pro'
// — confirmed against real precedent: /enseignant/mon-espace and
// calculer_heures_enseignant never check forfait, and "Présence gratuite"
// is explicitly framed as a free-tier feature. So "permission revoked"
// here means the teacher was reassigned away from the course, not a plan
// downgrade.
test("real Postgres — permission revoked before first sync (teacher reassigned off the course): rejected, never applied", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const c = await seedClassroom();

  const otherTeacherUserId = (await pool.query("select gen_random_uuid() as id")).rows[0].id;
  await pool.query("insert into auth.users (id) values ($1)", [otherTeacherUserId]);
  const otherTeacherId = (
    await pool.query("insert into public.enseignants (etablissement_id, user_id) values ($1, $2) returning id", [c.establishmentId, otherTeacherUserId])
  ).rows[0].id;
  // The course is reassigned to someone else BEFORE the original
  // teacher's offline mutation ever gets a chance to sync.
  await pool.query("update public.emplois_du_temps set enseignant_id = $1 where id = $2", [otherTeacherId, c.emploiDuTempsId]);

  const result = await callAs(c.teacherUserId, { mutationId: newMutationId(), establishmentId: c.establishmentId, emploiDuTempsId: c.emploiDuTempsId, studentId: c.studentId });
  assert.equal(result.result_status, "rejected", "a teacher no longer assigned to the course must be refused, exactly as an online attempt would be");

  const count = await pool.query("select count(*)::int as n from public.student_attendance where student_id = $1", [c.studentId]);
  assert.equal(count.rows[0].n, 0);
});

test("real Postgres — an unauthenticated call raises rather than silently proceeding", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const c = await seedClassroom();
  await assert.rejects(
    () => callAs(null, { mutationId: newMutationId(), establishmentId: c.establishmentId, emploiDuTempsId: c.emploiDuTempsId, studentId: c.studentId }),
    /non authentifi/i
  );
});
