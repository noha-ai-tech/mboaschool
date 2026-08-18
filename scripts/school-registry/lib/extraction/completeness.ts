import type { CompletenessCheckOutcome, ExplainedExclusion, ExpectedRowsSource, ExtractionStatus, PaginationAccounting } from "./types";

/**
 * SPRINT R.2-SAFETY §14-18, §39-41 — Le cœur du framework.
 *
 * §14 : si expectedRows est connu, extractedRows DOIT lui correspondre
 * (après comptabilisation des doublons/exclusions expliquées) avant tout
 * import automatique. §15 : pas de règle aveugle "98% = PASS". §17 :
 * expected = valid + rejected + duplicates + exclusions expliquées, ou
 * INCOMPLETE_EXTRACTION. §41 : dans le doute, FAIL CLOSED.
 */
export function evaluateCompleteness(input: {
  expectedRows: number | null;
  expectedRowsSource: ExpectedRowsSource;
  extractedRows: number;
  duplicateRows: number;
  explainedExclusions: ExplainedExclusion[];
  pagination: PaginationAccounting | null;
  structureValid: boolean;
  structureInvalidReason: string | null;
  networkFailed: boolean;
  networkFailureReason: string | null;
  /**
   * §18 — n'a d'effet QUE si expectedRows est null. L'appelant doit prouver
   * l'épuisement de la pagination (pas de page suivante, curseur stable,
   * DOM entièrement parcouru) avant de positionner ce flag à true.
   */
  unknownCountExplicitlyComplete?: { reason: string } | null;
}): CompletenessCheckOutcome {
  if (input.networkFailed) {
    return fail("NETWORK_FAILURE", 0, input.expectedRows, input.networkFailureReason ?? "Échec réseau non résolu après retry.");
  }
  if (!input.structureValid) {
    return fail("SOURCE_STRUCTURE_CHANGED", 0, input.expectedRows, input.structureInvalidReason ?? "Structure de la source non conforme à l'attendu.");
  }
  if (input.pagination?.loopDetected) {
    return fail("PAGINATION_LOOP", input.extractedRows, input.expectedRows, "Boucle de pagination détectée (empreinte de page répétée).");
  }
  if (input.pagination?.gapDetected) {
    return fail("PAGINATION_GAP", input.extractedRows, input.expectedRows, "Trou dans la séquence de pages récupérées.");
  }
  if (input.pagination?.pagesExpected != null && input.pagination.pagesFetched < input.pagination.pagesExpected) {
    return fail(
      "PAGINATION_GAP",
      input.extractedRows,
      input.expectedRows,
      `${input.pagination.pagesFetched}/${input.pagination.pagesExpected} pages récupérées — page(s) manquante(s).`
    );
  }

  const explainedTotal = input.explainedExclusions.reduce((sum, e) => sum + e.count, 0);
  const accounted = input.extractedRows + input.duplicateRows + explainedTotal;

  // §18 — expectedRows inconnu : pas d'équation de comptabilité possible,
  // on se fie à une preuve explicite d'épuisement (jamais une supposition).
  if (input.expectedRows === null) {
    if (input.unknownCountExplicitlyComplete) {
      const status: ExtractionStatus = input.explainedExclusions.length > 0 || input.duplicateRows > 0 ? "PASS_WITH_EXPLAINED_EXCLUSIONS" : "PASS";
      return {
        status,
        safeForNormalization: true,
        safeForStaging: true,
        accounted,
        expected: null,
        explanation: `EXPECTED_COUNT_UNKNOWN — complétude établie par preuve alternative : ${input.unknownCountExplicitlyComplete.reason}`,
      };
    }
    return fail("MANUAL_REVIEW_REQUIRED", accounted, null, "EXPECTED_COUNT_UNKNOWN et aucune preuve d'épuisement fournie — revue humaine requise avant staging.");
  }

  // §14-17 — expectedRows connu : l'équation doit tomber juste, jamais "assez proche".
  if (accounted !== input.expectedRows) {
    return fail(
      "INCOMPLETE_EXTRACTION",
      accounted,
      input.expectedRows,
      `${accounted}/${input.expectedRows} lignes comptabilisées (extracted=${input.extractedRows} + duplicates=${input.duplicateRows} + exclusions=${explainedTotal}). Différence non expliquée : ${input.expectedRows - accounted}.`
    );
  }

  const status: ExtractionStatus = input.explainedExclusions.length > 0 || input.duplicateRows > 0 ? "PASS_WITH_EXPLAINED_EXCLUSIONS" : "PASS";
  return {
    status,
    safeForNormalization: true,
    safeForStaging: true,
    accounted,
    expected: input.expectedRows,
    explanation: `${accounted}/${input.expectedRows} lignes comptabilisées — équation vérifiée.`,
  };
}

function fail(status: ExtractionStatus, accounted: number, expected: number | null, explanation: string): CompletenessCheckOutcome {
  return { status, safeForNormalization: false, safeForStaging: false, accounted, expected, explanation };
}

/**
 * §39 — Import Gate. À appeler avant TOUTE écriture staging. Lève une
 * exception (jamais un "best effort" silencieux, §41) si le statut ne fait
 * pas partie des statuts autorisés.
 */
export function requireExtractionSafe(outcome: CompletenessCheckOutcome): void {
  if (!outcome.safeForStaging) {
    throw new Error(
      [
        "EXTRACTION BLOCKED",
        `Status: ${outcome.status}`,
        `Expected: ${outcome.expected ?? "UNKNOWN"}`,
        `Accounted: ${outcome.accounted}`,
        `Explanation: ${outcome.explanation}`,
        "Staging write: BLOCKED",
      ].join("\n")
    );
  }
}
