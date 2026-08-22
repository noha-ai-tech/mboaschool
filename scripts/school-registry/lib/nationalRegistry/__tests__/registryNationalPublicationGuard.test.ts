import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  assertRegistryNationalPublicationAllowed,
  RegistryNationalPublicationRefused,
  REGISTRY_NATIONAL_B_CONFIRM_PHRASE,
  EXPECTED_PROJECT_REF,
  computeRegistryNationalApprovalChecksum,
  type RegistryNationalApprovalChecksumRow,
} from "../registryNationalPublicationGuard";

/**
 * SPRINT REGISTRY-NATIONAL-B §25 — 11 scénarios de refus (A-L, "I" étant
 * réservé aux lettres du brief : A,B,C,D,E,F,G,H,I,J,K,L = 12 lettres, dont
 * 11 scénarios de refus distincts listés — chaque test ci-dessous couvre
 * exactement une lettre du brief). AUCUN de ces tests n'appelle jamais
 * Supabase — assertRegistryNationalPublicationAllowed() est une fonction
 * pure, 0 écriture DB possible depuis ce fichier.
 */

const SAMPLE_ROWS: RegistryNationalApprovalChecksumRow[] = [
  {
    national_candidate_id: "NAT-STG-001",
    name: "Institut Sample",
    slug: "institut-sample",
    main_category: "superieur",
    sub_category: null,
    education_family: "higher_education",
    city: "Douala",
    region: "Littoral",
    source_ministries: "MINESUP",
    source_url: "https://minesup.gov.cm/sample",
    presence_confidence: "SINGLE_SOURCE",
    identity_confidence: "RESOLVED",
    official_verification: "UNVERIFIED",
    publication_readiness: "CREATE_PUBLISHABLE_UNVERIFIED",
  },
];
const SAMPLE_CHECKSUM = computeRegistryNationalApprovalChecksum(SAMPLE_ROWS);

function validRequest(overrides: Partial<Parameters<typeof assertRegistryNationalPublicationAllowed>[0]> = {}) {
  return {
    commit: true,
    confirmPhrase: REGISTRY_NATIONAL_B_CONFIRM_PHRASE,
    projectRef: EXPECTED_PROJECT_REF,
    operator: "ndjm2020-pixel",
    approvedBy: "Eddy",
    expectedCandidateCount: 1,
    actualCandidateCount: 1,
    approvalChecksum: SAMPLE_CHECKSUM,
    recomputedChecksum: SAMPLE_CHECKSUM,
    storedSnapshotChecksum: SAMPLE_CHECKSUM,
    freshAlreadyLiveCount: 0,
    freshDuplicateSignalCount: 0,
    freshMissingRequiredFieldCount: 0,
    freshTier3OfficiallyVerifiedCount: 0,
    freshPiiDetectedCount: 0,
    registryIdentifiersToInsert: 0,
    ...overrides,
  };
}

describe("assertRegistryNationalPublicationAllowed — SPRINT REGISTRY-NATIONAL-B, garde-fou dédié publication nationale (jamais invoqué avec des flags valides ce sprint)", () => {
  test("un jeu de flags entièrement valide passe sans lever", () => {
    assert.doesNotThrow(() => assertRegistryNationalPublicationAllowed(validRequest()));
  });

  test("A — sans --commit -> REFUSED (dry-run par défaut, 0 écriture)", () => {
    assert.throws(() => assertRegistryNationalPublicationAllowed(validRequest({ commit: false })), RegistryNationalPublicationRefused);
  });

  test("B — mauvais project ref -> REFUSED", () => {
    assert.throws(() => assertRegistryNationalPublicationAllowed(validRequest({ projectRef: "wrong-project-ref" })), RegistryNationalPublicationRefused);
  });

  test("C — mauvais nombre de candidats (population dérivée depuis l'approbation) -> REFUSED", () => {
    assert.throws(() => assertRegistryNationalPublicationAllowed(validRequest({ actualCandidateCount: 2 })), RegistryNationalPublicationRefused);
    assert.throws(() => assertRegistryNationalPublicationAllowed(validRequest({ expectedCandidateCount: undefined })), RegistryNationalPublicationRefused);
  });

  test("D — mauvais checksum -> REFUSED", () => {
    assert.throws(() => assertRegistryNationalPublicationAllowed(validRequest({ approvalChecksum: "deadbeef".repeat(8) })), RegistryNationalPublicationRefused);
    assert.throws(() => assertRegistryNationalPublicationAllowed(validRequest({ approvalChecksum: undefined })), RegistryNationalPublicationRefused);
  });

  test("E — mauvaise phrase de confirmation (ex. celle de TRANSPORT-A.2-T3/MINSANTE-G) -> REFUSED, jamais interchangeable", () => {
    assert.throws(() => assertRegistryNationalPublicationAllowed(validRequest({ confirmPhrase: "IMPORT_TRANSPORT_TIER3_TO_STAGING" })), RegistryNationalPublicationRefused);
    assert.throws(() => assertRegistryNationalPublicationAllowed(validRequest({ confirmPhrase: "PROMOTE_REGISTRY_TO_PRODUCTION" })), RegistryNationalPublicationRefused);
    assert.throws(() => assertRegistryNationalPublicationAllowed(validRequest({ confirmPhrase: undefined })), RegistryNationalPublicationRefused);
  });

  test("F — opérateur manquant -> REFUSED", () => {
    assert.throws(() => assertRegistryNationalPublicationAllowed(validRequest({ operator: undefined })), RegistryNationalPublicationRefused);
    assert.throws(() => assertRegistryNationalPublicationAllowed(validRequest({ operator: "" })), RegistryNationalPublicationRefused);
  });

  test("G — approved-by manquant -> REFUSED", () => {
    assert.throws(() => assertRegistryNationalPublicationAllowed(validRequest({ approvedBy: undefined })), RegistryNationalPublicationRefused);
    assert.throws(() => assertRegistryNationalPublicationAllowed(validRequest({ approvedBy: "   " })), RegistryNationalPublicationRefused);
  });

  test("H — operator === approved-by (auto-approbation, insensible à la casse) -> REFUSED", () => {
    assert.throws(() => assertRegistryNationalPublicationAllowed(validRequest({ approvedBy: "ndjm2020-pixel" })), RegistryNationalPublicationRefused);
    assert.throws(() => assertRegistryNationalPublicationAllowed(validRequest({ approvedBy: "NDJM2020-PIXEL" })), RegistryNationalPublicationRefused);
  });

  test("I — dérive de snapshot (checksum stocké dans le fichier != recalculé) -> REFUSED", () => {
    assert.throws(() => assertRegistryNationalPublicationAllowed(validRequest({ storedSnapshotChecksum: "modified-after-approval-checksum" })), RegistryNationalPublicationRefused);
  });

  test("J — un candidat approuvé est devenu déjà-live depuis l'approbation -> REFUSED", () => {
    assert.throws(() => assertRegistryNationalPublicationAllowed(validRequest({ freshAlreadyLiveCount: 1 })), RegistryNationalPublicationRefused);
  });

  test("K — un candidat approuvé a gagné un signal de doublon depuis l'approbation -> REFUSED", () => {
    assert.throws(() => assertRegistryNationalPublicationAllowed(validRequest({ freshDuplicateSignalCount: 1 })), RegistryNationalPublicationRefused);
  });

  test("L — un candidat approuvé a perdu un champ requis (name/slug/main_category) -> REFUSED", () => {
    assert.throws(() => assertRegistryNationalPublicationAllowed(validRequest({ freshMissingRequiredFieldCount: 1 })), RegistryNationalPublicationRefused);
  });

  test("invariants absolus supplémentaires — Tier-3-only OFFICIALLY_VERIFIED détecté -> REFUSED", () => {
    assert.throws(() => assertRegistryNationalPublicationAllowed(validRequest({ freshTier3OfficiallyVerifiedCount: 1 })), RegistryNationalPublicationRefused);
  });

  test("invariants absolus supplémentaires — PII détectée dans le lot prêt -> REFUSED", () => {
    assert.throws(() => assertRegistryNationalPublicationAllowed(validRequest({ freshPiiDetectedCount: 1 })), RegistryNationalPublicationRefused);
  });

  test("invariants absolus supplémentaires — écriture registry_identifiers non nulle -> REFUSED (§27 : 0 identifiant écrit par ce garde-fou)", () => {
    assert.throws(() => assertRegistryNationalPublicationAllowed(validRequest({ registryIdentifiersToInsert: 1 })), RegistryNationalPublicationRefused);
  });

  test("chaque refus lève une RegistryNationalPublicationRefused distincte de TransportA2ImportRefused (jamais interchangeable)", () => {
    try {
      assertRegistryNationalPublicationAllowed(validRequest({ commit: false }));
      assert.fail("devrait avoir levé");
    } catch (e) {
      assert.ok(e instanceof RegistryNationalPublicationRefused);
      assert.notEqual((e as Error).constructor.name, "TransportA2ImportRefused");
    }
  });
});

describe("computeRegistryNationalApprovalChecksum — déterminisme (SPRINT REGISTRY-NATIONAL-B §22)", () => {
  test("même contenu, ordre différent -> même checksum (tri interne stable)", () => {
    const reversed = SAMPLE_ROWS.slice().reverse();
    assert.equal(computeRegistryNationalApprovalChecksum(SAMPLE_ROWS), computeRegistryNationalApprovalChecksum(reversed));
  });

  test("un seul caractère différent -> checksum différent", () => {
    const mutated = SAMPLE_ROWS.map((r) => ({ ...r, name: r.name + "x" }));
    assert.notEqual(computeRegistryNationalApprovalChecksum(SAMPLE_ROWS), computeRegistryNationalApprovalChecksum(mutated));
  });

  test("deux appels successifs sur les mêmes données -> checksum identique", () => {
    assert.equal(computeRegistryNationalApprovalChecksum(SAMPLE_ROWS), computeRegistryNationalApprovalChecksum(SAMPLE_ROWS));
  });
});
