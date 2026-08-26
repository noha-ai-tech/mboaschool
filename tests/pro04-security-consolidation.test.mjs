import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pairs = [
  {
    wave: "B",
    count: 12,
    source: "docs/pro/PRO-03_WAVE_B_PROPOSED.sql",
    migration: "supabase/migrations/20260822155238_pro_03_wave_b_rls_consolidation.sql",
  },
  {
    wave: "C",
    count: 11,
    source: "docs/pro/PRO-03_WAVE_C_PROPOSED.sql",
    migration: "supabase/migrations/20260822194239_pro_03_wave_c_rls_and_hours_consolidation.sql",
  },
  {
    wave: "D",
    count: 14,
    source: "docs/pro/PRO-03_WAVE_D_PROPOSED.sql",
    migration: "supabase/migrations/20260822194251_pro_03_wave_d_rls_consolidation.sql",
  },
  {
    wave: "gate",
    count: 0,
    source: "docs/pro/PRO-03_FINAL_DEPRECATION_PROPOSED.sql",
    migration: "supabase/migrations/20260822194302_pro_03_final_deprecation_gate_consolidation.sql",
  },
];

const consolidationHeader = [
  "-- PRO-04 — LOCAL CONSOLIDATION OF DDL ALREADY EXECUTED IN PRODUCTION",
  "-- DO NOT REPLAY ON Ecoles237. Reconcile migration history only after approval.",
];

async function text(path) {
  return (await readFile(path, "utf8")).replaceAll("\r\n", "\n");
}

function stripConsolidationHeader(sql) {
  return sql.split("\n").slice(4).join("\n");
}

const lot02InitialState = Object.freeze({
  functionCount: 1,
  signature: "public.touch_school_page_sections_updated_at()",
  owner: "postgres",
  security: "INVOKER",
  sourceMd5: "9b1889f56258bf9d6554213c05019c76",
  proconfig: null,
  acl: "postgres=X/postgres",
  publicExecute: false,
  anonExecute: false,
  authenticatedExecute: false,
  serviceRoleExecute: false,
  postgresExecute: true,
  triggerCount: 1,
  triggerName: "school_page_sections_touch_updated_at",
  triggerTable: "public.school_page_sections",
  triggerEnabled: "O",
  triggerType: 19,
  dependencyCount: 1,
});

const lot03InitialState = Object.freeze({
  functionCount: 1,
  signature: "public.protect_establishment_registry_columns()",
  owner: "postgres",
  language: "plpgsql",
  security: "DEFINER",
  volatility: "v",
  proconfig: "search_path=public",
  sourceMd5: "aa21b9b769cef6bebd5080027064d356",
  definitionMd5: "17e58602c8454c70c160e191e3c3ca9e",
  acl: [
    "=X/postgres",
    "anon=X/postgres",
    "authenticated=X/postgres",
    "postgres=X/postgres",
    "service_role=X/postgres",
  ],
  publicExecute: true,
  anonExecute: true,
  authenticatedExecute: true,
  serviceRoleExecute: true,
  postgresExecute: true,
  triggerCount: 1,
  triggerName: "establishments_protect_registry_columns",
  triggerTable: "public.establishments",
  triggerEnabled: "O",
  triggerType: 19,
  triggerDefinitionMd5: "df0b3d9ff934dfa3e8c918adf4ed6f2d",
  nonTriggerDependencyCount: 0,
});

function lot03PreflightAccepts(state) {
  const initialAcl = lot03InitialState.acl;
  const finalAcl = ["postgres=X/postgres"];
  const initial = JSON.stringify(state.acl) === JSON.stringify(initialAcl)
    && state.publicExecute
    && state.anonExecute
    && state.authenticatedExecute
    && state.serviceRoleExecute;
  const final = JSON.stringify(state.acl) === JSON.stringify(finalAcl)
    && !state.publicExecute
    && !state.anonExecute
    && !state.authenticatedExecute
    && !state.serviceRoleExecute;

  return state.functionCount === 1
    && state.signature === lot03InitialState.signature
    && state.owner === lot03InitialState.owner
    && state.language === lot03InitialState.language
    && state.security === lot03InitialState.security
    && state.volatility === lot03InitialState.volatility
    && state.proconfig === lot03InitialState.proconfig
    && state.sourceMd5 === lot03InitialState.sourceMd5
    && state.definitionMd5 === lot03InitialState.definitionMd5
    && state.postgresExecute
    && state.triggerCount === 1
    && state.triggerName === lot03InitialState.triggerName
    && state.triggerTable === lot03InitialState.triggerTable
    && state.triggerEnabled === "O"
    && state.triggerType === 19
    && state.triggerDefinitionMd5 === lot03InitialState.triggerDefinitionMd5
    && state.nonTriggerDependencyCount === 0
    && (initial || final);
}

function lot02PreflightAccepts(state) {
  return state.functionCount === 1
    && state.signature === "public.touch_school_page_sections_updated_at()"
    && state.owner === "postgres"
    && state.security === "INVOKER"
    && state.sourceMd5 === "9b1889f56258bf9d6554213c05019c76"
    && (state.proconfig === null || state.proconfig === 'search_path=""')
    && state.acl === "postgres=X/postgres"
    && state.publicExecute === false
    && state.anonExecute === false
    && state.authenticatedExecute === false
    && state.serviceRoleExecute === false
    && state.postgresExecute === true
    && state.triggerCount === 1
    && state.triggerName === "school_page_sections_touch_updated_at"
    && state.triggerTable === "public.school_page_sections"
    && state.triggerEnabled === "O"
    && state.triggerType === 19
    && state.dependencyCount === 1;
}

const lot04Targets = Object.freeze([
  ["establishment_import_staging", "arrondissement_id"],
  ["establishment_import_staging", "department_id"],
  ["establishment_import_staging", "duplicate_of_establishment_id"],
  ["establishment_import_staging", "duplicate_of_staging_id"],
  ["establishment_import_staging", "promoted_establishment_id"],
  ["establishment_import_staging", "region_id"],
  ["establishments", "arrondissement_id"],
  ["establishments", "owner_id"],
]);

function lot04PreflightAccepts(targets) {
  const presentCount = targets.filter((target) => target.namedIndexPresent).length;
  const completeState = presentCount === 0 || presentCount === lot04Targets.length;

  return completeState && targets.every((target) => (
    target.fkExact
    && target.coveringIndexCount === (target.namedIndexPresent ? 1 : 0)
    && (!target.namedIndexPresent || target.namedIndexExact)
  ));
}

for (const pair of pairs) {
  test("PRO-03 " + pair.wave + " consolidation is an exact, transactional copy", async () => {
    const [source, migration] = await Promise.all([
      text(pair.source),
      text(pair.migration),
    ]);

    assert.ok(migration.startsWith(consolidationHeader.join("\n")));
    assert.equal(stripConsolidationHeader(migration), source);
    assert.match(source, /^\s*begin\s*;/im);
    assert.match(source, /^\s*commit\s*;/im);
    assert.equal((source.match(/\bcreate policy\b/gi) ?? []).length, pair.count);
  });
}

test("corrected wave C preserves the approved function boundary", async () => {
  const sql = await text("docs/pro/PRO-03_WAVE_C_PROPOSED.sql");

  assert.match(
    sql,
    /calculer_heures_enseignant\s*\(\s*p_enseignant_id uuid,\s*p_date_debut date,\s*p_date_fin date,\s*p_etablissement_id uuid\s*\)/s,
  );
  assert.doesNotMatch(sql, /p_etablissement_id\s+uuid\s+default\s+null/i);
  assert.match(sql, /security invoker/i);
  assert.match(sql, /set search_path = ''/i);
  assert.match(
    sql,
    /grant execute on function public\.calculer_heures_enseignant\(uuid, date, date, uuid\)\s+to authenticated/i,
  );
});

test("the final gate only revokes and drops the deprecated helper", async () => {
  const sql = await text("docs/pro/PRO-03_FINAL_DEPRECATION_PROPOSED.sql");

  assert.match(sql, /revoke execute on function public\.current_establishment_id\(\)/i);
  assert.match(sql, /drop function public\.current_establishment_id\(\) restrict/i);
  assert.doesNotMatch(sql, /create\s+(or replace\s+)?function/i);
  assert.doesNotMatch(sql, /\b(create|alter|drop)\s+policy\b/i);
});

test("lot 01 closes the helper RPC only after replacing all three policies", async () => {
  const [sql, rollback] = await Promise.all([
    text("docs/pro/PRO-04_LOT_01_OWNER_POLICY_AND_HELPER_PROPOSED.sql"),
    text("docs/pro/PRO-04_LOT_01_OWNER_POLICY_AND_HELPER_ROLLBACK.sql"),
  ]);

  assert.equal((sql.match(/\bcreate policy\b/gi) ?? []).length, 3);
  assert.equal((sql.match(/\bto authenticated\b/gi) ?? []).length, 3);
  assert.equal((sql.match(/\(select auth\.uid\(\)\)/gi) ?? []).length, 5);
  assert.match(sql, /PRO04_LOT01_TARGET_DRIFT/);
  assert.match(sql, /PRO04_LOT01_NON_POLICY_DEPENDENCY/);
  assert.match(sql, /PRO04_LOT01_ABSENT_HELPER_DRIFT/);
  assert.match(sql, /PRO04_LOT01_POSTCHECK_FAILED/);
  assert.match(
    sql,
    /elsif cardinality\(v_policy_dependencies\) <> 0[\s\S]*PRO04_LOT01_ABSENT_HELPER_DRIFT/i,
  );

  const createdPolicies = sql.match(/create policy[\s\S]*?;/gi) ?? [];
  assert.equal(createdPolicies.length, 3);
  assert.equal(
    createdPolicies.every((policy) => /\bto authenticated\b/i.test(policy)),
    true,
  );
  assert.equal(
    createdPolicies.every((policy) => !/\bto public\b/i.test(policy)),
    true,
  );
  assert.equal(
    createdPolicies.every((policy) => !/\b(anon|platform_admin)\b/i.test(policy)),
    true,
  );

  assert.match(
    sql,
    /e\.id = ai_usage\.etablissement_id[\s\S]*e\.owner_id = \(select auth\.uid\(\)\)/i,
  );
  assert.match(
    sql,
    /e\.id = admissions_config\.establishment_id[\s\S]*e\.owner_id = \(select auth\.uid\(\)\)/i,
  );
  assert.match(
    sql,
    /e\.id = school_page_drafts\.establishment_id[\s\S]*e\.owner_id = \(select auth\.uid\(\)\)/i,
  );
  assert.match(sql, /revoke execute on function public\.is_own_establishment\(uuid\)/i);
  assert.match(sql, /drop function public\.is_own_establishment\(uuid\) restrict/i);
  assert.ok(
    sql.indexOf("revoke execute on function public.is_own_establishment(uuid)")
      < sql.indexOf("drop function public.is_own_establishment(uuid) restrict"),
  );
  assert.match(sql, /^\s*begin\s*;/im);
  assert.match(sql, /^\s*commit\s*;/im);

  assert.match(rollback, /security definer/i);
  assert.match(rollback, /set search_path = pg_catalog, public/i);
  assert.match(
    rollback,
    /grant execute on function public\.is_own_establishment\(uuid\)\s+to anon, authenticated, service_role/i,
  );
  assert.equal((rollback.match(/\bto public\b/gi) ?? []).length, 3);
  assert.equal(
    (rollback.match(/using \(public\.is_own_establishment\(/gi) ?? []).length,
    3,
  );
});

test("lot 02 preflight accepts the validated initial state", () => {
  assert.equal(lot02PreflightAccepts(lot02InitialState), true);
});

test("lot 02 replay accepts only the exact validated final state", () => {
  const finalState = {
    ...lot02InitialState,
    proconfig: 'search_path=""',
  };

  assert.equal(lot02PreflightAccepts(finalState), true);
  assert.equal(
    lot02PreflightAccepts({ ...finalState, proconfig: "search_path=public" }),
    false,
  );
  assert.equal(
    lot02PreflightAccepts({
      ...finalState,
      proconfig: 'search_path="",statement_timeout=0',
    }),
    false,
  );
});

test("lot 02 preflight rejects ACL drift", () => {
  assert.equal(
    lot02PreflightAccepts({
      ...lot02InitialState,
      acl: "{=X/postgres,postgres=X/postgres}",
      publicExecute: true,
    }),
    false,
  );
  assert.equal(
    lot02PreflightAccepts({
      ...lot02InitialState,
      acl: "{postgres=X/postgres,authenticated=X/postgres}",
      authenticatedExecute: true,
    }),
    false,
  );
});

test("lot 02 preflight rejects function and trigger drift", () => {
  assert.equal(
    lot02PreflightAccepts({
      ...lot02InitialState,
      sourceMd5: "00000000000000000000000000000000",
    }),
    false,
  );
  assert.equal(
    lot02PreflightAccepts({ ...lot02InitialState, security: "DEFINER" }),
    false,
  );
  assert.equal(
    lot02PreflightAccepts({ ...lot02InitialState, triggerType: 17 }),
    false,
  );
  assert.equal(
    lot02PreflightAccepts({ ...lot02InitialState, triggerCount: 2 }),
    false,
  );
});

test("lot 02 SQL implements exact preflight, replay and post-check guards", async () => {
  const sql = await text(
    "docs/pro/PRO-04_LOT_02_LOW_RISK_FUNCTION_HARDENING_PROPOSED.sql",
  );

  for (const marker of [
    "PRO04_LOT02_SIGNATURE_DRIFT",
    "PRO04_LOT02_FUNCTION_DRIFT",
    "PRO04_LOT02_STATE_DRIFT",
    "PRO04_LOT02_ACL_DRIFT",
    "PRO04_LOT02_TRIGGER_DRIFT",
    "PRO04_LOT02_DEPENDENCY_DRIFT",
    "PRO04_LOT02_POSTCHECK_SIGNATURE_FAILED",
    "PRO04_LOT02_POSTCHECK_FUNCTION_FAILED",
    "PRO04_LOT02_POSTCHECK_ACL_FAILED",
    "PRO04_LOT02_POSTCHECK_TRIGGER_FAILED",
    "PRO04_LOT02_POSTCHECK_DEPENDENCY_FAILED",
    "PRO04_LOT02_BUSINESS_ROWS_CHANGED",
  ]) {
    assert.match(sql, new RegExp(marker));
  }

  assert.match(sql, /to_regprocedure\(\s*'public\.touch_school_page_sections_updated_at\(\)'/s);
  assert.match(sql, /owner_role\.rolname = 'postgres'/);
  assert.match(sql, /not p\.prosecdef/);
  assert.match(sql, /md5\(p\.prosrc\) = '9b1889f56258bf9d6554213c05019c76'/);
  assert.match(
    sql,
    /p\.proconfig is null[\s\S]*p\.proconfig = array\['search_path=""'\]::text\[\]/,
  );
  assert.match(sql, /p\.proacl = array\['postgres=X\/postgres'\]::aclitem\[\]/);
  assert.match(sql, /trigger_row\.tgrelid = 'public\.school_page_sections'::regclass/);
  assert.match(sql, /trigger_row\.tgenabled = 'O'/);
  assert.match(sql, /trigger_row\.tgtype = 19/);
  assert.match(sql, /v_dependency_count <> 1/);
  assert.match(sql, /set_config\(\s*'pro04\.lot02\.business_row_count'/s);
  assert.match(sql, /p\.proconfig = array\['search_path=""'\]::text\[\]/);
  assert.match(sql, /md5\(pg_get_triggerdef\(trigger_row\.oid, false\)\)/);
  assert.doesNotMatch(sql, /touch_school_page_drafts_updated_at/i);
  assert.doesNotMatch(sql, /create\s+(or replace\s+)?function/i);
  assert.doesNotMatch(sql, /create\s+(or replace\s+)?trigger/i);
  assert.equal(
    (sql.match(/alter function public\.touch_school_page_sections_updated_at\(\)/gi) ?? []).length,
    1,
  );
});

test("lot 02 rollback is final-state gated and restores the exact initial state", async () => {
  const rollback = await text(
    "docs/pro/PRO-04_LOT_02_LOW_RISK_FUNCTION_HARDENING_ROLLBACK.sql",
  );

  assert.match(rollback, /PRO04_LOT02_ROLLBACK_STATE_DRIFT/);
  assert.match(rollback, /PRO04_LOT02_ROLLBACK_ACL_DRIFT/);
  assert.match(rollback, /PRO04_LOT02_ROLLBACK_TRIGGER_DRIFT/);
  assert.match(rollback, /p\.proconfig = array\['search_path=""'\]::text\[\]/);
  assert.match(
    rollback,
    /alter function public\.touch_school_page_sections_updated_at\(\)\s+reset search_path/i,
  );
  assert.match(
    rollback,
    /revoke execute on function public\.touch_school_page_sections_updated_at\(\)[\s\S]*from public, anon, authenticated, service_role/i,
  );
  assert.match(
    rollback,
    /grant execute on function public\.touch_school_page_sections_updated_at\(\)\s+to postgres/i,
  );
  assert.match(rollback, /p\.proconfig is null/);
  assert.match(rollback, /p\.proacl = array\['postgres=X\/postgres'\]::aclitem\[\]/);
  assert.match(rollback, /PRO04_LOT02_ROLLBACK_POSTCHECK_FAILED/);
  assert.match(rollback, /PRO04_LOT02_ROLLBACK_POSTCHECK_ACL_FAILED/);
  assert.match(rollback, /PRO04_LOT02_ROLLBACK_POSTCHECK_TRIGGER_FAILED/);
  assert.match(rollback, /PRO04_LOT02_ROLLBACK_BUSINESS_ROWS_CHANGED/);
  assert.doesNotMatch(rollback, /touch_school_page_drafts_updated_at/i);

  assert.ok(
    rollback.indexOf("p.proconfig = array['search_path=\"\"']::text[]")
      < rollback.indexOf("reset search_path"),
  );
  assert.ok(
    rollback.indexOf("reset search_path")
      < rollback.lastIndexOf("p.proconfig is null"),
  );
});

test("executed lot 02 migration is an exact traceable copy", async () => {
  const [source, migration] = await Promise.all([
    readFile(
      "docs/pro/PRO-04_LOT_02_LOW_RISK_FUNCTION_HARDENING_PROPOSED.sql",
    ),
    readFile(
      "supabase/migrations/20260823202851_pro_04_lot_02_low_risk_function_hardening.sql",
    ),
  ]);

  assert.deepEqual(migration, source);
  assert.equal(
    createHash("sha256").update(migration).digest("hex"),
    "5076efc88c8d6de9543f3afa6f6187c290c344b39eb00f1f7f6ecd38ea9ba6c2",
  );
});

test("lot 03 preflight accepts only the exact initial or final ACL", () => {
  assert.equal(lot03PreflightAccepts(lot03InitialState), true);
  assert.equal(lot03PreflightAccepts({
    ...lot03InitialState,
    acl: ["postgres=X/postgres"],
    publicExecute: false,
    anonExecute: false,
    authenticatedExecute: false,
    serviceRoleExecute: false,
  }), true);
  assert.equal(lot03PreflightAccepts({
    ...lot03InitialState,
    acl: ["postgres=X/postgres", "authenticated=X/postgres"],
    publicExecute: false,
    anonExecute: false,
    authenticatedExecute: true,
    serviceRoleExecute: false,
  }), false);
});

test("lot 03 preflight rejects function, trigger, and dependency drift", () => {
  for (const drift of [
    { sourceMd5: "00000000000000000000000000000000" },
    { security: "INVOKER" },
    { proconfig: 'search_path=""' },
    { triggerType: 17 },
    { triggerCount: 2 },
    { nonTriggerDependencyCount: 1 },
  ]) {
    assert.equal(lot03PreflightAccepts({ ...lot03InitialState, ...drift }), false);
  }
});

test("lot 03 changes only the included trigger-function ACL", async () => {
  const sql = await text(
    "docs/pro/PRO-04_LOT_03_LEGACY_DENY_ALL_ACL_PROPOSED.sql",
  );

  for (const marker of [
    "PRO04_LOT03_SIGNATURE_DRIFT",
    "PRO04_LOT03_FUNCTION_DRIFT",
    "PRO04_LOT03_ACL_DRIFT",
    "PRO04_LOT03_TRIGGER_DRIFT",
    "PRO04_LOT03_DEPENDENCY_DRIFT",
    "PRO04_LOT03_SCHEDULED_DEPENDENCY",
    "PRO04_LOT03_POSTCHECK_FUNCTION_FAILED",
    "PRO04_LOT03_POSTCHECK_ACL_FAILED",
    "PRO04_LOT03_POSTCHECK_TRIGGER_FAILED",
    "PRO04_LOT03_BUSINESS_ROWS_CHANGED",
  ]) {
    assert.match(sql, new RegExp(marker));
  }

  assert.match(sql, /to_regprocedure\('public\.protect_establishment_registry_columns\(\)'\)/);
  assert.match(sql, /md5\(p\.prosrc\) = 'aa21b9b769cef6bebd5080027064d356'/);
  assert.match(sql, /md5\(pg_get_functiondef\(p\.oid\)\) = '17e58602c8454c70c160e191e3c3ca9e'/);
  assert.match(sql, /md5\(pg_get_triggerdef\(t\.oid, false\)\) = 'df0b3d9ff934dfa3e8c918adf4ed6f2d'/);
  assert.match(sql, /from public, anon, authenticated, service_role/i);
  assert.match(sql, /array\['postgres=X\/postgres'\]::text\[\]/);
  assert.match(sql, /to_regclass\('cron\.job'\)/);
  assert.match(sql, /from public\.establishments/);
  assert.doesNotMatch(sql, /\b(revoke|grant)\b[\s\S]*?on table/i);
  assert.doesNotMatch(sql, /\b(insert|update|delete|truncate|merge)\b/i);
  assert.doesNotMatch(sql, /touch_school_page_drafts_updated_at/i);
  assert.doesNotMatch(sql, /PRO04_LOT03_PAYMENTS_DRIFT/);
});

test("lot 03 rollback restores only the validated initial ACL", async () => {
  const rollback = await text(
    "docs/pro/PRO-04_LOT_03_LEGACY_DENY_ALL_ACL_ROLLBACK.sql",
  );

  assert.match(rollback, /PRO04_LOT03_ROLLBACK_SIGNATURE_DRIFT/);
  assert.match(rollback, /PRO04_LOT03_ROLLBACK_FUNCTION_DRIFT/);
  assert.match(rollback, /PRO04_LOT03_ROLLBACK_ACL_DRIFT/);
  assert.match(rollback, /PRO04_LOT03_ROLLBACK_TRIGGER_DRIFT/);
  assert.match(rollback, /PRO04_LOT03_ROLLBACK_POSTCHECK_ACL_FAILED/);
  assert.match(
    rollback,
    /grant execute on function public\.protect_establishment_registry_columns\(\)[\s\S]*to public, anon, authenticated, service_role/i,
  );
  assert.match(
    rollback,
    /grant execute on function public\.protect_establishment_registry_columns\(\)[\s\S]*to postgres/i,
  );
  assert.match(rollback, /'=X\/postgres'/);
  assert.doesNotMatch(rollback, /\b(revoke|grant)\b[\s\S]*?on table/i);
  assert.doesNotMatch(rollback, /\b(insert|update|delete|truncate|merge)\b/i);
});

test("lot 03 review documents every excluded active function class", async () => {
  const review = await text("docs/pro/PRO-04_4_LOT_03_FINAL_REVIEW.md");

  for (const name of [
    "get_admission_by_tracking",
    "consume_targeted_invitation",
    "is_platform_admin",
    "is_commercial_admin",
    "log_platform_action",
    "generate_admission_tracking_code",
    "touch_school_page_drafts_updated_at",
  ]) {
    assert.match(review, new RegExp(name));
  }
  assert.match(review, /Deux alertes devraient disparaître/);
  assert.match(review, /aucune migration exécutée/i);
});

test("executed lot 03 migration is an exact traceable copy", async () => {
  const [source, migration] = await Promise.all([
    readFile(
      "docs/pro/PRO-04_LOT_03_LEGACY_DENY_ALL_ACL_PROPOSED.sql",
    ),
    readFile(
      "supabase/migrations/20260824043833_pro_04_lot_03_legacy_deny_all_acl.sql",
    ),
  ]);

  assert.deepEqual(migration, source);
  assert.equal(
    createHash("sha256").update(migration).digest("hex"),
    "c651ca9b7695bc8db8e8829bcc8154ec9705d9b02a9a69581bb386cad217786e",
  );
});

test("lot 04 preflight accepts only the complete initial or final state", () => {
  const initial = lot04Targets.map(() => ({
    fkExact: true,
    namedIndexPresent: false,
    namedIndexExact: false,
    coveringIndexCount: 0,
  }));
  const final = lot04Targets.map(() => ({
    fkExact: true,
    namedIndexPresent: true,
    namedIndexExact: true,
    coveringIndexCount: 1,
  }));

  assert.equal(lot04PreflightAccepts(initial), true);
  assert.equal(lot04PreflightAccepts(final), true);
  assert.equal(
    lot04PreflightAccepts(final.map((target, index) => (
      index === 0 ? { ...target, namedIndexPresent: false } : target
    ))),
    false,
  );
});

test("lot 04 preflight rejects FK, definition, and alternative coverage drift", () => {
  const final = lot04Targets.map(() => ({
    fkExact: true,
    namedIndexPresent: true,
    namedIndexExact: true,
    coveringIndexCount: 1,
  }));

  for (const drift of [
    { fkExact: false },
    { namedIndexExact: false },
    { coveringIndexCount: 2 },
  ]) {
    assert.equal(
      lot04PreflightAccepts(
        final.map((target, index) => index === 0 ? { ...target, ...drift } : target),
      ),
      false,
    );
  }
});

test("lot 04 SQL has strict replay, post-check, and non-concurrent guards", async () => {
  const sql = await text(
    "docs/pro/PRO-04_LOT_04_HIGH_VOLUME_FK_INDEXES_PROPOSED.sql",
  );

  for (const marker of [
    "PRO04_LOT04_TABLE_DRIFT",
    "PRO04_LOT04_FK_DRIFT",
    "PRO04_LOT04_INDEX_DRIFT",
    "PRO04_LOT04_COVERAGE_DRIFT",
    "PRO04_LOT04_PARTIAL_STATE_DRIFT",
    "PRO04_LOT04_POSTCHECK_FK_FAILED",
    "PRO04_LOT04_POSTCHECK_INDEX_FAILED",
    "PRO04_LOT04_POSTCHECK_COVERAGE_FAILED",
    "PRO04_LOT04_BUSINESS_ROWS_CHANGED",
  ]) {
    assert.match(sql, new RegExp(marker));
  }

  for (const [table, column] of lot04Targets) {
    assert.match(sql, new RegExp("'" + table + "'[^\\n]*'" + column + "'"));
  }

  assert.match(sql, /v_present_count = 0/);
  assert.match(sql, /v_present_count = 8/);
  assert.match(sql, /index_row\.indisvalid/);
  assert.match(sql, /index_row\.indisready/);
  assert.match(sql, /index_row\.indkey\[0\] = source_column\.attnum/);
  assert.match(sql, /set local lock_timeout = '5s'/);
  assert.doesNotMatch(sql, /create\s+index\s+concurrently/i);
  assert.doesNotMatch(sql, /\b(insert|update|delete)\s+(into|public\.)/i);
});

test("lot 04 rollback is exact-final-state gated and row-count guarded", async () => {
  const rollback = await text(
    "docs/pro/PRO-04_LOT_04_HIGH_VOLUME_FK_INDEXES_ROLLBACK.sql",
  );

  for (const marker of [
    "PRO04_LOT04_ROLLBACK_INDEX_DRIFT",
    "PRO04_LOT04_ROLLBACK_COVERAGE_DRIFT",
    "PRO04_LOT04_ROLLBACK_POSTCHECK_INDEX_FAILED",
    "PRO04_LOT04_ROLLBACK_POSTCHECK_COVERAGE_FAILED",
    "PRO04_LOT04_ROLLBACK_BUSINESS_ROWS_CHANGED",
  ]) {
    assert.match(rollback, new RegExp(marker));
  }

  assert.match(rollback, /pg_get_indexdef\(index_row\.indexrelid\)/);
  assert.match(rollback, /execute format\('drop index public\.%I'/);
  assert.doesNotMatch(rollback, /drop\s+index\s+if\s+exists/i);
  assert.doesNotMatch(rollback, /drop\s+index\s+concurrently/i);
});

test("executed lot 04 migration is an exact traceable copy", async () => {
  const [source, migration] = await Promise.all([
    readFile(
      "docs/pro/PRO-04_LOT_04_HIGH_VOLUME_FK_INDEXES_PROPOSED.sql",
    ),
    readFile(
      "supabase/migrations/20260824062038_pro_04_lot_04_high_volume_fk_indexes.sql",
    ),
  ]);

  assert.deepEqual(migration, source);
  assert.equal(
    createHash("sha256").update(migration).digest("hex"),
    "afb829a79170fe87136ec15651c4b99f0746861da1885fb1aad21151dcc2f1c7",
  );
});

test("proposed lots are transactional, reversible, and never activate invitations", async () => {
  const files = [
    "docs/pro/PRO-04_LOT_01_OWNER_POLICY_AND_HELPER_PROPOSED.sql",
    "docs/pro/PRO-04_LOT_01_OWNER_POLICY_AND_HELPER_ROLLBACK.sql",
    "docs/pro/PRO-04_LOT_02_LOW_RISK_FUNCTION_HARDENING_PROPOSED.sql",
    "docs/pro/PRO-04_LOT_02_LOW_RISK_FUNCTION_HARDENING_ROLLBACK.sql",
    "docs/pro/PRO-04_LOT_03_LEGACY_DENY_ALL_ACL_PROPOSED.sql",
    "docs/pro/PRO-04_LOT_03_LEGACY_DENY_ALL_ACL_ROLLBACK.sql",
    "docs/pro/PRO-04_LOT_04_HIGH_VOLUME_FK_INDEXES_PROPOSED.sql",
    "docs/pro/PRO-04_LOT_04_HIGH_VOLUME_FK_INDEXES_ROLLBACK.sql",
  ];

  for (const file of files) {
    const sql = await text(file);
    assert.match(sql, /^\s*begin\s*;/im, file);
    assert.match(sql, /^\s*commit\s*;/im, file);
    assert.doesNotMatch(sql, /\b(create|alter)\s+role\b/i, file);
    assert.doesNotMatch(sql, /\bcreate_targeted_invitation\s*\(/i, file);
    assert.doesNotMatch(sql, /\bgrant\s+execute\b[\s\S]*\binvitation\b/i, file);
  }
});

test("PRO-04 SQL does not touch registry-sensitive business columns", async () => {
  const files = pairs.map(({ migration }) => migration).concat([
    "docs/pro/PRO-04_LOT_01_OWNER_POLICY_AND_HELPER_PROPOSED.sql",
    "docs/pro/PRO-04_LOT_02_LOW_RISK_FUNCTION_HARDENING_PROPOSED.sql",
    "docs/pro/PRO-04_LOT_03_LEGACY_DENY_ALL_ACL_PROPOSED.sql",
    "docs/pro/PRO-04_LOT_04_HIGH_VOLUME_FK_INDEXES_PROPOSED.sql",
  ]);
  const forbidden = [
    "official_id",
    "source_ministry",
    "source_reference",
    "registry_import_batch",
    "is_verified",
    "forfait",
    "subscription_plan",
  ];

  for (const file of files) {
    const sql = await text(file);
    for (const column of forbidden) {
      assert.doesNotMatch(sql, new RegExp("\\b" + column + "\\b", "i"), file + ": " + column);
    }
  }
});

test("PRO-04.1 checksum manifest matches every consolidation byte-for-byte", async () => {
  const manifest = JSON.parse(await text("docs/pro/PRO-04_1_CHECKSUMS.json"));

  for (const entry of manifest.migrations) {
    const raw = await readFile(entry.path);
    const fileHash = createHash("sha256").update(raw).digest("hex");
    assert.equal(fileHash, entry.file_sha256, entry.path);

    const normalized = raw.toString("utf8").replaceAll("\r\n", "\n");
    const body = stripConsolidationHeader(normalized);
    const bodyHash = createHash("sha256").update(body, "utf8").digest("hex");
    assert.equal(bodyHash, entry.canonical_body_lf_sha256, entry.path);
    assert.equal(body, await text(entry.source), entry.path);
    assert.equal(entry.business_dml_statements, 0, entry.path);
  }

  for (const evidence of [
    manifest.production_snapshot,
    manifest.business_row_baseline,
  ]) {
    const raw = await readFile(evidence.path);
    assert.equal(
      createHash("sha256").update(raw).digest("hex"),
      evidence.file_sha256,
      evidence.path,
    );
  }
});

test("PRO-04.1 production snapshot preserves the approved B/C/D/gate evidence", async () => {
  const snapshot = JSON.parse(
    await text("docs/pro/PRO-04_1_PRODUCTION_OBJECT_SNAPSHOT.json"),
  );

  assert.deepEqual(snapshot.pro03.policy_counts, { B: 12, C: 11, D: 14 });
  assert.equal(snapshot.pro03.policies.length, 37);
  assert.equal(
    snapshot.pro03.policies.every(
      (policy) =>
        policy.exists
        && policy.relrowsecurity
        && policy.roles.length === 1
        && policy.roles[0] === "authenticated",
    ),
    true,
  );
  assert.equal(snapshot.pro03.hours_function.prosecdef, false);
  assert.equal(snapshot.pro03.hours_function.default_count, 0);
  assert.equal(snapshot.pro03.hours_function.authenticated_execute, true);
  assert.equal(snapshot.pro03.hours_function.public_execute, false);
  assert.equal(snapshot.pro03.hours_function.anon_execute, false);
  assert.equal(snapshot.pro03.hours_function.service_role_execute, false);
  assert.equal(snapshot.pro03.current_establishment_id_absent, true);
  assert.deepEqual(snapshot.pro03.consolidation_history, []);
});

test("school_page_drafts remains structurally audited but unassociated with local 0026", async () => {
  const manifest = JSON.parse(await text("docs/pro/PRO-04_1_CHECKSUMS.json"));
  const snapshot = JSON.parse(
    await text("docs/pro/PRO-04_1_PRODUCTION_OBJECT_SNAPSHOT.json"),
  );
  const audit = await text("docs/pro/PRO-04_1_SCHOOL_PAGE_DRAFTS_AUDIT.md");

  assert.equal(manifest.school_page_drafts.remote_version, "20260822154940");
  assert.equal(manifest.school_page_drafts.exact_file_parity, false);
  assert.notEqual(
    manifest.school_page_drafts.local_file_sha256,
    manifest.school_page_drafts.remote_recorded_statement_sha256,
  );
  assert.equal(snapshot.school_page_drafts.catalog.table.relrowsecurity, true);
  assert.equal(snapshot.school_page_drafts.catalog.columns.length, 6);
  assert.equal(snapshot.school_page_drafts.catalog.policies.length, 1);
  assert.equal(snapshot.school_page_drafts.catalog.triggers.length, 1);
  assert.equal(
    snapshot.school_page_drafts.recorded_migration.version,
    "20260822154940",
  );
  assert.match(audit, /Association de .*0026.*INTERDITE/s);
  assert.match(audit, /Action sur l'historique.*NONE/s);
});

test("post-reconciliation control is read-only and history writes use only official CLI repair", async () => {
  const sql = await text("docs/pro/PRO-04_1_POST_RECONCILIATION_CHECK.sql");
  const gate = await text(
    "docs/pro/PRO-04_1_MIGRATION_HISTORY_RECONCILIATION_GATE.md",
  );

  assert.doesNotMatch(
    sql,
    /^\s*(insert|update|delete|merge|truncate|copy|create|alter|drop|grant|revoke)\b/im,
  );
  assert.doesNotMatch(gate, /insert\s+into\s+supabase_migrations/i);
  assert.match(gate, /migration repair[\s\S]*--status applied/);
  assert.match(gate, /migration repair[\s\S]*--status reverted/);
  assert.match(gate, /DATABASE WRITES: 0/);
});
