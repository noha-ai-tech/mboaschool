import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(testDirectory, "..");

async function source(relativePath) {
  return readFile(path.join(projectRoot, relativePath), "utf8");
}

const ROSTER_PAGE = "src/app/dashboard/ecole/classes/[id]/eleves/page.tsx";

test("the roster page is nested under the existing canonical classes route, not a parallel top-level route", async () => {
  // La présence même du fichier à ce chemin prouve le nesting ; on
  // vérifie en plus qu'il pointe bien vers la page de classe existante.
  const src = await source(ROSTER_PAGE);
  assert.match(src, /Retour à la classe/);
});

test("add/edit/import never let the client set establishment_id — always taken from the already-loaded, authorized class context", async () => {
  const src = await source(ROSTER_PAGE);
  const insertCalls = [...src.matchAll(/establishment_id: ([a-zA-Z_.]+),/g)].map((m) => m[1]);
  assert.ok(insertCalls.length >= 2, "expected establishment_id set on both manual add and import inserts");
  for (const value of insertCalls) {
    assert.equal(value, "classe.establishment_id", `establishment_id must always come from the loaded class, got "${value}"`);
  }
});

test("the CSV import never reads establishment_id or classe_id from the pasted text — only last_name/first_name are parsed", async () => {
  const src = await source(ROSTER_PAGE);
  const parseFn = src.slice(src.indexOf("function parseImportText"), src.indexOf("async function confirmImport"));
  // La fonction elle-même ne doit produire que { last_name, first_name } —
  // son propre commentaire explicatif mentionne "establishment_id/classe_id"
  // pour documenter ce qui N'est PAS lu, d'où l'assertion positive plutôt
  // qu'une recherche de sous-chaîne globale.
  assert.doesNotMatch(parseFn, /rows\.push\(\{[^}]*(?:establishment_id|classe_id)/);
  assert.match(parseFn, /last_name: parts\[0\], first_name: parts\[1\]/);
});

test("CSV import enforces a maximum row count server never trusted to self-limit", async () => {
  const src = await source(ROSTER_PAGE);
  assert.match(src, /const MAX_IMPORT_ROWS = 200;/);
  assert.match(src, /lines\.length > MAX_IMPORT_ROWS/);
  assert.match(src, /lines\.slice\(0, MAX_IMPORT_ROWS\)/);
});

test("CSV import reports per-line errors rather than silently dropping malformed rows", async () => {
  const src = await source(ROSTER_PAGE);
  assert.match(src, /Ligne \$\{index \+ 1\} ignorée/);
});

test("removal is archive (status update), never a hard DELETE — student_attendance history must survive", async () => {
  const src = await source(ROSTER_PAGE);
  assert.doesNotMatch(src, /\.from\("students"\)\.delete\(/);
  assert.match(src, /status: nextStatus/);
  assert.match(src, /nextStatus = archiveTarget\.status === "active" \? "archived" : "active"/);
});

test("archived students can be restored (toggle back to active), not just removed one-way", async () => {
  const src = await source(ROSTER_PAGE);
  assert.match(src, /Réactiver/);
});

test("no UNIQUE-by-name assumption anywhere in the UI — homonyms are expected and never merged or blocked client-side", async () => {
  const src = await source(ROSTER_PAGE);
  assert.doesNotMatch(src, /duplicate|homonym|already exists/i);
});

test("the roster page collects only first_name/last_name — no medical, academic, or payment form fields", async () => {
  const src = await source(ROSTER_PAGE);
  // Vérifie les champs de FORMULAIRE réellement rendus (SchoolAdminFormField),
  // pas une recherche de sous-chaîne globale — le commentaire d'en-tête du
  // fichier mentionne lui-même ces mots pour expliquer ce qui N'est PAS
  // collecté.
  const formFieldLabels = [...src.matchAll(/<SchoolAdminFormField id="[^"]+" label="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(
    formFieldLabels.sort(),
    ["Classe", "Liste (nom,prenom — une ligne par élève)", "Nom", "Nom", "Prénom", "Prénom"].sort(),
    "only name/class fields should exist across the add/edit/import forms"
  );
});

test("empty states are honest and distinguish 'no students at all' from 'no match for this search'", async () => {
  const src = await source(ROSTER_PAGE);
  assert.match(src, /Aucun élève enregistré/);
  assert.match(src, /Aucun élève pour cette recherche/);
});

test("search is client-side over the already-scoped (single class) roster, not a separate unscoped query", async () => {
  const src = await source(ROSTER_PAGE);
  assert.doesNotMatch(src, /\.ilike\(/);
  assert.match(src, /visibleStudents\.filter/);
});

test("the class detail page links to the roster management page and shows the real (public.students) count, not the manual 'effectif' estimate", async () => {
  const src = await source("src/app/dashboard/ecole/classes/[id]/page.tsx");
  assert.match(src, /\/eleves`/);
  assert.match(src, /\.from\("students"\)\.select\("id", \{ count: "exact", head: true \}\)\.eq\("classe_id", classId\)\.eq\("status", "active"\)/);
});

// ============================================================================
// Migration (lifecycle) structure
// ============================================================================

const LIFECYCLE_MIGRATION = "supabase/migrations/20260911090000_mobile_01_1_student_lifecycle.sql";
const ORIGINAL_MIGRATION = "supabase/migrations/20260910120000_mobile_01_student_roster_attendance.sql";

test("the lifecycle migration is a NEW file — the original MOBILE-01 migration is never modified retroactively", async () => {
  const original = await source(ORIGINAL_MIGRATION);
  assert.doesNotMatch(original, /status text not null default 'active'/, "the original migration file must remain exactly as committed for MOBILE-01");
});

test("the status column is added additively with a safe default — no existing row is affected", async () => {
  const src = await source(LIFECYCLE_MIGRATION);
  assert.match(src, /add column if not exists status text not null default 'active'/);
  assert.match(src, /check \(status in \('active', 'archived'\)\)/);
});

test("sync_apply_attendance_mark is redefined via CREATE OR REPLACE, not an ALTER of the original file", async () => {
  const src = await source(LIFECYCLE_MIGRATION);
  assert.match(src, /create or replace function public\.sync_apply_attendance_mark/);
});

test("the redefined RPC excludes archived students from the authorized marking scope", async () => {
  const src = await source(LIFECYCLE_MIGRATION);
  const fnStart = src.indexOf("create or replace function public.sync_apply_attendance_mark");
  const fnBody = src.slice(fnStart, src.indexOf("$$;", fnStart));
  assert.match(fnBody, /s\.status = 'active'/);
});

test("marked as not applied to production, like every other migration this sprint", async () => {
  const src = await source(LIFECYCLE_MIGRATION);
  assert.match(src, /PRÉPARÉE MAIS NON EXÉCUTÉE/);
});

test("no attendance history table is touched by the lifecycle migration — only students gains a column, the RPC is redefined", async () => {
  const src = await source(LIFECYCLE_MIGRATION);
  assert.doesNotMatch(src, /alter table public\.student_attendance/);
  assert.doesNotMatch(src, /delete from public\.student_attendance/i);
  assert.doesNotMatch(src, /drop table/i);
});

// ============================================================================
// Teacher-facing roster reads exclude archived students
// ============================================================================

test("the teacher home page's roster cache only includes active students", async () => {
  const src = await source("src/app/enseignant/page.tsx");
  assert.match(src, /\.from\("students"\)\.select\("id, classe_id, first_name, last_name"\)\.in\("classe_id", classeIdsAujourdhui\)\.eq\("status", "active"\)/);
});

test("the course workspace roster query only includes active students", async () => {
  const src = await source("src/app/enseignant/cours/[id]/page.tsx");
  assert.match(src, /\.eq\("classe_id", edt\.classe_id\)\s*\n\s*\.eq\("status", "active"\)/);
});
