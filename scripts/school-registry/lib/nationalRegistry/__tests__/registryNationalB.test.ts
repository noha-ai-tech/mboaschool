import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { computeRegistryNationalApprovalChecksum, type RegistryNationalApprovalChecksumRow } from "../registryNationalPublicationGuard";
import { evaluateNationalPublicationReadiness } from "../publicationPolicy";
import { slugDryRun } from "../slugDryRun";
import { scanCandidateForPii } from "../piiAudit";
import { auditCategory } from "../categoryAudit";

/**
 * SPRINT REGISTRY-NATIONAL-B §31 — matrice de tests A-S restante (au-delà
 * de ce que publicationPolicy.test.ts / resolveEstablishmentTrustState.
 * test.ts / registryNationalPublicationGuard.test.ts couvrent déjà).
 *
 * Une partie de ces tests relit le snapshot d'approbation VERSIONNÉ
 * (`reports/registry/registry-national-b-approval.json`, produit par
 * registry-national-b-build.ts) comme donnée de référence — déterministe,
 * aucun réseau, aucune base de données. Si ce fichier est absent (repo
 * cloné avant la génération), ces tests sont sautés proprement plutôt que
 * fabriqués/faussement verts.
 */

const REPORTS_DIR = join(process.cwd(), "reports", "registry");
const APPROVAL_PATH = join(REPORTS_DIR, "registry-national-b-approval.json");
const DRY_RUN_PATH = join(REPORTS_DIR, "registry-national-b-dry-run.json");
const DEFERRED_PROTECTION_PATH = join(REPORTS_DIR, "registry-national-b-deferred-protection.json");
const snapshotAvailable = existsSync(APPROVAL_PATH);

function toChecksumRows(candidates: any[]): RegistryNationalApprovalChecksumRow[] {
  return candidates.map((r) => ({
    national_candidate_id: r.national_candidate_id,
    name: r.name,
    slug: r.slug,
    main_category: r.main_category ?? "",
    sub_category: r.sub_category,
    education_family: r.education_family,
    city: r.city,
    region: r.region,
    source_ministries: r.source_ministries.join("|"),
    source_url: r.source_url ?? "",
    presence_confidence: r.presence_confidence,
    identity_confidence: r.identity_confidence,
    official_verification: r.official_verification,
    publication_readiness: r.publication_readiness,
  }));
}

describe("§31-A/B — snapshot & checksum déterministes (relecture du fichier réel versionné)", { skip: !snapshotAvailable }, () => {
  test("checksum stocké == recalculé depuis le contenu relu du disque", () => {
    const snapshot = JSON.parse(readFileSync(APPROVAL_PATH, "utf-8"));
    const recomputed = computeRegistryNationalApprovalChecksum(toChecksumRows(snapshot.candidates));
    assert.equal(snapshot.checksum_sha256, recomputed);
  });

  test("relire deux fois et recalculer produit le même checksum (déterminisme total)", () => {
    const first = JSON.parse(readFileSync(APPROVAL_PATH, "utf-8"));
    const second = JSON.parse(readFileSync(APPROVAL_PATH, "utf-8"));
    assert.equal(computeRegistryNationalApprovalChecksum(toChecksumRows(first.candidates)), computeRegistryNationalApprovalChecksum(toChecksumRows(second.candidates)));
  });

  test("candidate_count correspond exactement à la longueur du tableau candidates", () => {
    const snapshot = JSON.parse(readFileSync(APPROVAL_PATH, "utf-8"));
    assert.equal(snapshot.candidate_count, snapshot.candidates.length);
  });
});

describe("§31-C — séparation verified/unverified jamais mélangée", { skip: !snapshotAvailable }, () => {
  test("create_officially_verified_count + create_publishable_unverified_count == candidate_count, aucun chevauchement", () => {
    const snapshot = JSON.parse(readFileSync(APPROVAL_PATH, "utf-8"));
    assert.equal(snapshot.create_officially_verified_count + snapshot.create_publishable_unverified_count, snapshot.candidate_count);
    const officiallyVerified = snapshot.candidates.filter((c: any) => c.publication_readiness === "CREATE_OFFICIALLY_VERIFIED");
    const publishableUnverified = snapshot.candidates.filter((c: any) => c.publication_readiness === "CREATE_PUBLISHABLE_UNVERIFIED");
    assert.equal(officiallyVerified.length, snapshot.create_officially_verified_count);
    assert.equal(publishableUnverified.length, snapshot.create_publishable_unverified_count);
    assert.equal(officiallyVerified.length + publishableUnverified.length, snapshot.candidates.length);
  });

  test("0 vérifié est un résultat acceptable — n'est jamais forcé à un autre chiffre", () => {
    // Ne fait AUCUNE hypothèse sur la valeur — vérifie seulement que le champ existe et est un entier >= 0.
    const snapshot = JSON.parse(readFileSync(APPROVAL_PATH, "utf-8"));
    assert.ok(Number.isInteger(snapshot.create_officially_verified_count) && snapshot.create_officially_verified_count >= 0);
  });
});

describe("§31-D — Tier-3-only ne reçoit jamais OFFICIALLY_VERIFIED (snapshot réel)", { skip: !snapshotAvailable }, () => {
  test("aucun candidat MINTRANSPORT-only du snapshot n'est CREATE_OFFICIALLY_VERIFIED", () => {
    const snapshot = JSON.parse(readFileSync(APPROVAL_PATH, "utf-8"));
    const mintransportOnly = snapshot.candidates.filter((c: any) => c.source_ministries.length === 1 && c.source_ministries[0] === "MINTRANSPORT");
    for (const c of mintransportOnly) {
      assert.notEqual(c.publication_readiness, "CREATE_OFFICIALLY_VERIFIED");
    }
  });
});

describe("§31-E/F — is_verified défaut FALSE / owner_id défaut NULL pour tout le lot", { skip: !snapshotAvailable }, () => {
  test("100% des candidats du snapshot ont is_verified=false et owner_id=null", () => {
    const snapshot = JSON.parse(readFileSync(APPROVAL_PATH, "utf-8"));
    for (const c of snapshot.candidates) {
      assert.equal(c.is_verified, false, `${c.national_candidate_id} devrait avoir is_verified=false`);
      assert.equal(c.owner_id, null, `${c.national_candidate_id} devrait avoir owner_id=null`);
      assert.equal(c.official_id, null, `${c.national_candidate_id} ne doit jamais avoir un official_id inventé`);
    }
  });
});

describe("§31-N — provenance préservée pour chaque candidat du lot final", { skip: !snapshotAvailable }, () => {
  test("chaque candidat conserve au moins une source_ministry et une source_url ou un source_reference non vide", () => {
    const snapshot = JSON.parse(readFileSync(APPROVAL_PATH, "utf-8"));
    for (const c of snapshot.candidates) {
      assert.ok(Array.isArray(c.source_ministries) && c.source_ministries.length > 0, `${c.national_candidate_id} doit avoir au moins une source_ministry`);
      assert.ok(c.source_url || c.source_reference, `${c.national_candidate_id} doit avoir une provenance traçable (source_url ou source_reference)`);
    }
  });
});

describe("§31-Q — dry-run insert-only (would_update=0, would_delete=0)", { skip: !existsSync(DRY_RUN_PATH) }, () => {
  test("le dry-run réel produit exactement would_update=0 et would_delete=0", () => {
    const dryRun = JSON.parse(readFileSync(DRY_RUN_PATH, "utf-8"));
    assert.equal(dryRun.would_update, 0);
    assert.equal(dryRun.would_delete, 0);
    assert.equal(dryRun.would_insert_registry_identifiers, 0);
    assert.equal(dryRun.insert_only_invariant_holds, true);
  });

  test("expected_establishments_after == establishments_before + would_insert_establishments", () => {
    const dryRun = JSON.parse(readFileSync(DRY_RUN_PATH, "utf-8"));
    assert.equal(dryRun.expected_establishments_after, dryRun.establishments_before + dryRun.would_insert_establishments);
  });
});

describe("§31-P — candidats différés absents du snapshot (recoupement avec le rapport de protection réel)", { skip: !snapshotAvailable || !existsSync(DEFERRED_PROTECTION_PATH) }, () => {
  test("leaked_into_final_snapshot est vide et protection_verified=true", () => {
    const protection = JSON.parse(readFileSync(DEFERRED_PROTECTION_PATH, "utf-8"));
    assert.deepEqual(protection.leaked_into_final_snapshot, []);
    assert.equal(protection.protection_verified, true);
  });
});

// ============================================================
// Tests purs (sans dépendance à un rapport généré) — fonctions déjà
// utilisées par le build B, exercées ici avec des cas synthétiques G/H/I/J/K/L/M.
// ============================================================

describe("§31-G — doublon bloqué (STRONG_MATCH -> DUPLICATE_REVIEW, jamais CREATE_*)", () => {
  test("un candidat avec matchingDecision=STRONG_MATCH ne peut jamais atteindre CREATE_*", () => {
    const result = evaluateNationalPublicationReadiness({
      hasNonEmptyNormalizedName: true,
      presenceConfidence: "SINGLE_SOURCE",
      identityConfidence: "RESOLVED",
      officialVerification: "UNVERIFIED",
      matchingDecision: "STRONG_MATCH",
      alreadyLive: false,
      duplicateUnresolved: true,
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
    });
    assert.equal(result.readiness, "DUPLICATE_REVIEW");
  });
});

describe("§31-H — déjà live bloqué (jamais une nouvelle création)", () => {
  test("alreadyLive=true -> ALREADY_LIVE quel que soit le reste", () => {
    const result = evaluateNationalPublicationReadiness({
      hasNonEmptyNormalizedName: true,
      presenceConfidence: "STRONG_DOCUMENTARY",
      identityConfidence: "RESOLVED",
      officialVerification: "OFFICIALLY_VERIFIED",
      matchingDecision: "EXACT_IDENTIFIER",
      alreadyLive: true,
      duplicateUnresolved: false,
      matchingAmbiguous: false,
      crossMinistryUnresolved: false,
      crossMinistryConflict: false,
      hasReasonableLocation: true,
      hasTraceableProvenance: true,
      provenanceComplete: true,
      piiDetected: false,
      categoryCompatible: true,
      officialProofDemonstrated: true,
      tier3Only: false,
    });
    assert.equal(result.readiness, "ALREADY_LIVE");
  });
});

describe("§31-I — identité non résolue bloquée", () => {
  test("identityConfidence=UNRESOLVED -> IDENTITY_REVIEW, jamais CREATE_*", () => {
    const result = evaluateNationalPublicationReadiness({
      hasNonEmptyNormalizedName: true,
      presenceConfidence: "SINGLE_SOURCE",
      identityConfidence: "UNRESOLVED",
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
    });
    assert.equal(result.readiness, "IDENTITY_REVIEW");
  });
});

describe("§31-J — catégorie non résolue bloquée (pas de migration taxonomy)", () => {
  test("categoryCompatible=false -> CATEGORY_REVIEW", () => {
    const cat = auditCategory({ mainCategory: "categorie-inventee", educationFamily: null });
    assert.equal(cat.compatible, false);
    const result = evaluateNationalPublicationReadiness({
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
      categoryCompatible: cat.compatible,
      officialProofDemonstrated: false,
      tier3Only: false,
    });
    assert.equal(result.readiness, "CATEGORY_REVIEW");
  });
});

describe("§31-K — PII bloque toute publication", () => {
  test("un nom contenant un pattern PII est détecté, et piiDetected=true bloque toute CREATE_*", () => {
    const scan = scanCandidateForPii({ name: "Institut Sample", extraText: ["Nom du promoteur: Jean Dupont"] });
    assert.equal(scan.piiDetected, true);
    const result = evaluateNationalPublicationReadiness({
      hasNonEmptyNormalizedName: true,
      presenceConfidence: "STRONG_DOCUMENTARY",
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
      piiDetected: scan.piiDetected,
      categoryCompatible: true,
      officialProofDemonstrated: false,
      tier3Only: false,
    });
    assert.notEqual(result.readiness, "CREATE_OFFICIALLY_VERIFIED");
    assert.notEqual(result.readiness, "CREATE_PUBLISHABLE_UNVERIFIED");
  });
});

describe("§31-L — collision de slug bloque le candidat concerné uniquement", () => {
  test("collision live -> valid=false pour ce candidat, les autres restent valides", () => {
    const results = slugDryRun(
      [
        { candidateId: "NAT-1", name: "Institut Existant" },
        { candidateId: "NAT-2", name: "Institut Nouveau" },
      ],
      new Set(["institut-existant"])
    );
    const r1 = results.find((r) => r.candidateId === "NAT-1")!;
    const r2 = results.find((r) => r.candidateId === "NAT-2")!;
    assert.equal(r1.valid, false);
    assert.equal(r1.existingCollision, true);
    assert.equal(r2.valid, true);
  });

  test("collision intra-lot -> les deux candidats bloqués, jamais un écrasement silencieux", () => {
    const results = slugDryRun(
      [
        { candidateId: "NAT-1", name: "Même Nom École" },
        { candidateId: "NAT-2", name: "Même Nom École" },
      ],
      new Set()
    );
    assert.ok(results.every((r) => !r.valid));
  });
});

describe("§31-M — cross-ministry SAME_INSTITUTION bloque la création dupliquée", () => {
  test("un CREATE_* avec crossMinistryConflict=true est CONFLICT_REVIEW, jamais publié deux fois", () => {
    const result = evaluateNationalPublicationReadiness({
      hasNonEmptyNormalizedName: true,
      presenceConfidence: "SINGLE_SOURCE",
      identityConfidence: "RESOLVED",
      officialVerification: "UNVERIFIED",
      matchingDecision: "NO_MATCH",
      alreadyLive: false,
      duplicateUnresolved: false,
      matchingAmbiguous: false,
      crossMinistryUnresolved: false,
      crossMinistryConflict: true,
      hasReasonableLocation: true,
      hasTraceableProvenance: true,
      provenanceComplete: true,
      piiDetected: false,
      categoryCompatible: true,
      officialProofDemonstrated: false,
      tier3Only: false,
    });
    assert.equal(result.readiness, "CONFLICT_REVIEW");
  });
});
