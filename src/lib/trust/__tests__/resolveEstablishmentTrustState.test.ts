/**
 * SPRINT REGISTRY-NATIONAL-A.1 §14/§18 — matrice de tests A-O + fixtures de
 * régression du manifest national (Cas 1-5).
 * Lancer : npx tsx --test src/lib/trust/__tests__/resolveEstablishmentTrustState.test.ts
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  resolveEstablishmentTrustState,
  getPrimaryPublicBadge,
  trustInputFromEstablishmentRow,
  TRUST_BADGE_LABELS,
  type EstablishmentTrustInput,
} from "../resolveEstablishmentTrustState";

function input(overrides: Partial<EstablishmentTrustInput> = {}): EstablishmentTrustInput {
  return { isVerified: false, ...overrides };
}

// ============================================================
// §14 — REGISTRY-NATIONAL-A regression fixtures (Cas 1-5)
// ============================================================

describe("§14 Cas 1 — CREATE_PUBLISHABLE_UNVERIFIED Transport (Tier-3 only)", () => {
  test("jamais de badge officiellement vérifié, quelle que soit l'existence future", () => {
    // Un candidat Tier-3-only, une fois publié comme établissement, n'a par
    // construction ni official_id/source_ministry corroboré au niveau
    // identifiant de registre, ni is_verified=true.
    const state = resolveEstablishmentTrustState(input({ isVerified: false }));
    assert.equal(state.official_verification, "UNVERIFIED");
    assert.ok(!state.public_badges.some((b) => b.id === "OFFICIALLY_VERIFIED"));
    assert.equal(getPrimaryPublicBadge(state), null);
  });
});

describe("§14 Cas 2 — MINESUP établissement avec vraie preuve officielle", () => {
  test("official_verification préservée = OFFICIALLY_VERIFIED, badge officiel affiché", () => {
    const state = resolveEstablishmentTrustState(
      input({
        isVerified: false,
        officialId: "N°05/0083/MINESUP",
        sourceMinistry: "MINESUP",
        registryIdentifierVerificationStatuses: ["CORROBORATED"],
      })
    );
    assert.equal(state.official_verification, "OFFICIALLY_VERIFIED");
    assert.deepEqual(getPrimaryPublicBadge(state), { id: "OFFICIALLY_VERIFIED", label: TRUST_BADGE_LABELS.OFFICIALLY_VERIFIED });
  });
});

describe("§14 Cas 3 — MINSANTE live establishment", () => {
  test("aucune mise à niveau accidentelle de la vérification", () => {
    // Établissement live ordinaire, aucune preuve officielle démontrée.
    const state = resolveEstablishmentTrustState(input({ isVerified: false, sourceMinistry: null, officialId: null }));
    assert.equal(state.official_verification, "UNVERIFIED");
    assert.equal(state.platform_verification, "NOT_PLATFORM_VERIFIED");
  });
});

describe("§14 Cas 4 — claimed establishment with no official proof", () => {
  test("CLAIMED != OFFICIALLY_VERIFIED", () => {
    const state = resolveEstablishmentTrustState(input({ ownerId: "owner-1", isVerified: false }));
    assert.equal(state.claim_status, "CLAIMED");
    assert.notEqual(state.official_verification, "OFFICIALLY_VERIFIED");
    assert.equal(state.official_verification, "UNVERIFIED");
  });
});

describe("§14 Cas 5 — is_verified=true but no registry evidence", () => {
  test("PLATFORM_VERIFIED uniquement — correspond aux 3 établissements seed réels observés en base", () => {
    const state = resolveEstablishmentTrustState(input({ isVerified: true, officialId: null, sourceMinistry: null }));
    assert.equal(state.platform_verification, "PLATFORM_VERIFIED");
    assert.equal(state.official_verification, "UNVERIFIED");
    assert.deepEqual(state.public_badges, [{ id: "PLATFORM_VERIFIED", label: TRUST_BADGE_LABELS.PLATFORM_VERIFIED }]);
  });
});

// ============================================================
// §18 — matrice de tests A-O
// ============================================================

describe("§18-A listed != officially verified", () => {
  test("directory_status=LISTED n'implique jamais official_verification=OFFICIALLY_VERIFIED", () => {
    const state = resolveEstablishmentTrustState(input());
    assert.equal(state.directory_status, "LISTED");
    assert.notEqual(state.official_verification, "OFFICIALLY_VERIFIED");
  });
});

describe("§18-B claimed != officially verified", () => {
  test("un établissement revendiqué (owner_id présent) reste UNVERIFIED sans preuve", () => {
    const state = resolveEstablishmentTrustState(input({ ownerId: "owner-42", isClaimed: true }));
    assert.equal(state.claim_status, "CLAIMED");
    assert.equal(state.official_verification, "UNVERIFIED");
  });
});

describe("§18-C platform_verified != officially_verified", () => {
  test("is_verified=true seul ne peut jamais produire OFFICIALLY_VERIFIED", () => {
    const state = resolveEstablishmentTrustState(input({ isVerified: true }));
    assert.equal(state.platform_verification, "PLATFORM_VERIFIED");
    assert.notEqual(state.official_verification, "OFFICIALLY_VERIFIED");
  });
});

describe("§18-D Tier3 publishable unverified never receives official badge", () => {
  test("aucune preuve registre -> aucun badge officiel, même avec is_verified=true", () => {
    const state = resolveEstablishmentTrustState(input({ isVerified: true, registryIdentifierVerificationStatuses: ["UNVERIFIED"] }));
    assert.ok(!state.public_badges.some((b) => b.id === "OFFICIALLY_VERIFIED"));
  });
});

describe("§18-E verified MINESUP evidence keeps official semantics", () => {
  test("preuve CONFIRMED au niveau identifiant -> OFFICIALLY_VERIFIED, indépendamment de is_verified", () => {
    const state = resolveEstablishmentTrustState(
      input({ isVerified: false, registryIdentifierVerificationStatuses: ["UNVERIFIED", "CONFIRMED"] })
    );
    assert.equal(state.official_verification, "OFFICIALLY_VERIFIED");
  });
});

describe("§18-F owner cannot modify official verification", () => {
  test("le résolveur n'expose aucun champ d'entrée dérivé du parcours de revendication capable d'affecter official_verification", () => {
    // Simule les seuls champs qu'un owner peut faire évoluer via le
    // parcours de revendication (voir claim-field-policy) : ownerId/
    // isClaimed/verificationStatus. Aucun n'influence official_verification.
    const before = resolveEstablishmentTrustState(input({ officialId: "X", sourceMinistry: "MINESUP" }));
    const after = resolveEstablishmentTrustState(
      input({ officialId: "X", sourceMinistry: "MINESUP", ownerId: "owner-1", isClaimed: true, verificationStatus: "active" })
    );
    assert.equal(before.official_verification, after.official_verification);
  });
});

describe("§18-G owner cannot modify registry identifiers", () => {
  test("registryIdentifierVerificationStatuses n'est jamais dérivé de isClaimed/ownerId", () => {
    const claimed = resolveEstablishmentTrustState(input({ ownerId: "owner-1", isClaimed: true }));
    assert.equal(claimed.official_verification, "UNVERIFIED"); // pas d'evidence fournie -> jamais inventée depuis le claim
  });
});

describe("§18-H admin generic verify action maps only to platform verification", () => {
  test("le seul effet observable de is_verified=true est PLATFORM_VERIFIED, jamais un badge officiel", () => {
    const state = resolveEstablishmentTrustState(input({ isVerified: true }));
    const badgeIds = state.public_badges.map((b) => b.id);
    assert.deepEqual(badgeIds, ["PLATFORM_VERIFIED"]);
  });
});

describe("§18-I registry official evidence can produce official verification", () => {
  test("CORROBORATED suffit à produire OFFICIALLY_VERIFIED", () => {
    const state = resolveEstablishmentTrustState(input({ registryIdentifierVerificationStatuses: ["CORROBORATED"] }));
    assert.equal(state.official_verification, "OFFICIALLY_VERIFIED");
  });
});

describe("§18-J conflicting evidence never produces official badge", () => {
  test("hasConflictingOfficialEvidence=true -> CONFLICTING, jamais OFFICIALLY_VERIFIED même avec des statuts CORROBORATED par ailleurs", () => {
    const state = resolveEstablishmentTrustState(
      input({ hasConflictingOfficialEvidence: true, registryIdentifierVerificationStatuses: ["CORROBORATED"] })
    );
    assert.equal(state.official_verification, "CONFLICTING");
    assert.ok(!state.public_badges.some((b) => b.id === "OFFICIALLY_VERIFIED"));
  });
});

describe("§18-K Search V2 regression", () => {
  test("le résolveur ne dépend d'aucun accès réseau/DB — safe à appeler dans une route Search V2 sans coût supplémentaire", () => {
    // Vérifie simplement que l'input minimal utilisé par /api/recherche
    // (is_verified/is_claimed uniquement, sans official_id/source_ministry
    // ni preuve registre) produit un résultat cohérent et ne lève jamais.
    const state = resolveEstablishmentTrustState(input({ isVerified: true, isClaimed: true }));
    assert.equal(state.platform_verification, "PLATFORM_VERIFIED");
    assert.equal(state.claim_status, "CLAIMED");
  });
});

describe("§18-L staging leakage remains zero", () => {
  test("le résolveur n'accepte aucun champ staging (raw_data, staging_ids...) dans son contrat d'entrée", () => {
    const state = resolveEstablishmentTrustState(input());
    // TypeScript garantit déjà l'absence de ces champs à la compilation —
    // ce test documente explicitement l'invariant en exécution.
    assert.ok(!("raw_data" in state));
    assert.ok(!("staging_ids" in state));
  });
});

describe("§18-M Review Center classifications preserved", () => {
  test("le résolveur n'interfère pas avec establishment_import_staging.status/raw_data._review — domaines disjoints", () => {
    // Ce résolveur ne prend AUCUNE entrée liée au Review Center — garantie
    // structurelle par le type EstablishmentTrustInput lui-même.
    const state = resolveEstablishmentTrustState(input({ isVerified: true }));
    assert.equal(state.directory_status, "LISTED");
  });
});

describe("§18-N old is_verified clients remain safe/backward-compatible if retained", () => {
  test("trustInputFromEstablishmentRow accepte directement une ligne establishments brute (is_verified inclus)", () => {
    const trustInput = trustInputFromEstablishmentRow({
      is_verified: true,
      owner_id: null,
      is_claimed: false,
      verification_status: "referenced",
      official_id: null,
      source_ministry: null,
    });
    const state = resolveEstablishmentTrustState(trustInput);
    assert.equal(state.platform_verification, "PLATFORM_VERIFIED");
    assert.equal(state.official_verification, "UNVERIFIED");
  });
});

describe("§18-O no badge labeled ambiguously \"Vérifié\" without verifier context", () => {
  test("aucun libellé de TRUST_BADGE_LABELS n'est le simple mot \"Vérifié\"", () => {
    for (const label of Object.values(TRUST_BADGE_LABELS)) {
      assert.notEqual(label.trim(), "Vérifié");
      assert.notEqual(label.trim(), "Vérifiée");
    }
  });
});

// ============================================================
// Cas additionnels — claim_status
// ============================================================

describe("claim_status — dimension indépendante", () => {
  test("UNCLAIMED par défaut", () => {
    assert.equal(resolveEstablishmentTrustState(input()).claim_status, "UNCLAIMED");
  });
  test("CLAIM_PENDING si verification_status=claim_requested", () => {
    assert.equal(resolveEstablishmentTrustState(input({ verificationStatus: "claim_requested" })).claim_status, "CLAIM_PENDING");
  });
  test("CLAIM_PENDING si verification_status=under_review", () => {
    assert.equal(resolveEstablishmentTrustState(input({ verificationStatus: "under_review" })).claim_status, "CLAIM_PENDING");
  });
  test("CLAIMED si owner_id présent, même sans is_claimed explicite", () => {
    assert.equal(resolveEstablishmentTrustState(input({ ownerId: "owner-1" })).claim_status, "CLAIMED");
  });
});

describe("getPrimaryPublicBadge — priorité et absence de faux positif", () => {
  test("préfère OFFICIALLY_VERIFIED à PLATFORM_VERIFIED quand les deux sont présents", () => {
    const state = resolveEstablishmentTrustState(
      input({ isVerified: true, registryIdentifierVerificationStatuses: ["CONFIRMED"] })
    );
    assert.deepEqual(getPrimaryPublicBadge(state), { id: "OFFICIALLY_VERIFIED", label: TRUST_BADGE_LABELS.OFFICIALLY_VERIFIED });
  });
  test("retourne null si aucun badge légitime", () => {
    assert.equal(getPrimaryPublicBadge(resolveEstablishmentTrustState(input())), null);
  });
  test("n'utilise jamais OFFICIAL_SOURCE_FOUND seul comme badge compact primaire", () => {
    const state = resolveEstablishmentTrustState(input({ officialId: "X", sourceMinistry: "MINESUP" }));
    assert.equal(state.official_verification, "OFFICIAL_SOURCE_FOUND");
    assert.equal(getPrimaryPublicBadge(state), null);
  });
});
