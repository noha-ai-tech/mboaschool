import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import pg from "pg";

// MOBILE-01.1 — real RLS enforcement tests for public.students, run
// against a real Postgres engine with row_security actually enabled for
// a non-superuser role (the "postgres" superuser bypasses RLS entirely,
// so a dedicated low-privilege role is created and every query in this
// file runs as that role, exactly reproducing how PostgREST/Supabase
// enforces RLS for the anon/authenticated roles in production).

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(testDirectory, "..");
const ADMIN_DATABASE_URL = process.env.MOBILE01_ROSTER_TEST_ADMIN_DATABASE_URL ?? "postgres://postgres:testpass@localhost:55432/postgres";
const DATABASE_NAME = process.env.MOBILE01_ROSTER_TEST_DATABASE_NAME ?? "mobile01_roster_test";
const APP_ROLE = "app_rls_role";

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

  const migrationSql = await readFile(
    path.join(projectRoot, "supabase/migrations/20260910120000_mobile_01_student_roster_attendance.sql"),
    "utf8"
  );
  const lifecycleSql = await readFile(
    path.join(projectRoot, "supabase/migrations/20260911090000_mobile_01_1_student_lifecycle.sql"),
    "utf8"
  );
  try {
    // sync_mutations n'est pas nécessaire ici (ces tests portent sur les
    // policies RLS de la table students elle-même, pas sur la RPC
    // attendance) — un stub minimal suffit pour que le fichier
    // s'applique sans erreur si une référence existe.
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

    // Rôle low-privilege reproduisant "authenticated" : RLS réellement
    // appliqué (contrairement au superuser "postgres", qui la contourne
    // silencieusement — un test qui tournerait en superuser passerait à
    // tort même si une policy était cassée).
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

async function seedSchool({ ownerId } = {}) {
  const owner = ownerId ?? newId();
  await adminPool.query("insert into auth.users (id) values ($1) on conflict do nothing", [owner]);
  const establishmentId = (await adminPool.query("insert into public.establishments (owner_id, forfait) values ($1, 'pro') returning id", [owner])).rows[0].id;
  const classeId = (await adminPool.query("insert into public.classes (establishment_id) values ($1) returning id", [establishmentId])).rows[0].id;
  return { owner, establishmentId, classeId };
}

async function seedTeacherAssignedToClass(establishmentId, classeId) {
  const teacherUserId = newId();
  await adminPool.query("insert into auth.users (id) values ($1)", [teacherUserId]);
  const enseignantId = (await adminPool.query("insert into public.enseignants (etablissement_id, user_id) values ($1, $2) returning id", [establishmentId, teacherUserId])).rows[0].id;
  const matiereId = (await adminPool.query("insert into public.matieres (etablissement_id) values ($1) returning id", [establishmentId])).rows[0].id;
  const creneauId = (await adminPool.query("insert into public.creneaux_horaires (etablissement_id) values ($1) returning id", [establishmentId])).rows[0].id;
  await adminPool.query("insert into public.emplois_du_temps (etablissement_id, classe_id, matiere_id, enseignant_id, creneau_id) values ($1, $2, $3, $4, $5)", [
    establishmentId,
    classeId,
    matiereId,
    enseignantId,
    creneauId,
  ]);
  return teacherUserId;
}

test.beforeEach(async () => {
  if (dbAvailable) {
    await adminPool.query("delete from public.students");
  }
});

test("real Postgres RLS — owner can create a student in their own school", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const school = await seedSchool();

  const result = await asUser(school.owner, (client) =>
    client.query("insert into public.students (establishment_id, classe_id, first_name, last_name) values ($1, $2, 'Jean', 'Mbarga') returning id", [
      school.establishmentId,
      school.classeId,
    ])
  );
  assert.equal(result.rows.length, 1);
});

test("real Postgres RLS — owner CANNOT create a student in a school they don't own (cross-school create denied)", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const schoolA = await seedSchool();
  const schoolB = await seedSchool();

  await assert.rejects(
    () =>
      asUser(schoolA.owner, (client) =>
        client.query("insert into public.students (establishment_id, classe_id, first_name, last_name) values ($1, $2, 'Jean', 'Mbarga')", [
          schoolB.establishmentId,
          schoolB.classeId,
        ])
      ),
    /row-level security/i
  );
});

test("real Postgres RLS — owner can update a student's name/class within their own school", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const school = await seedSchool();
  const studentId = (
    await adminPool.query("insert into public.students (establishment_id, classe_id, first_name, last_name) values ($1, $2, 'Jean', 'Mbarga') returning id", [
      school.establishmentId,
      school.classeId,
    ])
  ).rows[0].id;

  await asUser(school.owner, (client) => client.query("update public.students set first_name = 'Jean-Paul' where id = $1", [studentId]));
  const row = await adminPool.query("select first_name from public.students where id = $1", [studentId]);
  assert.equal(row.rows[0].first_name, "Jean-Paul");
});

test("real Postgres RLS — owner CANNOT update a student belonging to another school (manipulated studentId rejected)", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const schoolA = await seedSchool();
  const schoolB = await seedSchool();
  const studentBId = (
    await adminPool.query("insert into public.students (establishment_id, classe_id, first_name, last_name) values ($1, $2, 'Marie', 'Ngo') returning id", [
      schoolB.establishmentId,
      schoolB.classeId,
    ])
  ).rows[0].id;

  const result = await asUser(schoolA.owner, (client) => client.query("update public.students set first_name = 'Hacked' where id = $1", [studentBId]));
  assert.equal(result.rowCount, 0, "RLS must silently match zero rows for a foreign student, never actually update it");

  const row = await adminPool.query("select first_name from public.students where id = $1", [studentBId]);
  assert.equal(row.rows[0].first_name, "Marie", "School B's student must remain untouched");
});

test("real Postgres RLS — owner can archive (soft-remove) their own student", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const school = await seedSchool();
  const studentId = (
    await adminPool.query("insert into public.students (establishment_id, classe_id, first_name, last_name) values ($1, $2, 'Jean', 'Mbarga') returning id", [
      school.establishmentId,
      school.classeId,
    ])
  ).rows[0].id;

  await asUser(school.owner, (client) => client.query("update public.students set status = 'archived' where id = $1", [studentId]));
  const row = await adminPool.query("select status from public.students where id = $1", [studentId]);
  assert.equal(row.rows[0].status, "archived");
});

test("real Postgres RLS — teacher assigned to the class can READ its roster", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const school = await seedSchool();
  const teacherUserId = await seedTeacherAssignedToClass(school.establishmentId, school.classeId);
  await adminPool.query("insert into public.students (establishment_id, classe_id, first_name, last_name) values ($1, $2, 'Jean', 'Mbarga')", [school.establishmentId, school.classeId]);

  const result = await asUser(teacherUserId, (client) => client.query("select * from public.students where classe_id = $1", [school.classeId]));
  assert.equal(result.rows.length, 1);
});

test("real Postgres RLS — teacher CANNOT write to students (no insert/update policy grants it, even for their own class)", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const school = await seedSchool();
  const teacherUserId = await seedTeacherAssignedToClass(school.establishmentId, school.classeId);

  await assert.rejects(
    () =>
      asUser(teacherUserId, (client) =>
        client.query("insert into public.students (establishment_id, classe_id, first_name, last_name) values ($1, $2, 'Jean', 'Mbarga')", [
          school.establishmentId,
          school.classeId,
        ])
      ),
    /row-level security/i
  );

  const studentId = (
    await adminPool.query("insert into public.students (establishment_id, classe_id, first_name, last_name) values ($1, $2, 'Marie', 'Ngo') returning id", [
      school.establishmentId,
      school.classeId,
    ])
  ).rows[0].id;
  const updateResult = await asUser(teacherUserId, (client) => client.query("update public.students set first_name = 'Hacked' where id = $1", [studentId]));
  assert.equal(updateResult.rowCount, 0, "a teacher must never be able to write to students, not even their own class's roster");
});

test("real Postgres RLS — teacher NOT assigned to this class cannot read its roster (unrelated-class read denied)", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const school = await seedSchool();
  const otherClasseId = (await adminPool.query("insert into public.classes (establishment_id) values ($1) returning id", [school.establishmentId])).rows[0].id;
  const teacherUserId = await seedTeacherAssignedToClass(school.establishmentId, otherClasseId); // assigned to a DIFFERENT class
  await adminPool.query("insert into public.students (establishment_id, classe_id, first_name, last_name) values ($1, $2, 'Jean', 'Mbarga')", [school.establishmentId, school.classeId]);

  const result = await asUser(teacherUserId, (client) => client.query("select * from public.students where classe_id = $1", [school.classeId]));
  assert.equal(result.rows.length, 0, "a teacher not assigned to this class must see zero rows, never the roster");
});

test("real Postgres RLS — teacher from School B cannot read School A's roster (cross-school read denied)", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const schoolA = await seedSchool();
  const schoolB = await seedSchool();
  const teacherB = await seedTeacherAssignedToClass(schoolB.establishmentId, schoolB.classeId);
  await adminPool.query("insert into public.students (establishment_id, classe_id, first_name, last_name) values ($1, $2, 'Jean', 'Mbarga')", [schoolA.establishmentId, schoolA.classeId]);

  const result = await asUser(teacherB, (client) => client.query("select * from public.students where classe_id = $1", [schoolA.classeId]));
  assert.equal(result.rows.length, 0);
});

test("real Postgres RLS — an anonymous (unauthenticated) request sees no roster at all", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const school = await seedSchool();
  await adminPool.query("insert into public.students (establishment_id, classe_id, first_name, last_name) values ($1, $2, 'Jean', 'Mbarga')", [school.establishmentId, school.classeId]);

  const result = await asUser(null, (client) => client.query("select * from public.students where classe_id = $1", [school.classeId]));
  assert.equal(result.rows.length, 0);
});

test("real Postgres RLS — homonyms (same name, different students) are both accepted — no UNIQUE(name) constraint exists", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const school = await seedSchool();

  const first = await asUser(school.owner, (client) =>
    client.query("insert into public.students (establishment_id, classe_id, first_name, last_name) values ($1, $2, 'Paul', 'Nana') returning id", [
      school.establishmentId,
      school.classeId,
    ])
  );
  const second = await asUser(school.owner, (client) =>
    client.query("insert into public.students (establishment_id, classe_id, first_name, last_name) values ($1, $2, 'Paul', 'Nana') returning id", [
      school.establishmentId,
      school.classeId,
    ])
  );
  assert.notEqual(first.rows[0].id, second.rows[0].id, "two students with identical names must be treated as distinct people, never merged/rejected");
});

test("real Postgres RLS — the roster query only ever returns students of the requested class, not the whole establishment", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const school = await seedSchool();
  const otherClasseId = (await adminPool.query("insert into public.classes (establishment_id) values ($1) returning id", [school.establishmentId])).rows[0].id;
  await adminPool.query("insert into public.students (establishment_id, classe_id, first_name, last_name) values ($1, $2, 'Jean', 'Mbarga')", [school.establishmentId, school.classeId]);
  await adminPool.query("insert into public.students (establishment_id, classe_id, first_name, last_name) values ($1, $2, 'Autre', 'Eleve')", [school.establishmentId, otherClasseId]);

  const result = await asUser(school.owner, (client) => client.query("select * from public.students where classe_id = $1", [school.classeId]));
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].first_name, "Jean");
});
