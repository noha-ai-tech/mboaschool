import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeRegionCasing } from "../../src/lib/cameroonRegions";
import {
  assertRegistryProductionWriteAllowed,
  computeApprovalChecksum,
  EXPECTED_PROJECT_REF,
  RegistryWriteRefused,
} from "./lib/productionGuard";

/**
 * SPRINT R §9-12 — Correction déterministe de la CASSE de `establishments.region`
 * pour les lignes MINESEC dont la valeur actuelle correspond sans ambiguïté à
 * une des 10 régions canoniques (accents/casse ignorés), mais diffère de sa
 * forme exacte (ex. "SUD" -> "Sud"). Seul `region` est modifié — jamais
 * aucun autre champ, jamais de nouvelle ligne, jamais de suppression.
 *
 * Protégé par assertRegistryProductionWriteAllowed() (SPRINT P.6) : --commit,
 * phrase de confirmation, project ref, comptage attendu, checksum
 * d'approbation sur le set exact d'IDs à corriger.
 *
 * Usage :
 *   tsx normalize-live-minesec-regions.ts --dry-run
 *   tsx normalize-live-minesec-regions.ts --commit --confirm="PROMOTE_REGISTRY_TO_PRODUCTION" --expected-candidates=N --approval-checksum=<sha256>
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..", "..");
const BATCH = "region-casing-normalization";

function readEnvVar(env: string, key: string): string {
  const match = env.match(new RegExp(`^${key}=(.*)$`, "m"));
  const value = match?.[1]?.trim();
  if (!value) throw new Error(`${key} introuvable dans .env.local`);
  return value;
}
function argValue(args: string[], flag: string): string | undefined {
  const prefix = `--${flag}=`;
  const found = args.find((a) => a.startsWith(prefix));
  return found ? found.slice(prefix.length) : undefined;
}

interface Row {
  id: string;
  official_id: string | null;
  region: string | null;
  source_ministry: string | null;
}

async function fetchAllPaginated<T>(url: string, key: string, path: string): Promise<T[]> {
  const all: T[] = [];
  const pageSize = 1000;
  let offset = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const res = await fetch(`${url}${path}${path.includes("?") ? "&" : "?"}limit=${pageSize}&offset=${offset}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    if (!res.ok) throw new Error(`GET ${path} -> HTTP ${res.status}`);
    const page = (await res.json()) as T[];
    all.push(...page);
    if (page.length < pageSize) break;
    offset += pageSize;
  }
  return all;
}

async function main() {
  const args = process.argv.slice(2);
  const commit = args.includes("--commit");

  const env = readFileSync(join(rootDir, ".env.local"), "utf-8");
  const url = readEnvVar(env, "NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = readEnvVar(env, "SUPABASE_SERVICE_ROLE_KEY");
  const projectRef = new URL(url).hostname.split(".")[0];

  const rows = await fetchAllPaginated<Row>(url, serviceKey, "/rest/v1/establishments?source_ministry=eq.MINESEC&select=id,official_id,region,source_ministry");

  const candidates: { id: string; officialId: string | null; current: string; canonical: string }[] = [];
  let ambiguous = 0;
  for (const r of rows) {
    if (r.region === null) continue;
    const canonical = normalizeRegionCasing(r.region);
    if (canonical === null) {
      ambiguous++;
      continue;
    }
    if (canonical !== r.region) candidates.push({ id: r.id, officialId: r.official_id, current: r.region, canonical });
  }

  const checksumInput = candidates.map((c) => ({ id: c.id, officialId: c.officialId, decision: `region_casing:${c.canonical}` }));
  const computedChecksum = computeApprovalChecksum(checksumInput);

  console.log("=== REGION NORMALIZATION DRY RUN ===");
  console.log(`MINESEC live total: ${rows.length}`);
  console.log(`Candidates: ${candidates.length}`);
  console.log(`Safe: ${candidates.length}`);
  console.log(`Ambiguous: ${ambiguous}`);
  console.log(`Would update: ${candidates.length}`);
  console.log(`Other fields touched: 0`);
  console.log(`Project ref: ${projectRef}`);
  console.log(`Approval checksum (set exact ${candidates.length} lignes): ${computedChecksum}`);
  console.log(`\nPour committer : --commit --confirm="PROMOTE_REGISTRY_TO_PRODUCTION" --expected-candidates=${candidates.length} --approval-checksum=${computedChecksum}`);

  mkdirSync(join(rootDir, "reports", "registry"), { recursive: true });
  writeFileSync(
    join(rootDir, "reports", "registry", "region-casing-normalization-dryrun.json"),
    JSON.stringify({ timestamp: new Date().toISOString(), project_ref: projectRef, candidates: candidates.length, ambiguous, approval_checksum: computedChecksum }, null, 2),
    "utf-8"
  );

  if (!commit) {
    console.log("\nAUCUNE écriture effectuée (dry-run).");
    return;
  }

  const expectedCandidates = Number(argValue(args, "expected-candidates"));
  const approvalChecksum = argValue(args, "approval-checksum");
  const confirmPhrase = argValue(args, "confirm");

  try {
    assertRegistryProductionWriteAllowed({
      commit,
      confirmPhrase,
      projectRef,
      batch: BATCH,
      expectedBatch: BATCH,
      sourceMinistry: "MINESEC",
      expectedSourceMinistry: "MINESEC",
      actualCandidates: candidates.length,
      expectedCandidates,
      computedChecksum,
      approvalChecksum,
    });
  } catch (e) {
    if (e instanceof RegistryWriteRefused) {
      console.error(`\n❌ ${e.message}`);
      process.exit(1);
    }
    throw e;
  }

  console.log(`\n✅ Garde-fou : autorisé. Correction de ${candidates.length} valeur(s) region (casse uniquement).`);

  const establishmentsBefore = await fetchAllPaginated<{ id: string }>(url, serviceKey, "/rest/v1/establishments?select=id");

  let updated = 0;
  let failed = 0;
  for (const c of candidates) {
    const res = await fetch(`${url}/rest/v1/establishments?id=eq.${c.id}`, {
      method: "PATCH",
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ region: c.canonical }),
    });
    if (res.ok) updated++;
    else {
      failed++;
      console.error(`  ÉCHEC ${c.id} (${c.current} -> ${c.canonical}) : HTTP ${res.status}`);
    }
  }
  console.log(`\nTerminé — ${updated} corrigé(s), ${failed} échoué(s).`);

  const establishmentsAfter = await fetchAllPaginated<{ id: string }>(url, serviceKey, "/rest/v1/establishments?select=id");
  console.log(`\nEstablishments avant: ${establishmentsBefore.length}, après: ${establishmentsAfter.length} (attendu identique).`);
  if (establishmentsBefore.length !== establishmentsAfter.length) {
    console.error("ALERTE — le nombre total d'établissements a changé pendant une correction censée ne modifier QUE la casse de region. Investiguer.");
    process.exitCode = 1;
  }

  writeFileSync(
    join(rootDir, "reports", "registry", "region-casing-normalization-result.json"),
    JSON.stringify(
      { timestamp: new Date().toISOString(), project_ref: projectRef, candidates: candidates.length, updated, failed, establishments_before: establishmentsBefore.length, establishments_after: establishmentsAfter.length, approval_checksum: computedChecksum },
      null,
      2
    ),
    "utf-8"
  );
}

main().catch((error) => {
  console.error("Échec normalisation region :", error);
  process.exit(1);
});
