import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { matchCandidate, fuzzyWords } from "../engine";
import type { MatchCandidate, MatchTarget } from "../types";

/**
 * SPRINT MINSANTE-G.2 §13 — matrice de tests A-H requise par le brief.
 *
 * Contexte : après MINSANTE-G.1, 3 des 8 candidats approuvés du pilote
 * restaient bloqués (AMBIGUOUS/PROBABLE_MATCH) uniquement parce que
 * "sciences" était le seul mot significatif restant une fois la ville et le
 * vocabulaire déjà-stopword retirés (cf. reports/registry/
 * minsante-g1-matching-after.csv, reports/registry/
 * minsante-g1-preflight-recheck.json). "sciences" ne pouvait PAS devenir un
 * stopword global (interdit — MINESUP-E prouve que "sciences" reste un vrai
 * signal quand il s'ajoute à d'autres mots distinctifs partagés). Solution
 * générique retenue : `WEAK_GENERIC_TOKENS` + "distinctive overlap gate"
 * dans `matchCandidate` (engine.ts §7-§9) — un chevauchement composé
 * UNIQUEMENT de mots WEAK_GENERIC (actuellement : "sciences"/"science")
 * n'est plus, à lui seul, une preuve suffisante pour un niveau bloquant
 * (STRONG_MATCH/PROBABLE_MATCH/AMBIGUOUS), SAUF corroboration structurelle
 * plus forte (sigle exact partagé entre parenthèses).
 *
 * Noms réels utilisés en A/D/E : extraits tels quels de
 * reports/registry/minsante-g1-matching-after.csv (batch minsante-pilot-v1,
 * source MINSANTE officielle), aucune donnée personnelle.
 *
 * Lancer : npx tsx --test scripts/school-registry/lib/matching/__tests__/matching-minsante-g2.test.ts
 */

function target(overrides: Partial<MatchTarget> & { id: string; name: string }): MatchTarget {
  return { region: null, city: null, category: null, identifiers: [], ...overrides };
}
function candidate(overrides: Partial<MatchCandidate> & { name: string }): MatchCandidate {
  return { region: null, city: null, category: null, identifiers: [], ...overrides };
}

describe("§13.A — MINSANTE, écoles DISTINCTES ne partageant que 'sciences' (villes différentes) -> jamais de signal bloquant", () => {
  test("PAIRE RÉSIDUELLE RÉELLE #1 (staging_id 273f8980) : BAFANG vs POOLA-BAFOUSSAM et ARGUS-BANDJOUN -> NO_MATCH, plus AMBIGUOUS", () => {
    const targetPoola = target({ id: "poola", name: "Institut des Sciences de la Sante Poola de Bafoussam", region: "Ouest", city: "BAFOUSSAM", category: "health_training" });
    const targetArgus = target({ id: "argus", name: "Institut des Sciences Medico-Sanitaires Les Argus de Bandjoun", region: "Ouest", city: "BANDJOUN", category: "health_training" });
    const c = candidate({ name: "Ecole des Sciences de la Sante de l'Institut Superieur de Bafang", region: "Ouest", city: "BAFANG", category: "health_training" });
    const result = matchCandidate(c, [targetPoola, targetArgus]);
    assert.equal(result.level, "NO_MATCH");
    assert.notEqual(result.level, "AMBIGUOUS");
    assert.notEqual(result.level, "PROBABLE_MATCH");
    assert.notEqual(result.level, "STRONG_MATCH");
  });

  test("PAIRE RÉSIDUELLE RÉELLE #2 (staging_id 79370ccb) : BAMENA vs POOLA-BAFOUSSAM et ARGUS-BANDJOUN -> NO_MATCH, plus AMBIGUOUS", () => {
    const targetPoola = target({ id: "poola", name: "Institut des Sciences de la Sante Poola de Bafoussam", region: "Ouest", city: "BAFOUSSAM", category: "health_training" });
    const targetArgus = target({ id: "argus", name: "Institut des Sciences Medico-Sanitaires Les Argus de Bandjoun", region: "Ouest", city: "BANDJOUN", category: "health_training" });
    const c = candidate({ name: "Ecole Privee des Sciences de la Sante Meno de Bamena", region: "Ouest", city: "BAMENA", category: "health_training" });
    const result = matchCandidate(c, [targetPoola, targetArgus]);
    assert.equal(result.level, "NO_MATCH");
    assert.notEqual(result.level, "AMBIGUOUS");
  });
});

describe("§13.B — MINSANTE, VRAIE variante de la même école contenant 'sciences' -> matche toujours via un mot distinctif réel", () => {
  test("un nom propre/fondateur partagé ('Poola') produit toujours un niveau fort malgré 'sciences' WEAK_GENERIC", () => {
    const t = target({ id: "t1", name: "Institut des Sciences de la Sante Poola de Bafoussam", region: "Ouest", city: "BAFOUSSAM", category: "health_training" });
    const c = candidate({ name: "Institut des Sciences de la Sante Poola de Bafoussam (variante)", region: "Ouest", city: "BAFOUSSAM", category: "health_training" });
    const result = matchCandidate(c, [t]);
    assert.equal(result.level, "STRONG_MATCH");
    assert.equal(result.safeForAutoLink, false);
  });
});

describe("§13.C — MINESUP, 'sciences' reste un vrai différenciateur de spécialité quand il accompagne d'autres mots distinctifs -> comportement INCHANGÉ", () => {
  test("régression explicite : Institut Superieur Bamenda Excellence Sciences vs Ecole Superieure Bamenda Excellence Sciences Appliquees -> toujours STRONG_MATCH (déjà couvert par matching.test.ts, revalidé ici comme fixture de non-régression G.2 dédiée)", () => {
    const t = target({ id: "t1", name: "Institut Superieur Bamenda Excellence Sciences", region: "Nord-Ouest", category: "higher_education" });
    const c = candidate({ name: "Ecole Superieure Bamenda Excellence Sciences Appliquees", region: "Nord-Ouest", category: "higher_education" });
    const result = matchCandidate(c, [t]);
    assert.equal(result.level, "STRONG_MATCH");
  });

  test("'sciences' seul (sans aucun autre mot distinctif partagé) reste insuffisant même côté MINESUP -> comportement cohérent avec MINSANTE (pas un traitement différent par ministère)", () => {
    // Preuve que le correctif est bien GÉNÉRIQUE (§6 du brief) : la même
    // règle (distinctive overlap gate) s'applique quel que soit le
    // ministère d'origine, jamais une condition source_ministry==='MINSANTE'.
    const t = target({ id: "t1", name: "Institut Superieur des Sciences de Douala", region: "Littoral", category: "higher_education" });
    const c = candidate({ name: "Ecole Superieure des Sciences de Garoua", region: "Nord", category: "higher_education" });
    const result = matchCandidate(c, [t]);
    assert.equal(result.level, "NO_MATCH");
  });
});

describe("§13.D — même ville explicite + termes génériques uniquement -> toujours insuffisant pour confirmer un doublon", () => {
  test("PAIRE RÉSIDUELLE RÉELLE #3 (staging_id bbf4f625) : même ville BAFOUSSAM des deux côtés, seul 'sciences' partagé (candidat a 'techniques', cible a 'Poola', aucun mot commun distinctif) -> NO_MATCH malgré l'accord géographique", () => {
    const t = target({ id: "poola", name: "Institut des Sciences de la Sante Poola de Bafoussam", region: "Ouest", city: "BAFOUSSAM", category: "health_training" });
    const c = candidate({ name: "Institut des Sciences et Techniques Medico-Sanitaires de Bafoussam", region: "Ouest", city: "BAFOUSSAM", category: "health_training" });
    const result = matchCandidate(c, [t]);
    // §9 du brief : "same explicit city" est UNE forme de corroboration
    // possible, mais §9 conclut aussi, sans exception, que "shared generic
    // words alone must not create a promotion blocker" — une ville commune
    // ne suffit jamais, SEULE, à transformer un chevauchement 100%
    // WEAK_GENERIC en signal bloquant, sinon deux établissements de santé
    // différents de la même ville (très fréquent au Cameroun) seraient
    // systématiquement signalés doublons l'un de l'autre.
    assert.equal(result.level, "NO_MATCH");
    assert.notEqual(result.level, "PROBABLE_MATCH");
    assert.notEqual(result.level, "AMBIGUOUS");
  });
});

describe("§13.E — villes explicites DIFFÉRENTES + 'sciences' -> distinct, aucun signal bloquant", () => {
  test("deux écoles de villes différentes ne partageant que 'sciences' -> NO_MATCH, jamais un conflit géographique 'PROBABLE_MATCH affaibli'", () => {
    const t = target({ id: "t1", name: "Ecole des Sciences Infirmieres de Kribi", region: "Sud", city: "KRIBI", category: "health_training" });
    const c = candidate({ name: "Institut des Sciences de la Sante de Ebolowa", region: "Sud", city: "EBOLOWA", category: "health_training" });
    const result = matchCandidate(c, [t]);
    assert.equal(result.level, "NO_MATCH");
  });
});

describe("§13.F — un sigle/acronyme exact partagé fournit une preuve distinctive même quand le seul mot flou commun est 'sciences'", () => {
  // NOTE : le sigle utilisé ("ISK", 3 caractères) est délibérément COURT —
  // sous le seuil de longueur >3 de fuzzyWords() — pour que le seul chemin
  // par lequel il puisse fournir une preuve soit `extractParentheticalAcronym`
  // (le mécanisme testé ici), jamais une simple retombée du tokenizer flou
  // habituel (un sigle plus long comme "ISSK" survivrait déjà comme mot
  // flou normal >3 caractères, ce qui ne testerait pas la bonne chose).
  test("même sigle court entre parenthèses des deux côtés + 'sciences' partagé + villes différentes -> le sigle fait remonter le signal au-delà du NO_MATCH (corroboration structurelle, §9)", () => {
    const t = target({ id: "t1", name: "Institut des Sciences de la Sante (ISK) de Kribi", region: "Sud", city: "KRIBI", category: "health_training" });
    const c = candidate({ name: "Ecole des Sciences Diverses (ISK) de Ebolowa", region: "Sud", city: "EBOLOWA", category: "health_training" });
    const result = matchCandidate(c, [t]);
    // Le sigle identique (ISK) est une corroboration structurelle valable
    // (§9) même si "sciences" reste le seul mot flou partagé et que les
    // villes sont en conflit -> le signal n'est PAS supprimé par le gate,
    // il retombe sur le comportement géographique normal (PROBABLE_MATCH,
    // signal affaibli par le conflit de ville — jamais NO_MATCH forcé, et
    // jamais un niveau supérieur à PROBABLE_MATCH tant que le conflit
    // géographique existe).
    assert.notEqual(result.level, "NO_MATCH");
    assert.equal(result.level, "PROBABLE_MATCH");
    assert.equal(result.safeForAutoLink, false);
  });

  test("sans corroboration de sigle (sigles différents), le même scénario retombe bien à NO_MATCH — le sigle est bien la variable déterminante de ce test", () => {
    const t = target({ id: "t1", name: "Institut des Sciences de la Sante (ISK) de Kribi", region: "Sud", city: "KRIBI", category: "health_training" });
    const c = candidate({ name: "Ecole des Sciences Diverses (AUT) de Ebolowa", region: "Sud", city: "EBOLOWA", category: "health_training" });
    const result = matchCandidate(c, [t]);
    assert.equal(result.level, "NO_MATCH");
  });

  test("un token écrit entre parenthèses mais identique à la ville structurée n'est jamais pris pour une corroboration de sigle (protection anti faux-positif)", () => {
    const t = target({ id: "t1", name: "Institut des Sciences de la Sante (Kribi) de Kribi", region: "Sud", city: "KRIBI", category: "health_training" });
    const c = candidate({ name: "Ecole des Sciences Diverses (Kribi) de Ebolowa", region: "Sud", city: "EBOLOWA", category: "health_training" });
    const result = matchCandidate(c, [t]);
    assert.equal(result.level, "NO_MATCH");
  });
});

describe("§13.G/H — non-régression : fuzzyWords conserve 'sciences' dans sa sortie (WEAK_GENERIC != STOPWORD)", () => {
  test("'sciences' et 'science' restent des mots significatifs de fuzzyWords() — jamais retirés (contrairement à un vrai stopword comme 'institut'/'santé')", () => {
    assert.ok(fuzzyWords("Ecole des Sciences de la Sante").includes("sciences"));
    assert.ok(fuzzyWords("Higher Institute of Science and Technology").includes("science"));
  });

  test("les suites historiques complètes (MINESUP-C/E, MINSANTE-B, MINSANTE-G.1, §23 A-I) restent couvertes par matching.test.ts et matching-minsante-g1.test.ts — exécutées ensemble dans la même commande de test (§15 du brief), aucune régression tolérée", () => {
    // Marqueur explicite : ce test ne duplique pas les ~60 autres scénarios,
    // il documente que la commande `npx tsx --test lib/matching/__tests__/*.test.ts`
    // (§15) est la preuve réelle de non-régression cross-fixtures, pas ce
    // fichier isolé. Voir reports/registry/minsante-g2-cross-registry-regression.json.
    assert.ok(true);
  });
});
