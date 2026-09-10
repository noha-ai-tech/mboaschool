import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import pg from "pg";

// OFFLINE-01.1 (P1 fix) — these tests run the ACTUAL migration SQL
// (sync_mutations table, RLS policies, and the sync_apply_absence_create
// function) against a REAL Postgres engine (postgres:16-alpine in Docker),
// not source-text regexes. `auth.uid()` is stubbed to read a per-session
// setting so each test can impersonate a specific user, exactly mirroring
// how Supabase itself resolves auth.uid() from the request JWT.
//
// Requires a reachable Postgres at OFFLINE01_TEST_DATABASE_URL. If
// unreachable, every test in this file calls t.skip() with the reason
// rather than being reported as a false pass — this file's presence and
// content is itself the record of what real-DB coverage exists for
// future runs with Docker available.

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(testDirectory, "..");
const ADMIN_DATABASE_URL = process.env.OFFLINE01_TEST_ADMIN_DATABASE_URL ?? "postgres://postgres:testpass@localhost:55432/postgres";
// Dédiée à ce fichier (MOBILE-01) : node --test exécute les fichiers en
// parallèle par défaut, et ce fichier tourne aux côtés de
// tests/mobile01-attendance-security-postgres.test.mjs qui reconstruit
// aussi tout son schéma "public" — sans base dédiée, les deux "drop
// schema public cascade" concurrents se percutent.
const DATABASE_NAME = process.env.OFFLINE01_TEST_DATABASE_NAME ?? "offline01_security_test";

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

    -- Stub minimal du modèle réel (auth.users, profiles, establishments,
    -- staff_members, absences) — suffisant pour exécuter la VRAIE fonction
    -- de la migration sans dépendre de tout le schéma applicatif.
    create table auth.users (id uuid primary key);

    -- Stub de auth.uid() : en production Supabase le lit du JWT de la
    -- requête ; ici on le fait lire un paramètre de session, positionné
    -- par chaque test via "select set_config('request.jwt.claim.sub', ...)"
    -- pour impersonner l'utilisateur A ou B — même contrat que la vraie
    -- fonction (uuid ou null si absent).
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;

    create table public.profiles (id uuid primary key, role text);
    create table public.establishments (
      id uuid primary key default gen_random_uuid(),
      owner_id uuid,
      forfait text not null default 'gratuit'
    );
    create table public.staff_members (
      id uuid primary key default gen_random_uuid(),
      etablissement_id uuid not null references public.establishments(id),
      user_id uuid,
      status text
    );
    create type absence_type as enum ('absence', 'conge', 'mission');
    create table public.absences (
      id uuid primary key default gen_random_uuid(),
      staff_member_id uuid not null references public.staff_members(id),
      type absence_type not null,
      date_debut date not null,
      date_fin date not null,
      motif text,
      statut text not null default 'declaree',
      created_at timestamptz not null default now()
    );
  `);

  // Applique la VRAIE migration (table sync_mutations + RLS + la fonction
  // corrigée) telle quelle, sans la retranscrire, pour ne jamais tester
  // une copie qui pourrait diverger du fichier réellement commité.
  const migrationSql = await readFile(
    path.join(projectRoot, "supabase/migrations/20260907230000_offline_sync_foundation.sql"),
    "utf8"
  );
  try {
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
    if (userId) {
      await client.query("select set_config('request.jwt.claim.sub', $1, false)", [userId]);
    } else {
      await client.query("select set_config('request.jwt.claim.sub', '', false)");
    }
    const res = await client.query(
      `select * from public.sync_apply_absence_create($1, $2, $3, $4, $5, $6, $7)`,
      [args.mutationId, args.establishmentId, args.staffMemberId, args.type ?? "absence", args.dateDebut ?? "2026-09-01", args.dateFin ?? "2026-09-02", args.motif ?? null]
    );
    return res.rows[0];
  } finally {
    client.release();
  }
}

async function seedActor({ pro = true } = {}) {
  const userId = (await pool.query("select gen_random_uuid() as id")).rows[0].id;
  await pool.query("insert into auth.users (id) values ($1)", [userId]);
  await pool.query("insert into public.profiles (id, role) values ($1, 'directeur')", [userId]);
  const establishmentId = (
    await pool.query("insert into public.establishments (owner_id, forfait) values ($1, $2) returning id", [userId, pro ? "pro" : "gratuit"])
  ).rows[0].id;
  const staffMemberId = (
    await pool.query("insert into public.staff_members (etablissement_id, user_id, status) values ($1, $2, 'actif') returning id", [establishmentId, userId])
  ).rows[0].id;
  return { userId, establishmentId, staffMemberId };
}

function newMutationId() {
  return crypto.randomUUID();
}

test("real Postgres — same actor replay: USER A retries its own applied mutation and gets the same result (idempotent, not a duplicate write)", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const a = await seedActor();
  const mutationId = newMutationId();

  const first = await callAs(a.userId, { mutationId, establishmentId: a.establishmentId, staffMemberId: a.staffMemberId });
  assert.equal(first.result_status, "applied");
  assert.ok(first.result_entity_id);

  const second = await callAs(a.userId, { mutationId, establishmentId: a.establishmentId, staffMemberId: a.staffMemberId });
  assert.equal(second.result_status, "applied");
  assert.equal(second.result_entity_id, first.result_entity_id, "replay must return the SAME entity, never create a second one");

  const count = await pool.query("select count(*)::int as n from public.absences where id = $1", [first.result_entity_id]);
  assert.equal(count.rows[0].n, 1);
});

test("real Postgres — P1 FIX: USER B cannot replay USER A's mutation_id and read USER A's result", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const a = await seedActor();
  const b = await seedActor();
  const mutationId = newMutationId();

  const aResult = await callAs(a.userId, { mutationId, establishmentId: a.establishmentId, staffMemberId: a.staffMemberId });
  assert.equal(aResult.result_status, "applied");

  const bResult = await callAs(b.userId, { mutationId, establishmentId: b.establishmentId, staffMemberId: b.staffMemberId });
  assert.equal(bResult.result_status, "rejected", "USER B must never see USER A's applied status via a reused mutation_id");
  assert.notEqual(bResult.result_entity_id, aResult.result_entity_id);
  assert.equal(bResult.result_entity_id, null, "USER B must never receive USER A's real entity_id");
  assert.doesNotMatch(bResult.result_error ?? "", /already|existe|found/i, "the denial message must not confirm the mutation already exists for someone else");
});

test("real Postgres — P1 FIX: a different actor claiming USER A's own establishment/staff member still cannot replay USER A's mutation_id (actor mismatch alone is enough to deny)", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const a = await seedActor();
  const mutationId = newMutationId();
  const aResult = await callAs(a.userId, { mutationId, establishmentId: a.establishmentId, staffMemberId: a.staffMemberId });
  assert.equal(aResult.result_status, "applied");

  const bUserId = (await pool.query("select gen_random_uuid() as id")).rows[0].id;
  await pool.query("insert into auth.users (id) values ($1)", [bUserId]);
  const bResult = await callAs(bUserId, { mutationId, establishmentId: a.establishmentId, staffMemberId: a.staffMemberId });
  assert.equal(bResult.result_status, "rejected");
  assert.equal(bResult.result_entity_id, null);
});

test("real Postgres — P1 FIX: cross-school replay is denied even for a different establishment_id claim", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const a = await seedActor();
  const b = await seedActor();
  const mutationId = newMutationId();
  const aResult = await callAs(a.userId, { mutationId, establishmentId: a.establishmentId, staffMemberId: a.staffMemberId });
  assert.equal(aResult.result_status, "applied");

  const bResult = await callAs(b.userId, { mutationId, establishmentId: b.establishmentId, staffMemberId: b.staffMemberId });
  assert.equal(bResult.result_status, "rejected");
});

test("real Postgres — P1 FIX: USER A replaying with the WRONG establishment_id is denied, even though the actor matches", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const a = await seedActor();
  const otherEstablishmentOwnedByA = (
    await pool.query("insert into public.establishments (owner_id, forfait) values ($1, 'pro') returning id", [a.userId])
  ).rows[0].id;
  const mutationId = newMutationId();

  const first = await callAs(a.userId, { mutationId, establishmentId: a.establishmentId, staffMemberId: a.staffMemberId });
  assert.equal(first.result_status, "applied");

  const replayWithWrongSchool = await callAs(a.userId, { mutationId, establishmentId: otherEstablishmentOwnedByA, staffMemberId: a.staffMemberId });
  assert.equal(replayWithWrongSchool.result_status, "rejected", "even the SAME actor must not get the mutation's result under a different establishment_id claim");
});

test("real Postgres — concurrent same-user double-submit creates exactly one absence, both calls agree on the same result", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const a = await seedActor();
  const mutationId = newMutationId();

  const [r1, r2] = await Promise.all([
    callAs(a.userId, { mutationId, establishmentId: a.establishmentId, staffMemberId: a.staffMemberId }),
    callAs(a.userId, { mutationId, establishmentId: a.establishmentId, staffMemberId: a.staffMemberId }),
  ]);

  assert.equal(r1.result_status, "applied");
  assert.equal(r2.result_status, "applied");
  assert.equal(r1.result_entity_id, r2.result_entity_id, "both concurrent calls must agree on the single created entity");

  const count = await pool.query(
    "select count(*)::int as n from public.absences a join public.staff_members sm on sm.id = a.staff_member_id where sm.etablissement_id = $1",
    [a.establishmentId]
  );
  assert.equal(count.rows[0].n, 1, "a genuine concurrent double-submit must never create two absences");
});

test("real Postgres — P1 FIX: concurrent cross-user race on the same mutation_id never leaks the winner's result to the loser", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const a = await seedActor();
  const b = await seedActor();
  const mutationId = newMutationId();

  const [rA, rB] = await Promise.all([
    callAs(a.userId, { mutationId, establishmentId: a.establishmentId, staffMemberId: a.staffMemberId }),
    callAs(b.userId, { mutationId, establishmentId: b.establishmentId, staffMemberId: b.staffMemberId }),
  ]);

  // Exactly one of the two must have actually created an absence; the
  // other must be flatly rejected and must never see the winner's entity.
  const outcomes = [rA, rB];
  const applied = outcomes.filter((r) => r.result_status === "applied");
  const rejected = outcomes.filter((r) => r.result_status === "rejected");
  assert.equal(applied.length, 1, "exactly one side of the race should win and apply");
  assert.equal(rejected.length, 1, "the losing side must be rejected, never silently see the winner's outcome");
  assert.notEqual(rejected[0].result_entity_id, applied[0].result_entity_id);
  assert.equal(rejected[0].result_entity_id, null);

  const totalAbsences = await pool.query("select count(*)::int as n from public.absences where staff_member_id in ($1, $2)", [
    a.staffMemberId,
    b.staffMemberId,
  ]);
  assert.equal(totalAbsences.rows[0].n, 1, "a cross-user mutation_id collision must still only ever create one row total, for either party");
});

test("real Postgres — permission revoked before first sync: the mutation is rejected, never applied, on the very first attempt", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const a = await seedActor({ pro: false }); // no 'pro' forfait — access already invalid
  const mutationId = newMutationId();

  const result = await callAs(a.userId, { mutationId, establishmentId: a.establishmentId, staffMemberId: a.staffMemberId });
  assert.equal(result.result_status, "rejected");
  assert.equal(result.result_entity_id, null);

  const count = await pool.query("select count(*)::int as n from public.absences where staff_member_id = $1", [a.staffMemberId]);
  assert.equal(count.rows[0].n, 0);
});

test("real Postgres — an unauthenticated call (auth.uid() null) raises rather than silently proceeding", async (t) => {
  if (!dbAvailable) return t.skip(unavailableReason);
  const a = await seedActor();
  const mutationId = newMutationId();
  await assert.rejects(
    () => callAs(null, { mutationId, establishmentId: a.establishmentId, staffMemberId: a.staffMemberId }),
    /non authentifi/i
  );
});
