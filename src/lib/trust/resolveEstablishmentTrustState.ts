/**
 * SPRINT REGISTRY-NATIONAL-A.1 — PUBLIC TRUST SEMANTICS HARDENING.
 *
 * Résolveur central UNIQUE de la confiance publique d'un établissement.
 * FONCTION PURE. Ne lit ni n'écrit AUCUNE base de données, aucun fichier,
 * aucun réseau — mêmes garanties que
 * scripts/school-registry/lib/nationalRegistry/publicationPolicy.ts.
 *
 * Objectif du sprint (voir docs/03_DATA_REGISTRY/PUBLIC_TRUST_SEMANTICS.md) :
 * empêcher toute ambiguïté entre quatre couches STRICTEMENT séparées :
 *
 *   1. DIRECTORY PRESENCE   — juste "référencé dans l'annuaire".
 *   2. CLAIM STATUS         — relation utilisateur/établissement, JAMAIS une
 *                             preuve ministérielle.
 *   3. PLATFORM VERIFICATION— vérification interne Écoles237 (dérivée du
 *                             booléen historique `establishments.is_verified`),
 *                             JAMAIS présentée comme "agréé par le ministère".
 *   4. OFFICIAL VERIFICATION— preuve documentaire/administrative provenant
 *                             d'une autorité compétente UNIQUEMENT. Ne peut
 *                             JAMAIS être déduite de la vérification
 *                             plateforme ni du statut de revendication.
 *
 * INVARIANT CENTRAL (repris de REGISTRY-NATIONAL-A) :
 *
 *   OFFICIALLY_VERIFIED != is_verified
 *
 * sauf transition explicitement contrôlée et documentée — cette fonction ne
 * fait JAMAIS cette transition implicitement : `official_verification` ne
 * peut atteindre "OFFICIALLY_VERIFIED" que si l'appelant fournit une preuve
 * explicite au niveau IDENTIFIANT DE REGISTRE (`registryIdentifierVerification
 * Statuses` contenant "CORROBORATED"/"CONFIRMED"), jamais depuis
 * `is_verified`, `is_claimed`, `owner_id` ou la simple présence d'un
 * `official_id`/`source_ministry` (qui ne représente qu'une source CITÉE,
 * jamais authentifiée — voir commentaire de la migration 0018 et le type
 * `OFFICIAL_SOURCE_FOUND` hérité de
 * scripts/school-registry/lib/nationalRegistry/types.ts).
 *
 * STRATÉGIE DE MODÈLE DE DONNÉES (§5 du brief) — OPTION A retenue :
 * AUCUNE migration de schéma. `establishments.is_verified` est conservé tel
 * quel côté DB ; ce module le RÉINTERPRÈTE côté code/UI comme
 * `platform_verification` et calcule `official_verification` séparément à
 * partir des champs registre déjà existants (migrations 0018/0021, réellement
 * exécutées en production — vérifié en direct via l'API REST, jamais
 * supposé depuis l'en-tête des fichiers de migration).
 */

// ============================================================
// Types
// ============================================================

/** Un établissement pour lequel cette fonction est appelée existe par
 * construction dans `establishments` — cette valeur est donc une constante
 * conceptuelle, jamais calculée depuis une condition. */
export type DirectoryStatus = "LISTED";

export type ClaimStatus = "UNCLAIMED" | "CLAIM_PENDING" | "CLAIMED";

export type PlatformVerification = "PLATFORM_VERIFIED" | "NOT_PLATFORM_VERIFIED";

/**
 * OFFICIAL_SOURCE_FOUND = une source à consonance officielle est CITÉE
 * (`official_id`/`source_ministry` renseignés) — jamais qu'elle a été
 * authentifiée. Distinct de OFFICIALLY_VERIFIED, qui exige une preuve au
 * niveau `establishment_registry_identifiers.verification_status`.
 */
export type OfficialVerification = "OFFICIALLY_VERIFIED" | "OFFICIAL_SOURCE_FOUND" | "UNVERIFIED" | "CONFLICTING";

export type PublicBadgeId = "OFFICIALLY_VERIFIED" | "OFFICIAL_SOURCE_FOUND" | "PLATFORM_VERIFIED";

export interface PublicBadge {
  id: PublicBadgeId;
  /** Libellé FR non ambigu — voir §7 du brief : jamais le simple texte
   * "Vérifié" sans que l'utilisateur puisse comprendre QUI a vérifié et sur
   * quelle base. */
  label: string;
}

export interface EstablishmentTrustState {
  directory_status: DirectoryStatus;
  claim_status: ClaimStatus;
  platform_verification: PlatformVerification;
  official_verification: OfficialVerification;
  /** Liste ordonnée (le plus fort d'abord) de TOUS les badges publics
   * légitimes pour cet établissement — l'appelant choisit le sous-ensemble
   * pertinent pour son emplacement (ex. une carte compacte peut n'afficher
   * que le premier via `getPrimaryPublicBadge`). */
  public_badges: PublicBadge[];
}

export interface EstablishmentTrustInput {
  /** `establishments.is_verified` — booléen générique existant. Signifie
   * UNIQUEMENT une vérification interne Écoles237, jamais une preuve
   * ministérielle. */
  isVerified?: boolean | null;
  /** `establishments.owner_id` */
  ownerId?: string | null;
  /** `establishments.is_claimed` */
  isClaimed?: boolean | null;
  /** `establishments.verification_status` (enum `establishment_verification_status`,
   * migration 0008) — décrit le pipeline de REVENDICATION/onboarding
   * (referenced -> claim_requested -> under_review -> verified -> active ->
   * suspended), jamais une preuve ministérielle. */
  verificationStatus?: string | null;
  /** `establishments.official_id` — identifiant CITÉ, jamais authentifié à
   * ce niveau seul (migration 0018). */
  officialId?: string | null;
  /** `establishments.source_ministry` — ministère source CITÉ. */
  sourceMinistry?: string | null;
  /**
   * `establishment_registry_identifiers.verification_status` pour TOUS les
   * identifiants liés à cet établissement — UNIQUEMENT disponible côté
   * admin/service-role (RLS `platform_admin` only, migration 0021).
   * `undefined`/non fourni = contexte public sans accès à cette table ->
   * `official_verification` ne peut alors jamais dépasser
   * OFFICIAL_SOURCE_FOUND, JAMAIS une valeur inventée par optimisme.
   */
  registryIdentifierVerificationStatuses?: string[] | null;
  /** true si une preuve officielle CONFLICTING est explicitement connue
   * (ex. cross_ministry_decision=CONFLICT) — jamais déduit implicitement. */
  hasConflictingOfficialEvidence?: boolean;
}

// ============================================================
// Labels — §7 du brief, politique de badges publics non ambigus.
// ============================================================

export const TRUST_BADGE_LABELS: Record<PublicBadgeId, string> = {
  OFFICIALLY_VERIFIED: "Vérification officielle",
  OFFICIAL_SOURCE_FOUND: "Source officielle disponible",
  PLATFORM_VERIFIED: "Vérifié par Écoles237",
};

const CLAIM_PENDING_STATUSES = new Set(["claim_requested", "under_review"]);
const OFFICIAL_EVIDENCE_STATUSES = new Set(["CORROBORATED", "CONFIRMED"]);

// ============================================================
// Résolveurs par dimension — jamais fusionnés, jamais dérivés l'un de
// l'autre implicitement (même principe que NationalCandidate, §7).
// ============================================================

function resolveClaimStatus(input: EstablishmentTrustInput): ClaimStatus {
  if (input.ownerId || input.isClaimed) return "CLAIMED";
  if (input.verificationStatus && CLAIM_PENDING_STATUSES.has(input.verificationStatus)) return "CLAIM_PENDING";
  return "UNCLAIMED";
}

function resolvePlatformVerification(input: EstablishmentTrustInput): PlatformVerification {
  return input.isVerified === true ? "PLATFORM_VERIFIED" : "NOT_PLATFORM_VERIFIED";
}

function resolveOfficialVerification(input: EstablishmentTrustInput): OfficialVerification {
  // Conflit explicite -> priorité absolue, jamais masqué par une autre règle.
  if (input.hasConflictingOfficialEvidence) return "CONFLICTING";

  const statuses = input.registryIdentifierVerificationStatuses ?? [];
  if (statuses.some((s) => OFFICIAL_EVIDENCE_STATUSES.has(s))) return "OFFICIALLY_VERIFIED";

  if (input.officialId || input.sourceMinistry) return "OFFICIAL_SOURCE_FOUND";

  return "UNVERIFIED";
}

function buildPublicBadges(officialVerification: OfficialVerification, platformVerification: PlatformVerification): PublicBadge[] {
  const badges: PublicBadge[] = [];

  if (officialVerification === "OFFICIALLY_VERIFIED") {
    badges.push({ id: "OFFICIALLY_VERIFIED", label: TRUST_BADGE_LABELS.OFFICIALLY_VERIFIED });
  } else if (officialVerification === "OFFICIAL_SOURCE_FOUND") {
    badges.push({ id: "OFFICIAL_SOURCE_FOUND", label: TRUST_BADGE_LABELS.OFFICIAL_SOURCE_FOUND });
  }
  // CONFLICTING et UNVERIFIED -> aucun badge officiel, jamais un badge
  // "neutre" trompeur.

  if (platformVerification === "PLATFORM_VERIFIED") {
    badges.push({ id: "PLATFORM_VERIFIED", label: TRUST_BADGE_LABELS.PLATFORM_VERIFIED });
  }

  return badges;
}

// ============================================================
// Fonction centrale
// ============================================================

/**
 * Résout l'état de confiance publique d'un établissement à partir de
 * signaux bruts. Les composants UI et routes API NE DOIVENT JAMAIS
 * réinventer ces règles localement (§6 du brief) — toujours passer par
 * cette fonction (ou `getPrimaryPublicBadge` pour l'usage "un seul badge
 * compact").
 */
export function resolveEstablishmentTrustState(input: EstablishmentTrustInput): EstablishmentTrustState {
  const claim_status = resolveClaimStatus(input);
  const platform_verification = resolvePlatformVerification(input);
  const official_verification = resolveOfficialVerification(input);

  return {
    directory_status: "LISTED",
    claim_status,
    platform_verification,
    official_verification,
    public_badges: buildPublicBadges(official_verification, platform_verification),
  };
}

/**
 * Badge unique "le plus fort" pour les emplacements compacts (cartes,
 * carrousels) qui n'affichaient historiquement qu'un seul chip "Vérifié".
 * Préfère OFFICIALLY_VERIFIED > PLATFORM_VERIFIED. N'inclut JAMAIS
 * OFFICIAL_SOURCE_FOUND seul dans ce rôle compact — ce badge intermédiaire
 * ("source citée, jamais authentifiée") a besoin de plus de contexte que
 * ne le permet un simple chip, il reste réservé aux emplacements qui
 * peuvent l'expliquer (ex. fiche établissement complète, Review Center admin).
 */
export function getPrimaryPublicBadge(state: EstablishmentTrustState): PublicBadge | null {
  return (
    state.public_badges.find((b) => b.id === "OFFICIALLY_VERIFIED") ??
    state.public_badges.find((b) => b.id === "PLATFORM_VERIFIED") ??
    null
  );
}

// ============================================================
// Adaptateur — construit l'input depuis une ligne `establishments` brute.
// Convenance uniquement, jamais de logique de confiance ici.
// ============================================================

export interface EstablishmentRowForTrust {
  is_verified?: boolean | null;
  owner_id?: string | null;
  is_claimed?: boolean | null;
  verification_status?: string | null;
  official_id?: string | null;
  source_ministry?: string | null;
}

export function trustInputFromEstablishmentRow(
  row: EstablishmentRowForTrust,
  registryEvidence?: {
    registryIdentifierVerificationStatuses?: string[] | null;
    hasConflictingOfficialEvidence?: boolean;
  }
): EstablishmentTrustInput {
  return {
    isVerified: row.is_verified,
    ownerId: row.owner_id,
    isClaimed: row.is_claimed,
    verificationStatus: row.verification_status,
    officialId: row.official_id,
    sourceMinistry: row.source_ministry,
    registryIdentifierVerificationStatuses: registryEvidence?.registryIdentifierVerificationStatuses,
    hasConflictingOfficialEvidence: registryEvidence?.hasConflictingOfficialEvidence,
  };
}
