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

// Scenario 1 — /revendiquer is the reused onboarding gate: the "choice"
// step offers both CTAs the mission requires, side by side.
test("choice step offers both required CTAs: claim existing vs. propose new", async () => {
  const src = await source("src/app/revendiquer/page.tsx");
  assert.match(src, /Revendiquer un établissement existant/);
  assert.match(src, /Inscrire un nouvel établissement/);
  assert.match(src, /onClick=\{\(\) => setMode\("search"\)\}/);
  assert.match(src, /onClick=\{\(\) => setMode\("new"\)\}/);
});

// Scenario 3 — search an existing, already-referenced school.
test("search mode queries the real establishments table by name/city, no hardcoded list", async () => {
  const src = await source("src/app/revendiquer/page.tsx");
  const searchFn = src.slice(src.indexOf("async function handleSearch"), src.indexOf("async function handleSearch") + 800);
  assert.match(searchFn, /\.from\("establishments"\)/);
  assert.match(searchFn, /\.or\(`name\.ilike\.%\$\{query\}%,city\.ilike\.%\$\{query\}%`\)/);
});

// Scenario 4 — selecting an existing school must lead to the claim
// request flow (existing /revendiquer/[id] wizard), never a direct grant.
test("selecting a found establishment routes into the existing claim wizard, never mutates owner_id directly", async () => {
  const src = await source("src/app/revendiquer/page.tsx");
  assert.match(src, /href=\{`\/revendiquer\/\$\{selected\.id\}`\}/);
  // owner_id is read (to detect an already-claimed school) but this page
  // must never contain an UPDATE/SET that writes it — that would be the
  // explicitly forbidden "UPDATE establishments SET owner_id = auth.uid()
  // depuis le navigateur sans validation".
  assert.doesNotMatch(src, /\.update\(/);
  assert.doesNotMatch(src, /owner_id\s*[:=]\s*(?!null)/);
});

test("an establishment that already has an owner is shown as unavailable to claim, not clickable", async () => {
  const src = await source("src/app/revendiquer/page.tsx");
  assert.match(src, /r\.ownerId \? \(\s*<span className="shrink-0 text-xs text-text-secondary">Déjà géré<\/span>/);
});

// Scenario 5 — similar establishment detected during the "missing school"
// flow must be surfaced with a way to choose it instead of creating a dup.
test("the missing-establishment flow runs an anti-duplicate search before allowing the creation form", async () => {
  const src = await source("src/app/revendiquer/page.tsx");
  assert.match(src, /mode === "new" && newStep === "similarity"/);
  assert.match(src, /Des établissements similaires existent déjà/);
  assert.match(src, /Choisir cet établissement/);
});

test("choosing a similar establishment from the anti-duplicate check reuses the SAME confirm/claim step as direct search", async () => {
  const src = await source("src/app/revendiquer/page.tsx");
  assert.match(src, /onClick=\{\(\) => \{ setSelected\(r\); setConfirmOrigin\("new"\); setMode\("confirm"\); \}\}/);
});

// Scenario 6 — no similar establishment found -> proceed to the creation
// request form, but only after an explicit user confirmation.
test("proceeding to the creation form requires an explicit 'none of these match' action, not automatic fallthrough", async () => {
  const src = await source("src/app/revendiquer/page.tsx");
  assert.match(src, /Aucun de ces établissements ne correspond — continuer/);
  assert.match(src, /onClick=\{\(\) => proceedToForm\(null\)\}/);
});

test("the creation form requires the minimal necessary fields only (name, phone, email, requester identity, role)", async () => {
  const src = await source("src/app/revendiquer/page.tsx");
  const formStepStart = src.indexOf('mode === "new" && newStep === "form"');
  const disabledBlock = src.slice(src.indexOf("disabled={", formStepStart), src.indexOf("onClick={submitNewRequest}"));
  assert.match(disabledBlock, /!newForm\.proposed_name\.trim\(\)/);
  assert.match(disabledBlock, /!newForm\.proposed_phone\.trim\(\)/);
  assert.match(disabledBlock, /!newForm\.proposed_email\.trim\(\)/);
  assert.match(disabledBlock, /!newForm\.first_name\.trim\(\)/);
  assert.match(disabledBlock, /!newForm\.last_name\.trim\(\)/);
  assert.match(disabledBlock, /!newForm\.role_title\.trim\(\)/);
});

test("the creation form never asks for a region/department hierarchy the schema doesn't reliably have", async () => {
  const src = await source("src/app/revendiquer/page.tsx");
  assert.doesNotMatch(src, /proposed_region/);
  assert.doesNotMatch(src, /proposed_department/);
});

test("the creation form explicitly tells the user the establishment is not public until admin approval", async () => {
  const src = await source("src/app/revendiquer/page.tsx");
  assert.match(src, /votre établissement n&apos;apparaît pas publiquement tant que la demande n&apos;est pas approuvée/);
});

test("submission posts to the dedicated establishment-requests API, never writes to establishments directly from the client", async () => {
  const src = await source("src/app/revendiquer/page.tsx");
  const submitStart = src.indexOf("async function submitNewRequest");
  const submitFn = src.slice(submitStart, src.indexOf("async function handleSearch", submitStart));
  assert.match(submitFn, /fetch\("\/api\/establishment-requests", \{/);
  assert.match(submitFn, /method: "POST"/);
  assert.doesNotMatch(submitFn, /\.from\("establishments"\)/);
});

// Back-navigation correctness: whichever path led to the shared "confirm"
// step must be the path "back" returns to (a UX bug caught and fixed
// during implementation — this guards the regression).
test("the shared confirm step returns to the correct origin flow on back (search vs. new-establishment similarity check)", async () => {
  const src = await source("src/app/revendiquer/page.tsx");
  const matches = [...src.matchAll(/if \(confirmOrigin === "new"\) \{ setNewStep\("similarity"\); setMode\("new"\); \} else \{ setMode\("search"\); \}/g)];
  assert.ok(matches.length >= 2, "both back buttons on the confirm step must branch on confirmOrigin");
});
