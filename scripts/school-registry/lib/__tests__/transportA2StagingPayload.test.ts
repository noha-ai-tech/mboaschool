import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { buildStagingInsertPayload, planStagingInsert, fingerprintFor, type StagingPayloadInput } from "../transportA2StagingPayload";

function baseInput(overrides: Partial<StagingPayloadInput> = {}): StagingPayloadInput {
  return {
    candidate_id: "TC-01",
    name: "AUTO ECOLE ASTRALE",
    normalized_name: "auto ecole astrale",
    entity_family: "DRIVING_SCHOOL",
    entity_family_note: null,
    city: "Yaoundé",
    region: "Centre",
    sources: [{ source_id: "S04", domain: "africannuaire.com", tier3_class: "T3-D", verified_this_sprint: true }],
    source_count: 1,
    independent_source_count: 1,
    source_independence: "N/A (single source)",
    tier3_confidence: "T3_SINGLE_SOURCE",
    tier3_confidence_note: null,
    matching_decision: "NO_MATCH",
    matching_reason_live: "no live match",
    matching_reason_staging: "no staging match",
    cross_ministry_decision: "NEW",
    cross_ministry_note: null,
    activity_status: "ACTIVITY_UNKNOWN",
    official_corroboration_status: "NOT_SEARCHED",
    staging_classification: "SOURCE_REVIEW",
    classification_reason: "no signal",
    taxonomy: { main_category: "autres", sub_category: "Auto-École", education_family: "other", education_family_uncertain: false },
    provenance: { source_url_present: true, source_url: "https://africannuaire.com/x", sha256_present: true, sha256: "abc123", provenance_complete: true, provenance_note: "ok" },
    presence_confidence: "SINGLE_SOURCE",
    identity_confidence: "RESOLVED",
    official_verification: "UNVERIFIED",
    publication_readiness: "REVIEW_REQUIRED",
    cross_ministry_evidence: [],
    batch_checksum: "batch-checksum-abc",
    approval_checksum: "4ab50d786abdb6107da2650b23c973b76f4bf60ea1784988a905903c00639ce7",
    ...overrides,
  };
}

describe("buildStagingInsertPayload — construction pure (brief §8 contrat de payload complet)", () => {
  test("source_ministry est toujours MINTRANSPORT, official_identifier toujours null", () => {
    const row = buildStagingInsertPayload(baseInput());
    assert.equal(row.source_ministry, "MINTRANSPORT");
    assert.equal(row.official_identifier, null);
  });

  test("fingerprint déterministe candidate_id-based, stable entre deux constructions identiques", () => {
    const a = buildStagingInsertPayload(baseInput());
    const b = buildStagingInsertPayload(baseInput());
    assert.equal(a.fingerprint, b.fingerprint);
    assert.equal(a.fingerprint, fingerprintFor("TC-01"));
  });

  test("raw_data.transport_tier3 conserve les trois dimensions de confiance + publication_readiness + provenance + batch/approval checksum", () => {
    const row = buildStagingInsertPayload(baseInput());
    const t3 = row.raw_data.transport_tier3 as Record<string, unknown>;
    assert.equal(t3.presence_confidence, "SINGLE_SOURCE");
    assert.equal(t3.identity_confidence, "RESOLVED");
    assert.equal(t3.official_verification, "UNVERIFIED");
    assert.equal(t3.publication_readiness, "REVIEW_REQUIRED");
    assert.equal(t3.batch_checksum, "batch-checksum-abc");
    assert.equal(t3.approval_checksum, "4ab50d786abdb6107da2650b23c973b76f4bf60ea1784988a905903c00639ce7");
    assert.ok(t3.provenance);
    assert.ok(Array.isArray(t3.sources));
  });

  test("TEST O — Fleet Management Academy : identifiant MINEFOP conservé UNIQUEMENT en cross_ministry_evidence, jamais en official_identifier, jamais réécrit sous MINTRANSPORT", () => {
    const row = buildStagingInsertPayload(
      baseInput({
        candidate_id: "TC-17",
        name: "Fleet Management Academy",
        normalized_name: "fleet management academy",
        entity_family: "TRANSPORT_LOGISTICS_TRAINING",
        matching_decision: "AMBIGUOUS",
        identity_confidence: "CONFLICTING",
        staging_classification: "IDENTITY_REVIEW",
        cross_ministry_evidence: [
          {
            authority: "MINEFOP",
            identifier_type: "agrement",
            identifier_value: "N°000471",
            identifier_authority: "MINEFOP",
            note: "Identifiant MINEFOP réel confirmé par TRANSPORT-A — chevauchement inter-ministériel documenté, jamais recopié comme preuve MINT.",
          },
        ],
      })
    );
    assert.equal(row.official_identifier, null);
    assert.equal(row.source_ministry, "MINTRANSPORT");
    const t3 = row.raw_data.transport_tier3 as { cross_ministry_evidence: { identifier_authority: string }[] };
    assert.equal(t3.cross_ministry_evidence.length, 1);
    assert.equal(t3.cross_ministry_evidence[0].identifier_authority, "MINEFOP");
    assert.notEqual(t3.cross_ministry_evidence[0].identifier_authority, "MINTRANSPORT");
  });

  test("TEST M/O renforcé — si un appelant tente de faire passer un identifiant sous identifier_authority MINTRANSPORT ou MINT, la construction ÉCHOUE (fail-closed, pas un simple avertissement)", () => {
    assert.throws(() =>
      buildStagingInsertPayload(
        baseInput({
          cross_ministry_evidence: [{ authority: "MINEFOP", identifier_type: "agrement", identifier_value: "N°000471", identifier_authority: "MINTRANSPORT", note: "bug" }],
        })
      )
    );
    assert.throws(() =>
      buildStagingInsertPayload(
        baseInput({
          cross_ministry_evidence: [{ authority: "MINEFOP", identifier_type: "agrement", identifier_value: "N°000471", identifier_authority: "MINT", note: "bug" }],
        })
      )
    );
  });

  test("status = duplicate_review si staging_classification = DUPLICATE_REVIEW, ready sinon", () => {
    assert.equal(buildStagingInsertPayload(baseInput({ staging_classification: "DUPLICATE_REVIEW" })).status, "duplicate_review");
    assert.equal(buildStagingInsertPayload(baseInput({ staging_classification: "SOURCE_REVIEW" })).status, "ready");
    assert.equal(buildStagingInsertPayload(baseInput({ staging_classification: "IDENTITY_REVIEW" })).status, "ready");
  });
});

describe("planStagingInsert — idempotence PURE, sans DB (brief §12-13)", () => {
  const rows17 = Array.from({ length: 17 }, (_, i) => buildStagingInsertPayload(baseInput({ candidate_id: `TC-${String(i + 1).padStart(2, "0")}` })));

  test("premier passage, staging vide -> toutes les lignes seraient insérées", () => {
    const plan = planStagingInsert(rows17, new Set());
    assert.equal(plan.toInsert.length, 17);
    assert.equal(plan.skippedAlreadyStaging.length, 0);
  });

  test("TEST K — un candidat déjà en staging (fingerprint connu) -> pas de doublon inséré pour lui", () => {
    const existing = new Set([fingerprintFor("TC-05")]);
    const plan = planStagingInsert(rows17, existing);
    assert.equal(plan.toInsert.length, 16);
    assert.equal(plan.skippedAlreadyStaging.length, 1);
    assert.equal(plan.skippedAlreadyStaging[0].candidate_id, "TC-05");
  });

  test("TEST T — second passage théorique (tous les fingerprints déjà en staging) -> 0 insertion", () => {
    const allFingerprints = new Set(rows17.map((r) => r.fingerprint));
    const plan = planStagingInsert(rows17, allFingerprints);
    assert.equal(plan.toInsert.length, 0);
    assert.equal(plan.skippedAlreadyStaging.length, 17);
  });

  test("TEST J — candidat déjà live n'est jamais dans le batch de lignes à planifier (filtré en amont, ALREADY_LIVE_REVIEW) : simulé ici en ne le passant simplement pas à planStagingInsert", () => {
    // ALREADY_LIVE_REVIEW candidates are excluded from `preparedRows` upstream
    // (transport-a2-t3-write-preflight.ts, same convention as transport-a2-t3-prepare.ts
    // §12: `.filter((c) => c.classification !== "ALREADY_LIVE_REVIEW")`). Here we assert
    // the downstream idempotence function has no way to "revive" an excluded candidate.
    const rowsWithoutTC03 = rows17.filter((r) => r.fingerprint !== fingerprintFor("TC-03"));
    const plan = planStagingInsert(rowsWithoutTC03, new Set());
    assert.equal(plan.toInsert.some((r) => r.fingerprint === fingerprintFor("TC-03")), false);
    assert.equal(plan.toInsert.length, 16);
  });
});

describe("TEST L — provenance manquante (brief §14-L)", () => {
  test("provenance_complete=false (ex. sha256 absent) se propage fidèlement dans raw_data — jamais fabriquée à true, mais la ligne reste construisible si un source_url existe", () => {
    const row = buildStagingInsertPayload(
      baseInput({
        provenance: { source_url_present: true, source_url: "https://africannuaire.com/resultat/?infos=Auto-écoles&ville=Cameroun", sha256_present: false, sha256: null, provenance_complete: false, provenance_note: "domain-level listing page, no dedicated sha256" },
        publication_readiness: "REVIEW_REQUIRED",
      })
    );
    const t3 = row.raw_data.transport_tier3 as { provenance: { provenance_complete: boolean; sha256: string | null } };
    assert.equal(t3.provenance.provenance_complete, false);
    assert.equal(t3.provenance.sha256, null);
    assert.equal((row.raw_data.transport_tier3 as { publication_readiness: string }).publication_readiness, "REVIEW_REQUIRED");
  });

  test("TEST L (contrainte dure) — aucun source_url du tout -> la construction ÉCHOUE explicitement (jamais un NULL/placeholder inséré, contrainte NOT NULL migration 0006)", () => {
    assert.throws(() =>
      buildStagingInsertPayload(
        baseInput({
          provenance: { source_url_present: false, source_url: null, sha256_present: false, sha256: null, provenance_complete: false, provenance_note: "no manifest entry found" },
        })
      )
    );
  });
});
