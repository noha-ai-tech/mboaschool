import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { isEligibleForApprovedPopulation } from "../approvedPopulationFilter";

/**
 * SPRINT MINESUP-F §17 — régression prouvant qu'un candidat DUPLICATE_REVIEW
 * (190 nationaux), SOURCE_REVIEW (20), ou INVALID (11) ne peut structurellement
 * jamais entrer dans le lot de promotion approuvé, même si son nom "a l'air
 * propre" — seule status='ready' qualifie.
 */
describe("isEligibleForApprovedPopulation — protection de la population approuvée", () => {
  test("status='ready' (CLEAN_APPROVABLE) -> éligible", () => {
    assert.equal(isEligibleForApprovedPopulation("ready"), true);
  });

  test("aucun autre statut n'est éligible, même s'il correspond à un nom d'établissement plausible", () => {
    const nonEligible: Array<Parameters<typeof isEligibleForApprovedPopulation>[0]> = [
      "pending", "normalized", "duplicate_exact", "duplicate_review", "rejected", "promoted",
    ];
    for (const status of nonEligible) {
      assert.equal(isEligibleForApprovedPopulation(status), false, `status="${status}" ne doit jamais être éligible`);
    }
  });

  test("un candidat DUPLICATE_REVIEW (mappé status='duplicate_review') reste exclu même s'il ressemble à un candidat propre", () => {
    // Cas réel : 190 candidats nationaux MINESUP-E sont DUPLICATE_REVIEW malgré
    // des noms d'institution parfaitement normaux — jamais promouvables sans
    // passer explicitement par une revue humaine qui change leur statut.
    assert.equal(isEligibleForApprovedPopulation("duplicate_review"), false);
  });

  test("un candidat déjà promu (status='promoted') n'est jamais re-proposé pour une nouvelle promotion", () => {
    assert.equal(isEligibleForApprovedPopulation("promoted"), false);
  });
});
