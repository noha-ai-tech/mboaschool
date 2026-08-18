import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { escapeOrValue, ilikeOrGroup, clampInt, resolveRegionFilter, cityForms, queryWordGroups } from "../queryBuilder";
import { normalizeSearchText, matchesSearchQuery, serverSearchWordForms } from "../normalizeSearchText";

/**
 * SPRINT R.2-B — Suite de non-régression de la construction de requête de
 * recherche (logique pure, aucun réseau). Lancer :
 * npx tsx --test src/lib/search/__tests__/queryBuilder.test.ts
 */

describe("§38-39 — validation des paramètres bruts", () => {
  test("clampInt refuse une valeur non numérique et retourne le fallback", () => {
    assert.equal(clampInt("abc", 24, 1, 50), 24);
    assert.equal(clampInt(null, 24, 1, 50), 24);
  });

  test("clampInt borne page_size au maximum (§7 — jamais ?page_size=100000)", () => {
    assert.equal(clampInt("100000", 24, 1, 50), 50);
  });

  test("clampInt borne au minimum (page >= 1)", () => {
    assert.equal(clampInt("-5", 1, 1, 100000), 1);
    assert.equal(clampInt("0", 1, 1, 100000), 1);
  });
});

describe("§16 — macro-zones ne deviennent jamais une valeur region littérale", () => {
  test("grand-nord résout vers Adamaoua/Nord/Extrême-Nord", () => {
    const result = resolveRegionFilter("grand-nord");
    assert.deepEqual(result?.regions, ["Adamaoua", "Nord", "Extrême-Nord"]);
  });

  test("zone-anglophone résout vers Nord-Ouest/Sud-Ouest", () => {
    const result = resolveRegionFilter("zone-anglophone");
    assert.deepEqual(result?.regions, ["Nord-Ouest", "Sud-Ouest"]);
  });

  test("une région canonique passe telle quelle, casse/accents insensibles", () => {
    assert.deepEqual(resolveRegionFilter("littoral")?.regions, ["Littoral"]);
    assert.deepEqual(resolveRegionFilter("EXTREME-NORD")?.regions, ["Extrême-Nord"]);
  });

  test("une région inconnue ne matche rien (jamais de région inventée)", () => {
    assert.equal(resolveRegionFilter("Atlantide"), null);
  });

  test("'all' ou vide -> pas de filtre région", () => {
    assert.equal(resolveRegionFilter("all"), null);
    assert.equal(resolveRegionFilter(null), null);
  });
});

describe("§9/§10 — normalisation accent/lycée côté serveur", () => {
  test("école <-> ecole", () => {
    assert.deepEqual(new Set(serverSearchWordForms("ecole")), new Set(["ecole", "école"]));
  });
  test("Ngaoundéré <-> Ngaoundere", () => {
    assert.ok(serverSearchWordForms("ngaoundere").includes("ngaoundéré"));
  });
  test("lycée / lycee / lyce — les 3 formes présentes", () => {
    const forms = new Set(serverSearchWordForms("lycee"));
    assert.ok(forms.has("lycee"));
    assert.ok(forms.has("lyce"));
  });
  test("un mot sans variante connue reste seul", () => {
    assert.deepEqual(serverSearchWordForms("bafoussam"), ["bafoussam"]);
  });
});

describe("§59-60 — échappement PostgREST (protection contre une requête cassée)", () => {
  test("une valeur avec virgule est entourée de guillemets", () => {
    assert.equal(escapeOrValue("a,b"), '"a,b"');
  });
  test("un guillemet interne est échappé", () => {
    assert.equal(escapeOrValue('a"b'), '"a\\"b"');
  });
  test("ilikeOrGroup combine colonnes x formes avec le bon nombre de clauses", () => {
    const group = ilikeOrGroup(["name", "city"], ["ecole", "école"]);
    const clauses = group.split(",");
    assert.equal(clauses.length, 4); // 2 colonnes x 2 formes
    assert.ok(clauses.every((c) => c.includes(".ilike.")));
  });
  test("une requête contenant une parenthèse ne casse pas la construction du groupe", () => {
    const group = ilikeOrGroup(["name"], ["college (excellence)"]);
    assert.ok(group.startsWith('name.ilike."%college (excellence)%"'));
  });
});

describe("§15 — formes de ville avec alias confirmés", () => {
  test("Ngaoundéré inclut sa forme accentuée et son alias sans accent", () => {
    const forms = cityForms("Ngaoundéré");
    assert.ok(forms.includes("ngaoundere"));
    assert.ok(forms.includes("ngaoundéré"));
  });
  test("un nom de ville tapé sans accent retrouve quand même la ville majeure (Kumbo/Kimbo)", () => {
    const forms = cityForms("Kumbo");
    assert.ok(forms.includes("kimbo"));
  });
  test("une ville hors de la config renvoie simplement sa forme normalisée", () => {
    assert.deepEqual(cityForms("Obala"), ["obala"]);
  });
});

describe("§12 — recherche mot-par-mot, un groupe OR par mot", () => {
  test("\"lycée bilingue bafoussam\" produit 3 groupes (ET entre mots)", () => {
    const groups = queryWordGroups("lycée bilingue bafoussam");
    assert.equal(groups.length, 3);
  });
  test("une requête vide ne produit aucun groupe", () => {
    assert.deepEqual(queryWordGroups(""), []);
    assert.deepEqual(queryWordGroups("   "), []);
  });
});

describe("cohérence avec le matcher client existant (normalizeSearchText)", () => {
  test("les formes serveur pour un mot couvrent ce que matchesSearchQuery accepterait déjà côté client", () => {
    const haystack = normalizeSearchText("Lycée Bilingue de Bafoussam");
    assert.ok(matchesSearchQuery(haystack, "lycee bafoussam"));
    assert.ok(matchesSearchQuery(haystack, "lyce bafoussam"));
  });
});
