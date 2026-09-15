import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const showcase = fs.readFileSync("src/components/school/SchoolShowcase.tsx", "utf8");
test("every school view uses the shared showcase without an establishment-specific branch", () => {
  for (const view of ['AccueilView', 'EtablissementView', 'FormationsAdmissionsView', 'VieResultatsView', 'GalerieInfosView']) {
    const source = fs.readFileSync(`src/components/school/views/${view}.tsx`, 'utf8');
    assert.match(source, /<SchoolShowcase data=\{data\} baseHref=\{baseHref\}/);
    assert.doesNotMatch(source, /a4cc4966|if\s*\(/);
  }
});
test("showcase contains no demo identity, media, prices, or performance figures", () => {
  assert.doesNotMatch(showcase, /a4cc4966|images\/guyskull|450 000|550 000|98%|95%/);
});
test("shared composition retains the reference layout and uses real routed links", () => {
  for (const label of ["Présentation", "Programmes et niveaux", "Frais de scolarité", "Galerie photos", "Résultats et performances", "Informations pratiques", "Localisation"]) assert.ok(showcase.includes(label));
  assert.match(showcase, /lg:grid-cols-\[minmax\(0,1fr\)_330px\]/);
  assert.match(showcase, /buildMiniSiteViewHref\(baseHref, item.view\)/);
  assert.match(showcase, /overflow-x-auto/);
});
