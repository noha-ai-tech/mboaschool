import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  assertMinesupPromotionAllowed,
  evaluateReconciliation,
  MinesupPromotionRefused,
  MINESUP_PROMOTION_CONFIRM_PHRASE,
  EXPECTED_PROJECT_REF,
  EXPECTED_OPERATOR,
} from "../minesupPromotionGuard";

function validRequest(overrides: Partial<Parameters<typeof assertMinesupPromotionAllowed>[0]> = {}) {
  return {
    commit: true,
    confirmPhrase: MINESUP_PROMOTION_CONFIRM_PHRASE,
    projectRef: EXPECTED_PROJECT_REF,
    operator: EXPECTED_OPERATOR,
    approvedBy: "Eddy",
    actualEligibleCount: 29,
    expectedEligibleCount: 29,
    computedChecksum: "abc123",
    approvalChecksum: "abc123",
    identifierConflicts: 0,
    ...overrides,
  };
}

describe("assertMinesupPromotionAllowed — SPRINT MINESUP-D §13, garde-fou dédié (phrase distincte de productionGuard.ts)", () => {
  test("un jeu de flags entièrement valide passe sans lever", () => {
    assert.doesNotThrow(() => assertMinesupPromotionAllowed(validRequest()));
  });

  test("sans --commit -> REFUSED, dry-run implicite", () => {
    assert.throws(() => assertMinesupPromotionAllowed(validRequest({ commit: false })), MinesupPromotionRefused);
  });

  test("phrase de confirmation incorrecte ou absente -> REFUSED", () => {
    assert.throws(() => assertMinesupPromotionAllowed(validRequest({ confirmPhrase: "WRONG_PHRASE" })), MinesupPromotionRefused);
    assert.throws(() => assertMinesupPromotionAllowed(validRequest({ confirmPhrase: "PROMOTE_REGISTRY_TO_PRODUCTION" })), MinesupPromotionRefused); // phrase d'un AUTRE script de promotion, jamais interchangeable
  });

  test("project ref inattendu -> REFUSED", () => {
    assert.throws(() => assertMinesupPromotionAllowed(validRequest({ projectRef: "wrong-project-ref" })), MinesupPromotionRefused);
  });

  test("opérateur manquant ou inattendu -> REFUSED", () => {
    assert.throws(() => assertMinesupPromotionAllowed(validRequest({ operator: undefined })), MinesupPromotionRefused);
    assert.throws(() => assertMinesupPromotionAllowed(validRequest({ operator: "quelqu-un-d-autre" })), MinesupPromotionRefused);
  });

  test("approved-by manquant -> REFUSED (jamais codé en dur, doit venir d'un flag)", () => {
    assert.throws(() => assertMinesupPromotionAllowed(validRequest({ approvedBy: undefined })), MinesupPromotionRefused);
    assert.throws(() => assertMinesupPromotionAllowed(validRequest({ approvedBy: "" })), MinesupPromotionRefused);
  });

  test("approved-by identique à operator -> REFUSED (auto-approbation interdite)", () => {
    assert.throws(() => assertMinesupPromotionAllowed(validRequest({ approvedBy: EXPECTED_OPERATOR })), MinesupPromotionRefused);
    assert.throws(() => assertMinesupPromotionAllowed(validRequest({ approvedBy: EXPECTED_OPERATOR.toUpperCase() })), MinesupPromotionRefused);
  });

  test("nombre de candidats éligibles différent de --expected-count -> REFUSED (le staging a pu évoluer)", () => {
    assert.throws(() => assertMinesupPromotionAllowed(validRequest({ actualEligibleCount: 28 })), MinesupPromotionRefused);
    assert.throws(() => assertMinesupPromotionAllowed(validRequest({ expectedEligibleCount: undefined })), MinesupPromotionRefused);
  });

  test("checksum différent ou absent -> REFUSED", () => {
    assert.throws(() => assertMinesupPromotionAllowed(validRequest({ approvalChecksum: "different" })), MinesupPromotionRefused);
    assert.throws(() => assertMinesupPromotionAllowed(validRequest({ approvalChecksum: undefined })), MinesupPromotionRefused);
  });

  test("collision d'identifiant non résolue -> REFUSED, jamais ignorée", () => {
    assert.throws(() => assertMinesupPromotionAllowed(validRequest({ identifierConflicts: 1 })), MinesupPromotionRefused);
  });
});

describe("evaluateReconciliation — SPRINT MINESUP-D §14, jamais un SUCCESS silencieux partiel", () => {
  test("tout correspond exactement -> SUCCESS", () => {
    const result = evaluateReconciliation({
      createdCount: 29, stagingLinkedCount: 29, identifiersInsertedCount: 50,
      createdWithoutStagingLink: [], createdWithoutIdentifiers: [], orphanIdentifiers: [],
    });
    assert.equal(result.outcome, "SUCCESS");
  });

  test("un établissement créé mais non lié au staging -> PARTIAL_RECONCILIATION_REQUIRED (précédent réel SPRINT P.3)", () => {
    const result = evaluateReconciliation({
      createdCount: 29, stagingLinkedCount: 28, identifiersInsertedCount: 50,
      createdWithoutStagingLink: ["est-id-x"], createdWithoutIdentifiers: [], orphanIdentifiers: [],
    });
    assert.equal(result.outcome, "PARTIAL_RECONCILIATION_REQUIRED");
  });

  test("un identifiant orphelin détecté -> PARTIAL_RECONCILIATION_REQUIRED", () => {
    const result = evaluateReconciliation({
      createdCount: 29, stagingLinkedCount: 29, identifiersInsertedCount: 49,
      createdWithoutStagingLink: [], createdWithoutIdentifiers: [], orphanIdentifiers: ["id-orphelin"],
    });
    assert.equal(result.outcome, "PARTIAL_RECONCILIATION_REQUIRED");
  });

  test("createdCount == stagingLinkedCount seul ne suffit PAS si des identifiants manquent", () => {
    const result = evaluateReconciliation({
      createdCount: 29, stagingLinkedCount: 29, identifiersInsertedCount: 40,
      createdWithoutStagingLink: [], createdWithoutIdentifiers: ["est-id-y"], orphanIdentifiers: [],
    });
    assert.equal(result.outcome, "PARTIAL_RECONCILIATION_REQUIRED");
  });
});
