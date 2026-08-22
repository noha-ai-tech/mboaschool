/**
 * SPRINT REGISTRY-NATIONAL-A — modèle de données du candidat national
 * consolidé (brief §6/§7/§8). Ce module ne contient AUCUNE logique
 * d'écriture — types + petites fonctions pures uniquement.
 *
 * Invariant central du sprint (préambule du brief) :
 *
 *   PUBLISHED != OFFICIALLY_VERIFIED
 *
 * Les trois dimensions de confiance (§7) sont VOLONTAIREMENT gardées comme
 * trois champs séparés sur NationalCandidate — jamais fusionnées, jamais
 * dérivées l'une de l'autre implicitement. Toute dérivation doit passer par
 * une fonction explicite et testée (voir publicationPolicy.ts).
 */

export const MINISTRIES_IN_SCOPE = ["MINESUP", "MINEFOP", "MINSANTE", "MINTRANSPORT"] as const;
export type MinistryInScope = (typeof MINISTRIES_IN_SCOPE)[number];

// ============================================================
// §7 — trust model (three separate dimensions)
// ============================================================

export type PresenceConfidence = "SINGLE_SOURCE" | "MULTI_SOURCE_WEAK" | "CORROBORATED" | "STRONG_DOCUMENTARY" | "CONFLICTING";

export type IdentityConfidence = "RESOLVED" | "PROBABLE" | "UNRESOLVED" | "CONFLICTING";

/**
 * OFFICIAL_SOURCE_FOUND est une extension documentaire (héritée du module
 * transportTier3TrustModel.ts) : une source à consonance officielle a été
 * *citée*, jamais qu'elle a été authentifiée. Ne doit JAMAIS être confondue
 * avec OFFICIALLY_VERIFIED par le code appelant.
 */
export type OfficialVerification = "OFFICIALLY_VERIFIED" | "OFFICIAL_SOURCE_FOUND" | "UNVERIFIED" | "CONFLICTING";

// ============================================================
// §8 — 10 publication readiness categories (A-J)
// ============================================================

export type PublicationReadiness =
  | "ALREADY_LIVE" // A
  | "CREATE_OFFICIALLY_VERIFIED" // B
  | "CREATE_PUBLISHABLE_UNVERIFIED" // C
  | "LINK_TO_EXISTING" // D
  | "ADD_REGISTRY_IDENTIFIER" // E (recommandation seulement, jamais appliquée ce sprint)
  | "DUPLICATE_REVIEW" // F
  | "IDENTITY_REVIEW" // G
  | "SOURCE_REVIEW" // H
  | "CONFLICT_REVIEW" // I
  | "CATEGORY_REVIEW" // additionnel §19, rattaché à la même famille de blocage que I/G
  | "DEFERRED"; // J

export type MatchingDecision = "EXACT_IDENTIFIER" | "EXACT_IDENTITY" | "STRONG_MATCH" | "PROBABLE_MATCH" | "AMBIGUOUS" | "NO_MATCH" | "NOT_EVALUATED";

export type CrossMinistryDecision = "SAME_INSTITUTION" | "PROBABLE_SAME" | "AMBIGUOUS" | "DISTINCT" | "CONFLICT" | "NEW";

export interface SourceMinistryEntry {
  ministry: MinistryInScope;
  /** Rôle de ce ministère pour ce candidat — ne dit rien sur la fusion réelle avec un autre ministère (§16 : jamais fusionné réellement). */
  role: "PRIMARY" | "ADDITIONAL_AUTHORITY" | "CROSS_MINISTRY_EVIDENCE_ONLY";
  staging_ids: string[];
  registry_identifiers: string[]; // ids de establishment_registry_identifiers, si déjà live
}

export interface NationalCandidate {
  national_candidate_id: string;
  name: string;
  normalized_name: string;
  acronym: string | null;
  city: string | null;
  region: string | null;
  address: string | null;
  main_category: string | null;
  sub_category: string | null;
  education_family: string | null;

  source_ministries: MinistryInScope[];
  source_urls: string[];
  source_domains: string[];
  source_tiers: string[]; // ex. "TIER_1_OFFICIAL_REGISTRY", "TIER_3_DISCOVERY"
  source_snapshots: string[]; // références de rapports/artefacts versionnés d'où provient ce candidat
  source_sha256: (string | null)[];

  presence_confidence: PresenceConfidence;
  identity_confidence: IdentityConfidence;
  official_verification: OfficialVerification;
  publication_readiness: PublicationReadiness;

  existing_establishment_id: string | null;
  staging_ids: string[];
  registry_identifiers: { authority: string; registry: string; identifier: string; identifier_type: string | null }[];

  matching_decision: MatchingDecision;
  matching_score: number | null; // heuristique informative uniquement (0-1), jamais utilisée pour auto-fusion
  matching_evidence: string[];

  cross_ministry_evidence: string[];

  pii_detected: boolean;
  pii_fields: string[];

  category_compatible: boolean;
  category_issue: string | null;

  recommended_action: string;
  blocking_reasons: string[];

  /** Drapeaux additionnels utilisés par la politique de publication (§9/§10), jamais exposés comme un état indépendant. */
  duplicate_unresolved: boolean;
  cross_ministry_unresolved: boolean;
  provenance_complete: boolean;
}
