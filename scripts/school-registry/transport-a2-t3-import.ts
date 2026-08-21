import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import {
  assertTransportA2ImportAllowed,
  TransportA2ImportRefused,
  TRANSPORT_A2_CONFIRM_PHRASE,
  EXPECTED_CANDIDATE_COUNT,
} from "./lib/transportA2ImportGuard";
import { planStagingInsert, type StagingInsertRow } from "./lib/transportA2StagingPayload";
import { createTransportDataSourceRow, insertStagingRowsOnly } from "./lib/transportA2StagingWriter";

/**
 * SPRINT TRANSPORT-A.2-T3-WRITE §7 — REAL staging import script (guard-gated).
 *
 * CRITICAL: this script is prepared and fully functional — the SAFETY STOP
 * from TRANSPORT-A.2-T3 has been REPLACED by a real INSERT branch — but it
 * is NEVER invoked with a complete, valid flag set during THIS sprint
 * (brief §0/ABSOLUTE STOP CONDITIONS: no named human authorization block
 * was received, only the runbook brief itself). This sprint exercises ONLY
 * refusal paths against this exact script, in real CLI conditions (not
 * just unit tests against the guard function directly) — see §16 below.
 *
 * Usage (future, authorized run only):
 *   npx tsx scripts/school-registry/transport-a2-t3-import.ts \
 *     --commit \
 *     --expected-count=<N, from reports/registry/transport-a2-t3-write-payloads.json row_count, MINUS any already-staged since preflight> \
 *     --approval-checksum=<batch_checksum from reports/registry/transport-a2-t3-write-payloads.json> \
 *     --confirm="IMPORT_TRANSPORT_TIER3_TO_STAGING" \
 *     --operator="jean-merlain" \
 *     --approved-by="<distinct real human>"
 *
 * IMPORTANT — --expected-count/--approval-checksum semantics changed this
 * sprint (TRANSPORT-A.2-T3-WRITE §4 finding): of the 17 approved candidates
 * (checksum 4ab50d78...), only candidates with a schema-valid source_url
 * can physically be inserted (establishment_import_staging.source_url is
 * NOT NULL, migration 0006). 5 of 17 are currently held back for this
 * reason (see reports/registry/transport-a2-t3-write-preflight.json,
 * "held_back_missing_source_url") — they are NEVER silently dropped, just
 * not yet insertable without a source_url. --expected-count here refers to
 * the ACTUAL number of rows this run would insert (schema-buildable AND
 * not already in staging), always recomputed fresh against LIVE staging
 * right before the guard check — never assumed from a stale report.
 *
 * Without --commit (or with any flag missing/wrong), this script ALWAYS
 * stops at the guard and performs ZERO establishment_import_staging /
 * establishment_data_sources writes — verified this sprint by direct
 * pre/post row-count comparison, not merely by reading the script's logic.
 *
 * ABSOLUTE WRITE RESTRICTION (brief §9): this script imports ONLY
 * `createTransportDataSourceRow` and `insertStagingRowsOnly` from
 * ./lib/transportA2StagingWriter — the ONLY module in this whole pipeline
 * capable of a network write, and it structurally cannot target
 * `establishments` or `establishment_registry_identifiers` (see that
 * module's tests U/V). This script itself never calls fetch() with a
 * mutating method against any other table.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..", "..");

function flagValue(name: string): string | undefined {
  const arg = process.argv.find((a) => a.startsWith(`--${name}=`));
  return arg ? arg.slice(name.length + 3) : undefined;
}
function envValue(env: string, key: string): string {
  const v = env.match(new RegExp(`^${key}=(.*)$`, "m"))?.[1]?.trim();
  if (!v) throw new Error(`${key} introuvable dans .env.local`);
  return v;
}
async function checkMintransportEnum(url: string, serviceKey: string): Promise<boolean> {
  const res = await fetch(`${url}/rest/v1/establishment_import_staging?source_ministry=eq.MINTRANSPORT&select=id&limit=1`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
  });
  return res.status !== 400;
}
async function fetchCount(url: string, serviceKey: string, table: string, filter = ""): Promise<number> {
  const res = await fetch(`${url}/rest/v1/${table}?select=id&limit=1${filter}`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, Prefer: "count=exact" },
  });
  const range = res.headers.get("content-range");
  return Number(range?.split("/")[1] ?? -1);
}
async function fetchExistingTransportFingerprints(url: string, serviceKey: string): Promise<Set<string>> {
  const res = await fetch(`${url}/rest/v1/establishment_import_staging?fingerprint=like.transport-tier3%3Av1%3A*&select=fingerprint`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
  });
  if (!res.ok) throw new Error(`GET establishment_import_staging (fingerprint check) -> HTTP ${res.status}`);
  const rows = (await res.json()) as { fingerprint: string }[];
  return new Set(rows.map((r) => r.fingerprint));
}

async function main() {
  const commit = process.argv.includes("--commit");
  const envPath = join(rootDir, ".env.local");
  const env = readFileSync(envPath, "utf-8");
  const supabaseUrl = envValue(env, "NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = envValue(env, "SUPABASE_SERVICE_ROLE_KEY");
  const projectRef = supabaseUrl.match(/https:\/\/([a-z0-9]+)\.supabase/)?.[1] ?? "unknown";

  // Load the prepared payloads snapshot produced by transport-a2-t3-write-preflight.ts.
  // This script NEVER recomputes classification/trust-model/payload contents
  // independently — it trusts only the already-reconciled, checksummed
  // snapshot (single source of truth, brief §5/§15). It DOES, however,
  // recompute the idempotent "actually insertable now" set fresh against
  // live staging right before the guard check (§12 — never assume staleness
  // is safe).
  let payloadsSnapshot: { batch_checksum: string; approval_checksum: string; row_count: number; rows: StagingInsertRow[] } | null = null;
  try {
    payloadsSnapshot = JSON.parse(readFileSync(join(rootDir, "reports", "registry", "transport-a2-t3-write-payloads.json"), "utf-8"));
  } catch {
    console.log("No prepared write-payloads snapshot found — run transport-a2-t3-write-preflight.ts first. Treating as absent for guard evaluation (will refuse).");
  }

  const beforeStagingCount = await fetchCount(supabaseUrl, serviceKey, "establishment_import_staging");
  const mintransportEnumPresent = await checkMintransportEnum(supabaseUrl, serviceKey);
  const existingFingerprints = await fetchExistingTransportFingerprints(supabaseUrl, serviceKey);

  const allRows = payloadsSnapshot?.rows ?? [];
  const plan = planStagingInsert(allRows, existingFingerprints);
  // cleanApprovableCount/officialIdentifiersInvented/registryIdentifiersToInsert are
  // guaranteed 0-by-construction for every row in this snapshot (see
  // transportA2StagingPayload.ts — official_identifier is always null, and
  // transport-a2-t3-write-preflight.ts asserts officially_verified_automatically=0
  // and clean_approvable_count=0 before ever writing this snapshot file).
  const piiPersistedCount = 0;
  const officialIdentifiersInvented = allRows.filter((r) => r.official_identifier !== null).length;
  const registryIdentifiersToInsert = 0;

  const req = {
    commit,
    confirmPhrase: flagValue("confirm"),
    projectRef,
    operator: flagValue("operator"),
    approvedBy: flagValue("approved-by"),
    actualWouldInsertCount: plan.toInsert.length,
    expectedWouldInsertCount: flagValue("expected-count") !== undefined ? Number(flagValue("expected-count")) : undefined,
    computedChecksum: payloadsSnapshot?.batch_checksum ?? "no-snapshot-computed",
    approvalChecksum: flagValue("approval-checksum"),
    mintransportEnumPresent,
    cleanApprovableCount: 0,
    piiPersistedCount,
    officialIdentifiersInvented,
    registryIdentifiersToInsert,
  };

  console.log(`=== TRANSPORT-A.2-T3-WRITE IMPORT — commit=${commit} operator=${req.operator ?? "(absent)"} approved-by=${req.approvedBy ?? "(absent)"} ===`);
  console.log(`Pre-write establishment_import_staging count: ${beforeStagingCount}`);
  console.log(`Payloads snapshot rows: ${allRows.length}, would insert now (fresh idempotence check): ${plan.toInsert.length}, already staging: ${plan.skippedAlreadyStaging.length}`);

  try {
    assertTransportA2ImportAllowed(req);
  } catch (e) {
    if (e instanceof TransportA2ImportRefused) {
      console.log(`REFUSED: ${e.message}`);
      const afterCount = await fetchCount(supabaseUrl, serviceKey, "establishment_import_staging");
      console.log(`Post-attempt establishment_import_staging count: ${afterCount} (unchanged=${afterCount === beforeStagingCount})`);
      process.exitCode = 1;
      return;
    }
    throw e;
  }

  // ---- ALLOWED WRITE PATH — never reached this sprint (brief §0/ABSOLUTE STOP CONDITIONS) ----
  console.log("GUARD PASSED — real INSERT branch. NOT reached this sprint (no valid flag set was ever provided, per brief).");
  if (plan.toInsert.length === 0) {
    console.log("Nothing to insert (all candidates already staged or none schema-buildable). 0 writes.");
    return;
  }

  const dataSource = await createTransportDataSourceRow(supabaseUrl, serviceKey, plan.toInsert.length, req.computedChecksum);
  console.log(`Created establishment_data_sources row: ${dataSource.id}`);
  const result = await insertStagingRowsOnly(supabaseUrl, serviceKey, dataSource.id, plan.toInsert);
  console.log(`Inserted ${result.inserted} row(s) into establishment_import_staging (fingerprints: ${result.insertedFingerprints.join(", ")}).`);

  const afterStagingCount = await fetchCount(supabaseUrl, serviceKey, "establishment_import_staging");
  writeFileSync(
    join(rootDir, "reports", "registry", "transport-a2-t3-import-execution.json"),
    JSON.stringify(
      {
        sprint: "TRANSPORT-A.2-T3-WRITE",
        executed_at: new Date().toISOString(),
        operator: req.operator,
        approved_by: req.approvedBy,
        data_source_id: dataSource.id,
        rows_inserted: result.inserted,
        fingerprints_inserted: result.insertedFingerprints,
        staging_count_before: beforeStagingCount,
        staging_count_after: afterStagingCount,
        establishments_touched: 0,
        registry_identifiers_touched: 0,
      },
      null,
      2
    ) + "\n",
    "utf-8"
  );
  console.log(`APPROVAL CHECKSUM: ${req.computedChecksum}`);
  console.log(`Confirmation phrase used: ${TRANSPORT_A2_CONFIRM_PHRASE}. Approved candidate population this sprint's snapshot derives from: ${EXPECTED_CANDIDATE_COUNT}.`);
}

main().catch((e) => {
  console.error("TRANSPORT-A.2-T3-WRITE IMPORT FAILED/REFUSED:", e.message ?? e);
  process.exitCode = 1;
});
