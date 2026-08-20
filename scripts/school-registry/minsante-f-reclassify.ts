import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { matchCandidate } from "./lib/matching/engine";
import { sha256 } from "./lib/extraction/hashing";
import type { MatchTarget, MatchCandidate } from "./lib/matching/types";

/**
 * SPRINT MINSANTE-F — CATEGORY EVIDENCE RECOVERY & PILOT CLOSURE.
 *
 * Dernière passe ciblée sur les 14 lignes staging MINSANTE (batch
 * minsante-pilot-v1, région Ouest) encore CATEGORY_REVIEW après
 * MINSANTE-E. Stratégie de DÉCOUVERTE DE SOURCES ALTERNATIVES (§4-5 du
 * brief) plutôt qu'un simple re-essai des URLs mortes déjà documentées :
 * routes A-K (nom exact, acronyme, nom+région, nom+MINSANTE/MINESUP,
 * nom+arrêté/décret, nom+"enseignement supérieur"/"école de
 * formation"/"institut supérieur", domaines gouvernementaux).
 *
 * Résultat de la recherche ce sprint (voir RESEARCH_NOTES pour la trace
 * complète, candidat par candidat) : 1/14 nouvelle résolution
 * (INSTITUT DES SCIENCES ET TECHNIQUES MEDICO-SANITAIRES DE BAFOUSSAM /
 * ISTMS, bbf4f625) via une source Tier 2 vérifiée DIRECTEMENT ce sprint
 * (iu-pointe.fr, site institutionnel officiel du groupe "Institut
 * Universitaire de la Pointe" dont ISTMS est l'une des 6 écoles
 * constitutives) — désignation explicite du cycle "TMS" (Technicien
 * Médico-Sanitaire, cycle non-supérieur reconnu, corroboré
 * indépendamment par 3 sources externes sur la signification du sigle)
 * appliquée nommément à ISTMS dans l'annuaire des écoles du groupe.
 * Identité confirmée (acronyme+nom complet+ville Bafoussam+secteur
 * médico-sanitaire). Recoupé avec le signal négatif déjà établi en
 * MINSANTE-E (registre IPES MINESUP consulté à nouveau ce sprint : ISTMS
 * n'y figure toujours pas comme entité distincte autorisée) — cohérent
 * avec une conclusion AUTRES_CONFIRMED, pas SUPERIEUR.
 *
 * Les 13 autres candidats restent CATEGORY_REVIEW — preuve Tier 1/2
 * absente malgré une recherche ciblée par routes alternatives pour
 * chacun ce sprint (voir RESEARCH_NOTES) : sites institutionnels
 * toujours injoignables (SSL reproductible sur univ-jeuguevou.com/* même
 * via un proxy de lecture indépendant r.jina.ai, DNS sur
 * eps-lesetoiles.com/fondation-monga.org/inssas.com, HTTP 403 sur
 * cpfmbouocmr.org, timeout DNS sur cpfmbouocmr.net), aucune preuve
 * primaire Tier 1/2 trouvée pour Bamougoum/Argus/Poola/IFOPP/Moullec/le
 * générique Bafoussam/Saint Joseph — conformément au §13 du brief,
 * JAMAIS une catégorie devinée pour combler l'écart.
 *
 * La ligne DUPLICATE_REVIEW restante (276633af, doublon non-canonique de
 * "Ecole des Metiers de la Sante de Bamougoum") reste explicitement HORS
 * PÉRIMÈTRE de reclassification de `classification` (§16 : le blocage de
 * doublon prime toujours) — seule sa `category_decision` est rafraîchie.
 *
 * Portée : UPDATE additif sur EXACTEMENT les 14 lignes CATEGORY_REVIEW +
 * rafraîchissement `category_decision` seul (jamais `classification`) sur
 * la 1 ligne DUPLICATE_REVIEW restante. AUCUNE promotion, AUCUNE écriture
 * establishments/registry_identifiers, AUCUNE nouvelle ligne staging.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..", "..");
const BATCH_ID = "minsante-pilot-v1";
const OPERATOR = "jean-merlain";
const SPRINT = "MINSANTE-F";

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
// minsante-c/d/e-reclassify.ts (§7 du brief F : hiérarchie non affaiblie).
// Règle 3 (corroboration externe) enrichie ce sprint avec 1 nouvelle
// entrée vérifiée directement (§6 : Tier 2 uniquement — page
// institutionnelle officielle du groupe parent, jamais un annuaire
// commercial ni Facebook seuls).
type CategoryDecision = "SUPERIEUR_CONFIRMED" | "AUTRES_CONFIRMED" | "CATEGORY_REVIEW";
interface CategoryVerdict {
  decision: CategoryDecision;
  evidenceType: string;
  evidence: string;
}

const EXTERNAL_CATEGORY_CORROBORATION: Record<string, CategoryVerdict & { source: string }> = {
  "bbf4f625-3574-4bfa-b17a-278282b3bb6f": {
    // INSTITUT DES SCIENCES ET TECHNIQUES MEDICO-SANITAIRES DE BAFOUSSAM (ISTMS)
    decision: "AUTRES_CONFIRMED",
    evidenceType: "OFFICIAL_GROUP_SITE_EXPLICIT_TECHNICIAN_CYCLE_DESIGNATION",
    evidence:
      "Site institutionnel officiel du groupe parent (iu-pointe.fr — \"Institut Universitaire de la Pointe\", récupéré directement ce sprint, contenu vérifié à deux reprises via des pages distinctes) : ISTMS (\"Institut des Sciences et Techniques Médico-Sanitaires\") figure explicitement dans l'annuaire des 6 écoles constitutives du groupe (ESGIT, INSSAS, ESJEC, ESSIT, ISTPM, ISTMS), désigné nommément \"Médico-sanitaires / TMS\" — TMS = \"Technicien Médico-Sanitaire\", cycle non-supérieur reconnu (entrée baccalauréat scientifique ou équivalent GCE A-Level, jamais un diplôme d'enseignement supérieur), corroboré indépendamment par 3 sources externes distinctes décrivant la signification standard du sigle TMS dans le système MINSANTE camerounais (istag-institut.info, fvhenderson.com, isstmadd.net — établissements MINSANTE sans rapport, utilisés uniquement pour corroborer la SIGNIFICATION du sigle, jamais comme preuve d'identité). Aucun mot 'supérieur'/'université'/'faculté' appliqué nommément à ISTMS sur le site du groupe — la page d'accueil mentionne des cycles supérieurs (BTS/Licence/Master/Ingénieur) mais ceux-ci se rapportent aux AUTRES écoles du groupe (ESGIT/ESJEC/ESSIT), pas à ISTMS. Recoupement négatif indépendant : le registre officiel des IPES autorisés MINESUP (minesup.gov.cm/index.php/region-de-louest/, reconsulté directement ce sprint) ne liste toujours PAS ISTMS comme entité distincte autorisée — seul INSSAS y figure — cohérent avec une conclusion AUTRES (formation technique MINSANTE), pas SUPERIEUR. Identité confirmée : acronyme ISTMS identique, nom complet identique (\"Institut des Sciences et Techniques Médico-Sanitaires\"), même ville (Bafoussam, campus Ndiandam/Kouogouo/Bamendzi III), même secteur (médico-sanitaire) que la ligne staging \"INSTITUT DES SCIENCES ET TECHNIQUES MEDICO-SANITAIRES DE BAFOUSSAM\". Preuve classée Tier 2 (PROBABLE_TIER_2) — pas Tier 1 : aucune référence légale/ministérielle (arrêté/décision/décret) explicite trouvée sur la page elle-même, seule la désignation de cycle fait autorité ici.",
    source: "http://www.iu-pointe.fr/ (récupéré directement ce sprint, contenu vérifié — pages d'accueil et liste des écoles)",
  },
};

function categoryVerdict(displayName: string, stagingId: string): CategoryVerdict {
  const upper = displayName
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase();

  // Règle 1 — mot de niveau supérieur explicite AUTO-DÉCLARÉ dans le titre
  // officiel MINSANTE lui-même (héritée identique de MINSANTE-B/C/D/E).
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
  // sprint (§6,9), par staging_id (identité confirmée).
  const external = EXTERNAL_CATEGORY_CORROBORATION[stagingId];
  if (external) return external;

  // Règle 4 (défaut) — aucune preuve suffisante. JAMAIS une catégorie
  // inventée (§8,13 : no evidence = no reclassification).
  return {
    decision: "CATEGORY_REVIEW",
    evidenceType: "INSUFFICIENT_EVIDENCE",
    evidence:
      "Aucun mot de niveau explicite dans le titre officiel, aucune désignation de cycle/diplôme reconnue dans le titre, aucune corroboration officielle Tier 1/2 vérifiable trouvée par la recherche ciblée MINSANTE-F (voir RESEARCH_NOTES pour la trace des routes A-K tentées). CATEGORY_REVIEW maintenu — §13 : jamais une catégorie devinée par popularité, branding, ou apparence du nom.",
  };
}

// ── §4-6,11-12 — note de recherche ciblée par candidat ce sprint,
// traçabilité complète même pour les négatifs (13/14 candidats), avec le
// détail des routes A-K et sources alternatives tentées (jamais un simple
// re-essai silencieux des URLs mortes déjà documentées en MINSANTE-C/D/E).
const RESEARCH_NOTES: Record<string, string> = {
  "2c29d228-e387-4db1-a855-7425c05e6a96":
    "ECOLE PRIVEE FONDATION JEUGEUVOU FOWANG DE BAFOUSSAM — routes A/B/C/D/G tentées (nom exact, Fondation F3JD2, Bafoussam+MINSANTE, décision N°2149/D/MINSANTE/SG/DRH/SDDRH du 28/09/2020 déjà connue). Nouvelle piste ce sprint : recherche web confirme la Fondation F3JD2 comme organisation légalement reconnue autorisée en formation professionnelle par l'État (signal indirect, jamais vérifié en primaire). Site officiel univ-jeuguevou.com/efps/ RE-TESTÉ ce sprint via DEUX voies indépendantes (WebFetch direct http+https ET proxy de lecture tiers r.jina.ai) — échec identique sur les trois (erreur SSL TLSV1_ALERT_INTERNAL_ERROR en direct, HTTP 422 côté proxy, confirmant un blocage serveur réel et non un artefact d'outil). Aucune preuve Tier 1/2 vérifiée directement. CATEGORY_REVIEW maintenu.",
  "265476d2-d4fe-4e6d-adc7-39cabdc01fa8":
    "ECOLE PRIVEE DE FORMATION DES PERSONNELS DE SANTE FONDATION SAINT MAURICE DE BAFOUSSAM — routes A/C/D/H/I tentées. Nouvelle piste ce sprint : établissement identifié comme faisant probablement partie du même groupe \"univ-jeuguevou.com/nos-ecoles/\" que 2c29d228 (même groupe Jeuguevou, non confirmé avec certitude), mais domaine entièrement injoignable (même blocage SSL reproductible ce sprint). Confirmé présent sous ce nom exact dans la liste officielle MINSANTE 2025 (PDF texte extrait directement ce sprint via pdftotext — région OUEST, filière Infirmiers) : identité/orthographe officielle confirmée, mais AUCUNE information de niveau/cycle dans ce document (liste de noms uniquement, pas d'annotation de cycle par école). CATEGORY_REVIEW maintenu.",
  "7517d1df-be2c-4b4e-bb15-fc4548735739":
    "ECOLE DES METIERS DE LA SANTE DE BAMOUGOUM (EMES, canonique du doublon 276633af) — routes A/B/D/F tentées. Décision N°2938/D/MINSANTE du 13/07/2023 localisée ce sprint sur un document Scribd tiers (portant ouverture de l'école pour l'année 2024-2025) mais CE DOCUMENT MÉLANGE la décision avec des questions d'évaluation d'étudiants (données personnelles potentielles — noms/notes de candidats) — délibérément NON récupéré ni analysé plus avant, conformément au §12 du brief (ne pas persister de PII, ne pas extraire inutilement un PDF à données personnelles). PDF primaire minsante.cm toujours introuvable/scanné sans couche de texte exploitable. Confirmé présent sous acronyme \"EMES\" dans la liste officielle MINSANTE 2025 (texte extrait ce sprint). Aucune preuve de niveau vérifiable et sûre (PII). CATEGORY_REVIEW maintenu, MANUAL_SOURCE_REVIEW_REQUIRED pour la décision 2938 (accès humain direct à minsante.cm requis, pas de re-scraping automatisé d'un document à PII).",
  "68c3cd5b-de66-4f3c-9c3c-fdbdaad7f54c":
    "COMPLEXE DE FORMATION DES PERSONNELS DE SANTE \"ROIS MAGES\" COFPSAROMA DE BALENG — routes A/B/D tentées. Page trouvée et indexée par moteur de recherche (univ-jeuguevou.com/cofpsaroma/, snippet Tier 3 : mentionne programmes \"DQP & CQP\", cycles non-supérieurs) mais domaine INJOIGNABLE en direct ce sprint via DEUX voies indépendantes (WebFetch direct + proxy r.jina.ai, échec SSL identique aux deux) — le snippet de recherche n'est PAS une source Tier 1/2 vérifiée directement (§6 : Tier 3 = découverte uniquement, jamais la décision finale), donc non retenu malgré son contenu prometteur. CATEGORY_REVIEW maintenu.",
  "3c04b5c8-4a6d-4ad8-b625-bda87186c800":
    "COMPLEXE PRIVE DE FORMATION DU PERSONNEL DE LA SANTE DE MBOUO BANDJOUN — routes A/D/E(MINEFOP) tentées. Recherche approfondie ce sprint confirme via snippets (Tier 3) : supervision conjointe MINSANTE/MINEFOP, cycles \"CQP 1 an\" et \"diplôme MINSANTE 2-3 ans\". DEUX domaines distincts re-testés en direct ce sprint : cpfmbouocmr.org -> HTTP 403 Forbidden (reproductible, deux pages testées), cpfmbouocmr.net -> timeout DNS (reproductible). Aucune page institutionnelle récupérée directement malgré du contenu indexé prometteur. CATEGORY_REVIEW maintenu.",
  "8bf90bbd-3520-4f16-8cd7-e708892473bd":
    "COMPLEXE PRIVE DE FORMATION DU PERSONNEL MEDICO-SANITAIRE DE MBOUDA — routes A/C tentées. Piste \"Fondation Monga\" (fondation-monga.org, page /about-us/) RE-TESTÉE ce sprint en direct — toujours injoignable (DNS ENOTFOUND, reproductible). Identité avec le nom officiel MINSANTE (qui ne mentionne pas \"Fondation Monga\") reste NON confirmée même si le site avait été accessible (§16 : jamais une preuve externe appliquée sans identité confirmée). CATEGORY_REVIEW maintenu, piste à vérifier humainement (contact direct).",
  "92c96f6f-bf11-4de7-b9cf-44f2be0564b4":
    "ECOLE DES PROFESSIONNELS DE LA SANTE LES ETOILES DE BAFOUSSAM — routes A/C tentées. Contenu institutionnel riche trouvé via indexation moteur de recherche ce sprint (Tier 3 uniquement) : \"école de formation professionnelle\" formant ATMS/TPMS (techniciens/aides-techniciens médico-sanitaires), signal FORT et cohérent en faveur d'AUTRES — mais domaine eps-lesetoiles.com re-testé en DIRECT ce sprint et toujours injoignable (DNS ENOTFOUND, http et https). Conformément au §6 (Tier 3 = découverte uniquement, jamais finalisation), la classification reste CATEGORY_REVIEW malgré un signal de contenu très favorable — aucun abaissement du seuil de preuve. Piste prioritaire pour vérification humaine directe (visite manuelle du site, capture d'écran, ou contact) lors d'un sprint futur.",
  "5f99f3be-fd64-4d9a-a8fd-709d9e4f0821":
    "ECOLE PRIVEE DE FORMATION DES PERSONNELS SANITAIRES \"SAINT JOSEPH\" DE BAFOUSSAM — routes A/C tentées. AMBIGUÏTÉ D'IDENTITÉ SOULEVÉE EN MINSANTE-E DÉSORMAIS RÉSOLUE (mais pas la catégorie) : la liste officielle MINSANTE 2025 (texte extrait directement ce sprint via pdftotext, région OUEST, item 6, filière Analyses Médicales) confirme le nom officiel exact \"ECOLE PRIVEE DE FORMATION DES PERSONNELS SANITAIRES \\\"SAINT JOSEPH\\\" DE BAFOUSSAM\" comme entité distincte reconnue — l'établissement homonyme évoqué à Santchou en MINSANTE-E est donc probablement une entité SÉPARÉE sans incidence sur cette ligne staging. Malgré cette clarification d'identité (utile), AUCUNE preuve de niveau/cycle trouvée (la liste officielle ne contient pas d'annotation de cycle par école). CATEGORY_REVIEW maintenu pour la catégorie.",
  "0e0202b8-3175-4db9-890d-0294057239a1":
    "ECOLE PRIVEE DE FORMATION DU PERSONNEL DE LA SANTE DE BAFOUSSAM — routes A/C tentées. Confirmé présent sous ce nom exact dans la liste officielle MINSANTE 2025 (texte extrait ce sprint, région OUEST, item 7). Nom générique (gabarit partagé par de nombreux établissements homonymes de Bafoussam), aucune source institutionnelle isolable avec certitude suffisante d'identité trouvée ce sprint malgré la recherche. Aucune preuve de niveau. CATEGORY_REVIEW maintenu.",
  "27a2a636-eced-4971-8f62-67d8d1028ab3":
    "INSTITUT TROPICAL DE FORMATION EN PLAIES CHRONIQUES ET EN SOINS INFIRMIERS \"MOULLEC\" DE BALEVENG — routes A/C tentées. Nouvelle piste ce sprint : établissement confirmé comme centre de soins des plaies chroniques reconnu (articles de presse 237online.com/camer.be/actusoins.com, page Facebook \"Institut Moullec de Baleveng\") — mais TOUTES ces sources sont Tier 3 (presse, réseaux sociaux), explicitement exclues comme preuve finale (§6). Le profil de l'établissement (centre de soins spécialisé plutôt qu'école identifiable avec un cursus documenté) rend la question du niveau d'enseignement supérieur/non-supérieur non résolue par les sources trouvées. CATEGORY_REVIEW maintenu.",
  "a2f1cf0b-520e-42b1-bb84-81a20f9de8a3":
    "INSTITUT INTERNATIONAL DE FORMATION DE PERSONNELS PARAMEDICAUX IFOPP DE FOUMBOT — routes A/B/C tentées. Présence confirmée à nouveau ce sprint (page Facebook officielle IIFOPP, offres d'emploi minajobs.net/cameroun.minajobs.net) — AUCUN site institutionnel officiel distinct de Facebook trouvé malgré une recherche élargie (routes D-K). Facebook explicitement exclu comme preuve finale (§6). CATEGORY_REVIEW maintenu.",
  "f56097c9-ac2a-4bae-95af-2838aed0033f":
    "INSTITUT DES SCIENCES DE LA SANTE POOLA DE BAFOUSSAM — routes A/C tentées. Seule une page Facebook trouvée à nouveau ce sprint (institution confirmée distincte de \"Institut Supérieur des Sciences Appliquées à la Santé (INSSAS)\" et de ISTMS — nom différent, aucun lien de groupe trouvé) — Facebook explicitement exclu comme preuve finale (§6). CATEGORY_REVIEW maintenu.",
  "bbf4f625-3574-4bfa-b17a-278282b3bb6f": "Voir EXTERNAL_CATEGORY_CORROBORATION — RÉSOLU ce sprint (AUTRES_CONFIRMED, iu-pointe.fr).",
  "500e77b8-68a9-4e4f-8e0f-032890ff8520":
    "INSTITUT DES SCIENCES MEDICO-SANITAIRES LES ARGUS DE BANDJOUN — routes A/B/C/H/I/J tentées ce sprint (nom exact, variantes, Bandjoun+santé+formation, \"enseignement supérieur\"). AUCUN résultat pertinent trouvé sur AUCUNE route — empreinte numérique nulle confirmée à nouveau (requêtes renvoient des résultats sans rapport : assurance française \"L'Argus\", écoles homonymes hors Cameroun). Aucune amélioration par rapport à MINSANTE-C/D/E. CATEGORY_REVIEW maintenu — candidat structurellement bloqué, aucune source numérique découverte à ce jour.",
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

  console.log("=== SPRINT MINSANTE-F — CATEGORY EVIDENCE RECOVERY & PILOT CLOSURE ===\n");

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
    console.log("ATTENTION : le nombre de lignes pilote a changé depuis MINSANTE-E — STOP, ne pas deviner pourquoi.");
    process.exit(1);
  }

  // Périmètre auto-identifiant, sûr pour une ré-exécution (§19 idempotence) :
  // le scope MINSANTE-F est "les 14 lignes CATEGORY_REVIEW héritées de
  // MINSANTE-E", identifiées soit par leur classification ACTUELLE
  // (CATEGORY_REVIEW), soit par la présence d'un marqueur
  // `raw_data.minsante_f.sprint === SPRINT` déjà posé par un passage
  // antérieur de CE script.
  const categoryReviewRows = pilotRows.filter(
    (r) =>
      r.raw_data?.classification === "CATEGORY_REVIEW" ||
      (r.raw_data?.classification === "CLEAN_APPROVABLE" && r.raw_data?.minsante_f?.sprint === SPRINT)
  );
  console.log(`Lignes dans le périmètre MINSANTE-F (CATEGORY_REVIEW actuel + déjà résolues ce sprint) : ${categoryReviewRows.length} (attendu <= 14)`);
  if (categoryReviewRows.length > 14) {
    console.log("ATTENTION : le périmètre MINSANTE-F dépasse 14 lignes — dérive potentielle, STOP, ne pas deviner pourquoi.");
    process.exit(1);
  }
  const duplicateReviewRows = pilotRows.filter((r) => r.raw_data?.classification === "DUPLICATE_REVIEW");
  console.log(`Lignes DUPLICATE_REVIEW (hors périmètre de reclassification, §16) : ${duplicateReviewRows.length} (attendu 1)`);
  if (duplicateReviewRows.length !== 1) {
    console.log("ATTENTION : le nombre de candidats DUPLICATE_REVIEW a changé depuis MINSANTE-E — STOP, ne pas deviner pourquoi.");
    process.exit(1);
  }

  // ── §9 — Cibles MINESUP pour la frontière inter-ministérielle ──────
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
  console.log(`Cibles MINESUP §9 : ${minesupTargets.length}`);

  // ── §15 — Cibles live pour revalidation de doublon ───────────────────
  function mainCategoryToEducationFamily(mainCategory: string | null): string | null {
    if (mainCategory === "superieur") return "higher_education";
    return mainCategory;
  }
  const liveTargets: MatchTarget[] = allEst.map((e) => ({ id: e.id, name: e.name, region: e.region, city: e.city, category: mainCategoryToEducationFamily(e.main_category), identifiers: [] }));

  // ── Traitement des 14 candidats CATEGORY_REVIEW ─────────────────────
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

    // §9,16 — cross-ministry ne bloque QUE les candidats dont l'évidence de
    // catégorie mènerait vers SUPERIEUR_CONFIRMED (SAME_INSTITUTION ou
    // AMBIGUOUS bloquent une promotion indépendante potentielle). Pour un
    // candidat CATEGORY_REVIEW ou AUTRES_CONFIRMED sans signal cross-ministry
    // positif, la frontière inter-ministérielle n'a aucune incidence.
    if ((crossDecision === "SAME_INSTITUTION_CROSS_MINISTRY" || crossDecision === "AMBIGUOUS") && cat.decision === "SUPERIEUR_CONFIRMED") {
      newClassification = "CROSS_MINISTRY_REVIEW";
      newReason = `§9,16 — signal frontière inter-ministérielle détecté (${cross.level}) sur un candidat désormais classé SUPERIEUR_CONFIRMED : ${cross.reason} Jamais un auto-merge — revue humaine requise avant toute promotion future.`;
      newStatus = "normalized";
    } else if (liveMatch.level !== "NO_MATCH") {
      newClassification = "DUPLICATE_REVIEW";
      newReason = `§15 — signal de correspondance live détecté à la revalidation MINSANTE-F (${liveMatch.level}) : ${liveMatch.reason}`;
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
  // rafraîchie seulement, classification JAMAIS changée (§16) ───────────
  const dupRow = duplicateReviewRows[0];
  const dupCat = categoryVerdict(dupRow.name_raw, dupRow.id);
  console.log(`\nLigne DUPLICATE_REVIEW ${dupRow.id} (${dupRow.name_raw}) : category_decision rafraîchie -> ${dupCat.decision}, classification INCHANGÉE (DUPLICATE_REVIEW, §16).`);

  // ── Tallies ──────────────────────────────────────────────────────────
  const catTally: Record<string, number> = {};
  for (const r of results) catTally[r.category.decision] = (catTally[r.category.decision] ?? 0) + 1;
  const classTally: Record<string, number> = {};
  for (const r of results) classTally[r.new_classification] = (classTally[r.new_classification] ?? 0) + 1;
  console.log("\n=== VERDICTS DE CATÉGORIE (14) ===", catTally);
  console.log("=== NOUVELLE CLASSIFICATION (14) ===", classTally);

  mkdirSync(join(rootDir, "reports", "registry"), { recursive: true });

  // ── §25 — reports/registry/minsante-f-category-recovery.csv ─────────────
  const catHeader = [
    "staging_id",
    "name",
    "region",
    "programs",
    "current_category",
    "sources_checked",
    "best_source",
    "source_tier",
    "official_evidence",
    "cross_ministry_result",
    "decision",
    "new_main_category",
    "remaining_blocker",
    "reason",
  ];
  const catCsv = [catHeader.join(",")];
  for (const r of results) {
    const newMainCategory = r.category.decision === "SUPERIEUR_CONFIRMED" ? "superieur" : r.category.decision === "AUTRES_CONFIRMED" ? "autres" : "";
    const bestSource = EXTERNAL_CATEGORY_CORROBORATION[r.row.id]?.source ?? "Aucune source Tier 1/2 vérifiable trouvée ce sprint (routes A-K tentées, voir sources_checked)";
    const sourceTier = r.category.decision === "CATEGORY_REVIEW" ? "N/A (Tier 3 découverte uniquement, jamais retenu comme preuve finale)" : "TIER_2 (page institutionnelle officielle du groupe, vérifiée directement)";
    catCsv.push(
      [
        r.row.id,
        r.row.name_raw,
        r.row.region,
        (r.row.raw_data?.programs_normalized ?? []).join(" | "),
        "CATEGORY_REVIEW",
        RESEARCH_NOTES[r.row.id] ?? "",
        bestSource,
        sourceTier,
        r.category.evidence,
        r.crossMinistry.decision,
        r.category.decision,
        newMainCategory,
        r.category.decision === "CATEGORY_REVIEW" ? "Aucune source Tier 1/2 vérifiable — voir sources_checked pour la trace des routes A-K tentées" : "Aucun (résolu)",
        r.new_reason,
      ]
        .map(csvEscape)
        .join(",")
    );
  }
  writeFileSync(join(rootDir, "reports", "registry", "minsante-f-category-recovery.csv"), catCsv.join("\n"), "utf-8");

  // ── §25 — reports/registry/minsante-f-cross-ministry-review.csv ───────
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
          ? "Signal détecté par le moteur de matching — mais candidat non classé SUPERIEUR_CONFIRMED ce sprint, donc aucun blocage cross-ministry appliqué (§9,16 : la revalidation ne s'impose qu'aux nouveaux 'superieur')."
          : "Aucune action requise — engine confirme une institution distincte du registre MINESUP consulté ce sprint.",
      ]
        .map(csvEscape)
        .join(",")
    );
  }
  writeFileSync(join(rootDir, "reports", "registry", "minsante-f-cross-ministry-review.csv"), crossCsv.join("\n"), "utf-8");

  // ── §18-19 — UPDATE additif sur EXACTEMENT les 14 lignes CATEGORY_REVIEW,
  // idempotent, préservation intégrale de l'historique b/c/d/e ───────────
  console.log("\n=== §18-19 — MISE À JOUR STAGING (additive, 14 lignes CATEGORY_REVIEW scoped) ===");
  let updated = 0;
  for (const r of results) {
    const raw = r.row.raw_data ?? {};
    const nextRawData: Record<string, unknown> = {
      ...raw,
      // §18 — historique additif : minsante_b/c/d_snapshot déjà présents ne
      // sont JAMAIS réécrits (spread `...raw` les recopie tels quels).
      // Snapshot MINSANTE-E capturé ici pour la première fois seulement
      // (idempotent via `??`).
      minsante_e_snapshot: raw.minsante_e_snapshot ?? {
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
      // §18 — champs requis par le brief F : minsante_f_category_evidence,
      // best_source, decision, operator, timestamp.
      minsante_f_category_evidence: r.category.evidence,
      minsante_f: {
        sprint: SPRINT,
        operator: OPERATOR,
        timestamp: new Date().toISOString(),
        decision: r.category.decision,
        best_source: EXTERNAL_CATEGORY_CORROBORATION[r.row.id]?.source ?? null,
        evidence_type: r.category.evidenceType,
        research_note: RESEARCH_NOTES[r.row.id] ?? null,
        live_match_level_revalidated: r.liveMatchLevel,
        cross_ministry_level_revalidated: r.crossMinistry.matchLevel,
      },
    };
    const { error: updErr } = await supabase.from("establishment_import_staging").update({ raw_data: nextRawData, status: r.new_status }).eq("id", r.row.id);
    if (updErr) throw new Error(`Échec mise à jour staging pour ${r.row.id} : ${updErr.message}`);
    updated++;
  }
  console.log(`Lignes du périmètre MINSANTE-F mises à jour : ${updated}/${results.length} (sur 14 au maximum, §19)`);

  // ── Ligne DUPLICATE_REVIEW : category_decision rafraîchie seulement,
  // classification/status JAMAIS touchés (§16) ─────────────────────────
  {
    const raw = dupRow.raw_data ?? {};
    const nextRawData: Record<string, unknown> = {
      ...raw,
      minsante_e_snapshot: raw.minsante_e_snapshot ?? {
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
      minsante_f_category_evidence: dupCat.evidence,
      minsante_f: {
        sprint: SPRINT,
        operator: OPERATOR,
        timestamp: new Date().toISOString(),
        decision: dupCat.decision,
        best_source: EXTERNAL_CATEGORY_CORROBORATION[dupRow.id]?.source ?? null,
        evidence_type: dupCat.evidenceType,
        note: "§16 — blocage de doublon préservé : classification volontairement NON modifiée malgré le rafraîchissement de category_decision.",
      },
    };
    const { error: updErr } = await supabase.from("establishment_import_staging").update({ raw_data: nextRawData }).eq("id", dupRow.id);
    if (updErr) throw new Error(`Échec mise à jour staging pour la ligne DUPLICATE_REVIEW ${dupRow.id} : ${updErr.message}`);
  }

  // ── Preuve d'idempotence : relecture réelle depuis la DB (§19) ─────────
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

  // ── §17 — recalcul de la population complète des 22 lignes ────────────
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
  console.log("\n=== POPULATION COMPLÈTE DU PILOTE (22) APRÈS MINSANTE-F ===", afterTally);

  // ── §25 — reports/registry/minsante-f-reclassification.csv (les 14 CATEGORY_REVIEW) ──
  const reclassHeader = ["staging_id", "name_raw", "region", "previous_classification", "category_evidence_type", "new_category_decision", "cross_ministry_decision", "new_classification", "reason"];
  const reclassCsv = [reclassHeader.join(",")];
  for (const r of results) {
    reclassCsv.push(
      [r.row.id, r.row.name_raw, r.row.region, "CATEGORY_REVIEW", r.category.evidenceType, r.category.decision, r.crossMinistry.decision, r.new_classification, r.new_reason]
        .map(csvEscape)
        .join(",")
    );
  }
  writeFileSync(join(rootDir, "reports", "registry", "minsante-f-reclassification.csv"), reclassCsv.join("\n"), "utf-8");

  // ── §21 — reports/registry/minsante-f-pilot-approval.json (nouveau
  // snapshot, tri déterministe par staging_id, NE PAS écraser B/C/D/E) ─────
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
  const previous = JSON.parse(readFileSync(join(rootDir, "reports", "registry", "minsante-e-pilot-approval.json"), "utf-8"));

  writeFileSync(
    join(rootDir, "reports", "registry", "minsante-f-pilot-approval.json"),
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        operator: OPERATOR,
        sprint: SPRINT,
        batch: BATCH_ID,
        previous_snapshot: { sprint: "MINSANTE-E", candidate_count: previous.candidate_count, checksum: previous.checksum },
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
  console.log(`Ancien snapshot (MINSANTE-E, préservé, non écrasé) : ${previous.candidate_count} candidat(s) — checksum ${previous.checksum}`);

  // ── §28 — post-condition base de données ───────────────────────────────
  const { count: estAfter } = await supabase.from("establishments").select("*", { count: "exact", head: true });
  const { count: stagingAfter } = await supabase.from("establishment_import_staging").select("*", { count: "exact", head: true });
  const { count: registryAfter } = await supabase.from("establishment_registry_identifiers").select("*", { count: "exact", head: true });
  console.log(`\nPOST-CONDITION : establishments ${estBefore}->${estAfter} | staging ${stagingBefore}->${stagingAfter} | registry_identifiers ${registryBefore}->${registryAfter}`);

  // ── §25 — reports/registry/minsante-f-category-summary.json ───────────
  const categorySummary = {
    generated_at: new Date().toISOString(),
    operator: OPERATOR,
    sprint: SPRINT,
    batch: BATCH_ID,
    model: "MODEL_A",
    model_description:
      "health_training (education_family, inchangé) se traduit en main_category='superieur' UNIQUEMENT si preuve explicite de niveau supérieur (mot de niveau auto-déclaré dans le titre officiel, ou corroboration officielle externe Tier 1/2 vérifiée directement), sinon 'autres' SI une preuve explicite de niveau non-supérieur existe, sinon CATEGORY_REVIEW — jamais une valeur devinée depuis 'Institut'/'École' seuls. Modèle inchangé depuis MINSANTE-C, hiérarchie non affaiblie.",
    migration_required: false,
    category_evidence_hierarchy: [
      "1. EXPLICIT_LEVEL_WORD_IN_OFFICIAL_TITLE (supérieur/universitaire/université/faculté) -> SUPERIEUR_CONFIRMED",
      "2. OFFICIAL_CYCLE_DIPLOMA_NAME_IN_TITLE (ex. 'Infirmiers Diplômés d'État') -> AUTRES_CONFIRMED",
      "3. Corroboration officielle externe Tier 1/2 vérifiée DIRECTEMENT ce sprint (page institutionnelle officielle récupérée avec succès + identité confirmée) -> SUPERIEUR_CONFIRMED ou AUTRES_CONFIRMED selon la preuve",
      "4. Aucune preuve suffisante -> CATEGORY_REVIEW (défaut, jamais une catégorie inventée, §13)",
    ],
    starting_candidates: 14,
    superieur_confirmed: results.filter((r) => r.category.decision === "SUPERIEUR_CONFIRMED").length,
    autres_confirmed: results.filter((r) => r.category.decision === "AUTRES_CONFIRMED").length,
    still_category_review: results.filter((r) => r.category.decision === "CATEGORY_REVIEW").length,
    cross_ministry_review: results.filter((r) => r.new_classification === "CROSS_MINISTRY_REVIEW").length,
    before: { CLEAN_APPROVABLE: 7, CATEGORY_REVIEW: 14, DUPLICATE_REVIEW: 1 },
    after: {
      CLEAN_APPROVABLE: afterTally.CLEAN_APPROVABLE ?? 0,
      CATEGORY_REVIEW: afterTally.CATEGORY_REVIEW ?? 0,
      DUPLICATE_REVIEW: afterTally.DUPLICATE_REVIEW ?? 0,
      CROSS_MINISTRY_REVIEW: afterTally.CROSS_MINISTRY_REVIEW ?? 0,
      OTHER_REVIEW: afterTally.OTHER_REVIEW ?? 0,
    },
    total: allPilotAfter.length,
    reconciled: Object.values(afterTally).reduce((a, b) => a + b, 0) === 22,
    taxonomy_validity_check: "superieur/autres restent sémantiquement suffisants pour les 14 candidats observés ce sprint — aucune catégorie officielle distincte rencontrée qui ne rentrerait dans ni l'une ni l'autre valeur. Aucun CATEGORY MODEL GAP identifié, aucune migration proposée.",
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
    approval_snapshot: { previous_sprint: "MINSANTE-E", previous_count: previous.candidate_count, previous_checksum: previous.checksum, new_count: approvalCandidates.length, new_checksum: newChecksum },
    promotion: "NO",
  };
  writeFileSync(join(rootDir, "reports", "registry", "minsante-f-category-summary.json"), JSON.stringify(categorySummary, null, 2), "utf-8");

  // ── §22-24 — reports/registry/minsante-f-pilot-closure.json ───────────
  const stillCategoryReview = afterTally.CATEGORY_REVIEW ?? 0;
  const cleanCount = afterTally.CLEAN_APPROVABLE ?? 0;
  const duplicateCount = afterTally.DUPLICATE_REVIEW ?? 0;
  const crossMinistryCount = afterTally.CROSS_MINISTRY_REVIEW ?? 0;
  const pilotClosed =
    cleanCount + stillCategoryReview + duplicateCount + crossMinistryCount === 22 &&
    cleanCount >= 7 && // population clean au moins égale à MINSANTE-E, jamais dégradée
    idempotentOk;
  const closure = {
    generated_at: new Date().toISOString(),
    operator: OPERATOR,
    sprint: SPRINT,
    batch: BATCH_ID,
    pilot_total: 22,
    final_classification: {
      CLEAN_APPROVABLE: cleanCount,
      CATEGORY_REVIEW: stillCategoryReview,
      DUPLICATE_REVIEW: duplicateCount,
      CROSS_MINISTRY_REVIEW: crossMinistryCount,
      OTHER: afterTally.OTHER_REVIEW ?? 0,
    },
    unresolved_candidates: stillCategoryReview,
    deferred_candidates_documented: stillCategoryReview + duplicateCount,
    safety_blockers_unknown: 0,
    minsante_pilot_closed: pilotClosed,
    closure_rationale: pilotClosed
      ? `Les 22 lignes du pilote ont une classification explicite et justifiée. ${stillCategoryReview} candidat(s) CATEGORY_REVIEW restent isolés et documentés (RESEARCH_NOTES complètes, aucune promotion, aucun blocage de sécurité inconnu) ; 1 candidat DUPLICATE_REVIEW reste exclu (§16). La population CLEAN_APPROVABLE (${cleanCount}/22, ${Math.round((cleanCount / 22) * 100)}%) est significative pour une promotion contrôlée future limitée à ce snapshot exact. Le pilote peut être formellement clos sans exiger 100% de propreté (§22 du brief) — les candidats non résolus restent différés, pas bloquants pour la clôture.`
      : "Conditions de clôture non réunies — voir final_classification et idempotence pour le détail.",
    promotion_readiness: {
      ready_for_controlled_promotion_preflight: pilotClosed && cleanCount > 0,
      promotion_population_rule: "Population de promotion = EXACTEMENT le snapshot minsante-f-pilot-approval.json (candidate_count + checksum ci-dessous), jamais une reclassification partielle au moment de la promotion. Les candidats CATEGORY_REVIEW/DUPLICATE_REVIEW restent différés indéfiniment jusqu'à preuve Tier 1/2 future.",
      promotion_population_snapshot: { sprint: SPRINT, candidate_count: approvalCandidates.length, checksum: newChecksum },
    },
    national_expansion_readiness: {
      ready_to_expand_pdf_parser_to_10_10_filieres: false,
      rationale: "Indépendant de la clôture du pilote régional. Ce sprint a confirmé que le parser PDF MINSANTE échoue encore sur des documents de décision individuels scannés (ex. décision N°2938/D/MINSANTE) même quand la liste consolidée 2025 a une couche de texte exploitable — le comportement du parser sur des documents hétérogènes (certains avec texte, certains scannés) n'a pas été testé à l'échelle nationale (10/10 filières) ce sprint. Évaluation seule ce sprint, AUCUNE expansion exécutée.",
    },
  };
  writeFileSync(join(rootDir, "reports", "registry", "minsante-f-pilot-closure.json"), JSON.stringify(closure, null, 2), "utf-8");

  console.log("\n=== MINSANTE-F RECLASSIFY — TERMINÉ ===");
  console.log(`Pilot closed: ${pilotClosed}`);
}

main().catch((error) => {
  console.error("Échec MINSANTE-F reclassify :", error);
  process.exit(1);
});
