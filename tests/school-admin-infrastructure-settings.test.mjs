import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Infrastructure conserve les dix champs et le contrat upsert existant", async () => {
  const page = await read("src/app/dashboard/ecole/infrastructure/page.tsx");
  for (const field of ["library", "laboratory", "computer_room", "sports_field", "canteen", "boarding", "transport", "security", "wifi", "infirmary"]) assert.match(page, new RegExp(`key: "${field}"`));
  assert.match(page, /from\("infrastructures"\)\.update\(form\)\.eq\("id", existingId\)/);
  assert.match(page, /insert\(\{ establishment_id: school\.id, \.\.\.form \}\)/);
  assert.match(page, /role="switch"/); assert.match(page, /aria-checked=\{active\}/);
});

test("Paramètres conserve sa liste blanche et protège les champs sensibles", async () => {
  const page = await read("src/app/dashboard/ecole/parametres/page.tsx");
  const form = page.match(/const EMPTY_FORM = \{([^}]+)\}/s)?.[1] ?? "";
  for (const field of ["name", "city", "neighborhood", "phone", "email", "whatsapp", "website", "description", "main_category", "address"]) assert.match(form, new RegExp(`${field}:`));
  for (const field of ["official_id", "source_ministry", "source_reference", "registry_import_batch", "is_verified", "forfait", "subscription_plan", "owner_id", "organization_id"]) assert.doesNotMatch(form, new RegExp(`${field}:`));
  assert.match(page, /from\("establishments"\)\.update\(form\)\.eq\("id", school\.id\)/);
  assert.match(page, /school\.forfait === "pro"/); assert.doesNotMatch(page, /field\("forfait"/);
  assert.match(page, /beforeunload/); assert.match(page, /JSON\.stringify\(form\) !== JSON\.stringify\(initial\)/);
});

test("la sélection reste Pro, propriétaire, next sécurisé et limitée à l’onglet", async () => {
  const page = await read("src/app/pro/selection-etablissement/page.tsx");
  const list = await read("src/components/pro/EstablishmentSelectionList.tsx");
  assert.match(page, /school\.forfait === "pro" && school\.accessSources\.includes\("owner"\)/);
  assert.match(page, /safeProReturnPath\(params\.next\)/);
  assert.match(page, /ownedRequestedSchoolId/);
  assert.match(page, /withEstablishmentQuery\("\/pro\/acces-restreint", ownedRequestedSchoolId\)/);
  assert.match(page, /Contexte limité à cet onglet/);
  assert.match(list, /withEstablishmentQuery\(returnPath, id\)/);
  assert.match(list, /schools\.some\(\(school\) => school\.id === id\)/);
});

test("les imports restent inactifs et seul le parcours manuel est contextualisé", async () => {
  const page = await read("src/app/pro/configurer-etablissement/page.tsx");
  assert.equal((page.match(/href: null/g) ?? []).length, 2);
  assert.equal((page.match(/status: "Bientôt disponible"/g) ?? []).length, 2);
  assert.match(page, /href: "\/pro\/matieres"/);
  assert.match(page, /withEstablishmentQuery\(mode\.href, establishment\.id\)/);
  assert.match(page, /requireActiveEstablishment/);
  assert.doesNotMatch(page, /accept=|type="file"|\.upload\(|progress/);
});

test("les tests de la vague restent structurels et sans client distant", async () => {
  const source = await read("tests/school-admin-infrastructure-settings.test.mjs");
  assert.match(source, /node:fs\/promises/);
  assert.doesNotMatch(source, /from ["']@supabase|from ["']@\/lib\/supabase/);
});
