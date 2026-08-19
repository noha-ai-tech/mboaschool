import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  assertMinesupNationalPromotionAllowed,
  MinesupNationalPromotionRefused,
  MINESUP_NATIONAL_CONFIRM_PHRASE,
  EXPECTED_PROJECT_REF,
  EXPECTED_OPERATOR,
} from "../minesupNationalPromotionGuard";

function validRequest(overrides: Partial<Parameters<typeof assertMinesupNationalPromotionAllowed>[0]> = {}) {
  return {
    commit: true,
    confirmPhrase: MINESUP_NATIONAL_CONFIRM_PHRASE,
    projectRef: EXPECTED_PROJECT_REF,
    operator: EXPECTED_OPERATOR,
    approvedBy: "Eddy",
    actualEligibleCount: 60,
    expectedEligibleCount: 60,
    computedChecksum: "abc123",
    approvalChecksum: "abc123",
    identifierConflicts: 0,
    slugConflicts: 0,
    ...overrides,
  };
}

describe("assertMinesupNationalPromotionAllowed — SPRINT MINESUP-F, garde-fou dédié (phrase distincte de MINESUP-D)", () => {
  test("un jeu de flags entièrement valide passe sans lever", () => {
    assert.doesNotThrow(() => assertMinesupNationalPromotionAllowed(validRequest()));
  });
  test("sans --commit -> REFUSED", () => {
    assert.throws(() => assertMinesupNationalPromotionAllowed(validRequest({ commit: false })), MinesupNationalPromotionRefused);
  });
  test("phrase de confirmation d'un AUTRE batch (MINESUP-D) rejetée — jamais interchangeable", () => {
    assert.throws(() => assertMinesupNationalPromotionAllowed(validRequest({ confirmPhrase: "PROMOTE_MINESUP_PILOT_TO_PRODUCTION" })), MinesupNationalPromotionRefused);
  });
  test("project ref inattendu -> REFUSED", () => {
    assert.throws(() => assertMinesupNationalPromotionAllowed(validRequest({ projectRef: "wrong" })), MinesupNationalPromotionRefused);
  });
  test("opérateur manquant ou inattendu -> REFUSED", () => {
    assert.throws(() => assertMinesupNationalPromotionAllowed(validRequest({ operator: undefined })), MinesupNationalPromotionRefused);
    assert.throws(() => assertMinesupNationalPromotionAllowed(validRequest({ operator: "quelqu-un-d-autre" })), MinesupNationalPromotionRefused);
  });
  test("approved-by manquant -> REFUSED", () => {
    assert.throws(() => assertMinesupNationalPromotionAllowed(validRequest({ approvedBy: undefined })), MinesupNationalPromotionRefused);
  });
  test("auto-approbation (approved-by === operator) -> REFUSED", () => {
    assert.throws(() => assertMinesupNationalPromotionAllowed(validRequest({ approvedBy: EXPECTED_OPERATOR })), MinesupNationalPromotionRefused);
  });
  test("nombre éligible différent de --expected-count -> REFUSED", () => {
    assert.throws(() => assertMinesupNationalPromotionAllowed(validRequest({ actualEligibleCount: 59 })), MinesupNationalPromotionRefused);
  });
  test("checksum différent ou absent -> REFUSED", () => {
    assert.throws(() => assertMinesupNationalPromotionAllowed(validRequest({ approvalChecksum: "different" })), MinesupNationalPromotionRefused);
  });
  test("collision d'identifiant non résolue -> REFUSED", () => {
    assert.throws(() => assertMinesupNationalPromotionAllowed(validRequest({ identifierConflicts: 1 })), MinesupNationalPromotionRefused);
  });
  test("collision de slug non résolue -> REFUSED", () => {
    assert.throws(() => assertMinesupNationalPromotionAllowed(validRequest({ slugConflicts: 1 })), MinesupNationalPromotionRefused);
  });
});
