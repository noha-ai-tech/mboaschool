import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath =
  "docs/pro/PRO-05_2_ADMISSION_TRACKING_HARDENING_PROPOSED.sql";
const rollbackPath =
  "docs/pro/PRO-05_2_ADMISSION_TRACKING_HARDENING_ROLLBACK.sql";
const auditPath = "docs/pro/PRO-05_2_ADMISSION_TRACKING_ORACLE_AUDIT.md";

async function text(path) {
  return readFile(path, "utf8");
}

function extractHardenedFunction(sql) {
  const match = sql.match(
    /create or replace function public\.get_admission_by_tracking\([\s\S]*?as \$function\$([\s\S]*?)\$function\$;/i,
  );
  assert.ok(match, "hardened function body must exist");
  return match[1];
}

class RateLimitModel {
  constructor() {
    this.global = { startedAt: -Infinity, count: 0 };
    this.codes = new Map();
  }

  attempt(code, nowMs) {
    if (nowMs - this.global.startedAt >= 60_000) {
      this.global = { startedAt: nowMs, count: 0 };
    }
    this.global.count += 1;
    if (this.global.count > 300) return false;

    const current = this.codes.get(code);
    const bucket =
      !current || nowMs - current.startedAt >= 15 * 60_000
        ? { startedAt: nowMs, count: 0 }
        : current;
    bucket.count += 1;
    this.codes.set(code, bucket);
    return bucket.count <= 10;
  }
}

test("PRO-05.2 migration is transactional, state-gated and replay-safe", async () => {
  const sql = await text(migrationPath);

  assert.match(sql, /^-- PRO-05\.2[\s\S]*?\nbegin;/i);
  assert.match(sql, /set local lock_timeout = '5s'/i);
  assert.match(sql, /set local statement_timeout = '2min'/i);
  assert.match(sql, /PRO05_2_PREFLIGHT_STATE_DRIFT/);
  assert.match(sql, /PRO05_2_PREFLIGHT_EXISTING_TRACKING_INPUT_DRIFT/);
  assert.match(sql, /v_initial = v_final/);
  assert.match(sql, /to_regclass\('private\.admission_tracking_rate_limits'\) is null/);
  assert.match(sql, /to_regclass\('private\.admission_tracking_rate_limits'\) is not null/);
  assert.match(sql, /create table if not exists private\.admission_tracking_rate_limits/i);
  assert.match(sql, /create index if not exists admission_tracking_rate_limits_updated_at_idx/i);
  assert.match(sql, /commit;\s*$/i);
});

test("tracking index preflight handles indkey [0:0] versus ARRAY [1:1] bounds", async () => {
  const sql = await text(migrationPath);

  assert.match(sql, /i\.indnkeyatts = 1/);
  assert.match(sql, /i\.indnatts = 1/);
  assert.match(sql, /i\.indkey\[0\] = a\.attnum/);
  assert.doesNotMatch(
    sql,
    /i\.indkey::smallint\[\]\s*=\s*array\[a\.attnum::smallint\]/i,
    "an indkey array with bounds [0:0] must not be compared with an ARRAY constructor using [1:1]",
  );
});

test("function keeps the public result contract with an empty search_path", async () => {
  const sql = await text(migrationPath);
  const body = extractHardenedFunction(sql);
  const preflight = sql.slice(
    sql.indexOf("do $pro05_2_preflight$"),
    sql.indexOf("create table if not exists private.admission_tracking_rate_limits"),
  );
  const postcheck = sql.slice(sql.indexOf("do $pro05_2_postcheck$"));

  assert.match(
    sql,
    /get_admission_by_tracking\(\s*p_tracking_code text,\s*p_phone text\s*\)[\s\S]*?returns table \(\s*establishment_name text,\s*student_name text,\s*desired_level text,\s*submitted_at timestamptz,\s*status public\.admission_status,\s*parent_message text\s*\)/i,
  );
  assert.match(sql, /language plpgsql\s+volatile\s+security definer\s+set search_path = ''/i);
  assert.match(
    preflight,
    /l\.lanname = 'plpgsql'\s+and p\.provolatile = 'v'/i,
    "the replay preflight must accept the final function only as VOLATILE",
  );
  assert.match(
    postcheck,
    /l\.lanname = 'plpgsql'[\s\S]*?and p\.provolatile = 'v'/i,
    "the post-check must reject a final function that is not VOLATILE",
  );
  assert.match(body, /from public\.applications a/i);
  assert.match(body, /join public\.establishments e/i);
  assert.match(body, /private\.admission_tracking_rate_limits/);
  assert.match(body, /pg_catalog\.sha256/);
  assert.doesNotMatch(body, /\braise\s+exception\b/i);
});

test("rate-limit storage is private, hashed, RLS deny-all and client inaccessible", async () => {
  const sql = await text(migrationPath);
  const tableDefinition = sql.match(
    /create table if not exists private\.admission_tracking_rate_limits \(([\s\S]*?)\n\);/i,
  )?.[1];

  assert.ok(tableDefinition);
  assert.match(tableDefinition, /scope text not null/);
  assert.match(tableDefinition, /subject_hash bytea not null/);
  assert.match(tableDefinition, /primary key \(scope, subject_hash\)/i);
  assert.doesNotMatch(
    tableDefinition,
    /^\s*(tracking_code|phone|ip_address)\s+/im,
  );
  assert.match(sql, /alter table private\.admission_tracking_rate_limits enable row level security/i);
  assert.match(
    sql,
    /revoke all privileges on table private\.admission_tracking_rate_limits\s+from public, anon, authenticated, service_role/i,
  );
  assert.doesNotMatch(
    sql,
    /grant\s+[^;]+on table private\.admission_tracking_rate_limits/i,
  );
  assert.match(sql, /PRO05_2_POSTCHECK_RATE_TABLE_ACL_FAILED/);
});

test("function ACL exposes only the roles required by the existing browser flow", async () => {
  const sql = await text(migrationPath);
  const aclSection = sql.slice(
    sql.indexOf("revoke all privileges on function public.get_admission_by_tracking"),
    sql.indexOf("do $pro05_2_postcheck$"),
  );

  assert.match(aclSection, /from public, anon, authenticated, service_role/i);
  assert.match(aclSection, /grant execute[\s\S]*?to anon, authenticated/i);
  assert.doesNotMatch(aclSection, /grant execute[\s\S]*?to (?:public|service_role)/i);
});

test("direct function ACL gates cover initial, final, rollback and drift", async () => {
  const [sql, rollback] = await Promise.all([
    text(migrationPath),
    text(rollbackPath),
  ]);
  const preflight = sql.slice(
    sql.indexOf("do $pro05_2_preflight$"),
    sql.indexOf("create table if not exists private.admission_tracking_rate_limits"),
  );
  const postcheck = sql.slice(sql.indexOf("do $pro05_2_postcheck$"));
  const rollbackPreflight = rollback.slice(
    rollback.indexOf("do $pro05_2_rollback_preflight$"),
    rollback.indexOf("create or replace function public.get_admission_by_tracking"),
  );
  const rollbackPostcheck = rollback.slice(
    rollback.indexOf("do $pro05_2_rollback_postcheck$"),
  );
  const initialAcl = /array\[\s*'anon',\s*'authenticated',\s*'postgres',\s*'service_role'\s*\]::text\[\]/i;
  const finalAcl = /array\[\s*'anon',\s*'authenticated',\s*'postgres'\s*\]::text\[\]/i;

  assert.match(preflight, /cross join lateral aclexplode/i);
  assert.match(preflight, /not acl\.is_grantable/i);
  assert.match(preflight, /pg_get_userbyid\(acl\.grantor\) = 'postgres'/i);
  assert.match(preflight, initialAcl);
  assert.match(preflight, finalAcl);
  assert.match(postcheck, finalAcl);
  assert.match(rollbackPreflight, finalAcl);
  assert.match(rollbackPostcheck, initialAcl);

  assert.match(sql, /PRO05_2_PREFLIGHT_STATE_DRIFT/);
  assert.match(sql, /PRO05_2_POSTCHECK_FUNCTION_ACL_FAILED/);
  assert.match(rollback, /PRO05_2_ROLLBACK_FUNCTION_ACL_DRIFT/);
  assert.match(rollback, /PRO05_2_ROLLBACK_POSTCHECK_ACL_FAILED/);

  const rollbackAcl = rollback.slice(
    rollback.indexOf("revoke all privileges on function public.get_admission_by_tracking"),
    rollback.indexOf("drop table private.admission_tracking_rate_limits"),
  );
  assert.match(rollbackAcl, /to anon, authenticated, service_role/i);
  assert.doesNotMatch(rollbackAcl, /grant execute[\s\S]*?to public/i);

  const matchesDirectAcl = (entries, expectedGrantees) =>
    entries.every(
      ({ grantor, privilege, grantable }) =>
        grantor === "postgres" && privilege === "EXECUTE" && !grantable,
    ) &&
    JSON.stringify(entries.map(({ grantee }) => grantee).sort()) ===
      JSON.stringify([...expectedGrantees].sort());
  const initialEntries = ["anon", "authenticated", "postgres", "service_role"].map(
    (grantee) => ({ grantee, grantor: "postgres", privilege: "EXECUTE", grantable: false }),
  );
  const finalEntries = initialEntries.filter(({ grantee }) => grantee !== "service_role");

  assert.equal(matchesDirectAcl(initialEntries, ["anon", "authenticated", "postgres", "service_role"]), true);
  assert.equal(matchesDirectAcl(finalEntries, ["anon", "authenticated", "postgres"]), true);
  assert.equal(matchesDirectAcl([...finalEntries, { grantee: "PUBLIC", grantor: "postgres", privilege: "EXECUTE", grantable: false }], ["anon", "authenticated", "postgres"]), false);
  assert.equal(matchesDirectAcl(finalEntries.map((entry, index) => index === 0 ? { ...entry, grantable: true } : entry), ["anon", "authenticated", "postgres"]), false);
  assert.equal(matchesDirectAcl(finalEntries.map((entry, index) => index === 0 ? { ...entry, grantor: "other_role" } : entry), ["anon", "authenticated", "postgres"]), false);
});

test("global and per-code counters are atomic and bound different-key bypass", async () => {
  const sql = await text(migrationPath);
  const body = extractHardenedFunction(sql);

  assert.match(body, /c_global_limit constant integer := 300/);
  assert.match(body, /c_global_window constant interval := interval '1 minute'/);
  assert.match(body, /c_tracking_limit constant integer := 10/);
  assert.match(body, /c_tracking_window constant interval := interval '15 minutes'/);
  assert.equal((body.match(/on conflict \(scope, subject_hash\) do update/gi) ?? []).length, 2);
  assert.equal((body.match(/else rate\.attempt_count \+ 1/gi) ?? []).length, 2);
  assert.match(body, /returning attempt_count into v_global_count/i);
  assert.match(body, /returning attempt_count into v_tracking_count/i);
  assert.match(body, /if v_global_count > c_global_limit then\s+return;/i);
  assert.match(body, /if v_tracking_count > c_tracking_limit then\s+return;/i);

  const perCode = new RateLimitModel();
  assert.equal(
    Array.from({ length: 10 }, () => perCode.attempt("E237-ABC234", 0)).every(Boolean),
    true,
  );
  assert.equal(perCode.attempt("E237-ABC234", 0), false);
  assert.equal(perCode.attempt("E237-ABC234", 15 * 60_000), true);

  const global = new RateLimitModel();
  const decisions = Array.from({ length: 301 }, (_, index) =>
    global.attempt(`E237-${String(index).padStart(6, "2")}`, 0),
  );
  assert.equal(decisions.filter(Boolean).length, 300);
  assert.equal(decisions.at(-1), false);
});

test("enumeration failures have one empty result path and never expose counters", async () => {
  const sql = await text(migrationPath);
  const body = extractHardenedFunction(sql);

  assert.match(body, /v_code !~ '\^E237-\[A-HJ-NP-Z2-9\]\{6\}\$'[\s\S]*?return;/i);
  assert.match(body, /a\.tracking_code = v_code\s+and a\.parent_phone = p_phone/i);
  assert.doesNotMatch(body, /\braise\s+exception\b/i);
  const publicProjection = body.match(
    /return query\s+select([\s\S]*?)from public\.applications/i,
  )?.[1];
  assert.ok(publicProjection);
  assert.doesNotMatch(
    publicProjection,
    /tracking_code|parent_phone|parent_email|notes/i,
  );
  assert.match(sql, /PRO05_2_POSTCHECK_WRONG_PHONE_ORACLE_FAILED/);
  assert.match(sql, /PRO05_2_POSTCHECK_TRACKING_RATE_LIMIT_FAILED/);
  assert.match(sql, /PRO05_2_ANON_TEST_ROLLBACK/);
  assert.match(sql, /PRO05_2_AUTH_TEST_ROLLBACK/);
});

test("migration does not alter admission business rows, policies or public insert", async () => {
  const sql = await text(migrationPath);

  assert.doesNotMatch(sql, /\b(update|insert into|delete from|truncate)\s+public\.(applications|establishments|admissions_history)\b/i);
  assert.doesNotMatch(sql, /\b(create|alter|drop)\s+policy\b/i);
  assert.doesNotMatch(sql, /applications_public_insert/i);
  assert.doesNotMatch(sql, /official_id|source_ministry|source_reference|registry_import_batch|is_verified|forfait|subscription_plan/i);
});

test("rollback is exact-final-state gated and restores the original oracle", async () => {
  const rollback = await text(rollbackPath);

  assert.match(rollback, /^-- PRO-05\.2[\s\S]*?\nbegin;/i);
  assert.match(rollback, /PRO05_2_ROLLBACK_FUNCTION_DRIFT/);
  assert.match(rollback, /PRO05_2_ROLLBACK_FUNCTION_ACL_DRIFT/);
  assert.match(rollback, /PRO05_2_ROLLBACK_TABLE_ACL_OR_POLICY_DRIFT/);
  assert.match(rollback, /language sql\s+stable\s+security definer\s+set search_path = public/i);
  assert.match(rollback, /a\.tracking_code = upper\(trim\(p_tracking_code\)\)/i);
  assert.match(rollback, /a\.parent_phone = p_phone/i);
  assert.match(rollback, /to anon, authenticated, service_role/i);
  assert.doesNotMatch(rollback, /grant execute[\s\S]*?to public/i);
  assert.match(rollback, /drop table private\.admission_tracking_rate_limits restrict/i);
  assert.match(rollback, /commit;\s*$/i);
});

test("application keeps public tracking but removes the code from every URL", async () => {
  const [trackingPage, preRegistration] = await Promise.all([
    text("src/app/suivi-admission/page.tsx"),
    text("src/app/preinscription/page.tsx"),
  ]);

  assert.match(trackingPage, /supabase\.rpc\("get_admission_by_tracking"/);
  assert.match(trackingPage, /error \|\| !row/);
  assert.match(trackingPage, /TRACKING_CODE_PATTERN/);
  assert.match(trackingPage, /maxLength=\{11\}/);
  assert.match(trackingPage, /maxLength=\{64\}/);
  assert.match(trackingPage, /sessionStorage\.removeItem\(STAGED_TRACKING_CODE_KEY\)/);
  assert.match(trackingPage, /admission-tracking-code:v1/);
  assert.match(trackingPage, /try \{[\s\S]*?sessionStorage\.getItem/);
  assert.doesNotMatch(trackingPage, /useSearchParams|searchParams\.get\("code"\)/);
  assert.match(preRegistration, /href="\/suivi-admission"/);
  assert.match(preRegistration, /sessionStorage\.setItem/);
  assert.match(preRegistration, /admission-tracking-code:v1/);
  assert.match(preRegistration, /try \{[\s\S]*?sessionStorage\.setItem/);
  assert.doesNotMatch(preRegistration, /suivi-admission\?code=/);
});

test("audit documents consumers, residual risks and the non-execution gate", async () => {
  const audit = await text(auditPath);

  for (const marker of [
    "src/app/suivi-admission/page.tsx",
    "src/app/preinscription/page.tsx",
    "SECURITY DEFINER",
    "search_path=''",
    "300",
    "10/15 minutes",
    "denial of service",
    "service_role",
    "MIGRATION EXECUTED: **NO**",
    "DATABASE WRITES: **0**",
  ]) {
    assert.match(audit, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  }
});
