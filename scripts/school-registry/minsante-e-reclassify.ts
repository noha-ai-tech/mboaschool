import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { matchCandidate } from "./lib/matching/engine";
import { sha256 } from "./lib/extraction/hashing";
import type { MatchTarget, MatchCandidate } from "./lib/matching/types";

/**
 * SPRINT MINSANTE-E — CATEGORY REVIEW RESOLUTION + APPROVAL POPULATION
 * CONSOLIDATION.
 *
 * Traite les 15 lignes staging MINSANTE (batch minsante-pilot-v1, région
 * Ouest) actuellement classification=CATEGORY_REVIEW, avec la MÊME matrice
 * de preuve déterministe que minsante-c-reclassify.ts (Model A, §4 du
 * brief — jamais affaibli), enrichie ce sprint d'une corroboration
 * officielle externe VÉRIFIÉE DIRECTEMENT pour 1/15 candidats (§6 : Tier
 * 1/2 uniquement comme autorité finale, jamais un annuaire commercial
 * seul).
 *
 * Politique stricte appliquée (§5, §13 du brief) : "aucune preuve = aucune
 * reclassification" — 14/15 candidats restent CATEGORY_REVIEW faute de
 * preuve Tier 1/2 vérifiable ce sprint (sites officiels injoignables :
 * SSL/DNS/timeout/403, cf. RESEARCH_NOTES ci-dessous pour la trace
 * complète par candidat), jamais une catégorie devinée sur la popularité,
 * le branding, ou la seule apparence du nom.
 *
 * La ligne DUPLICATE_REVIEW restante (276633af, doublon non-canonique de
 * "Ecole des Metiers de la Sante de Bamougoum") est explicitement HORS
 * PÉRIMÈTRE de reclassification de `classification` (§17 : le blocage de
 * doublon prime toujours) — seule sa `category_decision` est rafraîchie
 * en cohérence avec le verdict de son canonique, sa `classification`
 * reste DUPLICATE_REVIEW.
 *
 * Portée : UPDATE additif sur EXACTEMENT les 15 lignes CATEGORY_REVIEW +
 * rafraîchissement `category_decision` seul (jamais `classification`) sur
 * la 1 ligne DUPLICATE_REVIEW restante. AUCUNE promotion, AUCUNE écriture
 * establishments/registry_identifiers, AUCUNE nouvelle ligne staging.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..", "..");
const BATCH_ID = "minsante-pilot-v1";
const OPERATOR = "jean-merlain";
const SPRINT = "MINSANTE-E";

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

// ── Matrice de preuve de catégorie — Règles 1-2 IDENTIQUES à
// minsante-c/d-reclassify.ts (§4 du brief : hiérarchie non affaiblie).
// Règle 3 (corroboration externe) enrichie ce sprint avec 1 nouvelle
// entrée vérifiée directement (§6, §9 : source primaire institutionnelle
// officielle récupérée avec succès, identité confirmée par nom de
// fondation distinctif + ville).
type CategoryDecision = "SUPERIEUR_CONFIRMED" | "AUTRES_CONFIRMED" | "CATEGORY_REVIEW";
interface CategoryVerdict {
  decision: CategoryDecision;
  evidenceType: string;
  evidence: string;
}

const EXTERNAL_CATEGORY_CORROBORATION: Record<string, CategoryVerdict & { source: string }> = {
  "9c4b9a28-1aa2-4fc2-baa8-48d3919758f7": {
    // ECOLE PRIVEE FONDATION TCHUENTE DE BAFOUSSAM
    decision: "AUTRES_CONFIRMED",
    evidenceType: "OFFICIAL_INSTITUTION_SITE_EXPLICIT_NON_HIGHER_ED_WORDING",
    evidence:
      "Page officielle de l'établissement (epfpsa-ft.org/Formation.php, récupérée directement ce sprint) : nom officiel complet \"ÉCOLE PRIVÉE DE FORMATION PROFESSIONNELLE DES PERSONNELS SANITAIRES FONDATION TCHUENTE\" — auto-désignation explicite \"formation professionnelle\" (jamais \"enseignement supérieur\"/\"université\"). Deux cycles listés, tous deux à niveau d'entrée secondaire/technique : Infirmiers Diplômés d'État (entrée Baccalauréat A/C/D/F8/ESF/GCE A-Level, 3 ans) et Aides-Soignants Généralistes (entrée BEPC/GCE O-Level, 12 mois). Identité confirmée : même patronage distinctif \"Tchuente\" (nom de famille fondateur, jamais un mot générique), même ville Bafoussam, même secteur (personnels sanitaires) que la ligne staging \"ECOLE PRIVEE FONDATION TCHUENTE DE BAFOUSSAM\".",
    source: "http://www.epfpsa-ft.org/Formation.php (récupéré directement ce sprint, contenu vérifié)",
  },
};

function categoryVerdict(displayName: string, stagingId: string): CategoryVerdict {
  const upper = displayName
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase();

  // Règle 1 — mot de niveau supérieur explicite AUTO-DÉCLARÉ dans le titre
  // officiel MINSANTE lui-même (héritée identique de MINSANTE-B/C/D).
  if (/\bSUPERIEUR(E)?\b/.test(upper) || /\bUNIVERSITAIRE\b/.test(upper) || /\bUNIVERSITE\b/.test(upper) || /\bFACULTE\b/.test(upper)) {
    return {
      decision: "SUPERIEUR_CONFIRMED",
      evidenceType: "EXPLICIT_LEVEL_WORD_IN_OFFICIAL_TITLE",
      evidence: "Titre officiel MINSANTE contient un mot de niveau explicite (supérieur/universitaire/université/faculté) — auto-déclaré par l'établissement lui-même dans son nom officiel.",
    };
  }

  // Règle 2 — désignation de cycle/diplôme reconnue et non-supérieure dans
  // le titre officiel lui-même (héritée identique).
  if (/\bINFIRMIERS?\s+DIPLOMES?\s+D.?\s*ETAT\b/.test(upper)) {
    return {
      decision: "AUTRES_CONFIRMED",
      evidenceType: "OFFICIAL_CYCLE_DIPLOMA_NAME_IN_TITLE",
      evidence:
        "Titre officiel MINSANTE contient la désignation explicite du diplôme d'État \"Infirmier(s) Diplômé(s) d'État\" — diplôme de cycle B (Décret 80/198), formation non-supérieure reconnue, auto-déclarée dans le nom officiel lui-même.",
    };
  }

  // Règle 3 — corroboration officielle externe vérifiée DIRECTEMENT ce
  // sprint (§9), par staging_id (identité confirmée).
  const external = EXTERNAL_CATEGORY_CORROBORATION[stagingId];
  if (external) return external;

  // Règle 4 (défaut) — aucune preuve suffisante. JAMAIS une catégorie
  // inventée (§13 : no evidence = no reclassification).
  return {
    decision: "CATEGORY_REVIEW",
    evidenceType: "INSUFFICIENT_EVIDENCE",
    evidence:
      "Aucun mot de niveau explicite dans le titre officiel, aucune désignation de cycle/diplôme reconnue dans le titre, aucune corroboration officielle externe vérifiable trouvée par la recherche ciblée MINSANTE-E (voir RESEARCH_NOTES). CATEGORY_REVIEW maintenu — §13 : jamais une catégorie devinée par popularité, branding, ou apparence du nom.",
  };
}

// ── §6,12 — note de recherche ciblée par candidat, traçabilité complète
// même pour les négatifs (14/15 candidats). Chaque note documente la piste
// suivie et la raison précise de l'échec de vérification (jamais un
// silence, jamais une preuve non vérifiée utilisée par défaut).
const RESEARCH_NOTES: Record<string, string> = {
  "2c29d228-e387-4db1-a855-7425c05e6a96":
    "ECOLE PRIVEE FONDATION JEUGEUVOU FOWANG DE BAFOUSSAM — recherche ciblée : Fondation JEUGUEVOU FOWANG FO'O GAP DONGUE DONGMO identifiée (Décision N°2149/D/MINSANTE/SG/DRH/SDDRH du 28/09/2020 citée par source secondaire, non vérifiée directement), site officiel probable univ-jeuguevou.com/efps/ trouvé mais INJOIGNABLE ce sprint (erreur SSL TLSV1_ALERT_INTERNAL_ERROR, http et https, reproductible) — contenu non vérifié directement, donc pas retenu comme preuve (§6 : seule une source Tier 1/2 vérifiée directement fait autorité finale). CATEGORY_REVIEW maintenu.",
  "7517d1df-be2c-4b4e-bb15-fc4548735739":
    "ECOLE DES METIERS DE LA SANTE DE BAMOUGOUM (canonique du doublon 276633af) — même piste que MINSANTE-D : décision MINSANTE N°2938/D/MINSANTE du 13/07/2023 évoquée par recherche web, mais document primaire (PDF minsante.cm) confirmé À NOUVEAU ce sprint comme image scannée sans couche de texte exploitable (re-tenté via WebFetch direct, échec identique). Aucune preuve de niveau vérifiable. CATEGORY_REVIEW maintenu.",
  "265476d2-d4fe-4e6d-adc7-39cabdc01fa8":
    "ECOLE PRIVEE DE FORMATION DES PERSONNELS DE SANTE FONDATION SAINT MAURICE DE BAFOUSSAM — recherche ciblée : aucun site officiel ni page institutionnelle isolable trouvés (résultats dominés par des organisations homonymes sans rapport, Québec/France). Aucune preuve de niveau. CATEGORY_REVIEW maintenu.",
  "68c3cd5b-de66-4f3c-9c3c-fdbdaad7f54c":
    "COMPLEXE DE FORMATION DES PERSONNELS DE SANTE \"ROIS MAGES\" COFPSAROMA DE BALENG — nouvelle piste ce sprint : page probable identifiée (univ-jeuguevou.com/cofpsaroma/, même groupe que 2c29d228), mais INJOIGNABLE (même erreur SSL reproductible que 2c29d228). Aucune amélioration par rapport à MINSANTE-C (échec SSL déjà documenté). CATEGORY_REVIEW maintenu.",
  "3c04b5c8-4a6d-4ad8-b625-bda87186c800":
    "COMPLEXE PRIVE DE FORMATION DU PERSONNEL DE LA SANTE DE MBOUO BANDJOUN — nouvelle piste ce sprint : domaine alternatif trouvé (cpfmbouocmr.net, distinct du cpfmbouocmr.org en HTTP 403 vu en MINSANTE-C), mais INJOIGNABLE ce sprint (timeout DNS/connexion). Résumé de recherche indirect mentionne des cycles \"CQP 1 an / diplômes MINSANTE 2-3 ans\" sans texte primaire vérifié directement — pas retenu comme preuve (§6). CATEGORY_REVIEW maintenu.",
  "8bf90bbd-3520-4f16-8cd7-e708892473bd":
    "COMPLEXE PRIVE DE FORMATION DU PERSONNEL MEDICO-SANITAIRE DE MBOUDA — piste \"Fondation Monga\" (fondation-monga.org) revue ce sprint, toujours INJOIGNABLE (DNS). Identité avec la ligne staging (nom officiel MINSANTE sans \"Fondation Monga\") reste NON confirmée avec certitude suffisante même si la page avait été accessible (§16 : jamais une preuve externe appliquée sans identité confirmée). CATEGORY_REVIEW maintenu, piste à vérifier humainement.",
  "92c96f6f-bf11-4de7-b9cf-44f2be0564b4":
    "ECOLE DES PROFESSIONNELS DE LA SANTE LES ETOILES DE BAFOUSSAM — site eps-lesetoiles.com toujours INJOIGNABLE ce sprint (résolution DNS échouée, https et www, comme en MINSANTE-C). Aucune preuve de niveau vérifiable. CATEGORY_REVIEW maintenu.",
  "5f99f3be-fd64-4d9a-a8fd-709d9e4f0821":
    "ECOLE PRIVEE DE FORMATION DES PERSONNELS SANITAIRES \"SAINT JOSEPH\" DE BAFOUSSAM — recherche ciblée : un résultat suggère qu'une école homonyme \"Saint Joseph\" serait basée à Santchou (commune différente de Bafoussam) — signal d'AMBIGUÏTÉ D'IDENTITÉ entre deux établissements potentiellement distincts sous un patronage religieux courant, jamais une preuve de niveau pour LA ligne staging précise (région Ouest, ville non renseignée dans raw_data). Aucune preuve de niveau retenue. CATEGORY_REVIEW maintenu.",
  "0e0202b8-3175-4db9-890d-0294057239a1":
    "ECOLE PRIVEE DE FORMATION DU PERSONNEL DE LA SANTE DE BAFOUSSAM — nom générique (gabarit partagé par de nombreux établissements homonymes de Bafoussam recherchés ce sprint et lors de MINSANTE-C), aucune source officielle isolable avec certitude suffisante. CATEGORY_REVIEW maintenu.",
  "a2f1cf0b-520e-42b1-bb84-81a20f9de8a3":
    "INSTITUT INTERNATIONAL DE FORMATION DE PERSONNELS PARAMEDICAUX IFOPP DE FOUMBOT — présence confirmée (page Facebook officielle IIFOPP, offres d'emploi minajobs.net), mais AUCUN site institutionnel officiel avec mot de niveau explicite trouvé — Facebook explicitement exclu comme preuve finale (§6). CATEGORY_REVIEW maintenu.",
  "9c4b9a28-1aa2-4fc2-baa8-48d3919758f7": "Voir EXTERNAL_CATEGORY_CORROBORATION — RÉSOLU ce sprint (AUTRES_CONFIRMED).",
  "27a2a636-eced-4971-8f62-67d8d1028ab3":
    "INSTITUT TROPICAL DE FORMATION EN PLAIES CHRONIQUES ET EN SOINS INFIRMIERS \"MOULLEC\" DE BALEVENG — recherche ciblée ce sprint : aucun résultat pertinent trouvé (requêtes renvoient des formations de plaies chroniques en France/Suisse, sans rapport). Aucune amélioration par rapport à MINSANTE-C. CATEGORY_REVIEW maintenu.",
  "f56097c9-ac2a-4bae-95af-2838aed0033f":
    "INSTITUT DES SCIENCES DE LA SANTE POOLA DE BAFOUSSAM — seule une page Facebook trouvée (institution distincte de \"Institut Supérieur des Sciences Appliquées à la Santé (INSSAS)\", nom différent, pas de preuve d'identité commune) — Facebook explicitement exclu comme preuve finale (§6). CATEGORY_REVIEW maintenu.",
  "bbf4f625-3574-4bfa-b17a-278282b3bb6f":
    "INSTITUT DES SCIENCES ET TECHNIQUES MEDICO-SANITAIRES DE BAFOUSSAM (ISTMS) — recherche ciblée approfondie ce sprint : des sources secondaires (annuaires, non retenues comme preuve finale) décrivent ISTMS comme l'une des 5 écoles du complexe \"Institut Universitaire de la Pointe\" (ex-\"3i Santé\"), aux côtés de INSSAS, sous une décision MINSANTE N°0410/D/MINSANTE/SESP/SG/DRH du 14/05/2012 (citée par source secondaire, jamais récupérée directement — inssas.com/ISTMS.php INJOIGNABLE ce sprint, DNS). Vérification croisée directe (§7) sur le registre MINESUP officiel (minesup.gov.cm/index.php/instituts-prives-denseignement-superieur/, récupéré avec succès) : SEUL \"Institut Supérieur des Sciences Appliquées à la Santé (INSSAS)\" y figure comme IPES autorisé (décret N°12/0664/MINESUP du 23/11/2012, promoteur KUE Richard) — ISTMS N'Y FIGURE PAS comme entité distincte autorisée. §7 du brief : ne jamais classer un établissement différent (mais similaire) comme 'superieur' simplement parce qu'un établissement MINESUP voisin partage un nom de complexe — identité ISTMS≠INSSAS non confirmée (noms officiels différents, actes de création différents/différentes autorités citées). Preuve insuffisante et signal négatif partiel (absence sur la liste IPES) -> CATEGORY_REVIEW maintenu, PAS SUPERIEUR_CONFIRMED. Piste à approfondir humainement lors d'un futur sprint (vérifier directement l'acte MINSANTE 0410 cité).",
  "500e77b8-68a9-4e4f-8e0f-032890ff8520":
    "INSTITUT DES SCIENCES MEDICO-SANITAIRES LES ARGUS DE BANDJOUN — recherche ciblée ce sprint : aucun résultat pertinent trouvé (requêtes renvoient des instituts médico-sanitaires sans rapport au Tchad/Sénégal/Cameroun Centre). CATEGORY_REVIEW maintenu.",
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
  source_url: string | null;
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

  console.log("=== SPRINT MINSANTE-E — CATEGORY REVIEW RESOLUTION + APPROVAL POPULATION CONSOLIDATION ===\n");

  // ── §2 — Baseline fraîche ────────────────────────────────────────────
  const { count: estBefore } = await supabase.from("establishments").select("*", { count: "exact", head: true });
  const { count: stagingBefore } = await supabase.from("establishment_import_staging").select("*", { count: "exact", head: true });
  const { count: registryBefore } = await supabase.from("establishment_registry_identifiers").select("*", { count: "exact", head: true });
  console.log(`Baseline : establishments=${estBefore}, staging=${stagingBefore}, registry_identifiers=${registryBefore}`);

  // ── §3 — Chargement strict des 22 lignes pilote ─────────────────────
  const pilotRows = (await fetchAllPaginated<StagingRow>(
    supabase,
    "establishment_import_staging",
    "id,name_raw,region,city,status,source_ministry,education_family,raw_data,source_url",
    (q) => q.eq("source_ministry", "MINSANTE")
  )).filter((r) => r.raw_data?.batch === BATCH_ID);
  console.log(`Lignes pilote MINSANTE (batch ${BATCH_ID}) : ${pilotRows.length} (attendu 22)`);
  if (pilotRows.length !== 22) {
    console.log("ATTENTION : le nombre de lignes pilote a changé depuis MINSANTE-D — STOP, ne pas deviner pourquoi.");
    process.exit(1);
  }

  // §20 — périmètre auto-identifiant, sûr pour une ré-exécution : le
  // scope MINSANTE-E est "les 15 lignes CATEGORY_REVIEW héritées de
  // MINSANTE-D", identifiées soit par leur classification ACTUELLE
  // (CATEGORY_REVIEW, cas d'un premier passage), soit par la présence
  // d'un marqueur `raw_data.minsante_e.sprint === SPRINT` déjà posé par un
  // passage antérieur de CE script (cas d'un candidat déjà résolu en
  // CLEAN_APPROVABLE lors d'un run précédent — jamais réintégré dans le
  // pool CATEGORY_REVIEW, mais toujours dans le périmètre pour permettre
  // une ré-exécution idempotente sans faire dériver le compte total). Un
  // hard count guard sur "toujours exactement 15" casserait la
  // ré-exécutabilité dès le premier run réussi (§20 du brief) — le vrai
  // invariant à protéger est visé ci-dessous : le total scoped ne doit
  // JAMAIS dépasser 15.
  const categoryReviewRows = pilotRows.filter(
    (r) =>
      r.raw_data?.classification === "CATEGORY_REVIEW" ||
      // Candidat déjà résolu (CLEAN_APPROVABLE) par un passage antérieur de
      // CE script — jamais la ligne DUPLICATE_REVIEW (§17 : hors périmètre
      // de reclassification, même si elle porte aussi un marqueur
      // minsante_e pour son rafraîchissement de category_decision seul).
      (r.raw_data?.classification === "CLEAN_APPROVABLE" && r.raw_data?.minsante_e?.sprint === SPRINT)
  );
  console.log(`Lignes dans le périmètre MINSANTE-E (CATEGORY_REVIEW actuel + déjà résolues ce sprint) : ${categoryReviewRows.length} (attendu <= 15)`);
  if (categoryReviewRows.length > 15) {
    console.log("ATTENTION : le périmètre MINSANTE-E dépasse 15 lignes — dérive potentielle, STOP, ne pas deviner pourquoi.");
    process.exit(1);
  }
  const duplicateReviewRows = pilotRows.filter((r) => r.raw_data?.classification === "DUPLICATE_REVIEW");
  console.log(`Lignes DUPLICATE_REVIEW (hors périmètre de reclassification, §17) : ${duplicateReviewRows.length} (attendu 1)`);
  if (duplicateReviewRows.length !== 1) {
    console.log("ATTENTION : le nombre de candidats DUPLICATE_REVIEW a changé depuis MINSANTE-D — STOP, ne pas deviner pourquoi.");
    process.exit(1);
  }

  // ── §16 — Cibles MINESUP pour la frontière inter-ministérielle ──────
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
  console.log(`Cibles MINESUP §16 : ${minesupTargets.length}`);

  // ── §8 — Cibles live pour revalidation de doublon ───────────────────
  function mainCategoryToEducationFamily(mainCategory: string | null): string | null {
    if (mainCategory === "superieur") return "higher_education";
    return mainCategory;
  }
  const liveTargets: MatchTarget[] = allEst.map((e) => ({ id: e.id, name: e.name, region: e.region, city: e.city, category: mainCategoryToEducationFamily(e.main_category), identifiers: [] }));

  // ── Traitement des 15 candidats CATEGORY_REVIEW ─────────────────────
  interface ResultRow {
    row: StagingRow;
    category: CategoryVerdict;
    crossMinistry: { decision: string; matchLevel: string; matchedId: string | null; matchedName: string | null; reason: string };
    liveMatchLevel: string;
    new_classification: string;
    new_reason: string;
    new_status: string;
  }

  const results: ResultRow[] = [];
  for (const row of categoryReviewRows) {
    const cat = categoryVerdict(row.name_raw, row.id);

    const candidate: MatchCandidate = { name: row.name_raw, region: row.region, city: row.city, category: null, identifiers: [] };
    const cross = matchCandidate(candidate, minesupTargets);
    const crossDecision =
      cross.level === "EXACT_IDENTIFIER" || cross.level === "EXACT_IDENTITY"
        ? "SAME_INSTITUTION_CROSS_MINISTRY"
        : cross.level === "STRONG_MATCH"
          ? "AMBIGUOUS"
          : "DISTINCT";

    const liveMatch = matchCandidate({ ...candidate, category: "health_training" }, liveTargets);

    let newClassification: string;
    let newReason: string;
    let newStatus: string;

    // §16 — cross-ministry ne bloque QUE les candidats dont l'évidence de
    // catégorie mènerait vers SUPERIEUR_CONFIRMED (SAME_INSTITUTION ou
    // AMBIGUOUS bloquent une promotion indépendante potentielle). Pour un
    // candidat CATEGORY_REVIEW ou AUTRES_CONFIRMED sans aucun signal
    // cross-ministry positif, la frontière inter-ministérielle n'a aucune
    // incidence sur la classification.
    if ((crossDecision === "SAME_INSTITUTION_CROSS_MINISTRY" || crossDecision === "AMBIGUOUS") && cat.decision === "SUPERIEUR_CONFIRMED") {
      newClassification = "CROSS_MINISTRY_REVIEW";
      newReason = `§7,16 — signal frontière inter-ministérielle détecté (${cross.level}) sur un candidat désormais classé SUPERIEUR_CONFIRMED : ${cross.reason} Jamais un auto-merge — revue humaine requise avant toute promotion future.`;
      newStatus = "normalized";
    } else if (liveMatch.level !== "NO_MATCH") {
      newClassification = "DUPLICATE_REVIEW";
      newReason = `§8 — signal de correspondance live détecté à la revalidation MINSANTE-E (${liveMatch.level}) : ${liveMatch.reason}`;
      newStatus = "duplicate_review";
    } else if (cat.decision === "CATEGORY_REVIEW") {
      newClassification = "CATEGORY_REVIEW";
      newReason = cat.evidence;
      newStatus = "normalized";
    } else {
      newClassification = "CLEAN_APPROVABLE";
      newReason = `Catégorie résolue (${cat.decision}) par corroboration officielle vérifiée directement ce sprint. Aucun signal de doublon live, aucun signal frontière inter-ministérielle bloquant. ${cat.evidence}`;
      newStatus = "ready";
    }

    results.push({
      row,
      category: cat,
      crossMinistry: { decision: crossDecision, matchLevel: cross.level, matchedId: cross.target?.id ?? null, matchedName: cross.target?.name ?? null, reason: cross.reason },
      liveMatchLevel: liveMatch.level,
      new_classification: newClassification,
      new_reason: newReason,
      new_status: newStatus,
    });
  }

  // ── Traitement de la ligne DUPLICATE_REVIEW restante : category_decision
  // rafraîchie seulement, classification JAMAIS changée (§17) ───────────
  const dupRow = duplicateReviewRows[0];
  const dupCat = categoryVerdict(dupRow.name_raw, dupRow.id);
  console.log(`\nLigne DUPLICATE_REVIEW ${dupRow.id} (${dupRow.name_raw}) : category_decision rafraîchie -> ${dupCat.decision}, classification INCHANGÉE (DUPLICATE_REVIEW, §17).`);

  // ── Tallies ──────────────────────────────────────────────────────────
  const catTally: Record<string, number> = {};
  for (const r of results) catTally[r.category.decision] = (catTally[r.category.decision] ?? 0) + 1;
  const classTally: Record<string, number> = {};
  for (const r of results) classTally[r.new_classification] = (classTally[r.new_classification] ?? 0) + 1;
  console.log("\n=== VERDICTS DE CATÉGORIE (15) ===", catTally);
  console.log("=== NOUVELLE CLASSIFICATION (15) ===", classTally);

  mkdirSync(join(rootDir, "reports", "registry"), { recursive: true });

  // ── §30 — reports/registry/minsante-e-category-review.csv ─────────────
  const catHeader = [
    "staging_id",
    "name",
    "region",
    "programs",
    "current_category",
    "source_checked",
    "authority",
    "evidence_excerpt_summary",
    "official_level_evidence",
    "decision",
    "new_main_category",
    "confidence_basis",
    "reason",
  ];
  const catCsv = [catHeader.join(",")];
  for (const r of results) {
    const newMainCategory = r.category.decision === "SUPERIEUR_CONFIRMED" ? "superieur" : r.category.decision === "AUTRES_CONFIRMED" ? "autres" : null;
    catCsv.push(
      [
        r.row.id,
        r.row.name_raw,
        r.row.region,
        (r.row.raw_data?.programs_normalized ?? []).join(" | "),
        "CATEGORY_REVIEW",
        EXTERNAL_CATEGORY_CORROBORATION[r.row.id]?.source ?? "Aucune source Tier 1/2 vérifiable trouvée ce sprint",
        r.category.decision === "CATEGORY_REVIEW" ? "N/A" : "PROBABLE_TIER_1 (page institutionnelle officielle)",
        r.category.evidence,
        r.category.evidenceType,
        r.category.decision,
        newMainCategory ?? "",
        r.category.evidenceType,
        RESEARCH_NOTES[r.row.id] ?? "",
      ]
        .map(csvEscape)
        .join(",")
    );
  }
  writeFileSync(join(rootDir, "reports", "registry", "minsante-e-category-review.csv"), catCsv.join("\n"), "utf-8");

  // ── §30 — reports/registry/minsante-e-cross-ministry-review.csv ───────
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
          ? "Signal détecté par le moteur de matching — mais candidat non classé SUPERIEUR_CONFIRMED ce sprint, donc aucun blocage cross-ministry appliqué (§16 : la revalidation ne s'impose qu'aux nouveaux 'superieur')."
          : "Aucune action requise — engine confirme une institution distincte du registre MINESUP consulté ce sprint.",
      ]
        .map(csvEscape)
        .join(",")
    );
  }
  writeFileSync(join(rootDir, "reports", "registry", "minsante-e-cross-ministry-review.csv"), crossCsv.join("\n"), "utf-8");

  // ── §19,25 — UPDATE additif sur EXACTEMENT les 15 lignes CATEGORY_REVIEW,
  // idempotent ────────────────────────────────────────────────────────
  console.log("\n=== §19-20 — MISE À JOUR STAGING (additive, 15 lignes CATEGORY_REVIEW scoped) ===");
  let updated = 0;
  for (const r of results) {
    const raw = r.row.raw_data ?? {};
    const nextRawData: Record<string, unknown> = {
      ...raw,
      // §19 — historique additif : minsante_b_snapshot/minsante_c_snapshot/
      // minsante_d déjà présents ne sont JAMAIS réécrits (spread `...raw`
      // ci-dessus les recopie tels quels). Snapshot MINSANTE-D capturé ici
      // pour la première fois seulement (idempotent via `??`).
      minsante_d_snapshot: raw.minsante_d_snapshot ?? {
        classification: raw.classification,
        category_decision: raw.category_decision,
        category_evidence: raw.category_evidence,
        classification_reason: raw.classification_reason,
        cross_ministry_review: raw.cross_ministry_review ?? null,
      },
      classification: r.new_classification,
      classification_reason: r.new_reason,
      category_decision: r.category.decision,
      category_evidence: r.category.evidence,
      category_evidence_type: r.category.evidenceType,
      cross_ministry_review: { decision: r.crossMinistry.decision, matchLevel: r.crossMinistry.matchLevel, matchedId: r.crossMinistry.matchedId, matchedName: r.crossMinistry.matchedName, reason: r.crossMinistry.reason },
      minsante_e: {
        sprint: SPRINT,
        reviewed_by: OPERATOR,
        reviewed_at: new Date().toISOString(),
        category_decision: r.category.decision,
        evidence_type: r.category.evidenceType,
        official_source_used: EXTERNAL_CATEGORY_CORROBORATION[r.row.id]?.source ?? null,
        research_note: RESEARCH_NOTES[r.row.id] ?? null,
        live_match_level_revalidated: r.liveMatchLevel,
        cross_ministry_level_revalidated: r.crossMinistry.matchLevel,
      },
    };
    const { error: updErr } = await supabase.from("establishment_import_staging").update({ raw_data: nextRawData, status: r.new_status }).eq("id", r.row.id);
    if (updErr) throw new Error(`Échec mise à jour staging pour ${r.row.id} : ${updErr.message}`);
    updated++;
  }
  console.log(`Lignes du périmètre MINSANTE-E mises à jour : ${updated}/${results.length} (sur 15 au maximum, §20)`);

  // ── Ligne DUPLICATE_REVIEW : category_decision rafraîchie seulement,
  // classification/status JAMAIS touchés (§17) ─────────────────────────
  {
    const raw = dupRow.raw_data ?? {};
    const nextRawData: Record<string, unknown> = {
      ...raw,
      minsante_d_snapshot: raw.minsante_d_snapshot ?? {
        classification: raw.classification,
        category_decision: raw.category_decision,
        category_evidence: raw.category_evidence,
        classification_reason: raw.classification_reason,
        cross_ministry_review: raw.cross_ministry_review ?? null,
      },
      // classification volontairement NON modifiée (reste DUPLICATE_REVIEW).
      category_decision: dupCat.decision,
      category_evidence: dupCat.evidence,
      category_evidence_type: dupCat.evidenceType,
      minsante_e: {
        sprint: SPRINT,
        reviewed_by: OPERATOR,
        reviewed_at: new Date().toISOString(),
        category_decision: dupCat.decision,
        evidence_type: dupCat.evidenceType,
        note: "§17 — blocage de doublon préservé : classification volontairement NON modifiée malgré le rafraîchissement de category_decision.",
      },
    };
    const { error: updErr } = await supabase.from("establishment_import_staging").update({ raw_data: nextRawData }).eq("id", dupRow.id);
    if (updErr) throw new Error(`Échec mise à jour staging pour la ligne DUPLICATE_REVIEW ${dupRow.id} : ${updErr.message}`);
  }

  // ── Preuve d'idempotence : relecture réelle depuis la DB ───────────────
  const scopedIds = new Set(results.map((r) => r.row.id));
  const { data: reReadRows } = await supabase.from("establishment_import_staging").select("id,raw_data,status").in("id", [...scopedIds]);
  let idempotentOk = (reReadRows ?? []).length === results.length;
  for (const r of results) {
    const found = (reReadRows ?? []).find((x: any) => x.id === r.row.id);
    if (!found || found.raw_data?.classification !== r.new_classification || found.status !== r.new_status) idempotentOk = false;
  }
  const { data: dupReRead } = await supabase.from("establishment_import_staging").select("id,raw_data,status").eq("id", dupRow.id).single();
  if (!dupReRead || dupReRead.raw_data?.classification !== "DUPLICATE_REVIEW" || dupReRead.raw_data?.category_decision !== dupCat.decision) idempotentOk = false;
  console.log(`Idempotence (relecture DB) : ${idempotentOk ? "PASS" : "FAIL"}`);

  // ── §22 — recalcul de la population complète des 22 lignes ────────────
  const { data: allPilotAfterRaw } = await supabase
    .from("establishment_import_staging")
    .select("id,name_raw,region,education_family,raw_data,status,source_url")
    .eq("source_ministry", "MINSANTE");
  const allPilotAfter = (allPilotAfterRaw ?? []).filter((r: any) => r.raw_data?.batch === BATCH_ID);
  if (allPilotAfter.length !== 22) {
    console.log("ATTENTION post-condition : le pilote ne compte plus 22 lignes — STOP.");
    process.exit(1);
  }
  const afterTally: Record<string, number> = {};
  for (const r of allPilotAfter as any[]) {
    const cl = r.raw_data?.classification ?? "UNKNOWN";
    afterTally[cl] = (afterTally[cl] ?? 0) + 1;
  }
  console.log("\n=== POPULATION COMPLÈTE DU PILOTE (22) APRÈS MINSANTE-E ===", afterTally);

  // ── §30 — reports/registry/minsante-e-reclassification.csv (les 15 CATEGORY_REVIEW) ──
  const reclassHeader = ["staging_id", "name_raw", "region", "previous_classification", "category_evidence_type", "new_category_decision", "cross_ministry_decision", "new_classification", "reason"];
  const reclassCsv = [reclassHeader.join(",")];
  for (const r of results) {
    reclassCsv.push(
      [r.row.id, r.row.name_raw, r.row.region, "CATEGORY_REVIEW", r.category.evidenceType, r.category.decision, r.crossMinistry.decision, r.new_classification, r.new_reason]
        .map(csvEscape)
        .join(",")
    );
  }
  writeFileSync(join(rootDir, "reports", "registry", "minsante-e-reclassification.csv"), reclassCsv.join("\n"), "utf-8");

  // ── §23,30 — reports/registry/minsante-e-pilot-approval.json (nouveau
  // snapshot, tri déterministe par staging_id, NE PAS écraser B/C/D) ─────
  const cleanApprovable = (allPilotAfter as any[]).filter((r) => r.raw_data?.classification === "CLEAN_APPROVABLE");
  const approvalCandidates = cleanApprovable
    .map((r) => ({
      staging_id: r.id,
      name: r.name_raw,
      region: r.region,
      programs: r.raw_data?.programs_normalized ?? [],
      education_family: r.education_family,
      main_category: r.raw_data?.category_decision === "SUPERIEUR_CONFIRMED" ? "superieur" : r.raw_data?.category_decision === "AUTRES_CONFIRMED" ? "autres" : null,
      category_evidence: r.raw_data?.category_evidence ?? null,
      source: r.source_url ?? null,
      decision: "CLEAN_APPROVABLE",
    }))
    .sort((a, b) => a.staging_id.localeCompare(b.staging_id));
  const newChecksum = sha256(JSON.stringify(approvalCandidates));
  const previous = JSON.parse(readFileSync(join(rootDir, "reports", "registry", "minsante-d-pilot-approval.json"), "utf-8"));

  writeFileSync(
    join(rootDir, "reports", "registry", "minsante-e-pilot-approval.json"),
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        operator: OPERATOR,
        sprint: SPRINT,
        batch: BATCH_ID,
        previous_snapshot: { sprint: "MINSANTE-D", candidate_count: previous.candidate_count, checksum: previous.checksum },
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
  console.log(`Ancien snapshot (MINSANTE-D, préservé, non écrasé) : ${previous.candidate_count} candidat(s) — checksum ${previous.checksum}`);

  // ── §29 — post-condition base de données ───────────────────────────────
  const { count: estAfter } = await supabase.from("establishments").select("*", { count: "exact", head: true });
  const { count: stagingAfter } = await supabase.from("establishment_import_staging").select("*", { count: "exact", head: true });
  const { count: registryAfter } = await supabase.from("establishment_registry_identifiers").select("*", { count: "exact", head: true });
  console.log(`\nPOST-CONDITION : establishments ${estBefore}->${estAfter} | staging ${stagingBefore}->${stagingAfter} | registry_identifiers ${registryBefore}->${registryAfter}`);

  // ── §30 — reports/registry/minsante-e-category-summary.json ───────────
  const categorySummary = {
    generated_at: new Date().toISOString(),
    operator: OPERATOR,
    sprint: SPRINT,
    batch: BATCH_ID,
    model: "MODEL_A",
    model_description:
      "health_training (education_family, inchangé) se traduit en main_category='superieur' UNIQUEMENT si preuve explicite de niveau supérieur (mot de niveau auto-déclaré dans le titre officiel, ou corroboration officielle externe vérifiée), sinon 'autres'/sous-catégorie 'Santé' SI une preuve explicite de niveau non-supérieur existe, sinon CATEGORY_REVIEW — jamais une valeur devinée depuis 'Institut'/'École' seuls. Modèle inchangé depuis MINSANTE-C, hiérarchie non affaiblie.",
    migration_required: false,
    category_evidence_hierarchy: [
      "1. EXPLICIT_LEVEL_WORD_IN_OFFICIAL_TITLE (supérieur/universitaire/université/faculté) -> SUPERIEUR_CONFIRMED",
      "2. OFFICIAL_CYCLE_DIPLOMA_NAME_IN_TITLE (ex. 'Infirmiers Diplômés d'État') -> AUTRES_CONFIRMED",
      "3. Corroboration officielle externe vérifiée DIRECTEMENT ce sprint (page institutionnelle officielle récupérée avec succès + identité confirmée) -> SUPERIEUR_CONFIRMED ou AUTRES_CONFIRMED selon la preuve",
      "4. Aucune preuve suffisante -> CATEGORY_REVIEW (défaut, jamais une catégorie inventée, §13)",
    ],
    starting_candidates: 15,
    superieur_confirmed: results.filter((r) => r.category.decision === "SUPERIEUR_CONFIRMED").length,
    autres_confirmed: results.filter((r) => r.category.decision === "AUTRES_CONFIRMED").length,
    still_category_review: results.filter((r) => r.category.decision === "CATEGORY_REVIEW").length,
    cross_ministry_review: results.filter((r) => r.new_classification === "CROSS_MINISTRY_REVIEW").length,
    before: { CLEAN_APPROVABLE: 6, CATEGORY_REVIEW: 15, DUPLICATE_REVIEW: 1 },
    after: {
      CLEAN_APPROVABLE: afterTally.CLEAN_APPROVABLE ?? 0,
      CATEGORY_REVIEW: afterTally.CATEGORY_REVIEW ?? 0,
      DUPLICATE_REVIEW: afterTally.DUPLICATE_REVIEW ?? 0,
      CROSS_MINISTRY_REVIEW: afterTally.CROSS_MINISTRY_REVIEW ?? 0,
      OTHER_REVIEW: afterTally.OTHER_REVIEW ?? 0,
    },
    total: allPilotAfter.length,
    reconciled: Object.values(afterTally).reduce((a, b) => a + b, 0) === 22,
    taxonomy_validity_check: "superieur/autres restent sémantiquement suffisants pour les 15 candidats observés ce sprint — aucune catégorie officielle distincte rencontrée qui ne rentrerait dans ni l'une ni l'autre valeur. Aucun CATEGORY MODEL GAP identifié, aucune migration proposée.",
  };
  writeFileSync(join(rootDir, "reports", "registry", "minsante-e-category-summary.json"), JSON.stringify(categorySummary, null, 2), "utf-8");

  // ── §30 — reports/registry/minsante-e-run-summary.json ────────────────
  const summary = {
    generated_at: new Date().toISOString(),
    operator: OPERATOR,
    sprint: SPRINT,
    batch: BATCH_ID,
    starting_counts: { total: 22, CLEAN_APPROVABLE: 6, DUPLICATE_REVIEW: 1, CATEGORY_REVIEW: 15, CROSS_MINISTRY_REVIEW: 0 },
    category_review_decisions: {
      candidates_processed: results.length,
      superieur_confirmed: results.filter((r) => r.category.decision === "SUPERIEUR_CONFIRMED").length,
      autres_confirmed: results.filter((r) => r.category.decision === "AUTRES_CONFIRMED").length,
      still_category_review: results.filter((r) => r.category.decision === "CATEGORY_REVIEW").length,
    },
    reclassification_after_category_review: classTally,
    full_pilot_population_after: afterTally,
    total_reconciled: Object.values(afterTally).reduce((a, b) => a + b, 0) === 22,
    approval_snapshot: { previous_sprint: "MINSANTE-D", previous_count: previous.candidate_count, previous_checksum: previous.checksum, new_count: approvalCandidates.length, new_checksum: newChecksum },
    database_post_condition: {
      establishments_before: estBefore,
      establishments_after: estAfter,
      staging_before: stagingBefore,
      staging_after: stagingAfter,
      registry_identifiers_before: registryBefore,
      registry_identifiers_after: registryAfter,
      rows_inserted: 0,
      rows_metadata_updated: updated + 1,
      idempotent: idempotentOk,
    },
    promotion: "NO",
  };
  writeFileSync(join(rootDir, "reports", "registry", "minsante-e-run-summary.json"), JSON.stringify(summary, null, 2), "utf-8");

  console.log("\n=== MINSANTE-E RECLASSIFY — TERMINÉ ===");
}

main().catch((error) => {
  console.error("Échec MINSANTE-E reclassify :", error);
  process.exit(1);
});
