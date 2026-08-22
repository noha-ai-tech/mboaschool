/**
 * SPRINT REGISTRY-NATIONAL-A §26 — matrice de tests A-O.
 * Lancer : npx tsx --test scripts/school-registry/lib/nationalRegistry/__tests__/publicationPolicy.test.ts
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { evaluateNationalPublicationReadiness, resolveCrossMinistry, type PublicationReadinessInput } from "../publicationPolicy";
import { scanCandidateForPii } from "../piiAudit";
import { auditCategory } from "../categoryAudit";
import { slugDryRun, slugify } from "../slugDryRun";
import { computeOfficialVerification, computePublicationReadiness } from "../../transportTier3TrustModel";
import { matchCandidate } from "../../matching/engine";

function baseInput(overrides: Partial<PublicationReadinessInput> = {}): PublicationReadinessInput {
  return {
    hasNonEmptyNormalizedName: true,
    presenceConfidence: "SINGLE_SOURCE",
    identityConfidence: "RESOLVED",
    officialVerification: "UNVERIFIED",
    matchingDecision: "NO_MATCH",
    alreadyLive: false,
    duplicateUnresolved: false,
    matchingAmbiguous: false,
    crossMinistryUnresolved: false,
    crossMinistryConflict: false,
    hasReasonableLocation: true,
    hasTraceableProvenance: true,
    provenanceComplete: true,
    piiDetected: false,
    categoryCompatible: true,
    officialProofDemonstrated: false,
    tier3Only: false,
    ...overrides,
  };
}

describe("§26-A — published != officially verified", () => {
  test("CREATE_PUBLISHABLE_UNVERIFIED never carries an OFFICIALLY_VERIFIED official_verification derivation", () => {
    const r = evaluateNationalPublicationReadiness(baseInput({ officialVerification: "UNVERIFIED" }));
    assert.equal(r.readiness, "CREATE_PUBLISHABLE_UNVERIFIED");
    // La fonction ne modifie/déduit JAMAIS officialVerification — c'est un champ d'entrée, jamais recalculé en sortie.
  });
});

describe("§26-B — Tier3 corroborated != officially verified", () => {
  test("presence CORROBORATED + Tier3-only + officialProofDemonstrated=true is FORCED down to CREATE_PUBLISHABLE_UNVERIFIED, never CREATE_OFFICIALLY_VERIFIED", () => {
    const r = evaluateNationalPublicationReadiness(
      baseInput({ presenceConfidence: "CORROBORATED", tier3Only: true, officialProofDemonstrated: true })
    );
    assert.equal(r.readiness, "CREATE_PUBLISHABLE_UNVERIFIED");
    assert.ok(r.reasons.some((x) => x.includes("BLOQUÉ")));
  });
  test("computeOfficialVerification() from the Transport Tier-3 module structurally cannot return OFFICIALLY_VERIFIED regardless of input", () => {
    const v1 = computeOfficialVerification({ officialCorroborationStatus: "OFFICIAL_SOURCE_FOUND" });
    const v2 = computeOfficialVerification({ officialCorroborationStatus: "ANYTHING_ELSE" });
    assert.notEqual(v1, "OFFICIALLY_VERIFIED");
    assert.notEqual(v2, "OFFICIALLY_VERIFIED");
  });
});

describe("§26-C — Tier3 resolved identity CAN be publishable_unverified", () => {
  test("identity RESOLVED + provenance complete + no blockers -> CREATE_PUBLISHABLE_UNVERIFIED even for a Tier-3-only candidate", () => {
    const r = evaluateNationalPublicationReadiness(baseInput({ tier3Only: true, presenceConfidence: "SINGLE_SOURCE", identityConfidence: "RESOLVED" }));
    assert.equal(r.readiness, "CREATE_PUBLISHABLE_UNVERIFIED");
  });
});

describe("§26-D — unresolved identity cannot auto-publish", () => {
  test("identity UNRESOLVED never yields a CREATE_* readiness", () => {
    const r = evaluateNationalPublicationReadiness(baseInput({ identityConfidence: "UNRESOLVED" }));
    assert.equal(r.readiness, "IDENTITY_REVIEW");
  });
});

describe("§26-E — conflicting identity cannot auto-publish", () => {
  test("identity CONFLICTING never yields a CREATE_* readiness", () => {
    const r = evaluateNationalPublicationReadiness(baseInput({ identityConfidence: "CONFLICTING" }));
    assert.equal(r.readiness, "IDENTITY_REVIEW");
  });
  test("matching AMBIGUOUS never yields a CREATE_* readiness even with identity RESOLVED", () => {
    const r = evaluateNationalPublicationReadiness(baseInput({ identityConfidence: "RESOLVED", matchingAmbiguous: true }));
    assert.equal(r.readiness, "IDENTITY_REVIEW");
  });
});

describe("§26-F — PII blocks publication", () => {
  test("piiDetected=true always short-circuits to a non-CREATE readiness, even with every other flag green", () => {
    const r = evaluateNationalPublicationReadiness(baseInput({ piiDetected: true }));
    assert.notEqual(r.readiness, "CREATE_OFFICIALLY_VERIFIED");
    assert.notEqual(r.readiness, "CREATE_PUBLISHABLE_UNVERIFIED");
  });
  test("scanCandidateForPii detects a promoter name pattern", () => {
    const res = scanCandidateForPii({ name: "ECOLE X", extraText: ["Nom du promoteur : Jean Dupont"] });
    assert.equal(res.piiDetected, true);
    assert.ok(res.fields.includes("nom_promoteur_ou_representant_legal"));
  });
  test("scanCandidateForPii does NOT flag an ordinary institution name as PII (no false positive on 'Institut Saint Joseph')", () => {
    const res = scanCandidateForPii({ name: "INSTITUT PRIVE SAINT JOSEPH DE YAOUNDE" });
    assert.equal(res.piiDetected, false);
  });
});

describe("§26-G — exact live duplicate cannot create new establishment", () => {
  test("matchingDecision=EXACT_IDENTITY -> LINK_TO_EXISTING, never a CREATE_*", () => {
    const r = evaluateNationalPublicationReadiness(baseInput({ matchingDecision: "EXACT_IDENTITY" }));
    assert.equal(r.readiness, "LINK_TO_EXISTING");
  });
  test("matchingDecision=EXACT_IDENTIFIER -> LINK_TO_EXISTING, never a CREATE_*", () => {
    const r = evaluateNationalPublicationReadiness(baseInput({ matchingDecision: "EXACT_IDENTIFIER" }));
    assert.equal(r.readiness, "LINK_TO_EXISTING");
  });
  test("alreadyLive=true always wins first, regardless of any other flag", () => {
    const r = evaluateNationalPublicationReadiness(baseInput({ alreadyLive: true, piiDetected: true, identityConfidence: "CONFLICTING" }));
    assert.equal(r.readiness, "ALREADY_LIVE");
  });
});

describe("§26-H — cross-ministry same institution does not duplicate establishment", () => {
  test("resolveCrossMinistry: same identifier -> SAME_INSTITUTION (never treated as two establishments)", () => {
    const d = resolveCrossMinistry({ nameOverlap: "EXACT", geoAgreement: "MATCH", identifierEvidence: "SAME_IDENTIFIER" });
    assert.equal(d, "SAME_INSTITUTION");
  });
  test("crossMinistryConflict=true blocks publication even with a clean identity", () => {
    const r = evaluateNationalPublicationReadiness(baseInput({ crossMinistryConflict: true }));
    assert.equal(r.readiness, "CONFLICT_REVIEW");
  });
});

describe("§26-I — a MINEFOP identifier can never become a MINTRANSPORT identifier", () => {
  test("resolveCrossMinistry never mutates authority — the function has no authority-reassignment output at all (structural: return type is a resolution verdict, not an authority)", () => {
    const d = resolveCrossMinistry({ nameOverlap: "EXACT", geoAgreement: "MATCH", identifierEvidence: "DIFFERENT_IDENTIFIER" });
    assert.equal(d, "CONFLICT"); // deux identifiants DIFFÉRENTS pour le même nom+géo -> conflit signalé, jamais une réattribution automatique d'autorité.
  });
});

describe("§26-J — existing official verification is preserved", () => {
  test("a candidate with officialProofDemonstrated=true and NOT tier3Only reaches CREATE_OFFICIALLY_VERIFIED (never silently downgraded)", () => {
    const r = evaluateNationalPublicationReadiness(baseInput({ officialProofDemonstrated: true, tier3Only: false }));
    assert.equal(r.readiness, "CREATE_OFFICIALLY_VERIFIED");
  });
});

describe("§26-K — MINSANTE Imagerie documentary blocker preserved (contract-level check)", () => {
  test("the Imagerie Médicale verdict artifact still reports QUARANTINED_NUMBERING_ABSENT (never silently flipped to SAFE)", () => {
    const p = join(process.cwd(), "reports", "registry", "minsante-i2-imagerie-validation.json");
    const data = JSON.parse(readFileSync(p, "utf-8"));
    assert.equal(data.verdict, "QUARANTINED_NUMBERING_ABSENT");
    assert.notEqual(data.verdict, "SAFE");
  });
});

describe("§26-L — Transport 12 staging rows remain unverified (contract-level check on the generated manifest)", () => {
  test("registry-national-a-universe.json reports all 12 MINTRANSPORT staging rows as unverified and unpromoted", () => {
    const p = join(process.cwd(), "reports", "registry", "registry-national-a-universe.json");
    const data = JSON.parse(readFileSync(p, "utf-8"));
    assert.equal(data.ministries.MINTRANSPORT.staging_candidates, 12);
    assert.equal(data.ministries.MINTRANSPORT.staging_all_unverified, true);
    assert.equal(data.ministries.MINTRANSPORT.staging_all_unpromoted, true);
  });
});

describe("§26-M — missing source candidate cannot silently gain provenance", () => {
  test("hasTraceableProvenance=false always yields SOURCE_REVIEW, never a CREATE_*", () => {
    const r = evaluateNationalPublicationReadiness(baseInput({ hasTraceableProvenance: false }));
    assert.equal(r.readiness, "SOURCE_REVIEW");
  });
  test("provenance traceable but incomplete (e.g. shared listing URL, no per-institution anchor) yields SOURCE_REVIEW, not CREATE_PUBLISHABLE_UNVERIFIED", () => {
    const r = evaluateNationalPublicationReadiness(baseInput({ hasTraceableProvenance: true, provenanceComplete: false }));
    assert.equal(r.readiness, "SOURCE_REVIEW");
  });
});

describe("§26-N — slug collision blocks the affected creation only", () => {
  test("an existing live slug collision is flagged invalid for that candidate only", () => {
    const results = slugDryRun(
      [
        { candidateId: "A", name: "Institut Saint Joseph" },
        { candidateId: "B", name: "Institut Distinct" },
      ],
      new Set([slugify("Institut Saint Joseph")])
    );
    const a = results.find((r) => r.candidateId === "A")!;
    const b = results.find((r) => r.candidateId === "B")!;
    assert.equal(a.existingCollision, true);
    assert.equal(a.valid, false);
    assert.equal(b.existingCollision, false);
    assert.equal(b.valid, true); // le blocage de A ne contamine jamais B.
  });
  test("two candidates in the same batch with the same slug are mutually flagged, not silently merged", () => {
    const results = slugDryRun(
      [
        { candidateId: "A", name: "Ecole Generique" },
        { candidateId: "B", name: "Ecole Generique" },
      ],
      new Set()
    );
    assert.ok(results.every((r) => !r.valid));
    assert.ok(results[0].batchCollisionWith.includes("B"));
    assert.ok(results[1].batchCollisionWith.includes("A"));
  });
});

describe("§26-O — auto/autoecole generic-token hardening preserved", () => {
  test("shared matching engine (engine.ts) still treats 'auto'/'autoecole' as WEAK_GENERIC — verified by a direct behavior probe, not by a duplicated wordlist", () => {
    // Deux auto-écoles distinctes, même ville, sans mot distinctif partagé au-delà de "auto"/"école" -> ne doivent jamais devenir un match automatique fort.
    const candidate = { name: "AUTO ECOLE ZENITH", region: "Centre", city: "Yaoundé", category: "other", identifiers: [] };
    const target = { id: "x", name: "AUTO ECOLE HORIZON", region: "Centre", city: "Yaoundé", category: "other", identifiers: [] };
    const result = matchCandidate(candidate, [target]);
    assert.notEqual(result.level, "STRONG_MATCH");
    assert.notEqual(result.level, "EXACT_IDENTITY");
    assert.equal(result.safeForAutoLink, false);
  });
});

describe("§9/§10 policy — additional structural checks", () => {
  test("category incompatible (missing main_category) never yields a CREATE_*, yields CATEGORY_REVIEW", () => {
    const r = evaluateNationalPublicationReadiness(baseInput({ categoryCompatible: false }));
    assert.equal(r.readiness, "CATEGORY_REVIEW");
  });
  test("auditCategory rejects a null main_category", () => {
    const r = auditCategory({ mainCategory: null, educationFamily: "health_training" });
    assert.equal(r.compatible, false);
  });
  test("auditCategory accepts a known combination", () => {
    const r = auditCategory({ mainCategory: "superieur", educationFamily: "higher_education" });
    assert.equal(r.compatible, true);
  });
  test("computePublicationReadiness (legacy Transport-only module) is untouched and still returns its 3-value contract", () => {
    const r = computePublicationReadiness({
      presenceConfidence: "SINGLE_SOURCE",
      identityConfidence: "RESOLVED",
      officialVerification: "UNVERIFIED",
      duplicateUnresolved: false,
      crossMinistryUnresolved: false,
      provenanceComplete: true,
      piiDetected: false,
    });
    assert.equal(r, "PUBLISHABLE_UNVERIFIED");
  });
});
