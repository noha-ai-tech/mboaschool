import type { Registry } from "../registryAuthority";

/**
 * SPRINT REGISTRY-MULTI-A — contrat partagé du moteur de matching. Extrait
 * de la logique jusqu'ici recopiée indépendamment dans chaque script de
 * promotion (promote-minesec-final.ts, promote-batch-q-approved.ts,
 * promote-master-v1-approved.ts, promote-major-cities-controlled.ts,
 * promote-major-cities-r3-2.ts — 29 fichiers référencent official_id/
 * official_identifier au total, cf. audit §4 de ce sprint).
 */

export interface RegistryIdentifier {
  registry: Registry;
  identifier: string;
  /**
   * SPRINT MINESUP-B.1 — type d'acte au sein du registre (ex.
   * 'CREATION_ORDER' vs 'OPENING_AUTHORIZATION'). Optionnel : des
   * institutions MINESUP réelles utilisent la MÊME chaîne d'identifiant
   * pour deux actes juridiques distincts (ex. Institut Supérieur de Génie
   * Civil (ISGeC)) — sans ce champ, deux lignes légitimes et différentes
   * seraient traitées comme UNE SEULE collision. Absent = comportement
   * historique (comparaison sur (registry, identifier) seul), cohérent
   * avec la colonne nullable `identifier_type` de la migration 0021.
   */
  identifierType?: string | null;
}

/** Un candidat à faire correspondre — nouvelle ligne staging, ou ligne à re-vérifier. */
export interface MatchCandidate {
  name: string;
  region: string | null;
  city: string | null;
  /** Catégorie normalisée (ex. main_category/education_family) — §13 : la catégorie doit participer au matching, jamais ignorée. */
  category: string | null;
  identifiers: RegistryIdentifier[];
}

/** Une cible existante contre laquelle comparer (établissement live, ou autre candidat du même lot). */
export interface MatchTarget {
  id: string;
  name: string;
  region: string | null;
  city: string | null;
  category: string | null;
  identifiers: RegistryIdentifier[];
}

/**
 * §12 — catégories adaptées aux conventions déjà utilisées dans ce projet
 * (ALREADY_LIVE/CLEAN_APPROVABLE/DUPLICATE_REVIEW/... des sprints R.3/R.3.1)
 * plutôt qu'inventées de zéro. EXACT_IDENTIFIER et EXACT_IDENTITY sont les
 * deux seuls niveaux qui peuvent motiver un statut ALREADY_LIVE côté
 * appelant — ni l'un ni l'autre n'autorise une fusion automatique
 * silencieuse (§12 : FUZZY MATCH != IDENTITY PROOF s'applique même à un nom
 * exact seul, sans identifiant — voir requiresHumanReview ci-dessous).
 */
export type MatchLevel = "EXACT_IDENTIFIER" | "EXACT_IDENTITY" | "STRONG_MATCH" | "PROBABLE_MATCH" | "AMBIGUOUS" | "NO_MATCH";

export interface MatchResult {
  level: MatchLevel;
  /** null si NO_MATCH. */
  target: MatchTarget | null;
  /** Autres cibles ayant produit un signal proche — non nul seulement pour AMBIGUOUS. */
  alternativeTargets: MatchTarget[];
  reason: string;
  /**
   * §12 permanent : "Aucun fuzzy match ne doit fusionner automatiquement
   * deux établissements." Cette valeur est TOUJOURS false pour
   * STRONG_MATCH/PROBABLE_MATCH/AMBIGUOUS — un appelant qui l'ignorerait
   * violerait la règle. EXACT_IDENTIFIER et EXACT_IDENTITY restent des
   * signaux de type "déjà existant" (-> ALREADY_LIVE côté appelant), pas
   * une autorisation de fusion de deux enregistrements distincts.
   */
  safeForAutoLink: boolean;
}
