import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

const routes = [
  "src/app/pro/personnel/page.tsx",
  "src/app/pro/personnel/nouveau/page.tsx",
  "src/app/pro/personnel/[id]/page.tsx",
  "src/app/pro/enseignants/page.tsx",
  "src/app/pro/enseignants/nouveau/page.tsx",
];

test("les cinq routes utilisent les fondations school-admin", async () => {
  const files = await Promise.all(routes.map(source));
  for (const file of files) assert.match(file, /SchoolAdminPageHeader/);
  assert.match(files[0], /SchoolAdminResponsiveTable/);
  assert.match(files[0], /SchoolAdminStatCard/);
  assert.match(files[2], /SchoolAdminSectionCard/);
  assert.match(files[3], /SchoolAdminResponsiveTable/);
  assert.match(files[3], /SchoolAdminStatusBadge/);
});

test("personnel et enseignants conservent des responsabilités distinctes", async () => {
  const [personnel, teachers] = await Promise.all([source(routes[0]), source(routes[3])]);
  assert.match(personnel, /dossiers administratifs, les contrats, les documents et les accès/);
  assert.match(personnel, /staff_members/);
  assert.match(teachers, /profils pédagogiques, les codes de pointage et les affectations aux matières/);
  assert.match(teachers, /\.from\("enseignants"\)/);
});

test("les formulaires conservent les endpoints, payloads et redirections contextualisées", async () => {
  const [personnelForm, teacherForm] = await Promise.all([
    source("src/components/pro/FormulaireNouveauPersonnel.tsx"),
    source("src/components/pro/FormulaireNouvelEnseignant.tsx"),
  ]);
  assert.match(personnelForm, /fetch\("\/api\/personnel\/creer"/);
  assert.match(personnelForm, /requestedEstablishmentId: establishmentId/);
  assert.match(personnelForm, /withEstablishmentQuery\(`\/pro\/personnel\/\$\{body\.staffMemberId\}`/);
  assert.match(teacherForm, /fetch\("\/api\/enseignants\/creer"/);
  assert.match(teacherForm, /`\/api\/enseignants\/\$\{enseignantId\}\/matieres`/);
  assert.match(teacherForm, /matiereIds: Array\.from\(selectedMatieres\)/);
  assert.match(teacherForm, /withEstablishmentQuery\("\/pro\/enseignants", establishmentId\)/);
  assert.match(personnelForm, /if \(saving\) return/);
  assert.match(teacherForm, /if \(saving\) return/);
});

test("les invitations restent indisponibles dans les interfaces actives", async () => {
  const [teachers, access] = await Promise.all([
    source("src/app/pro/enseignants/page.tsx"),
    source("src/components/pro/PersonnelAcces.tsx"),
  ]);
  assert.doesNotMatch(teachers, /BoutonInviter/);
  assert.match(teachers, /Invitations temporairement indisponibles/);
  assert.match(access, /Invitation indisponible/);
  assert.doesNotMatch(access, /\/inviter`/);
  assert.match(access, /\/code-acces`/);
});

test("les listes proposent une table desktop et des cartes mobiles complètes", async () => {
  const [personnel, teachers] = await Promise.all([source(routes[0]), source(routes[3])]);
  for (const file of [personnel, teachers]) {
    assert.match(file, /<table/);
    assert.match(file, /<th scope="row"/);
    assert.match(file, /hidden md:block/);
    assert.match(file, /md:hidden/);
  }
});
