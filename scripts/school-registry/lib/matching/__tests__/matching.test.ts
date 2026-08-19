import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { matchCandidate, findIdentifierCollisions, exactIdentityKey, fuzzyWords, hasCrossRegistryCoincidence } from "../engine";
import type { MatchCandidate, MatchTarget } from "../types";
import { isOfficialRegistry } from "../../registryAuthority";

/**
 * SPRINT REGISTRY-MULTI-A §23 — scénarios A-I requis par la spec, plus
 * quelques tests de régression sur les briques (exactIdentityKey/fuzzyWords)
 * déjà couvertes indirectement par les scripts de promotion R.3/R.3.1 mais
 * jamais testées de façon isolée avant ce module partagé.
 *
 * Lancer : npx tsx --test scripts/school-registry/lib/matching/__tests__/matching.test.ts
 */

function target(overrides: Partial<MatchTarget> & { id: string; name: string }): MatchTarget {
  return { region: null, city: null, category: null, identifiers: [], ...overrides };
}
function candidate(overrides: Partial<MatchCandidate> & { name: string }): MatchCandidate {
  return { region: null, city: null, category: null, identifiers: [], ...overrides };
}

describe("§23.A — 1 établissement, 1 registry, 1 identifier", () => {
  test("identifiant identique -> EXACT_IDENTIFIER", () => {
    const t = target({ id: "t1", name: "Lycée de Test", identifiers: [{ registry: "MINESEC_ESG", identifier: "5EM1GSFD112245109" }] });
    const c = candidate({ name: "Lycée de Test (variante)", identifiers: [{ registry: "MINESEC_ESG", identifier: "5EM1GSFD112245109" }] });
    const result = matchCandidate(c, [t]);
    assert.equal(result.level, "EXACT_IDENTIFIER");
    assert.equal(result.target?.id, "t1");
    assert.equal(result.safeForAutoLink, false);
  });
});

describe("§23.B — 1 établissement, 2 registries, 2 identifiers", () => {
  test("un établissement avec deux identifiants distincts est trouvé via l'un OU l'autre", () => {
    const t = target({
      id: "t1",
      name: "Collège Bilingue Exemple",
      identifiers: [
        { registry: "MINESEC_ESG", identifier: "5EM1GSFD112245109" },
        { registry: "MINESEC_CARTESCOLAIRE", identifier: "CE21325L89" },
      ],
    });
    const viaEsg = matchCandidate(candidate({ name: "X", identifiers: [{ registry: "MINESEC_ESG", identifier: "5EM1GSFD112245109" }] }), [t]);
    const viaCartescolaire = matchCandidate(candidate({ name: "Y", identifiers: [{ registry: "MINESEC_CARTESCOLAIRE", identifier: "CE21325L89" }] }), [t]);
    assert.equal(viaEsg.level, "EXACT_IDENTIFIER");
    assert.equal(viaCartescolaire.level, "EXACT_IDENTIFIER");
    assert.equal(viaEsg.target?.id, "t1");
    assert.equal(viaCartescolaire.target?.id, "t1");
  });
});

describe("§23.C — même identifier textuel, registries différents -> autorisé (namespaces distincts)", () => {
  test("deux établissements avec le même texte d'identifiant mais des registres différents ne sont PAS en collision", () => {
    const t1 = target({ id: "t1", name: "École A", identifiers: [{ registry: "MINESEC_ESG", identifier: "ABC123" }] });
    const t2 = target({ id: "t2", name: "École B", identifiers: [{ registry: "MINESUP_INSTITUTIONS", identifier: "ABC123" }] });
    const collisions = findIdentifierCollisions([t1, t2]);
    assert.deepEqual(collisions, []);
  });

  test("un candidat cherchant ABC123 dans MINESEC_ESG ne matche PAS t2 (registre différent)", () => {
    const t1 = target({ id: "t1", name: "École A", identifiers: [{ registry: "MINESEC_ESG", identifier: "ABC123" }] });
    const t2 = target({ id: "t2", name: "École B Inconnue", identifiers: [{ registry: "MINESUP_INSTITUTIONS", identifier: "ABC123" }] });
    const c = candidate({ name: "École A", identifiers: [{ registry: "MINESEC_ESG", identifier: "ABC123" }] });
    const result = matchCandidate(c, [t1, t2]);
    assert.equal(result.level, "EXACT_IDENTIFIER");
    assert.equal(result.target?.id, "t1"); // pas t2, malgré le texte identique
  });

  test("hasCrossRegistryCoincidence détecte explicitement la coïncidence sans la traiter comme un signal", () => {
    const t2 = target({ id: "t2", name: "École B", identifiers: [{ registry: "MINESUP_INSTITUTIONS", identifier: "ABC123" }] });
    const c = candidate({ name: "École A", identifiers: [{ registry: "MINESEC_ESG", identifier: "ABC123" }] });
    assert.equal(hasCrossRegistryCoincidence(c.identifiers, t2), true);
  });
});

describe("§23.D — même registry, même identifier -> collision interdite", () => {
  test("findIdentifierCollisions détecte une vraie collision", () => {
    const t1 = target({ id: "t1", name: "École A", identifiers: [{ registry: "MINESEC_ESG", identifier: "ABC123" }] });
    const t2 = target({ id: "t2", name: "École A (doublon collecte)", identifiers: [{ registry: "MINESEC_ESG", identifier: "ABC123" }] });
    const collisions = findIdentifierCollisions([t1, t2]);
    assert.equal(collisions.length, 1);
    assert.equal(collisions[0].registry, "MINESEC_ESG");
    assert.equal(collisions[0].identifier, "ABC123");
    assert.equal(collisions[0].targets.length, 2);
  });

  test("un candidat matchant deux cibles distinctes sur le même identifiant -> AMBIGUOUS, jamais un choix automatique", () => {
    const t1 = target({ id: "t1", name: "École A", identifiers: [{ registry: "MINESEC_ESG", identifier: "ABC123" }] });
    const t2 = target({ id: "t2", name: "École A bis", identifiers: [{ registry: "MINESEC_ESG", identifier: "ABC123" }] });
    const c = candidate({ name: "École A", identifiers: [{ registry: "MINESEC_ESG", identifier: "ABC123" }] });
    const result = matchCandidate(c, [t1, t2]);
    assert.equal(result.level, "AMBIGUOUS");
    assert.equal(result.target, null);
    assert.equal(result.alternativeTargets.length, 2);
  });
});

describe("§23.E — same name, same city, different IDs -> pas de fusion automatique", () => {
  test("identifiants différents empêchent un EXACT_IDENTIFIER même avec nom+ville identiques", () => {
    const t = target({ id: "t1", name: "Collège Saint Michel", city: "Douala", identifiers: [{ registry: "MINESEC_ESG", identifier: "AAA111" }] });
    const c = candidate({ name: "Collège Saint Michel", city: "Douala", identifiers: [{ registry: "MINESEC_ESG", identifier: "BBB222" }] });
    const result = matchCandidate(c, [t]);
    assert.notEqual(result.level, "EXACT_IDENTIFIER");
    assert.equal(result.safeForAutoLink, false);
    // Le nom+ville concordent -> au mieux EXACT_IDENTITY, jamais auto-link.
    assert.equal(result.level, "EXACT_IDENTITY");
  });
});

describe("§23.F — same registry ID, name variation -> l'identifiant exact domine le nom flou", () => {
  test("un identifiant exact l'emporte même si le nom a beaucoup changé", () => {
    const t = target({ id: "t1", name: "CES DE DANFILI MAMBAL", identifiers: [{ registry: "MINESEC_ESG", identifier: "2CC1GSFD102414108" }] });
    const c = candidate({ name: "CES de Danfili-Mambal (orthographe très différente)", identifiers: [{ registry: "MINESEC_ESG", identifier: "2CC1GSFD102414108" }] });
    const result = matchCandidate(c, [t]);
    assert.equal(result.level, "EXACT_IDENTIFIER");
  });
});

describe("§23.G — géographie contradictoire -> review", () => {
  test("nom exact mais région en conflit -> AMBIGUOUS, jamais EXACT_IDENTITY", () => {
    const t = target({ id: "t1", name: "Lycée Bilingue de Test", region: "Littoral" });
    const c = candidate({ name: "Lycée Bilingue de Test", region: "Centre" });
    const result = matchCandidate(c, [t]);
    assert.equal(result.level, "AMBIGUOUS");
    assert.equal(result.target, null);
  });

  test("chevauchement flou avec conflit géographique -> PROBABLE_MATCH (pas STRONG), signal affaibli", () => {
    const t = target({ id: "t1", name: "Institut Polyvalent Excellence", region: "Littoral" });
    const c = candidate({ name: "Institut Polyvalent Excellence Plus", region: "Centre" });
    const result = matchCandidate(c, [t]);
    assert.equal(result.level, "PROBABLE_MATCH");
    assert.match(result.reason, /CONTRADICTOIRE/);
  });
});

describe("§23.H — Cartescolaire + MINESEC dual-ID fixture", () => {
  test("un établissement promu avec corroboration cartescolaire conserve les deux identifiants sans écraser l'un par l'autre", () => {
    // Reproduit le cas réel SPRINT R.3.2 : official_id (MINESEC_ESG) reste
    // null car aucune correspondance MINESEC V1 directe, mais l'identifiant
    // de corroboration cartescolaire est conservé séparément — jamais fusionné.
    const t = target({
      id: "e-cefti",
      name: "CEFTI",
      city: "Douala",
      identifiers: [{ registry: "MINESEC_CARTESCOLAIRE", identifier: "14280735" }],
    });
    // Un futur MINESEC V1.2 pourrait découvrir un identifiant ESG pour ce
    // même établissement -- vérifie que l'ajout d'un second identifiant ne
    // nécessite aucune modification de l'identifiant existant.
    const withSecondId: MatchTarget = { ...t, identifiers: [...t.identifiers, { registry: "MINESEC_ESG", identifier: "7XX1GSFD199999109" }] };
    assert.equal(withSecondId.identifiers.length, 2);
    assert.equal(withSecondId.identifiers[0].identifier, "14280735"); // inchangé

    const matchViaOldId = matchCandidate(candidate({ name: "CEFTI", identifiers: [{ registry: "MINESEC_CARTESCOLAIRE", identifier: "14280735" }] }), [withSecondId]);
    const matchViaNewId = matchCandidate(candidate({ name: "CEFTI", identifiers: [{ registry: "MINESEC_ESG", identifier: "7XX1GSFD199999109" }] }), [withSecondId]);
    assert.equal(matchViaOldId.level, "EXACT_IDENTIFIER");
    assert.equal(matchViaNewId.level, "EXACT_IDENTIFIER");
  });
});

describe("§23.I — registre inconnu -> traité, jamais deviné", () => {
  test("un registre non répertorié reste comparable par égalité stricte (registry, identifier), sans plantage ni fusion implicite", () => {
    const t = target({ id: "t1", name: "École Future MINTRANSPORT", identifiers: [{ registry: "MINTRANSPORT_FUTUR_INCONNU", identifier: "XYZ" }] });
    const c = candidate({ name: "École Future MINTRANSPORT", identifiers: [{ registry: "MINTRANSPORT_FUTUR_INCONNU", identifier: "XYZ" }] });
    const result = matchCandidate(c, [t]);
    assert.equal(result.level, "EXACT_IDENTIFIER"); // comparaison structurelle, pas besoin de connaître le registre à l'avance
  });

  test("isOfficialRegistry ne rejette jamais silencieusement un registre futur inconnu (reste potentiellement officiel, jamais exclu par défaut)", () => {
    assert.equal(isOfficialRegistry("UN_REGISTRE_JAMAIS_VU" as never), true);
  });

  test("isOfficialRegistry rejette explicitement les sources de découverte Tier 3 connues", () => {
    assert.equal(isOfficialRegistry("DISCOVERY_OTHER"), false);
  });
});

describe("Briques — exactIdentityKey préserve les mots de catégorie (régression R.3)", () => {
  test("\"Lycée Technique d'Akwa\" et \"Lycée d'Akwa\" ne partagent PAS la même clé exacte", () => {
    assert.notEqual(exactIdentityKey("Lycée Technique d'Akwa"), exactIdentityKey("Lycée d'Akwa"));
  });
  test("accents/casse sont normalisés", () => {
    assert.equal(exactIdentityKey("ÉCOLE Publique"), exactIdentityKey("École publique"));
  });
});

describe("Briques — fuzzyWords reste un signal REVIEW uniquement (jamais safeForAutoLink)", () => {
  test("un chevauchement même à 100% ne produit jamais safeForAutoLink=true", () => {
    const t = target({ id: "t1", name: "Institut Bilingue Toumwa (IBT)" });
    const c = candidate({ name: "Institut Bilingue Toumwa" });
    const result = matchCandidate(c, [t]);
    assert.equal(result.safeForAutoLink, false);
  });
});

describe("Pas de match", () => {
  test("aucun mot commun -> NO_MATCH", () => {
    const t = target({ id: "t1", name: "Lycée de Bafoussam" });
    const c = candidate({ name: "École Primaire Publique de Douala" });
    const result = matchCandidate(c, [t]);
    assert.equal(result.level, "NO_MATCH");
  });
});
