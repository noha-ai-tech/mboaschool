import { createHash } from "node:crypto";

/**
 * SPRINT TRANSPORT-A.2-T3 — garde-fou dédié à l'import staging contrôlé des
 * 17 candidats Tier 3 Transport (`data/registry/normalized/transport-tier3-v1/
 * transport-tier3-candidates.json`, snapshot d'approbation
 * `reports/registry/transport-a2-t3-approval.json`).
 *
 * Modèle : `minsanteGPromotionGuard.ts` (MINSANTE-G) / `productionGuard.ts`
 * (P.6). Séparé de TOUS les autres garde-fous de promotion existants —
 * phrase de confirmation distincte, jamais interchangeable. IMPORTANT :
 * contrairement à MINSANTE-G/MINESUP-F/P.6 qui gardent une PROMOTION
 * (staging -> establishments), ce garde-fou protège un IMPORT STAGING
 * (candidats Tier 3 -> establishment_import_staging UNIQUEMENT). Aucun de
 * ces deux actes n'autorise l'autre — un futur script de PROMOTION Transport
 * devra écrire son propre garde-fou distinct, jamais réutiliser celui-ci.
 *
 * Règle absolue reconduite sans exception (brief §0/§7/§11/§17) : AUCUN
 * candidat Tier-3-only ne peut être CLEAN_APPROVABLE. Le garde-fou refuse
 * l'écriture si le calcul frais en trouve ne serait-ce qu'un seul.
 *
 * CE MODULE N'EST PAS INVOQUÉ AVEC DES FLAGS VALIDES DANS CE SPRINT —
 * TRANSPORT-A.2-T3 s'arrête au dry-run et aux tests de refus (brief §15-16).
 * Le chemin `commit=true` reste entièrement implémenté et testé pour qu'un
 * futur sprint d'exécution séparé, sous autorisation humaine nommée
 * explicite, puisse le réutiliser tel quel.
 */

export const EXPECTED_PROJECT_REF = "umcwwynrftidytxgqkwi";
export const TRANSPORT_A2_CONFIRM_PHRASE = "IMPORT_TRANSPORT_TIER3_TO_STAGING";
export const EXPECTED_OPERATOR = "jean-merlain";
export const EXPECTED_CANDIDATE_COUNT = 17;

export interface TransportA2ImportRequest {
  /** --commit présent sur argv (sinon dry-run implicite, jamais d'écriture). */
  commit: boolean;
  /** --confirm="IMPORT_TRANSPORT_TIER3_TO_STAGING" */
  confirmPhrase: string | undefined;
  /** Dérivé de NEXT_PUBLIC_SUPABASE_URL, jamais d'un flag (pour ne pas pouvoir être spoofé). */
  projectRef: string;
  /** --operator="jean-merlain" */
  operator: string | undefined;
  /** --approved-by="<personne distincte réelle>" — jamais codé en dur, jamais == operator. */
  approvedBy: string | undefined;
  /** Nombre de lignes qui seraient réellement insérées, calculé maintenant (frais). */
  actualWouldInsertCount: number;
  /** --expected-count=<n>, fixé au moment de l'approbation humaine. */
  expectedWouldInsertCount: number | undefined;
  /** SHA256 recalculé maintenant sur le set exact des 17 candidats + leur classification. */
  computedChecksum: string;
  /** --approval-checksum=..., produit par le snapshot d'approbation (§5 du brief). */
  approvalChecksum: string | undefined;
  /**
   * Vérifié en direct (REST GET, pas un ancien rapport) juste avant l'appel.
   * L'écriture réelle de source_ministry='MINTRANSPORT' exige que la
   * migration enum (brief §3-4) ait été appliquée ET vérifiée — jamais
   * supposée depuis une sortie SQL seule.
   */
  mintransportEnumPresent: boolean;
  /** Calculé maintenant sur le batch exact — DOIT être 0 (brief §0/§7/§11, règle absolue). */
  cleanApprovableCount: number;
  /** Calculé maintenant — DOIT être 0 (brief §14). */
  piiPersistedCount: number;
  /** Calculé maintenant — DOIT être 0 (brief §13, aucun identifiant officiel inventé). */
  officialIdentifiersInvented: number;
  /** Calculé maintenant — DOIT être 0 pour ce batch précis (brief §13, exception non applicable ce sprint). */
  registryIdentifiersToInsert: number;
}

export class TransportA2ImportRefused extends Error {}

/**
 * Lève TransportA2ImportRefused au premier garde-fou violé. Ne retourne
 * jamais "true/false" : un appelant qui ignorerait un booléen de retour
 * serait un bug silencieux, alors qu'une exception non interceptée arrête
 * le script (même convention que minsanteGPromotionGuard.ts / productionGuard.ts).
 */
export function assertTransportA2ImportAllowed(req: TransportA2ImportRequest): void {
  if (!req.commit) {
    throw new TransportA2ImportRefused("REFUSED — --commit absent. Dry-run par défaut, aucune écriture.");
  }
  if (req.confirmPhrase !== TRANSPORT_A2_CONFIRM_PHRASE) {
    throw new TransportA2ImportRefused(
      `REFUSED — phrase de confirmation manquante ou incorrecte. Exiger --confirm="${TRANSPORT_A2_CONFIRM_PHRASE}" (distincte de toute phrase de promotion existante).`
    );
  }
  if (req.projectRef !== EXPECTED_PROJECT_REF) {
    throw new TransportA2ImportRefused(`REFUSED — project ref inattendu (${req.projectRef} != ${EXPECTED_PROJECT_REF}).`);
  }
  if (!req.operator || req.operator !== EXPECTED_OPERATOR) {
    throw new TransportA2ImportRefused(`REFUSED — opérateur manquant ou inattendu. Exiger --operator="${EXPECTED_OPERATOR}".`);
  }
  if (!req.approvedBy || req.approvedBy.trim().length === 0) {
    throw new TransportA2ImportRefused("REFUSED — --approved-by manquant. Jamais codé en dur, doit être fourni explicitement au moment de l'exécution.");
  }
  if (req.approvedBy.trim().toLowerCase() === req.operator.trim().toLowerCase()) {
    throw new TransportA2ImportRefused("REFUSED — approved-by ne peut pas être la même personne que operator (auto-approbation interdite).");
  }
  if (req.expectedWouldInsertCount === undefined || req.actualWouldInsertCount !== req.expectedWouldInsertCount) {
    throw new TransportA2ImportRefused(
      `REFUSED — nombre de lignes à insérer inattendu (calculé maintenant=${req.actualWouldInsertCount}, --expected-count=${req.expectedWouldInsertCount ?? "(absent)"}). Le staging/live a probablement évolué depuis l'approbation — relancer une revalidation + dry-run, ne jamais forcer.`
    );
  }
  if (!req.approvalChecksum || req.approvalChecksum !== req.computedChecksum) {
    throw new TransportA2ImportRefused(
      `REFUSED — checksum d'approbation absent ou différent (--approval-checksum=${req.approvalChecksum ?? "(absent)"}, calculé maintenant=${req.computedChecksum}).`
    );
  }
  if (!req.mintransportEnumPresent) {
    throw new TransportA2ImportRefused(
      "REFUSED — enum registry_source_ministry ne contient pas encore 'MINTRANSPORT' (vérifié en direct). Migration §3-4 du brief non appliquée/non vérifiée. Aucun contournement automatique vers 'OTHER' — exécuter la migration manuellement (Supabase SQL Editor) puis revérifier avant de relancer."
    );
  }
  if (req.cleanApprovableCount > 0) {
    throw new TransportA2ImportRefused(
      `REFUSED — ${req.cleanApprovableCount} candidat(s) calculé(s) CLEAN_APPROVABLE. Règle absolue violée : TIER3_ONLY => CLEAN_APPROVABLE est FORBIDDEN (brief §0/§7/§11). STOP.`
    );
  }
  if (req.piiPersistedCount > 0) {
    throw new TransportA2ImportRefused(`REFUSED — ${req.piiPersistedCount} champ(s) PII détecté(s) dans le batch prêt à insérer. Jamais persisté (brief §14).`);
  }
  if (req.officialIdentifiersInvented > 0) {
    throw new TransportA2ImportRefused(`REFUSED — ${req.officialIdentifiersInvented} identifiant(s) officiel(s) sans preuve primaire indépendante. Jamais inventé (brief §13).`);
  }
  if (req.registryIdentifiersToInsert > 0) {
    throw new TransportA2ImportRefused(
      `REFUSED — ${req.registryIdentifiersToInsert} ligne(s) establishment_registry_identifiers prévue(s). Attendu 0 pour ce batch (brief §13) — aucune exception ne s'applique ce sprint.`
    );
  }
}

/**
 * SHA256 déterministe du set approuvé : trie par candidate_id pour être
 * stable même si l'ordre de lecture réseau/fichier varie entre deux
 * exécutions. Inclut la classification finale (pas seulement l'identité) —
 * un changement de classification depuis l'approbation doit invalider le
 * checksum tout autant qu'un changement de composition du set.
 */
export function computeTransportA2Checksum(
  rows: { candidate_id: string; normalized_name: string; entity_family: string; staging_classification: string }[]
): string {
  const material = rows
    .map((r) => `${r.candidate_id}|${r.normalized_name}|${r.entity_family}|${r.staging_classification}`)
    .sort()
    .join("\n");
  return createHash("sha256").update(material).digest("hex");
}
