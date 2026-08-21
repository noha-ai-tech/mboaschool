import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  assertTransportA2ImportAllowed,
  TransportA2ImportRefused,
  TRANSPORT_A2_CONFIRM_PHRASE,
  EXPECTED_PROJECT_REF,
  EXPECTED_OPERATOR,
  EXPECTED_CANDIDATE_COUNT,
  computeTransportA2Checksum,
} from "../transportA2ImportGuard";

const SAMPLE_CHECKSUM = computeTransportA2Checksum([
  { candidate_id: "TC-01", normalized_name: "auto ecole astrale", entity_family: "DRIVING_SCHOOL", staging_classification: "SOURCE_REVIEW" },
]);

function validRequest(overrides: Partial<Parameters<typeof assertTransportA2ImportAllowed>[0]> = {}) {
  return {
    commit: true,
    confirmPhrase: TRANSPORT_A2_CONFIRM_PHRASE,
    projectRef: EXPECTED_PROJECT_REF,
    operator: EXPECTED_OPERATOR,
    approvedBy: "Eddy",
    actualWouldInsertCount: EXPECTED_CANDIDATE_COUNT,
    expectedWouldInsertCount: EXPECTED_CANDIDATE_COUNT,
    computedChecksum: SAMPLE_CHECKSUM,
    approvalChecksum: SAMPLE_CHECKSUM,
    mintransportEnumPresent: true,
    cleanApprovableCount: 0,
    piiPersistedCount: 0,
    officialIdentifiersInvented: 0,
    registryIdentifiersToInsert: 0,
    ...overrides,
  };
}

describe("assertTransportA2ImportAllowed — SPRINT TRANSPORT-A.2-T3, garde-fou dédié import staging (distinct de toute promotion)", () => {
  test("un jeu de flags entièrement valide passe sans lever", () => {
    assert.doesNotThrow(() => assertTransportA2ImportAllowed(validRequest()));
  });

  test("sans --commit -> REFUSED (0 écriture, dry-run par défaut)", () => {
    assert.throws(() => assertTransportA2ImportAllowed(validRequest({ commit: false })), TransportA2ImportRefused);
  });

  test("mauvaise phrase de confirmation (ex. celle de MINSANTE-G/promotion) rejetée — jamais interchangeable", () => {
    assert.throws(() => assertTransportA2ImportAllowed(validRequest({ confirmPhrase: "PROMOTE_MINSANTE_PILOT_TO_PRODUCTION" })), TransportA2ImportRefused);
    assert.throws(() => assertTransportA2ImportAllowed(validRequest({ confirmPhrase: "PROMOTE_REGISTRY_TO_PRODUCTION" })), TransportA2ImportRefused);
    assert.throws(() => assertTransportA2ImportAllowed(validRequest({ confirmPhrase: undefined })), TransportA2ImportRefused);
  });

  test("mauvais project ref -> REFUSED", () => {
    assert.throws(() => assertTransportA2ImportAllowed(validRequest({ projectRef: "wrong-project-ref" })), TransportA2ImportRefused);
  });

  test("opérateur manquant ou inattendu -> REFUSED", () => {
    assert.throws(() => assertTransportA2ImportAllowed(validRequest({ operator: undefined })), TransportA2ImportRefused);
    assert.throws(() => assertTransportA2ImportAllowed(validRequest({ operator: "quelqu-un-d-autre" })), TransportA2ImportRefused);
  });

  test("approved-by manquant -> REFUSED", () => {
    assert.throws(() => assertTransportA2ImportAllowed(validRequest({ approvedBy: undefined })), TransportA2ImportRefused);
    assert.throws(() => assertTransportA2ImportAllowed(validRequest({ approvedBy: "" })), TransportA2ImportRefused);
    assert.throws(() => assertTransportA2ImportAllowed(validRequest({ approvedBy: "   " })), TransportA2ImportRefused);
  });

  test("auto-approbation (approved-by === operator, insensible à la casse) -> REFUSED", () => {
    assert.throws(() => assertTransportA2ImportAllowed(validRequest({ approvedBy: EXPECTED_OPERATOR })), TransportA2ImportRefused);
    assert.throws(() => assertTransportA2ImportAllowed(validRequest({ approvedBy: EXPECTED_OPERATOR.toUpperCase() })), TransportA2ImportRefused);
  });

  test("nombre à insérer différent de --expected-count=17 -> REFUSED (jamais insérer un sous-ensemble plus petit/grand silencieusement)", () => {
    assert.throws(() => assertTransportA2ImportAllowed(validRequest({ actualWouldInsertCount: 16 })), TransportA2ImportRefused);
    assert.throws(() => assertTransportA2ImportAllowed(validRequest({ actualWouldInsertCount: 22 })), TransportA2ImportRefused);
    assert.throws(() => assertTransportA2ImportAllowed(validRequest({ expectedWouldInsertCount: undefined })), TransportA2ImportRefused);
  });

  test("TEST C — --expected-count=16 (population sous-déclarée) alors que le calcul frais trouve 17 -> REFUSED", () => {
    assert.throws(() => assertTransportA2ImportAllowed(validRequest({ expectedWouldInsertCount: 16, actualWouldInsertCount: EXPECTED_CANDIDATE_COUNT })), TransportA2ImportRefused);
  });

  test("TEST D — --expected-count=18 (population sur-déclarée) alors que le calcul frais trouve 17 -> REFUSED", () => {
    assert.throws(() => assertTransportA2ImportAllowed(validRequest({ expectedWouldInsertCount: 18, actualWouldInsertCount: EXPECTED_CANDIDATE_COUNT })), TransportA2ImportRefused);
  });

  test("checksum différent ou absent -> REFUSED", () => {
    assert.throws(() => assertTransportA2ImportAllowed(validRequest({ approvalChecksum: "different" })), TransportA2ImportRefused);
    assert.throws(() => assertTransportA2ImportAllowed(validRequest({ approvalChecksum: undefined })), TransportA2ImportRefused);
    assert.throws(() => assertTransportA2ImportAllowed(validRequest({ computedChecksum: "drifted-since-approval" })), TransportA2ImportRefused);
  });

  test("enum MINTRANSPORT absent (migration §3-4 non appliquée/non vérifiée) -> REFUSED, aucun contournement vers OTHER", () => {
    assert.throws(() => assertTransportA2ImportAllowed(validRequest({ mintransportEnumPresent: false })), TransportA2ImportRefused);
  });

  test("clean_approvable_count > 0 -> REFUSED (règle absolue TIER3_ONLY => CLEAN_APPROVABLE FORBIDDEN)", () => {
    assert.throws(() => assertTransportA2ImportAllowed(validRequest({ cleanApprovableCount: 1 })), TransportA2ImportRefused);
    assert.throws(() => assertTransportA2ImportAllowed(validRequest({ cleanApprovableCount: 17 })), TransportA2ImportRefused);
  });

  test("PII persistée détectée -> REFUSED", () => {
    assert.throws(() => assertTransportA2ImportAllowed(validRequest({ piiPersistedCount: 1 })), TransportA2ImportRefused);
  });

  test("identifiant officiel inventé détecté -> REFUSED", () => {
    assert.throws(() => assertTransportA2ImportAllowed(validRequest({ officialIdentifiersInvented: 1 })), TransportA2ImportRefused);
  });

  test("insertion establishment_registry_identifiers prévue pour ce batch -> REFUSED (attendu 0)", () => {
    assert.throws(() => assertTransportA2ImportAllowed(validRequest({ registryIdentifiersToInsert: 1 })), TransportA2ImportRefused);
  });
});

describe("computeTransportA2Checksum", () => {
  test("déterministe : même set, ordre différent -> même checksum", () => {
    const a = computeTransportA2Checksum([
      { candidate_id: "TC-02", normalized_name: "auto ecole francaise", entity_family: "DRIVING_SCHOOL", staging_classification: "DUPLICATE_REVIEW" },
      { candidate_id: "TC-01", normalized_name: "auto ecole astrale", entity_family: "DRIVING_SCHOOL", staging_classification: "SOURCE_REVIEW" },
    ]);
    const b = computeTransportA2Checksum([
      { candidate_id: "TC-01", normalized_name: "auto ecole astrale", entity_family: "DRIVING_SCHOOL", staging_classification: "SOURCE_REVIEW" },
      { candidate_id: "TC-02", normalized_name: "auto ecole francaise", entity_family: "DRIVING_SCHOOL", staging_classification: "DUPLICATE_REVIEW" },
    ]);
    assert.equal(a, b);
  });

  test("un changement de classification change le checksum (même identité, drift détecté)", () => {
    const a = computeTransportA2Checksum([{ candidate_id: "TC-01", normalized_name: "auto ecole astrale", entity_family: "DRIVING_SCHOOL", staging_classification: "SOURCE_REVIEW" }]);
    const b = computeTransportA2Checksum([{ candidate_id: "TC-01", normalized_name: "auto ecole astrale", entity_family: "DRIVING_SCHOOL", staging_classification: "DUPLICATE_REVIEW" }]);
    assert.notEqual(a, b);
  });
});
