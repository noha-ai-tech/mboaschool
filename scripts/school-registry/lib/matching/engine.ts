import type { MatchCandidate, MatchLevel, MatchResult, MatchTarget, RegistryIdentifier } from "./types";

/**
 * SPRINT REGISTRY-MULTI-A — moteur de matching partagé, multi-registre.
 *
 * Règles permanentes (§12-13 de la spec, non négociables) :
 *  - FUZZY MATCH != IDENTITY PROOF : aucun niveau autre qu'EXACT_IDENTIFIER/
 *    EXACT_IDENTITY n'autorise une fusion automatique.
 *  - Même `identifier` texte mais `registry` différent = coïncidence,
 *    jamais un signal d'identité (espaces de nommage distincts).
 *  - Même `(registry, identifier)` = signal extrêmement fort — mais reste
 *    un signal "déjà existant", pas une fusion silencieuse de deux fiches.
 *  - Le nom normalisé ne retire JAMAIS les mots signalant une catégorie
 *    (Lycée/Collège/Technique/Bilingue/CES/...) — "Lycée Technique d'Akwa"
 *    et "Lycée d'Akwa" ne doivent jamais se fondre en une seule clé
 *    (régression trouvée et corrigée pendant SPRINT R.3, voir historique
 *    git de scripts/school-registry/promote-major-cities-controlled.ts).
 */

const GENERIC_ARTICLES = new Set(["de", "du", "des", "la", "le", "les", "d", "l", "et", "a", "au", "aux"]);

/**
 * SPRINT MINESUP-B §18 — un même établissement peut être écrit avec un
 * chiffre arabe (source MINESUP : "Université de Yaoundé 1") ou romain
 * (fiche live : "Université de Yaoundé I"). Ne convertit QUE des tokens
 * qui sont EXACTEMENT un numéral romain isolé (I-X) — jamais une lettre
 * romaine à l'intérieur d'un autre mot — pour éviter toute transformation
 * arbitraire d'un mot ordinaire (§18 : "ne pas transformer arbitrairement
 * toute lettre romaine dans tous les noms"). `official_name` n'est jamais
 * modifié : cette normalisation ne sert qu'à la clé de matching.
 */
const ROMAN_NUMERAL_TO_ARABIC: Record<string, string> = {
  i: "1", ii: "2", iii: "3", iv: "4", v: "5", vi: "6", vii: "7", viii: "8", ix: "9", x: "10",
};

function normalizeInstitutionalNumeral(word: string): string {
  return ROMAN_NUMERAL_TO_ARABIC[word] ?? word;
}

/** Clé d'identité EXACTE — normalisation minimale, préserve les mots de catégorie. */
export function exactIdentityKey(name: string): string {
  return (name || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter((w) => !GENERIC_ARTICLES.has(w))
    .map(normalizeInstitutionalNumeral)
    .sort()
    .join(" ");
}

const FUZZY_STOPWORDS = new Set([
  ...GENERIC_ARTICLES,
  "college", "collège", "lycee", "lycée", "lyce", "ces", "cetic", "cetif", "ceti", "cegt", "cefti",
  "school", "secondary", "high", "bilingual", "bilingue", "prive", "privee", "privé", "private",
  "laic", "laique", "laïc", "institut", "complexe", "scolaire", "groupe", "ecole", "école",
  "polyvalent", "technique", "public", "comprehensive",
  // SPRINT MINESUP-E — vocabulaire générique de l'enseignement SUPÉRIEUR,
  // jamais couvert avant (la liste ci-dessus vient du travail MINESEC
  // primaire/secondaire). Bug réel trouvé sur données nationales : "Jagora
  // University" (fuzzyWords = ["jagora","university"]) produisait un
  // chevauchement à 50% contre SEPT institutions Nord-Ouest différentes
  // rien qu'en partageant le mot "university" — un mot structurel de type
  // d'établissement, jamais un signal d'identité, exactement comme
  // "lycée"/"institut" ci-dessus. Mêmes principe et prudence : on ne
  // retire QUE les mots de TYPE d'établissement (university/institute/
  // higher/polytechnic/supérieur), jamais un mot de spécialité
  // (science/technology/management/business) qui reste un signal réel de
  // différenciation entre deux établissements.
  "university", "universite", "université", "institute", "higher", "polytechnic", "polytechnique",
  "superieur", "supérieur", "superieure", "supérieure",
]);

/** Mots significatifs pour le chevauchement flou (REVIEW uniquement, jamais une preuve d'identité). */
export function fuzzyWords(name: string): string[] {
  // SPRINT MINESUP-E — un token purement numérique (ex. "1"/"2", issu de
  // la normalisation romaine/arabe I->1/II->2) reste significatif même
  // sous le seuil de longueur >3 : sans cette exception, "Université de
  // Yaoundé I" et "Université de Yaoundé II" perdaient TOUTES DEUX leur
  // seul mot distinctif ("1"/"2", 1 caractère) et ne partageaient plus que
  // "yaounde", produisant un chevauchement à 100% entre deux universités
  // pourtant différentes (jamais un auto-merge — safeForAutoLink reste
  // false — mais une fausse ambiguïté évitable). Un mot alphabétique court
  // (ex. "de", déjà filtré par GENERIC_ARTICLES) n'est pas concerné.
  return exactIdentityKey(name).split(" ").filter((w) => (w.length > 3 || /^\d+$/.test(w)) && !FUZZY_STOPWORDS.has(w));
}

function normalizeGeo(v: string | null | undefined): string {
  return (v || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]/g, "");
}

function wordOverlapRatio(a: string[], b: string[]): number {
  if (a.length === 0) return 0;
  const bSet = new Set(b);
  return a.filter((w) => bSet.has(w)).length / a.length;
}

/**
 * Deux identifiants "désignent le même acte" si registry + identifier
 * correspondent ET (au moins un des deux n'a pas de identifier_type, OU
 * les deux identifier_type correspondent). Absence de identifier_type
 * d'un côté = comportement historique permissif (cohérent avec la colonne
 * nullable de la migration 0021) — mais quand LES DEUX côtés précisent un
 * identifier_type différent, ce n'est PAS la même ligne (ex. un
 * "CREATION_ORDER" et une "OPENING_AUTHORIZATION" qui partagent la même
 * chaîne de texte brute, cas réel trouvé SPRINT MINESUP-B.1).
 */
function sameIdentifierClaim(a: RegistryIdentifier, b: RegistryIdentifier): boolean {
  if (a.registry !== b.registry) return false;
  if (a.identifier.trim().toUpperCase() !== b.identifier.trim().toUpperCase()) return false;
  if (a.identifierType && b.identifierType && a.identifierType !== b.identifierType) return false;
  return true;
}

function findIdentifierMatch(candidate: RegistryIdentifier[], target: MatchTarget): RegistryIdentifier | null {
  for (const ci of candidate) {
    const hit = target.identifiers.find((ti) => sameIdentifierClaim(ti, ci));
    if (hit) return hit;
  }
  return null;
}

/** true si le candidat mentionne un identifiant texte présent chez la cible, mais dans un AUTRE registre — coïncidence à ignorer explicitement, jamais un signal. */
function hasCrossRegistryCoincidence(candidate: RegistryIdentifier[], target: MatchTarget): boolean {
  for (const ci of candidate) {
    for (const ti of target.identifiers) {
      if (ti.registry !== ci.registry && ti.identifier.trim().toUpperCase() === ci.identifier.trim().toUpperCase()) return true;
    }
  }
  return false;
}

export interface MatchOptions {
  /** Seuil de chevauchement flou pour STRONG_MATCH (défaut 0.66 — même seuil que R.3.1). */
  strongOverlapThreshold?: number;
}

/**
 * Compare UN candidat à une liste de cibles (établissements live, ou autres
 * candidats du même lot pour la détection de doublons internes) et retourne
 * le MEILLEUR résultat trouvé, jamais une fusion.
 */
export function matchCandidate(candidate: MatchCandidate, targets: MatchTarget[], options: MatchOptions = {}): MatchResult {
  const threshold = options.strongOverlapThreshold ?? 0.66;

  // Niveau 1 — EXACT_IDENTIFIER : (registry, identifier) strictement identique.
  if (candidate.identifiers.length > 0) {
    const exactIdMatches = targets.map((t) => ({ target: t, hit: findIdentifierMatch(candidate.identifiers, t) })).filter((x) => x.hit);
    if (exactIdMatches.length === 1) {
      const { target, hit } = exactIdMatches[0];
      return {
        level: "EXACT_IDENTIFIER",
        target,
        alternativeTargets: [],
        reason: `identifiant (${hit!.registry}, ${hit!.identifier}) trouvé identique chez la cible — signal le plus fort possible, contrainte d'unicité (registry, identifier) à respecter.`,
        safeForAutoLink: false,
      };
    }
    if (exactIdMatches.length > 1) {
      // Collision réelle : le même (registry, identifier) est revendiqué par plusieurs cibles — anomalie de données, jamais résolue silencieusement.
      return {
        level: "AMBIGUOUS",
        target: null,
        alternativeTargets: exactIdMatches.map((x) => x.target),
        reason: `COLLISION — ${exactIdMatches.length} cibles distinctes revendiquent le même (registry, identifier). Violation de la contrainte d'unicité attendue — nécessite une revue humaine immédiate, jamais un choix automatique.`,
        safeForAutoLink: false,
      };
    }
  }

  const candidateKey = exactIdentityKey(candidate.name);
  const candidateGeo = normalizeGeo(candidate.region) || normalizeGeo(candidate.city);

  // Niveau 2 — EXACT_IDENTITY : nom exact (mots de catégorie préservés) + géographie cohérente quand les deux sont connues.
  const exactNameTargets = targets.filter((t) => exactIdentityKey(t.name) === candidateKey);
  if (exactNameTargets.length > 0) {
    const geoConsistent = exactNameTargets.filter((t) => {
      const tGeo = normalizeGeo(t.region) || normalizeGeo(t.city);
      return !candidateGeo || !tGeo || candidateGeo === tGeo;
    });
    const geoConfirmed = exactNameTargets.filter((t) => {
      const tGeo = normalizeGeo(t.region) || normalizeGeo(t.city);
      return candidateGeo && tGeo && candidateGeo === tGeo;
    });
    if (geoConfirmed.length === 1) {
      return {
        level: "EXACT_IDENTITY",
        target: geoConfirmed[0],
        alternativeTargets: [],
        reason: "nom exact (mots de catégorie préservés) + géographie confirmée cohérente.",
        safeForAutoLink: false,
      };
    }
    if (geoConfirmed.length > 1) {
      return {
        level: "AMBIGUOUS",
        target: null,
        alternativeTargets: geoConfirmed,
        reason: `${geoConfirmed.length} cibles ont un nom exact ET une géographie cohérente — impossible de désigner une cible unique sans information supplémentaire.`,
        safeForAutoLink: false,
      };
    }
    if (geoConsistent.length === 1 && exactNameTargets.length === 1) {
      // Nom exact, mais géographie non vérifiable d'un côté ou de l'autre (ex. schéma d'identifiant sans géographie décodable) — pas un conflit, juste non confirmé.
      return {
        level: "STRONG_MATCH",
        target: geoConsistent[0],
        alternativeTargets: [],
        reason: "nom exact (mots de catégorie préservés), géographie non vérifiable d'un côté (jamais un conflit confirmé) — identité fortement probable, pas certaine.",
        safeForAutoLink: false,
      };
    }
    // Nom exact mais géographie CONTRADICTOIRE, ou plusieurs cibles sans confirmation univoque.
    return {
      level: "AMBIGUOUS",
      target: null,
      alternativeTargets: exactNameTargets,
      reason: "nom exact trouvé mais géographie contradictoire ou correspondance multiple non résolue — revue humaine requise.",
      safeForAutoLink: false,
    };
  }

  // Niveau 3/4 — chevauchement flou (STRONG_MATCH / PROBABLE_MATCH), jamais une preuve d'identité.
  const candWords = fuzzyWords(candidate.name);
  if (candWords.length === 0) {
    return { level: "NO_MATCH", target: null, alternativeTargets: [], reason: "nom candidat sans mot significatif exploitable.", safeForAutoLink: false };
  }

  const scored = targets
    .map((t) => {
      const tGeo = normalizeGeo(t.region) || normalizeGeo(t.city);
      const geoMatch = candidateGeo && tGeo ? candidateGeo === tGeo : null; // null = non vérifiable
      const geoConflict = candidateGeo && tGeo && candidateGeo !== tGeo;
      const categoryMatch = candidate.category && t.category ? candidate.category === t.category : null;
      const ratio = wordOverlapRatio(candWords, fuzzyWords(t.name));
      return { target: t, ratio, geoMatch, geoConflict, categoryMatch };
    })
    // SPRINT MINESUP-C — categoryMatch === false (les deux catégories sont
    // CONNUES et DIFFÉRENTES) exclut la cible du chevauchement flou. Bug réel
    // trouvé sur données réelles : un candidat higher_education ("Bamenda
    // University Institute of Science and Technology") chevauchait à 17%
    // plusieurs "Lycée Bilingue de BAMENDA" (secondaire) par le seul nom de
    // ville partagé "Bamenda" — un nom de ville n'est jamais un signal
    // d'identité entre deux catégories d'établissement explicitement
    // différentes. categoryMatch===null (au moins une catégorie inconnue)
    // reste permissif, comme pour geoConflict — jamais un blocage sur une
    // absence d'information.
    .filter((s) => s.ratio > 0 && s.categoryMatch !== false)
    .sort((a, b) => b.ratio - a.ratio);

  if (scored.length === 0) {
    return { level: "NO_MATCH", target: null, alternativeTargets: [], reason: "aucun mot significatif commun avec une cible.", safeForAutoLink: false };
  }

  const best = scored[0];
  const runnerUp = scored[1];
  if (runnerUp && runnerUp.ratio === best.ratio && runnerUp.target.id !== best.target.id) {
    return {
      level: "AMBIGUOUS",
      target: null,
      alternativeTargets: scored.filter((s) => s.ratio === best.ratio).map((s) => s.target),
      reason: `plusieurs cibles à égalité de chevauchement (${Math.round(best.ratio * 100)}%) — pas de gagnant clair.`,
      safeForAutoLink: false,
    };
  }

  if (best.ratio >= threshold && best.geoConflict !== true) {
    return {
      level: "STRONG_MATCH",
      target: best.target,
      alternativeTargets: [],
      reason: `chevauchement de mots fort (${Math.round(best.ratio * 100)}%)${best.geoMatch ? " + géographie cohérente" : best.geoMatch === null ? ", géographie non vérifiable (pas de conflit connu)" : ""}.`,
      safeForAutoLink: false,
    };
  }

  return {
    level: "PROBABLE_MATCH",
    target: best.target,
    alternativeTargets: [],
    reason: best.geoConflict
      ? `chevauchement de mots (${Math.round(best.ratio * 100)}%) mais géographie CONTRADICTOIRE — signal affaibli, revue requise.`
      : `chevauchement de mots partiel (${Math.round(best.ratio * 100)}%), insuffisant pour STRONG_MATCH.`,
    safeForAutoLink: false,
  };
}

/**
 * §13 — vrai uniquement si deux cibles revendiquent le même
 * (registry, identifier_type, identifier), jamais résolu automatiquement.
 * Une ligne sans identifier_type reste comparée par (registry, identifier)
 * seul — même logique permissive que `sameIdentifierClaim` (cohérent avec
 * la colonne nullable de la migration 0021).
 */
export function findIdentifierCollisions(all: MatchTarget[]): { registry: string; identifierType: string | null; identifier: string; targets: MatchTarget[] }[] {
  const byKey = new Map<string, { registry: string; identifierType: string | null; identifier: string; targets: MatchTarget[] }>();
  for (const t of all) {
    for (const id of t.identifiers) {
      const key = `${id.registry}|${id.identifierType ?? ""}|${id.identifier.trim().toUpperCase()}`;
      if (!byKey.has(key)) byKey.set(key, { registry: id.registry, identifierType: id.identifierType ?? null, identifier: id.identifier, targets: [] });
      byKey.get(key)!.targets.push(t);
    }
  }
  const collisions: { registry: string; identifierType: string | null; identifier: string; targets: MatchTarget[] }[] = [];
  for (const entry of byKey.values()) {
    const uniqueTargetIds = new Set(entry.targets.map((t) => t.id));
    if (uniqueTargetIds.size > 1) collisions.push(entry);
  }
  return collisions;
}

export { hasCrossRegistryCoincidence };
