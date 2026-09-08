import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("création de ticket et réponse conservent les contrats existants", async () => {
  const page = await read("src/app/dashboard/ecole/support/page.tsx");
  assert.match(page, /from\("support_tickets"\)\.insert\(\{ establishment_id: school\.id, created_by: user\?\.id, subject: subject\.trim\(\) \}\)/);
  assert.match(page, /from\("support_ticket_messages"\)\.insert\(\{ ticket_id: ticket\.id, author_id: user\?\.id, body: description\.trim\(\) \}\)/);
  assert.match(page, /from\("support_ticket_messages"\)\.insert\(\{ ticket_id: selected\.id, author_id: user\?\.id, body: reply\.trim\(\) \}\)/);
  assert.match(page, /from\("support_tickets"\)\.update\(\{ updated_at: new Date\(\)\.toISOString\(\) \}\)\.eq\("id", selected\.id\)/);
});

test("les tickets restent isolés par établissement et les messages chronologiques", async () => {
  const page = await read("src/app/dashboard/ecole/support/page.tsx");
  assert.match(page, /from\("support_tickets"\)\.select\("\*"\)\.eq\("establishment_id", school\.id\)/);
  assert.match(page, /tickets\.some\(\(\{ id \}\) => id === ticket\.id\)/);
  assert.match(page, /eq\("ticket_id", ticket\.id\)\.order\("created_at", \{ ascending: true \}\)/);
  for (const status of ["ouvert", "en_cours", "en_attente", "resolu", "ferme"]) assert.match(page, new RegExp(`${status}:`));
  assert.doesNotMatch(page, /pièce jointe|priorité|assigner|notification|fermer le ticket/i);
});

test("le support utilise formulaires, états et drawer accessibles", async () => {
  const page = await read("src/app/dashboard/ecole/support/page.tsx");
  assert.match(page, /SchoolAdminDialog/); assert.match(page, /SchoolAdminDrawer/);
  assert.match(page, /aria-live="polite"/); assert.match(page, /SchoolAdminFormField/);
  assert.match(page, /loading=\{submitting\}/); assert.match(page, /loading=\{replying\}/);
  assert.match(page, /tickets\.length === 0/); assert.match(page, /messages\.length === 0/);
});

test("les statistiques lisent uniquement applications.created_at", async () => {
  const page = await read("src/app/dashboard/ecole/statistiques/page.tsx");
  assert.match(page, /from\("applications"\)\.select\("created_at"\)\.eq\("establishment_id", school\.id\)/);
  assert.doesNotMatch(page, /select\("\*"\)|parent_|student_|notes|email|phone|tracking_code/);
  assert.doesNotMatch(page, /Demandes de contact/);
  assert.match(page, /applications\.length/); assert.match(page, /age > 30 && age <= 60/);
  assert.match(page, /last30Days - previous30Days/);
});

test("le graphique offre les valeurs textuelles et aucun indicateur fictif", async () => {
  const page = await read("src/app/dashboard/ecole/statistiques/page.tsx");
  assert.match(page, /role="img"/); assert.match(page, /<ul className="sr-only">/);
  assert.match(page, /Aucune mesure de visites, de contacts, de pages vues, de conversion ou de popularité n’est disponible/);
  assert.doesNotMatch(page, /label="Visiteurs"|label="Pages vues"|label="Popularité"/);
});

test("les tests restent structurels et sans écriture réelle", async () => {
  const source = await read("tests/school-admin-support-statistics.test.mjs");
  assert.match(source, /node:fs\/promises/);
  assert.doesNotMatch(source, /from ["']@supabase|from ["']@\/lib\/supabase/);
});
