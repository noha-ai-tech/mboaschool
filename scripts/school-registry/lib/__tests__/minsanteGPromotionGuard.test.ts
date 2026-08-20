import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  assertMinsanteGPromotionAllowed,
  MinsanteGPromotionRefused,
  MINSANTE_G_CONFIRM_PHRASE,
  EXPECTED_PROJECT_REF,
  EXPECTED_OPERATOR,
  EXPECTED_APPROVAL_CHECKSUM,
  EXPECTED_CANDIDATE_COUNT,
} from "../minsanteGPromotionGuard";

function validRequest(overrides: Partial<Parameters<typeof assertMinsanteGPromotionAllowed>[0]> = {}) {
  return {
    commit: true,
    confirmPhrase: MINSANTE_G_CONFIRM_PHRASE,
    projectRef: EXPECTED_PROJECT_REF,
    operator: EXPECTED_OPERATOR,
    approvedBy: "Eddy",
    actualEligibleCount: EXPECTED_CANDIDATE_COUNT,
    expectedEligibleCount: EXPECTED_CANDIDATE_COUNT,
    computedChecksum: EXPECTED_APPROVAL_CHECKSUM,
    approvalChecksum: EXPECTED_APPROVAL_CHECKSUM,
    identifierConflicts: 0,
    slugConflicts: 0,
    ...overrides,
  };
}

describe("assertMinsanteGPromotionAllowed — SPRINT MINSANTE-G, garde-fou dédié (phrase distincte de MINESUP-D/MINESUP-F)", () => {
  test("un jeu de flags entièrement valide passe sans lever", () => {
    assert.doesNotThrow(() => assertMinsanteGPromotionAllowed(validRequest()));
  });
  test("sans --commit -> REFUSED (0 écriture, dry-run par défaut)", () => {
    assert.throws(() => assertMinsanteGPromotionAllowed(validRequest({ commit: false })), MinsanteGPromotionRefused);
  });
  test("mauvaise phrase de confirmation (ex. celle de MINESUP-F/MINESUP-D) rejetée — jamais interchangeable", () => {
    assert.throws(() => assertMinsanteGPromotionAllowed(validRequest({ confirmPhrase: "PROMOTE_MINESUP_NATIONAL_TO_PRODUCTION" })), MinsanteGPromotionRefused);
    assert.throws(() => assertMinsanteGPromotionAllowed(validRequest({ confirmPhrase: "PROMOTE_MINESUP_PILOT_TO_PRODUCTION" })), MinsanteGPromotionRefused);
    assert.throws(() => assertMinsanteGPromotionAllowed(validRequest({ confirmPhrase: undefined })), MinsanteGPromotionRefused);
  });
  test("mauvais project ref -> REFUSED", () => {
    assert.throws(() => assertMinsanteGPromotionAllowed(validRequest({ projectRef: "wrong-project-ref" })), MinsanteGPromotionRefused);
  });
  test("opérateur manquant ou inattendu -> REFUSED", () => {
    assert.throws(() => assertMinsanteGPromotionAllowed(validRequest({ operator: undefined })), MinsanteGPromotionRefused);
    assert.throws(() => assertMinsanteGPromotionAllowed(validRequest({ operator: "quelqu-un-d-autre" })), MinsanteGPromotionRefused);
  });
  test("approved-by manquant -> REFUSED", () => {
    assert.throws(() => assertMinsanteGPromotionAllowed(validRequest({ approvedBy: undefined })), MinsanteGPromotionRefused);
    assert.throws(() => assertMinsanteGPromotionAllowed(validRequest({ approvedBy: "" })), MinsanteGPromotionRefused);
    assert.throws(() => assertMinsanteGPromotionAllowed(validRequest({ approvedBy: "   " })), MinsanteGPromotionRefused);
  });
  test("auto-approbation (approved-by === operator, insensible à la casse) -> REFUSED", () => {
    assert.throws(() => assertMinsanteGPromotionAllowed(validRequest({ approvedBy: EXPECTED_OPERATOR })), MinsanteGPromotionRefused);
    assert.throws(() => assertMinsanteGPromotionAllowed(validRequest({ approvedBy: EXPECTED_OPERATOR.toUpperCase() })), MinsanteGPromotionRefused);
  });
  test("nombre éligible différent de --expected-count=8 -> REFUSED (jamais promouvoir un sous-ensemble plus petit silencieusement)", () => {
    assert.throws(() => assertMinsanteGPromotionAllowed(validRequest({ actualEligibleCount: 7 })), MinsanteGPromotionRefused);
    assert.throws(() => assertMinsanteGPromotionAllowed(validRequest({ actualEligibleCount: 22 })), MinsanteGPromotionRefused);
    assert.throws(() => assertMinsanteGPromotionAllowed(validRequest({ expectedEligibleCount: undefined })), MinsanteGPromotionRefused);
  });
  test("checksum différent ou absent -> REFUSED", () => {
    assert.throws(() => assertMinsanteGPromotionAllowed(validRequest({ approvalChecksum: "different" })), MinsanteGPromotionRefused);
    assert.throws(() => assertMinsanteGPromotionAllowed(validRequest({ approvalChecksum: undefined })), MinsanteGPromotionRefused);
    assert.throws(() => assertMinsanteGPromotionAllowed(validRequest({ computedChecksum: "drifted-since-approval" })), MinsanteGPromotionRefused);
  });
  test("collision d'identifiant non résolue -> REFUSED", () => {
    assert.throws(() => assertMinsanteGPromotionAllowed(validRequest({ identifierConflicts: 1 })), MinsanteGPromotionRefused);
  });
  test("collision de slug non résolue -> REFUSED", () => {
    assert.throws(() => assertMinsanteGPromotionAllowed(validRequest({ slugConflicts: 1 })), MinsanteGPromotionRefused);
  });
});
