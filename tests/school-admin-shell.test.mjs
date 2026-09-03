import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const shellPath = new URL("../src/components/school-admin/SchoolAdminShell.tsx", import.meta.url);
const dashboardAdapterPath = new URL("../src/components/school-admin/DashboardSchoolAdminShell.tsx", import.meta.url);
const proAdapterPath = new URL("../src/components/school-admin/ProSchoolAdminShell.tsx", import.meta.url);
const proLayoutPath = new URL("../src/app/pro/layout.tsx", import.meta.url);
const restrictedPagePath = new URL("../src/app/pro/acces-restreint/page.tsx", import.meta.url);
const activeEstablishmentPath = new URL("../src/lib/supabase/activeEstablishment.ts", import.meta.url);
const sidebarPath = new URL("../src/components/layout/CollapsibleSidebar.tsx", import.meta.url);

test("le shell partagé expose les routes principales sans navigation horizontale", async () => {
  const source = await readFile(shellPath, "utf8");
  for (const route of [
    "/dashboard/ecole",
    "/dashboard/ecole/admissions",
    "/dashboard/ecole/classes",
    "/pro/personnel",
    "/pro/enseignants",
    "/pro/pointage/historique",
    "/pro/emplois-du-temps",
    "/pro/paie",
    "/pro/messagerie",
    "/dashboard/ecole/etablissement",
    "/dashboard/ecole/parametres",
  ]) {
    assert.match(source, new RegExp(route.replaceAll("/", "\\/")));
  }
  assert.doesNotMatch(source, /overflow-x-auto/);
});

test("les liens gardent le contexte et les fonctions Pro restent verrouillées", async () => {
  const source = await readFile(shellPath, "utf8");
  assert.match(source, /withEstablishmentQuery\(destination, schoolId\)/);
  assert.match(source, /requiresPro && !isPro/);
  assert.match(source, /\/pro\/acces-restreint/);
});

test("le drawer mobile porte les garanties clavier et modales", async () => {
  const [source, sidebar] = await Promise.all([
    readFile(shellPath, "utf8"),
    readFile(sidebarPath, "utf8"),
  ]);
  assert.match(source, /aria-modal="true"/);
  assert.match(source, /event\.key === "Escape"/);
  assert.match(source, /event\.key !== "Tab"/);
  assert.match(source, /setAttribute\("inert", ""\)/);
  assert.match(source, /focus-visible:outline/);
  assert.match(sidebar, /aria-current=\{active \? "page"/);
});

test("les deux adaptateurs conservent leurs mécanismes de sélection", async () => {
  const [dashboard, pro] = await Promise.all([
    readFile(dashboardAdapterPath, "utf8"),
    readFile(proAdapterPath, "utf8"),
  ]);
  assert.match(dashboard, /useSchools\(\)/);
  assert.match(dashboard, /setActiveSchoolId/);
  assert.match(pro, /ProSchoolSwitcher/);
  assert.match(pro, /SCHOOL_QUERY_PARAM/);
});

test("le shell Pro conserve une école non-Pro dans le contexte tout en verrouillant ses fonctions", async () => {
  const [adapter, layout, restricted, activeEstablishment] = await Promise.all([
    readFile(proAdapterPath, "utf8"),
    readFile(proLayoutPath, "utf8"),
    readFile(restrictedPagePath, "utf8"),
    readFile(activeEstablishmentPath, "utf8"),
  ]);
  assert.match(layout, /\.select\("id, name, forfait"\)/);
  assert.doesNotMatch(layout, /\.eq\("forfait", "pro"\)/);
  assert.match(adapter, /isPro=\{activeSchool\?\.forfait === "pro"\}/);
  assert.match(restricted, /withEstablishmentQuery\("\/dashboard\/ecole", schoolId\)/);
  assert.match(activeEstablishment, /withEstablishmentQuery\(/);
  assert.match(activeEstablishment, /requestedEstablishmentId \?\? null/);
});
