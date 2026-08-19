/**
 * SPRINT MINESUP-D — garde-fou dédié à la promotion contrôlée du pilote
 * MINESUP (`minesup-pilot-v1`). Volontairement SÉPARÉ de
 * `lib/productionGuard.ts` (dont la phrase de confirmation
 * "PROMOTE_REGISTRY_TO_PRODUCTION" et les constantes sont déjà utilisées
 * par d'autres scripts de promotion existants, ex. R.3.2) — §13 de la
 * spec exige une phrase DISTINCTE pour ce pilote
 * ("PROMOTE_MINESUP_PILOT_TO_PRODUCTION"), donc un module dédié plutôt que
 * de généraliser le garde-fou partagé sans que ce soit demandé.
 */

export const EXPECTED_PROJECT_REF = "umcwwynrftidytxgqkwi";
export const MINESUP_PROMOTION_CONFIRM_PHRASE = "PROMOTE_MINESUP_PILOT_TO_PRODUCTION";
export const EXPECTED_BATCH = "minesup-pilot-v1";
export const EXPECTED_SOURCE_MINISTRY = "MINESUP";
export const EXPECTED_OPERATOR = "jean-merlain";

export interface MinesupPromotionRequest {
  commit: boolean;
  confirmPhrase: string | undefined;
  projectRef: string;
  operator: string | undefined;
  approvedBy: string | undefined;
  actualEligibleCount: number;
  expectedEligibleCount: number | undefined;
  computedChecksum: string;
  approvalChecksum: string | undefined;
  identifierConflicts: number;
}

export class MinesupPromotionRefused extends Error {}

/**
 * §13 — opérateur et approbateur DOIVENT être des personnes distinctes
 * (jamais un auto-approbation), et l'approbateur n'est JAMAIS codé en dur
 * dans ce fichier — il doit venir d'un flag CLI fourni au moment de
 * l'exécution réelle, jamais d'une valeur par défaut.
 */
export function assertMinesupPromotionAllowed(req: MinesupPromotionRequest): void {
  if (!req.commit) {
    throw new MinesupPromotionRefused("REFUSED — --commit absent. Dry-run par défaut, aucune écriture.");
  }
  if (req.confirmPhrase !== MINESUP_PROMOTION_CONFIRM_PHRASE) {
    throw new MinesupPromotionRefused(`REFUSED — phrase de confirmation manquante ou incorrecte. Exiger --confirm="${MINESUP_PROMOTION_CONFIRM_PHRASE}".`);
  }
  if (req.projectRef !== EXPECTED_PROJECT_REF) {
    throw new MinesupPromotionRefused(`REFUSED — project ref inattendu (${req.projectRef} != ${EXPECTED_PROJECT_REF}).`);
  }
  if (!req.operator || req.operator !== EXPECTED_OPERATOR) {
    throw new MinesupPromotionRefused(`REFUSED — opérateur manquant ou inattendu. Exiger --operator="${EXPECTED_OPERATOR}".`);
  }
  if (!req.approvedBy || req.approvedBy.trim().length === 0) {
    throw new MinesupPromotionRefused("REFUSED — --approved-by manquant. Jamais codé en dur, doit être fourni explicitement au moment de l'exécution.");
  }
  if (req.approvedBy.trim().toLowerCase() === req.operator.trim().toLowerCase()) {
    throw new MinesupPromotionRefused("REFUSED — approved-by ne peut pas être la même personne que operator (auto-approbation interdite).");
  }
  if (req.expectedEligibleCount === undefined || req.actualEligibleCount !== req.expectedEligibleCount) {
    throw new MinesupPromotionRefused(
      `REFUSED — nombre de candidats éligibles inattendu (calculé maintenant=${req.actualEligibleCount}, --expected-count=${req.expectedEligibleCount ?? "(absent)"}). Le staging a probablement évolué depuis la revue humaine — relancer une revue + dry-run, ne jamais forcer.`
    );
  }
  if (!req.approvalChecksum || req.approvalChecksum !== req.computedChecksum) {
    throw new MinesupPromotionRefused(
      `REFUSED — checksum d'approbation absent ou différent (--approval-checksum=${req.approvalChecksum ?? "(absent)"}, calculé maintenant=${req.computedChecksum}).`
    );
  }
  if (req.identifierConflicts > 0) {
    throw new MinesupPromotionRefused(`REFUSED — ${req.identifierConflicts} collision(s) d'identifiant non résolue(s). Aucune collision ne peut être ignorée.`);
  }
}

export interface ReconciliationAudit {
  createdCount: number;
  stagingLinkedCount: number;
  identifiersInsertedCount: number;
  createdWithoutStagingLink: string[]; // establishment_id
  createdWithoutIdentifiers: string[]; // establishment_id des candidats qui EN avaient prévu au moins 1
  orphanIdentifiers: string[]; // registry_identifier id dont l'establishment_id ne correspond à aucun candidat promu par ce run
  outcome: "SUCCESS" | "PARTIAL_RECONCILIATION_REQUIRED";
}

/**
 * §14 — une promotion n'est "SUCCESS" que si CHAQUE établissement créé a
 * exactement sa ligne staging liée ET tous ses identifiants prévus
 * insérés — jamais une réussite silencieuse partielle (précédent réel :
 * SPRINT P.3, 556 créés / 0 liés, resté non détecté jusqu'à P.6).
 */
export function evaluateReconciliation(input: {
  createdCount: number;
  stagingLinkedCount: number;
  identifiersInsertedCount: number;
  createdWithoutStagingLink: string[];
  createdWithoutIdentifiers: string[];
  orphanIdentifiers: string[];
}): ReconciliationAudit {
  const outcome: ReconciliationAudit["outcome"] =
    input.createdCount === input.stagingLinkedCount &&
    input.createdWithoutStagingLink.length === 0 &&
    input.createdWithoutIdentifiers.length === 0 &&
    input.orphanIdentifiers.length === 0
      ? "SUCCESS"
      : "PARTIAL_RECONCILIATION_REQUIRED";
  return { ...input, outcome };
}
