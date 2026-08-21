/**
 * SPRINT TRANSPORT-A.2-T3-WRITE — modèle de confiance à trois dimensions
 * (préambule du brief) : PRÉSENCE / IDENTITÉ / VÉRIFICATION OFFICIELLE.
 *
 * Ces trois notions sont strictement distinctes et NE DOIVENT JAMAIS être
 * confondues dans le code :
 *
 *  - presence_confidence : "avons-nous assez d'éléments pour penser que cet
 *    établissement existe ?" — dérivé uniquement du nombre/indépendance des
 *    sources Tier 3.
 *  - identity_confidence : "savons-nous à quelle institution canonique ceci
 *    correspond, et si elle existe déjà dans l'annuaire ?" — dérivé du
 *    matching frais (live+staging) et de la clarté de l'entité elle-même.
 *  - official_verification : "une autorité officielle compétente a-t-elle
 *    confirmé ceci ?" — GARANTIE STRUCTURELLE : cette dimension ne peut
 *    JAMAIS valoir OFFICIALLY_VERIFIED depuis ce pipeline Tier-3-only, quel
 *    que soit le nombre ou la force des sources Tier 3. Ce n'est pas une
 *    règle appliquée "au cas par cas" — computeOfficialVerification() n'a
 *    tout simplement AUCUN chemin de code qui retourne cette valeur.
 *
 * publication_readiness (brief §6) est une fonction PUREMENT INFORMATIVE,
 * générique et testable, qui ne promeut rien et ne modifie ni establishments
 * ni establishment_import_staging. Elle sert uniquement à documenter, pour
 * une future revue humaine, si un candidat SEMBLE suffisamment établi pour
 * qu'une décision humaine ultérieure puisse un jour le publier comme
 * NON VÉRIFIÉ — jamais "vérifié", jamais "agréé", jamais "CLEAN_APPROVABLE".
 */

export type PresenceConfidence = "SINGLE_SOURCE" | "MULTI_SOURCE_WEAK" | "CORROBORATED" | "CONFLICTING";
export type IdentityConfidence = "UNRESOLVED" | "PROBABLE" | "RESOLVED" | "CONFLICTING";
export type OfficialVerification = "UNVERIFIED" | "OFFICIAL_SOURCE_FOUND" | "OFFICIALLY_VERIFIED";
export type PublicationReadiness = "PUBLISHABLE_UNVERIFIED" | "REVIEW_REQUIRED" | "REJECTED";

/** Sous-ensemble de OfficialVerification que ce module Tier-3-only peut réellement produire. */
export type Tier3OfficialVerification = Exclude<OfficialVerification, "OFFICIALLY_VERIFIED">;

// ============================================================
// presence_confidence
// ============================================================

/**
 * Dérive presence_confidence UNIQUEMENT du signal de corroboration Tier-3
 * (tier3_confidence + compte de sources indépendantes). Ne regarde jamais
 * le matching ni la vérification officielle (dimensions séparées).
 */
export function computePresenceConfidence(input: {
  tier3Confidence: string;
  sourceCount: number;
  independentSourceCount: number;
}): PresenceConfidence {
  switch (input.tier3Confidence) {
    case "T3_CONFLICTING":
      return "CONFLICTING";
    case "T3_CORROBORATED":
    case "ABOVE_TIER3_CORROBORATED":
      return "CORROBORATED";
    case "T3_MULTI_SOURCE_WEAK":
      return "MULTI_SOURCE_WEAK";
    case "T3_SINGLE_SOURCE":
      return "SINGLE_SOURCE";
    default:
      // T3_IDENTITY_REVIEW and any future/unknown state carry no direct
      // presence signal of their own — fall back to the raw source counts,
      // never invent corroboration that wasn't independently established.
      if (input.independentSourceCount >= 2) return "CORROBORATED";
      if (input.sourceCount >= 2) return "MULTI_SOURCE_WEAK";
      return "SINGLE_SOURCE";
  }
}

// ============================================================
// identity_confidence
// ============================================================

/**
 * Dérive identity_confidence du matching FRAIS (live+staging, jamais
 * live-only) et des signaux d'ambiguïté propres à l'entité. Ordre de
 * priorité volontaire (du plus bloquant au moins bloquant) :
 *  1. l'entité elle-même est en revue d'identité (tier3_confidence
 *     T3_IDENTITY_REVIEW) -> UNRESOLVED — on ne sait même pas ce que
 *     c'est, indépendamment de tout matching.
 *  2. chevauchement inter-ministériel non résolu -> CONFLICTING — ne pas
 *     savoir sous quelle autorité/identité ceci existe déjà est un
 *     conflit d'identité, pas une simple ambiguïté de matching.
 *  3. matching AMBIGUOUS -> CONFLICTING — signaux contradictoires sur le
 *     fait qu'il s'agisse ou non d'un établissement déjà connu.
 *  4. matching STRONG_MATCH/PROBABLE_MATCH -> PROBABLE — une identité
 *     canonique plausible existe déjà, mais non confirmée.
 *  5. matching NO_MATCH, rien d'ambigu par ailleurs -> RESOLVED — nous
 *     savons qu'il s'agit d'une entité distincte, non confondue avec une
 *     autre (mais ceci ne dit RIEN sur la confiance qu'elle existe :
 *     dimension séparée, voir presence_confidence).
 */
export function computeIdentityConfidence(input: {
  tier3Confidence: string;
  matchingDecision: string;
  crossMinistryDecision: string;
}): IdentityConfidence {
  if (input.tier3Confidence === "T3_IDENTITY_REVIEW") return "UNRESOLVED";
  if (input.crossMinistryDecision === "AMBIGUOUS" || input.crossMinistryDecision === "SAME_INSTITUTION_OTHER_AUTHORITY") return "CONFLICTING";
  if (input.matchingDecision === "AMBIGUOUS") return "CONFLICTING";
  if (input.matchingDecision === "STRONG_MATCH" || input.matchingDecision === "PROBABLE_MATCH") return "PROBABLE";
  if (input.matchingDecision === "EXACT_IDENTIFIER" || input.matchingDecision === "EXACT_IDENTITY") return "PROBABLE"; // already-live candidates are filtered out upstream; if ever reached, never silently "RESOLVED=new"
  if (input.matchingDecision === "NO_MATCH") return "RESOLVED";
  return "UNRESOLVED"; // unknown/unexpected matching level — fail closed, never assume resolution
}

// ============================================================
// official_verification
// ============================================================

/**
 * GARANTIE STRUCTURELLE (brief §5/§9, invariant testé en §14-N) : cette
 * fonction n'a AUCUN chemin de retour vers "OFFICIALLY_VERIFIED". Le type
 * de retour Tier3OfficialVerification l'exclut même au niveau TypeScript.
 * Aucun nombre de sources Tier 3, aucune force de matching, aucun site
 * institutionnel privé, aucun résumé IA ne peut faire remonter cette
 * fonction au-delà de OFFICIAL_SOURCE_FOUND (une source à consonance
 * officielle a été *citée*, jamais qu'elle a été *vérifiée* comme
 * authentique et autoritaire).
 */
export function computeOfficialVerification(input: { officialCorroborationStatus: string }): Tier3OfficialVerification {
  if (input.officialCorroborationStatus === "OFFICIAL_SOURCE_FOUND") return "OFFICIAL_SOURCE_FOUND";
  return "UNVERIFIED";
}

// ============================================================
// publication_readiness — PUREMENT INFORMATIF (brief §6)
// ============================================================

export interface PublicationReadinessInput {
  presenceConfidence: PresenceConfidence;
  identityConfidence: IdentityConfidence;
  /** Informatif seulement — NE DOIT JAMAIS être une condition bloquante pour PUBLISHABLE_UNVERIFIED. */
  officialVerification: OfficialVerification;
  /** true si un doublon plausible (staging_classification DUPLICATE_REVIEW ou matching STRONG/PROBABLE) reste non résolu. */
  duplicateUnresolved: boolean;
  /** true si un chevauchement inter-ministériel reste non résolu (cross_ministry_decision AMBIGUOUS/SAME_INSTITUTION_OTHER_AUTHORITY). */
  crossMinistryUnresolved: boolean;
  /** true si la provenance (URL + sha256 + classe de source) est complète et re-vérifiée ce sprint. */
  provenanceComplete: boolean;
  /** true si un champ PII a été détecté dans la charge utile préparée. */
  piiDetected: boolean;
}

/**
 * Fonction générique et testable (brief §6). Ne référence ni ministère ni
 * pipeline spécifique — réutilisable telle quelle par un futur import
 * Tier-3 d'un autre secteur.
 *
 * Critères conservateurs, dans l'ordre :
 *  - PII détecté -> REJECTED (jamais publié tel quel).
 *  - CONFLICTING (présence OU identité) -> REVIEW_REQUIRED (jamais publishable).
 *  - identité UNRESOLVED -> REVIEW_REQUIRED.
 *  - doublon non résolu -> REVIEW_REQUIRED.
 *  - chevauchement inter-ministériel non résolu -> REVIEW_REQUIRED.
 *  - provenance incomplète -> REVIEW_REQUIRED.
 *  - identité RESOLVED + présence >= SINGLE_SOURCE (i.e. pas CONFLICTING,
 *    déjà exclu ci-dessus) + tout le reste ci-dessus résolu -> PUBLISHABLE_UNVERIFIED.
 *    (official_verification n'intervient JAMAIS ici — son absence reste
 *    seulement visible dans le payload, jamais bloquante ni promotrice.)
 *  - sinon (ex. identité seulement PROBABLE) -> REVIEW_REQUIRED, conservateur par défaut.
 */
export function computePublicationReadiness(input: PublicationReadinessInput): PublicationReadiness {
  if (input.piiDetected) return "REJECTED";
  if (input.presenceConfidence === "CONFLICTING") return "REVIEW_REQUIRED";
  if (input.identityConfidence === "CONFLICTING") return "REVIEW_REQUIRED";
  if (input.identityConfidence === "UNRESOLVED") return "REVIEW_REQUIRED";
  if (input.duplicateUnresolved) return "REVIEW_REQUIRED";
  if (input.crossMinistryUnresolved) return "REVIEW_REQUIRED";
  if (!input.provenanceComplete) return "REVIEW_REQUIRED";
  if (input.identityConfidence === "RESOLVED") return "PUBLISHABLE_UNVERIFIED";
  return "REVIEW_REQUIRED";
}
