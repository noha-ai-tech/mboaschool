/**
 * SPRINT MINSANTE-G — garde-fou dédié à la promotion contrôlée du pilote
 * MINSANTE (batch `minsante-pilot-v1`, 8 candidats CLEAN_APPROVABLE issus du
 * snapshot d'approbation MINSANTE-F, `reports/registry/minsante-f-pilot-approval.json`,
 * checksum `26ea91c10bb9791dbc2e339bee577ae16d2f31db499411228bf224aa0bd0f653`).
 *
 * Modèle : `minesupNationalPromotionGuard.ts` (MINESUP-F). Séparé de
 * `minesupPromotionGuard.ts` / `minesupNationalPromotionGuard.ts` — chaque
 * batch de promotion a sa propre phrase de confirmation distincte, jamais
 * interchangeable (§17 du brief MINSANTE-G).
 *
 * CE MODULE N'EST PAS INVOQUÉ AVEC DES FLAGS VALIDES DANS CE SPRINT.
 * MINSANTE-G est un PRE-FLIGHT UNIQUEMENT — aucun --commit, aucune écriture
 * production. Le chemin `commit=true` reste testé (tests de refus, §19) pour
 * qu'un futur sprint d'exécution séparé puisse réutiliser ce même garde-fou
 * sans le réécrire.
 */

export const EXPECTED_PROJECT_REF = "umcwwynrftidytxgqkwi";
export const MINSANTE_G_CONFIRM_PHRASE = "PROMOTE_MINSANTE_PILOT_TO_PRODUCTION";
export const EXPECTED_OPERATOR = "jean-merlain";
export const EXPECTED_APPROVAL_CHECKSUM = "26ea91c10bb9791dbc2e339bee577ae16d2f31db499411228bf224aa0bd0f653";
export const EXPECTED_CANDIDATE_COUNT = 8;

export interface MinsanteGPromotionRequest {
  commit: boolean;
  confirmPhrase: string | undefined;
  projectRef: string;
  operator: string | undefined;
  /** §17 — obligatoire, distinct de l'opérateur, jamais codé en dur. */
  approvedBy: string | undefined;
  actualEligibleCount: number;
  expectedEligibleCount: number | undefined;
  computedChecksum: string;
  approvalChecksum: string | undefined;
  identifierConflicts: number;
  slugConflicts: number;
}

export class MinsanteGPromotionRefused extends Error {}

/**
 * Lève MinsanteGPromotionRefused au premier garde-fou violé. Ne retourne
 * jamais "true/false" : un appelant qui ignorerait un booléen de retour
 * serait un bug silencieux, alors qu'une exception non interceptée arrête le
 * script (même convention que minesupNationalPromotionGuard.ts).
 */
export function assertMinsanteGPromotionAllowed(req: MinsanteGPromotionRequest): void {
  if (!req.commit) {
    throw new MinsanteGPromotionRefused("REFUSED — --commit absent. Dry-run par défaut, aucune écriture.");
  }
  if (req.confirmPhrase !== MINSANTE_G_CONFIRM_PHRASE) {
    throw new MinsanteGPromotionRefused(`REFUSED — phrase de confirmation manquante ou incorrecte. Exiger --confirm="${MINSANTE_G_CONFIRM_PHRASE}".`);
  }
  if (req.projectRef !== EXPECTED_PROJECT_REF) {
    throw new MinsanteGPromotionRefused(`REFUSED — project ref inattendu (${req.projectRef} != ${EXPECTED_PROJECT_REF}).`);
  }
  if (!req.operator || req.operator !== EXPECTED_OPERATOR) {
    throw new MinsanteGPromotionRefused(`REFUSED — opérateur manquant ou inattendu. Exiger --operator="${EXPECTED_OPERATOR}".`);
  }
  if (!req.approvedBy || req.approvedBy.trim().length === 0) {
    throw new MinsanteGPromotionRefused("REFUSED — --approved-by manquant. Jamais codé en dur, doit être fourni explicitement au moment de l'exécution.");
  }
  if (req.approvedBy.trim().toLowerCase() === req.operator.trim().toLowerCase()) {
    throw new MinsanteGPromotionRefused("REFUSED — approved-by ne peut pas être la même personne que operator (auto-approbation interdite).");
  }
  if (req.expectedEligibleCount === undefined || req.actualEligibleCount !== req.expectedEligibleCount) {
    throw new MinsanteGPromotionRefused(
      `REFUSED — nombre de candidats éligibles inattendu (calculé maintenant=${req.actualEligibleCount}, --expected-count=${req.expectedEligibleCount ?? "(absent)"}). Le staging a probablement évolué depuis la revue humaine — relancer une revue + dry-run, ne jamais forcer.`
    );
  }
  if (!req.approvalChecksum || req.approvalChecksum !== req.computedChecksum) {
    throw new MinsanteGPromotionRefused(
      `REFUSED — checksum d'approbation absent ou différent (--approval-checksum=${req.approvalChecksum ?? "(absent)"}, calculé maintenant=${req.computedChecksum}).`
    );
  }
  if (req.identifierConflicts > 0) {
    throw new MinsanteGPromotionRefused(`REFUSED — ${req.identifierConflicts} collision(s) d'identifiant non résolue(s). Aucune collision ne peut être ignorée.`);
  }
  if (req.slugConflicts > 0) {
    throw new MinsanteGPromotionRefused(`REFUSED — ${req.slugConflicts} collision(s) de slug non résolue(s) de façon déterministe.`);
  }
}
