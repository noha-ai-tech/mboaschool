import { createHash } from "node:crypto";

/**
 * SPRINT REGISTRY-NATIONAL-B §24 — garde-fou dédié à la FUTURE publication
 * nationale (établissements créés dans `establishments` depuis le lot
 * REGISTRY-NATIONAL-B). Modèle direct : `transportA2ImportGuard.ts`
 * (TRANSPORT-A.2-T3) / `minsanteGPromotionGuard.ts` (MINSANTE-G) /
 * `productionGuard.ts` (P.6). Phrase de confirmation DÉDIÉE, jamais
 * interchangeable avec un garde-fou de promotion/import staging existant.
 *
 * CE MODULE N'EST PAS INVOQUÉ AVEC DES FLAGS VALIDES DANS CE SPRINT —
 * REGISTRY-NATIONAL-B s'arrête au dry-run et aux tests de refus (brief
 * §24-26). Le chemin `commit=true` reste entièrement implémenté et testé
 * pour qu'un futur sprint d'exécution séparé (REGISTRY-NATIONAL-C), sous
 * revalidation fraîche ET autorisation humaine nommée explicite distincte,
 * puisse le réutiliser tel quel.
 *
 * Portée : ce garde-fou protège UNIQUEMENT la création d'établissements
 * `establishments` à partir du snapshot d'approbation national
 * (`reports/registry/registry-national-b-approval.json`). Il n'autorise
 * AUCUNE écriture `establishment_registry_identifiers` (brief §27 : 0
 * identifiant écrit ce sprint, et le lot d'exécution futur le plus sûr
 * reste "créations d'établissements uniquement").
 */

export const EXPECTED_PROJECT_REF = "umcwwynrftidytxgqkwi";
export const REGISTRY_NATIONAL_B_CONFIRM_PHRASE = "PUBLISH_NATIONAL_REGISTRY_TO_DIRECTORY";

export interface RegistryNationalPublicationRequest {
  /** --commit présent sur argv (sinon dry-run implicite, jamais d'écriture). */
  commit: boolean;
  /** --confirm="PUBLISH_NATIONAL_REGISTRY_TO_DIRECTORY" */
  confirmPhrase: string | undefined;
  /** Dérivé de NEXT_PUBLIC_SUPABASE_URL, jamais d'un flag (pour ne pas pouvoir être spoofé). */
  projectRef: string;
  /** --operator="<operator>" */
  operator: string | undefined;
  /** --approved-by="<personne distincte réelle>" — jamais codé en dur, jamais == operator. */
  approvedBy: string | undefined;
  /** --expected-count=<n>, fixé au moment de l'approbation humaine (candidate_count du snapshot). */
  expectedCandidateCount: number | undefined;
  /** Nombre de candidats CREATE_* réellement trouvés par une revalidation fraîche, calculé maintenant. */
  actualCandidateCount: number;
  /** --approval-checksum=..., fourni explicitement au moment de l'exécution. */
  approvalChecksum: string | undefined;
  /** SHA256 recalculé maintenant sur le contenu EXACT du snapshot relu depuis le disque. */
  recomputedChecksum: string;
  /** Checksum stocké tel quel dans le fichier `registry-national-b-approval.json` — sert à détecter une dérive entre le fichier et le calcul frais (§25-I), indépendamment du flag. */
  storedSnapshotChecksum: string;
  /** Calculé maintenant (revalidation fraîche complète, §11) — DOIT être 0 : aucun candidat du lot approuvé ne doit être déjà live. */
  freshAlreadyLiveCount: number;
  /** Calculé maintenant — DOIT être 0 : aucun candidat du lot ne doit porter un signal de doublon non résolu. */
  freshDuplicateSignalCount: number;
  /** Calculé maintenant — DOIT être 0 : aucun candidat du lot ne doit avoir perdu un champ requis (name/slug/main_category) depuis l'approbation. */
  freshMissingRequiredFieldCount: number;
  /** Calculé maintenant — DOIT être 0 (§9/§10 : un candidat Tier-3-only ne peut jamais atteindre OFFICIALLY_VERIFIED). */
  freshTier3OfficiallyVerifiedCount: number;
  /** Calculé maintenant — DOIT être 0 (§17 : PII=0 obligatoire). */
  freshPiiDetectedCount: number;
  /** Calculé maintenant — DOIT être 0 (§27 : aucune écriture d'identifiant de registre dans ce lot). */
  registryIdentifiersToInsert: number;
}

export class RegistryNationalPublicationRefused extends Error {}

/**
 * Lève RegistryNationalPublicationRefused au premier garde-fou violé.
 * Ne retourne jamais "true/false" — une exception non interceptée arrête
 * le script appelant (même convention que les garde-fous précédents).
 */
export function assertRegistryNationalPublicationAllowed(req: RegistryNationalPublicationRequest): void {
  // A — missing --commit
  if (!req.commit) {
    throw new RegistryNationalPublicationRefused("REFUSED (A) — --commit absent. Dry-run par défaut, aucune écriture.");
  }
  // B — wrong project
  if (req.projectRef !== EXPECTED_PROJECT_REF) {
    throw new RegistryNationalPublicationRefused(`REFUSED (B) — project ref inattendu (${req.projectRef} != ${EXPECTED_PROJECT_REF}).`);
  }
  // E — wrong confirmation phrase
  if (req.confirmPhrase !== REGISTRY_NATIONAL_B_CONFIRM_PHRASE) {
    throw new RegistryNationalPublicationRefused(
      `REFUSED (E) — phrase de confirmation manquante ou incorrecte. Exiger --confirm="${REGISTRY_NATIONAL_B_CONFIRM_PHRASE}" (distincte de toute phrase de promotion/import staging existante).`
    );
  }
  // F — missing operator
  if (!req.operator || req.operator.trim().length === 0) {
    throw new RegistryNationalPublicationRefused("REFUSED (F) — --operator manquant.");
  }
  // G — missing approved-by
  if (!req.approvedBy || req.approvedBy.trim().length === 0) {
    throw new RegistryNationalPublicationRefused("REFUSED (G) — --approved-by manquant. Jamais codé en dur, doit être fourni explicitement au moment de l'exécution.");
  }
  // H — operator == approved-by (self-approval)
  if (req.approvedBy.trim().toLowerCase() === req.operator.trim().toLowerCase()) {
    throw new RegistryNationalPublicationRefused("REFUSED (H) — approved-by ne peut pas être la même personne que operator (auto-approbation interdite).");
  }
  // C — wrong candidate count
  if (req.expectedCandidateCount === undefined || req.actualCandidateCount !== req.expectedCandidateCount) {
    throw new RegistryNationalPublicationRefused(
      `REFUSED (C) — nombre de candidats inattendu (calculé maintenant=${req.actualCandidateCount}, --expected-count=${req.expectedCandidateCount ?? "(absent)"}). Le lot a probablement dérivé depuis l'approbation — relancer une revalidation fraîche + dry-run, ne jamais forcer.`
    );
  }
  // D — wrong checksum
  if (!req.approvalChecksum || req.approvalChecksum !== req.recomputedChecksum) {
    throw new RegistryNationalPublicationRefused(
      `REFUSED (D) — checksum d'approbation absent ou différent (--approval-checksum=${req.approvalChecksum ?? "(absent)"}, recalculé maintenant=${req.recomputedChecksum}).`
    );
  }
  // I — snapshot drift (le fichier approval lui-même ne correspond plus à son propre contenu relu/recalculé)
  if (req.storedSnapshotChecksum !== req.recomputedChecksum) {
    throw new RegistryNationalPublicationRefused(
      `REFUSED (I) — dérive de snapshot détectée : le checksum stocké dans registry-national-b-approval.json (${req.storedSnapshotChecksum}) ne correspond plus au contenu relu/recalculé (${req.recomputedChecksum}). Le fichier a probablement été modifié après approbation.`
    );
  }
  // J — one candidate becomes already-live
  if (req.freshAlreadyLiveCount > 0) {
    throw new RegistryNationalPublicationRefused(
      `REFUSED (J) — ${req.freshAlreadyLiveCount} candidat(s) du lot approuvé sont maintenant déjà live (matching frais). Un autre pipeline a probablement publié cette fiche entre-temps — jamais créer un doublon.`
    );
  }
  // K — one candidate gains duplicate signal
  if (req.freshDuplicateSignalCount > 0) {
    throw new RegistryNationalPublicationRefused(
      `REFUSED (K) — ${req.freshDuplicateSignalCount} candidat(s) du lot ont gagné un signal de doublon depuis l'approbation (matching frais STRONG/PROBABLE contre live ou staging). Revue doublon requise avant toute nouvelle tentative.`
    );
  }
  // L — one candidate loses required field
  if (req.freshMissingRequiredFieldCount > 0) {
    throw new RegistryNationalPublicationRefused(
      `REFUSED (L) — ${req.freshMissingRequiredFieldCount} candidat(s) du lot n'ont plus name/slug/main_category valides (audit schéma live frais). Jamais inventer une valeur manquante.`
    );
  }
  // Invariants absolus supplémentaires — toujours vérifiés en dernier, jamais contournables.
  if (req.freshTier3OfficiallyVerifiedCount > 0) {
    throw new RegistryNationalPublicationRefused(
      `REFUSED — ${req.freshTier3OfficiallyVerifiedCount} candidat(s) Tier-3-only calculé(s) OFFICIALLY_VERIFIED. Invariant absolu violé (§9/§10) — STOP, jamais un contournement automatique.`
    );
  }
  if (req.freshPiiDetectedCount > 0) {
    throw new RegistryNationalPublicationRefused(`REFUSED — ${req.freshPiiDetectedCount} candidat(s) avec PII détectée dans le lot prêt à publier. Jamais publié (§17).`);
  }
  if (req.registryIdentifiersToInsert > 0) {
    throw new RegistryNationalPublicationRefused(
      `REFUSED — ${req.registryIdentifiersToInsert} ligne(s) establishment_registry_identifiers prévue(s) par ce lot. Interdit ce sprint/cette portée (§27) — aucun identifiant de registre ne doit être écrit par ce garde-fou.`
    );
  }
}

/**
 * SHA256 déterministe du snapshot d'approbation national (§22). Trie par
 * national_candidate_id pour être stable quel que soit l'ordre de lecture
 * réseau/fichier. Même convention que
 * `transportA2ImportGuard.computeInsertablePopulationChecksum()` —
 * réutilisation délibérée de la méthode canonique existante du dépôt (§22
 * du brief : "réutiliser une méthode canonique existante si elle existe
 * déjà"), adaptée aux champs du candidat national plutôt qu'au candidat
 * Transport Tier 3.
 */
export interface RegistryNationalApprovalChecksumRow {
  national_candidate_id: string;
  name: string;
  slug: string;
  main_category: string;
  sub_category: string | null;
  education_family: string | null;
  city: string | null;
  region: string | null;
  source_ministries: string;
  source_url: string;
  presence_confidence: string;
  identity_confidence: string;
  official_verification: string;
  publication_readiness: string;
}

export function computeRegistryNationalApprovalChecksum(rows: RegistryNationalApprovalChecksumRow[]): string {
  const material = rows
    .slice()
    .sort((a, b) => a.national_candidate_id.localeCompare(b.national_candidate_id))
    .map((r) =>
      [
        r.national_candidate_id,
        r.name,
        r.slug,
        r.main_category,
        r.sub_category ?? "",
        r.education_family ?? "",
        r.city ?? "",
        r.region ?? "",
        r.source_ministries,
        r.source_url,
        r.presence_confidence,
        r.identity_confidence,
        r.official_verification,
        r.publication_readiness,
      ].join("|")
    )
    .join("\n");
  return createHash("sha256").update(material).digest("hex");
}
