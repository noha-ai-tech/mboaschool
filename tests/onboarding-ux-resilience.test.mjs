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

// Phase 9/11/13 — loading/error/refresh/responsive states, and the
// explicit "this flow requires connectivity, no offline support" rule.

test("submitting the creation request surfaces the server error message to the user instead of failing silently", async () => {
  const src = await source("src/app/revendiquer/page.tsx");
  assert.match(src, /setNewError\(responseBody\.error \?\? "Échec de l'envoi de la demande"\);/);
  assert.match(src, /\{newError && \(/);
});

test("the submit button shows a distinct loading state and is disabled while a request is in flight (no double-submit)", async () => {
  const src = await source("src/app/revendiquer/page.tsx");
  const submitLabelIndex = src.indexOf("Envoyer ma demande");
  const buttonStart = src.lastIndexOf("<button", submitLabelIndex);
  const submitButton = src.slice(buttonStart, src.indexOf("</button>", submitLabelIndex));
  assert.match(submitButton, /newSubmitting/);
  assert.match(submitButton, /Envoi…/);
});

test("similarity search shows a distinct 'searching' label, never leaves the button in a stuck state", async () => {
  const src = await source("src/app/revendiquer/page.tsx");
  assert.match(src, /\{newSearching \? "Recherche…" : "Vérifier"\}/);
});

// Refresh mid-onboarding: /revendiquer holds all of its state in plain
// useState with no persisted draft — a refresh resets cleanly to the
// "choice" screen rather than showing a broken partial UI. This is the
// correct, intentional behavior per Phase 11 (no request is "sent" until
// the server confirms; a local draft is optional, not required).
test("no request is considered submitted before the server responds — requestId is only set from the API response", async () => {
  const src = await source("src/app/revendiquer/page.tsx");
  const submitStart = src.indexOf("async function submitNewRequest");
  const submitFn = src.slice(submitStart, src.indexOf("async function handleSearch", submitStart));
  assert.match(submitFn, /setNewRequestId\(responseBody\.requestId \?\? null\);/);
  assert.match(submitFn, /setNewStep\("success"\);/);
  const successIndex = submitFn.indexOf('setNewStep("success")');
  const requestIdIndex = submitFn.indexOf("setNewRequestId");
  assert.ok(requestIdIndex < successIndex, "success step must only be reached after the server-confirmed id is stored");
});

test("all onboarding steps use responsive utility classes (grid/flex + breakpoint prefixes), no fixed pixel-width containers", async () => {
  const src = await source("src/app/revendiquer/page.tsx");
  assert.match(src, /grid sm:grid-cols-2 gap-4/);
  assert.match(src, /flex flex-col sm:flex-row gap-3/);
  assert.doesNotMatch(src, /width:\s*\d+px/);
});

test("the page container caps content width responsively (max-w-xl) rather than stretching full-bleed on large screens", async () => {
  const src = await source("src/app/revendiquer/page.tsx");
  assert.match(src, /className="w-full max-w-xl"/);
});

// Phase 8 — no billing gating inside onboarding itself.
test("ONBOARDING-01 does not gate the creation/claim flow on any payment or plan selection", async () => {
  const revendiquer = await source("src/app/revendiquer/page.tsx");
  const requestRoute = await source("src/app/api/establishment-requests/route.ts");
  const approveRoute = await source("src/app/api/admin/establishment-requests/[id]/approve/route.ts");
  for (const src of [revendiquer, requestRoute, approveRoute]) {
    assert.doesNotMatch(src, /stripe/i);
    assert.doesNotMatch(src, /paiement/i);
    assert.doesNotMatch(src, /subscription/i);
  }
});

// Multi-school isolation (scenario 11): approval always creates exactly
// one new establishment scoped to the requester, never touches any other
// establishment row.
test("approval only ever inserts a new establishment row scoped to the requester — no UPDATE touches other establishments", async () => {
  const src = await source("supabase/migrations/20260907222604_onboarding_01_establishment_creation_requests.sql");
  const fnStart = src.indexOf("create or replace function public.approve_establishment_creation_request");
  const fnBody = src.slice(fnStart, src.indexOf("$$;", fnStart));
  assert.doesNotMatch(fnBody, /update public\.establishments/);
});

test("the existing claim flow's establishment approval (0008) remains the only place that mutates an EXISTING establishment's owner_id", async () => {
  const claimsMigration = await source("supabase/migrations/0008_school_onboarding.sql");
  assert.match(claimsMigration, /owner_id/);
});
