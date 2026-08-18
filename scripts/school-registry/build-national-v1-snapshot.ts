import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { normalizeRegionCasing } from "../../src/lib/cameroonRegions";

/**
 * SPRINT R §4-5, §19-27, §35-36 — Lecture seule (aucun appel Supabase en
 * écriture). Construit le snapshot national immuable, vérifie les
 * invariants, classifie les candidats "ready" restants (Group A-D),
 * prépare le moteur d'approbation (CLEAN_APPROVABLE/REVIEW_REQUIRED/
 * DUPLICATE/ALREADY_LIVE) avec son snapshot figé + checksum, et écrit les
 * rapports qualité/summary nationaux. Ne promeut rien.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..", "..");

function readEnvVar(env: string, key: string): string {
  const match = env.match(new RegExp(`^${key}=(.*)$`, "m"));
  const value = match?.[1]?.trim();
  if (!value) throw new Error(`${key} introuvable dans .env.local`);
  return value;
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

interface StagingRow {
  id: string;
  official_identifier: string | null;
  name_raw: string;
  name_normalized: string;
  region: string | null;
  locality: string | null;
  city: string | null;
  education_family: string | null;
  source_ministry: string | null;
  status: string;
  data_source_id: string | null;
  duplicate_of_establishment_id: string | null;
  promoted_establishment_id: string | null;
  created_at: string;
  raw_data: {
    _localityAudit?: { rawLocality: string | null; normalizedLocality: string | null; localityStatus: string };
    _matchAudit?: { matchType: string; confidence: string };
    _review?: { review_action: string };
  } | null;
}

async function main() {
  const env = readFileSync(join(rootDir, ".env.local"), "utf-8");
  const url = readEnvVar(env, "NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = readEnvVar(env, "SUPABASE_SERVICE_ROLE_KEY");

  const [staging, sources, establishments] = await Promise.all([
    fetchAllPaginated<StagingRow>(
      url,
      serviceKey,
      "/rest/v1/establishment_import_staging?select=id,official_identifier,name_raw,name_normalized,region,locality,city,education_family,source_ministry,status,data_source_id,duplicate_of_establishment_id,promoted_establishment_id,created_at,raw_data"
    ),
    fetchAllPaginated<{ id: string; source_name: string }>(url, serviceKey, "/rest/v1/establishment_data_sources?select=id,source_name"),
    fetchAllPaginated<{ id: string; owner_id: string | null }>(url, serviceKey, "/rest/v1/establishments?select=id,owner_id"),
  ]);

  const sourceById = new Map(sources.map((s) => [s.id, s.source_name]));
  const establishmentById = new Map(establishments.map((e) => [e.id, e]));

  // ── §4 : snapshot national immuable ──────────────────────────────────────
  const nationalRows = staging.map((r) => ({
    official_id: r.official_identifier,
    official_name: r.name_raw,
    normalized_name: r.name_normalized,
    category: r.education_family,
    region: r.region,
    raw_locality: r.raw_data?._localityAudit?.rawLocality ?? r.locality,
    normalized_locality: r.raw_data?._localityAudit?.normalizedLocality ?? r.locality,
    locality_quality: r.raw_data?._localityAudit?.localityStatus ?? "MISSING",
    source_ministry: r.source_ministry,
    source_reference: r.official_identifier,
    staging_status: r.status,
    existing_establishment_id: r.promoted_establishment_id ?? r.duplicate_of_establishment_id ?? null,
    review_status: r.raw_data?._review?.review_action ?? null,
    batch_origin: sourceById.get(r.data_source_id ?? "") ?? "(inconnu)",
  }));

  mkdirSync(join(rootDir, "data", "registry", "master"), { recursive: true });
  writeFileSync(join(rootDir, "data", "registry", "master", "minesec-national-v1.json"), JSON.stringify(nationalRows, null, 2), "utf-8");
  console.log(`Snapshot national écrit : data/registry/master/minesec-national-v1.json (${nationalRows.length} lignes)`);

  // ── §5 : invariants ───────────────────────────────────────────────────────
  const CANONICAL_REGIONS = ["Adamaoua", "Centre", "Est", "Extrême-Nord", "Littoral", "Nord", "Nord-Ouest", "Ouest", "Sud", "Sud-Ouest"];
  const regionsPresent = new Set(staging.map((r) => normalizeRegionCasing(r.region)).filter(Boolean));
  const withOfficialId = staging.filter((r) => r.official_identifier);
  const withCategory = staging.filter((r) => r.education_family);
  const missingOfficialId = staging.filter((r) => !r.official_identifier);
  const uniqueByFingerprint = new Set(staging.map((r) => r.id)).size; // id est déjà unique par construction (clé staging)

  console.log("\n=== §5 INVARIANTS ===");
  console.log(`rows: ${staging.length} (attendu 1942)`);
  console.log(`unique rows: ${uniqueByFingerprint} (attendu 1942)`);
  console.log(`region coverage: ${[...regionsPresent].filter((r) => CANONICAL_REGIONS.includes(r!)).length}/10`);
  console.log(`category coverage: ${withCategory.length}/${staging.length} (${((withCategory.length / staging.length) * 100).toFixed(1)}%)`);
  console.log(`official ID coverage: ${withOfficialId.length}/${staging.length} (attendu 1941/1942)`);
  if (missingOfficialId.length > 0) {
    console.log(`Ligne(s) sans matricule :`, missingOfficialId.map((r) => ({ id: r.id, name: r.name_raw, region: r.region })));
  }

  // ── §7-8 : couverture régionale + décompte ──────────────────────────────
  const regionCounts: Record<string, number> = {};
  for (const r of staging) {
    const key = normalizeRegionCasing(r.region) ?? r.region ?? "(inconnue)";
    regionCounts[key] = (regionCounts[key] ?? 0) + 1;
  }

  // ── §13 : audit duplicate_exact (673 historiques + 1 Deido confirmé = 674) ─
  const dupExact = staging.filter((r) => r.status === "duplicate_exact");
  const dupExactUnlinked = dupExact.filter((r) => !r.duplicate_of_establishment_id);
  const dupExactBrokenLink = dupExact.filter((r) => r.duplicate_of_establishment_id && !establishmentById.has(r.duplicate_of_establishment_id));

  // ── §19-21 : classification des "ready" restants (identity vs locality) ──
  const readyRows = staging.filter((r) => r.status === "ready");
  type Group = "A_CLEAN" | "B_LOCALITY_REVIEW" | "C_ID_REVIEW" | "D_OTHER_REVIEW";
  function classifyReady(r: StagingRow): { group: Group; reason: string } {
    if (!r.official_identifier) return { group: "C_ID_REVIEW", reason: "official_id absent" };
    if (!r.name_raw) return { group: "D_OTHER_REVIEW", reason: "nom absent" };
    const canonicalRegion = normalizeRegionCasing(r.region);
    if (!canonicalRegion) return { group: "D_OTHER_REVIEW", reason: `région non canonique ou absente ("${r.region}")` };
    if (!r.education_family) return { group: "D_OTHER_REVIEW", reason: "catégorie absente" };
    const locality = r.raw_data?._localityAudit?.localityStatus ?? "MISSING";
    if (locality === "CLEARLY_INVALID" || locality === "NEEDS_REVIEW") return { group: "B_LOCALITY_REVIEW", reason: `localité ${locality}` };
    return { group: "A_CLEAN", reason: "identité complète, localité non bloquante" };
  }
  const readyClassified = readyRows.map((r) => ({ row: r, ...classifyReady(r) }));
  const groupCounts: Record<Group, number> = { A_CLEAN: 0, B_LOCALITY_REVIEW: 0, C_ID_REVIEW: 0, D_OTHER_REVIEW: 0 };
  for (const c of readyClassified) groupCounts[c.group]++;

  console.log("\n=== §19 CLASSIFICATION READY (n=" + readyRows.length + ") ===");
  console.log(groupCounts);

  // ── §23 : distinguer les 16 historiques (pré-Q) des candidats Q ──────────
  const masterV1SourceId = sources.find((s) => s.source_name.includes("Master V1"))?.id;
  const historicalReady = readyRows.filter((r) => r.data_source_id === masterV1SourceId);
  const qReady = readyRows.filter((r) => r.data_source_id !== masterV1SourceId);
  console.log(`\n§23 Ready historiques (pré-Q, source Master V1) : ${historicalReady.length}`);
  console.log(`Ready issus de Batch Q : ${qReady.length}`);

  // ── §22 : audit des 26 cas Q signalés localité (isole les vraies anomalies) ─
  const batchQSourceId = sources.find((s) => s.source_name.includes("Batch 003"))?.id;
  const qLocalityFlagged = staging.filter(
    (r) => r.data_source_id === batchQSourceId && (r.raw_data?._localityAudit?.localityStatus === "CLEARLY_INVALID" || r.raw_data?._localityAudit?.localityStatus === "NEEDS_REVIEW")
  );
  const qLocalityCsv = [
    "official_id,name_raw,region,raw_locality,locality_status,identity_complete",
    ...qLocalityFlagged.map((r) =>
      [
        r.official_identifier,
        r.name_raw,
        r.region,
        r.raw_data?._localityAudit?.rawLocality ?? "",
        r.raw_data?._localityAudit?.localityStatus,
        r.official_identifier && r.name_raw && r.region && r.education_family ? "YES" : "NO",
      ]
        .map(csvEscape)
        .join(",")
    ),
  ].join("\n");
  mkdirSync(join(rootDir, "reports", "registry"), { recursive: true });
  writeFileSync(join(rootDir, "reports", "registry", "q-locality-human-review.csv"), qLocalityCsv, "utf-8");
  console.log(`\n§22 Cas Q signalés localité : ${qLocalityFlagged.length} — rapport écrit : q-locality-human-review.csv`);

  // ── §24-27 : approval engine + snapshot figé + checksum ──────────────────
  type ApprovalDecision = "CLEAN_APPROVABLE" | "REVIEW_REQUIRED" | "DUPLICATE" | "ALREADY_LIVE";
  function approvalDecision(r: StagingRow): ApprovalDecision {
    if (r.status === "promoted") return "ALREADY_LIVE";
    if (r.status === "duplicate_exact" || r.status === "duplicate_review") return "DUPLICATE";
    // status === 'ready'
    const c = classifyReady(r);
    return c.group === "A_CLEAN" ? "CLEAN_APPROVABLE" : "REVIEW_REQUIRED";
  }
  const approvalCounts: Record<ApprovalDecision, number> = { CLEAN_APPROVABLE: 0, REVIEW_REQUIRED: 0, DUPLICATE: 0, ALREADY_LIVE: 0 };
  const cleanApprovable: StagingRow[] = [];
  for (const r of staging) {
    const d = approvalDecision(r);
    approvalCounts[d]++;
    if (d === "CLEAN_APPROVABLE") cleanApprovable.push(r);
  }

  const checksumInput = cleanApprovable
    .map((r) => `${r.id}|${r.official_identifier ?? ""}|CLEAN_APPROVABLE`)
    .sort()
    .join("\n");
  const approvalChecksum = createHash("sha256").update(checksumInput).digest("hex");

  const approvalSnapshot = {
    generated_at: new Date().toISOString(),
    checksum_source: "sha256(sorted staging_id|official_id|CLEAN_APPROVABLE)",
    approval_checksum: approvalChecksum,
    count: cleanApprovable.length,
    candidates: cleanApprovable.map((r) => ({ staging_id: r.id, official_id: r.official_identifier, region: r.region, category: r.education_family, decision: "CLEAN_APPROVABLE" })),
  };
  writeFileSync(join(rootDir, "reports", "registry", "minesec-national-v1-approval-snapshot.json"), JSON.stringify(approvalSnapshot, null, 2), "utf-8");
  console.log(`\n§26-27 Snapshot d'approbation écrit : ${cleanApprovable.length} candidat(s) CLEAN_APPROVABLE, checksum ${approvalChecksum}`);
  console.log(`Approval engine :`, approvalCounts);

  // ── §35 : rapport national ────────────────────────────────────────────────
  const localityQualityCounts: Record<string, number> = {};
  for (const r of staging) {
    const q = r.raw_data?._localityAudit?.localityStatus ?? "MISSING";
    localityQualityCounts[q] = (localityQualityCounts[q] ?? 0) + 1;
  }
  const statusCounts: Record<string, number> = {};
  for (const r of staging) statusCounts[r.status] = (statusCounts[r.status] ?? 0) + 1;

  const macroZoneCounts = {
    grand_nord: ["Adamaoua", "Nord", "Extrême-Nord"].reduce((a, r) => a + (regionCounts[r] ?? 0), 0),
    zone_anglophone: ["Nord-Ouest", "Sud-Ouest"].reduce((a, r) => a + (regionCounts[r] ?? 0), 0),
  };

  const nationalSummary = {
    generated_at: new Date().toISOString(),
    operator: "jean-merlain",
    total_unique: staging.length,
    official_id_coverage: `${withOfficialId.length}/${staging.length}`,
    region_coverage: `${[...regionsPresent].filter((r) => CANONICAL_REGIONS.includes(r!)).length}/10`,
    locality_quality: localityQualityCounts,
    status_counts: statusCounts,
    region_counts: regionCounts,
    macro_zone_counts: macroZoneCounts,
    clean_approvable: approvalCounts.CLEAN_APPROVABLE,
    review_required: approvalCounts.REVIEW_REQUIRED,
    duplicates: approvalCounts.DUPLICATE,
    live_matches: approvalCounts.ALREADY_LIVE,
    ready_classification: groupCounts,
    duplicate_exact_audit: { total: dupExact.length, unlinked: dupExactUnlinked.length, broken_link: dupExactBrokenLink.length },
  };
  writeFileSync(join(rootDir, "reports", "registry", "minesec-national-v1-summary.json"), JSON.stringify(nationalSummary, null, 2), "utf-8");
  console.log(`\n§35 Rapport national écrit : minesec-national-v1-summary.json`);

  // ── §36 : data quality report ligne par ligne ────────────────────────────
  const qualityRows = [
    "official_id,official_name,region,locality,locality_quality,staging_status,identity_quality,review_reason",
    ...staging.map((r) => {
      const identityQuality = r.official_identifier && r.name_raw && r.region && r.education_family ? "COMPLETE" : "INCOMPLETE";
      const reviewReason =
        r.status === "duplicate_review"
          ? "duplicate_review"
          : r.status === "ready" && !r.official_identifier
            ? "missing_official_id"
            : r.status === "ready" && (r.raw_data?._localityAudit?.localityStatus === "CLEARLY_INVALID" || r.raw_data?._localityAudit?.localityStatus === "NEEDS_REVIEW")
              ? "locality_review"
              : "";
      return [r.official_identifier, r.name_raw, r.region, r.raw_data?._localityAudit?.rawLocality ?? r.locality ?? "", r.raw_data?._localityAudit?.localityStatus ?? "MISSING", r.status, identityQuality, reviewReason]
        .map(csvEscape)
        .join(",");
    }),
  ].join("\n");
  writeFileSync(join(rootDir, "reports", "registry", "minesec-national-v1-quality.csv"), qualityRows, "utf-8");
  console.log(`§36 Rapport qualité écrit : minesec-national-v1-quality.csv (${staging.length} lignes)`);
}

main().catch((error) => {
  console.error("Échec build snapshot national :", error);
  process.exit(1);
});
