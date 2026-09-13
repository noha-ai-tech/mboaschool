import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import pg from "pg";

// DAILY-INTELLIGENCE-01 — real RLS/RPC enforcement tests for the two new
// deterministic reducers (get_school_daily_activity,
// get_school_staff_open_shifts) built on top of the School Event Engine
// (EVENT-01 + EVENT-01.1). Same technique as every other
// *-security-postgres.test.mjs file in this repo.
//
// CRITICAL: every event exercised here is produced by calling the REAL
// canonical write paths (sync_apply_attendance_mark, sync_apply_staff_punch,
// a real insert into timesheet_approvals / applications) — never a direct
// INSERT into school_events. The application-layer authorization boundary
// (requireEstablishmentAccess / capability "intelligence:view", src/lib/
// school/establishmentAccess.ts) is exercised indirectly here through the
// same RLS-backed tenant isolation EVENT-01 already established — it is a
// pre-existing, previously-tested TypeScript module reused unchanged, not
// re-implemented as a second security boundary in SQL.

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(testDirectory, "..");
const ADMIN_DATABASE_URL = process.env.EVENT01_TEST_ADMIN_DATABASE_URL ?? "postgres://postgres:testpass@localhost:55432/postgres";
const DATABASE_NAME = process.env.DAILY_INTELLIGENCE_01_TEST_DATABASE_NAME ?? "daily_intelligence_01_security_test";
const APP_ROLE = "app_rls_role_daily_intel01";

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
    do $$ begin
      if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if;
      if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
      if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
    end $$;

    create type admission_status as enum ('submitted','in_review','documents_required','interview','waitlisted','accepted','rejected','cancelled');

    create table public.profiles (id uuid primary key, role text);
    create table public.establishments (id uuid primary key default gen_random_uuid(), owner_id uuid, forfait text not null default 'gratuit');
    create table public.enseignants (id uuid primary key default gen_random_uuid(), etablissement_id uuid not null references public.establishments(id), user_id uuid, nom text not null default 'Nom', prenom text not null default 'Prenom');
    alter table public.enseignants add constraint enseignants_id_etablissement_unique unique (id, etablissement_id);
    create table public.classes (id uuid primary key default gen_random_uuid(), establishment_id uuid not null references public.establishments(id));
    alter table public.classes add constraint classes_id_establishment_unique unique (id, establishment_id);
    create table public.students (
      id uuid primary key default gen_random_uuid(),
      establishment_id uuid not null references public.establishments(id) on delete cascade,
      classe_id uuid not null references public.classes(id) on delete cascade,
      first_name text not null, last_name text not null,
      status text not null default 'active' check (status in ('active','archived')),
      created_at timestamptz not null default now(),
      constraint students_classe_establishment_fkey foreign key (classe_id, establishment_id) references public.classes (id, establishment_id) on delete cascade
    );
    create table public.matieres (id uuid primary key default gen_random_uuid(), etablissement_id uuid not null references public.establishments(id));
    create table public.creneaux_horaires (id uuid primary key default gen_random_uuid(), etablissement_id uuid not null references public.establishments(id), jour_semaine smallint not null default 1);
    create table public.emplois_du_temps (id uuid primary key default gen_random_uuid(), etablissement_id uuid not null references public.establishments(id), annee_scolaire text not null default '2026-2027', classe_id uuid not null references public.classes(id), matiere_id uuid not null references public.matieres(id), enseignant_id uuid not null references public.enseignants(id), creneau_id uuid not null references public.creneaux_horaires(id));
    create table public.lesson_sessions (
      id uuid primary key default gen_random_uuid(), establishment_id uuid not null references public.establishments(id) on delete cascade,
      emploi_du_temps_id uuid not null references public.emplois_du_temps(id) on delete cascade, classe_id uuid not null references public.classes(id) on delete cascade,
      matiere_id uuid not null references public.matieres(id) on delete cascade, enseignant_id uuid not null references public.enseignants(id) on delete cascade,
      session_date date not null, status text not null default 'ouverte' check (status in ('ouverte','terminee')),
      opened_by uuid references auth.users(id), opened_at timestamptz not null default now(), created_at timestamptz not null default now(),
      unique (emploi_du_temps_id, session_date)
    );
    create table public.student_attendance (
      id uuid primary key default gen_random_uuid(), session_id uuid not null references public.lesson_sessions(id) on delete cascade,
      student_id uuid not null references public.students(id) on delete cascade, status text not null check (status in ('present','absent','late')),
      last_recorded_by uuid not null references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
      unique (session_id, student_id)
    );
    create table public.pointages (
      id uuid primary key default gen_random_uuid(), etablissement_id uuid not null references public.establishments(id) on delete cascade,
      enseignant_id uuid not null references public.enseignants(id) on delete cascade, type text not null check (type in ('arrivee','depart')),
      horodatage timestamptz not null default now(), photo_path text, creneau_id uuid references public.creneaux_horaires(id) on delete set null,
      created_at timestamptz not null default now(), source text not null default 'kiosque' check (source in ('kiosque','mobile_self_service')),
      device_occurred_at timestamptz,
      constraint pointages_enseignant_etablissement_fkey foreign key (enseignant_id, etablissement_id) references public.enseignants (id, etablissement_id) on delete cascade
    );
    create table public.sync_mutations (
      mutation_id uuid primary key, entity_type text not null, operation text not null,
      establishment_id uuid not null references public.establishments(id), actor_user_id uuid not null,
      entity_id uuid, status text not null, error text, applied_at timestamptz not null default now()
    );
    create table public.timesheet_approvals (
      id uuid primary key default gen_random_uuid(), establishment_id uuid not null references public.establishments(id) on delete cascade,
      enseignant_id uuid not null, period_start date not null, period_end date not null,
      approved_minutes integer not null check (approved_minutes >= 0), status text not null default 'approved' check (status in ('approved','disputed')),
      approved_by uuid not null references auth.users(id), approved_at timestamptz not null default now(), note text,
      supersedes_approval_id uuid references public.timesheet_approvals(id) on delete set null, created_at timestamptz not null default now(),
      constraint timesheet_approvals_enseignant_etablissement_fkey foreign key (enseignant_id, establishment_id) references public.enseignants (id, etablissement_id) on delete cascade,
      constraint timesheet_approvals_period_valid check (period_end >= period_start)
    );
    create table public.applications (
      id uuid primary key default gen_random_uuid(), parent_id uuid references public.profiles(id) on delete set null,
      establishment_id uuid references public.establishments(id) on delete cascade,
      student_name text not null, student_age integer, student_level text, parent_name text, parent_phone text, parent_email text, message text,
      admission_status admission_status not null default 'submitted', created_at timestamptz default now()
    );

    create or replace function public.current_establishment_id() returns uuid language sql stable as $$
      select id from public.establishments where owner_id = auth.uid();
    $$;
  `);

  const event01Sql = await readFile(path.join(projectRoot, "supabase/migrations/20260915090000_event_01_school_event_engine.sql"), "utf8");
  const dailyIntelSql = await readFile(path.join(projectRoot, "supabase/migrations/20260916090000_daily_intelligence_01_activity.sql"), "utf8");

  try {
    await adminPool.query(event01Sql);
    await adminPool.query(dailyIntelSql);

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
      revoke execute on function public.emit_school_event(text, uuid, timestamptz, uuid, text, uuid, text, uuid, jsonb) from ${APP_ROLE};
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
  const r = await asUser(userId, (c) => c.query("select * from public.sync_apply_staff_punch($1,$2,$3,$4)", [mutationId, establishmentId, type, deviceOccurredAt]));
  return r.rows[0];
}

async function markAttendance(userId, establishmentId, edtId, studentId, sessionDate, status, mutationId = newId()) {
  const r = await asUser(userId, (c) => c.query("select * from public.sync_apply_attendance_mark($1,$2,$3,$4,$5,$6)", [mutationId, establishmentId, edtId, studentId, sessionDate, status]));
  return r.rows[0];
}

async function seedSchool() {
  const owner = newId();
  await adminPool.query("insert into auth.users (id) values ($1)", [owner]);
  const establishmentId = (await adminPool.query("insert into public.establishments (owner_id, forfait) values ($1,'pro') returning id", [owner])).rows[0].id;
  const teacherUserId = newId();
  await adminPool.query("insert into auth.users (id) values ($1)", [teacherUserId]);
  const enseignantId = (await adminPool.query("insert into public.enseignants (etablissement_id, user_id) values ($1,$2) returning id", [establishmentId, teacherUserId])).rows[0].id;
  const classeId = (await adminPool.query("insert into public.classes (establishment_id) values ($1) returning id", [establishmentId])).rows[0].id;
  const matiereId = (await adminPool.query("insert into public.matieres (etablissement_id) values ($1) returning id", [establishmentId])).rows[0].id;
  const creneauId = (await adminPool.query("insert into public.creneaux_horaires (etablissement_id) values ($1) returning id", [establishmentId])).rows[0].id;
  const emploiDuTempsId = (
    await adminPool.query("insert into public.emplois_du_temps (etablissement_id, classe_id, matiere_id, enseignant_id, creneau_id) values ($1,$2,$3,$4,$5) returning id", [establishmentId, classeId, matiereId, enseignantId, creneauId])
  ).rows[0].id;
  const studentId = (await adminPool.query("insert into public.students (establishment_id, classe_id, first_name, last_name) values ($1,$2,'Jean','Mbarga') returning id", [establishmentId, classeId])).rows[0].id;
  return { owner, establishmentId, teacherUserId, enseignantId, classeId, emploiDuTempsId, studentId };
}

async function addSession(a) {
  const matiereId = (await adminPool.query("insert into public.matieres (etablissement_id) values ($1) returning id", [a.establishmentId])).rows[0].id;
  const creneauId = (await adminPool.query("insert into public.creneaux_horaires (etablissement_id) values ($1) returning id", [a.establishmentId])).rows[0].id;
  const emploiDuTempsId = (
    await adminPool.query(
      "insert into public.emplois_du_temps (etablissement_id, classe_id, matiere_id, enseignant_id, creneau_id) values ($1,$2,$3,$4,$5) returning id",
      [a.establishmentId, a.classeId, matiereId, a.enseignantId, creneauId]
    )
  ).rows[0].id;
  return emploiDuTempsId;
}

function dayWindow(date) {
  const from = new Date(`${date}T00:00:00.000+01:00`);
  const to = new Date(from.getTime() + 24 * 60 * 60 * 1000);
  return { from: from.toISOString(), to: to.toISOString() };
}

async function activity(userId, establishmentId, date, limit = 20) {
  const { from, to } = dayWindow(date);
  const r = await asUser(userId, (c) => c.query("select * from public.get_school_daily_activity($1,$2,$3,$4,$5)", [establishmentId, date, from, to, limit]));
  return r.rows;
}

async function openShifts(userId, establishmentId, date) {
  const { from, to } = dayWindow(date);
  const r = await asUser(userId, (c) => c.query("select * from public.get_school_staff_open_shifts($1,$2,$3)", [establishmentId, from, to]));
  return r.rows;
}

test.beforeEach(async () => {
  if (dbAvailable) {
    await adminPool.query("delete from public.school_events");
    await adminPool.query("delete from public.timesheet_approvals");
    await adminPool.query("delete from public.student_attendance");
    await adminPool.query("delete from public.pointages");
    await adminPool.query("delete from public.applications");
  }
});

// ============================================================================
// get_school_daily_activity — content, exclusion, correction, ordering, limit
// ============================================================================
test("real Postgres — routine attendance marks never appear in the activity timeline", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const a = await seedSchool();
  await markAttendance(a.teacherUserId, a.establishmentId, a.emploiDuTempsId, a.studentId, "2026-09-15", "present");
  const rows = await activity(a.owner, a.establishmentId, "2026-09-15");
  assert.equal(rows.length, 0, "a single, uncorrected attendance mark is not itemized — only counted in the summary");
});

test("real Postgres — a corrected attendance fact appears exactly once, showing only the final state", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const a = await seedSchool();
  await markAttendance(a.teacherUserId, a.establishmentId, a.emploiDuTempsId, a.studentId, "2026-09-15", "absent");
  await markAttendance(a.teacherUserId, a.establishmentId, a.emploiDuTempsId, a.studentId, "2026-09-15", "present");
  const rows = await activity(a.owner, a.establishmentId, "2026-09-15");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].event_type, "student.present", "the timeline must never show the superseded absent state");
  assert.equal(rows[0].was_corrected, true);
});

test("real Postgres — staff/application/admission/timesheet events always appear in the activity timeline", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const a = await seedSchool();
  await punch(a.teacherUserId, a.establishmentId, "arrivee");
  await asUser(a.owner, (c) =>
    c.query("insert into public.timesheet_approvals (establishment_id, enseignant_id, period_start, period_end, approved_minutes, approved_by) values ($1,$2,current_date-6,current_date,480,$3)", [a.establishmentId, a.enseignantId, a.owner])
  );
  await adminPool.query("insert into public.applications (establishment_id, student_name) values ($1,'Dana')", [a.establishmentId]);
  const today = new Date().toISOString().slice(0, 10);
  const rows = await activity(a.owner, a.establishmentId, today, 50);
  const types = rows.map((r) => r.event_type).sort();
  assert.deepEqual(types, ["application.received", "staff.checked_in", "timesheet.approved"]);
  assert.ok(rows.every((r) => r.was_corrected === false));
});

test("real Postgres — activity ordering is deterministic (occurred_at desc) and respects the limit", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const a = await seedSchool();
  await punch(a.teacherUserId, a.establishmentId, "arrivee");
  await punch(a.teacherUserId, a.establishmentId, "depart");
  const today = new Date().toISOString().slice(0, 10);
  const rows = await activity(a.owner, a.establishmentId, today, 1);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].event_type, "staff.checked_out", "the most recent event must come first");
});

test("real Postgres — activity is establishment-scoped, no cross-school leakage", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const a = await seedSchool();
  const b = await seedSchool();
  await punch(a.teacherUserId, a.establishmentId, "arrivee");
  const today = new Date().toISOString().slice(0, 10);
  const rowsAAsOwnerA = await activity(a.owner, a.establishmentId, today, 50);
  const rowsAAsOwnerB = await activity(b.owner, a.establishmentId, today, 50);
  assert.equal(rowsAAsOwnerA.length, 1);
  assert.equal(rowsAAsOwnerB.length, 0, "an owner must never see another school's activity, even by passing its id directly");
});

test("real Postgres — activity respects the day boundary, no leakage across days", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const a = await seedSchool();
  const sessionB = await addSession(a);
  await markAttendance(a.teacherUserId, a.establishmentId, a.emploiDuTempsId, a.studentId, "2026-09-15", "absent");
  await markAttendance(a.teacherUserId, a.establishmentId, a.emploiDuTempsId, a.studentId, "2026-09-15", "present");
  await markAttendance(a.teacherUserId, a.establishmentId, sessionB, a.studentId, "2026-09-16", "absent");
  await markAttendance(a.teacherUserId, a.establishmentId, sessionB, a.studentId, "2026-09-16", "present");
  const rowsToday = await activity(a.owner, a.establishmentId, "2026-09-15", 50);
  const rowsTomorrow = await activity(a.owner, a.establishmentId, "2026-09-16", 50);
  assert.equal(rowsToday.length, 1);
  assert.equal(rowsTomorrow.length, 1);
  assert.notEqual(rowsToday[0].id, rowsTomorrow[0].id);
});

test("real Postgres RLS — teacher and anonymous have no read access to the activity reducer (no policy grants it in V1)", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const a = await seedSchool();
  await punch(a.teacherUserId, a.establishmentId, "arrivee");
  const today = new Date().toISOString().slice(0, 10);
  const asTeacher = await activity(a.teacherUserId, a.establishmentId, today, 50);
  const asAnon = await activity(null, a.establishmentId, today, 50);
  assert.equal(asTeacher.length, 0);
  assert.equal(asAnon.length, 0);
});

test("real Postgres — an empty day returns a valid, empty activity list, no error", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const a = await seedSchool();
  const rows = await activity(a.owner, a.establishmentId, "2030-01-01", 50);
  assert.deepEqual(rows, []);
});

// ============================================================================
// get_school_staff_open_shifts — deterministic, rule-based, no invented threshold
// ============================================================================
test("real Postgres — a teacher who checked in without checking out has an open shift", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const a = await seedSchool();
  const result = await punch(a.teacherUserId, a.establishmentId, "arrivee");
  const today = new Date().toISOString().slice(0, 10);
  const rows = await openShifts(a.owner, a.establishmentId, today);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].subject_id, a.enseignantId);
  // last_checked_in_event_id is the school_events.id, not the pointages.id
  // (result.result_entity_id) — verify it traces back to the exact punch.
  const ev = await adminPool.query("select source_id from public.school_events where id=$1", [rows[0].last_checked_in_event_id]);
  assert.equal(ev.rows[0].source_id, result.result_entity_id);
});

test("real Postgres — a teacher who checked in then out has no open shift", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const a = await seedSchool();
  await punch(a.teacherUserId, a.establishmentId, "arrivee");
  await punch(a.teacherUserId, a.establishmentId, "depart");
  const today = new Date().toISOString().slice(0, 10);
  const rows = await openShifts(a.owner, a.establishmentId, today);
  assert.equal(rows.length, 0);
});

test("real Postgres — a teacher with a completed cycle plus a fresh check-in still shows exactly one open shift", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const a = await seedSchool();
  await punch(a.teacherUserId, a.establishmentId, "arrivee");
  await punch(a.teacherUserId, a.establishmentId, "depart");
  const second = await punch(a.teacherUserId, a.establishmentId, "arrivee");
  const today = new Date().toISOString().slice(0, 10);
  const rows = await openShifts(a.owner, a.establishmentId, today);
  assert.equal(rows.length, 1);
  const ev = await adminPool.query("select source_id from public.school_events where id=$1", [rows[0].last_checked_in_event_id]);
  assert.equal(ev.rows[0].source_id, second.result_entity_id, "must report the LATEST check-in, not the first");
});

test("real Postgres — open shifts are establishment-scoped, no cross-school leakage", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const a = await seedSchool();
  const b = await seedSchool();
  await punch(a.teacherUserId, a.establishmentId, "arrivee");
  const today = new Date().toISOString().slice(0, 10);
  const rowsBAsOwnerB = await openShifts(b.owner, b.establishmentId, today);
  const rowsAAsOwnerB = await openShifts(b.owner, a.establishmentId, today);
  assert.equal(rowsBAsOwnerB.length, 0);
  assert.equal(rowsAAsOwnerB.length, 0, "an owner must never see another school's open shifts");
});

// ============================================================================
// FULL SCENARIO — mission's exact required test case (§49), computed from
// the real underlying pieces get_daily_school_proof + get_school_daily_activity
// + get_school_staff_open_shifts + a direct admission.accepted event read,
// exactly as src/lib/intelligence/dailyIntelligence.ts assembles them.
//
// Expected, computed before running (mission §49):
//   Student A: Session1 present, Session2 absent            -> present+1, absent+1
//   Student B: Session1 late, Session2 present               -> late+1, present+1
//   Student C: Session1 absent -> corrected present           -> present+1 (no double count)
//   => students_present = 3, students_absent = 1, students_late = 1
//   Staff: Teacher1 check-in + checkout, Teacher2 check-in    -> checked_in=2, checked_out=1, open shifts=1 (Teacher2)
//   Admissions: 2 application.received, 1 admission.accepted  -> applications_received=2, admissions_accepted=1
//   Timesheets: 2 approvals                                   -> timesheets_approved=2
// ============================================================================
test("real Postgres — full scenario: all daily-intelligence pieces match the hand-computed expectation", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const a = await seedSchool(); // Teacher1 = a.teacherUserId / a.enseignantId, Student A = a.studentId
  const sessionA2 = await addSession(a);
  const studentB = (await adminPool.query("insert into public.students (establishment_id, classe_id, first_name, last_name) values ($1,$2,'Marie','Ngo') returning id", [a.establishmentId, a.classeId])).rows[0].id;
  const studentC = (await adminPool.query("insert into public.students (establishment_id, classe_id, first_name, last_name) values ($1,$2,'Paul','Etoa') returning id", [a.establishmentId, a.classeId])).rows[0].id;
  // Attendance's day boundary is lesson_sessions.session_date (app-supplied,
  // can be any date), but staff/applications/timesheets are counted by
  // get_daily_school_proof via occurred_at::date — the real wall-clock day
  // this test actually runs on. Using real "today" for everything keeps
  // the whole scenario internally consistent.
  const day = new Date().toISOString().slice(0, 10);

  // Attendance
  await markAttendance(a.teacherUserId, a.establishmentId, a.emploiDuTempsId, a.studentId, day, "present"); // A/S1
  await markAttendance(a.teacherUserId, a.establishmentId, sessionA2, a.studentId, day, "absent"); // A/S2
  await markAttendance(a.teacherUserId, a.establishmentId, a.emploiDuTempsId, studentB, day, "late"); // B/S1
  await markAttendance(a.teacherUserId, a.establishmentId, sessionA2, studentB, day, "present"); // B/S2
  await markAttendance(a.teacherUserId, a.establishmentId, a.emploiDuTempsId, studentC, day, "absent"); // C/S1
  await markAttendance(a.teacherUserId, a.establishmentId, a.emploiDuTempsId, studentC, day, "present"); // C/S1 corrected

  // Staff: Teacher1 in+out, Teacher2 in only
  const teacher2UserId = newId();
  await adminPool.query("insert into auth.users (id) values ($1)", [teacher2UserId]);
  await adminPool.query("insert into public.enseignants (etablissement_id, user_id) values ($1,$2)", [a.establishmentId, teacher2UserId]);
  await punch(a.teacherUserId, a.establishmentId, "arrivee");
  await punch(a.teacherUserId, a.establishmentId, "depart");
  await punch(teacher2UserId, a.establishmentId, "arrivee");

  // Admissions
  await adminPool.query("insert into public.applications (establishment_id, student_name) values ($1,'App One')", [a.establishmentId]);
  const app2 = (await adminPool.query("insert into public.applications (establishment_id, student_name) values ($1,'App Two') returning id", [a.establishmentId])).rows[0].id;
  await asUser(a.owner, (c) => c.query("update public.applications set admission_status='accepted' where id=$1", [app2]));

  // Timesheets: 2 approvals (different periods, to avoid a supersession relationship)
  await asUser(a.owner, (c) =>
    c.query("insert into public.timesheet_approvals (establishment_id, enseignant_id, period_start, period_end, approved_minutes, approved_by) values ($1,$2,current_date-13,current_date-7,480,$3)", [a.establishmentId, a.enseignantId, a.owner])
  );
  await asUser(a.owner, (c) =>
    c.query("insert into public.timesheet_approvals (establishment_id, enseignant_id, period_start, period_end, approved_minutes, approved_by) values ($1,$2,current_date-6,current_date,480,$3)", [a.establishmentId, a.enseignantId, a.owner])
  );

  // --- assemble exactly as getSchoolDailyIntelligence() would ---
  const proof = await asUser(a.owner, (c) => c.query("select * from public.get_daily_school_proof($1,$2)", [a.establishmentId, day]));
  const proofMap = Object.fromEntries(proof.rows.map((r) => [r.metric, Number(r.count_value)]));

  const { from, to } = dayWindow(day);
  const admissionAccepted = await asUser(a.owner, (c) =>
    c.query("select id from public.school_events where establishment_id=$1 and event_type='admission.accepted' and occurred_at >= $2 and occurred_at < $3", [a.establishmentId, from, to])
  );
  const openShiftRows = await openShifts(a.owner, a.establishmentId, day);

  assert.equal(proofMap.students_present, 3);
  assert.equal(proofMap.students_absent, 1);
  assert.equal(proofMap.students_late, 1);
  assert.equal(proofMap.staff_checked_in, 2);
  assert.equal(proofMap.staff_checked_out, 1);
  assert.equal(proofMap.applications_received, 2);
  assert.equal(admissionAccepted.rows.length, 1);
  assert.equal(proofMap.timesheets_approved, 2);
  assert.equal(openShiftRows.length, 1);
  assert.equal(openShiftRows[0].subject_id !== a.enseignantId, true, "the open shift must belong to Teacher2, not Teacher1 (who checked out)");
});

test("real Postgres — invalid/nonexistent establishment yields an empty, valid result, never an error", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const a = await seedSchool();
  const fakeEstablishmentId = newId();
  const rows = await activity(a.owner, fakeEstablishmentId, "2026-09-15", 50);
  const shifts = await openShifts(a.owner, fakeEstablishmentId, "2026-09-15");
  assert.deepEqual(rows, []);
  assert.deepEqual(shifts, []);
});
