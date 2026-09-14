import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import pg from "pg";

// HOTFIX-APPLICATIONS-01 — real RLS/RPC enforcement tests for the public
// pre-registration submission fix, against a real Postgres engine with
// row_security actually enabled. Same technique as every other
// *-security-postgres.test.mjs file in this repo.
//
// CRITICAL: this applies the REAL, byte-identical migrations —
// 0007_production_security_reconciliation.sql (schema catch-up columns +
// the existing public-submission rate limiter),
// 0012_admissions_v1.sql (admission_status/tracking_code + their
// enforcement triggers, get_admission_by_tracking), and this mission's own
// 20260918090000_fix_public_application_submission.sql — never a
// hand-rewritten approximation of them. `storage.buckets`/`storage.objects`/
// `storage.foldername()` are stubbed minimally below ONLY so 0007 (which
// references real Supabase Storage) applies unmodified on a bare Postgres
// container; nothing about storage itself is under test here.
//
// Every submission exercised here goes through the real
// submit_public_application RPC via a raw SQL call with named parameters
// (the same named-parameter resolution PostgREST itself relies on) —
// never a direct INSERT into applications.

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(testDirectory, "..");
const ADMIN_DATABASE_URL = process.env.EVENT01_TEST_ADMIN_DATABASE_URL ?? "postgres://postgres:testpass@localhost:55432/postgres";
const DATABASE_NAME = process.env.HOTFIX_APPLICATIONS_01_TEST_DATABASE_NAME ?? "hotfix_applications_01_security_test";
const APP_ROLE = "app_rls_role_hotfix_apps01";
const APP_ROLE_AUTH = "app_rls_role_hotfix_apps01_auth";

let adminPool;
let rlsPool;
let rlsAuthPool;
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
    drop schema if exists storage cascade;
    create schema public;
    create schema auth;
    create schema storage;
    create extension if not exists pgcrypto;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    do $$ begin
      begin create role anon; exception when duplicate_object then null; end;
      begin create role authenticated; exception when duplicate_object then null; end;
      begin create role service_role; exception when duplicate_object then null; end;
    end $$;

    -- Minimal Supabase Storage stub — only so 0007's real, unmodified
    -- storage section applies cleanly on a bare Postgres container.
    -- Nothing about storage security is exercised by this test file.
    create table storage.buckets (id text primary key, name text, public boolean default false);
    create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);
    alter table storage.objects enable row level security;
    create function storage.foldername(name text) returns text[] language sql immutable as $$
      select string_to_array(name, '/')
    $$;

    create type user_role as enum ('parent', 'establishment_admin', 'platform_admin');
    create type main_category as enum ('garderie', 'primaire', 'secondaire', 'superieur', 'autres');
    create type application_status as enum ('pending', 'reviewed', 'accepted', 'rejected');

    create table public.profiles (
      id uuid primary key references auth.users(id) on delete cascade,
      role user_role not null default 'parent',
      full_name text, phone text, created_at timestamptz default now()
    );
    alter table public.profiles enable row level security;
    create policy "Users can read own profile" on public.profiles for select using (auth.uid() = id);
    create policy "Users can insert own profile" on public.profiles for insert with check (auth.uid() = id);

    create table public.establishments (
      id uuid primary key default gen_random_uuid(),
      owner_id uuid references public.profiles(id) on delete set null,
      name text not null, slug text unique not null,
      main_category main_category not null default 'primaire',
      city text not null default 'Douala', forfait text not null default 'gratuit',
      created_at timestamptz default now()
    );
    alter table public.establishments enable row level security;
    create policy "Public can read establishments" on public.establishments for select using (true);
    create policy "Owners can insert establishments" on public.establishments for insert with check (auth.uid() = owner_id);
    create policy "Owners can update own establishments" on public.establishments for update using (auth.uid() = owner_id);

    create table public.classes (
      id uuid primary key default gen_random_uuid(),
      establishment_id uuid not null references public.establishments(id) on delete cascade,
      name text not null, created_at timestamptz default now()
    );
    alter table public.classes enable row level security;
    create policy "Public can read classes" on public.classes for select using (true);

    create table public.school_announcements (
      id uuid primary key default gen_random_uuid(),
      establishment_id uuid references public.establishments(id) on delete cascade,
      title text not null, content text, created_at timestamptz default now()
    );
    alter table public.school_announcements enable row level security;
    create policy "Public can read announcements" on public.school_announcements for select using (true);

    create table public.annees_scolaires (
      id uuid primary key default gen_random_uuid(),
      etablissement_id uuid not null references public.establishments(id) on delete cascade,
      libelle text not null default '2026-2027'
    );
    alter table public.annees_scolaires enable row level security;
    create policy "Public can read annees_scolaires" on public.annees_scolaires for select using (true);

    -- NO student_name column here — HOTFIX-APPLICATIONS-01.1 corrected this
    -- bootstrap after a production read-only audit (project umcwwynrftidytxgqkwi,
    -- supabase db dump --linked -s public) proved student_name does not exist
    -- on the real applications table. schema.sql's student_name text not null
    -- is a historical snapshot from the initial commit, never re-executed since,
    -- and does not reflect production reality — this bootstrap must track the
    -- real table, not schema.sql, precisely because the previous version of this
    -- file silently masked that drift (all 18 tests passed against a schema the
    -- real submit_public_application() could never actually run against).
    create table public.applications (
      id uuid primary key default gen_random_uuid(),
      parent_id uuid references public.profiles(id) on delete set null,
      establishment_id uuid references public.establishments(id) on delete cascade,
      student_age integer, student_level text,
      parent_name text, parent_phone text, parent_email text, message text,
      status application_status default 'pending', created_at timestamptz default now()
    );
    alter table public.applications enable row level security;
    create policy "applications_public_insert" on public.applications for insert to anon, authenticated with check (true);
    create policy "Parents can read own applications" on public.applications for select using (auth.uid() = parent_id);
    create policy "Owners can read establishment applications" on public.applications for select using (
      exists (select 1 from public.establishments e where e.id = establishment_id and e.owner_id = auth.uid())
    );
  `);

  const sql0007 = await readFile(path.join(projectRoot, "supabase/migrations/0007_production_security_reconciliation.sql"), "utf8");
  const sql0012 = await readFile(path.join(projectRoot, "supabase/migrations/0012_admissions_v1.sql"), "utf8");
  const hotfixSql = await readFile(path.join(projectRoot, "supabase/migrations/20260918090000_fix_public_application_submission.sql"), "utf8");

  try {
    await adminPool.query(sql0007);
    await adminPool.query(sql0012);
    await adminPool.query(hotfixSql);

    await adminPool.query(`
      do $$
      begin
        if not exists (select 1 from pg_roles where rolname = '${APP_ROLE}') then
          create role ${APP_ROLE} login password 'testpass' nosuperuser;
        end if;
        if not exists (select 1 from pg_roles where rolname = '${APP_ROLE_AUTH}') then
          create role ${APP_ROLE_AUTH} login password 'testpass' nosuperuser;
        end if;
      end
      $$;
      grant usage on schema public, auth to ${APP_ROLE}, ${APP_ROLE_AUTH};
      grant select, insert, update, delete on all tables in schema public to ${APP_ROLE}, ${APP_ROLE_AUTH};
      grant select on all tables in schema auth to ${APP_ROLE}, ${APP_ROLE_AUTH};
      grant execute on all functions in schema public to ${APP_ROLE}, ${APP_ROLE_AUTH};
      -- ${APP_ROLE} simulates the real anon role: undo the blanket
      -- test-harness grant above specifically for the table itself, so it
      -- experiences exactly what anon gets from the hotfix migration's own
      -- REVOKE ALL ... FROM anon (no real Supabase anon role ever receives
      -- a blanket grant on every table). ${APP_ROLE_AUTH} simulates the
      -- real authenticated role, which keeps its table grants (unchanged
      -- by this hotfix) and relies on RLS for row-level scoping — used for
      -- every owner/teacher/stranger scenario below, since those are all
      -- authenticated users in the real product, never anon.
      revoke all on table public.applications from ${APP_ROLE};
      grant execute on function public.submit_public_application(
        uuid, text, text, text, text, date, integer, text, text, text, text, uuid
      ) to ${APP_ROLE}, ${APP_ROLE_AUTH};
    `);

    const rlsUrl = new URL(dbUrl.toString());
    rlsUrl.username = APP_ROLE;
    rlsUrl.password = "testpass";
    rlsPool = new pg.Pool({ connectionString: rlsUrl.toString(), max: 5 });
    await rlsPool.query("select 1");

    const rlsAuthUrl = new URL(dbUrl.toString());
    rlsAuthUrl.username = APP_ROLE_AUTH;
    rlsAuthUrl.password = "testpass";
    rlsAuthPool = new pg.Pool({ connectionString: rlsAuthUrl.toString(), max: 5 });
    await rlsAuthPool.query("select 1");
  } catch (e) {
    unavailableReason = `Failed to apply the real migration SQL / provision the RLS-enforced roles: ${e.message}`;
    console.error(unavailableReason);
    dbAvailable = false;
  }
});

test.after(async () => {
  if (rlsPool) await rlsPool.end();
  if (rlsAuthPool) await rlsAuthPool.end();
  if (adminPool) await adminPool.end();
});

function newId() {
  return crypto.randomUUID();
}

// Simulates a real anonymous (anon-role) session — no table grants.
async function asUser(userId, fn) {
  const client = await rlsPool.connect();
  try {
    await client.query("select set_config('request.jwt.claim.sub', $1, false)", [userId ?? ""]);
    return await fn(client);
  } finally {
    client.release();
  }
}

// Simulates a real authenticated-role session (owner/teacher/any signed-in
// user) — retains table grants, scoped by RLS, exactly like production's
// `authenticated` role (unmodified by this hotfix).
async function asAuthUser(userId, fn) {
  const client = await rlsAuthPool.connect();
  try {
    await client.query("select set_config('request.jwt.claim.sub', $1, false)", [userId ?? ""]);
    return await fn(client);
  } finally {
    client.release();
  }
}

async function submit(userId, params) {
  const p = {
    p_establishment_id: null, p_student_first_name: "Jean", p_student_last_name: "Mbarga",
    p_parent_name: "Marie Mbarga", p_parent_phone: "699000000",
    p_student_birth_date: null, p_student_age: null, p_desired_level: null,
    p_previous_school: null, p_parent_email: null, p_message: null, p_annee_scolaire_id: null,
    ...params,
  };
  return asUser(userId, (c) =>
    c.query(
      `select * from public.submit_public_application(
        p_establishment_id => $1, p_student_first_name => $2, p_student_last_name => $3,
        p_parent_name => $4, p_parent_phone => $5, p_student_birth_date => $6,
        p_student_age => $7, p_desired_level => $8, p_previous_school => $9,
        p_parent_email => $10, p_message => $11, p_annee_scolaire_id => $12
      )`,
      [
        p.p_establishment_id, p.p_student_first_name, p.p_student_last_name, p.p_parent_name, p.p_parent_phone,
        p.p_student_birth_date, p.p_student_age, p.p_desired_level, p.p_previous_school, p.p_parent_email,
        p.p_message, p.p_annee_scolaire_id,
      ]
    )
  );
}

async function seedSchool() {
  const owner = newId();
  await adminPool.query("insert into auth.users (id) values ($1)", [owner]);
  // establishments.owner_id references profiles(id), not auth.users(id)
  // directly — a profiles row is required first.
  await adminPool.query("insert into public.profiles (id) values ($1)", [owner]);
  const establishmentId = (await adminPool.query("insert into public.establishments (owner_id, slug, name) values ($1,$2,'École Test') returning id", [owner, `school-${newId()}`])).rows[0].id;
  return { owner, establishmentId };
}

test.beforeEach(async () => {
  if (dbAvailable) {
    await adminPool.query("delete from public.admissions_history");
    await adminPool.query("delete from public.applications");
  }
});

// ============================================================================
// 1-4. Direct table access denied for the anonymous/unauthenticated role
// ============================================================================
test("real Postgres — anon cannot SELECT applications directly", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const a = await seedSchool();
  await submit(null, { p_establishment_id: a.establishmentId });
  await assert.rejects(() => asUser(null, (c) => c.query("select * from public.applications")), /permission denied/i);
});

test("real Postgres — anon cannot INSERT applications directly", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const a = await seedSchool();
  await assert.rejects(
    () => asUser(null, (c) => c.query("insert into public.applications (establishment_id, parent_name) values ($1,'Direct')", [a.establishmentId])),
    /permission denied/i
  );
});

test("real Postgres — anon cannot UPDATE applications directly", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  await assert.rejects(
    () => asUser(null, (c) => c.query("update public.applications set status='accepted' where id=$1", [newId()])),
    /permission denied/i
  );
});

test("real Postgres — anon cannot DELETE applications directly", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  await assert.rejects(
    () => asUser(null, (c) => c.query("delete from public.applications where id=$1", [newId()])),
    /permission denied/i
  );
});

// ============================================================================
// 5-7. Real submission via the RPC — minimal, correct return
// ============================================================================
test("real Postgres — anon submit valid application via the real RPC succeeds", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const a = await seedSchool();
  const result = await submit(null, { p_establishment_id: a.establishmentId, p_message: "PRIVATE_MESSAGE_SENTINEL" });
  assert.equal(result.rows.length, 1);
  const row = result.rows[0];
  assert.deepEqual(Object.keys(row).sort(), ["id", "tracking_code"]);
  assert.ok(row.tracking_code, "tracking_code must be generated");
  assert.ok(!JSON.stringify(row).includes("PRIVATE_MESSAGE_SENTINEL"), "the RPC response must never echo back the message or any other PII");
});

test("real Postgres — the RPC's DB row is correctly established, server-controlled, and traceable", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const a = await seedSchool();
  const result = await submit(null, { p_establishment_id: a.establishmentId });
  const dbRow = (await adminPool.query("select * from public.applications where id=$1", [result.rows[0].id])).rows[0];
  assert.equal(dbRow.establishment_id, a.establishmentId);
  assert.equal(dbRow.admission_status, "submitted", "server-controlled initial status, never client-settable");
  assert.equal(dbRow.student_first_name, "Jean");
  assert.equal(dbRow.student_last_name, "Mbarga");
  assert.equal(dbRow.full_student_name, "Jean Mbarga", "derived server-side from first+last, same convention as get_admission_by_tracking");
  assert.equal(dbRow.parent_id, null, "a genuinely anonymous submitter must never be attributed to any profile");
});

// ============================================================================
// 8. Invalid establishment
// ============================================================================
test("real Postgres — an invalid/nonexistent establishment is rejected with a clean error", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  await assert.rejects(() => submit(null, { p_establishment_id: newId() }), /introuvable/i);
});

// ============================================================================
// PRODUCTION-CONTRACT REGRESSION GUARD (HOTFIX-APPLICATIONS-01.1) — a real,
// read-only production catalog dump (project umcwwynrftidytxgqkwi) proved
// that public.applications has no student_name column, contradicting
// schema.sql (an unexecuted historical snapshot from the initial commit) and
// the previous version of this exact bootstrap. This asserts the real
// contract directly, so reintroducing student_name anywhere in the RPC or
// this bootstrap fails loudly instead of silently masking drift again.
// ============================================================================
test("production contract — public.applications must NOT have a student_name column", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const result = await adminPool.query(
    "select 1 from information_schema.columns where table_schema='public' and table_name='applications' and column_name='student_name'"
  );
  assert.equal(result.rowCount, 0, "student_name does not exist on production — it must never be reintroduced");
});

test("production contract — public.applications has every column submit_public_application relies on", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const expected = [
    "id", "parent_id", "establishment_id", "student_first_name", "student_last_name",
    "full_student_name", "student_birth_date", "student_age", "desired_level",
    "previous_school", "parent_name", "parent_phone", "parent_email", "message",
    "annee_scolaire_id", "admission_status", "tracking_code",
  ];
  const result = await adminPool.query(
    "select column_name from information_schema.columns where table_schema='public' and table_name='applications'"
  );
  const actual = new Set(result.rows.map((r) => r.column_name));
  for (const column of expected) {
    assert.ok(actual.has(column), `expected production column missing from bootstrap: ${column}`);
  }
});

test("production contract — the RPC inserts successfully with no student_name reference anywhere", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const a = await seedSchool();
  const result = await submit(null, {
    p_establishment_id: a.establishmentId,
    p_student_first_name: "Amina",
    p_student_last_name: "Njoya",
  });
  const dbRow = (await adminPool.query("select student_first_name, student_last_name, full_student_name from public.applications where id=$1", [result.rows[0].id])).rows[0];
  assert.equal(dbRow.student_first_name, "Amina");
  assert.equal(dbRow.student_last_name, "Njoya");
  assert.equal(dbRow.full_student_name, "Amina Njoya");
});

// ============================================================================
// 9-10. Injected internal/owner/admin fields are structurally impossible
// ============================================================================
test("real Postgres — an injected admission_status parameter is impossible (function has no such parameter)", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const a = await seedSchool();
  await assert.rejects(
    () => asUser(null, (c) => c.query(
      "select * from public.submit_public_application(p_establishment_id => $1, p_student_first_name => 'A', p_student_last_name => 'B', p_parent_name => 'C', p_parent_phone => '699', admission_status => 'accepted')",
      [a.establishmentId]
    )),
    /function .* does not exist/i
  );
});

test("real Postgres — an injected tracking_code or parent_id parameter is impossible (function has no such parameter)", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const a = await seedSchool();
  await assert.rejects(
    () => asUser(null, (c) => c.query(
      "select * from public.submit_public_application(p_establishment_id => $1, p_student_first_name => 'A', p_student_last_name => 'B', p_parent_name => 'C', p_parent_phone => '699', tracking_code => 'E237-FORCED')",
      [a.establishmentId]
    )),
    /function .* does not exist/i
  );
});

// ============================================================================
// FORGERY REGRESSION TESTS (HOTFIX-APPLICATIONS-01.1) — reproduce the exact
// live production vulnerability found during the read-only gate: before this
// migration, `applications_public_insert` (anon+authenticated, WITH CHECK
// (true)) plus a direct anon INSERT grant let an anonymous client forge
// parent_id (impersonating any real user) or choose their own tracking_code
// via a raw REST insert. These tests prove that path is now closed —
// dropping the permissive policy and revoking the table grant means RLS
// denies the write outright, regardless of which columns are targeted.
// ============================================================================
test("forgery — anon direct insert attempting to forge parent_id is denied", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const a = await seedSchool();
  const victimId = a.owner;
  await assert.rejects(
    () => asUser(null, (c) => c.query(
      "insert into public.applications (establishment_id, parent_id, parent_name, parent_phone) values ($1,$2,'Forged','699000000')",
      [a.establishmentId, victimId]
    )),
    /permission denied/i
  );
});

test("forgery — anon direct insert attempting to choose tracking_code is denied", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const a = await seedSchool();
  await assert.rejects(
    () => asUser(null, (c) => c.query(
      "insert into public.applications (establishment_id, tracking_code, parent_name, parent_phone) values ($1,'E237-CHOSEN','Forged','699000000')",
      [a.establishmentId]
    )),
    /permission denied/i
  );
});

test("forgery — the RPC has no parent_id parameter to inject through", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const a = await seedSchool();
  await assert.rejects(
    () => asUser(null, (c) => c.query(
      "select * from public.submit_public_application(p_establishment_id => $1, p_student_first_name => 'A', p_student_last_name => 'B', p_parent_name => 'C', p_parent_phone => '699', p_parent_id => $2)",
      [a.establishmentId, a.owner]
    )),
    /function .* does not exist/i
  );
});

test("forgery — a fully legitimate anon RPC call always produces parent_id NULL, a server-generated tracking_code, and admission_status 'submitted'", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const a = await seedSchool();
  const result = await submit(null, { p_establishment_id: a.establishmentId, p_parent_phone: "699123123" });
  const dbRow = (await adminPool.query("select parent_id, tracking_code, admission_status from public.applications where id=$1", [result.rows[0].id])).rows[0];
  assert.equal(dbRow.parent_id, null);
  assert.equal(dbRow.tracking_code, result.rows[0].tracking_code);
  assert.match(dbRow.tracking_code, /^E237-/, "server-generated by the canonical trigger, never client-supplied");
  assert.equal(dbRow.admission_status, "submitted");
});

test("ACL introspection — anon has zero privileges of any kind on public.applications, including MAINTAIN", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const privileges = ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER", "MAINTAIN"];
  for (const privilege of privileges) {
    const result = await adminPool.query("select has_table_privilege($1, 'public.applications', $2) as has", [APP_ROLE, privilege]);
    assert.equal(result.rows[0].has, false, `anon must not have ${privilege} on applications`);
  }
  const policyCount = await adminPool.query(
    "select count(*)::int as n from pg_policies where schemaname='public' and tablename='applications' and cmd='INSERT'"
  );
  assert.equal(policyCount.rows[0].n, 0, "no INSERT policy should remain on applications — the RPC (table owner, RLS-exempt) is the only writer");
});

// ============================================================================
// 11. Duplicate retry behavior
// ============================================================================
test("real Postgres — a duplicate retry (double submit) produces two distinct, valid rows, no crash (documented: no idempotency key exists)", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const a = await seedSchool();
  const params = { p_establishment_id: a.establishmentId, p_parent_phone: "699444444" };
  const first = await submit(null, params);
  const second = await submit(null, params);
  assert.notEqual(first.rows[0].id, second.rows[0].id);
  assert.notEqual(first.rows[0].tracking_code, second.rows[0].tracking_code);
});

// ============================================================================
// 12-15. Owner/teacher/unrelated authenticated user read scoping
// ============================================================================
test("real Postgres — Owner A can read their own establishment's applications", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const a = await seedSchool();
  const result = await submit(null, { p_establishment_id: a.establishmentId });
  const asOwner = await asAuthUser(a.owner, (c) => c.query("select id from public.applications where id=$1", [result.rows[0].id]));
  assert.equal(asOwner.rows.length, 1);
});

test("real Postgres — Owner B cannot read School A's applications", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const a = await seedSchool();
  const b = await seedSchool();
  const result = await submit(null, { p_establishment_id: a.establishmentId });
  const asOwnerB = await asAuthUser(b.owner, (c) => c.query("select id from public.applications where id=$1", [result.rows[0].id]));
  assert.equal(asOwnerB.rows.length, 0);
});

test("real Postgres — an unrelated authenticated user (no establishment) cannot read the application", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const a = await seedSchool();
  const result = await submit(null, { p_establishment_id: a.establishmentId });
  const strangerId = newId();
  await adminPool.query("insert into auth.users (id) values ($1)", [strangerId]);
  const asStranger = await asAuthUser(strangerId, (c) => c.query("select id from public.applications where id=$1", [result.rows[0].id]));
  assert.equal(asStranger.rows.length, 0);
});

test("real Postgres — an authenticated user can still legitimately submit through the same public RPC", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const a = await seedSchool();
  const someUserId = newId();
  await adminPool.query("insert into auth.users (id) values ($1)", [someUserId]);
  await adminPool.query("insert into public.profiles (id) values ($1)", [someUserId]); // applications.parent_id references profiles(id)
  const result = await asAuthUser(someUserId, (c) =>
    c.query(
      `select * from public.submit_public_application(
        p_establishment_id => $1, p_student_first_name => 'Jean', p_student_last_name => 'Mbarga',
        p_parent_name => 'Marie Mbarga', p_parent_phone => '699000000'
      )`,
      [a.establishmentId]
    )
  );
  assert.equal(result.rows.length, 1);
  const dbRow = (await adminPool.query("select parent_id from public.applications where id=$1", [result.rows[0].id])).rows[0];
  assert.equal(dbRow.parent_id, someUserId, "an authenticated caller's own submission is correctly attributed to them");
});

// ============================================================================
// 16. Tracking code uniqueness
// ============================================================================
test("real Postgres — tracking codes are unique across many rapid submissions", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const a = await seedSchool();
  const codes = new Set();
  for (let i = 0; i < 8; i++) {
    const result = await submit(null, { p_establishment_id: a.establishmentId, p_parent_phone: `69955500${i}` });
    codes.add(result.rows[0].tracking_code);
  }
  assert.equal(codes.size, 8);
});

// ============================================================================
// 17-18. Server-controlled status + correct establishment association
// (re-verified explicitly, distinct from test 6, across multiple schools)
// ============================================================================
test("real Postgres — every submission is inserted with the correct server-controlled status and establishment, regardless of which school", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const a = await seedSchool();
  const b = await seedSchool();
  const resultA = await submit(null, { p_establishment_id: a.establishmentId, p_parent_phone: "699666001" });
  const resultB = await submit(null, { p_establishment_id: b.establishmentId, p_parent_phone: "699666002" });
  const rowA = (await adminPool.query("select establishment_id, admission_status, status from public.applications where id=$1", [resultA.rows[0].id])).rows[0];
  const rowB = (await adminPool.query("select establishment_id, admission_status, status from public.applications where id=$1", [resultB.rows[0].id])).rows[0];
  assert.equal(rowA.establishment_id, a.establishmentId);
  assert.equal(rowB.establishment_id, b.establishmentId);
  assert.equal(rowA.admission_status, "submitted");
  assert.equal(rowB.admission_status, "submitted");
  assert.equal(rowA.status, "pending", "legacy status column stays in sync via the existing sync_legacy_application_status trigger (0012)");
});

// ============================================================================
// Pre-existing rate-limit trigger (0007) still fires correctly through the RPC
// ============================================================================
test("real Postgres — the existing per-phone rate-limit trigger (0007) still fires through the new RPC, with the exact message the frontend expects", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const a = await seedSchool();
  const phone = "699777777";
  await submit(null, { p_establishment_id: a.establishmentId, p_parent_phone: phone });
  await submit(null, { p_establishment_id: a.establishmentId, p_parent_phone: phone });
  await submit(null, { p_establishment_id: a.establishmentId, p_parent_phone: phone });
  await assert.rejects(
    () => submit(null, { p_establishment_id: a.establishmentId, p_parent_phone: phone }),
    /Trop de préinscriptions/
  );
});

// ============================================================================
// Privacy sentinel — no path from anon back to another submitter's data
// ============================================================================
test("real Postgres — anon cannot enumerate or read any application's tracking_code, phone, or message via any surface this RPC exposes", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const a = await seedSchool();
  await submit(null, { p_establishment_id: a.establishmentId, p_parent_phone: "699888888", p_message: "OTHER_SUBMITTER_PRIVATE_NOTE" });
  await assert.rejects(() => asUser(null, (c) => c.query("select * from public.applications")), /permission denied/i);
});
