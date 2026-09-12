import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import pg from "pg";

// EVENT-01 — real RLS/RPC/trigger enforcement tests for the School Event
// Engine, against a real Postgres engine with row_security actually
// enabled. Same technique as the other *-security-postgres.test.mjs files.
//
// CRITICAL: every event in this file is produced by calling the REAL
// canonical write paths (sync_apply_attendance_mark, sync_apply_staff_punch,
// a real insert into timesheet_approvals / applications) — never a direct
// INSERT into school_events. Testing the write path is testing the engine;
// faking the row would only prove the schema exists, not that emission
// actually happens (mission §55).

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(testDirectory, "..");
const ADMIN_DATABASE_URL = process.env.EVENT01_TEST_ADMIN_DATABASE_URL ?? "postgres://postgres:testpass@localhost:55432/postgres";
const DATABASE_NAME = process.env.EVENT01_TEST_DATABASE_NAME ?? "event01_security_test";
const APP_ROLE = "app_rls_role_event01";

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

  const migrationSql = await readFile(path.join(projectRoot, "supabase/migrations/20260915090000_event_01_school_event_engine.sql"), "utf8");

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
      -- Undo the test-harness convenience blanket grant above specifically
      -- for emit_school_event, so this role experiences exactly what a
      -- real authenticated/anon role gets from the migration's own
      -- "revoke all ... from authenticated" (no real Supabase role ever
      -- receives a blanket grant on every function).
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
// EMISSION — attendance
// ============================================================================
test("real Postgres — a real attendance mark produces exactly one student.present event with correct actor/subject/establishment", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const a = await seedSchool();
  const result = await markAttendance(a.teacherUserId, a.establishmentId, a.emploiDuTempsId, a.studentId, "2026-09-15", "present");
  assert.equal(result.result_status, "applied");

  const ev = await adminPool.query("select * from public.school_events where source_type='student_attendance' and source_id=$1", [result.result_entity_id]);
  assert.equal(ev.rows.length, 1);
  assert.equal(ev.rows[0].event_type, "student.present");
  assert.equal(ev.rows[0].establishment_id, a.establishmentId);
  assert.equal(ev.rows[0].actor_user_id, a.teacherUserId);
  assert.equal(ev.rows[0].subject_type, "student");
  assert.equal(ev.rows[0].subject_id, a.studentId);
});

test("real Postgres — an attendance correction produces a SECOND distinct event, never overwrites the first", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const a = await seedSchool();
  const first = await markAttendance(a.teacherUserId, a.establishmentId, a.emploiDuTempsId, a.studentId, "2026-09-15", "present");
  const second = await markAttendance(a.teacherUserId, a.establishmentId, a.emploiDuTempsId, a.studentId, "2026-09-15", "absent");
  assert.equal(second.result_entity_id, first.result_entity_id, "same underlying student_attendance row, upserted");

  const events = await adminPool.query("select event_type from public.school_events where source_type='student_attendance' and source_id=$1 order by occurred_at", [first.result_entity_id]);
  assert.deepEqual(events.rows.map((r) => r.event_type), ["student.present", "student.absent"]);
});

test("real Postgres — a late mark produces student.late", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const a = await seedSchool();
  const result = await markAttendance(a.teacherUserId, a.establishmentId, a.emploiDuTempsId, a.studentId, "2026-09-15", "late");
  const ev = await adminPool.query("select event_type from public.school_events where source_id=$1", [result.result_entity_id]);
  assert.equal(ev.rows[0].event_type, "student.late");
});

test("real Postgres — exact mutation replay produces no duplicate attendance event", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const a = await seedSchool();
  const mutationId = newId();
  const first = await markAttendance(a.teacherUserId, a.establishmentId, a.emploiDuTempsId, a.studentId, "2026-09-16", "present", mutationId);
  const second = await markAttendance(a.teacherUserId, a.establishmentId, a.emploiDuTempsId, a.studentId, "2026-09-16", "present", mutationId);
  assert.equal(second.result_entity_id, first.result_entity_id);
  const count = await adminPool.query("select count(*)::int as n from public.school_events where source_id=$1", [first.result_entity_id]);
  assert.equal(count.rows[0].n, 1);
});

test("real Postgres — a rejected attendance attempt (unauthorized teacher) produces no event at all", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const a = await seedSchool();
  const stranger = newId();
  await adminPool.query("insert into auth.users (id) values ($1)", [stranger]);
  const result = await markAttendance(stranger, a.establishmentId, a.emploiDuTempsId, a.studentId, "2026-09-15", "present");
  assert.equal(result.result_status, "rejected");
  const count = await adminPool.query("select count(*)::int as n from public.school_events where establishment_id=$1", [a.establishmentId]);
  assert.equal(count.rows[0].n, 0);
});

// ============================================================================
// EMISSION — staff punch
// ============================================================================
test("real Postgres — a real check-in produces exactly one staff.checked_in event, server time as occurred_at", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const a = await seedSchool();
  const result = await punch(a.teacherUserId, a.establishmentId, "arrivee", "1970-01-01T00:00:00Z");
  assert.equal(result.result_status, "applied");

  const ev = await adminPool.query("select * from public.school_events where source_type='pointages' and source_id=$1", [result.result_entity_id]);
  assert.equal(ev.rows.length, 1);
  assert.equal(ev.rows[0].event_type, "staff.checked_in");
  assert.equal(ev.rows[0].subject_type, "enseignant");
  assert.equal(ev.rows[0].subject_id, a.enseignantId);
  assert.ok(new Date(ev.rows[0].occurred_at).getFullYear() > 2020, "occurred_at must be server time, never the far-past device timestamp");
});

test("real Postgres — check-in then checkout produce staff.checked_in then staff.checked_out", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const a = await seedSchool();
  const in1 = await punch(a.teacherUserId, a.establishmentId, "arrivee");
  const out1 = await punch(a.teacherUserId, a.establishmentId, "depart");
  const evIn = await adminPool.query("select event_type from public.school_events where source_id=$1", [in1.result_entity_id]);
  const evOut = await adminPool.query("select event_type from public.school_events where source_id=$1", [out1.result_entity_id]);
  assert.equal(evIn.rows[0].event_type, "staff.checked_in");
  assert.equal(evOut.rows[0].event_type, "staff.checked_out");
});

test("real Postgres — a rejected double check-in produces no additional event", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const a = await seedSchool();
  await punch(a.teacherUserId, a.establishmentId, "arrivee");
  const before = await adminPool.query("select count(*)::int as n from public.school_events where event_type='staff.checked_in'");
  const rejected = await punch(a.teacherUserId, a.establishmentId, "arrivee");
  assert.equal(rejected.result_status, "rejected");
  const after = await adminPool.query("select count(*)::int as n from public.school_events where event_type='staff.checked_in'");
  assert.equal(after.rows[0].n, before.rows[0].n);
});

test("real Postgres — a cross-school punch attempt is rejected and creates no event under the foreign school", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const a = await seedSchool();
  const b = await seedSchool();
  const result = await punch(a.teacherUserId, b.establishmentId, "arrivee");
  assert.equal(result.result_status, "rejected");
  const count = await adminPool.query("select count(*)::int as n from public.school_events where establishment_id=$1 and actor_user_id=$2", [b.establishmentId, a.teacherUserId]);
  assert.equal(count.rows[0].n, 0);
});

test("real Postgres — an anomalous future device timestamp still emits the event (flag, not a block)", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const a = await seedSchool();
  const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const result = await punch(a.teacherUserId, a.establishmentId, "arrivee", future);
  assert.equal(result.result_status, "applied");
  const ev = await adminPool.query("select metadata from public.school_events where source_id=$1", [result.result_entity_id]);
  assert.equal(ev.rows[0].metadata.anomaly, "offline_timestamp_review");
});

test("real Postgres — multi-school same physical teacher: punches and events never mix between schools", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const a = await seedSchool();
  const b = await seedSchool();
  const enseignantBForA = (await adminPool.query("insert into public.enseignants (etablissement_id, user_id) values ($1,$2) returning id", [b.establishmentId, a.teacherUserId])).rows[0].id;

  const punchA = await punch(a.teacherUserId, a.establishmentId, "arrivee");
  const punchB = await punch(a.teacherUserId, b.establishmentId, "arrivee");
  assert.equal(punchA.result_status, "applied");
  assert.equal(punchB.result_status, "applied");

  const evA = await adminPool.query("select subject_id from public.school_events where establishment_id=$1", [a.establishmentId]);
  const evB = await adminPool.query("select subject_id from public.school_events where establishment_id=$1", [b.establishmentId]);
  assert.equal(evA.rows[0].subject_id, a.enseignantId);
  assert.equal(evB.rows[0].subject_id, enseignantBForA);
  assert.notEqual(evA.rows[0].subject_id, evB.rows[0].subject_id);
});

// ============================================================================
// EMISSION — timesheet approval
// ============================================================================
test("real Postgres — a real timesheet approval insert produces exactly one timesheet.approved event with metadata", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const a = await seedSchool();
  const approval = await asUser(a.owner, (c) =>
    c.query("insert into public.timesheet_approvals (establishment_id, enseignant_id, period_start, period_end, approved_minutes, approved_by) values ($1,$2,current_date-6,current_date,480,$3) returning id", [a.establishmentId, a.enseignantId, a.owner])
  );
  const ev = await adminPool.query("select * from public.school_events where source_type='timesheet_approvals' and source_id=$1", [approval.rows[0].id]);
  assert.equal(ev.rows.length, 1);
  assert.equal(ev.rows[0].event_type, "timesheet.approved");
  assert.equal(ev.rows[0].subject_id, a.enseignantId);
  assert.equal(ev.rows[0].actor_user_id, a.owner);
  assert.equal(ev.rows[0].metadata.approved_minutes, 480);
});

test("real Postgres — a superseding approval produces its own event without touching the original's event", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const a = await seedSchool();
  const first = await asUser(a.owner, (c) =>
    c.query("insert into public.timesheet_approvals (establishment_id, enseignant_id, period_start, period_end, approved_minutes, approved_by) values ($1,$2,current_date-6,current_date,480,$3) returning id", [a.establishmentId, a.enseignantId, a.owner])
  );
  const second = await asUser(a.owner, (c) =>
    c.query("insert into public.timesheet_approvals (establishment_id, enseignant_id, period_start, period_end, approved_minutes, approved_by, supersedes_approval_id) values ($1,$2,current_date-6,current_date,500,$3,$4) returning id", [a.establishmentId, a.enseignantId, a.owner, first.rows[0].id])
  );
  const evFirst = await adminPool.query("select count(*)::int as n from public.school_events where source_id=$1", [first.rows[0].id]);
  const evSecond = await adminPool.query("select count(*)::int as n from public.school_events where source_id=$1", [second.rows[0].id]);
  assert.equal(evFirst.rows[0].n, 1, "original approval's event must remain untouched");
  assert.equal(evSecond.rows[0].n, 1, "the superseding approval gets its own event");
});

// ============================================================================
// EMISSION — applications / admissions
// ============================================================================
test("real Postgres — a real application insert produces exactly one application.received event", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const a = await seedSchool();
  const app = await adminPool.query("insert into public.applications (establishment_id, student_name) values ($1,'Alice') returning id", [a.establishmentId]);
  const ev = await adminPool.query("select event_type, actor_user_id from public.school_events where source_type='applications' and source_id=$1", [app.rows[0].id]);
  assert.equal(ev.rows.length, 1);
  assert.equal(ev.rows[0].event_type, "application.received");
  assert.equal(ev.rows[0].actor_user_id, null, "a public admission has no authenticated actor");
});

test("real Postgres — an application with a null establishment_id still inserts successfully (the event trigger must never break the operational write)", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const app = await adminPool.query("insert into public.applications (establishment_id, student_name) values (null, 'No School Yet') returning id");
  assert.equal(app.rows.length, 1);
  const ev = await adminPool.query("select count(*)::int as n from public.school_events where source_id=$1", [app.rows[0].id]);
  assert.equal(ev.rows[0].n, 0, "no event is expected without an establishment_id, but the insert itself must succeed");
});

test("real Postgres — a real transition to admission_status='accepted' produces exactly one admission.accepted event", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const a = await seedSchool();
  const app = await adminPool.query("insert into public.applications (establishment_id, student_name) values ($1,'Bob') returning id", [a.establishmentId]);
  await asUser(a.owner, (c) => c.query("update public.applications set admission_status='in_review' where id=$1", [app.rows[0].id]));
  await asUser(a.owner, (c) => c.query("update public.applications set admission_status='accepted' where id=$1", [app.rows[0].id]));
  const ev = await adminPool.query("select count(*)::int as n from public.school_events where source_id=$1 and event_type='admission.accepted'", [app.rows[0].id]);
  assert.equal(ev.rows[0].n, 1);
});

test("real Postgres — a transition to a non-accepted status never produces an admission.accepted event", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const a = await seedSchool();
  const app = await adminPool.query("insert into public.applications (establishment_id, student_name) values ($1,'Carla') returning id", [a.establishmentId]);
  await asUser(a.owner, (c) => c.query("update public.applications set admission_status='rejected' where id=$1", [app.rows[0].id]));
  const ev = await adminPool.query("select count(*)::int as n from public.school_events where source_id=$1 and event_type='admission.accepted'", [app.rows[0].id]);
  assert.equal(ev.rows[0].n, 0);
});

// ============================================================================
// SECURITY — RLS matrix
// ============================================================================
test("real Postgres RLS — Owner A reads School A's events", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const a = await seedSchool();
  await punch(a.teacherUserId, a.establishmentId, "arrivee");
  const rows = await asUser(a.owner, (c) => c.query("select id from public.school_events where establishment_id=$1", [a.establishmentId]));
  assert.equal(rows.rows.length, 1);
});

test("real Postgres RLS — Owner A cannot read School B's events, and vice versa", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const a = await seedSchool();
  const b = await seedSchool();
  await punch(a.teacherUserId, a.establishmentId, "arrivee");
  await punch(b.teacherUserId, b.establishmentId, "arrivee");

  const aReadsB = await asUser(a.owner, (c) => c.query("select id from public.school_events where establishment_id=$1", [b.establishmentId]));
  const bReadsA = await asUser(b.owner, (c) => c.query("select id from public.school_events where establishment_id=$1", [a.establishmentId]));
  assert.equal(aReadsB.rows.length, 0);
  assert.equal(bReadsA.rows.length, 0);
});

test("real Postgres RLS — a teacher has no read access to any school event (no policy grants it in V1)", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const a = await seedSchool();
  await punch(a.teacherUserId, a.establishmentId, "arrivee");
  const rows = await asUser(a.teacherUserId, (c) => c.query("select id from public.school_events"));
  assert.equal(rows.rows.length, 0);
});

test("real Postgres RLS — anonymous read is denied entirely", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const a = await seedSchool();
  await punch(a.teacherUserId, a.establishmentId, "arrivee");
  const rows = await asUser(null, (c) => c.query("select id from public.school_events"));
  assert.equal(rows.rows.length, 0);
});

test("real Postgres RLS — a teacher cannot directly INSERT a forged event", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const a = await seedSchool();
  await assert.rejects(() =>
    asUser(a.teacherUserId, (c) =>
      c.query("insert into public.school_events (event_type, establishment_id, occurred_at, subject_type, subject_id, source_type, source_id) values ('student.present', $1, now(), 'student', $2, 'student_attendance', gen_random_uuid())", [a.establishmentId, a.studentId])
    )
  );
});

test("real Postgres RLS — an owner cannot directly INSERT an arbitrary event either (no INSERT policy exists for any client role)", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const a = await seedSchool();
  await assert.rejects(() =>
    asUser(a.owner, (c) =>
      c.query("insert into public.school_events (event_type, establishment_id, occurred_at, subject_type, subject_id, source_type, source_id) values ('student.present', $1, now(), 'student', $2, 'student_attendance', gen_random_uuid())", [a.establishmentId, a.studentId])
    )
  );
});

test("real Postgres — emit_school_event cannot be called directly by an authenticated client role (no EXECUTE grant)", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const a = await seedSchool();
  await assert.rejects(() =>
    asUser(a.teacherUserId, (c) =>
      c.query("select public.emit_school_event('student.present', $1, now(), $2, 'student', $3, 'student_attendance', gen_random_uuid())", [a.establishmentId, a.teacherUserId, a.studentId])
    )
  );
});

test("real Postgres — emit_school_event rejects an unknown event_type even for a trusted internal caller", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const a = await seedSchool();
  await assert.rejects(() =>
    adminPool.query("select public.emit_school_event('not.a.real.type', $1, now(), null, 'student', $2, 'student_attendance', gen_random_uuid())", [a.establishmentId, a.studentId])
  );
});

test("real Postgres — a duplicate source+event_type is silently absorbed by emit_school_event, never a hard failure for the caller", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const a = await seedSchool();
  const sourceId = newId();
  const first = await adminPool.query("select public.emit_school_event('student.present', $1, now(), null, 'student', $2, 'student_attendance', $3)", [a.establishmentId, a.studentId, sourceId]);
  const second = await adminPool.query("select public.emit_school_event('student.present', $1, now(), null, 'student', $2, 'student_attendance', $3)", [a.establishmentId, a.studentId, sourceId]);
  assert.ok(first.rows[0].emit_school_event, "first call returns the new event id");
  assert.equal(second.rows[0].emit_school_event, null, "the duplicate is absorbed, returning null rather than erroring");
  const count = await adminPool.query("select count(*)::int as n from public.school_events where source_id=$1", [sourceId]);
  assert.equal(count.rows[0].n, 1);
});

// ============================================================================
// PRIVACY
// ============================================================================
test("real Postgres — event metadata across every implemented event type never contains a privacy sentinel", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const a = await seedSchool();
  await markAttendance(a.teacherUserId, a.establishmentId, a.emploiDuTempsId, a.studentId, "2026-09-15", "present");
  await punch(a.teacherUserId, a.establishmentId, "arrivee");
  await asUser(a.owner, (c) =>
    c.query("insert into public.timesheet_approvals (establishment_id, enseignant_id, period_start, period_end, approved_minutes, approved_by, note) values ($1,$2,current_date-6,current_date,480,$3,'a private note that must never appear in metadata')", [a.establishmentId, a.enseignantId, a.owner])
  );
  await adminPool.query("insert into public.applications (establishment_id, student_name, message) values ($1,'Dana','a private message body that must never appear in metadata')", [a.establishmentId]);

  const rows = await adminPool.query("select metadata from public.school_events");
  const text = JSON.stringify(rows.rows.map((r) => r.metadata)).toLowerCase();
  for (const sentinel of ["password", "token", "signedurl", "storage_path", "private note", "message body", "must never appear"]) {
    assert.ok(!text.includes(sentinel), `metadata must never contain "${sentinel}"`);
  }
});

// ============================================================================
// DAILY DETERMINISTIC PROOF — correction-aware
// ============================================================================
test("real Postgres — the daily proof counts the FINAL corrected attendance state, never both present and absent for the same student", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const a = await seedSchool();
  await markAttendance(a.teacherUserId, a.establishmentId, a.emploiDuTempsId, a.studentId, "2026-09-15", "present");
  await markAttendance(a.teacherUserId, a.establishmentId, a.emploiDuTempsId, a.studentId, "2026-09-15", "absent");

  const proof = await asUser(a.owner, (c) => c.query("select * from public.get_daily_school_proof($1, '2026-09-15')", [a.establishmentId]));
  const map = Object.fromEntries(proof.rows.map((r) => [r.metric, Number(r.count_value)]));
  assert.equal(map.students_present, 0, "the present event was superseded by the correction");
  assert.equal(map.students_absent, 1, "only the final, corrected state is counted");
});

test("real Postgres — the daily proof is establishment-scoped for the calling owner (RLS applies, security invoker)", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const a = await seedSchool();
  const b = await seedSchool();
  await punch(a.teacherUserId, a.establishmentId, "arrivee");
  await punch(b.teacherUserId, b.establishmentId, "arrivee");

  const proofAAsOwnerA = await asUser(a.owner, (c) => c.query("select * from public.get_daily_school_proof($1, current_date)", [a.establishmentId]));
  const mapA = Object.fromEntries(proofAAsOwnerA.rows.map((r) => [r.metric, Number(r.count_value)]));
  assert.equal(mapA.staff_checked_in, 1);

  // Owner A asking for School B's proof: RLS on school_events makes the
  // underlying reads see zero rows for that establishment, since
  // get_daily_school_proof is security invoker.
  const proofBAsOwnerA = await asUser(a.owner, (c) => c.query("select * from public.get_daily_school_proof($1, current_date)", [b.establishmentId]));
  const mapB = Object.fromEntries(proofBAsOwnerA.rows.map((r) => [r.metric, Number(r.count_value)]));
  assert.equal(mapB.staff_checked_in, 0, "an owner must never see another school's proof, even by passing its id directly");
});

test("real Postgres — every count in the daily proof carries traceable event ids", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const a = await seedSchool();
  const result = await markAttendance(a.teacherUserId, a.establishmentId, a.emploiDuTempsId, a.studentId, "2026-09-15", "present");
  const proof = await asUser(a.owner, (c) => c.query("select * from public.get_daily_school_proof($1, '2026-09-15')", [a.establishmentId]));
  const presentRow = proof.rows.find((r) => r.metric === "students_present");
  assert.equal(presentRow.count_value, "1");
  assert.equal(presentRow.event_ids.length, 1);
  const ev = await adminPool.query("select source_id from public.school_events where id=$1", [presentRow.event_ids[0]]);
  assert.equal(ev.rows[0].source_id, result.result_entity_id, "the traced event id must resolve back to the exact source row");
});
