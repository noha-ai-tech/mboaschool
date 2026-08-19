import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { classifyMinesecOfficialId, ESG_EXPECTED_LENGTH } from "../registryBackfill";

/**
 * SPRINT REGISTRY-MULTI-B §23 — tests backfill : invalid identifier
 * (longueur atypique), secondary identifier (source_ministry non reconnu).
 * Idempotence/collision/same-text-different-type sont couvertes par les
 * fixtures A-G de scripts/school-registry/lib/matching/__tests__/matching.test.ts
 * (identiques dans les deux cas : `establishment_registry_identifiers`
 * partage la même contrainte que le moteur de matching applicatif) et par
 * la vérification empirique contre la vraie contrainte DB
 * (reports/registry/registry-multi-b-migration-result.json).
 */

describe("classifyMinesecOfficialId — invalid identifier (longueur atypique)", () => {
  test("longueur conforme (17) -> VALID, MINESEC_ESG/OFFICIAL_ID", () => {
    const result = classifyMinesecOfficialId("5EM1GSFD112245109", "MINESEC");
    assert.equal(result.status, "VALID");
    if (result.status === "VALID") {
      assert.equal(result.registry, "MINESEC_ESG");
      assert.equal(result.identifierType, "OFFICIAL_ID");
    }
  });

  test("les 3 identifiants atypiques réels (REGISTRY-MULTI-A) restent REVIEW_REQUIRED", () => {
    const cases: Array<[string, number]> = [
      ["5ME1GSFD100552107A", 18], // CES de LINDOI
      ["7CMGSFD102683114", 16], // CES de NINONG
      ["6IEGSBD102697114", 16], // CES Bilingue de NTENAKO
    ];
    for (const [id, expectedLength] of cases) {
      assert.equal(id.length, expectedLength, `fixture elle-même incohérente pour ${id}`);
      const result = classifyMinesecOfficialId(id, "MINESEC");
      assert.equal(result.status, "REVIEW_REQUIRED");
      if (result.status === "REVIEW_REQUIRED") assert.match(result.reason, /longueur inattendue/);
    }
  });

  test(`longueur strictement égale à ${ESG_EXPECTED_LENGTH} exigée — un caractère de trop ou de moins bascule en REVIEW_REQUIRED`, () => {
    const tooShort = "A".repeat(ESG_EXPECTED_LENGTH - 1);
    const tooLong = "A".repeat(ESG_EXPECTED_LENGTH + 1);
    assert.equal(classifyMinesecOfficialId(tooShort, "MINESEC").status, "REVIEW_REQUIRED");
    assert.equal(classifyMinesecOfficialId(tooLong, "MINESEC").status, "REVIEW_REQUIRED");
  });
});

describe("classifyMinesecOfficialId — secondary identifier (source_ministry non reconnu, jamais deviné)", () => {
  test("source_ministry='OTHER' avec un official_id présent -> REVIEW_REQUIRED, jamais un registre inventé", () => {
    const result = classifyMinesecOfficialId("5EM1GSFD112245109", "OTHER");
    assert.equal(result.status, "REVIEW_REQUIRED");
    if (result.status === "REVIEW_REQUIRED") assert.match(result.reason, /source_ministry="OTHER"/);
  });

  test("source_ministry=null -> REVIEW_REQUIRED, jamais un crash", () => {
    const result = classifyMinesecOfficialId("5EM1GSFD112245109", null);
    assert.equal(result.status, "REVIEW_REQUIRED");
  });
});
