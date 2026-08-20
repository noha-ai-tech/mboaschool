import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { registryReviewClassification, extractPrograms, type ReviewableStagingRow } from "../registryReview";

/**
 * SPRINT MINSANTE-C §23 — tests de régression de l'adaptateur de
 * classification Review Center. Fixtures minimales requises par la spec :
 * MINESEC clean, MINESEC duplicate, MINESUP clean, MINSANTE clean,
 * MINSANTE category review, MINSANTE duplicate review, promoted row —
 * plus quelques fixtures additionnelles (identity review, cross-ministry,
 * ministère inconnu/futur, extraction des programmes).
 *
 * Lancer : npx tsx --test src/lib/__tests__/registryReview.test.ts
 */

function row(overrides: Partial<ReviewableStagingRow>): ReviewableStagingRow {
  return { status: "normalized", source_ministry: "MINESEC", raw_data: {}, ...overrides };
}

describe("MINESEC — comportement existant préservé (§23)", () => {
  test("nouveau candidat propre, localité valide -> CLEAN_APPROVABLE", () => {
    const r = row({
      status: "ready",
      source_ministry: "MINESEC",
      raw_data: {
        _matchAudit: { matchType: "NEW_CANDIDATE", matchReason: "aucune correspondance", confidence: "none" },
        _localityAudit: { rawLocality: "Akwa", localityStatus: "VALID" },
      },
    });
    assert.equal(registryReviewClassification(r), "CLEAN_APPROVABLE");
  });

  test("correspondance officielle exacte (matricule) -> DUPLICATE_REVIEW", () => {
    const r = row({
      status: "duplicate_exact",
      source_ministry: "MINESEC",
      raw_data: {
        _matchAudit: { matchType: "EXISTING_OFFICIAL_ID", matchReason: "matricule identique", confidence: "certain" },
        _localityAudit: { rawLocality: "Akwa", localityStatus: "VALID" },
      },
    });
    assert.equal(registryReviewClassification(r), "DUPLICATE_REVIEW");
  });

  test("correspondance ambiguë (REVIEW_REQUIRED) -> IDENTITY_REVIEW", () => {
    const r = row({
      status: "duplicate_review",
      source_ministry: "MINESEC",
      raw_data: {
        _matchAudit: { matchType: "REVIEW_REQUIRED", matchReason: "nom proche, région concordante, localité non vérifiable", confidence: "low" },
        _localityAudit: { rawLocality: null, localityStatus: "MISSING" },
      },
    });
    assert.equal(registryReviewClassification(r), "IDENTITY_REVIEW");
  });

  test("localité clairement invalide -> SOURCE_REVIEW", () => {
    const r = row({
      status: "ready",
      source_ministry: "MINESEC",
      raw_data: {
        _matchAudit: { matchType: "NEW_CANDIDATE", matchReason: "aucune correspondance", confidence: "none" },
        _localityAudit: { rawLocality: "???", localityStatus: "CLEARLY_INVALID" },
      },
    });
    assert.equal(registryReviewClassification(r), "SOURCE_REVIEW");
  });
});

describe("MINESUP — filet générique status-only, comportement actuel préservé (§23)", () => {
  test("ligne prête (status='ready'), aucune métadonnée riche -> CLEAN_APPROVABLE", () => {
    // Reproduit fidèlement minesup-pilot-v1-collect.ts : raw_data = n.raw
    // tel quel, jamais de _matchAudit/classification — seul `status` existe.
    const r = row({ status: "ready", source_ministry: "MINESUP", raw_data: { source_record_id: "abc", parser_version: "minesup-pilot@1" } });
    assert.equal(registryReviewClassification(r), "CLEAN_APPROVABLE");
  });

  test("ligne en doublon (status='duplicate_review') -> DUPLICATE_REVIEW", () => {
    const r = row({ status: "duplicate_review", source_ministry: "MINESUP", raw_data: { source_record_id: "abc" } });
    assert.equal(registryReviewClassification(r), "DUPLICATE_REVIEW");
  });
});

describe("MINSANTE — correction du bug MINSANTE-B (§19-20)", () => {
  test("classification CLEAN_APPROVABLE -> CLEAN_APPROVABLE", () => {
    const r = row({
      status: "ready",
      source_ministry: "MINSANTE",
      raw_data: { classification: "CLEAN_APPROVABLE", category_decision: "HEALTH_TRAINING_HIGHER_ED" },
    });
    assert.equal(registryReviewClassification(r), "CLEAN_APPROVABLE");
  });

  test("classification CATEGORY_REVIEW -> CATEGORY_REVIEW (jamais 'Nouveaux candidats' générique)", () => {
    const r = row({
      status: "normalized",
      source_ministry: "MINSANTE",
      raw_data: { classification: "CATEGORY_REVIEW", category_decision: "CATEGORY_REVIEW" },
    });
    assert.equal(registryReviewClassification(r), "CATEGORY_REVIEW");
  });

  test("classification DUPLICATE_REVIEW -> DUPLICATE_REVIEW (jamais 'Nouveaux candidats' générique)", () => {
    const r = row({
      status: "duplicate_review",
      source_ministry: "MINSANTE",
      raw_data: { classification: "DUPLICATE_REVIEW", review_reason: "DEDUP_AMBIGUITY_UNRESOLVED" },
    });
    assert.equal(registryReviewClassification(r), "DUPLICATE_REVIEW");
  });

  test("classification IDENTITY_REVIEW -> IDENTITY_REVIEW", () => {
    const r = row({
      status: "duplicate_review",
      source_ministry: "MINSANTE",
      raw_data: { classification: "IDENTITY_REVIEW", match_audit: { live: { level: "AMBIGUOUS" }, staging: { level: "NO_MATCH" } } },
    });
    assert.equal(registryReviewClassification(r), "IDENTITY_REVIEW");
  });

  test("cross_ministry_review.decision='SAME_INSTITUTION_CROSS_MINISTRY' -> CROSS_MINISTRY_REVIEW, prime sur la classification héritée", () => {
    const r = row({
      status: "normalized",
      source_ministry: "MINSANTE",
      raw_data: {
        classification: "CLEAN_APPROVABLE", // valeur potentiellement obsolète — le signal frontière prime toujours (§12)
        cross_ministry_review: { decision: "SAME_INSTITUTION_CROSS_MINISTRY", matchLevel: "EXACT_IDENTITY" },
      },
    });
    assert.equal(registryReviewClassification(r), "CROSS_MINISTRY_REVIEW");
  });

  test("ligne pré-reclassification sans `classification` (batch antérieur) -> repli sur match_audit, jamais un statut deviné", () => {
    const r = row({
      status: "normalized",
      source_ministry: "MINSANTE",
      raw_data: { match_audit: { live: { level: "PROBABLE_MATCH" }, staging: { level: "NO_MATCH" } } },
    });
    assert.equal(registryReviewClassification(r), "DUPLICATE_REVIEW");
  });
});

describe("Ligne promue (§23, tout ministère)", () => {
  test("status='promoted' -> PROMOTED, quel que soit le ministère ou les autres signaux", () => {
    const rMinesante = row({ status: "promoted", source_ministry: "MINSANTE", raw_data: { classification: "CATEGORY_REVIEW" } });
    const rMinesec = row({ status: "promoted", source_ministry: "MINESEC", raw_data: { _matchAudit: { matchType: "REVIEW_REQUIRED" } } });
    assert.equal(registryReviewClassification(rMinesante), "PROMOTED");
    assert.equal(registryReviewClassification(rMinesec), "PROMOTED");
  });
});

describe("Ministère futur/inconnu — filet générique, jamais de crash ni de if-chain dédié requis (§20)", () => {
  test("ministère jamais vu, status='ready' -> CLEAN_APPROVABLE via le filet générique", () => {
    const r = row({ status: "ready", source_ministry: "MINADER", raw_data: {} });
    assert.equal(registryReviewClassification(r), "CLEAN_APPROVABLE");
  });

  test("ministère jamais vu, status='pending' -> OTHER_REVIEW, jamais présumé propre", () => {
    const r = row({ status: "pending", source_ministry: "MINEPIA", raw_data: {} });
    assert.equal(registryReviewClassification(r), "OTHER_REVIEW");
  });
});

describe("extractPrograms — affichage minimal des programmes (§21)", () => {
  test("MINSANTE — programs_normalized présent -> liste exacte", () => {
    const r = row({ source_ministry: "MINSANTE", raw_data: { programs_normalized: ["Infirmiers", "Analyses Médicales"] } });
    assert.deepEqual(extractPrograms(r), ["Infirmiers", "Analyses Médicales"]);
  });

  test("MINSANTE — repli sur programs_raw si programs_normalized absent", () => {
    const r = row({ source_ministry: "MINSANTE", raw_data: { programs_raw: ["Infirmiers"] } });
    assert.deepEqual(extractPrograms(r), ["Infirmiers"]);
  });

  test("ministère sans champ programme structuré -> tableau vide, jamais inventé", () => {
    const r = row({ source_ministry: "MINESEC", raw_data: {} });
    assert.deepEqual(extractPrograms(r), []);
  });
});
