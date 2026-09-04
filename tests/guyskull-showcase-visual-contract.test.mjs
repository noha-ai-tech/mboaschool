import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const showcase = fs.readFileSync("src/components/school/GuyskullShowcase.tsx", "utf8");
const accueil = fs.readFileSync("src/components/school/views/AccueilView.tsx", "utf8");
const header = fs.readFileSync("src/components/school/SchoolSiteHeader.tsx", "utf8");

test("la vitrine enrichie reste strictement limitée à Guyskull", () => {
  assert.match(accueil, /a4cc4966-0d85-4c63-9c24-0538b8d5133b/);
  assert.match(accueil, /<GuyskullShowcase/);
  assert.match(header, /a4cc4966-0d85-4c63-9c24-0538b8d5133b/);
});

test("les contenus non publiés sont explicitement présentés comme démonstration", () => {
  assert.match(showcase, /vitrine de démonstration Écoles237/);
  assert.match(showcase, /Tarifs de démonstration/);
  assert.match(showcase, /Données de démonstration à confirmer/);
});

test("la composition reprend les blocs structurants de la maquette", () => {
  for (const label of ["Présentation", "Programmes et niveaux", "Frais de scolarité", "Galerie photos", "Résultats et performances", "Informations pratiques", "Localisation"]) {
    assert.ok(showcase.includes(label), `bloc manquant: ${label}`);
  }
  assert.match(showcase, /overflow-x-auto/);
  assert.match(showcase, /sm:grid-cols-2/);
  assert.match(showcase, /lg:grid-cols/);
});
