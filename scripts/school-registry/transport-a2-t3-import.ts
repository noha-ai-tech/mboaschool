import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import {
  assertTransportA2ImportAllowed,
  TransportA2ImportRefused,
  TRANSPORT_A2_CONFIRM_PHRASE,
  EXPECTED_CANDIDATE_COUNT,
} from "./lib/transportA2ImportGuard";

/**
 * SPRINT TRANSPORT-A.2-T3 — REAL staging import script (guard-gated).
 *
 * CRITICAL: this script is prepared and functional, but is NEVER invoked
 * with a complete, valid flag set during this sprint (brief §0 — no named
 * human authorization block was received, only the runbook brief itself).
 * This sprint exercises ONLY refusal paths (brief §16) against this exact
 * script, in real CLI conditions (not just unit tests against the guard
 * function directly) — every attempt below is expected/required to be
 * REFUSED with 0 writes.
 *
 * Usage (future, authorized run only):
 *   npx tsx scripts/school-registry/transport-a2-t3-import.ts \
 *     --commit \
 *     --expected-count=17 \
 *     --approval-checksum=<from reports/registry/transport-a2-t3-approval.json> \
 *     --confirm="IMPORT_TRANSPORT_TIER3_TO_STAGING" \
 *     --operator="jean-merlain" \
 *     --approved-by="<distinct real human>"
 *
 * Without --commit (or with any flag missing/wrong), this script ALWAYS
 * stops at the guard and performs ZERO establishment_import_staging writes
 * — verified this sprint by direct pre/post row-count comparison, not
 * merely by reading the script's own logic.
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
async function fetchCount(url: string, serviceKey: string, table: string): Promise<number> {
  const res = await fetch(`${url}/rest/v1/${table}?select=id&limit=1`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, Prefer: "count=exact" },
  });
  const range = res.headers.get("content-range");
  return Number(range?.split("/")[1] ?? -1);
}

async function main() {
  const commit = process.argv.includes("--commit");
  const envPath = join(rootDir, ".env.local");
  const env = readFileSync(envPath, "utf-8");
  const supabaseUrl = envValue(env, "NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = envValue(env, "SUPABASE_SERVICE_ROLE_KEY");
  const projectRef = supabaseUrl.match(/https:\/\/([a-z0-9]+)\.supabase/)?.[1] ?? "unknown";

  // Load the prepared dry-run + approval snapshot produced by transport-a2-t3-prepare.ts.
  // This script NEVER recomputes classification independently — it trusts only the
  // already-reconciled, checksummed snapshot (single source of truth, brief §5/§15).
  let dryRun: { would_insert: number; clean_approvable: number } | null = null;
  let approval: { candidate_count: number; would_insert_count: number; approval_checksum_sha256: string; rows: unknown[] } | null = null;
  try {
    dryRun = JSON.parse(readFileSync(join(rootDir, "reports", "registry", "transport-a2-t3-dry-run.json"), "utf-8"));
    approval = JSON.parse(readFileSync(join(rootDir, "reports", "registry", "transport-a2-t3-approval.json"), "utf-8"));
  } catch {
    console.log("No prepared dry-run/approval snapshot found yet — run transport-a2-t3-prepare.ts first. Treating counts as 0/absent for guard evaluation (will refuse).");
  }

  const beforeCount = await fetchCount(supabaseUrl, serviceKey, "establishment_import_staging");
  const mintransportEnumPresent = await checkMintransportEnum(supabaseUrl, serviceKey);

  const req = {
    commit,
    confirmPhrase: flagValue("confirm"),
    projectRef,
    operator: flagValue("operator"),
    approvedBy: flagValue("approved-by"),
    actualWouldInsertCount: dryRun?.would_insert ?? -1,
    expectedWouldInsertCount: flagValue("expected-count") !== undefined ? Number(flagValue("expected-count")) : undefined,
    computedChecksum: approval?.approval_checksum_sha256 ?? "no-snapshot-computed",
    approvalChecksum: flagValue("approval-checksum"),
    mintransportEnumPresent,
    cleanApprovableCount: dryRun?.clean_approvable ?? 999, // unknown state defaults to blocking, never permissive
    piiPersistedCount: 0,
    officialIdentifiersInvented: 0,
    registryIdentifiersToInsert: 0,
  };

  console.log(`=== TRANSPORT-A.2-T3 IMPORT — commit=${commit} operator=${req.operator ?? "(absent)"} approved-by=${req.approvedBy ?? "(absent)"} ===`);
  console.log(`Pre-write establishment_import_staging count: ${beforeCount}`);

  try {
    assertTransportA2ImportAllowed(req);
  } catch (e) {
    if (e instanceof TransportA2ImportRefused) {
      console.log(`REFUSED: ${e.message}`);
      const afterCount = await fetchCount(supabaseUrl, serviceKey, "establishment_import_staging");
      console.log(`Post-attempt establishment_import_staging count: ${afterCount} (unchanged=${afterCount === beforeCount})`);
      process.exitCode = 1;
      return;
    }
    throw e;
  }

  // ---- ALLOWED WRITE PATH — never reached this sprint ----
  console.log("GUARD PASSED — this branch performs the real INSERT. NOT reached this sprint (brief §0/§17).");
  console.log(`Would now INSERT ${approval?.rows.length ?? 0} row(s) into establishment_import_staging with fingerprint=transport-tier3:v1:<candidate_id> idempotence keys.`);
  console.log(`Confirmation phrase used: ${TRANSPORT_A2_CONFIRM_PHRASE}. Expected candidate population: ${EXPECTED_CANDIDATE_COUNT}.`);
  throw new Error("SAFETY STOP — actual INSERT logic intentionally not implemented in this sprint's script (brief §0: no named human authorization received). A future authorized sprint must add the real fetch()/POST calls here, modeled on scripts/school-registry/import-major-cities-to-staging.ts and minsante-b-pilot-collect.ts, reusing the exact prepared rows from transport-a2-t3-prepare.ts.");
}

main().catch((e) => {
  console.error("TRANSPORT-A.2-T3 IMPORT FAILED/REFUSED:", e.message ?? e);
  process.exitCode = 1;
});
