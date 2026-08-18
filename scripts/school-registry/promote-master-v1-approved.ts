import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeName } from "./lib/normalize";

/**
 * SPRINT P.3 §17-24 — Promotion contrôlée des lignes de
 * `establishment_import_staging` approuvées via le Registry Review Center
 * (raw_data._review.review_action === "approved_for_promotion").
 *
 * ==========================================================================
 * PRÉPARÉ MAIS NON EXÉCUTÉ EN MODE --commit. Dry-run uniquement ce sprint.
 * ==========================================================================
 *
 * Règle d'éligibilité déterministe (§17) — PROMOTABLE si TOUT est vrai :
 *   - official_id présent
 *   - source_ministry = MINESEC
 *   - name_raw présent
 *   - region présente
 *   - education_family (catégorie) présente
 *   - aucun duplicate non résolu (status doit être 'ready', jamais
 *     duplicate_exact/duplicate_review — ceux-là passent par le Review
 *     Center, jamais par ce script)
 *   - raw_data._review.review_action === "approved_for_promotion"
 * `city` PEUT être NULL (migration 0019).
 *
 * NON PROMOTABLE (§18), avec raison explicite dans le rapport :
 *   - duplicate_unresolved (status != ready)
 *   - not_approved (pas de _review ou action != approved_for_promotion)
 *   - excluded (_review.review_action === "excluded")
 *   - missing_official_id / missing_region / missing_category
 *   - already_exists (§20 : official_id déjà présent en production — skip,
 *     jamais un conflit bloquant, juste une ligne déjà là)
 *   - owned_school_conflict (§24 : correspondance nom+région avec une école
 *     déjà revendiquée par un propriétaire — on ne la touche JAMAIS)
 *
 * Protection idempotence/anti-doublon (§20) : avant de compter une ligne
 * comme "would insert", re-vérification live contre production par
 * source_ministry+official_id (exact), puis nom normalisé+région (sécurité
 * secondaire) — si une correspondance existe déjà, la ligne est retirée du
 * lot d'insertion (already_exists), jamais réinsérée.
 *
 * Chaque futur établissement créé porterait registry_import_batch (§22),
 * pour permettre d'identifier précisément son origine sans jamais coder de
 * DELETE automatique — la stratégie de rollback reste : filtrer par ce
 * champ et décider manuellement, établissement par établissement.
 *
 * Usage :
 *   tsx promote-master-v1-approved.ts --dry-run   (défaut)
 *   tsx promote-master-v1-approved.ts --commit     (NON EXÉCUTÉ ce sprint)
 *
 * ============================================================================
 * SPRINT P.5 §18 — NO DIRECT PROMOTION WITHOUT STAGING DECISION.
 * Le batch minesec-master-v1-promotion-p3 a déjà été promu (556/556, hors de
 * tout script tracé — voir reconcile-promotion-p3.ts pour la réparation de
 * traçabilité SPRINT P.5). Relancer ce script en --commit réinsérerait sur
 * le même batch : ne JAMAIS l'exécuter pendant SPRINT P.5. Toute promotion
 * future exige une nouvelle validation explicite d'Eddy et de l'architecte.
 * ============================================================================
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..", "..");

const EXPECTED_PROJECT_REF = "umcwwynrftidytxgqkwi";
const IMPORT_BATCH = "minesec-master-v1-promotion-p3";
const BATCH_SIZE = 100;

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}
function matchKey(nameNormalized: string): string {
  return nameNormalized.replace(/^lyce\s+/, "").replace(/^lycee\s+/, "").trim();
}
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

async function main() {
  const args = process.argv.slice(2);
  const commit = args.includes("--commit");

  if (commit) {
    // Garde explicite — le batch minesec-master-v1-promotion-p3 est déjà
    // promu (SPRINT P.5). NO DIRECT PROMOTION WITHOUT STAGING DECISION :
    // toute promotion future exige un nouveau batch + validation Eddy et
    // architecte, jamais une relance de ce script sur ce batch.
    throw new Error(
      `--commit est désactivé (batch "${IMPORT_BATCH}" déjà promu — voir reconcile-promotion-p3.ts). ` +
        `Utilisez --dry-run. Project ref attendu pour toute future promotion : ${EXPECTED_PROJECT_REF}. ` +
        "La promotion réelle d'un nouveau batch est une mission séparée, hors périmètre ici."
    );
  }

  const env = readFileSync(join(rootDir, ".env.local"), "utf-8");
  const url = readEnvVar(env, "NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = readEnvVar(env, "SUPABASE_SERVICE_ROLE_KEY");

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

  interface Decision {
    row: StagingRow;
    eligible: boolean;
    reason: string;
    alreadyExists: LiveEstablishment | null;
    ownedConflict: LiveEstablishment | null;
  }

  const decisions: Decision[] = staging.map((row) => {
    const reviewAction = row.raw_data?._review?.review_action;

    if (row.status !== "ready") {
      return { row, eligible: false, reason: "duplicate_unresolved", alreadyExists: null, ownedConflict: null };
    }
    if (reviewAction === "excluded") {
      return { row, eligible: false, reason: "excluded", alreadyExists: null, ownedConflict: null };
    }
    if (reviewAction !== "approved_for_promotion") {
      return { row, eligible: false, reason: "not_approved", alreadyExists: null, ownedConflict: null };
    }
    if (!row.official_identifier) {
      return { row, eligible: false, reason: "missing_official_id", alreadyExists: null, ownedConflict: null };
    }
    if (row.source_ministry !== "MINESEC") {
      return { row, eligible: false, reason: "unsupported_source_ministry", alreadyExists: null, ownedConflict: null };
    }
    if (!row.name_raw) {
      return { row, eligible: false, reason: "missing_name", alreadyExists: null, ownedConflict: null };
    }
    if (!row.region) {
      return { row, eligible: false, reason: "missing_region", alreadyExists: null, ownedConflict: null };
    }
    if (!row.education_family) {
      return { row, eligible: false, reason: "missing_category", alreadyExists: null, ownedConflict: null };
    }

    // §20 — re-vérification anti-doublon LIVE (jamais fondée sur un
    // instantané) : official_id exact d'abord.
    const officialIdHit = liveByOfficialId.get(row.official_identifier.trim().toUpperCase());
    if (officialIdHit) {
      return { row, eligible: false, reason: "already_exists", alreadyExists: officialIdHit, ownedConflict: null };
    }

    // Sécurité secondaire — nom normalisé + région, pour repérer une école
    // déjà revendiquée (owner_id) qu'on ne doit JAMAIS toucher (§24).
    const candidates = liveByRegion.get(stripAccents(row.region)) ?? [];
    const key = matchKey(row.name_normalized);
    const nameMatch = candidates.find((c) => matchKey(normalizeName(c.name)) === key && key.length > 0);
    if (nameMatch?.owner_id) {
      return { row, eligible: false, reason: "owned_school_conflict", alreadyExists: null, ownedConflict: nameMatch };
    }
    if (nameMatch) {
      // Correspondance nom+région sur une école non revendiquée : signalé,
      // mais ce script ne fusionne jamais — traité comme already_exists par
      // prudence (le Review Center est l'endroit pour décider, pas ce script).
      return { row, eligible: false, reason: "already_exists", alreadyExists: nameMatch, ownedConflict: null };
    }

    return { row, eligible: true, reason: "eligible", alreadyExists: null, ownedConflict: null };
  });

  const approved = decisions.filter((d) => d.row.raw_data?._review?.review_action === "approved_for_promotion").length;
  const alreadyExists = decisions.filter((d) => d.reason === "already_exists").length;
  const wouldInsert = decisions.filter((d) => d.eligible).length;
  const blocked = decisions.filter((d) => !d.eligible && d.reason !== "already_exists" && d.reason !== "not_approved" && d.reason !== "duplicate_unresolved").length;
  const conflicts = decisions.filter((d) => d.reason === "owned_school_conflict").length;

  console.log("=== DRY RUN — promote-master-v1-approved.ts ===");
  console.log(`Approved: ${approved}`);
  console.log(`Already exists: ${alreadyExists}`);
  console.log(`Would insert: ${wouldInsert}`);
  console.log(`Blocked: ${blocked} (hors already_exists/not_approved/duplicate_unresolved)`);
  console.log(`Conflicts (owned school): ${conflicts}`);

  const reasonCounts: Record<string, number> = {};
  for (const d of decisions) reasonCounts[d.reason] = (reasonCounts[d.reason] ?? 0) + 1;
  console.log("\nDétail par raison :", reasonCounts);

  mkdirSync(join(rootDir, "reports", "registry"), { recursive: true });

  const approvedRows = decisions.filter((d) => d.eligible);
  const approvedCsv = [
    "official_id,official_name,region,city,category,source,review_status,promotion_eligibility",
    ...approvedRows.map((d) =>
      [d.row.official_identifier, d.row.name_raw, d.row.region, d.row.city ?? "", d.row.education_family, d.row.source_ministry, "approved_for_promotion", "PROMOTABLE"]
        .map(csvEscape)
        .join(",")
    ),
  ].join("\n");
  writeFileSync(join(rootDir, "reports", "registry", "master-v1-approved-for-promotion.csv"), approvedCsv, "utf-8");

  const blockedRows = decisions.filter((d) => !d.eligible);
  const blockedCsv = [
    "official_id,name,reason,existing_match,review_action",
    ...blockedRows.map((d) =>
      [
        d.row.official_identifier,
        d.row.name_raw,
        d.reason,
        d.alreadyExists?.id ?? d.ownedConflict?.id ?? "",
        d.row.raw_data?._review?.review_action ?? "(aucune)",
      ]
        .map(csvEscape)
        .join(",")
    ),
  ].join("\n");
  writeFileSync(join(rootDir, "reports", "registry", "master-v1-blocked.csv"), blockedCsv, "utf-8");

  console.log(`\nRapports écrits : master-v1-approved-for-promotion.csv (${approvedRows.length} lignes), master-v1-blocked.csv (${blockedRows.length} lignes)`);
  console.log(`\nBatch size prévu pour --commit (non exécuté) : ${BATCH_SIZE} par lot, ${Math.ceil(wouldInsert / BATCH_SIZE)} lot(s) au total.`);
  console.log(`registry_import_batch prévu : "${IMPORT_BATCH}" (traçabilité pour rollback manuel — jamais de DELETE automatique).`);
  console.log("\nAUCUNE écriture effectuée (dry-run). --commit reste désactivé pour ce sprint (voir garde en tête de script).");
}

main().catch((error) => {
  console.error("Échec du dry-run de promotion :", error);
  process.exit(1);
});
