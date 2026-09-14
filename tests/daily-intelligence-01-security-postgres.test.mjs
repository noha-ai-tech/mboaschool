import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import pg from "pg";

// DAILY-INTELLIGENCE-01 (+ DAILY-INTELLIGENCE-01.1 local-day fix) — real
// RLS/RPC enforcement tests for school_day_window, get_school_daily_activity,
// get_school_staff_open_shifts, and the corrected get_daily_school_proof,
// built on top of the School Event Engine (EVENT-01 + EVENT-01.1). Same
// technique as every other *-security-postgres.test.mjs file in this repo.
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
    -- Atomic, race-free role creation — see the identical comment in
    -- event01-security-postgres.test.mjs for why "if not exists, create"
    -- is unsafe once more than one *-security-postgres file shares these
    -- global role names under node --test's concurrent file execution.
    do $$ begin
      begin create role anon; exception when duplicate_object then null; end;
      begin create role authenticated; exception when duplicate_object then null; end;
      begin create role service_role; exception when duplicate_object then null; end;
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
  const localDayFixSql = await readFile(path.join(projectRoot, "supabase/migrations/20260917090000_daily_intelligence_01_1_local_day_boundary.sql"), "utf8");

  try {
    await adminPool.query(event01Sql);
    await adminPool.query(dailyIntelSql);
    await adminPool.query(localDayFixSql);

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

async function seedSchool(existingOwnerId = null) {
  // DAILY-INTELLIGENCE-02 — an optional existing owner id lets a test build
  // a real multi-school-owner fixture (one owner, several establishments)
  // without duplicating this whole setup.
  const owner = existingOwnerId ?? newId();
  if (!existingOwnerId) await adminPool.query("insert into auth.users (id) values ($1)", [owner]);
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

// DAILY-INTELLIGENCE-02 consolidation gate finding: sync_apply_staff_punch
// rejects a second "arrivee" whenever an existing pointages row for that
// teacher already has horodatage::date = today's REAL wall-clock date
// (a genuine, correct business rule — "one open shift per real day", not
// a bug). punchAt's technique (real-time punch, then retroactively pin
// occurred_at to a fixed test date) collides with that rule the moment
// real time reaches the hardcoded 2026-09-14/15 test window — confirmed:
// this container's real clock is 2026-09-14 as of this gate. A fresh
// teacher per boundary instant sidesteps the collision entirely
// (v_last_open is scoped per enseignant_id), independent of what real
// date the suite happens to run on.
async function addTeacher(a) {
  const teacherUserId = newId();
  await adminPool.query("insert into auth.users (id) values ($1)", [teacherUserId]);
  const enseignantId = (await adminPool.query("insert into public.enseignants (etablissement_id, user_id) values ($1,$2) returning id", [a.establishmentId, teacherUserId])).rows[0].id;
  return { teacherUserId, enseignantId };
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

// Ask Postgres for the canonical window itself (school_day_window) rather
// than recomputing it in the test — this is exactly the same call the
// production repository makes, so a test bug in reimplementing the
// arithmetic can never mask (or falsely flag) a real regression.
async function dayWindow(date) {
  const r = await adminPool.query("select window_from, window_to from public.school_day_window($1)", [date]);
  return { from: r.rows[0].window_from.toISOString(), to: r.rows[0].window_to.toISOString() };
}

async function activity(userId, establishmentId, date, limit = 20) {
  const r = await asUser(userId, (c) => c.query("select * from public.get_school_daily_activity($1,$2,$3)", [establishmentId, date, limit]));
  return r.rows;
}

async function openShifts(userId, establishmentId, date) {
  const r = await asUser(userId, (c) => c.query("select * from public.get_school_staff_open_shifts($1,$2)", [establishmentId, date]));
  return r.rows;
}

// Insert a real staff.checked_in/checked_out event pair with an EXACT
// occurred_at we control, going through the real write path
// (sync_apply_staff_punch always uses now()) is impossible for this
// purpose — the mission's own midnight-boundary tests require placing
// events at exact instants around a day boundary, which no real clock can
// produce on demand. This helper still never inserts directly into
// school_events with fabricated establishment/actor/subject wiring: it
// calls the real punch RPC to get a fully valid, correctly-wired event,
// then retimes ONLY that one row's occurred_at to the exact test instant
// — the same "pin a real row's timestamp" technique already used by
// EVENT-01.1's tie-break audit, applied here to test a boundary no real
// clock can hit deterministically.
async function punchAt(userId, establishmentId, type, occurredAt) {
  const result = await punch(userId, establishmentId, type);
  await adminPool.query("update public.pointages set horodatage=$1 where id=$2", [occurredAt, result.result_entity_id]);
  await adminPool.query("update public.school_events set occurred_at=$1 where source_type='pointages' and source_id=$2", [occurredAt, result.result_entity_id]);
  return result;
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

  const { from, to } = await dayWindow(day);
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

// ============================================================================
// DAILY-INTELLIGENCE-01.1 — school_day_window, the single centralized
// Africa/Douala resolution every reducer now shares.
// ============================================================================
test("real Postgres — school_day_window resolves the exact mission example (2026-09-15 Africa/Douala)", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const r = await adminPool.query("select window_from, window_to from public.school_day_window($1)", ["2026-09-15"]);
  assert.equal(r.rows[0].window_from.toISOString(), "2026-09-14T23:00:00.000Z");
  assert.equal(r.rows[0].window_to.toISOString(), "2026-09-15T23:00:00.000Z");
});

// ============================================================================
// MIDNIGHT BOUNDARY — mission §8/§9, exact instants, exact expected result.
// Logical date under test: 2026-09-15 (Africa/Douala) => window
// [2026-09-14T23:00:00Z, 2026-09-15T23:00:00Z).
//
// staff.checked_in / staff.checked_out and admission.accepted all force
// occurred_at to real now() inside their respective RPC/trigger — there is
// no legitimate write-path parameter to place them at an exact historical
// instant. For these three, a real, fully-validated event is created via
// the real write path first (punch / real admission transition), then
// ONLY its occurred_at is pinned to the exact test instant — never a
// fabricated event, never invented tenant/actor/subject wiring. This is
// the same "pin a real row's timestamp" technique used by EVENT-01.1's own
// tie-break audit; it is the only way to test a clock boundary no real
// wall-clock execution can hit on demand. application.received and
// timesheet.approved, in contrast, key off applications.created_at /
// timesheet_approvals.approved_at — real, client-settable columns — so
// those are created with the exact instant already in the INSERT, a
// completely ordinary write, no pinning needed.
// ============================================================================

const BOUNDARY_INSTANTS = {
  beforeStart: "2026-09-14T22:59:59.000Z", // Sep 14 23:59:59 Douala -> excluded
  atStart: "2026-09-14T23:00:00.000Z", // Sep 15 00:00:00 Douala -> included (inclusive)
  insideEarly: "2026-09-14T23:30:00.000Z", // Sep 15 00:30:00 Douala -> included
  insideLate: "2026-09-15T22:59:59.000Z", // Sep 15 23:59:59 Douala -> included
  atEnd: "2026-09-15T23:00:00.000Z", // Sep 16 00:00:00 Douala -> excluded
};
const LOGICAL_DAY = "2026-09-15";

test("real Postgres — staff.checked_in obeys the local-day boundary at every tested instant", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const a = await seedSchool();
  // A fresh teacher per instant — sync_apply_staff_punch's "one open shift
  // per real day" check is scoped per teacher, so this is independent of
  // whatever the real wall-clock date is when this suite runs.
  for (const instant of Object.values(BOUNDARY_INSTANTS)) {
    const teacher = await addTeacher(a);
    await punchAt(teacher.teacherUserId, a.establishmentId, "arrivee", instant);
  }
  const proof = await asUser(a.owner, (c) => c.query("select * from public.get_daily_school_proof($1,$2)", [a.establishmentId, LOGICAL_DAY]));
  const count = Number(proof.rows.find((r) => r.metric === "staff_checked_in").count_value);
  assert.equal(count, 3, "only atStart, insideEarly, insideLate must be counted for 2026-09-15");
});

test("real Postgres — staff.checked_out obeys the local-day boundary at every tested instant", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const a = await seedSchool();
  for (const instant of Object.values(BOUNDARY_INSTANTS)) {
    // A fresh teacher per instant (see staff.checked_in test above for
    // why) — sync_apply_staff_punch rejects a "depart" without an active
    // "arrivee" first (already-tested product behavior), so each fresh
    // teacher opens their own shift for real, then only the depart being
    // tested is pinned to the exact boundary instant.
    const teacher = await addTeacher(a);
    await punch(teacher.teacherUserId, a.establishmentId, "arrivee");
    await punchAt(teacher.teacherUserId, a.establishmentId, "depart", instant);
  }
  const proof = await asUser(a.owner, (c) => c.query("select * from public.get_daily_school_proof($1,$2)", [a.establishmentId, LOGICAL_DAY]));
  const count = Number(proof.rows.find((r) => r.metric === "staff_checked_out").count_value);
  assert.equal(count, 3);
});

test("real Postgres — application.received obeys the local-day boundary at every tested instant", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const a = await seedSchool();
  for (const instant of Object.values(BOUNDARY_INSTANTS)) {
    await adminPool.query("insert into public.applications (establishment_id, student_name, created_at) values ($1,'Boundary Test',$2)", [a.establishmentId, instant]);
  }
  const proof = await asUser(a.owner, (c) => c.query("select * from public.get_daily_school_proof($1,$2)", [a.establishmentId, LOGICAL_DAY]));
  const count = Number(proof.rows.find((r) => r.metric === "applications_received").count_value);
  assert.equal(count, 3);
});

test("real Postgres — timesheet.approved obeys the local-day boundary at every tested instant", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const a = await seedSchool();
  let periodStartOffset = 100; // keep periods non-overlapping so no supersession relationship is implied
  for (const instant of Object.values(BOUNDARY_INSTANTS)) {
    await asUser(a.owner, (c) =>
      c.query(
        "insert into public.timesheet_approvals (establishment_id, enseignant_id, period_start, period_end, approved_minutes, approved_by, approved_at) values ($1,$2,current_date-$3::int,current_date-$4::int,480,$5,$6)",
        [a.establishmentId, a.enseignantId, periodStartOffset, periodStartOffset - 6, a.owner, instant]
      )
    );
    periodStartOffset -= 7;
  }
  const proof = await asUser(a.owner, (c) => c.query("select * from public.get_daily_school_proof($1,$2)", [a.establishmentId, LOGICAL_DAY]));
  const count = Number(proof.rows.find((r) => r.metric === "timesheets_approved").count_value);
  assert.equal(count, 3);
});

test("real Postgres — admission.accepted obeys the local-day boundary at every tested instant", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const a = await seedSchool();
  const { from, to } = await dayWindow(LOGICAL_DAY);
  for (const instant of Object.values(BOUNDARY_INSTANTS)) {
    const app = (await adminPool.query("insert into public.applications (establishment_id, student_name) values ($1,'Boundary Admission') returning id", [a.establishmentId])).rows[0].id;
    await asUser(a.owner, (c) => c.query("update public.applications set admission_status='accepted' where id=$1", [app]));
    await adminPool.query("update public.school_events set occurred_at=$1 where source_type='applications' and source_id=$2 and event_type='admission.accepted'", [instant, app]);
  }
  const admissionAccepted = await asUser(a.owner, (c) =>
    c.query("select id from public.school_events where establishment_id=$1 and event_type='admission.accepted' and occurred_at >= $2 and occurred_at < $3", [a.establishmentId, from, to])
  );
  assert.equal(admissionAccepted.rows.length, 3);
});

// ============================================================================
// ADJACENT DAYS + HISTORICAL DATE — mission §10/§11: each fact must appear
// exactly once across adjacent logical days, never zero times, never twice
// — and the same correctness must hold for a date that is not "today".
// ============================================================================
test("real Postgres — a fact exactly at a day boundary appears in exactly one of two adjacent logical days, never both, never neither", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const a = await seedSchool();
  await punchAt(a.teacherUserId, a.establishmentId, "arrivee", BOUNDARY_INSTANTS.atStart); // start of Sep 15
  const proofDayBefore = await asUser(a.owner, (c) => c.query("select * from public.get_daily_school_proof($1,$2)", [a.establishmentId, "2026-09-14"]));
  const proofDay = await asUser(a.owner, (c) => c.query("select * from public.get_daily_school_proof($1,$2)", [a.establishmentId, "2026-09-15"]));
  const countBefore = Number(proofDayBefore.rows.find((r) => r.metric === "staff_checked_in").count_value);
  const countDay = Number(proofDay.rows.find((r) => r.metric === "staff_checked_in").count_value);
  assert.equal(countBefore, 0, "must not also appear in the day before");
  assert.equal(countDay, 1, "must appear exactly once, in the day it actually belongs to");
});

test("real Postgres — historical dates (not server 'today') resolve the local-day window correctly, same as any other date", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const a = await seedSchool();
  const historicalDay = "2020-01-15"; // deliberately far from any real "today"
  await punchAt(a.teacherUserId, a.establishmentId, "arrivee", "2020-01-14T23:00:00.000Z"); // start of 2020-01-15 Douala
  await punchAt(a.teacherUserId, a.establishmentId, "arrivee", "2020-01-15T23:00:00.000Z"); // start of 2020-01-16 Douala, must NOT count
  const proof = await asUser(a.owner, (c) => c.query("select * from public.get_daily_school_proof($1,$2)", [a.establishmentId, historicalDay]));
  const count = Number(proof.rows.find((r) => r.metric === "staff_checked_in").count_value);
  assert.equal(count, 1, "a historical date must resolve its own local-day window, never depend on the server's real current date");
});

// ============================================================================
// INVALID DATE — mission §13: malformed AND impossible-but-correctly-shaped
// dates must be rejected explicitly by school_day_window itself, since
// every reducer relies on it — never silently reinterpreted.
// ============================================================================
test("real Postgres — school_day_window rejects an impossible calendar date", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  await assert.rejects(
    () => adminPool.query("select * from public.school_day_window($1)", ["2026-13-40"]),
    /date\/time field value out of range|invalid input syntax/i
  );
});

// ============================================================================
// DAILY-INTELLIGENCE-02 — SOURCE BLENDING (mission §6): all six event
// categories in the same establishment/day must coexist without any
// category overwriting another, deterministic ordering, corrections kept
// as final state, no unjustified duplicates, no metric recomputed from an
// operational table.
// ============================================================================
test("real Postgres — source blending: attendance (with a correction), staff in/out, application.received, admission.accepted, and timesheet.approved all coexist correctly the same day", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const a = await seedSchool();
  const day = new Date().toISOString().slice(0, 10); // real "today" — applications/timesheets/staff key off occurred_at

  // Attendance: one routine present, one corrected absent->present
  const student2 = (await adminPool.query("insert into public.students (establishment_id, classe_id, first_name, last_name) values ($1,$2,'Marie','Ngo') returning id", [a.establishmentId, a.classeId])).rows[0].id;
  await markAttendance(a.teacherUserId, a.establishmentId, a.emploiDuTempsId, a.studentId, day, "present");
  await markAttendance(a.teacherUserId, a.establishmentId, a.emploiDuTempsId, student2, day, "absent");
  await markAttendance(a.teacherUserId, a.establishmentId, a.emploiDuTempsId, student2, day, "present");

  // Staff: check-in only (open shift)
  await punch(a.teacherUserId, a.establishmentId, "arrivee");

  // Admissions
  await adminPool.query("insert into public.applications (establishment_id, student_name) values ($1,'Blend App')", [a.establishmentId]);
  const app = (await adminPool.query("insert into public.applications (establishment_id, student_name) values ($1,'Blend Accepted') returning id", [a.establishmentId])).rows[0].id;
  await asUser(a.owner, (c) => c.query("update public.applications set admission_status='accepted' where id=$1", [app]));

  // Timesheet
  await asUser(a.owner, (c) =>
    c.query("insert into public.timesheet_approvals (establishment_id, enseignant_id, period_start, period_end, approved_minutes, approved_by) values ($1,$2,current_date-6,current_date,480,$3)", [a.establishmentId, a.enseignantId, a.owner])
  );

  const proof = await asUser(a.owner, (c) => c.query("select * from public.get_daily_school_proof($1,$2)", [a.establishmentId, day]));
  const proofMap = Object.fromEntries(proof.rows.map((r) => [r.metric, Number(r.count_value)]));
  assert.equal(proofMap.students_present, 2, "one routine present + one corrected-to-present, never the superseded absent");
  assert.equal(proofMap.students_absent, 0, "the correction must not leave the superseded state counted alongside the final one");
  assert.equal(proofMap.staff_checked_in, 1);
  assert.equal(proofMap.applications_received, 2);
  assert.equal(proofMap.timesheets_approved, 1);

  const rows = await activity(a.owner, a.establishmentId, day, 50);
  const types = rows.map((r) => r.event_type).sort();
  assert.deepEqual(types, ["admission.accepted", "application.received", "application.received", "staff.checked_in", "student.present", "timesheet.approved"], "every category is present, no category overwritten by another, exactly one corrected-attendance item (final state), no duplicate injustified rows");
  assert.equal(new Set(rows.map((r) => r.id)).size, rows.length, "no duplicate event ids across categories");
  // deterministic ordering: strictly non-increasing occurred_at
  for (let i = 1; i < rows.length; i++) {
    assert.ok(new Date(rows[i - 1].occurred_at).getTime() >= new Date(rows[i].occurred_at).getTime(), "activity must be strictly ordered by occurred_at desc");
  }

  const openShiftRows = await openShifts(a.owner, a.establishmentId, day);
  assert.equal(openShiftRows.length, 1);
});

// ============================================================================
// DAILY-INTELLIGENCE-02 — MULTI-SCHOOL (mission §7): one owner with TWO
// establishments must get results correctly scoped to whichever
// establishmentId is actually requested — same owner_id must never leak
// data across their own two schools.
// ============================================================================
test("real Postgres — one owner with two establishments never mixes A1 and A2 data", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const a1 = await seedSchool();
  const a2 = await seedSchool(a1.owner); // same owner, second establishment
  assert.notEqual(a1.establishmentId, a2.establishmentId);

  await punch(a1.teacherUserId, a1.establishmentId, "arrivee");
  await punch(a1.teacherUserId, a1.establishmentId, "depart");
  await punch(a2.teacherUserId, a2.establishmentId, "arrivee");

  const today = new Date().toISOString().slice(0, 10);
  const proofA1 = await asUser(a1.owner, (c) => c.query("select * from public.get_daily_school_proof($1,$2)", [a1.establishmentId, today]));
  const proofA2 = await asUser(a1.owner, (c) => c.query("select * from public.get_daily_school_proof($1,$2)", [a2.establishmentId, today]));
  const mapA1 = Object.fromEntries(proofA1.rows.map((r) => [r.metric, Number(r.count_value)]));
  const mapA2 = Object.fromEntries(proofA2.rows.map((r) => [r.metric, Number(r.count_value)]));

  assert.equal(mapA1.staff_checked_in, 1);
  assert.equal(mapA1.staff_checked_out, 1);
  assert.equal(mapA2.staff_checked_in, 1);
  assert.equal(mapA2.staff_checked_out, 0, "A2 must never see A1's checkout");

  const shiftsA1 = await openShifts(a1.owner, a1.establishmentId, today);
  const shiftsA2 = await openShifts(a1.owner, a2.establishmentId, today);
  assert.equal(shiftsA1.length, 0, "A1's teacher completed their cycle");
  assert.equal(shiftsA2.length, 1, "A2's teacher has an open shift — must not be conflated with A1's closed one");

  const activityA1 = await activity(a1.owner, a1.establishmentId, today, 50);
  const activityA2 = await activity(a1.owner, a2.establishmentId, today, 50);
  assert.equal(activityA1.length, 2);
  assert.equal(activityA2.length, 1);
  assert.ok(!activityA1.some((r) => r.subject_id === a2.enseignantId), "A1's activity must never include A2's teacher");
  assert.ok(!activityA2.some((r) => r.subject_id === a1.enseignantId), "A2's activity must never include A1's teacher");
});
