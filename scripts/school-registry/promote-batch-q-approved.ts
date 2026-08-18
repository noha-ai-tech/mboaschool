import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeName } from "./lib/normalize";
import {
  assertRegistryProductionWriteAllowed,
  computeApprovalChecksum,
  evaluatePromotionOutcome,
  verifyPromotionReportComplete,
  EXPECTED_PROJECT_REF,
  RegistryWriteRefused,
} from "./lib/productionGuard";

/**
 * SPRINT R (promotion réelle, hors SPRINT Q) — Promotion contrôlée de
 * establishment_import_staging vers `establishments` pour le batch
 * "MINESEC Batch 003 (Sud, Est, Nord-Ouest, Sud-Ouest)".
 *
 * Première implémentation --commit réelle du pipeline (P.3/P.5 n'en avaient
 * jamais eu — voir REGISTRY_PRODUCTION_RUNBOOK.md). Passe obligatoirement
 * par assertRegistryProductionWriteAllowed() (SPRINT P.6) : --commit,
 * phrase de confirmation, project ref, comptage attendu, checksum
 * d'approbation sur le set exact approuvé — refuse avant toute écriture si
 * un seul diffère.
 *
 * Règle d'éligibilité déterministe (identique à SPRINT P.3) — PROMOTABLE
 * si TOUT est vrai :
 *   - status = 'ready' (jamais duplicate_exact/duplicate_review)
 *   - raw_data._review.review_action === 'approved_for_promotion'
 *   - official_identifier présent, source_ministry = MINESEC
 *   - name_raw, region, education_family présents
 *   - pas de conflit anti-doublon LIVE (official_id exact, puis nom+région
 *     pour repérer une école déjà revendiquée — jamais touchée)
 * `city` peut être NULL. Aucune description fabriquée, aucune photo,
 * owner_id NULL, is_verified jamais forcé à true, plan par défaut.
 *
 * Chaque établissement créé reçoit IMMÉDIATEMENT son lien staging
 * (promoted_establishment_id + promoted_at + status='promoted') dans le
 * même passage — jamais en différé (le bug P.3 ne doit plus se reproduire).
 *
 * Usage :
 *   tsx promote-batch-q-approved.ts --dry-run
 *   tsx promote-batch-q-approved.ts --commit --confirm="PROMOTE_REGISTRY_TO_PRODUCTION" --expected-candidates=N --approval-checksum=<sha256>
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..", "..");
const BATCH_SIZE = 100;
const REGISTRY_IMPORT_BATCH = "minesec-batch-q-promotion";

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}
function matchKey(nameNormalized: string): string {
  return nameNormalized.replace(/^lyce\s+/, "").replace(/^lycee\s+/, "").trim();
}
function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
/** main_category (enum DB : garderie/primaire/secondaire/superieur/autres) — jamais
 * la taxonomie interne du registre (`education_family`, ex. secondary_general),
 * qui est une classification différente et plus fine. Mapping déterministe. */
function toMainCategory(educationFamily: string): "garderie" | "primaire" | "secondaire" | "superieur" | "autres" {
  switch (educationFamily) {
    case "basic":
      return "primaire";
    case "secondary_general":
    case "secondary_technical":
      return "secondaire";
    case "higher_education":
      return "superieur";
    default:
      return "autres";
  }
}
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

interface StagingRow {
  id: string;
  official_identifier: string | null;
  name_raw: string;
  name_normalized: string;
  region: string | null;
  city: string | null;
  locality: string | null;
  department: string | null;
  arrondissement: string | null;
  education_family: string | null;
  source_ministry: string | null;
  status: string;
  raw_data: { _review?: { review_action: string } } | null;
}
interface LiveEstablishment {
  id: string;
  name: string;
  region: string | null;
  official_id: string | null;
  source_ministry: string | null;
  owner_id: string | null;
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

interface Decision {
  row: StagingRow;
  eligible: boolean;
  reason: string;
  alreadyExists: LiveEstablishment | null;
  ownedConflict: LiveEstablishment | null;
}

async function main() {
  const args = process.argv.slice(2);
  const commit = args.includes("--commit");

  const env = readFileSync(join(rootDir, ".env.local"), "utf-8");
  const url = readEnvVar(env, "NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = readEnvVar(env, "SUPABASE_SERVICE_ROLE_KEY");
  const projectRef = new URL(url).hostname.split(".")[0];

  const [staging, live] = await Promise.all([
    fetchAllPaginated<StagingRow>(
      url,
      serviceKey,
      "/rest/v1/establishment_import_staging?select=id,official_identifier,name_raw,name_normalized,region,city,locality,department,arrondissement,education_family,source_ministry,status,raw_data"
    ),
    fetchAllPaginated<LiveEstablishment>(url, serviceKey, "/rest/v1/establishments?select=id,name,region,official_id,source_ministry,owner_id"),
  ]);

  const liveByOfficialId = new Map<string, LiveEstablishment>();
  const liveByRegion = new Map<string, LiveEstablishment[]>();
  for (const e of live) {
    if (e.official_id) liveByOfficialId.set(e.official_id.trim().toUpperCase(), e);
    const key = stripAccents(e.region ?? "");
    if (!liveByRegion.has(key)) liveByRegion.set(key, []);
    liveByRegion.get(key)!.push(e);
  }

  const decisions: Decision[] = staging.map((row) => {
    const reviewAction = row.raw_data?._review?.review_action;
    if (row.status !== "ready") return { row, eligible: false, reason: "duplicate_unresolved", alreadyExists: null, ownedConflict: null };
    if (reviewAction === "excluded") return { row, eligible: false, reason: "excluded", alreadyExists: null, ownedConflict: null };
    if (reviewAction !== "approved_for_promotion") return { row, eligible: false, reason: "not_approved", alreadyExists: null, ownedConflict: null };
    if (!row.official_identifier) return { row, eligible: false, reason: "missing_official_id", alreadyExists: null, ownedConflict: null };
    if (row.source_ministry !== "MINESEC") return { row, eligible: false, reason: "unsupported_source_ministry", alreadyExists: null, ownedConflict: null };
    if (!row.name_raw) return { row, eligible: false, reason: "missing_name", alreadyExists: null, ownedConflict: null };
    if (!row.region) return { row, eligible: false, reason: "missing_region", alreadyExists: null, ownedConflict: null };
    if (!row.education_family) return { row, eligible: false, reason: "missing_category", alreadyExists: null, ownedConflict: null };

    const officialIdHit = liveByOfficialId.get(row.official_identifier.trim().toUpperCase());
    if (officialIdHit) return { row, eligible: false, reason: "already_exists", alreadyExists: officialIdHit, ownedConflict: null };

    const candidates = liveByRegion.get(stripAccents(row.region)) ?? [];
    const key = matchKey(row.name_normalized);
    const nameMatch = candidates.find((c) => matchKey(normalizeName(c.name)) === key && key.length > 0);
    if (nameMatch?.owner_id) return { row, eligible: false, reason: "owned_school_conflict", alreadyExists: null, ownedConflict: nameMatch };
    if (nameMatch) return { row, eligible: false, reason: "already_exists", alreadyExists: nameMatch, ownedConflict: null };

    return { row, eligible: true, reason: "eligible", alreadyExists: null, ownedConflict: null };
  });

  const eligibleRows = decisions.filter((d) => d.eligible);
  const reasonCounts: Record<string, number> = {};
  for (const d of decisions) reasonCounts[d.reason] = (reasonCounts[d.reason] ?? 0) + 1;

  const checksumInput = eligibleRows.map((d) => ({ id: d.row.id, officialId: d.row.official_identifier, decision: "approved_for_promotion" }));
  const computedChecksum = computeApprovalChecksum(checksumInput);

  console.log("=== DRY RUN — promote-batch-q-approved.ts ===");
  console.log(`Staging total: ${staging.length}`);
  console.log(`Eligible (would insert): ${eligibleRows.length}`);
  console.log(`Détail par raison :`, reasonCounts);
  console.log(`Would update existing: 0 (ce script n'UPDATE jamais establishments existant)`);
  console.log(`Would delete: 0`);
  console.log(`Project ref: ${projectRef}`);
  console.log(`Approval checksum (set exact ${eligibleRows.length} lignes): ${computedChecksum}`);
  console.log(`\nPour committer : --commit --confirm="PROMOTE_REGISTRY_TO_PRODUCTION" --expected-candidates=${eligibleRows.length} --approval-checksum=${computedChecksum}`);

  mkdirSync(join(rootDir, "reports", "registry"), { recursive: true });
  writeFileSync(
    join(rootDir, "reports", "registry", "batch-q-promotion-dryrun.json"),
    JSON.stringify({ timestamp: new Date().toISOString(), project_ref: projectRef, eligible: eligibleRows.length, reasonCounts, approval_checksum: computedChecksum }, null, 2),
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
      batch: REGISTRY_IMPORT_BATCH,
      expectedBatch: REGISTRY_IMPORT_BATCH,
      sourceMinistry: "MINESEC",
      expectedSourceMinistry: "MINESEC",
      actualCandidates: eligibleRows.length,
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

  console.log(`\n✅ Garde-fou production : autorisé. Écriture de ${eligibleRows.length} établissement(s) par lots de ${BATCH_SIZE}.`);

  const timestamp = new Date().toISOString();
  let inserted = 0;
  let failed = 0;
  const failedRows: { id: string; official_id: string | null; error: string }[] = [];
  const createdIds: { establishment_id: string; official_id: string | null; staging_id: string }[] = [];
  const usedSlugs = new Set<string>();

  for (let i = 0; i < eligibleRows.length; i += BATCH_SIZE) {
    const chunk = eligibleRows.slice(i, i + BATCH_SIZE);
    const payload = chunk.map((d) => {
      const base = slugify(d.row.name_raw);
      const tail = (d.row.official_identifier ?? "").replace(/[^A-Za-z0-9]/g, "").slice(-6).toLowerCase();
      let slug = tail ? `${base}-${tail}` : base;
      let n = 1;
      while (usedSlugs.has(slug)) {
        slug = `${base}-${tail}-${n}`;
        n++;
      }
      usedSlugs.add(slug);

      return {
        name: d.row.name_raw,
        slug,
        region: d.row.region,
        city: d.row.city, // peut être NULL — jamais de valeur fabriquée
        main_category: toMainCategory(d.row.education_family!),
        official_id: d.row.official_identifier,
        source_ministry: "MINESEC",
        source_reference: d.row.official_identifier,
        source_url: "https://www.minesec.gov.cm/web/index.php/fr/carte-scolaire/immatriculation-fr",
        source_updated_at: timestamp,
        registry_import_batch: REGISTRY_IMPORT_BATCH,
        owner_id: null,
        is_verified: false,
        description: null,
        cover_image_url: null,
      };
    });

    const res = await fetch(`${url}/rest/v1/establishments`, {
      method: "POST",
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = (await res.text()).slice(0, 300);
      console.error(`  Lot ${i}-${i + chunk.length}: ÉCHEC INSERT HTTP ${res.status} — ${errText}`);
      failed += chunk.length;
      for (const d of chunk) failedRows.push({ id: d.row.id, official_id: d.row.official_identifier, error: `insert HTTP ${res.status}` });
      continue;
    }

    const createdRows: { id: string; official_id: string | null }[] = await res.json();
    console.log(`  Lot ${i}-${i + chunk.length}: INSERT OK (${createdRows.length})`);

    for (let j = 0; j < createdRows.length; j++) {
      const created = createdRows[j];
      const stagingRow = chunk[j].row;
      const linkRes = await fetch(`${url}/rest/v1/establishment_import_staging?id=eq.${stagingRow.id}`, {
        method: "PATCH",
        headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify({ promoted_establishment_id: created.id, promoted_at: timestamp, status: "promoted" }),
      });
      if (linkRes.ok) {
        inserted++;
        createdIds.push({ establishment_id: created.id, official_id: created.official_id, staging_id: stagingRow.id });
      } else {
        failed++;
        failedRows.push({ id: stagingRow.id, official_id: stagingRow.official_identifier, error: `staging link HTTP ${linkRes.status} (établissement ${created.id} créé mais NON lié — réconciliation requise)` });
        console.error(`  ÉCHEC LIEN staging ${stagingRow.id} -> establishment ${created.id} : HTTP ${linkRes.status}`);
      }
    }
  }

  console.log(`\nTerminé — ${inserted} créé(s) + lié(s), ${failed} échoué(s).`);

  const outcome = evaluatePromotionOutcome(inserted + failedRows.filter((f) => f.error.includes("créé mais NON lié")).length, inserted);
  console.log(`Outcome: ${outcome}`);

  const report = {
    timestamp,
    project_ref: projectRef,
    registry_import_batch: REGISTRY_IMPORT_BATCH,
    approval_checksum: computedChecksum,
    eligible: eligibleRows.length,
    inserted,
    skipped: reasonCounts.already_exists ?? 0,
    failed,
    failed_rows: failedRows,
    outcome,
  };
  const reportPath = join(rootDir, "reports", "registry", "promotion-batch-q-summary.json");
  writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf-8");
  writeFileSync(join(rootDir, "reports", "registry", "promotion-batch-q-created-ids.json"), JSON.stringify({ registry_import_batch: REGISTRY_IMPORT_BATCH, count: createdIds.length, establishments: createdIds }, null, 2), "utf-8");

  const { complete, missing } = verifyPromotionReportComplete(report);
  if (!complete) {
    console.error(`\n❌ AUDIT INCOMPLETE — champs manquants du rapport : ${missing.join(", ")}`);
    process.exitCode = 1;
  } else {
    console.log(`\nRapports écrits : ${reportPath}, promotion-batch-q-created-ids.json`);
  }

  if (outcome !== "SUCCESS") {
    console.error(`\n⚠️ ${outcome} — des établissements ont pu être créés sans lien staging correspondant. Ne PAS relancer --commit : réconcilier manuellement d'abord.`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("Échec de la promotion Batch Q :", error);
  process.exit(1);
});
