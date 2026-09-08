import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const docRoot = "docs/pro";
const migrationPath = `${docRoot}/PRO-03_3_PROPOSED_MIGRATION.sql`;

async function source(path) {
  return readFile(path, "utf8");
}

test("all nine PRO-03.3 design deliverables are prepared and not executed", async () => {
  const names = [
    "PRO-03_3_CURRENT_INFRASTRUCTURE_AUDIT.md",
    "PRO-03_3_ARCHITECTURE_DECISION.md",
    "PRO-03_3_THREAT_MODEL.md",
    "PRO-03_3_DELIVERY_SEQUENCE.md",
    "PRO-03_3_RLS_AND_PRIVILEGE_MODEL.md",
    "PRO-03_3_TEST_MATRIX.md",
    "PRO-03_3_PROPOSED_MIGRATION.sql",
    "PRO-03_3_IMPLEMENTATION_PLAN.md",
    "PRO-03_3_ROLLBACK_PLAN.md",
  ];

  for (const name of names) {
    const text = await source(`${docRoot}/${name}`);
    assert.ok(text.length > 200, `${name} must be substantive`);
    assert.match(text, /(NOT EXECUTED|NOT APPLIED|NOT VALIDATED|DESIGN ONLY|PREPARED ONLY)/i);
  }
});

test("issuer is a private function-only capability and public RPC posture stays closed", async () => {
  const sql = await source(migrationPath);

  assert.match(sql, /create role invitation_issuer nologin noinherit/i);
  assert.match(sql, /revoke all on schema private from public, anon, authenticated, service_role/i);
  assert.match(sql, /revoke all on table private\.targeted_invitation_delivery_attempts[\s\S]*invitation_issuer/i);
  assert.match(sql, /grant execute on function private\.issue_targeted_invitation\([\s\S]*to invitation_issuer/i);
  assert.doesNotMatch(sql, /grant execute on function private\.issue_targeted_invitation\([\s\S]{0,180}to (authenticated|service_role|anon|public)/i);

  assert.match(sql, /revoke execute on function public\.create_targeted_invitation\([\s\S]*public, anon, authenticated, service_role, invitation_issuer/i);
  assert.match(sql, /revoke execute on function public\.revoke_targeted_invitation\(uuid, text\)[\s\S]*public, anon, authenticated, service_role, invitation_issuer/i);
  assert.match(sql, /grant execute on function public\.consume_targeted_invitation\(text\)[\s\S]*to authenticated/i);
  assert.doesNotMatch(sql, /grant execute on function public\.create_targeted_invitation/i);
  assert.doesNotMatch(sql, /grant execute on function public\.revoke_targeted_invitation/i);
});

test("database proposal independently checks actor, school, resource and delivery lifecycle", async () => {
  const sql = await source(migrationPath);

  assert.match(sql, /from auth\.users actor where actor\.id = p_actor_id/i);
  assert.match(sql, /establishment\.id = p_establishment_id[\s\S]*establishment\.owner_id = p_actor_id/i);
  assert.match(sql, /teacher\.id = p_resource_id[\s\S]*teacher\.etablissement_id = p_establishment_id/i);
  assert.match(sql, /staff\.id = p_resource_id[\s\S]*staff\.etablissement_id = p_establishment_id/i);
  assert.match(sql, /lower\(btrim\(teacher\.email\)\) = v_email/i);
  assert.match(sql, /lower\(btrim\(staff\.email\)\) = v_email/i);

  assert.match(sql, /idempotency_key uuid not null unique/i);
  assert.match(sql, /pg_advisory_xact_lock/i);
  assert.match(sql, /targeted_invitation_attempt_actor_school_idx/i);
  assert.match(sql, /invitation actor rate limit exceeded/i);
  assert.match(sql, /invitation resource rate limit exceeded/i);
  assert.match(sql, /consumed_at is null or delivery_status = 'delivered'/i);
  assert.match(sql, /invitation has not been delivered/i);
  assert.match(sql, /delivery_failed:STALE_PENDING/i);
});

test("current invitation HTTP surface remains closed and token-free", async () => {
  const http = await source("src/lib/invitations/issuerHttp.ts");
  const wiring = await source("src/lib/invitations/issuerServerWiring.ts");
  const routes = [
    "src/app/api/enseignants/[id]/inviter/route.ts",
    "src/app/api/personnel/[id]/inviter/route.ts",
  ];

  for (const route of routes) {
    const text = await source(route);
    assert.match(text, /isInvitationIssuerExplicitlyEnabled/);
    assert.match(text, /invitationIssuerLockedResponse/);
    assert.doesNotMatch(text, /\.rpc\(\s*["']create_targeted_invitation/);
    assert.doesNotMatch(text, /createAdminClient/);
    assert.doesNotMatch(text, /raw_token|invitationToken/i);
  }
  assert.match(wiring, /state: "locked"/);
  assert.match(http, /TARGETED_INVITATIONS_NOT_DEPLOYED/);
  assert.match(http, /invitationIssuerLockedResponse[\s\S]*503/);

  const decision = await source(`${docRoot}/PRO-03_3_ARCHITECTURE_DECISION.md`);
  assert.match(decision, /non-secret landing URL/i);
  assert.match(decision, /code in its body/i);
  assert.match(decision, /store only the hexadecimal SHA-256 hash/i);
});
