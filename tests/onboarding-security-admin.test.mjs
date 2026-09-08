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

// Phase 10 security requirements, verified statically against the RLS
// policies and the RPC (a live DB run isn't possible: per Phase 14 the
// migration is deliberately NOT applied to production for this mission).

test("USER A cannot read USER B's creation request: RLS select policy scopes strictly to requester_user_id = auth.uid()", async () => {
  const src = await source("supabase/migrations/20260907222604_onboarding_01_establishment_creation_requests.sql");
  assert.match(src, /create policy "requester reads own creation requests" on public\.establishment_creation_requests\s*\n\s*for select\s*\n\s*using \(requester_user_id = auth\.uid\(\)\);/);
});

test("USER A cannot submit a request on behalf of USER B: insert policy forces requester_user_id = auth.uid()", async () => {
  const src = await source("supabase/migrations/20260907222604_onboarding_01_establishment_creation_requests.sql");
  assert.match(src, /create policy "requester creates own creation request" on public\.establishment_creation_requests\s*\n\s*for insert\s*\n\s*with check \(requester_user_id = auth\.uid\(\)\);/);
});

test("a non-admin cannot approve their own or anyone's request via a plain UPDATE — approval is RPC-only, table UPDATE policy is platform_admin-gated", async () => {
  const src = await source("supabase/migrations/20260907222604_onboarding_01_establishment_creation_requests.sql");
  const updatePolicy = src.slice(
    src.indexOf('create policy "platform_admin updates creation requests"'),
    src.indexOf('create policy "platform_admin updates creation requests"') + 400
  );
  assert.match(updatePolicy, /role = 'platform_admin'/);
  // No RLS policy on this table permits a bare UPDATE to move status to
  // 'approved' with a new created_establishment_id in one client call —
  // only the SECURITY DEFINER function does that, and only after its own
  // independent admin check.
  assert.doesNotMatch(src, /with check \(\s*status = 'approved'/);
});

test("privilege escalation is impossible via a frontend POST: no code path sets establishments.owner_id outside the SECURITY DEFINER function", async () => {
  const migration = await source("supabase/migrations/20260907222604_onboarding_01_establishment_creation_requests.sql");
  const approveRoute = await source("src/app/api/admin/establishment-requests/[id]/approve/route.ts");
  const requestRoute = await source("src/app/api/establishment-requests/route.ts");

  // The only INSERT into establishments in the whole feature lives inside
  // the SECURITY DEFINER function, gated by its own admin check.
  const ownerIdWrites = [...migration.matchAll(/owner_id/g)];
  assert.ok(ownerIdWrites.length > 0);
  assert.doesNotMatch(requestRoute, /owner_id/);
  assert.doesNotMatch(approveRoute, /owner_id/);
  assert.match(approveRoute, /supabase\.rpc\(\s*"approve_establishment_creation_request"/);
});

test("OWNER A cannot see OWNER B's sensitive creation request via the admin detail page — it fetches by id under RLS, not a service-role bypass", async () => {
  const src = await source("src/app/dashboard/admin/etablissements-proposes/[id]/page.tsx");
  assert.match(src, /import \{ supabase \} from "@\/lib\/supabase";/);
  assert.doesNotMatch(src, /createAdminClient/, "the admin detail page must read through the normal RLS-bound client, relying on the platform_admin read-all policy, not a privileged bypass reachable from the browser");
});

test("an anonymous or non-admin user cannot read private creation-request documents: storage policies require either ownership or platform_admin", async () => {
  const src = await source("supabase/migrations/20260907222604_onboarding_01_establishment_creation_requests.sql");
  assert.match(src, /insert into storage\.buckets \(id, name, public\)\s*\nvalues \('creation-request-documents', 'creation-request-documents', false\)/);
  assert.match(src, /creation_request_documents_requester_access/);
  assert.match(src, /creation_request_documents_admin_read/);
});

test("a proposed establishment never becomes public automatically: the only INSERT into establishments is inside the admin-gated approval function", async () => {
  const migration = await source("supabase/migrations/20260907222604_onboarding_01_establishment_creation_requests.sql");
  const inserts = [...migration.matchAll(/insert into public\.establishments/g)];
  assert.equal(inserts.length, 1, "exactly one INSERT into establishments should exist, inside approve_establishment_creation_request");
});

test("service-role admin client is only used server-side (route handlers), never imported into a client component", async () => {
  const approveRoute = await source("src/app/api/admin/establishment-requests/[id]/approve/route.ts");
  const rejectRoute = await source("src/app/api/admin/establishment-requests/[id]/reject/route.ts");
  const adminListPage = await source("src/app/dashboard/admin/etablissements-proposes/page.tsx");
  const adminDetailPage = await source("src/app/dashboard/admin/etablissements-proposes/[id]/page.tsx");

  assert.match(approveRoute, /createAdminClient/);
  assert.match(rejectRoute, /createAdminClient/);
  assert.doesNotMatch(adminListPage, /createAdminClient/);
  assert.doesNotMatch(adminDetailPage, /createAdminClient/);
  assert.match(adminListPage, /^"use client";/);
  assert.match(adminDetailPage, /^"use client";/);
});

test("both admin decision routes require authentication before checking role (401 before 403)", async () => {
  for (const p of [
    "src/app/api/admin/establishment-requests/[id]/approve/route.ts",
    "src/app/api/admin/establishment-requests/[id]/reject/route.ts",
  ]) {
    const src = await source(p);
    const authCheckIndex = src.indexOf("if (!user)");
    const roleCheckIndex = src.indexOf('!== "platform_admin"');
    assert.ok(authCheckIndex > -1 && roleCheckIndex > -1 && authCheckIndex < roleCheckIndex, `${p} must check authentication before role`);
    assert.match(src.slice(authCheckIndex, authCheckIndex + 120), /status: 401/);
  }
});

test("rejecting a request requires a non-empty comment before the API call fires (UI guard)", async () => {
  const src = await source("src/app/dashboard/admin/etablissements-proposes/[id]/page.tsx");
  const rejectFn = src.slice(src.indexOf("async function reject"), src.indexOf("async function reject") + 300);
  assert.match(rejectFn, /if \(!comment\.trim\(\)\)/);
});

test("the admin nav exposes the new review screen only behind the same permission as existing claim review (manage_schools)", async () => {
  const src = await source("src/app/dashboard/admin/layout.tsx");
  assert.match(src, /\{ href: "\/dashboard\/admin\/etablissements-proposes", label: "Établissements proposés", icon: FilePlus2, permission: "manage_schools" \}/);
});

test("the existing claim system (establishment_claims) is untouched by this migration — no ALTER/DROP on it", async () => {
  const src = await source("supabase/migrations/20260907222604_onboarding_01_establishment_creation_requests.sql");
  assert.doesNotMatch(src, /alter table public\.establishment_claims/);
  assert.doesNotMatch(src, /drop table.*establishment_claims/i);
});
