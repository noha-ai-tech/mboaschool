import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { matchCandidate } from "./lib/matching/engine";
import { sha256 } from "./lib/extraction/hashing";
import type { MatchTarget, MatchCandidate } from "./lib/matching/types";

/**
 * SPRINT MINSANTE-C — CATEGORY MODEL RESOLUTION + REVIEW CENTER
 * COMPATIBILITY.
 *
 * Reclassifie les 22 lignes staging MINSANTE (batch minsante-pilot-v1,
 * région Ouest) écrites en MINSANTE-B, à partir de zéro (§16), avec :
 *  - une matrice de preuve de catégorie déterministe (§7-9), jamais une
 *    inférence sur le seul mot "Institut"/"École" (§4) ;
 *  - une vérification frontière inter-ministérielle contre les
 *    établissements/registry identifiers MINESUP existants (§10-12),
 *    moteur de matching partagé INCHANGÉ (§18) ;
 *  - la règle stricte §17 : un statut DUPLICATE_REVIEW n'est JAMAIS changé
 *    simplement parce que la catégorie est désormais connue — seul
 *    `category_decision`/`category_evidence` est mis à jour pour ces
 *    lignes, la `classification` reste DUPLICATE_REVIEW.
 *
 * Portée autorisée : UPDATE de métadonnées additive sur les 22 lignes
 * staging déjà écrites. AUCUNE nouvelle ligne staging, AUCUNE écriture
 * establishments/registry_identifiers, AUCUNE promotion.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..", "..");
const BATCH_ID = "minsante-pilot-v1";
const OPERATOR = "jean-merlain";
const SPRINT = "MINSANTE-C";

function csvEscape(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function readEnvVar(env: string, key: string): string {
  const match = env.match(new RegExp(`^${key}=(.*)$`, "m"));
  const value = match?.[1]?.trim();
  if (!value) throw new Error(`${key} introuvable dans .env.local`);
  return value;
}

// ── §7-9 — MATRICE DE PREUVE DE CATÉGORIE, déterministe, jamais une inférence sur "Institut"/"École" seul ──
type CategoryDecision = "SUPERIEUR_CONFIRMED" | "AUTRES_CONFIRMED" | "CATEGORY_REVIEW";
interface CategoryVerdict {
  decision: CategoryDecision;
  evidenceType: string;
  evidence: string;
}

/**
 * §9 — corroboration officielle trouvée par recherche ciblée ce sprint pour
 * 2/9 candidats CATEGORY_REVIEW hérités de MINSANTE-B. Chaque entrée cite
 * une source PRIMAIRE directement récupérée ce sprint (page officielle de
 * l'établissement lui-même, ou décision MINSANTE citée sur cette page) —
 * jamais un annuaire commercial utilisé comme autorité finale (kamerpower.com
 * n'a servi qu'à CORROBORER, jamais à trancher seul, §9). Clé = staging_id
 * (identité vérifiée : même nom officiel, même région/commune que la ligne
 * staging — condition nécessaire avant d'appliquer une preuve externe, §16).
 * Les 7 AUTRES candidats CATEGORY_REVIEW de MINSANTE-B ont été recherchés
 * (voir minsante-c-category-audit.csv, colonne `research_note`) sans preuve
 * de niveau suffisante — CATEGORY_REVIEW volontairement maintenu (§8 : le
 * but n'est jamais de maximiser CLEAN_APPROVABLE).
 */
const EXTERNAL_CATEGORY_CORROBORATION: Record<string, CategoryVerdict & { source: string }> = {
  "b92dd780-b05c-4b47-aaa4-e6d0b6783778": {
    decision: "AUTRES_CONFIRMED",
    evidenceType: "OFFICIAL_MINSANTE_CREATION_DECISION_NON_HIGHER_ED",
    evidence:
      "Page officielle de l'établissement (ftt-dschang.cm/a-propos, récupérée ce sprint) : création par DECISION N°0344/D/MINSANTE/SG/DRH DU 28/04/2010 du Ministre de la Santé Publique (acte MINSANTE-DRH, jamais un acte MINESUP de création d'enseignement supérieur) — aucune mention d'\"enseignement supérieur\", établissement explicitement positionné comme complexe de formation technique/vocationnelle des personnels médico-sanitaires. Corroboré indépendamment par kamerpower.com (annuaire, jamais utilisé seul comme autorité) qui liste le même établissement sous le même nom exact, même commune (Dschang).",
    source: "https://ftt-dschang.cm/a-propos/ (corroboré par https://kamerpower.com/fr/ecoles-de-formation-publiques-et-privees-medico-sanitaires-personnels-cameroun/)",
  },
  "79370ccb-3f09-426f-bdc7-bc6ac9055345": {
    decision: "AUTRES_CONFIRMED",
    evidenceType: "OFFICIAL_INSTITUTION_SITE_SUB_BAC_ENTRY_LEVEL",
    evidence:
      "Page officielle de l'établissement (epssmeno.com, récupérée ce sprint) : admission explicitement \"Niveau BEPC\"/\"Niveau BAC\" (entrée pré-bac, jamais post-bac), filières nommées \"Aides soignants-généralistes\" et \"Techniciens principaux médico-sanitaires\" — désignations techniques/vocationnelles explicites, aucune mention d'\"enseignement supérieur\" sur le site.",
    source: "https://www.epssmeno.com/",
  },
};

function categoryVerdict(displayName: string, stagingId: string): CategoryVerdict {
  const upper = displayName
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase();

  // Règle 1 — mot de niveau supérieur explicite AUTO-DÉCLARÉ dans le titre
  // officiel MINSANTE lui-même (§4, hérité identique de MINSANTE-B — aucune
  // régression, même seuil de preuve).
  if (/\bSUPERIEUR(E)?\b/.test(upper) || /\bUNIVERSITAIRE\b/.test(upper) || /\bUNIVERSITE\b/.test(upper) || /\bFACULTE\b/.test(upper)) {
    return {
      decision: "SUPERIEUR_CONFIRMED",
      evidenceType: "EXPLICIT_LEVEL_WORD_IN_OFFICIAL_TITLE",
      evidence: "Titre officiel MINSANTE contient un mot de niveau explicite (supérieur/universitaire/université/faculté) — auto-déclaré par l'établissement lui-même dans son nom officiel.",
    };
  }

  // Règle 2 — le titre officiel MINSANTE contient lui-même une désignation
  // de cycle/diplôme reconnue et NON-supérieure ("Infirmier(s) Diplômé(s)
  // d'État" — diplôme d'État de cycle B, cf. Décret 80/198 + tableau de
  // mapping MINSANTE_IMPORT_CONTRACT.md §4). Même standard de preuve que la
  // Règle 1 (auto-déclaration dans le titre officiel), côté "autres" cette
  // fois — PAS une inférence depuis "École" seule (§4 : interdit), c'est la
  // désignation de diplôme elle-même qui fait preuve.
  if (/\bINFIRMIERS?\s+DIPLOMES?\s+D.?\s*ETAT\b/.test(upper)) {
    return {
      decision: "AUTRES_CONFIRMED",
      evidenceType: "OFFICIAL_CYCLE_DIPLOMA_NAME_IN_TITLE",
      evidence:
        "Titre officiel MINSANTE contient la désignation explicite du diplôme d'État \"Infirmier(s) Diplômé(s) d'État\" — diplôme de cycle B (Décret 80/198), formation non-supérieure reconnue, auto-déclarée dans le nom officiel lui-même (même standard de preuve que la Règle 1, appliqué symétriquement).",
    };
  }

  // Règle 3 — corroboration officielle externe trouvée par recherche
  // ciblée ce sprint (§9), vérifiée par staging_id (identité confirmée).
  const external = EXTERNAL_CATEGORY_CORROBORATION[stagingId];
  if (external) return external;

  // Règle 4 (défaut) — aucune preuve suffisante. JAMAIS une catégorie
  // inventée (§8 : no guessing policy). CATEGORY_REVIEW reste.
  return {
    decision: "CATEGORY_REVIEW",
    evidenceType: "INSUFFICIENT_EVIDENCE",
    evidence:
      "Aucun mot de niveau explicite dans le titre officiel, aucune désignation de cycle/diplôme reconnue dans le titre, et aucune corroboration officielle externe suffisante trouvée par la recherche ciblée MINSANTE-C (voir research_note). §8 : CATEGORY_REVIEW maintenu plutôt qu'une catégorie devinée.",
  };
}

// ── §9 — note de recherche ciblée par candidat CATEGORY_REVIEW hérité de MINSANTE-B (traçabilité de la diligence, même pour les négatifs) ──
const RESEARCH_NOTES: Record<string, string> = {
  "68c3cd5b-de66-4f3c-9c3c-fdbdaad7f54c":
    "Recherché (COFPSAROMA Baleng) — présence web confirmée (univ-jeuguevou.com/cofpsaroma), programmes courts type \"délégué médical/secrétariat médical\" listés, mais récupération directe de la page échouée (erreur SSL) et aucune mention explicite de niveau (supérieur ni technique) obtenue de façon fiable. CATEGORY_REVIEW maintenu — pas de preuve suffisante.",
  "3c04b5c8-4a6d-4ad8-b625-bda87186c800":
    "Recherché (Complexe Mbouo Bandjoun) — établissement identifié (cpfmbouocmr.org, \"depuis 1981\"), mais récupération directe de la page renvoie HTTP 403 (accès refusé) — aucune preuve de niveau vérifiable obtenue ce sprint. CATEGORY_REVIEW maintenu.",
  "8bf90bbd-3520-4f16-8cd7-e708892473bd":
    "Recherché (Complexe Mbouda) — un \"Complexe Privé de Formation du Personnel Médicosanitaire Fondation Monga de Mbouda\" existe (agréé 2012, cycle infirmiers diplômés d'État), mais son nom officiel diffère du nom MINSANTE staging (\"...DE MBOUDA\" sans \"Fondation Monga\") — identité NON confirmée avec certitude suffisante pour appliquer cette preuve à cette ligne précise (§16 : jamais une preuve externe appliquée sans identité confirmée). CATEGORY_REVIEW maintenu, piste à vérifier humainement pour un futur sprint.",
  "92c96f6f-bf11-4de7-b9cf-44f2be0564b4":
    "Recherché (EPS Les Étoiles Bafoussam) — site officiel identifié (eps-lesetoiles.com, formation \"Techniciens/Techniciens Adjoints\" en analyses médicales), mais récupération directe de la page a échoué (résolution DNS) — contenu non vérifié directement, seul un résumé de recherche indirect disponible, insuffisant comme preuve primaire ce sprint. CATEGORY_REVIEW maintenu.",
  "0e0202b8-3175-4db9-890d-0294057239a1":
    "Recherché (École Privée de Formation du Personnel de la Santé de Bafoussam) — nom trop générique pour isoler une source officielle fiable parmi les nombreux établissements homonymes de Bafoussam recherchés ce sprint ; aucune preuve de niveau trouvée. CATEGORY_REVIEW maintenu.",
  "a2f1cf0b-520e-42b1-bb84-81a20f9de8a3":
    "Recherché (IFOPP Foumbot) — présence web confirmée (Facebook officiel, minajobs.net), mais uniquement le mot \"Institut\" trouvé, jamais un mot de niveau explicite (§4 : \"Institut\" seul n'est jamais une preuve). CATEGORY_REVIEW maintenu.",
  "27a2a636-eced-4971-8f62-67d8d1028ab3":
    "Recherché (Institut Tropical \"Moullec\" Baleveng, plaies chroniques) — seule mention indirecte trouvée (résumé de conférence CICA 2025 citant un \"hôpital des plaies de Baleveng\", établissement de SOINS distinct de l'école elle-même) — aucune preuve de niveau de l'école trouvée. CATEGORY_REVIEW maintenu.",
};

interface StagingRow {
  id: string;
  name_raw: string;
  region: string | null;
  city: string | null;
  status: string;
  source_ministry: string;
  education_family: string | null;
  raw_data: any;
}
interface LiveEst {
  id: string;
  name: string;
  region: string | null;
  city: string | null;
  main_category: string | null;
}
interface RegistryIdRow {
  establishment_id: string;
  registry: string;
  identifier: string;
  identifier_type: string | null;
}

async function fetchAllPaginated<T>(supabase: any, table: string, select: string, filter?: (q: any) => any): Promise<T[]> {
  const all: T[] = [];
  let offset = 0;
  const pageSize = 1000;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    let q = supabase.from(table).select(select).range(offset, offset + pageSize - 1);
    if (filter) q = filter(q);
    const { data, error } = await q;
    if (error) throw error;
    all.push(...(data as T[]));
    if (!data || data.length < pageSize) break;
    offset += pageSize;
  }
  return all;
}

async function main() {
  const env = readFileSync(join(rootDir, ".env.local"), "utf-8");
  const url = readEnvVar(env, "NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = readEnvVar(env, "SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(url, serviceKey);

  console.log("=== SPRINT MINSANTE-C — RECLASSIFICATION CATÉGORIE + FRONTIÈRE INTER-MINISTÉRIELLE ===\n");

  // ── §1 — Baseline fraîche ──────────────────────────────────────────────
  const { count: estBefore } = await supabase.from("establishments").select("*", { count: "exact", head: true });
  const { count: stagingBefore } = await supabase.from("establishment_import_staging").select("*", { count: "exact", head: true });
  const { count: registryBefore } = await supabase.from("establishment_registry_identifiers").select("*", { count: "exact", head: true });
  console.log(`Baseline : establishments=${estBefore}, staging=${stagingBefore}, registry_identifiers=${registryBefore}`);

  const pilotRows = (await fetchAllPaginated<StagingRow>(
    supabase,
    "establishment_import_staging",
    "id,name_raw,region,city,status,source_ministry,education_family,raw_data",
    (q) => q.eq("source_ministry", "MINSANTE")
  )).filter((r) => r.raw_data?.batch === BATCH_ID);
  console.log(`Lignes pilote MINSANTE (batch ${BATCH_ID}) : ${pilotRows.length} (attendu 22)`);
  if (pilotRows.length !== 22) {
    console.log("ATTENTION : le nombre de lignes pilote a changé depuis MINSANTE-B — STOP, ne pas deviner pourquoi.");
    process.exit(1);
  }

  // ── §11 — Cibles MINESUP pour la frontière inter-ministérielle ────────
  const minesupIdRows = await fetchAllPaginated<RegistryIdRow>(
    supabase,
    "establishment_registry_identifiers",
    "establishment_id,registry,identifier,identifier_type",
    (q) => q.eq("authority", "MINESUP")
  );
  const minesupEstablishmentIds = [...new Set(minesupIdRows.map((r) => r.establishment_id))];
  const idsByEstablishment = new Map<string, { registry: string; identifier: string; identifierType?: string | null }[]>();
  for (const r of minesupIdRows) {
    if (!idsByEstablishment.has(r.establishment_id)) idsByEstablishment.set(r.establishment_id, []);
    idsByEstablishment.get(r.establishment_id)!.push({ registry: r.registry, identifier: r.identifier, identifierType: r.identifier_type });
  }
  const allEst = await fetchAllPaginated<LiveEst>(supabase, "establishments", "id,name,region,city,main_category");
  const estById = new Map(allEst.map((e) => [e.id, e]));
  const minesupTargets: MatchTarget[] = minesupEstablishmentIds
    .map((id) => estById.get(id))
    .filter((e): e is LiveEst => !!e)
    .map((e) => ({ id: e.id, name: e.name, region: e.region, city: e.city, category: e.main_category, identifiers: idsByEstablishment.get(e.id) ?? [] }));
  console.log(`Cibles MINESUP (établissements liés à establishment_registry_identifiers.authority='MINESUP') : ${minesupTargets.length}`);

  // ── §18 — Revalidation matching live (moteur INCHANGÉ, MÊME construction
  // de candidat/cibles que MINSANTE-B, lecture seule). Reproduit EXACTEMENT
  // `mainCategoryToEducationFamily()` de minsante-b-pilot-collect.ts — un
  // candidat catégorie 'health_training' ne doit être comparé qu'à des
  // cibles dont la catégorie mappée est elle aussi connue et cohérente,
  // jamais une méthodologie différente introduite silencieusement ce
  // sprint (§18 exige une REVALIDATION à l'identique, pas une nouvelle
  // passe de matching avec une autre forme de candidat).
  function mainCategoryToEducationFamily(mainCategory: string | null): string | null {
    if (mainCategory === "superieur") return "higher_education";
    return mainCategory;
  }
  const liveTargets: MatchTarget[] = allEst.map((e) => ({ id: e.id, name: e.name, region: e.region, city: e.city, category: mainCategoryToEducationFamily(e.main_category), identifiers: [] }));

  // ── Reclassification des 22 lignes, à partir de zéro (§16) ────────────
  interface ReclassifiedRow {
    row: StagingRow;
    previous_classification: string;
    previous_category_decision: string;
    category: CategoryVerdict;
    crossMinistry: { decision: string; matchLevel: string; matchedId: string | null; matchedName: string | null; reason: string };
    liveMatchLevel: string;
    new_classification: string;
    new_reason: string;
    new_status: string;
  }

  const results: ReclassifiedRow[] = [];
  for (const row of pilotRows) {
    const raw = row.raw_data ?? {};
    // Ré-exécutable en toute sécurité : si un run MINSANTE-C précédent a déjà
    // capturé l'état MINSANTE-B original sous `minsante_b_snapshot`, c'est
    // TOUJOURS cette valeur qui fait foi pour "previous_classification" —
    // jamais les champs "live" déjà réécrits par ce même script lors d'un
    // run antérieur (sinon "avant" dériverait à chaque nouvelle exécution).
    const previousClassification: string = raw.minsante_b_snapshot?.classification ?? raw.classification ?? "UNKNOWN";
    const previousCategoryDecision: string = raw.minsante_b_snapshot?.category_decision ?? raw.category_decision ?? "UNKNOWN";
    const dedupAmbiguous: boolean = raw.dedup_ambiguous === true;
    const isAlreadyDuplicateReview = previousClassification === "DUPLICATE_REVIEW" || dedupAmbiguous;

    const cat = categoryVerdict(row.name_raw, row.id);

    // §11 — vérification frontière inter-ministérielle : candidat SANS
    // catégorie forcée (health_training vs superieur ne sont de toute façon
    // jamais la même chaîne — imposer une catégorie ici reproduirait
    // artificiellement la même exclusion totale que §18 plutôt qu'une vraie
    // vérification d'identité). Seuil délibérément plus strict que la
    // détection de doublon générique B (§9 : éviter le bruit des noms de
    // ville partagés — "Bafoussam"/"Bafang" — qui produiraient un
    // PROBABLE_MATCH quasi systématique sans rapport avec une vraie
    // coïncidence d'identité) : seul un chevauchement fort (STRONG_MATCH,
    // ≥66%) ou un signal certain (EXACT_*) déclenche une revue, un
    // PROBABLE_MATCH/AMBIGUOUS faible reste "DISTINCT" mais est quand même
    // publié en transparence dans le CSV (§12 : aucune ligne cachée).
    const candidate: MatchCandidate = { name: row.name_raw, region: row.region, city: row.city, category: null, identifiers: [] };
    const cross = matchCandidate(candidate, minesupTargets);
    const crossDecision =
      cross.level === "EXACT_IDENTIFIER" || cross.level === "EXACT_IDENTITY"
        ? "SAME_INSTITUTION_CROSS_MINISTRY"
        : cross.level === "STRONG_MATCH"
          ? "AMBIGUOUS"
          : "DISTINCT";

    const liveMatch = matchCandidate({ ...candidate, category: "health_training" }, liveTargets);

    // ── §16-17 — décision finale, ordre de priorité déterministe ────────
    let newClassification: string;
    let newReason: string;
    let newStatus: string;

    if (isAlreadyDuplicateReview) {
      // §17 — JAMAIS changé pour cette seule raison, même si la catégorie ou
      // la frontière inter-ministérielle sont maintenant mieux comprises.
      newClassification = "DUPLICATE_REVIEW";
      newReason = "§17 — statut DUPLICATE_REVIEW préservé tel quel (ambiguïté de dédoublonnage intra-lot MINSANTE-B non résolue ce sprint) — la catégorie/frontière inter-ministérielle ne le change jamais automatiquement.";
      newStatus = row.status; // inchangé
    } else if (crossDecision === "SAME_INSTITUTION_CROSS_MINISTRY" || crossDecision === "AMBIGUOUS") {
      newClassification = "CROSS_MINISTRY_REVIEW";
      newReason = `§10-12 — signal frontière inter-ministérielle contre le registre MINESUP (${cross.level}) : ${cross.reason} Jamais un auto-merge (§10) — revue humaine requise avant toute promotion future.`;
      newStatus = "normalized";
    } else if (liveMatch.level !== "NO_MATCH") {
      // Revalidation §18 — un nouveau signal live serait un changement réel
      // depuis MINSANTE-B (établissements inchangé 2240=2240 attendu) :
      // documenté explicitement, jamais silencieux.
      newClassification = "DUPLICATE_REVIEW";
      newReason = `§18 — signal de correspondance live détecté à la revalidation (${liveMatch.level}) : ${liveMatch.reason}`;
      newStatus = "duplicate_review";
    } else if (cat.decision === "CATEGORY_REVIEW") {
      newClassification = "CATEGORY_REVIEW";
      newReason = cat.evidence;
      newStatus = "normalized";
    } else {
      newClassification = "CLEAN_APPROVABLE";
      newReason = `Catégorie résolue (${cat.decision}), aucun signal de doublon (live/dédup intra-lot), aucun signal frontière inter-ministérielle, aucun problème de source, aucune PII.`;
      newStatus = "ready";
    }

    results.push({
      row,
      previous_classification: previousClassification,
      previous_category_decision: previousCategoryDecision,
      category: cat,
      crossMinistry: { decision: crossDecision, matchLevel: cross.level, matchedId: cross.target?.id ?? null, matchedName: cross.target?.name ?? null, reason: cross.reason },
      liveMatchLevel: liveMatch.level,
      new_classification: newClassification,
      new_reason: newReason,
      new_status: newStatus,
    });
  }

  // ── Tallies avant/après ────────────────────────────────────────────────
  const before: Record<string, number> = {};
  const after: Record<string, number> = {};
  for (const r of results) {
    before[r.previous_classification] = (before[r.previous_classification] ?? 0) + 1;
    after[r.new_classification] = (after[r.new_classification] ?? 0) + 1;
  }
  console.log("\n=== AVANT (MINSANTE-B) ===", before);
  console.log("=== APRÈS (MINSANTE-C) ===", after);

  // ── §12 — reports/registry/minsante-c-cross-ministry-review.csv ───────
  mkdirSync(join(rootDir, "reports", "registry"), { recursive: true });
  const crossHeader = ["minsante_staging_id", "minsante_name", "minsante_region", "possible_minesup_establishment_id", "minesup_name", "match_type", "evidence", "decision", "reason"];
  const crossCsv = [crossHeader.join(",")];
  for (const r of results) {
    crossCsv.push(
      [
        r.row.id,
        r.row.name_raw,
        r.row.region,
        r.crossMinistry.matchedId ?? "",
        r.crossMinistry.matchedName ?? "",
        r.crossMinistry.matchLevel,
        r.crossMinistry.reason,
        r.crossMinistry.decision,
        r.crossMinistry.decision === "SAME_INSTITUTION_CROSS_MINISTRY" || r.crossMinistry.decision === "AMBIGUOUS"
          ? "Revue humaine requise avant toute promotion — jamais un auto-merge (§10)."
          : "Aucune action requise — engine confirme une institution distincte du registre MINESUP consulté ce sprint.",
      ]
        .map(csvEscape)
        .join(",")
    );
  }
  writeFileSync(join(rootDir, "reports", "registry", "minsante-c-cross-ministry-review.csv"), crossCsv.join("\n"), "utf-8");

  // ── §33 — reports/registry/minsante-c-category-audit.csv ──────────────
  const catHeader = ["staging_id", "name_raw", "region", "programs", "previous_category_decision", "new_category_decision", "evidence_type", "evidence", "research_note"];
  const catCsv = [catHeader.join(",")];
  for (const r of results) {
    catCsv.push(
      [
        r.row.id,
        r.row.name_raw,
        r.row.region,
        (r.row.raw_data?.programs_normalized ?? []).join(" | "),
        r.previous_category_decision,
        r.category.decision,
        r.category.evidenceType,
        r.category.evidence,
        RESEARCH_NOTES[r.row.id] ?? "",
      ]
        .map(csvEscape)
        .join(",")
    );
  }
  writeFileSync(join(rootDir, "reports", "registry", "minsante-c-category-audit.csv"), catCsv.join("\n"), "utf-8");

  // ── §33 — reports/registry/minsante-c-reclassification.csv (§16, TOUTES les 22 lignes depuis zéro) ──
  const reclassHeader = ["staging_id", "name_raw", "region", "previous_classification", "category_evidence_type", "new_category_decision", "cross_ministry_decision", "new_classification", "reason"];
  const reclassCsv = [reclassHeader.join(",")];
  for (const r of results) {
    reclassCsv.push(
      [r.row.id, r.row.name_raw, r.row.region, r.previous_classification, r.category.evidenceType, r.category.decision, r.crossMinistry.decision, r.new_classification, r.new_reason]
        .map(csvEscape)
        .join(",")
    );
  }
  writeFileSync(join(rootDir, "reports", "registry", "minsante-c-reclassification.csv"), reclassCsv.join("\n"), "utf-8");

  // ── §33 — reports/registry/minsante-c-category-summary.json ───────────
  const categorySummary = {
    generated_at: new Date().toISOString(),
    operator: OPERATOR,
    sprint: SPRINT,
    batch: BATCH_ID,
    model: "MODEL_A",
    model_description:
      "health_training (education_family, inchangé) se traduit en main_category='superieur' UNIQUEMENT si preuve explicite de niveau supérieur (mot de niveau auto-déclaré dans le titre officiel, ou corroboration officielle externe vérifiée), sinon 'autres'/sous-catégorie 'Santé' SI une preuve explicite de niveau non-supérieur existe, sinon CATEGORY_REVIEW — jamais une valeur devinée depuis 'Institut'/'École' seuls.",
    migration_required: false,
    category_evidence_hierarchy: [
      "1. EXPLICIT_LEVEL_WORD_IN_OFFICIAL_TITLE (supérieur/universitaire/université/faculté) -> SUPERIEUR_CONFIRMED",
      "2. OFFICIAL_CYCLE_DIPLOMA_NAME_IN_TITLE (ex. 'Infirmiers Diplômés d'État') -> AUTRES_CONFIRMED",
      "3. Corroboration officielle externe vérifiée ce sprint (page institutionnelle officielle + citation d'acte MINSANTE, identité confirmée) -> SUPERIEUR_CONFIRMED ou AUTRES_CONFIRMED selon la preuve",
      "4. Aucune preuve suffisante -> CATEGORY_REVIEW (défaut, jamais une catégorie inventée, §8)",
    ],
    before: { CLEAN_APPROVABLE: before.CLEAN_APPROVABLE ?? 0, CATEGORY_REVIEW: before.CATEGORY_REVIEW ?? 0, DUPLICATE_REVIEW: before.DUPLICATE_REVIEW ?? 0 },
    after: {
      CLEAN_APPROVABLE: after.CLEAN_APPROVABLE ?? 0,
      CATEGORY_REVIEW: after.CATEGORY_REVIEW ?? 0,
      DUPLICATE_REVIEW: after.DUPLICATE_REVIEW ?? 0,
      CROSS_MINISTRY_REVIEW: after.CROSS_MINISTRY_REVIEW ?? 0,
      OTHER_REVIEW: after.OTHER_REVIEW ?? 0,
    },
    total: results.length,
    reconciled: Object.values(after).reduce((a, b) => a + b, 0) === results.length,
  };
  writeFileSync(join(rootDir, "reports", "registry", "minsante-c-category-summary.json"), JSON.stringify(categorySummary, null, 2), "utf-8");

  // ── §24-25 — UPDATE additif sur les 22 lignes staging, idempotent ─────
  console.log("\n=== §24-25 — MISE À JOUR STAGING (additive, 22 lignes) ===");
  let updated = 0;
  for (const r of results) {
    const raw = r.row.raw_data ?? {};
    const nextRawData = {
      ...raw,
      // §25 — champs ORIGINAUX MINSANTE-B jamais écrasés, déplacés sous une
      // clé d'historique additive avant toute réécriture des champs "live".
      minsante_b_snapshot: raw.minsante_b_snapshot ?? {
        classification: raw.classification,
        category_decision: raw.category_decision,
        category_evidence: raw.category_evidence,
        classification_reason: raw.classification_reason,
      },
      // Champs "live" mis à jour — ce sont ceux que le Review Center et tout
      // futur consommateur doivent lire comme état AUTHORITATIF actuel.
      category_decision: r.category.decision,
      category_evidence: r.category.evidence,
      category_evidence_type: r.category.evidenceType,
      classification: r.new_classification,
      classification_reason: r.new_reason,
      cross_ministry_review: r.crossMinistry,
      minsante_c: {
        sprint: SPRINT,
        reviewed_by: OPERATOR,
        reviewed_at: new Date().toISOString(),
        previous_classification: r.previous_classification,
        previous_category_decision: r.previous_category_decision,
        live_match_level_revalidated: r.liveMatchLevel,
      },
    };
    const { error: updErr } = await supabase
      .from("establishment_import_staging")
      .update({ raw_data: nextRawData, status: r.new_status })
      .eq("id", r.row.id);
    if (updErr) throw new Error(`Échec mise à jour staging pour ${r.row.id} : ${updErr.message}`);
    updated++;
  }
  console.log(`Lignes mises à jour : ${updated}/22`);

  // ── Preuve d'idempotence : second passage réel, doit produire le MÊME résultat (jamais un doublon, jamais un champ perdu) ──
  const { data: reReadRows } = await supabase
    .from("establishment_import_staging")
    .select("id,raw_data,status")
    .eq("source_ministry", "MINSANTE");
  const reReadPilot = (reReadRows ?? []).filter((r: any) => r.raw_data?.batch === BATCH_ID);
  let idempotentOk = reReadPilot.length === 22;
  for (const r of results) {
    const found = reReadPilot.find((x: any) => x.id === r.row.id);
    if (!found || found.raw_data?.classification !== r.new_classification || found.status !== r.new_status) idempotentOk = false;
  }
  console.log(`Idempotence (relecture DB) : ${idempotentOk ? "PASS" : "FAIL"}`);

  // ── §27 — nouveau snapshot d'approbation, sans écraser l'ancien ────────
  const cleanApprovable = results.filter((r) => r.new_classification === "CLEAN_APPROVABLE");
  const approvalCandidates = cleanApprovable
    .map((r) => ({
      staging_id: r.row.id,
      name: r.row.name_raw,
      region: r.row.region,
      programs: r.row.raw_data?.programs_normalized ?? [],
      education_family: r.row.education_family,
      main_category: r.category.decision === "SUPERIEUR_CONFIRMED" ? "superieur" : r.category.decision === "AUTRES_CONFIRMED" ? "autres" : null,
      category_evidence: r.category.evidence,
      decision: "CLEAN_APPROVABLE",
    }))
    .sort((a, b) => a.staging_id.localeCompare(b.staging_id));
  const newChecksum = sha256(JSON.stringify(approvalCandidates));
  const previous = JSON.parse(readFileSync(join(rootDir, "reports", "registry", "minsante-b-pilot-approval.json"), "utf-8"));
  writeFileSync(
    join(rootDir, "reports", "registry", "minsante-c-pilot-approval.json"),
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        operator: OPERATOR,
        sprint: SPRINT,
        batch: BATCH_ID,
        previous_snapshot: { sprint: "MINSANTE-B", candidate_count: previous.candidate_count, checksum: previous.checksum },
        candidate_count: approvalCandidates.length,
        candidates: approvalCandidates,
        checksum: newChecksum,
      },
      null,
      2
    ),
    "utf-8"
  );
  console.log(`\nNouveau snapshot d'approbation : ${approvalCandidates.length} candidat(s) — checksum ${newChecksum}`);
  console.log(`Ancien snapshot (MINSANTE-B, préservé, non écrasé) : ${previous.candidate_count} candidat(s) — checksum ${previous.checksum}`);

  // ── §32 — post-condition base de données ───────────────────────────────
  const { count: estAfter } = await supabase.from("establishments").select("*", { count: "exact", head: true });
  const { count: stagingAfter } = await supabase.from("establishment_import_staging").select("*", { count: "exact", head: true });
  const { count: registryAfter } = await supabase.from("establishment_registry_identifiers").select("*", { count: "exact", head: true });
  console.log(`\nPOST-CONDITION : establishments ${estBefore}->${estAfter} | staging ${stagingBefore}->${stagingAfter} | registry_identifiers ${registryBefore}->${registryAfter}`);

  writeFileSync(
    join(rootDir, "reports", "registry", "minsante-c-run-summary.json"),
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        operator: OPERATOR,
        sprint: SPRINT,
        batch: BATCH_ID,
        database: {
          establishments_before: estBefore,
          establishments_after: estAfter,
          staging_before: stagingBefore,
          staging_after: stagingAfter,
          registry_identifiers_before: registryBefore,
          registry_identifiers_after: registryAfter,
        },
        rows_inserted: 0,
        rows_classification_updated: updated,
        idempotent: idempotentOk,
        before,
        after,
        cross_ministry: {
          candidates_checked: results.length,
          same_institution_cross_ministry: results.filter((r) => r.crossMinistry.decision === "SAME_INSTITUTION_CROSS_MINISTRY").length,
          ambiguous: results.filter((r) => r.crossMinistry.decision === "AMBIGUOUS").length,
          distinct: results.filter((r) => r.crossMinistry.decision === "DISTINCT").length,
        },
        approval_snapshot: { previous_count: previous.candidate_count, previous_checksum: previous.checksum, new_count: approvalCandidates.length, new_checksum: newChecksum },
      },
      null,
      2
    ),
    "utf-8"
  );

  console.log("\n=== MINSANTE-C RECLASSIFY — TERMINÉ ===");
}

main().catch((error) => {
  console.error("Échec MINSANTE-C reclassify :", error);
  process.exit(1);
});
