import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { matchCandidate, fuzzyWords, geoAgreement } from "../engine";
import type { MatchCandidate, MatchTarget } from "../types";

/**
 * SPRINT MINSANTE-G.1 §7 — 6 scénarios de régression obligatoires (A-F),
 * couvrant les corrections apportées ce sprint à `lib/matching/engine.ts` :
 *  - stopwords "infirmier(s)/infirmière(s)", "fondation", "sanitaires" (pluriel oublié) ;
 *  - `geoAgreement` (city en priorité sur region, NULL/NULL jamais un accord positif) ;
 *  - exclusion des tokens de localité déjà capturés par city/region du calcul
 *    de chevauchement flou (double-comptage) ;
 *  - exclusion des cibles en conflit géographique du pool de désambiguïsation
 *    AMBIGUOUS (tie-break).
 *
 * Fixtures = noms réels du pilote MINSANTE (batch minsante-pilot-v1, source
 * MINSANTE officielle), aucune donnée personnelle.
 *
 * Lancer : npx tsx --test scripts/school-registry/lib/matching/__tests__/matching-minsante-g1.test.ts
 */

function target(overrides: Partial<MatchTarget> & { id: string; name: string }): MatchTarget {
  return { region: null, city: null, category: null, identifiers: [], ...overrides };
}
function candidate(overrides: Partial<MatchCandidate> & { name: string }): MatchCandidate {
  return { region: null, city: null, category: null, identifiers: [], ...overrides };
}

describe("§7.A — deux écoles d'infirmiers DISTINCTES, même région, ne deviennent jamais PROBABLE via le seul vocabulaire santé générique", () => {
  test("ECOLE DES INFIRMIERS DIPLOMES D'ETAT DE FOUMBAN vs INSTITUT ... EN SOINS INFIRMIERS MOULLEC DE BALEVENG -> NO_MATCH (villes différentes, aucun nom propre partagé)", () => {
    // Cas réel MINSANTE-G (staging_id ba827d94-6542-40fd-b811-a0d964a8bceb vs
    // 27a2a636-eced-4971-8f62-67d8d1028ab3) : AVANT ce sprint, PROBABLE_MATCH
    // à 25% via le seul mot "infirmiers". Deux institutions réelles et
    // distinctes (villes différentes, aucun fondateur/sigle commun).
    const t = target({ id: "baleveng-1", name: "Institut Tropical de Formation en Plaies Chroniques et en Soins Infirmiers \"Moullec\" de Baleveng", region: "Ouest", city: "BALEVENG", category: "health_training" });
    const c = candidate({ name: "Ecole des Infirmiers Diplomes d'Etat de Foumban", region: "Ouest", city: "FOUMBAN", category: "health_training" });
    const result = matchCandidate(c, [t]);
    assert.equal(result.level, "NO_MATCH");
    assert.notEqual(result.level, "PROBABLE_MATCH");
    assert.notEqual(result.level, "STRONG_MATCH");
    assert.notEqual(result.level, "AMBIGUOUS");
  });

  test('"infirmier(s)/infirmière(s)" ne laisse aucun résidu significatif isolé, comme "santé"/"sanitaire" avant lui', () => {
    assert.deepEqual(fuzzyWords("Ecole des Infirmiers Diplomes d'Etat"), ["diplomes", "etat"].sort());
  });
});

describe("§7.B — vraie variante de la même école contenant 'infirmiers' -> les mots distinctifs du nom l'identifient toujours", () => {
  test("un sigle/fondateur partagé produit toujours STRONG_MATCH malgré le retrait de 'infirmiers'", () => {
    const t = target({ id: "t1", name: "Ecole des Infirmiers Diplomes d'Etat Fondation Kamga de Bafoussam", region: "Ouest", city: "BAFOUSSAM", category: "health_training" });
    const c = candidate({ name: "Ecole des Infirmiers Diplomes Fondation Kamga de Bafoussam", region: "Ouest", city: "BAFOUSSAM", category: "health_training" });
    const result = matchCandidate(c, [t]);
    assert.equal(result.level, "STRONG_MATCH");
    assert.equal(result.safeForAutoLink, false);
  });
});

describe("§7.C — même région + city NULL des deux côtés -> jamais un accord géographique fort, seulement UNKNOWN", () => {
  test("geoAgreement retourne UNKNOWN quand city ET region sont NULL des deux côtés (jamais MATCH)", () => {
    assert.equal(geoAgreement(null, null, null, null), "UNKNOWN");
  });

  test("geoAgreement retourne MATCH sur la région SEULEMENT quand city est inconnue des deux côtés (repli explicite, pas un cas NULL/NULL)", () => {
    assert.equal(geoAgreement("Ouest", null, "Ouest", null), "MATCH");
  });

  test("un accord de région (city NULL des 2 côtés) ne suffit PAS à départager deux cibles à égalité de chevauchement — reste AMBIGUOUS, jamais un choix arbitraire", () => {
    const t1 = target({ id: "t1", name: "Institut des Sciences Medico-Sanitaires Alpha de Bandjoun", region: "Ouest", city: null, category: "health_training" });
    const t2 = target({ id: "t2", name: "Institut des Sciences de la Sante Beta de Bafoussam", region: "Ouest", city: null, category: "health_training" });
    const c = candidate({ name: "Ecole Privee des Sciences de la Sante Gamma de Bamena", region: "Ouest", city: null, category: "health_training" });
    const result = matchCandidate(c, [t1, t2]);
    // "sciences" seul chevauche les deux à égalité -> AMBIGUOUS légitime, PAS
    // un EXACT_IDENTITY/STRONG_MATCH fabriqué depuis un simple accord de région.
    assert.equal(result.level, "AMBIGUOUS");
  });
});

describe("§7.D — villes explicites DIFFÉRENTES -> signal négatif fort, jamais une cible gagnante face à une cible non-conflictuelle", () => {
  test("une cible en conflit de ville perd systématiquement face à une cible non-conflictuelle au même ratio de chevauchement", () => {
    const conflicting = target({ id: "conflict", name: "Ecole Privee Fondation Test de Bandjoun", region: "Ouest", city: "BANDJOUN", category: "health_training" });
    const consistent = target({ id: "consistent", name: "Ecole Privee Fondation Test de Bafoussam", region: "Ouest", city: "BAFOUSSAM", category: "health_training" });
    const c = candidate({ name: "Ecole Privee Fondation Test Bis de Bafoussam", region: "Ouest", city: "BAFOUSSAM", category: "health_training" });
    const result = matchCandidate(c, [conflicting, consistent]);
    // Même mot distinctif partagé ("test") des deux côtés -> sans le
    // correctif §12, égalité de ratio -> AMBIGUOUS. Avec le correctif, la
    // cible en conflit de ville est écartée du pool de désambiguïsation.
    assert.notEqual(result.level, "AMBIGUOUS");
    assert.equal(result.target?.id, "consistent");
  });

  test("quand TOUTES les cibles à égalité sont en conflit géographique, aucun gagnant n'est fabriqué arbitrairement (AMBIGUOUS préservé)", () => {
    const t1 = target({ id: "t1", name: "Ecole Privee Fondation Test de Bandjoun", region: "Ouest", city: "BANDJOUN", category: "health_training" });
    const t2 = target({ id: "t2", name: "Ecole Privee Fondation Test de Dschang", region: "Ouest", city: "DSCHANG", category: "health_training" });
    const c = candidate({ name: "Ecole Privee Fondation Test de Bafoussam", region: "Ouest", city: "BAFOUSSAM", category: "health_training" });
    const result = matchCandidate(c, [t1, t2]);
    assert.equal(result.level, "AMBIGUOUS");
  });

  test("geoAgreement : villes différentes connues des deux côtés -> CONFLICT explicite", () => {
    assert.equal(geoAgreement("Ouest", "Bafoussam", "Ouest", "Bandjoun"), "CONFLICT");
  });
});

describe("§7.E — candidat approuvé vs frère différé (CATEGORY_REVIEW) du même pilote, vocabulaire santé générique -> aucun faux signal de doublon", () => {
  test("ECOLE PRIVEE FONDATION TCHUENTE DE BAFOUSSAM (CLEAN_APPROVABLE) vs ses 2 frères différés Bafoussam à fondateur différent -> NO_MATCH", () => {
    // Cas réel MINSANTE-G (staging_id 9c4b9a28-1aa2-4fc2-baa8-48d3919758f7,
    // un des 8 candidats approuvés) contre ses frères CATEGORY_REVIEW
    // 2c29d228-... et 265476d2-... du MÊME batch minsante-pilot-v1 — AVANT ce
    // sprint, AMBIGUOUS à 67% via les seuls mots "fondation"+"bafoussam".
    const sibling1 = target({ id: "cat-review-1", name: "Ecole Privee Fondation Jeugeuvou Fowang de Bafoussam", region: "Ouest", city: "BAFOUSSAM", category: "health_training" });
    const sibling2 = target({ id: "cat-review-2", name: "Ecole Privee de Formation des Personnels de Sante Fondation Saint Maurice de Bafoussam", region: "Ouest", city: "BAFOUSSAM", category: "health_training" });
    const approved = candidate({ name: "Ecole Privee Fondation Tchuente de Bafoussam", region: "Ouest", city: "BAFOUSSAM", category: "health_training" });
    const result = matchCandidate(approved, [sibling1, sibling2]);
    assert.equal(result.level, "NO_MATCH");
    assert.notEqual(result.level, "AMBIGUOUS");
    assert.notEqual(result.level, "PROBABLE_MATCH");
  });
});

describe("§7.F — vrais cas historiques déjà couverts par la suite de matching -> comportement inchangé (non-régression)", () => {
  test("ISSTMADD (SPRINT MINSANTE-B §8.C) : le sigle distinctif matche toujours en STRONG_MATCH malgré tout le vocabulaire santé générique retiré", () => {
    const t = target({ id: "isstmadd-1", name: "Ecole de Formation du Personnel de Sante ISSTMADD (Ngaoundere)", region: "Adamaoua", category: "health_training" });
    const c = candidate({ name: "Ecole de Formation du Personnel de Sante ISSTMADD", region: "Adamaoua", category: "health_training" });
    const result = matchCandidate(c, [t]);
    assert.equal(result.level, "STRONG_MATCH");
    assert.equal(result.safeForAutoLink, false);
  });

  test("Université de Yaoundé I vs II (SPRINT MINESUP-B §18) : jamais fusionnées malgré ville+région identiques", () => {
    const t = target({ id: "uy1", name: "Université de Yaoundé I", region: "Centre", city: "Yaoundé", category: "higher_education" });
    const c = candidate({ name: "Université de Yaoundé II", region: "Centre", city: "Yaoundé", category: "higher_education" });
    const result = matchCandidate(c, [t]);
    assert.notEqual(result.level, "STRONG_MATCH");
    assert.notEqual(result.level, "AMBIGUOUS");
    assert.notEqual(result.level, "EXACT_IDENTITY");
  });

  test("Jagora University (SPRINT MINESUP-E) : NO_MATCH contre 3 institutions 'University' sans rapport", () => {
    const targets = [
      target({ id: "t1", name: "Bamenda University Institute of Science and Technology (BUIST)", region: "Nord-Ouest", category: "higher_education" }),
      target({ id: "t2", name: "Catholic University Institute of Bamenda", region: "Nord-Ouest", category: "higher_education" }),
      target({ id: "t3", name: "International University of Bamenda", region: "Nord-Ouest", category: "higher_education" }),
    ];
    const c = candidate({ name: "Jagora University", region: "Centre", category: "higher_education" });
    const result = matchCandidate(c, targets);
    assert.equal(result.level, "NO_MATCH");
  });

  test("un identifiant exact (§23.A) reste EXACT_IDENTIFIER, non affecté par les changements géo/stopwords de ce sprint", () => {
    const t = target({ id: "t1", name: "Lycée de Test", identifiers: [{ registry: "MINESEC_ESG", identifier: "5EM1GSFD112245109" }] });
    const c = candidate({ name: "Lycée de Test (variante)", identifiers: [{ registry: "MINESEC_ESG", identifier: "5EM1GSFD112245109" }] });
    const result = matchCandidate(c, [t]);
    assert.equal(result.level, "EXACT_IDENTIFIER");
  });
});
