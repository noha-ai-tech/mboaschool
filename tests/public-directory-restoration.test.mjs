import assert from "node:assert/strict";
import test from "node:test";
import { serverSearchQueryForms, matchesSearchQuery, normalizeSearchText } from "../src/lib/search/normalizeSearchText.ts";
import { paginateAll } from "../src/lib/sitemap/paginate.ts";

test("La Réussite can be found with and without the accent", () => {
  for (const query of ["Réussite", "Reussite", "RÉUSSITE"]) {
    assert.ok(serverSearchQueryForms(query).includes("réussite"));
    assert.ok(serverSearchQueryForms(query).includes("reussite"));
  }
});

test("unknown accented names retain their spelling in server filters", () => {
  const forms = serverSearchQueryForms("Émérite");
  assert.ok(forms.includes("émérite"));
  assert.ok(forms.includes("emerite"));
});

test("school and city words can match separately in suggestions", () => {
  const school = normalizeSearchText("Groupe Scolaire La Réussite Douala");
  assert.equal(matchesSearchQuery(school, "Douala Réussite"), true);
  assert.equal(matchesSearchQuery(school, "Réussite Bamenda"), false);
});

for (const total of [0, 500, 1000, 1001, 2255, 3001]) {
  test(`category and preinscription paging reaches all ${total} schools`, async () => {
    const schools = Array.from({ length: total }, (_, id) => ({ id }));
    const loaded = await paginateAll(500, async (from, to) => schools.slice(from, to + 1));
    assert.deepEqual(loaded, schools);
    assert.equal(new Set(loaded.map(s => s.id)).size, total);
  });
}

test("a failed later page rejects instead of returning a misleading partial directory", async () => {
  await assert.rejects(paginateAll(500, async (from) => {
    if (from === 500) throw new Error("network interrupted");
    return Array.from({ length: 500 }, (_, id) => ({ id }));
  }), /network interrupted/);
});
