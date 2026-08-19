import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { normalizeRegionCasing } from "../../src/lib/cameroonRegions";
import {
  assertRegistryProductionWriteAllowed,
  computeApprovalChecksum,
  evaluatePromotionOutcome,
  verifyPromotionReportComplete,
  RegistryWriteRefused,
} from "./lib/productionGuard";

/**
 * SPRINT R.3.2 — Promotion contrôlée des 161 candidats Major Cities classés
 * CLEAN_APPROVABLE par SPRINT R.3.1 (reports/registry/major-cities-official-
 * corroboration-approval.json), sur la base d'une corroboration officielle
 * cartescolaire.cm/MINESEC — jamais d'un Tier 3 seul.
 *
 * §5/§6 de la spec R.3.2 : le matricule cartescolaire N'EST JAMAIS copié
 * dans establishments.official_id (espace d'identifiants incompatible avec
 * MINESEC V1, démontré SPRINT MINESEC V1.1). official_id reste NULL pour
 * ces établissements ; le matricule de corroboration est conservé dans
 * source_reference (texte libre, aucune colonne dédiée dans le schéma
 * actuel — aucune migration dans ce sprint, §23).
 *
 * source_ministry reste "OTHER" : la source de DÉCOUVERTE initiale (Osidimbea/
 * jimdofree, InovEdu, ecolesaucameroun.com) n'était pas MINESEC — la
 * corroboration officielle est une preuve complémentaire, pas une
 * réattribution de provenance (§14, "ne pas écraser la provenance Tier 3
 * initiale").
 *
 * Usage :
 *   npx tsx promote-major-cities-r3-2.ts --dry-run
 *   npx tsx promote-major-cities-r3-2.ts --commit --expected-project=umcwwynrftidytxgqkwi --expected-count=N --approval-checksum=<sha256> --confirm="PROMOTE_REGISTRY_TO_PRODUCTION" --operator=jean-merlain --approved-by="<nom explicite>"
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..", "..");
const BATCH_SIZE = 50;
const REGISTRY_IMPORT_BATCH = "major-cities-official-corroboration-v1";
const EXPECTED_OPERATOR = "jean-merlain";
const APPROVAL_SNAPSHOT_PATH = join(rootDir, "reports", "registry", "major-cities-official-corroboration-approval.json");

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
const GENERIC = new Set(["de", "du", "des", "la", "le", "les", "d", "l", "et", "a", "au", "aux"]);
function exactKey(name: string): string {
  return (name || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter((w) => !GENERIC.has(w))
    .sort()
    .join(" ");
}
async function fetchAllPaginated<T>(url: string, key: string, path: string): Promise<T[]> {
  const all: T[] = [];
  const pageSize = 1000;
  let offset = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const res = await fetch(`${url}${path}${path.includes("?") ? "&" : "?"}limit=${pageSize}&offset=${offset}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    if (!res.ok) throw new Error(`GET ${path} -> HTTP ${res.status}: ${await res.text()}`);
    const page = (await res.json()) as T[];
    all.push(...page);
    if (page.length < pageSize) break;
    offset += pageSize;
  }
  return all;
}

interface ApprovalCandidate {
  staging_id: string;
  name: string;
  region: string | null;
  city: string | null;
  category: string | null;
  original_source: string | null;
  official_corroboration_source: string;
  official_corroboration_id: string | null;
  official_corroboration_id_type: string | null;
  match_type: string;
  decision: string;
}
interface StagingRow {
  id: string;
  status: string;
  source_ministry: string | null;
  source_url: string | null;
  official_identifier: string | null;
  city: string | null;
  region: string | null;
  name_raw: string;
  education_family: string | null;
}
interface LiveEstablishment {
  id: string;
  name: string;
  city: string | null;
  region: string | null;
  official_id: string | null;
}

async function main() {
  const args = process.argv.slice(2);
  const commit = args.includes("--commit");

  const env = readFileSync(join(rootDir, ".env.local"), "utf-8");
  const url = readEnvVar(env, "NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = readEnvVar(env, "SUPABASE_SERVICE_ROLE_KEY");
  const projectRef = new URL(url).hostname.split(".")[0];

  console.log(`Project ref détecté : ${projectRef}`);

  // §2 — revalider le snapshot + son checksum AVANT toute autre chose.
  const snapshot: { candidates: ApprovalCandidate[]; checksum: string; candidate_count: number } = JSON.parse(readFileSync(APPROVAL_SNAPSHOT_PATH, "utf-8"));
  const recomputedChecksum = computeApprovalChecksum(
    snapshot.candidates.map((c) => ({ id: c.staging_id, officialId: c.official_corroboration_id, decision: c.decision }))
  );
  console.log(`Snapshot candidates : ${snapshot.candidates.length} (champ candidate_count : ${snapshot.candidate_count})`);
  console.log(`Checksum stocké     : ${snapshot.checksum}`);
  console.log(`Checksum recalculé  : ${recomputedChecksum}`);
  if (recomputedChecksum !== snapshot.checksum) {
    console.error("\n❌ STOP — le checksum recalculé ne correspond pas au checksum stocké. Le snapshot a pu être modifié depuis R.3.1. Ne jamais recréer silencieusement un nouveau snapshot.");
    process.exit(1);
  }
  console.log("✅ Checksum valide.\n");

  const [staging, live] = await Promise.all([
    fetchAllPaginated<StagingRow>(url, serviceKey, "/rest/v1/establishment_import_staging?select=id,status,source_ministry,source_url,official_identifier,city,region,name_raw,education_family"),
    fetchAllPaginated<LiveEstablishment>(url, serviceKey, "/rest/v1/establishments?select=id,name,city,region,official_id"),
  ]);
  const establishmentsBefore = live.length;
  console.log(`Establishments (live) : ${establishmentsBefore}`);
  console.log(`Staging (total) : ${staging.length}`);

  const stagingById = new Map(staging.map((r) => [r.id, r]));
  const liveByExactKey = new Map<string, LiveEstablishment[]>();
  for (const l of live) {
    const k = exactKey(l.name);
    if (!liveByExactKey.has(k)) liveByExactKey.set(k, []);
    liveByExactKey.get(k)!.push(l);
  }

  // §3/§6/§7 — revalidation complète en direct de chacun des 161 (jamais une confiance aveugle dans R.3.1).
  interface Decision {
    candidate: ApprovalCandidate;
    row: StagingRow;
    eligible: boolean;
    reason: string;
  }
  const decisions: Decision[] = [];
  let alreadyLive = 0,
    statusChanged = 0,
    notFoundInStaging = 0;

  for (const c of snapshot.candidates) {
    const row = stagingById.get(c.staging_id);
    if (!row) {
      notFoundInStaging++;
      decisions.push({ candidate: c, row: undefined as unknown as StagingRow, eligible: false, reason: "NOT_FOUND_IN_STAGING" });
      continue;
    }
    if (row.status !== "ready") {
      statusChanged++;
      decisions.push({ candidate: c, row, eligible: false, reason: `STATUS_CHANGED (actuel: ${row.status})` });
      continue;
    }
    const liveMatches = liveByExactKey.get(exactKey(row.name_raw)) ?? [];
    if (liveMatches.length > 0) {
      alreadyLive++;
      decisions.push({ candidate: c, row, eligible: false, reason: `ALREADY_LIVE (match: ${liveMatches[0].name})` });
      continue;
    }
    decisions.push({ candidate: c, row, eligible: true, reason: "ELIGIBLE" });
  }

  // Doublons internes au lot des 161 (nom+ville exact, ou même identifiant de corroboration revendiqué deux fois).
  const eligibleDecisions = decisions.filter((d) => d.eligible);
  const byNameCity = new Map<string, Decision[]>();
  const byCorrobId = new Map<string, Decision[]>();
  for (const d of eligibleDecisions) {
    const k1 = `${exactKey(d.row.name_raw)}|${d.row.city ?? ""}`;
    if (!byNameCity.has(k1)) byNameCity.set(k1, []);
    byNameCity.get(k1)!.push(d);
    if (d.candidate.official_corroboration_id) {
      if (!byCorrobId.has(d.candidate.official_corroboration_id)) byCorrobId.set(d.candidate.official_corroboration_id, []);
      byCorrobId.get(d.candidate.official_corroboration_id)!.push(d);
    }
  }
  let duplicateBlocked = 0;
  const duplicateIds = new Set<string>();
  for (const group of [...byNameCity.values(), ...byCorrobId.values()]) {
    if (group.length > 1) {
      for (const d of group) duplicateIds.add(d.candidate.staging_id);
    }
  }
  for (const d of eligibleDecisions) {
    if (duplicateIds.has(d.candidate.staging_id)) {
      d.eligible = false;
      d.reason = "DUPLICATE_BLOCKED (collision interne détectée à la revalidation R.3.2)";
      duplicateBlocked++;
    }
  }

  const finalEligible = decisions.filter((d) => d.eligible);
  const conflicts = 0; // aucun official_id copié -> aucun conflit d'identifiant officiel possible dans ce lot.

  console.log("\n=== DRY RUN ===");
  console.log(`Snapshot candidates: ${snapshot.candidates.length}`);
  console.log(`Eligible: ${finalEligible.length}`);
  console.log(`Already live: ${alreadyLive}`);
  console.log(`Conflicts: ${conflicts}`);
  console.log(`Duplicate blocked: ${duplicateBlocked}`);
  console.log(`Source blocked: 0`);
  console.log(`Status changed / not found: ${statusChanged + notFoundInStaging}`);
  console.log(`Would insert: ${finalEligible.length}`);
  console.log(`Would link staging: ${finalEligible.length}`);
  console.log(`Would update existing: 0`);
  console.log(`Would delete: 0`);
  console.log(`Expected production total after: ${establishmentsBefore + finalEligible.length}`);

  const computedChecksum = computeApprovalChecksum(finalEligible.map((d) => ({ id: d.candidate.staging_id, officialId: d.candidate.official_corroboration_id, decision: "CLEAN_APPROVABLE" })));
  console.log(`\nChecksum du sous-ensemble réellement éligible maintenant : ${computedChecksum}`);
  if (finalEligible.length !== snapshot.candidates.length) {
    console.log(`⚠️  Le nombre éligible (${finalEligible.length}) diffère du snapshot (${snapshot.candidates.length}) — le checksum d'approbation original ne peut PAS être réutilisé tel quel si des candidats ont été exclus à la revalidation.`);
  }

  try {
    assertRegistryProductionWriteAllowed({
      commit,
      confirmPhrase: argValue(args, "confirm"),
      projectRef,
      batch: REGISTRY_IMPORT_BATCH,
      expectedBatch: REGISTRY_IMPORT_BATCH,
      sourceMinistry: "OTHER",
      expectedSourceMinistry: "OTHER",
      actualCandidates: finalEligible.length,
      expectedCandidates: Number(argValue(args, "expected-count") ?? NaN),
      computedChecksum,
      approvalChecksum: argValue(args, "approval-checksum"),
      operator: argValue(args, "operator"),
      expectedOperator: EXPECTED_OPERATOR,
    });
  } catch (error) {
    if (error instanceof RegistryWriteRefused) {
      console.log(`\n${error.message}`);
      console.log("\nAUCUNE écriture production effectuée. STOP — voir rapport PRE-FLIGHT.");
      return;
    }
    throw error;
  }

  const approvedBy = argValue(args, "approved-by");
  if (!approvedBy || approvedBy.trim().length === 0) {
    console.error('\n❌ REFUSED — --approved-by manquant. Aucune phrase générique du prompt ne doit être utilisée comme approved_by (§10). Exiger un nom explicite fourni par Jean Merlain ou Eddy au moment de l\'autorisation.');
    process.exit(1);
  }

  console.log(`\n✅ Garde-fou : autorisé (approuvé par : ${approvedBy}). Écriture de ${finalEligible.length} établissement(s) par lots de ${BATCH_SIZE}.`);

  const timestamp = new Date().toISOString();
  let inserted = 0;
  let failed = 0;
  const failedRows: { staging_id: string; error: string }[] = [];
  const createdIds: { establishment_id: string; staging_id: string; official_corroboration_id: string | null }[] = [];
  const usedSlugs = new Set<string>();

  for (let i = 0; i < finalEligible.length; i += BATCH_SIZE) {
    const chunk = finalEligible.slice(i, i + BATCH_SIZE);
    const payload = chunk.map((d) => {
      const base = slugify(d.row.name_raw);
      let slug = base;
      let n = 1;
      while (usedSlugs.has(slug)) {
        slug = `${base}-${n}`;
        n++;
      }
      usedSlugs.add(slug);
      const corrobNote = d.candidate.official_corroboration_id
        ? `Corroboration officielle : cartescolaire.cm/minesec matricule ${d.candidate.official_corroboration_id} (${d.candidate.official_corroboration_id_type}) — voir SPRINT R.3.1/R.3.2, reports/registry/major-cities-official-corroboration-approval.json. official_id non renseigné : espace d'identifiants distinct de MINESEC V1 (SPRINT MINESEC V1.1).`
        : null;
      // §13 — pas de valeur inventée : owner_id/official_id null, is_verified false,
      // pas de description marketing, cover_image null, city/region tels que collectés.
      return {
        name: d.row.name_raw,
        slug,
        region: normalizeRegionCasing(d.row.region) ?? d.row.region,
        city: d.row.city,
        main_category: toMainCategory(d.row.education_family!),
        official_id: null,
        source_ministry: "OTHER",
        source_reference: corrobNote,
        source_url: d.row.source_url,
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
      for (const d of chunk) failedRows.push({ staging_id: d.candidate.staging_id, error: `insert HTTP ${res.status}` });
      continue;
    }
    const createdRows: { id: string }[] = await res.json();
    console.log(`  Lot ${i}-${i + chunk.length}: INSERT OK (${createdRows.length})`);

    for (let j = 0; j < createdRows.length; j++) {
      const created = createdRows[j];
      const d = chunk[j];
      const linkRes = await fetch(`${url}/rest/v1/establishment_import_staging?id=eq.${d.candidate.staging_id}`, {
        method: "PATCH",
        headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify({ promoted_establishment_id: created.id, promoted_at: timestamp, status: "promoted" }),
      });
      if (linkRes.ok) {
        inserted++;
        createdIds.push({ establishment_id: created.id, staging_id: d.candidate.staging_id, official_corroboration_id: d.candidate.official_corroboration_id });
      } else {
        failed++;
        failedRows.push({ staging_id: d.candidate.staging_id, error: `staging link HTTP ${linkRes.status} — établissement ${created.id} créé mais NON lié` });
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
    approved_by: approvedBy,
    git_commit: gitCommit,
    project_ref: projectRef,
    timestamp,
    approval_checksum: computedChecksum,
    registry_import_batch: REGISTRY_IMPORT_BATCH,
    eligible: finalEligible.length,
    inserted,
    skipped: alreadyLive + statusChanged + notFoundInStaging + duplicateBlocked,
    created: inserted,
    linked: inserted,
    failed,
    failed_rows: failedRows,
    outcome,
  };
  mkdirSync(join(rootDir, "reports", "registry"), { recursive: true });
  writeFileSync(join(rootDir, "reports", "registry", "major-cities-r3-2-promotion-summary.json"), JSON.stringify(report, null, 2), "utf-8");
  writeFileSync(
    join(rootDir, "reports", "registry", "major-cities-r3-2-created-ids.json"),
    JSON.stringify({ registry_import_batch: REGISTRY_IMPORT_BATCH, count: createdIds.length, establishments: createdIds }, null, 2),
    "utf-8"
  );

  const { complete, missing } = verifyPromotionReportComplete(report);
  if (!complete) {
    console.error(`\n❌ AUDIT INCOMPLETE — champs manquants : ${missing.join(", ")}`);
    process.exitCode = 1;
  } else {
    console.log(`\nRapports écrits : major-cities-r3-2-promotion-summary.json, major-cities-r3-2-created-ids.json`);
  }
  if (outcome !== "SUCCESS") {
    console.error(`\n⚠️ ${outcome} — ne pas relancer --commit, réconcilier manuellement.`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("Échec de la promotion Major Cities R.3.2 :", error);
  process.exit(1);
});
