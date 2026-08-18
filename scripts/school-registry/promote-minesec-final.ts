import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { normalizeName } from "./lib/normalize";
import { normalizeRegionCasing } from "../../src/lib/cameroonRegions";
import {
  assertRegistryProductionWriteAllowed,
  computeApprovalChecksum,
  evaluatePromotionOutcome,
  verifyPromotionReportComplete,
  RegistryWriteRefused,
} from "./lib/productionGuard";

/**
 * SPRINT R.1 §17-23 — Promotion contrôlée finale du registre MINESEC V1 :
 * UNIQUEMENT les candidats du snapshot figé
 * reports/registry/minesec-national-v1-final-approval.json (44 lignes,
 * identité fiable — localité jamais exigée, §16). Le snapshot v1 (3
 * candidats, SPRINT R) reste historique, jamais écrasé.
 *
 * Ré-exécute l'éligibilité en direct contre l'état actuel de production
 * (jamais la confiance aveugle dans un fichier local) — mêmes règles que
 * promote-batch-q-approved.ts : official_id, source MINESEC, nom, région
 * canonique, catégorie, aucun conflit officiel_id/nom+région live.
 *
 * approved_by : aucune identité distincte de l'opérateur n'a été fournie
 * explicitement pour cette mission — jamais inventé (§23). Reste null,
 * documenté comme tel dans le rapport.
 *
 * Usage :
 *   tsx promote-minesec-final.ts --dry-run
 *   tsx promote-minesec-final.ts --commit --confirm="PROMOTE_REGISTRY_TO_PRODUCTION" --expected-candidates=N --approval-checksum=<sha256> --operator=jean-merlain
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..", "..");
const BATCH_SIZE = 100;
const REGISTRY_IMPORT_BATCH = "minesec-national-v1-final-promotion";
const EXPECTED_OPERATOR = "jean-merlain";
const APPROVED_BY: string | null = null; // §23 — jamais inventé

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
    const res = await fetch(`${url}${path}${path.includes("?") ? "&" : "?"}limit=${pageSize}&offset=${offset}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
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

  const snapshot: { approval_checksum: string; count: number; candidates: { staging_id: string; official_id: string | null }[] } = JSON.parse(
    readFileSync(join(rootDir, "reports", "registry", "minesec-national-v1-final-approval.json"), "utf-8")
  );
  console.log(`Snapshot final v2 : ${snapshot.count} candidat(s), checksum enregistré ${snapshot.approval_checksum}`);

  const [staging, live] = await Promise.all([
    fetchAllPaginated<StagingRow>(
      url,
      serviceKey,
      "/rest/v1/establishment_import_staging?select=id,official_identifier,name_raw,name_normalized,region,city,locality,education_family,source_ministry,status,raw_data"
    ),
    fetchAllPaginated<LiveEstablishment>(url, serviceKey, "/rest/v1/establishments?select=id,name,region,official_id,source_ministry,owner_id"),
  ]);

  const stagingById = new Map(staging.map((r) => [r.id, r]));
  const liveByOfficialId = new Map<string, LiveEstablishment>();
  const liveByRegion = new Map<string, LiveEstablishment[]>();
  for (const e of live) {
    if (e.official_id) liveByOfficialId.set(e.official_id.trim().toUpperCase(), e);
    const key = stripAccents(e.region ?? "");
    if (!liveByRegion.has(key)) liveByRegion.set(key, []);
    liveByRegion.get(key)!.push(e);
  }

  interface Decision {
    row: StagingRow;
    eligible: boolean;
    reason: string;
  }
  const decisions: Decision[] = [];
  let missingFromStaging = 0;

  for (const c of snapshot.candidates) {
    const row = stagingById.get(c.staging_id);
    if (!row) {
      missingFromStaging++;
      continue;
    }
    if (row.status !== "ready") {
      decisions.push({ row, eligible: false, reason: `déjà ${row.status} depuis le snapshot` });
      continue;
    }
    if (row.raw_data?._review?.review_action !== "approved_for_promotion") {
      decisions.push({ row, eligible: false, reason: "approbation absente ou retirée depuis le snapshot" });
      continue;
    }
    if (!row.official_identifier) {
      decisions.push({ row, eligible: false, reason: "missing_official_id" });
      continue;
    }
    if (row.source_ministry !== "MINESEC") {
      decisions.push({ row, eligible: false, reason: "unsupported_source_ministry" });
      continue;
    }
    const canonicalRegion = normalizeRegionCasing(row.region);
    if (!canonicalRegion) {
      decisions.push({ row, eligible: false, reason: "missing_or_ambiguous_region" });
      continue;
    }
    if (!row.education_family) {
      decisions.push({ row, eligible: false, reason: "missing_category" });
      continue;
    }
    const officialIdHit = liveByOfficialId.get(row.official_identifier.trim().toUpperCase());
    if (officialIdHit) {
      decisions.push({ row, eligible: false, reason: "already_exists" });
      continue;
    }
    const candidates = liveByRegion.get(stripAccents(canonicalRegion)) ?? [];
    const key = matchKey(row.name_normalized);
    const nameMatch = candidates.find((c2) => matchKey(normalizeName(c2.name)) === key && key.length > 0);
    if (nameMatch?.owner_id) {
      decisions.push({ row, eligible: false, reason: "owned_school_conflict" });
      continue;
    }
    if (nameMatch) {
      decisions.push({ row, eligible: false, reason: "already_exists" });
      continue;
    }
    decisions.push({ row, eligible: true, reason: "eligible" });
  }

  const eligibleRows = decisions.filter((d) => d.eligible);
  const alreadyLive = decisions.filter((d) => d.reason === "already_exists").length;
  const conflicts = decisions.filter((d) => d.reason === "owned_school_conflict").length;
  const reasonCounts: Record<string, number> = {};
  for (const d of decisions) reasonCounts[d.reason] = (reasonCounts[d.reason] ?? 0) + 1;

  // Même label que reclassify-locality-review.ts (source du snapshot figé) —
  // sinon le checksum ne peut jamais correspondre, même sur un set identique.
  const checksumInput = eligibleRows.map((d) => ({ id: d.row.id, officialId: d.row.official_identifier, decision: "CLEAN_APPROVABLE_V2" }));
  const computedChecksum = computeApprovalChecksum(checksumInput);

  console.log("\n=== DRY RUN — promote-minesec-final.ts ===");
  console.log(`Eligible: ${eligibleRows.length}`);
  console.log(`Already live: ${alreadyLive}`);
  console.log(`Conflicts: ${conflicts}`);
  console.log(`Would insert: ${eligibleRows.length}`);
  console.log(`Would update existing: 0`);
  console.log(`Would delete: 0`);
  console.log(`Would link staging: ${eligibleRows.length}`);
  console.log(`Expected count: ${snapshot.count}`);
  console.log(`Checksum (recalculé maintenant): ${computedChecksum}`);
  console.log(`Manquant du staging (supprimé depuis le snapshot ?): ${missingFromStaging}`);
  console.log(`Détail par raison:`, reasonCounts);

  const dryRunOk = eligibleRows.length === snapshot.count && conflicts === 0 && missingFromStaging === 0 && computedChecksum === snapshot.approval_checksum;
  console.log(`\n§19 Conditions (would_update=0, would_delete=0, conflicts=0, would_insert=would_link=expected, checksum stable) : ${dryRunOk ? "TOUTES VERTES" : "❌ AU MOINS UNE ÉCHOUÉE — STOP"}`);

  mkdirSync(join(rootDir, "reports", "registry"), { recursive: true });

  if (!commit) {
    console.log("\nAUCUNE écriture effectuée (dry-run).");
    return;
  }

  if (!dryRunOk) {
    console.error("\n❌ STOP — le dry-run n'est pas parfait, --commit refusé par ce script (avant même le garde-fou).");
    process.exit(1);
  }

  const expectedCandidates = Number(argValue(args, "expected-candidates"));
  const approvalChecksum = argValue(args, "approval-checksum");
  const confirmPhrase = argValue(args, "confirm");
  const operator = argValue(args, "operator");

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
      operator,
      expectedOperator: EXPECTED_OPERATOR,
    });
  } catch (e) {
    if (e instanceof RegistryWriteRefused) {
      console.error(`\n❌ ${e.message}`);
      process.exit(1);
    }
    throw e;
  }

  console.log(`\n✅ Garde-fou : autorisé. Écriture de ${eligibleRows.length} établissement(s) par lots de ${BATCH_SIZE}.`);

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
        region: normalizeRegionCasing(d.row.region),
        city: d.row.city,
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
        failedRows.push({ id: stagingRow.id, official_id: stagingRow.official_identifier, error: `staging link HTTP ${linkRes.status} — établissement ${created.id} créé mais NON lié` });
        console.error(`  ÉCHEC LIEN staging ${stagingRow.id} -> establishment ${created.id} : HTTP ${linkRes.status}`);
      }
    }
  }

  console.log(`\nTerminé — ${inserted} créé(s) + lié(s), ${failed} échoué(s).`);
  const createdTotal = inserted + failedRows.filter((f) => f.error.includes("créé mais NON lié")).length;
  const outcome = evaluatePromotionOutcome(createdTotal, inserted);
  console.log(`Outcome: ${outcome}`);

  let gitCommit: string | null = null;
  try {
    gitCommit = execSync("git rev-parse HEAD", { cwd: rootDir }).toString().trim();
  } catch {
    // pas de dépôt git accessible — reste null, jamais deviné
  }

  const report = {
    operator: EXPECTED_OPERATOR,
    approved_by: APPROVED_BY,
    git_commit: gitCommit,
    project_ref: projectRef,
    timestamp,
    approval_checksum: computedChecksum,
    registry_import_batch: REGISTRY_IMPORT_BATCH,
    eligible: eligibleRows.length,
    inserted,
    skipped: alreadyLive,
    created: inserted,
    linked: inserted,
    failed,
    failed_rows: failedRows,
    outcome,
  };
  writeFileSync(join(rootDir, "reports", "registry", "minesec-national-v1-final-promotion-summary.json"), JSON.stringify(report, null, 2), "utf-8");
  writeFileSync(
    join(rootDir, "reports", "registry", "minesec-national-v1-final-created-ids.json"),
    JSON.stringify({ registry_import_batch: REGISTRY_IMPORT_BATCH, count: createdIds.length, establishments: createdIds }, null, 2),
    "utf-8"
  );

  const { complete, missing } = verifyPromotionReportComplete({ ...report, timestamp: report.timestamp, registry_import_batch: report.registry_import_batch });
  if (!complete) {
    console.error(`\n❌ AUDIT INCOMPLETE — champs manquants : ${missing.join(", ")}`);
    process.exitCode = 1;
  } else {
    console.log(`\nRapports écrits : minesec-national-v1-final-promotion-summary.json, minesec-national-v1-final-created-ids.json`);
  }
  if (outcome !== "SUCCESS") {
    console.error(`\n⚠️ ${outcome} — ne pas relancer --commit, réconcilier manuellement.`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("Échec de la promotion finale :", error);
  process.exit(1);
});
