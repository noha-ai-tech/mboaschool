import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("les quatre routes utilisent les fondations school-admin", async () => {
  const files = await Promise.all([
    source("src/app/dashboard/ecole/classes/page.tsx"),
    source("src/app/dashboard/ecole/classes/[id]/page.tsx"),
    source("src/app/pro/matieres/page.tsx"),
    source("src/app/pro/salles/page.tsx"),
  ]);
  for (const file of files) assert.match(file, /SchoolAdminPageHeader/);
  assert.match(files[0], /SchoolAdminResponsiveTable/);
  assert.match(files[1], /SchoolAdminSectionCard/);
  assert.match(files[2], /SchoolAdminStatCard/);
  assert.match(files[3], /SchoolAdminResponsiveTable/);
});

test("les classes conservent leur CRUD et leurs liens contextualisés", async () => {
  const file = await source("src/app/dashboard/ecole/classes/page.tsx");
  assert.match(file, /\.from\("classes"\)\.select\("\*"\)\.eq\("establishment_id", schoolId\)/);
  assert.match(file, /\.from\("classes"\)\.insert\(\{ establishment_id: school\.id, name: form\.name, level: form\.level, teacher_name: form\.teacher_name \|\| null \}\)/);
  assert.match(file, /\.from\("classes"\)\.delete\(\)\.eq\("id", deleteTarget\.id\)/);
  assert.match(file, /withEstablishmentQuery\(path, school\.id\)/);
  assert.match(file, /`\/dashboard\/ecole\/classes\/\$\{item\.id\}`/);
});

test("le détail conserve school_announcements sans réactiver class_announcements", async () => {
  const file = await source("src/app/dashboard/ecole/classes/[id]/page.tsx");
  assert.match(file, /\.from\("school_announcements"\)/);
  assert.match(file, /class_id: classId/);
  assert.match(file, /\.delete\(\)\.eq\("id", deleteTarget\.id\)/);
  assert.doesNotMatch(file, /\.from\("class_announcements"\)/);
  assert.match(file, /module historique d’annonces de classe reste fermé/);
  assert.match(file, /withEstablishmentQuery\("\/dashboard\/ecole\/classes", school\?\.id\)/);
});

test("matières et volumes conservent leurs contrats actifs", async () => {
  const [page, manager] = await Promise.all([source("src/app/pro/matieres/page.tsx"), source("src/components/pro/GestionMatieres.tsx")]);
  assert.match(page, /\.from\("matieres"\)/);
  assert.match(page, /\.from\("matieres_volume_horaire"\)/);
  assert.match(page, /matiere\.departement_disciplinaire/);
  assert.match(manager, /etablissement_id: etablissementId, nom: newForm\.nom\.trim\(\), departement_disciplinaire: newForm\.departement\.trim\(\), couleur: newForm\.couleur/);
  assert.match(manager, /onConflict: "matiere_id,niveau"/);
  assert.match(manager, /SchoolAdminDialog/);
});

test("salles conserve le payload et propose table desktop et cartes mobiles", async () => {
  const [page, form] = await Promise.all([source("src/app/pro/salles/page.tsx"), source("src/components/pro/FormulaireSalle.tsx")]);
  assert.match(page, /select\("id, nom, capacite, type"\)/);
  assert.match(page, /hidden md:block/);
  assert.match(page, /md:hidden/);
  assert.match(page, /<th scope="row"/);
  assert.match(form, /\.from\("salles"\)\.insert\(\{ etablissement_id: etablissementId, nom: nom\.trim\(\), capacite: capacite \? Number\(capacite\) : null, type \}\)/);
  assert.match(form, /if \(!nom\.trim\(\) \|\| saving\) return/);
});
