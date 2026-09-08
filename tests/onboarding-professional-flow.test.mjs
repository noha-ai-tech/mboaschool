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

// ONBOARDING-01 — reuses the EXISTING post-login destination logic
// (src/app/auth/connexion/page.tsx) as the single source of truth for
// "onboardingRequired": a fresh professional account with no accessible
// establishment already lands on /revendiquer today (fixed for real
// navigation by the AUTH P0 hotfix) — this mission does not touch that
// routing at all, only builds out what /revendiquer offers once there.

test("REGRESSION — connexion page still sends users without an establishment to /revendiquer (onboarding gate unchanged)", async () => {
  const src = await source("src/app/auth/connexion/page.tsx");
  assert.match(src, /destination = hasSchool \? "\/dashboard\/ecole" : "\/revendiquer";/);
});

test("REGRESSION — connexion page still sends users WITH an establishment straight to their dashboard", async () => {
  const src = await source("src/app/auth/connexion/page.tsx");
  assert.match(src, /let hasSchool = true;/);
  assert.match(src, /hasSchool = \(payload\.establishments\?\.length \?\? 0\) > 0;/);
});

test("REGRESSION — connexion page still uses window.location.href for post-login navigation (AUTH P0 fix untouched)", async () => {
  const src = await source("src/app/auth/connexion/page.tsx");
  assert.match(src, /window\.location\.href = destination;/);
  assert.doesNotMatch(src, /router\.push\(destination\)/);
});

// Non-admin cannot approve — both the creation-request routes and the RPC
// itself enforce this independently (defense in depth: even if a route's
// own check were ever removed, the RPC re-checks before writing anything).
test("admin approve route rejects non-platform_admin users", async () => {
  const src = await source("src/app/api/admin/establishment-requests/[id]/approve/route.ts");
  assert.match(src, /profile\?\.role !== "platform_admin"/);
  assert.match(src, /status: 403/);
});

test("admin reject route rejects non-platform_admin users", async () => {
  const src = await source("src/app/api/admin/establishment-requests/[id]/reject/route.ts");
  assert.match(src, /profile\?\.role !== "platform_admin"/);
  assert.match(src, /status: 403/);
});

test("the approval RPC itself re-verifies platform_admin, independent of the calling route", async () => {
  const src = await source("supabase/migrations/20260907222604_onboarding_01_establishment_creation_requests.sql");
  assert.match(src, /role = 'platform_admin'/);
  assert.match(src, /raise exception 'Accès refusé/);
});

// Approval must be one atomic operation: establishment created AND
// request marked approved together, never one without the other.
test("approval creates the establishment and updates the request status inside the same function (atomic)", async () => {
  const src = await source("supabase/migrations/20260907222604_onboarding_01_establishment_creation_requests.sql");
  const fnStart = src.indexOf("create or replace function public.approve_establishment_creation_request");
  const fnBody = src.slice(fnStart, src.indexOf("$$;", fnStart));
  assert.match(fnBody, /insert into public\.establishments/);
  assert.match(fnBody, /update public\.establishment_creation_requests/);
  assert.match(fnBody, /status = 'approved'/);
  assert.match(fnBody, /returning id into v_new_establishment_id/);
  assert.match(fnBody, /created_establishment_id = v_new_establishment_id/);
});

test("approval locks the request row (FOR UPDATE) to prevent two admins approving the same request concurrently", async () => {
  const src = await source("supabase/migrations/20260907222604_onboarding_01_establishment_creation_requests.sql");
  assert.match(src, /for update; -- verrou/);
});

test("approval refuses to re-process a request that is already approved/rejected", async () => {
  const src = await source("supabase/migrations/20260907222604_onboarding_01_establishment_creation_requests.sql");
  assert.match(src, /v_request\.status not in \('pending', 'under_review'\)/);
});

// Rejection must never create a public establishment.
test("reject route never inserts into or updates the establishments table", async () => {
  const src = await source("src/app/api/admin/establishment-requests/[id]/reject/route.ts");
  assert.doesNotMatch(src, /from\("establishments"\)/);
});

test("the migration is prepared but documented as not yet applied to production", async () => {
  const src = await source("supabase/migrations/20260907222604_onboarding_01_establishment_creation_requests.sql");
  assert.match(src, /PRÉPARÉE MAIS NON EXÉCUTÉE/);
});
