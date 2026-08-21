import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  computePresenceConfidence,
  computeIdentityConfidence,
  computeOfficialVerification,
  computePublicationReadiness,
} from "../transportTier3TrustModel";

describe("computePresenceConfidence — dimension 1/3, existence uniquement", () => {
  test("T3_SINGLE_SOURCE -> SINGLE_SOURCE", () => {
    assert.equal(computePresenceConfidence({ tier3Confidence: "T3_SINGLE_SOURCE", sourceCount: 1, independentSourceCount: 1 }), "SINGLE_SOURCE");
  });
  test("T3_MULTI_SOURCE_WEAK -> MULTI_SOURCE_WEAK", () => {
    assert.equal(computePresenceConfidence({ tier3Confidence: "T3_MULTI_SOURCE_WEAK", sourceCount: 2, independentSourceCount: 2 }), "MULTI_SOURCE_WEAK");
  });
  test("T3_CORROBORATED / ABOVE_TIER3_CORROBORATED -> CORROBORATED", () => {
    assert.equal(computePresenceConfidence({ tier3Confidence: "T3_CORROBORATED", sourceCount: 2, independentSourceCount: 2 }), "CORROBORATED");
    assert.equal(computePresenceConfidence({ tier3Confidence: "ABOVE_TIER3_CORROBORATED", sourceCount: 2, independentSourceCount: 2 }), "CORROBORATED");
  });
  test("T3_CONFLICTING -> CONFLICTING", () => {
    assert.equal(computePresenceConfidence({ tier3Confidence: "T3_CONFLICTING", sourceCount: 2, independentSourceCount: 2 }), "CONFLICTING");
  });
  test("T3_IDENTITY_REVIEW (pas de signal de présence propre) retombe sur les compteurs de sources, jamais sur CORROBORATED par défaut", () => {
    assert.equal(computePresenceConfidence({ tier3Confidence: "T3_IDENTITY_REVIEW", sourceCount: 1, independentSourceCount: 1 }), "SINGLE_SOURCE");
    assert.equal(computePresenceConfidence({ tier3Confidence: "T3_IDENTITY_REVIEW", sourceCount: 2, independentSourceCount: 1 }), "MULTI_SOURCE_WEAK");
    assert.equal(computePresenceConfidence({ tier3Confidence: "T3_IDENTITY_REVIEW", sourceCount: 2, independentSourceCount: 2 }), "CORROBORATED");
  });
});

describe("computeIdentityConfidence — dimension 2/3, résolution d'identité uniquement", () => {
  test("T3_IDENTITY_REVIEW -> UNRESOLVED quel que soit le matching (l'entité elle-même est incertaine)", () => {
    assert.equal(computeIdentityConfidence({ tier3Confidence: "T3_IDENTITY_REVIEW", matchingDecision: "NO_MATCH", crossMinistryDecision: "NEW" }), "UNRESOLVED");
  });
  test("chevauchement inter-ministériel non résolu -> CONFLICTING, prioritaire sur le niveau de matching (TC-12 IT2MIP)", () => {
    assert.equal(computeIdentityConfidence({ tier3Confidence: "T3_SINGLE_SOURCE", matchingDecision: "PROBABLE_MATCH", crossMinistryDecision: "AMBIGUOUS" }), "CONFLICTING");
  });
  test("matching AMBIGUOUS -> CONFLICTING (Fleet Management Academy, TC-17)", () => {
    assert.equal(computeIdentityConfidence({ tier3Confidence: "T3_SINGLE_SOURCE", matchingDecision: "AMBIGUOUS", crossMinistryDecision: "NEW" }), "CONFLICTING");
  });
  test("STRONG_MATCH / PROBABLE_MATCH -> PROBABLE", () => {
    assert.equal(computeIdentityConfidence({ tier3Confidence: "T3_SINGLE_SOURCE", matchingDecision: "STRONG_MATCH", crossMinistryDecision: "NEW" }), "PROBABLE");
    assert.equal(computeIdentityConfidence({ tier3Confidence: "T3_SINGLE_SOURCE", matchingDecision: "PROBABLE_MATCH", crossMinistryDecision: "NEW" }), "PROBABLE");
  });
  test("NO_MATCH, rien d'ambigu par ailleurs -> RESOLVED", () => {
    assert.equal(computeIdentityConfidence({ tier3Confidence: "T3_SINGLE_SOURCE", matchingDecision: "NO_MATCH", crossMinistryDecision: "NEW" }), "RESOLVED");
  });
  test("niveau de matching inconnu -> UNRESOLVED, fail-closed, jamais une résolution supposée", () => {
    assert.equal(computeIdentityConfidence({ tier3Confidence: "T3_SINGLE_SOURCE", matchingDecision: "SOMETHING_NEW_AND_UNEXPECTED", crossMinistryDecision: "NEW" }), "UNRESOLVED");
  });
});

describe("computeOfficialVerification — dimension 3/3, GARANTIE STRUCTURELLE contre OFFICIALLY_VERIFIED (test N)", () => {
  test("aucune preuve officielle -> UNVERIFIED", () => {
    assert.equal(computeOfficialVerification({ officialCorroborationStatus: "NOT_SEARCHED" }), "UNVERIFIED");
  });
  test("source à consonance officielle citée -> OFFICIAL_SOURCE_FOUND, jamais plus", () => {
    assert.equal(computeOfficialVerification({ officialCorroborationStatus: "OFFICIAL_SOURCE_FOUND" }), "OFFICIAL_SOURCE_FOUND");
  });
  test("TEST N — aucune entrée, même en simulant une corroboration Tier-3 maximale (source count élevé, indépendance totale, mots-clés 'officiel'/'verified'), ne peut faire remonter la fonction à OFFICIALLY_VERIFIED : la fonction n'a structurellement aucun chemin vers cette valeur", () => {
    const adversarialInputs = [
      "OFFICIALLY_VERIFIED",
      "officially_verified",
      "VERIFIED",
      "MULTI_SOURCE_CORROBORATED_STRONG",
      "TIER3_MAX_CONFIDENCE",
      "",
    ];
    for (const officialCorroborationStatus of adversarialInputs) {
      const result = computeOfficialVerification({ officialCorroborationStatus });
      assert.notEqual(result, "OFFICIALLY_VERIFIED", `officialCorroborationStatus="${officialCorroborationStatus}" must never produce OFFICIALLY_VERIFIED`);
      assert.ok(result === "UNVERIFIED" || result === "OFFICIAL_SOURCE_FOUND");
    }
  });
});

describe("computePublicationReadiness — informatif uniquement (brief §6)", () => {
  const baseInput = {
    presenceConfidence: "SINGLE_SOURCE" as const,
    identityConfidence: "RESOLVED" as const,
    officialVerification: "UNVERIFIED" as const,
    duplicateUnresolved: false,
    crossMinistryUnresolved: false,
    provenanceComplete: true,
    piiDetected: false,
  };

  test("PII détecté -> REJECTED, prioritaire sur tout le reste", () => {
    assert.equal(computePublicationReadiness({ ...baseInput, piiDetected: true }), "REJECTED");
  });

  test("TEST R — presence CONFLICTING -> jamais PUBLISHABLE_UNVERIFIED", () => {
    assert.equal(computePublicationReadiness({ ...baseInput, presenceConfidence: "CONFLICTING" }), "REVIEW_REQUIRED");
  });
  test("TEST R — identity CONFLICTING -> jamais PUBLISHABLE_UNVERIFIED", () => {
    assert.equal(computePublicationReadiness({ ...baseInput, identityConfidence: "CONFLICTING" }), "REVIEW_REQUIRED");
  });

  test("TEST Q — identité UNRESOLVED -> REVIEW_REQUIRED", () => {
    assert.equal(computePublicationReadiness({ ...baseInput, identityConfidence: "UNRESOLVED" }), "REVIEW_REQUIRED");
  });

  test("TEST P — doublon non résolu -> REVIEW_REQUIRED même si tout le reste est parfait", () => {
    assert.equal(computePublicationReadiness({ ...baseInput, duplicateUnresolved: true }), "REVIEW_REQUIRED");
  });

  test("chevauchement inter-ministériel non résolu -> REVIEW_REQUIRED", () => {
    assert.equal(computePublicationReadiness({ ...baseInput, crossMinistryUnresolved: true }), "REVIEW_REQUIRED");
  });

  test("provenance incomplète -> REVIEW_REQUIRED", () => {
    assert.equal(computePublicationReadiness({ ...baseInput, provenanceComplete: false }), "REVIEW_REQUIRED");
  });

  test("TEST S — identité RESOLVED + corroboré + provenance complète + AUCUNE preuve officielle -> PUBLISHABLE_UNVERIFIED (jamais 'verified')", () => {
    const result = computePublicationReadiness({ ...baseInput, presenceConfidence: "CORROBORATED", officialVerification: "UNVERIFIED" });
    assert.equal(result, "PUBLISHABLE_UNVERIFIED");
    assert.notEqual(result, "OFFICIALLY_VERIFIED"); // n'existe même pas dans ce type, mais on le vérifie explicitement par contraste
  });

  test("official_verification n'est JAMAIS une condition bloquante ni promotrice — même valeur d'entrée, même sortie quel que soit officialVerification", () => {
    const a = computePublicationReadiness({ ...baseInput, officialVerification: "UNVERIFIED" });
    const b = computePublicationReadiness({ ...baseInput, officialVerification: "OFFICIAL_SOURCE_FOUND" });
    assert.equal(a, b);
    assert.equal(a, "PUBLISHABLE_UNVERIFIED");
  });

  test("identité seulement PROBABLE (pas RESOLVED) -> REVIEW_REQUIRED, conservateur par défaut", () => {
    assert.equal(computePublicationReadiness({ ...baseInput, identityConfidence: "PROBABLE" }), "REVIEW_REQUIRED");
  });
});
