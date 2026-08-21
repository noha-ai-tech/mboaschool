import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { matchCandidate, fuzzyWords } from "../engine";
import type { MatchCandidate, MatchTarget } from "../types";

/**
 * SPRINT TRANSPORT-A.1-T3 §14 — matrice de tests A-G requise par le brief
 * pour le durcissement du vocabulaire générique auto-école (§13).
 *
 * Contexte : TRANSPORT-A.1 a trouvé un faux-positif réel (read-only, moteur
 * non modifié à l'époque) — "AUTO ECOLE LEO" produisait un STRONG_MATCH à
 * 100% contre la fiche seed "Auto-École La Route Sûre" en ne partageant que
 * le mot "auto" (voir reports/registry/transport-a1-matching-sample.csv).
 * Root cause et correctif documentés dans engine.ts juste au-dessus de
 * `WEAK_GENERIC_TOKENS` : "auto"/"autoecole" ajoutés à WEAK_GENERIC_TOKENS
 * (PAS à FUZZY_STOPWORDS — jamais un stopword aveugle, §13 du brief),
 * réutilisant le mécanisme "distinctive overlap gate" déjà introduit en
 * MINSANTE-G.2 pour "sciences".
 *
 * Lancer : npx tsx --test scripts/school-registry/lib/matching/__tests__/matching-transport-tier3.test.ts
 * ou (§15 du brief, non-régression croisée) :
 * npx tsx --test scripts/school-registry/lib/matching/__tests__/*.test.ts
 */

function target(overrides: Partial<MatchTarget> & { id: string; name: string }): MatchTarget {
  return { region: null, city: null, category: null, identifiers: [], ...overrides };
}
function candidate(overrides: Partial<MatchCandidate> & { name: string }): MatchCandidate {
  return { region: null, city: null, category: null, identifiers: [], ...overrides };
}

describe("§14.A — deux auto-écoles SANS RAPPORT ne partageant que 'auto'/'auto école' -> jamais de signal bloquant", () => {
  test("RÉGRESSION DIRECTE du finding réel TRANSPORT-A.1 : AUTO ECOLE LEO vs Auto-École La Route Sûre -> NO_MATCH (était STRONG_MATCH 100% avant ce sprint)", () => {
    const t = target({ id: "seed-route-sure", name: "Auto-École La Route Sûre", region: "Centre", city: "Yaoundé", category: "autres" });
    const c = candidate({ name: "AUTO ECOLE LEO", region: "Centre", city: "Yaoundé", category: "autres" });
    const result = matchCandidate(c, [t]);
    assert.equal(result.level, "NO_MATCH");
    assert.notEqual(result.level, "STRONG_MATCH");
    assert.equal(result.safeForAutoLink, false);
  });

  test("deux auto-écoles Tier 3 réelles sans rapport (ASTRALE vs MADIBA), même ville -> NO_MATCH, jamais de doublon signalé sur 'auto' seul", () => {
    const t = target({ id: "seed-madiba", name: "Auto-École Madiba", region: "Littoral", city: "Douala", category: "autres" });
    const c = candidate({ name: "AUTO ECOLE ASTRALE", region: "Littoral", city: "Douala", category: "autres" });
    const result = matchCandidate(c, [t]);
    assert.equal(result.level, "NO_MATCH");
  });

  test("forme SANS séparateur 'AUTOECOLE X' vs 'AUTOECOLE Y' -> NO_MATCH également (même mécanisme, tokenizer ne scinde pas 'autoecole')", () => {
    const t = target({ id: "t1", name: "AUTOECOLE MONTHE", region: null, city: null, category: "autres" });
    const c = candidate({ name: "AUTOECOLE KASSAP", region: null, city: null, category: "autres" });
    const result = matchCandidate(c, [t]);
    assert.equal(result.level, "NO_MATCH");
  });
});

describe("§14.B — variante EXACTE du même nom institutionnel -> matche toujours", () => {
  test("même nom, casse/tiret différents -> EXACT_IDENTITY (mots de catégorie 'auto'/'ecole' préservés par exactIdentityKey, jamais un stopword complet)", () => {
    const t = target({ id: "t1", name: "Auto-École Turbo Nkomkana", region: "Centre", city: "Yaoundé", category: "autres" });
    const c = candidate({ name: "AUTO ECOLE TURBO NKOMKANA", region: "Centre", city: "Yaoundé", category: "autres" });
    const result = matchCandidate(c, [t]);
    assert.equal(result.level, "EXACT_IDENTITY");
    assert.equal(result.safeForAutoLink, false);
  });
});

describe("§14.C — même ville + vocabulaire générique auto-école seul -> insuffisant, même avec accord géographique", () => {
  test("même ville explicite (Yaoundé), seul chevauchement = 'auto' -> NO_MATCH malgré l'accord géographique (même principe que §13.D MINSANTE-G.2)", () => {
    const t = target({ id: "t1", name: "Auto École Trecy", region: "Centre", city: "Yaoundé", category: "autres" });
    const c = candidate({ name: "Auto École Germania", region: "Centre", city: "Yaoundé", category: "autres" });
    const result = matchCandidate(c, [t]);
    assert.equal(result.level, "NO_MATCH");
    assert.notEqual(result.level, "PROBABLE_MATCH");
    assert.notEqual(result.level, "AMBIGUOUS");
  });
});

describe("§14.D — villes explicites DIFFÉRENTES -> signal géographique négatif, jamais un doublon", () => {
  test("deux auto-écoles de villes différentes ne partageant que 'auto' -> NO_MATCH, jamais un PROBABLE_MATCH affaibli", () => {
    const t = target({ id: "t1", name: "Auto École Française", region: "Littoral", city: "Douala", category: "autres" });
    const c = candidate({ name: "Auto École Astrale", region: "Centre", city: "Yaoundé", category: "autres" });
    const result = matchCandidate(c, [t]);
    assert.equal(result.level, "NO_MATCH");
  });
});

describe("§14.E — acronyme/sigle + nom propre distinctif -> soutient toujours l'identité", () => {
  test("sigle exact partagé entre parenthèses + seul mot flou commun = 'auto' -> le sigle fait remonter le signal au-delà de NO_MATCH (même mécanisme que §13.F MINSANTE-G.2)", () => {
    const t = target({ id: "t1", name: "Auto École du Centre (AEC)", region: "Centre", city: "Yaoundé", category: "autres" });
    const c = candidate({ name: "Auto École Cameroun (AEC)", region: "Ouest", city: "Bafoussam", category: "autres" });
    const result = matchCandidate(c, [t]);
    assert.notEqual(result.level, "NO_MATCH");
    assert.equal(result.level, "PROBABLE_MATCH");
    assert.equal(result.safeForAutoLink, false);
  });

  test("nom propre distinctif partagé (pas seulement 'auto') -> signal fort conservé, correctif n'affaiblit jamais une vraie correspondance", () => {
    const t = target({ id: "t1", name: "Auto École Nkomkana Excellence", region: "Centre", city: "Yaoundé", category: "autres" });
    const c = candidate({ name: "Auto-École Nkomkana Excellence Plus", region: "Centre", city: "Yaoundé", category: "autres" });
    const result = matchCandidate(c, [t]);
    assert.equal(result.level, "STRONG_MATCH");
  });
});

describe("§14.F — régression explicite MINSANTE/MINESUP -> comportement INCHANGÉ par l'ajout 'auto'/'autoecole'", () => {
  test("MINSANTE : 'sciences' seul reste insuffisant, comme avant ce sprint (aucune interaction avec les nouveaux tokens auto-école)", () => {
    const t = target({ id: "t1", name: "Institut des Sciences de la Sante de Bafang", region: "Ouest", city: "BAFANG", category: "health_training" });
    const c = candidate({ name: "Ecole des Sciences Medico-Sanitaires de Bandjoun", region: "Ouest", city: "BANDJOUN", category: "health_training" });
    const result = matchCandidate(c, [t]);
    assert.equal(result.level, "NO_MATCH");
  });

  test("MINESUP : 'Institut Superieur Bamenda Excellence Sciences' vs variante -> toujours STRONG_MATCH (fixture historique inchangée, aucun mot 'auto' impliqué)", () => {
    const t = target({ id: "t1", name: "Institut Superieur Bamenda Excellence Sciences", region: "Nord-Ouest", category: "higher_education" });
    const c = candidate({ name: "Ecole Superieure Bamenda Excellence Sciences Appliquees", region: "Nord-Ouest", category: "higher_education" });
    const result = matchCandidate(c, [t]);
    assert.equal(result.level, "STRONG_MATCH");
  });

  test("aucune régression sur fuzzyWords() pour un nom SANS aucun mot auto-école — sortie strictement identique au comportement d'avant ce sprint ('institut'/'superieur' restent des stopwords complets, retirés comme avant ; 'sciences' reste WEAK_GENERIC mais toujours présent dans fuzzyWords())", () => {
    const words = fuzzyWords("Institut Superieur des Sciences de Douala");
    assert.deepEqual([...words].sort(), ["douala", "sciences"]);
  });
});

describe("§14.G — cross-ministère, même institution sous plusieurs autorités -> jamais deux établissements", () => {
  test("un candidat MINEFOP (contenu transport, ex. type 'Fleet Management Academy') ne doit jamais se fondre automatiquement avec un établissement MINT sans rapport juste par vocabulaire transport générique — vérifié ici via l'absence de tout mot partagé", () => {
    const t = target({ id: "t1", name: "Auto École La Route Sûre", region: "Centre", city: "Yaoundé", category: "autres" });
    const c = candidate({ name: "Fleet Management Academy", region: null, city: null, category: "vocational_training" });
    const result = matchCandidate(c, [t]);
    assert.equal(result.level, "NO_MATCH");
  });

  test("la RÈGLE reste identique quel que soit le ministère d'origine : un même identifiant (registry, identifier) sur deux autorités différentes n'est JAMAIS une coïncidence traitée comme identité — reconfirmé ici avec un identifiant de type Transport/MINEFOP plutôt que MINSANTE/MINESUP (déjà couvert par matching.test.ts)", () => {
    const t = target({
      id: "t1",
      name: "Fleet Management Academy",
      region: null,
      city: null,
      category: "vocational_training",
      identifiers: [{ registry: "MINEFOP", identifier: "N°000471" }],
    });
    // Un candidat différent qui reprendrait la même chaîne texte mais sous un
    // AUTRE registre ("MINTRANSPORT", constante interne non encore en base -
    // voir registryAuthority.ts) ne doit produire AUCUNE coïncidence d'identité.
    const c = candidate({
      name: "Une Autre Institution Sans Rapport",
      region: null,
      city: null,
      category: null,
      identifiers: [{ registry: "MINTRANSPORT", identifier: "N°000471" }],
    });
    const result = matchCandidate(c, [t]);
    assert.notEqual(result.level, "EXACT_IDENTIFIER");
  });
});
