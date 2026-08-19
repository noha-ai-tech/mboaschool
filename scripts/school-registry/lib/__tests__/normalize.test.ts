import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { classifyEducationFamily, computeFingerprint, inferOwnership, normalizeRecord } from "../normalize";
import type { RawSourceRecord } from "../../types";

/**
 * SPRINT MINESUP-C — première suite de tests pour lib/normalize.ts,
 * déclenchée par un bug réel trouvé pendant le pilote : `ownership`
 * restait `null` pour les 32 candidats MINESUP (IPES + University of
 * Bamenda) malgré un signal source non ambigu (liste IPES vs liste
 * Universités d'Etat), parce que `inferOwnership()` ne reconnaissait que
 * les indices textuels "fondateur"/"promoteur" (façon MINESEC), jamais une
 * valeur déjà classifiée transmise directement par un autre adaptateur.
 */

function minesupRecord(overrides: Partial<RawSourceRecord> = {}): RawSourceRecord {
  return {
    sourceMinistry: "MINESUP",
    sourceUrl: "https://www.minesup.gov.cm/?page_id=1234",
    sourceYear: null,
    officialIdentifier: null,
    nameRaw: "Institut Supérieur de Test",
    region: "Nord-Ouest",
    department: null,
    arrondissement: null,
    commune: null,
    locality: null,
    city: null,
    quarter: null,
    subsystemRaw: null,
    educationFamilyHint: "Institut Privé d'Enseignement Supérieur (IPES)",
    ownershipHint: "private",
    raw: {},
    ...overrides,
  };
}

describe("classifyEducationFamily — MINESUP", () => {
  test("sourceMinistry=MINESUP -> higher_education, quel que soit le nom", () => {
    assert.equal(classifyEducationFamily(minesupRecord({ nameRaw: "Baptist Institute of Higher Learning" })), "higher_education");
    assert.equal(classifyEducationFamily(minesupRecord({ nameRaw: "University of Bamenda" })), "higher_education");
  });
});

describe("inferOwnership — valeur déjà classifiée transmise directement (bug réel MINESUP-C)", () => {
  test('ownershipHint="private" (liste IPES) -> "private", même sans le mot "fondateur"/"promoteur" dans le nom', () => {
    assert.equal(inferOwnership(minesupRecord({ nameRaw: "Baptist Institute of Higher Learning", ownershipHint: "private" })), "private");
  });
  test('ownershipHint="public" (liste Universités d\'Etat) -> "public"', () => {
    assert.equal(inferOwnership(minesupRecord({ nameRaw: "University of Bamenda", ownershipHint: "public" })), "public");
  });
  test("le comportement existant (indice textuel fondateur/promoteur, ex. MINESEC) n'est pas affecté par l'ajout", () => {
    assert.equal(inferOwnership(minesupRecord({ sourceMinistry: "MINESEC", nameRaw: "Ecole Privee Laique de Test", ownershipHint: "fondateur: M. X" })), "private");
  });
  test("un ownershipHint qui n'est ni une valeur exacte ni un indice connu -> null, jamais deviné", () => {
    assert.equal(inferOwnership(minesupRecord({ nameRaw: "Institut Sans Indice Clair", ownershipHint: "texte non reconnu" })), null);
  });
});

describe("computeFingerprint — MINESUP sans officialIdentifier unique (identifiants doubles conservés ailleurs)", () => {
  test("officialIdentifier=null -> repli name+geo, jamais un crash ni une valeur devinée", () => {
    const fp = computeFingerprint(minesupRecord({ nameRaw: "Institut Supérieur de Test", region: "Nord-Ouest" }), "institut superieur de test");
    assert.match(fp, /^name\+geo:/);
    assert.match(fp, /nord-ouest/);
  });
  test("deux candidats de noms différents dans la même région produisent des fingerprints différents", () => {
    const fp1 = computeFingerprint(minesupRecord({ nameRaw: "Institut A" }), "institut a");
    const fp2 = computeFingerprint(minesupRecord({ nameRaw: "Institut B" }), "institut b");
    assert.notEqual(fp1, fp2);
  });
});

describe("normalizeRecord — pipeline complet sur un candidat MINESUP réel (Bamenda University Institute of Science and Technology)", () => {
  test("produit un enregistrement normalisé cohérent, statut normalized (jamais rejected pour un candidat valide)", () => {
    const record = minesupRecord({
      nameRaw: "Bamenda University Institute of Science and Technology (BUIST)",
      region: "Nord-Ouest",
      ownershipHint: "private",
    });
    const result = normalizeRecord(record);
    assert.equal(result.status, "normalized");
    assert.equal(result.educationFamily, "higher_education");
    assert.equal(result.ownership, "private");
    assert.equal(result.region, "Nord-Ouest");
    assert.equal(result.rejectionReason, null);
  });

  test("un candidat sans aucune localisation exploitable est rejeté (jamais silencieusement accepté)", () => {
    const record = minesupRecord({ nameRaw: "Institut Sans Localisation", region: null, department: null, arrondissement: null, commune: null, locality: null });
    const result = normalizeRecord(record);
    assert.equal(result.status, "rejected");
    assert.match(result.rejectionReason ?? "", /localisation/);
  });
});
