import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { matchCandidate } from "./lib/matching/engine";
import { sha256 } from "./lib/extraction/hashing";
import type { MatchTarget, MatchCandidate } from "./lib/matching/types";

/**
 * SPRINT MINSANTE-D — DUPLICATE REVIEW & APPROVAL POPULATION CONSOLIDATION.
 *
 * Traite les 11 lignes staging MINSANTE (batch minsante-pilot-v1) actuellement
 * classification=DUPLICATE_REVIEW. Pour chacune :
 *  - revalidation live (§8) et staging non-pilote (§9) avec le moteur de
 *    matching INCHANGÉ (§13) ;
 *  - revalidation frontière inter-ministérielle MINESUP (§10, même
 *    construction de cible que MINSANTE-C, non redécouverte) ;
 *  - décision de dédoublonnage intra-lot documentée CAS PAR CAS (§3-7),
 *    jamais un algorithme générique de similarité — chaque verdict est
 *    justifié individuellement dans DUPLICATE_DECISIONS ci-dessous, à la
 *    manière de resolve-duplicate-review.ts (SPRINT R) ;
 *  - une fois le blocage de doublon levé (CONFIRMED_SAME_ESTABLISHMENT
 *    canonique, ou CONFIRMED_DISTINCT), évaluation du blocage de catégorie
 *    (§17) avec la MÊME matrice de preuve que minsante-c-reclassify.ts
 *    (Règles 1-2 inchangées, aucune nouvelle corroboration externe
 *    appliquée sans identité confirmée) ;
 *  - AUCUNE promotion, AUCUNE écriture establishments/registry_identifiers,
 *    AUCUNE suppression physique de ligne staging (§14 : le doublon
 *    non-canonique reste en base, `duplicate_of_staging_id` documente la
 *    relation, `classification` reste DUPLICATE_REVIEW — l'architecture ne
 *    prévoit pas d'état "doublon confirmé mais conservé" distinct, donc on
 *    réutilise l'état existant compris par le Review Center plutôt que
 *    d'inventer une valeur non supportée).
 *
 * Portée : UPDATE additif sur EXACTEMENT les 11 lignes staging scoped.
 * Toute autre ligne du pilote (les 4 CLEAN_APPROVABLE + les 7
 * CATEGORY_REVIEW déjà résolus en MINSANTE-C) n'est ni lue en écriture ni
 * modifiée par ce script (§1 périmètre strict).
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..", "..");
const BATCH_ID = "minsante-pilot-v1";
const OPERATOR = "jean-merlain";
const SPRINT = "MINSANTE-D";

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

// ── Matrice de preuve de catégorie — IDENTIQUE à minsante-c-reclassify.ts
// (§13 : moteur/matrice non retouchés pour faire disparaître artificiellement
// des cas). Aucune nouvelle corroboration externe appliquée ce sprint : la
// recherche ciblée MINSANTE-D a porté sur l'IDENTITÉ (doublon), pas sur la
// catégorie des 9 candidats CATEGORY_REVIEW hérités (§17 : hors périmètre).
type CategoryDecision = "SUPERIEUR_CONFIRMED" | "AUTRES_CONFIRMED" | "CATEGORY_REVIEW";
interface CategoryVerdict {
  decision: CategoryDecision;
  evidenceType: string;
  evidence: string;
}
function categoryVerdict(displayName: string): CategoryVerdict {
  const upper = displayName
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase();
  if (/\bSUPERIEUR(E)?\b/.test(upper) || /\bUNIVERSITAIRE\b/.test(upper) || /\bUNIVERSITE\b/.test(upper) || /\bFACULTE\b/.test(upper)) {
    return {
      decision: "SUPERIEUR_CONFIRMED",
      evidenceType: "EXPLICIT_LEVEL_WORD_IN_OFFICIAL_TITLE",
      evidence: "Titre officiel MINSANTE contient un mot de niveau explicite (supérieur/universitaire/université/faculté) — auto-déclaré par l'établissement lui-même dans son nom officiel.",
    };
  }
  if (/\bINFIRMIERS?\s+DIPLOMES?\s+D.?\s*ETAT\b/.test(upper)) {
    return {
      decision: "AUTRES_CONFIRMED",
      evidenceType: "OFFICIAL_CYCLE_DIPLOMA_NAME_IN_TITLE",
      evidence:
        "Titre officiel MINSANTE contient la désignation explicite du diplôme d'État \"Infirmier(s) Diplômé(s) d'État\" — diplôme de cycle B (Décret 80/198), formation non-supérieure reconnue, auto-déclarée dans le nom officiel lui-même (même standard de preuve que la Règle 1, appliqué symétriquement, hérité identique de MINSANTE-C).",
    };
  }
  return {
    decision: "CATEGORY_REVIEW",
    evidenceType: "INSUFFICIENT_EVIDENCE",
    evidence:
      "Aucun mot de niveau explicite dans le titre officiel, aucune désignation de cycle/diplôme reconnue dans le titre. §17 — un candidat de dédoublonnage résolu (CONFIRMED_DISTINCT ou canonique d'un CONFIRMED_SAME_ESTABLISHMENT) ne devient CLEAN_APPROVABLE que si TOUS les autres blocages, y compris la catégorie, sont également résolus — sinon il devient CATEGORY_REVIEW, jamais une catégorie devinée.",
  };
}

// ── §3-7,14 — DÉCISIONS DE DÉDOUBLONNAGE, documentées CAS PAR CAS ─────────
// Source des paires : reports/registry/minsante-b-dedup-review.csv (8 paires
// couvrant les 11 candidats). Chaque verdict cite la hiérarchie de preuve
// §5 utilisée et exclut explicitement le chevauchement de mots génériques
// seul (centre/formation/personnel/santé/sanitaire/école/institut/médico).
type DuplicateVerdict = "CONFIRMED_SAME_ESTABLISHMENT" | "CONFIRMED_DISTINCT" | "STILL_AMBIGUOUS";
interface DuplicateDecision {
  verdict: DuplicateVerdict;
  pairedWith: string[]; // staging_id des partenaires de paire dedup-review
  pairedType: string;
  evidence: string;
  canonicalStagingId: string | null; // renseigné seulement pour les paires CONFIRMED_SAME_ESTABLISHMENT
  officialSourceUsed: string;
}

const DUPLICATE_DECISIONS: Record<string, DuplicateDecision> = {
  "7517d1df-be2c-4b4e-bb15-fc4548735739": {
    // ECOLE DES METIERS DE LA SANTE DE BAMOUGOUM — CANONIQUE
    verdict: "CONFIRMED_SAME_ESTABLISHMENT",
    pairedWith: ["276633af-df10-4d1e-b91e-596c7a50ed34"],
    pairedType: "LIKELY_SAME_SCHOOL (67% overlap, minsante-b-dedup-review.csv)",
    evidence:
      "§6 modèle école×programme : les DEUX candidats partagent la totalité de leurs tokens distinctifs (École/Métiers/Santé/Bamougoum, même commune — accord de géographie, pas de contradiction) ; la SEULE différence est l'insertion du token \"EMES\" dans l'autre candidat, qui décode littéralement les mêmes mots déjà présents (École des Métiers de la Santé = E.M.E.S. — acronyme auto-référentiel, jamais un token distinctif indépendant). Programmes COMPLÉMENTAIRES et non chevauchants (ce candidat : Analyses Médicales, Infirmiers ; l'autre : Sages-femmes/Maïeuticiens) — cohérent avec le modèle §6 \"une école peut apparaître sous plusieurs filières\" plutôt que deux écoles distinctes coïncidant sur un nom quasi-identique dans la même petite localité. Recherche ciblée externe tentée (voir official_source_used) : un résultat de recherche web a évoqué une décision MINSANTE N°2938/D/MINSANTE du 13/07/2023 ouvrant \"l'École des Métiers de la Santé (EMES) de Bamougoum\" (nom unique avec acronyme entre parenthèses), mais le document primaire cité (PDF minsante.cm) s'est révélé être une image scannée sans couche de texte exploitable — IMPOSSIBLE à vérifier directement, donc PAS retenu comme preuve décisive (§11 : seule une preuve vérifiée compte), seulement mentionné comme corroboration non confirmée. La décision CONFIRMED_SAME_ESTABLISHMENT repose sur la preuve INTERNE §6 (identité de tokens + complémentarité de programmes + même commune), pas sur la recherche externe non vérifiable.",
    canonicalStagingId: "7517d1df-be2c-4b4e-bb15-fc4548735739",
    officialSourceUsed:
      "Recherche web ciblée tentée (requête \"Ecole des Métiers de la Santé Bamougoum EMES\") — résultat évoquant décision N°2938/D/MINSANTE du 13/07/2023, mais source primaire (PDF minsante.cm/PERMUTATIONS 2023) image scannée sans texte extractible, NON vérifiable directement — non retenue comme preuve décisive, décision fondée sur §6 (preuve interne).",
  },
  "276633af-df10-4d1e-b91e-596c7a50ed34": {
    // ECOLE DES METIERS DE LA SANTE EMES DE BAMOUGOUM — DOUBLON NON-CANONIQUE
    verdict: "CONFIRMED_SAME_ESTABLISHMENT",
    pairedWith: ["7517d1df-be2c-4b4e-bb15-fc4548735739"],
    pairedType: "LIKELY_SAME_SCHOOL (67% overlap, minsante-b-dedup-review.csv)",
    evidence:
      "Même établissement que 7517d1df-be2c-4b4e-bb15-fc4548735739 (voir évidence détaillée sur ce candidat). §14 — préférence canonique appliquée : source identique (égalité) ; NOMBRE DE PROGRAMMES départage (7517d1df : 2 programmes [Analyses Médicales, Infirmiers] > ce candidat : 1 programme [Sages-femmes/Maïeuticiens]) -> 7517d1df choisi CANONIQUE, ce candidat reste le DOUBLON documenté (non supprimé physiquement, §14).",
    canonicalStagingId: "7517d1df-be2c-4b4e-bb15-fc4548735739",
    officialSourceUsed: "Voir official_source_used du candidat canonique 7517d1df-be2c-4b4e-bb15-fc4548735739.",
  },
  "5f99f3be-fd64-4d9a-a8fd-709d9e4f0821": {
    // ECOLE PRIVEE DE FORMATION DES PERSONNELS SANITAIRES "SAINT JOSEPH" DE BAFOUSSAM
    verdict: "CONFIRMED_DISTINCT",
    pairedWith: ["bbf4f625-3574-4bfa-b17a-278282b3bb6f", "265476d2-d4fe-4e6d-adc7-39cabdc01fa8"],
    pairedType: "AMBIGUOUS (50% overlap x2, minsante-b-dedup-review.csv)",
    evidence:
      "§5 tier 8 (tokens de nom distinctifs) : le chevauchement de 50% avec chacun des deux partenaires de paire porte EXCLUSIVEMENT sur du vocabulaire générique interdit comme preuve d'identité (formation/personnels/sanitaires/santé/de/la), jamais sur le token distinctif réel \"Saint Joseph\" (patronage religieux spécifique), absent des deux autres candidats (\"Sciences et Techniques Médico-Sanitaires\" — dénomination descriptive sans patronage ; \"Fondation ... Saint Maurice\" — patronage différent, Maurice ≠ Joseph). Aucune preuve de rang supérieur (1-7) disponible. Tokens distinctifs propres et non partagés dans les deux paires -> établissements distincts.",
    canonicalStagingId: null,
    officialSourceUsed: "Aucune (résolu sur §5 tier 8, tokens de nom distinctifs — aucune recherche externe nécessaire).",
  },
  "bbf4f625-3574-4bfa-b17a-278282b3bb6f": {
    // INSTITUT DES SCIENCES ET TECHNIQUES MEDICO-SANITAIRES DE BAFOUSSAM
    verdict: "CONFIRMED_DISTINCT",
    pairedWith: ["5f99f3be-fd64-4d9a-a8fd-709d9e4f0821", "f56097c9-ac2a-4bae-95af-2838aed0033f", "500e77b8-68a9-4e4f-8e0f-032890ff8520"],
    pairedType: "AMBIGUOUS (50% overlap x3, minsante-b-dedup-review.csv)",
    evidence:
      "§5 tier 8 : chevauchement générique uniquement avec \"Saint Joseph\" (5f99f3be) et \"Poola\" (f56097c9) — tokens distinctifs propres à chacun, jamais partagés. Avec 500e77b8 (Les Argus, Bandjoun) : en PLUS du tier 8, §7 contradiction géographique explicite — Bafoussam (ce candidat) ≠ Bandjoun (500e77b8), communes différentes, aucune preuve multi-campus -> signal négatif fort supplémentaire. Établissement distinct des trois partenaires de paire.",
    canonicalStagingId: null,
    officialSourceUsed: "Aucune (résolu sur §5 tier 8 + §7 contradiction géographique pour la paire avec 500e77b8).",
  },
  "265476d2-d4fe-4e6d-adc7-39cabdc01fa8": {
    // ECOLE PRIVEE DE FORMATION DES PERSONNELS DE SANTE FONDATION SAINT MAURICE DE BAFOUSSAM
    verdict: "CONFIRMED_DISTINCT",
    pairedWith: ["5f99f3be-fd64-4d9a-a8fd-709d9e4f0821", "2c29d228-e387-4db1-a855-7425c05e6a96", "9c4b9a28-1aa2-4fc2-baa8-48d3919758f7"],
    pairedType: "AMBIGUOUS (50% overlap x3, minsante-b-dedup-review.csv)",
    evidence:
      "§5 tier 8 : patronage/fondateur distinctif \"Fondation ... Saint Maurice\" jamais partagé avec \"Saint Joseph\" (5f99f3be, patronage Joseph ≠ Maurice), \"Jeugeuvou Fowang\" (2c29d228, famille fondatrice différente), ni \"Tchuente\" (9c4b9a28, famille fondatrice différente). Chevauchement des trois paires exclusivement sur du vocabulaire générique interdit (école/privée/formation/personnels/de/la/santé/fondation seul sans le nom propre qui suit). Établissement distinct des trois partenaires de paire.",
    canonicalStagingId: null,
    officialSourceUsed: "Aucune (résolu sur §5 tier 8, tokens de nom distinctifs).",
  },
  "2c29d228-e387-4db1-a855-7425c05e6a96": {
    // ECOLE PRIVEE FONDATION JEUGEUVOU FOWANG DE BAFOUSSAM
    verdict: "CONFIRMED_DISTINCT",
    pairedWith: ["265476d2-d4fe-4e6d-adc7-39cabdc01fa8", "9c4b9a28-1aa2-4fc2-baa8-48d3919758f7"],
    pairedType: "AMBIGUOUS (50% overlap x2, minsante-b-dedup-review.csv)",
    evidence:
      "§5 tier 8 : famille fondatrice distinctive \"Jeugeuvou Fowang\" jamais partagée avec \"Saint Maurice\" (265476d2) ni \"Tchuente\" (9c4b9a28) — noms de fondateur/patron totalement différents malgré le gabarit commun \"École Privée Fondation X De Bafoussam\". Établissement distinct des deux partenaires de paire.",
    canonicalStagingId: null,
    officialSourceUsed: "Aucune (résolu sur §5 tier 8, tokens de nom distinctifs).",
  },
  "9c4b9a28-1aa2-4fc2-baa8-48d3919758f7": {
    // ECOLE PRIVEE FONDATION TCHUENTE DE BAFOUSSAM
    verdict: "CONFIRMED_DISTINCT",
    pairedWith: ["2c29d228-e387-4db1-a855-7425c05e6a96", "265476d2-d4fe-4e6d-adc7-39cabdc01fa8"],
    pairedType: "AMBIGUOUS (50% overlap x2, minsante-b-dedup-review.csv)",
    evidence:
      "§5 tier 8 : famille fondatrice distinctive \"Tchuente\" jamais partagée avec \"Jeugeuvou Fowang\" (2c29d228) ni \"Saint Maurice\" (265476d2). Établissement distinct des deux partenaires de paire.",
    canonicalStagingId: null,
    officialSourceUsed: "Aucune (résolu sur §5 tier 8, tokens de nom distinctifs).",
  },
  "f56097c9-ac2a-4bae-95af-2838aed0033f": {
    // INSTITUT DES SCIENCES DE LA SANTE POOLA DE BAFOUSSAM
    verdict: "CONFIRMED_DISTINCT",
    pairedWith: ["bbf4f625-3574-4bfa-b17a-278282b3bb6f"],
    pairedType: "AMBIGUOUS (50% overlap, minsante-b-dedup-review.csv)",
    evidence:
      "§5 tier 8 : marque distinctive \"Poola\" absente de \"Institut des Sciences et Techniques Médico-Sanitaires\" (bbf4f625), et réciproquement rien de \"Sciences et Techniques Médico-Sanitaires\" (élaboration générique, sans marque propre) ne recoupe \"Poola\". Chevauchement limité au gabarit générique \"Institut des Sciences ... de Bafoussam\". Établissement distinct.",
    canonicalStagingId: null,
    officialSourceUsed: "Aucune (résolu sur §5 tier 8, tokens de nom distinctifs).",
  },
  "500e77b8-68a9-4e4f-8e0f-032890ff8520": {
    // INSTITUT DES SCIENCES MEDICO-SANITAIRES LES ARGUS DE BANDJOUN
    verdict: "CONFIRMED_DISTINCT",
    pairedWith: ["bbf4f625-3574-4bfa-b17a-278282b3bb6f"],
    pairedType: "AMBIGUOUS (50% overlap, minsante-b-dedup-review.csv)",
    evidence:
      "§7 contradiction géographique explicite : Bandjoun (ce candidat) ≠ Bafoussam (bbf4f625, Institut des Sciences et Techniques Médico-Sanitaires) — communes différentes de la région Ouest, AUCUNE preuve multi-campus disponible -> signal négatif fort (§7 : \"préférer CONFIRMED_DISTINCT\"). Renforcé par §5 tier 8 : marque distinctive \"Les Argus\" absente de l'autre candidat. Établissement distinct.",
    canonicalStagingId: null,
    officialSourceUsed: "Aucune (résolu sur §7 contradiction géographique + §5 tier 8).",
  },
  "109f38dc-ff92-4fb9-9028-f2f1fb065042": {
    // ECOLE DES INFIRMIERS DIPLOMES D'ETAT DE BAFOUSSAM
    verdict: "CONFIRMED_DISTINCT",
    pairedWith: ["ba827d94-6542-40fd-b811-a0d964a8bceb"],
    pairedType: "AMBIGUOUS (75% overlap, minsante-b-dedup-review.csv)",
    evidence:
      "§7 contradiction géographique explicite (exemple canonique de la règle §7) : Bafoussam (ce candidat) ≠ Foumban (ba827d94), communes différentes de la région Ouest, AUCUNE preuve multi-campus disponible. Le chevauchement de 75% porte sur le gabarit officiel partagé \"École des Infirmiers Diplômés d'État de X\" (désignation de diplôme d'État reconnue, cf. Décret 80/198) — le nom du gabarit lui-même identifie la commune comme le SEUL élément distinctif, et les deux communes diffèrent explicitement. Établissement distinct.",
    canonicalStagingId: null,
    officialSourceUsed: "Aucune (résolu sur §7 contradiction géographique — cas explicitement anticipé par le brief).",
  },
  "ba827d94-6542-40fd-b811-a0d964a8bceb": {
    // ECOLE DES INFIRMIERS DIPLOMES D'ETAT DE FOUMBAN
    verdict: "CONFIRMED_DISTINCT",
    pairedWith: ["109f38dc-ff92-4fb9-9028-f2f1fb065042"],
    pairedType: "AMBIGUOUS (75% overlap, minsante-b-dedup-review.csv)",
    evidence:
      "Symétrique à 109f38dc-ff92-4fb9-9028-f2f1fb065042 (voir évidence détaillée sur ce candidat) — Foumban ≠ Bafoussam, §7 contradiction géographique explicite.",
    canonicalStagingId: null,
    officialSourceUsed: "Aucune (résolu sur §7 contradiction géographique).",
  },
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

  console.log("=== SPRINT MINSANTE-D — DUPLICATE REVIEW & APPROVAL POPULATION CONSOLIDATION ===\n");

  // ── §1 — Baseline fraîche ──────────────────────────────────────────────
  const { count: estBefore } = await supabase.from("establishments").select("*", { count: "exact", head: true });
  const { count: stagingBefore } = await supabase.from("establishment_import_staging").select("*", { count: "exact", head: true });
  const { count: registryBefore } = await supabase.from("establishment_registry_identifiers").select("*", { count: "exact", head: true });
  console.log(`Baseline : establishments=${estBefore}, staging=${stagingBefore}, registry_identifiers=${registryBefore}`);

  // ── §2 — Chargement strict des 22 lignes pilote, filtrage aux 11 DUPLICATE_REVIEW ──
  const pilotRows = (await fetchAllPaginated<StagingRow>(
    supabase,
    "establishment_import_staging",
    "id,name_raw,region,city,status,source_ministry,education_family,raw_data",
    (q) => q.eq("source_ministry", "MINSANTE")
  )).filter((r) => r.raw_data?.batch === BATCH_ID);
  console.log(`Lignes pilote MINSANTE (batch ${BATCH_ID}) : ${pilotRows.length} (attendu 22)`);
  if (pilotRows.length !== 22) {
    console.log("ATTENTION : le nombre de lignes pilote a changé depuis MINSANTE-C — STOP, ne pas deviner pourquoi.");
    process.exit(1);
  }

  const duplicateReviewRows = pilotRows.filter((r) => r.raw_data?.classification === "DUPLICATE_REVIEW");
  console.log(`Lignes DUPLICATE_REVIEW (périmètre strict §2) : ${duplicateReviewRows.length} (attendu 11)`);
  if (duplicateReviewRows.length !== 11) {
    console.log("ATTENTION : le nombre de candidats DUPLICATE_REVIEW a changé depuis MINSANTE-C — STOP, ne pas deviner pourquoi.");
    process.exit(1);
  }
  const scopedIds = new Set(duplicateReviewRows.map((r) => r.id));
  const missingDecisions = duplicateReviewRows.filter((r) => !DUPLICATE_DECISIONS[r.id]);
  if (missingDecisions.length > 0) {
    console.log("ATTENTION : décision de dédoublonnage non documentée pour :", missingDecisions.map((r) => `${r.id} (${r.name_raw})`));
    process.exit(1);
  }

  // ── §8 — Cibles live pour revalidation ────────────────────────────────
  function mainCategoryToEducationFamily(mainCategory: string | null): string | null {
    if (mainCategory === "superieur") return "higher_education";
    return mainCategory;
  }
  const allEst = await fetchAllPaginated<LiveEst>(supabase, "establishments", "id,name,region,city,main_category");
  const liveTargets: MatchTarget[] = allEst.map((e) => ({ id: e.id, name: e.name, region: e.region, city: e.city, category: mainCategoryToEducationFamily(e.main_category), identifiers: [] }));
  console.log(`Cibles live pour revalidation §8 : ${liveTargets.length}`);

  // ── §9 — Cibles staging NON-pilote pour revalidation ───────────────────
  const allStaging = await fetchAllPaginated<StagingRow>(supabase, "establishment_import_staging", "id,name_raw,region,city,education_family,raw_data");
  const nonPilotStaging = allStaging.filter((s) => s.raw_data?.batch !== BATCH_ID);
  const stagingTargets: MatchTarget[] = nonPilotStaging.map((s) => ({ id: s.id, name: s.name_raw, region: s.region, city: s.city, category: s.education_family, identifiers: [] }));
  console.log(`Cibles staging non-pilote pour revalidation §9 : ${stagingTargets.length}`);

  // ── §10 — Cibles MINESUP pour frontière inter-ministérielle (même construction que MINSANTE-C, non redécouverte) ──
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
  const estById = new Map(allEst.map((e) => [e.id, e]));
  const minesupTargets: MatchTarget[] = minesupEstablishmentIds
    .map((id) => estById.get(id))
    .filter((e): e is LiveEst => !!e)
    .map((e) => ({ id: e.id, name: e.name, region: e.region, city: e.city, category: e.main_category, identifiers: idsByEstablishment.get(e.id) ?? [] }));
  console.log(`Cibles MINESUP §10 : ${minesupTargets.length}`);

  // ── Traitement des 11 candidats ────────────────────────────────────────
  interface ResultRow {
    row: StagingRow;
    liveMatch: ReturnType<typeof matchCandidate>;
    stagingMatch: ReturnType<typeof matchCandidate>;
    crossMatch: ReturnType<typeof matchCandidate>;
    crossDecision: string;
    dup: DuplicateDecision;
    category: CategoryVerdict | null;
    new_classification: string;
    new_status: string;
    reason: string;
  }

  const results: ResultRow[] = [];
  for (const row of duplicateReviewRows) {
    const candidate: MatchCandidate = { name: row.name_raw, region: row.region, city: row.city, category: "health_training", identifiers: [] };
    const liveMatch = matchCandidate(candidate, liveTargets);
    const stagingMatchAll = matchCandidate(candidate, stagingTargets.filter((t) => t.id !== row.id));
    const crossMatch = matchCandidate({ ...candidate, category: null }, minesupTargets);
    const crossDecision =
      crossMatch.level === "EXACT_IDENTIFIER" || crossMatch.level === "EXACT_IDENTITY"
        ? "SAME_INSTITUTION_CROSS_MINISTRY"
        : crossMatch.level === "STRONG_MATCH"
          ? "AMBIGUOUS"
          : "DISTINCT";

    const dup = DUPLICATE_DECISIONS[row.id];

    let newClassification: string;
    let newStatus: string;
    let reason: string;
    let category: CategoryVerdict | null = null;

    if (crossDecision === "SAME_INSTITUTION_CROSS_MINISTRY" || crossDecision === "AMBIGUOUS") {
      newClassification = "CROSS_MINISTRY_REVIEW";
      newStatus = "normalized";
      reason = `§10 — signal frontière inter-ministérielle détecté à la revalidation MINSANTE-D (${crossMatch.level}) : ${crossMatch.reason} Jamais un auto-merge — revue humaine requise.`;
    } else if (liveMatch.level !== "NO_MATCH") {
      newClassification = "ALREADY_LIVE";
      newStatus = "duplicate_review";
      reason = `§8 — signal de correspondance LIVE détecté à la revalidation MINSANTE-D (${liveMatch.level}) : ${liveMatch.reason} Candidat exclu de l'approbation, aucune donnée live modifiée.`;
    } else if (stagingMatchAll.level === "STRONG_MATCH" || stagingMatchAll.level === "PROBABLE_MATCH" || stagingMatchAll.level === "EXACT_IDENTIFIER" || stagingMatchAll.level === "EXACT_IDENTITY") {
      newClassification = "ALREADY_STAGING";
      newStatus = "duplicate_review";
      reason = `§9 — signal de correspondance staging NON-pilote détecté à la revalidation MINSANTE-D (${stagingMatchAll.level}) : ${stagingMatchAll.reason} Candidat exclu de l'approbation.`;
    } else if (dup.verdict === "STILL_AMBIGUOUS") {
      newClassification = "DUPLICATE_REVIEW";
      newStatus = "duplicate_review";
      reason = "§16 — STILL_AMBIGUOUS : preuve insuffisante pour confirmer identité ou distinction. Reste DUPLICATE_REVIEW, exclu de l'approbation.";
    } else if (dup.verdict === "CONFIRMED_SAME_ESTABLISHMENT" && dup.canonicalStagingId !== row.id) {
      // Doublon non-canonique confirmé — §14 : jamais supprimé, classification
      // reste DUPLICATE_REVIEW (état existant compris par le Review Center,
      // garantit qu'il ne peut jamais être promu indépendamment), mais la
      // métadonnée documente désormais un dédoublonnage CONFIRMÉ (pas ambigu).
      newClassification = "DUPLICATE_REVIEW";
      newStatus = "duplicate_review";
      reason = `§14 — CONFIRMED_SAME_ESTABLISHMENT (doublon non-canonique) : ${dup.evidence} Canonique retenu : ${dup.canonicalStagingId}. Classification conservée DUPLICATE_REVIEW (jamais promouvable indépendamment) — jamais supprimé physiquement.`;
    } else {
      // CONFIRMED_DISTINCT, ou canonique d'un CONFIRMED_SAME_ESTABLISHMENT :
      // blocage de doublon levé — évaluation du blocage de catégorie (§17).
      category = categoryVerdict(row.name_raw);
      if (category.decision === "CATEGORY_REVIEW") {
        newClassification = "CATEGORY_REVIEW";
        newStatus = "normalized";
        reason = `§15/17 — blocage de doublon levé (${dup.verdict}) : ${dup.evidence} Catégorie NON résolue -> CATEGORY_REVIEW (jamais CLEAN_APPROVABLE sans preuve de catégorie).`;
      } else {
        newClassification = "CLEAN_APPROVABLE";
        newStatus = "ready";
        reason = `§15/17 — blocage de doublon levé (${dup.verdict}) : ${dup.evidence} Catégorie résolue (${category.decision}) : ${category.evidence} Aucun signal live/staging non-pilote, aucun signal frontière inter-ministérielle.`;
      }
    }

    results.push({ row, liveMatch, stagingMatch: stagingMatchAll, crossMatch, crossDecision, dup, category, new_classification: newClassification, new_status: newStatus, reason });
  }

  // ── Tallies ──────────────────────────────────────────────────────────
  const dupTally: Record<string, number> = {};
  for (const r of results) dupTally[r.dup.verdict] = (dupTally[r.dup.verdict] ?? 0) + 1;
  const classTally: Record<string, number> = {};
  for (const r of results) classTally[r.new_classification] = (classTally[r.new_classification] ?? 0) + 1;
  console.log("\n=== VERDICTS DE DÉDOUBLONNAGE (11) ===", dupTally);
  console.log("=== NOUVELLE CLASSIFICATION (11) ===", classTally);

  // ── §23 — reports/registry/minsante-d-duplicate-review.csv ────────────
  mkdirSync(join(rootDir, "reports", "registry"), { recursive: true });
  const dupHeader = ["staging_id", "name", "paired_with", "paired_type", "evidence", "decision", "canonical_staging_id", "new_classification", "reason", "official_source_used"];
  const dupCsv = [dupHeader.join(",")];
  for (const r of results) {
    dupCsv.push(
      [
        r.row.id,
        r.row.name_raw,
        r.dup.pairedWith.join(" | "),
        r.dup.pairedType,
        r.dup.evidence,
        r.dup.verdict,
        r.dup.canonicalStagingId ?? "",
        r.new_classification,
        r.reason,
        r.dup.officialSourceUsed,
      ]
        .map(csvEscape)
        .join(",")
    );
  }
  writeFileSync(join(rootDir, "reports", "registry", "minsante-d-duplicate-review.csv"), dupCsv.join("\n"), "utf-8");

  // ── §19,25 — UPDATE additif sur EXACTEMENT les 11 lignes scoped, idempotent ──
  console.log("\n=== §19,25 — MISE À JOUR STAGING (additive, 11 lignes scoped) ===");
  let updated = 0;
  for (const r of results) {
    const raw = r.row.raw_data ?? {};
    const nextRawData: Record<string, unknown> = {
      ...raw,
      // §19 — historique additif : `...raw` ci-dessus a déjà recopié
      // `minsante_b_snapshot` tel quel (JAMAIS réécrasé, aucune réaffectation
      // ici). Snapshot MINSANTE-C capturé ici pour la première fois,
      // idempotent (?? — un second run ne le réécrase pas).
      minsante_c_snapshot: raw.minsante_c_snapshot ?? {
        classification: raw.classification,
        category_decision: raw.category_decision,
        category_evidence: raw.category_evidence,
        classification_reason: raw.classification_reason,
        cross_ministry_review: raw.cross_ministry_review ?? null,
      },
      classification: r.new_classification,
      classification_reason: r.reason,
      ...(r.category
        ? { category_decision: r.category.decision, category_evidence: r.category.evidence, category_evidence_type: r.category.evidenceType }
        : {}),
      cross_ministry_review: { decision: r.crossDecision, matchLevel: r.crossMatch.level, matchedId: r.crossMatch.target?.id ?? null, matchedName: r.crossMatch.target?.name ?? null, reason: r.crossMatch.reason },
      minsante_d: {
        sprint: SPRINT,
        reviewed_by: OPERATOR,
        reviewed_at: new Date().toISOString(),
        duplicate_decision: r.dup.verdict,
        paired_with: r.dup.pairedWith,
        paired_type: r.dup.pairedType,
        canonical_staging_id: r.dup.canonicalStagingId,
        official_source_used: r.dup.officialSourceUsed,
        live_match_level_revalidated: r.liveMatch.level,
        staging_match_level_revalidated: r.stagingMatch.level,
        cross_ministry_level_revalidated: r.crossMatch.level,
      },
    };

    const patch: Record<string, unknown> = { raw_data: nextRawData, status: r.new_status };
    // §14 — le doublon non-canonique documente la relation via la colonne
    // dédiée de schéma (déjà utilisée pour ALREADY_STAGING par
    // minsante-b-pilot-collect.ts) — jamais une suppression, jamais un lien
    // silencieux non documenté en CSV.
    if (r.dup.verdict === "CONFIRMED_SAME_ESTABLISHMENT" && r.dup.canonicalStagingId && r.dup.canonicalStagingId !== r.row.id) {
      patch.duplicate_of_staging_id = r.dup.canonicalStagingId;
    }

    const { error: updErr } = await supabase.from("establishment_import_staging").update(patch).eq("id", r.row.id);
    if (updErr) throw new Error(`Échec mise à jour staging pour ${r.row.id} : ${updErr.message}`);
    updated++;
  }
  console.log(`Lignes mises à jour : ${updated}/11`);

  // ── Preuve d'idempotence : relecture réelle depuis la DB ───────────────
  const { data: reReadRows } = await supabase.from("establishment_import_staging").select("id,raw_data,status,duplicate_of_staging_id").in("id", [...scopedIds]);
  let idempotentOk = (reReadRows ?? []).length === 11;
  for (const r of results) {
    const found = (reReadRows ?? []).find((x: any) => x.id === r.row.id);
    if (!found || found.raw_data?.classification !== r.new_classification || found.status !== r.new_status) idempotentOk = false;
    if (r.dup.verdict === "CONFIRMED_SAME_ESTABLISHMENT" && r.dup.canonicalStagingId && r.dup.canonicalStagingId !== r.row.id) {
      if (found?.duplicate_of_staging_id !== r.dup.canonicalStagingId) idempotentOk = false;
    }
  }
  console.log(`Idempotence (relecture DB) : ${idempotentOk ? "PASS" : "FAIL"}`);

  // ── §21-22 — recalcul de la population complète des 22 lignes + nouveau snapshot ──
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
  console.log("\n=== POPULATION COMPLÈTE DU PILOTE (22) APRÈS MINSANTE-D ===", afterTally);

  const cleanApprovable = (allPilotAfter as any[]).filter((r) => r.raw_data?.classification === "CLEAN_APPROVABLE");
  const approvalCandidates = cleanApprovable
    .map((r) => ({
      staging_id: r.id,
      name: r.name_raw,
      region: r.region,
      programs: r.raw_data?.programs_normalized ?? [],
      education_family: r.education_family,
      main_category: r.raw_data?.category_decision === "SUPERIEUR_CONFIRMED" ? "superieur" : r.raw_data?.category_decision === "AUTRES_CONFIRMED" ? "autres" : null,
      source: r.source_url ?? null,
      decision: "CLEAN_APPROVABLE",
    }))
    .sort((a, b) => a.staging_id.localeCompare(b.staging_id));
  const newChecksum = sha256(JSON.stringify(approvalCandidates));
  const previous = JSON.parse(readFileSync(join(rootDir, "reports", "registry", "minsante-c-pilot-approval.json"), "utf-8"));

  writeFileSync(
    join(rootDir, "reports", "registry", "minsante-d-pilot-approval.json"),
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        operator: OPERATOR,
        sprint: SPRINT,
        batch: BATCH_ID,
        previous_snapshot: { sprint: "MINSANTE-C", candidate_count: previous.candidate_count, checksum: previous.checksum },
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
  console.log(`Ancien snapshot (MINSANTE-C, préservé, non écrasé) : ${previous.candidate_count} candidat(s) — checksum ${previous.checksum}`);

  // ── §27 — post-condition base de données ───────────────────────────────
  const { count: estAfter } = await supabase.from("establishments").select("*", { count: "exact", head: true });
  const { count: stagingAfter } = await supabase.from("establishment_import_staging").select("*", { count: "exact", head: true });
  const { count: registryAfter } = await supabase.from("establishment_registry_identifiers").select("*", { count: "exact", head: true });
  console.log(`\nPOST-CONDITION : establishments ${estBefore}->${estAfter} | staging ${stagingBefore}->${stagingAfter} | registry_identifiers ${registryBefore}->${registryAfter}`);

  // ── §24 — reports/registry/minsante-d-summary.json ─────────────────────
  const confirmedSame = results.filter((r) => r.dup.verdict === "CONFIRMED_SAME_ESTABLISHMENT").length;
  const confirmedDistinct = results.filter((r) => r.dup.verdict === "CONFIRMED_DISTINCT").length;
  const stillAmbiguous = results.filter((r) => r.dup.verdict === "STILL_AMBIGUOUS").length;
  const alreadyLive = results.filter((r) => r.new_classification === "ALREADY_LIVE").length;
  const alreadyStaging = results.filter((r) => r.new_classification === "ALREADY_STAGING").length;
  const crossMinistry = results.filter((r) => r.new_classification === "CROSS_MINISTRY_REVIEW").length;

  const summary = {
    generated_at: new Date().toISOString(),
    operator: OPERATOR,
    sprint: SPRINT,
    batch: BATCH_ID,
    starting_counts: { total: 22, CLEAN_APPROVABLE: 4, DUPLICATE_REVIEW: 11, CATEGORY_REVIEW: 7, CROSS_MINISTRY_REVIEW: 0 },
    duplicate_review_decisions: {
      candidates_processed: results.length,
      confirmed_same_establishment: confirmedSame,
      confirmed_distinct: confirmedDistinct,
      still_ambiguous: stillAmbiguous,
      already_live: alreadyLive,
      already_staging: alreadyStaging,
      cross_ministry_review: crossMinistry,
    },
    reclassification_after_duplicate_review: classTally,
    full_pilot_population_after: afterTally,
    total_reconciled: Object.values(afterTally).reduce((a, b) => a + b, 0) === 22,
    approval_snapshot: { previous_sprint: "MINSANTE-C", previous_count: previous.candidate_count, previous_checksum: previous.checksum, new_count: approvalCandidates.length, new_checksum: newChecksum },
    database_post_condition: {
      establishments_before: estBefore,
      establishments_after: estAfter,
      staging_before: stagingBefore,
      staging_after: stagingAfter,
      registry_identifiers_before: registryBefore,
      registry_identifiers_after: registryAfter,
      rows_inserted: 0,
      rows_metadata_updated: updated,
      idempotent: idempotentOk,
    },
    promotion: "NO",
  };
  writeFileSync(join(rootDir, "reports", "registry", "minsante-d-summary.json"), JSON.stringify(summary, null, 2), "utf-8");

  console.log("\n=== MINSANTE-D RECLASSIFY — TERMINÉ ===");
}

main().catch((error) => {
  console.error("Échec MINSANTE-D reclassify :", error);
  process.exit(1);
});
