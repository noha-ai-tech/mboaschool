import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("le dashboard utilise les fondations sans inventer de métriques", async () => {
  const dashboard = await source("src/app/dashboard/ecole/page.tsx");
  for (const component of [
    "SchoolAdminPageHeader",
    "SchoolAdminStatCard",
    "SchoolAdminSectionCard",
    "SchoolAdminStatusBadge",
  ]) {
    assert.match(dashboard, new RegExp(component));
  }
  assert.match(dashboard, /applications/);
  assert.match(dashboard, /classes/);
  assert.match(dashboard, /completionPct/);
  assert.match(dashboard, /paieCounts/);
  assert.match(dashboard, /withEstablishmentQuery\(href, school\.id\)/);
});

test("les lectures métier du dashboard restent présentes", async () => {
  const dashboard = await source("src/app/dashboard/ecole/page.tsx");
  for (const table of [
    "applications",
    "classes",
    "establishments",
    "fees",
    "infrastructures",
    "school_images",
    "school_announcements",
    "enseignants",
    "emplois_du_temps",
    "bulletins_paie",
  ]) {
    assert.match(dashboard, new RegExp(`from\\("${table}"\\)`));
  }
  // DAILY-INTELLIGENCE-01 — "Pointés aujourd'hui" ne recalcule plus un
  // compteur pointages ad hoc (JS local midnight) en parallèle du School
  // Event Engine ; il lit désormais l'unique source canonique pour
  // "aujourd'hui", ce qui élimine un risque de double vérité contradictoire
  // relevé lors de l'audit de ce sprint.
  assert.doesNotMatch(dashboard, /from\("pointages"\)/);
  assert.match(dashboard, /\/api\/intelligence\/daily/);
});

test("admissions conserve recherche, filtres, transitions et communications", async () => {
  const admissions = await source("src/app/dashboard/ecole/admissions/page.tsx");
  assert.match(admissions, /\.from\("applications"\)\.update\(\{ admission_status \}\)/);
  assert.match(admissions, /\.from\("applications"\)\.update\(\{ notes: note \}\)/);
  assert.match(admissions, /\.from\("applications"\)\.update\(\{ parent_message: parentMessage \}\)/);
  assert.match(admissions, /dispatchAdmissionNotification/);
  assert.match(admissions, /navigator\.clipboard\.writeText/);
  assert.match(admissions, /parent_phone/);
  assert.match(admissions, /parent_email/);
  assert.match(admissions, /levelFilter/);
  assert.match(admissions, /query\.toLowerCase\(\)/);
});

test("admissions utilise une table accessible, des cartes mobiles et un drawer commun", async () => {
  const admissions = await source("src/app/dashboard/ecole/admissions/page.tsx");
  for (const component of [
    "SchoolAdminPageHeader",
    "SchoolAdminFilterBar",
    "SchoolAdminResponsiveTable",
    "SchoolAdminStatusBadge",
    "SchoolAdminDrawer",
  ]) {
    assert.match(admissions, new RegExp(component));
  }
  assert.match(admissions, /<table/);
  assert.match(admissions, /<th scope="row"/);
  assert.match(admissions, /md:hidden/);
  assert.match(admissions, /aria-pressed/);
  assert.match(admissions, /Copier le code de suivi/);
});
