import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { normalizeRegionCasing } from "../../src/lib/cameroonRegions";

/**
 * SPRINT R.1 §10-17 — Lecture seule + une écriture staging ciblée (raw_data
 * uniquement, jamais establishments). Distingue IDENTITY_VALID de
 * LOCATION_ONLY_ISSUE pour les 45 lignes `ready` : une localité manquante/
 * invalide/à revoir ne rend pas l'identité de l'établissement invalide.
 * Recalcule CLEAN_APPROVABLE en conséquence et écrit le snapshot
 * d'approbation final v2 (jamais en écrasant le v1 de SPRINT R).
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..", "..");

function readEnvVar(env: string, key: string): string {
  const match = env.match(new RegExp(`^${key}=(.*)$`, "m"));
  return match![1].trim();
}
function csvEscape(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
async function fetchAllPaginated<T>(url: string, key: string, path: string): Promise<T[]> {
  const all: T[] = [];
  const pageSize = 1000;
  let offset = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const res = await fetch(`${url}${path}${path.includes("?") ? "&" : "?"}limit=${pageSize}&offset=${offset}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    if (!res.ok) throw new Error(`GET ${path} -> HTTP ${res.status}`);
    const page = (await res.json()) as T[];
    all.push(...page);
    if (page.length < pageSize) break;
    offset += pageSize;
  }
  return all;
}

interface StagingRow {
  id: string;
  official_identifier: string | null;
  name_raw: string;
  region: string | null;
  education_family: string | null;
  source_ministry: string | null;
  status: string;
  raw_data: {
    _localityAudit?: { rawLocality: string | null; localityStatus: string };
    _review?: { review_action: string };
  } | null;
}

type LocalityStatus = "VALID" | "POSSIBLE_REAL_LOCALITY" | "MISSING" | "CLEARLY_INVALID" | "NEEDS_REVIEW";

// §11 — politique localité
function localityPolicy(status: LocalityStatus): { usable: boolean; publicDisplay: boolean; note: string } {
  switch (status) {
    case "VALID":
    case "POSSIBLE_REAL_LOCALITY":
      return { usable: true, publicDisplay: true, note: "A. VALID/POSSIBLE — utilisable" };
    case "MISSING":
      return { usable: false, publicDisplay: false, note: "B. MISSING — NULL, non bloquant" };
    case "CLEARLY_INVALID":
      return { usable: false, publicDisplay: false, note: "C. CLEARLY_INVALID — jamais promue vers city/locality" };
    case "NEEDS_REVIEW":
      return { usable: false, publicDisplay: false, note: "D. NEEDS_REVIEW — raw conservé en staging, jamais affiché publiquement sans confirmation" };
  }
}

async function main() {
  const apply = process.argv.includes("--apply");

  const env = readFileSync(join(rootDir, ".env.local"), "utf-8");
  const url = readEnvVar(env, "NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = readEnvVar(env, "SUPABASE_SERVICE_ROLE_KEY");

  const [readyRows, liveRows] = await Promise.all([
    fetchAllPaginated<StagingRow>(
      url,
      serviceKey,
      "/rest/v1/establishment_import_staging?status=eq.ready&select=id,official_identifier,name_raw,region,education_family,source_ministry,status,raw_data"
    ),
    fetchAllPaginated<{ id: string; official_id: string | null; name: string; region: string | null; owner_id: string | null }>(
      url,
      serviceKey,
      "/rest/v1/establishments?select=id,official_id,name,region,owner_id"
    ),
  ]);

  const liveOfficialIds = new Set(liveRows.filter((e) => e.official_id).map((e) => e.official_id!.trim().toUpperCase()));

  interface Result {
    row: StagingRow;
    identityValid: boolean;
    identityReason: string;
    localityStatus: LocalityStatus;
    policy: ReturnType<typeof localityPolicy>;
    approvable: boolean;
  }

  const results: Result[] = readyRows.map((r) => {
    const canonicalRegion = normalizeRegionCasing(r.region);
    const officialId = r.official_identifier?.trim().toUpperCase() ?? null;
    const noDuplicate = !officialId || !liveOfficialIds.has(officialId);

    const identityChecks: [boolean, string][] = [
      [Boolean(r.official_identifier), "official_id présent"],
      [Boolean(r.name_raw), "official_name présent"],
      [Boolean(canonicalRegion), "région canonique"],
      [Boolean(r.education_family), "catégorie valide"],
      [r.source_ministry === "MINESEC", "source MINESEC"],
      [noDuplicate, "aucun doublon live"],
    ];
    const failedChecks = identityChecks.filter(([ok]) => !ok).map(([, label]) => label);
    const identityValid = failedChecks.length === 0;

    const localityStatus = (r.raw_data?._localityAudit?.localityStatus ?? "MISSING") as LocalityStatus;
    const policy = localityPolicy(localityStatus);

    // §16 — approvable si identité fiable, localité JAMAIS obligatoire.
    const approvable = identityValid;

    return { row: r, identityValid, identityReason: failedChecks.join(", ") || "toutes conditions réunies", localityStatus, policy, approvable };
  });

  const identitySafe = results.filter((r) => r.identityValid);
  const identityUnsafe = results.filter((r) => !r.identityValid);
  const displaySuppressed = results.filter((r) => r.identityValid && !r.policy.publicDisplay);
  const stillBlocked = identityUnsafe; // §13 "Still blocked" = identité non fiable, quelle que soit la localité

  console.log("=== §13 LOCALITY REVIEW RESULT ===");
  console.log(`Total ready analysé : ${results.length}`);
  console.log(`Identity-safe: ${identitySafe.length}`);
  console.log(`Identity-unsafe: ${identityUnsafe.length}`);
  console.log(`Display locality suppressed: ${displaySuppressed.length}`);
  console.log(`Still blocked: ${stillBlocked.length}`);

  for (const r of identityUnsafe) {
    console.log(`  BLOQUÉ : ${r.row.name_raw} (${r.row.official_identifier ?? "sans matricule"}) — ${r.identityReason}`);
  }

  mkdirSync(join(rootDir, "reports", "registry"), { recursive: true });
  const csv = [
    "official_id,name_raw,region,locality_status,identity_valid,identity_reason,locality_policy,approvable",
    ...results.map((r) =>
      [r.row.official_identifier, r.row.name_raw, r.row.region, r.localityStatus, r.identityValid ? "YES" : "NO", r.identityReason, r.policy.note, r.approvable ? "YES" : "NO"]
        .map(csvEscape)
        .join(",")
    ),
  ].join("\n");
  writeFileSync(join(rootDir, "reports", "registry", "locality-review-reclassification.csv"), csv, "utf-8");
  console.log(`\nRapport écrit : reports/registry/locality-review-reclassification.csv`);

  // ── §16-17 : recalcul CLEAN_APPROVABLE + snapshot final v2 ────────────────
  const approvable = results.filter((r) => r.approvable);
  console.log(`\n=== §16 CLEAN APPROVABLE (recalculé) ===`);
  console.log(`Nombre : ${approvable.length} (était 3 en SPRINT R avant application de la politique localité)`);

  const checksumInput = approvable
    .map((r) => `${r.row.id}|${r.row.official_identifier ?? ""}|CLEAN_APPROVABLE_V2`)
    .sort()
    .join("\n");
  const approvalChecksum = createHash("sha256").update(checksumInput).digest("hex");

  const finalApprovalSnapshot = {
    generated_at: new Date().toISOString(),
    supersedes: "reports/registry/minesec-national-v1-approval-snapshot.json (SPRINT R, 3 candidats — conservé tel quel, historique)",
    policy: "SPRINT R.1 §16 — localité jamais obligatoire ; approvable si identité (official_id + nom + région canonique + catégorie + source MINESEC + aucun doublon live) est fiable.",
    checksum_source: "sha256(sorted staging_id|official_id|CLEAN_APPROVABLE_V2)",
    approval_checksum: approvalChecksum,
    count: approvable.length,
    candidates: approvable.map((r) => ({
      staging_id: r.row.id,
      official_id: r.row.official_identifier,
      region: r.row.region,
      category: r.row.education_family,
      locality_status: r.localityStatus,
      display_locality: r.policy.publicDisplay,
      decision: "CLEAN_APPROVABLE",
    })),
  };
  writeFileSync(join(rootDir, "reports", "registry", "minesec-national-v1-final-approval.json"), JSON.stringify(finalApprovalSnapshot, null, 2), "utf-8");
  console.log(`Snapshot final v2 écrit : reports/registry/minesec-national-v1-final-approval.json`);
  console.log(`Checksum : ${approvalChecksum}`);

  if (!apply) {
    console.log("\n(mode calcul seul — relancer avec --apply pour marquer approved_for_promotion sur les candidats approuvables en staging)");
    return;
  }

  let approved = 0;
  for (const r of approvable) {
    if (r.row.raw_data?._review?.review_action === "approved_for_promotion") continue; // déjà approuvé (les 3 de SPRINT R)
    const nextRawData = {
      ...r.row.raw_data,
      _review: {
        reviewed_by: "operator:jean-merlain",
        reviewed_at: new Date().toISOString(),
        review_action: "approved_for_promotion",
        review_note: `SPRINT R.1 — approuvé sur identité fiable (${r.policy.note}). ${r.identityReason}.`,
      },
    };
    const res = await fetch(`${url}/rest/v1/establishment_import_staging?id=eq.${r.row.id}`, {
      method: "PATCH",
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ raw_data: nextRawData }),
    });
    if (res.ok) approved++;
    else console.error(`  ÉCHEC approbation ${r.row.id} : HTTP ${res.status}`);
  }
  console.log(`\n--apply : ${approved} nouvelle(s) ligne(s) marquée(s) approved_for_promotion (staging uniquement).`);
}

main().catch((error) => {
  console.error("Échec reclassification locality review :", error);
  process.exit(1);
});
