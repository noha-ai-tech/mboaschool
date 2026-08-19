/**
 * SPRINT MINESUP-F — garde-fou dédié à la promotion contrôlée NATIONALE
 * (batch `minesup-national-v1`, 60 candidats). Séparé de
 * `minesupPromotionGuard.ts` (MINESUP-D, phrase
 * "PROMOTE_MINESUP_PILOT_TO_PRODUCTION") — chaque batch de promotion a sa
 * propre phrase de confirmation distincte, jamais interchangeable.
 */

export const EXPECTED_PROJECT_REF = "umcwwynrftidytxgqkwi";
export const MINESUP_NATIONAL_CONFIRM_PHRASE = "PROMOTE_MINESUP_NATIONAL_TO_PRODUCTION";
export const EXPECTED_OPERATOR = "jean-merlain";

export interface MinesupNationalPromotionRequest {
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
  slugConflicts: number;
}

export class MinesupNationalPromotionRefused extends Error {}

export function assertMinesupNationalPromotionAllowed(req: MinesupNationalPromotionRequest): void {
  if (!req.commit) {
    throw new MinesupNationalPromotionRefused("REFUSED — --commit absent. Dry-run par défaut, aucune écriture.");
  }
  if (req.confirmPhrase !== MINESUP_NATIONAL_CONFIRM_PHRASE) {
    throw new MinesupNationalPromotionRefused(`REFUSED — phrase de confirmation manquante ou incorrecte. Exiger --confirm="${MINESUP_NATIONAL_CONFIRM_PHRASE}".`);
  }
  if (req.projectRef !== EXPECTED_PROJECT_REF) {
    throw new MinesupNationalPromotionRefused(`REFUSED — project ref inattendu (${req.projectRef} != ${EXPECTED_PROJECT_REF}).`);
  }
  if (!req.operator || req.operator !== EXPECTED_OPERATOR) {
    throw new MinesupNationalPromotionRefused(`REFUSED — opérateur manquant ou inattendu. Exiger --operator="${EXPECTED_OPERATOR}".`);
  }
  if (!req.approvedBy || req.approvedBy.trim().length === 0) {
    throw new MinesupNationalPromotionRefused("REFUSED — --approved-by manquant. Jamais codé en dur, doit être fourni explicitement au moment de l'exécution.");
  }
  if (req.approvedBy.trim().toLowerCase() === req.operator.trim().toLowerCase()) {
    throw new MinesupNationalPromotionRefused("REFUSED — approved-by ne peut pas être la même personne que operator (auto-approbation interdite).");
  }
  if (req.expectedEligibleCount === undefined || req.actualEligibleCount !== req.expectedEligibleCount) {
    throw new MinesupNationalPromotionRefused(
      `REFUSED — nombre de candidats éligibles inattendu (calculé maintenant=${req.actualEligibleCount}, --expected-count=${req.expectedEligibleCount ?? "(absent)"}). Le staging a probablement évolué depuis la revue humaine — relancer une revue + dry-run, ne jamais forcer.`
    );
  }
  if (!req.approvalChecksum || req.approvalChecksum !== req.computedChecksum) {
    throw new MinesupNationalPromotionRefused(
      `REFUSED — checksum d'approbation absent ou différent (--approval-checksum=${req.approvalChecksum ?? "(absent)"}, calculé maintenant=${req.computedChecksum}).`
    );
  }
  if (req.identifierConflicts > 0) {
    throw new MinesupNationalPromotionRefused(`REFUSED — ${req.identifierConflicts} collision(s) d'identifiant non résolue(s). Aucune collision ne peut être ignorée.`);
  }
  if (req.slugConflicts > 0) {
    throw new MinesupNationalPromotionRefused(`REFUSED — ${req.slugConflicts} collision(s) de slug non résolue(s) de façon déterministe.`);
  }
}
