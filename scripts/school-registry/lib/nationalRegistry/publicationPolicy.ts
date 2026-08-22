/**
 * SPRINT REGISTRY-NATIONAL-A §9/§10 — evaluateNationalPublicationReadiness().
 *
 * FONCTION PURE. Ne lit ni n'écrit AUCUNE base de données, aucun fichier.
 * Ne référence aucun ministère ni pipeline spécifique dans sa LOGIQUE (les
 * champs d'entrée peuvent en revanche transporter des informations propres
 * à un ministère, calculées en amont par l'appelant).
 *
 * Généralise scripts/school-registry/lib/transportTier3TrustModel.ts
 * (computePublicationReadiness) — qui reste inchangé et continue d'être
 * utilisé tel quel par le pipeline Transport Tier-3 existant — à un
 * classement national à 10 catégories (§8 A-J) au lieu de la sortie binaire
 * PUBLISHABLE_UNVERIFIED/REVIEW_REQUIRED/REJECTED du module Transport.
 *
 * GARANTIES STRUCTURELLES TESTÉES (§26) :
 *  A. published != officially verified (le retour ne dérive JAMAIS
 *     official_verification depuis presence/identity).
 *  B. un candidat Tier-3 seul (source_tiers ne contenant que "TIER_3_*")
 *     corroboré ne peut JAMAIS produire CREATE_OFFICIALLY_VERIFIED.
 *  C. un candidat Tier-3 à identité RESOLVED PEUT produire
 *     CREATE_PUBLISHABLE_UNVERIFIED si toutes les autres conditions de
 *     sécurité sont réunies.
 *  D/E. identité UNRESOLVED/CONFLICTING ne peut jamais s'auto-publier.
 *  F. PII bloque toute publication.
 *  G. doublon live exact -> jamais une nouvelle création.
 *  N. collision de slug non résolue bloque la création CONCERNÉE (le
 *     candidat individuel), jamais tout le manifest.
 */

import type { IdentityConfidence, MatchingDecision, OfficialVerification, PresenceConfidence, PublicationReadiness } from "./types";

export interface PublicationReadinessInput {
  hasNonEmptyNormalizedName: boolean;
  presenceConfidence: PresenceConfidence;
  identityConfidence: IdentityConfidence;
  /** Informatif seulement (§9) — NE DOIT JAMAIS être une condition bloquante pour CREATE_PUBLISHABLE_UNVERIFIED. */
  officialVerification: OfficialVerification;
  matchingDecision: MatchingDecision;

  /** true si le candidat correspond déjà, sans ambiguïté, à un établissement `establishments` existant. */
  alreadyLive: boolean;
  /** true si un doublon plausible (staging duplicate_review, ou matching STRONG/PROBABLE contre un AUTRE candidat/établissement) reste non résolu. */
  duplicateUnresolved: boolean;
  /** true si le matching produit AMBIGUOUS. */
  matchingAmbiguous: boolean;
  /** true si un chevauchement inter-ministériel reste non résolu (cross_ministry_decision AMBIGUOUS/CONFLICT). */
  crossMinistryUnresolved: boolean;
  /** true si le chevauchement inter-ministériel est un CONFLICT dur (informations incompatibles), distinct d'une simple ambiguïté. */
  crossMinistryConflict: boolean;

  /** région OU ville raisonnablement déterminable (au moins une des deux non vide, selon les règles existantes du staging). */
  hasReasonableLocation: boolean;

  /** true si au moins une URL/artefact de provenance traçable existe (§9 : "au moins une provenance traçable"). */
  hasTraceableProvenance: boolean;
  /**
   * true si la provenance est COMPLÈTE (URL par-institution + sha256 ou
   * équivalent, pas seulement une URL de listing générique partagée) — un
   * niveau plus strict que hasTraceableProvenance, repris tel quel du
   * module Transport Tier-3 (`provenance.provenance_complete`). Utilisé
   * uniquement pour distinguer CREATE_PUBLISHABLE_UNVERIFIED (provenance
   * complète) de SOURCE_REVIEW (traçable mais incomplète).
   */
  provenanceComplete: boolean;

  piiDetected: boolean;

  categoryCompatible: boolean;

  /** true si une preuve OFFICIELLE de vérification est RÉELLEMENT démontrée dans les artefacts (jamais déduite d'un simple corroboration Tier 3, même fort). §8-B. */
  officialProofDemonstrated: boolean;

  /** true si TOUTES les sources de ce candidat sont Tier 3 (aucune source Tier 1/2). §10 : Tier 3 seul ne peut jamais mener à CREATE_OFFICIALLY_VERIFIED. */
  tier3Only: boolean;
}

export interface PublicationReadinessResult {
  readiness: PublicationReadiness;
  reasons: string[];
}

/**
 * §9 — Politique minimale de publication nationale. Ordre des règles
 * volontairement du plus bloquant/prioritaire au moins bloquant — la
 * première condition qui matche détermine le résultat (conservateur par
 * défaut : en cas de doute, revue humaine plutôt que publication).
 */
export function evaluateNationalPublicationReadiness(input: PublicationReadinessInput): PublicationReadinessResult {
  const reasons: string[] = [];

  // A — déjà live : rien à créer, priorité absolue.
  if (input.alreadyLive) {
    return { readiness: "ALREADY_LIVE", reasons: ["candidat déjà présent dans establishments (matching EXACT_IDENTIFIER/EXACT_IDENTITY)."] };
  }

  // Garde-fou structurel §1 : jamais de nom vide.
  if (!input.hasNonEmptyNormalizedName) {
    return { readiness: "IDENTITY_REVIEW", reasons: ["normalized_name vide ou manquant — jamais publiable sans nom."] };
  }

  // PII bloque tout, avant même l'identité (§18 : jamais copié dans un manifest public potentiel).
  if (input.piiDetected) {
    return { readiness: "IDENTITY_REVIEW", reasons: ["PII détectée — voir pii-audit ; blocage prioritaire, jamais une simple note."] };
  }

  // Doublon live exact déjà connu -> lien, jamais une nouvelle création (§8-D, §26-G).
  if (input.matchingDecision === "EXACT_IDENTIFIER" || input.matchingDecision === "EXACT_IDENTITY") {
    return { readiness: "LINK_TO_EXISTING", reasons: [`matching ${input.matchingDecision} contre un établissement existant — lien recommandé, pas de nouvelle création.`] };
  }

  // Conflit inter-ministériel dur -> revue de conflit avant tout le reste.
  if (input.crossMinistryConflict) {
    return { readiness: "CONFLICT_REVIEW", reasons: ["chevauchement inter-ministériel en CONFLICT — informations incompatibles entre autorités."] };
  }

  // Identité en conflit ou ambiguïté de matching -> jamais publiable automatiquement (§26-D/E).
  if (input.identityConfidence === "CONFLICTING" || input.matchingAmbiguous) {
    return { readiness: "IDENTITY_REVIEW", reasons: ["identity_confidence=CONFLICTING ou matching AMBIGUOUS — identité non résolue avec suffisamment de certitude."] };
  }

  // Doublon non résolu (staging duplicate_review, STRONG/PROBABLE_MATCH) -> revue doublon.
  if (input.duplicateUnresolved || input.matchingDecision === "STRONG_MATCH" || input.matchingDecision === "PROBABLE_MATCH") {
    return { readiness: "DUPLICATE_REVIEW", reasons: ["signal de doublon sérieux (staging duplicate_review ou matching STRONG/PROBABLE_MATCH) non résolu."] };
  }

  // Identité non résolue -> revue identité.
  if (input.identityConfidence === "UNRESOLVED") {
    return { readiness: "IDENTITY_REVIEW", reasons: ["identity_confidence=UNRESOLVED — existence plausible mais identité précise non résolue."] };
  }

  // Chevauchement inter-ministériel ambigu (pas encore un CONFLICT dur) -> revue.
  if (input.crossMinistryUnresolved) {
    return { readiness: "CONFLICT_REVIEW", reasons: ["chevauchement inter-ministériel non résolu (AMBIGUOUS) — résolution d'entité insuffisante pour publication."] };
  }

  // Catégorie incompatible -> revue catégorie (§19), jamais forcée.
  if (!input.categoryCompatible) {
    return { readiness: "CATEGORY_REVIEW", reasons: ["main_category/sub_category/education_family incompatibles avec le modèle actuel — pas de migration taxonomy ce sprint."] };
  }

  // Localisation insuffisante -> source/identité review (préférence conservatrice : SOURCE_REVIEW).
  if (!input.hasReasonableLocation) {
    return { readiness: "SOURCE_REVIEW", reasons: ["ni région ni ville raisonnablement déterminable."] };
  }

  // Aucune provenance traçable du tout -> jamais publiable, jamais une "note".
  if (!input.hasTraceableProvenance) {
    return { readiness: "SOURCE_REVIEW", reasons: ["aucune provenance traçable (URL/artefact) — §26-M : un candidat sans source ne peut jamais gagner silencieusement une provenance."] };
  }

  // ── §8-B CREATE_OFFICIALLY_VERIFIED ── preuve officielle réellement démontrée, jamais déduite.
  if (input.officialProofDemonstrated && !input.tier3Only) {
    reasons.push("preuve officielle démontrée dans les artefacts (registre ministériel réel, identifiant officiel corroboré) — pas seulement un corroboration Tier 3.");
    return { readiness: "CREATE_OFFICIALLY_VERIFIED", reasons };
  }
  if (input.officialProofDemonstrated && input.tier3Only) {
    // Garde-fou §10 : même si un champ amont prétendait une preuve officielle, Tier-3-only ne peut JAMAIS produire cette catégorie.
    reasons.push("BLOQUÉ : officialProofDemonstrated=true mais tier3Only=true — §10 interdit absolument CREATE_OFFICIALLY_VERIFIED depuis des sources Tier 3 seules, quelle que soit la force du signal.");
    return { readiness: "CREATE_PUBLISHABLE_UNVERIFIED", reasons: [...reasons, "reclassé en CREATE_PUBLISHABLE_UNVERIFIED — l'existence/l'identité restent valables, seule la vérification officielle est refusée."] };
  }

  // ── §8-C CREATE_PUBLISHABLE_UNVERIFIED ── catégorie centrale de la nouvelle stratégie.
  if (input.identityConfidence === "RESOLVED" && input.provenanceComplete) {
    reasons.push("identité RESOLVED, provenance complète, aucun doublon/conflit/PII/catégorie bloquant — publiable comme UNVERIFIED (jamais comme vérifié).");
    return { readiness: "CREATE_PUBLISHABLE_UNVERIFIED", reasons };
  }

  // identité PROBABLE, ou provenance traçable mais incomplète -> conservateur par défaut.
  if (!input.provenanceComplete) {
    return { readiness: "SOURCE_REVIEW", reasons: ["provenance traçable mais incomplète (ex. URL de listing générique partagée, pas d'URL par-institution/sha256) — insuffisant pour publication même non vérifiée."] };
  }

  return { readiness: "IDENTITY_REVIEW", reasons: [`identity_confidence=${input.identityConfidence} insuffisant (ni RESOLVED, ni un autre statut bloquant déjà traité ci-dessus) — conservateur par défaut.`] };
}

/** §16 — décisions de résolution d'entité inter-ministérielle (jamais une fusion réelle). */
export type CrossMinistryResolution = "SAME_INSTITUTION" | "PROBABLE_SAME" | "AMBIGUOUS" | "DISTINCT" | "CONFLICT";

export function resolveCrossMinistry(input: {
  nameOverlap: "EXACT" | "STRONG" | "WEAK" | "NONE";
  geoAgreement: "MATCH" | "PARTIAL" | "CONFLICT" | "UNKNOWN";
  identifierEvidence: "SAME_IDENTIFIER" | "DIFFERENT_IDENTIFIER" | "NONE";
}): CrossMinistryResolution {
  if (input.identifierEvidence === "SAME_IDENTIFIER") return "SAME_INSTITUTION";
  if (input.identifierEvidence === "DIFFERENT_IDENTIFIER" && input.nameOverlap === "EXACT" && input.geoAgreement === "MATCH") return "CONFLICT";
  if (input.nameOverlap === "EXACT" && input.geoAgreement === "MATCH") return "PROBABLE_SAME";
  if (input.nameOverlap === "EXACT" && input.geoAgreement === "CONFLICT") return "CONFLICT";
  if (input.nameOverlap === "STRONG" && input.geoAgreement !== "CONFLICT") return "AMBIGUOUS";
  if (input.nameOverlap === "NONE") return "DISTINCT";
  return "AMBIGUOUS";
}
