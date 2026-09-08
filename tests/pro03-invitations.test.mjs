import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sqlPath = "docs/pro/PRO-03_1_INVITATIONS_PROPOSED.sql";

async function source(path) {
  return readFile(path, "utf8");
}

function consumeModel(original, input) {
  const next = structuredClone(original);
  const fail = () => {
    throw new Error("invalid invitation");
  };

  if (!input.authenticated || input.email.trim().toLowerCase() !== next.recipientEmail) fail();
  if (next.establishmentId !== input.establishmentId) fail();
  if (next.expired || next.revoked || next.consumed) fail();
  if (next.teacher && next.teacher.establishmentId !== next.establishmentId) fail();
  if (next.staff && next.staff.establishmentId !== next.establishmentId) fail();
  if (next.teacher?.email && next.teacher.email !== next.recipientEmail) fail();
  if (next.staff?.email && next.staff.email !== next.recipientEmail) fail();
  if (next.teacher?.userId && next.teacher.userId !== input.userId) fail();
  if (next.staff?.userId && next.staff.userId !== input.userId) fail();

  if (next.teacher) next.teacher.userId = input.userId;
  if (next.staff) next.staff.userId = input.userId;
  next.consumed = true;
  next.consumedBy = input.userId;
  return next;
}

const baseInvitation = {
  establishmentId: "school-a",
  recipientEmail: "teacher@example.test",
  expired: false,
  revoked: false,
  consumed: false,
  consumedBy: null,
  teacher: {
    establishmentId: "school-a",
    email: "teacher@example.test",
    userId: null,
  },
  staff: {
    establishmentId: "school-a",
    email: "teacher@example.test",
    userId: null,
  },
};

const validInput = {
  authenticated: true,
  email: " Teacher@Example.Test ",
  establishmentId: "school-a",
  userId: "user-a",
};

test("creator identity comes only from auth.uid and owns the exact establishment", async () => {
  const sql = await source(sqlPath);
  assert.match(sql, /v_creator_id uuid := auth\.uid\(\)/);
  assert.match(sql, /from auth\.users creator where creator\.id = v_creator_id/);
  assert.match(sql, /establishment\.id = p_establishment_id[\s\S]*establishment\.owner_id = v_creator_id/);
  assert.doesNotMatch(sql, /p_created_by/);
  assert.doesNotMatch(sql, /profiles[\s\S]{0,120}role\s*=\s*'platform_admin'/);
});

test("revoker identity comes only from auth.uid and is checked against invitation school", async () => {
  const sql = await source(sqlPath);
  assert.match(sql, /v_revoker_id uuid := auth\.uid\(\)/);
  assert.match(sql, /establishment\.id = v_invitation\.establishment_id[\s\S]*establishment\.owner_id = v_revoker_id/);
  assert.doesNotMatch(sql, /p_revoked_by/);
});

test("resource email is normalized once and compared after UUID + school targeting", async () => {
  const sql = await source(sqlPath);
  assert.match(sql, /v_normalized_email text := lower\(btrim\(p_recipient_email\)\)/);
  assert.match(sql, /teacher\.id = p_resource_id[\s\S]*teacher\.etablissement_id = p_establishment_id/);
  assert.match(sql, /staff\.id = p_resource_id[\s\S]*staff\.etablissement_id = p_establishment_id/);
  assert.match(sql, /v_normalized_email <> v_teacher_email/);
  assert.match(sql, /v_normalized_email <> v_staff_email/);
});

test("TTL, active duplicate, expiry replacement and revocation are bounded", async () => {
  const sql = await source(sqlPath);
  assert.match(sql, /p_ttl <= interval '0 seconds'/);
  assert.match(sql, /p_ttl > interval '7 days'/);
  assert.match(sql, /revocation_reason = 'expired_replaced'/);
  assert.match(sql, /an active invitation already exists/);
  assert.match(sql, /create or replace function public\.revoke_targeted_invitation/);
});

test("table is private, RLS-enabled and has no direct client or service privileges", async () => {
  const sql = await source(sqlPath);
  assert.match(sql, /create table private\.targeted_invitations/);
  assert.match(sql, /alter table private\.targeted_invitations enable row level security/);
  assert.match(sql, /revoke all privileges on table private\.targeted_invitations[\s\S]*public, anon, authenticated, service_role/);
  assert.doesNotMatch(sql, /grant\s+(truncate|references|trigger)/i);
});

test("creation and revocation have no EXECUTE beneficiary; consumption is authenticated-only", async () => {
  const sql = await source(sqlPath);
  assert.equal((sql.match(/security definer/g) ?? []).length, 3);
  assert.equal((sql.match(/set search_path = ''/g) ?? []).length, 3);
  const createAclStart = sql.indexOf("revoke execute on function public.create_targeted_invitation(");
  const revokeDefinitionStart = sql.indexOf("create or replace function public.revoke_targeted_invitation(");
  const revokeAclStart = sql.indexOf("revoke execute on function public.revoke_targeted_invitation(uuid, text)");
  const consumeDefinitionStart = sql.indexOf("create or replace function public.consume_targeted_invitation(");
  const createAcl = sql.slice(createAclStart, revokeDefinitionStart);
  const revokeAcl = sql.slice(revokeAclStart, consumeDefinitionStart);
  assert.match(createAcl, /from public, anon, authenticated, service_role;/);
  assert.doesNotMatch(createAcl, /grant execute/i);
  assert.match(revokeAcl, /from public, anon, authenticated, service_role;/);
  assert.doesNotMatch(revokeAcl, /grant execute/i);
  assert.match(sql, /consume_targeted_invitation\(text\)[\s\S]*from public, anon, authenticated, service_role;[\s\S]*grant execute on function public\.consume_targeted_invitation\(text\)[\s\S]*to authenticated/);
  assert.doesNotMatch(sql, /grant execute on function public\.(?:create|revoke)_targeted_invitation/);
});

test("delivery options are documented without activating invitation creation", async () => {
  const options = await source("docs/pro/PRO-03_3_INVITATION_DELIVERY_OPTIONS.md");
  for (const expected of [
    "Server-only session proof",
    "Private outbox and controlled worker",
    "Authenticated Edge Function",
    "Out-of-band activation code",
  ]) {
    assert.match(options, new RegExp(expected, "i"));
  }
  assert.match(options, /no option is activated/i);
});

test("token generation stores only SHA-256 hash and consumption locks before writes", async () => {
  const sql = await source(sqlPath);
  assert.match(sql, /gen_random_bytes\(32\)/);
  assert.match(sql, /digest\(v_raw_token, 'sha256'\)/);
  assert.doesNotMatch(sql, /\braw_token\s+(?:text\s+)?not null/i);
  assert.match(sql, /where invitation\.token_hash = v_token_hash[\s\S]*for update/);
  assert.match(sql, /consumed_at is not null[\s\S]*revoked_at is not null[\s\S]*expires_at <= statement_timestamp\(\)/);
});

test("staff/teacher cross-school invariants and FK indexes are prepared", async () => {
  const sql = await source(sqlPath);
  assert.match(sql, /staff\.etablissement_id <> teacher\.etablissement_id/);
  assert.match(sql, /staff_members_teacher_same_establishment_fkey/);
  assert.match(sql, /uq_staff_members_enseignant/);
  for (const column of ["establishment", "created_by", "consumed_by", "revoked_by", "resource_lookup"]) {
    assert.match(sql, new RegExp(`targeted_invitations_${column}.*idx`));
  }
});

test("teacher invitation atomically links its staff companion", () => {
  const result = consumeModel(baseInvitation, validInput);
  assert.equal(result.teacher.userId, "user-a");
  assert.equal(result.staff.userId, "user-a");
  assert.equal(result.consumedBy, "user-a");
});

test("staff invitation atomically links its teacher companion", () => {
  const result = consumeModel({ ...structuredClone(baseInvitation), resourceType: "staff_member" }, validInput);
  assert.equal(result.staff.userId, "user-a");
  assert.equal(result.teacher.userId, "user-a");
});

test("wrong school and wrong email fail without modifying original rows", () => {
  const original = structuredClone(baseInvitation);
  assert.throws(() => consumeModel(original, { ...validInput, establishmentId: "school-b" }));
  assert.throws(() => consumeModel(original, { ...validInput, email: "other@example.test" }));
  assert.deepEqual(original, baseInvitation);
});

test("replay, expiry and revocation are rejected", () => {
  assert.throws(() => consumeModel({ ...structuredClone(baseInvitation), consumed: true }, validInput));
  assert.throws(() => consumeModel({ ...structuredClone(baseInvitation), expired: true }, validInput));
  assert.throws(() => consumeModel({ ...structuredClone(baseInvitation), revoked: true }, validInput));
});

test("conflicting user_id rejects the entire modeled transaction", () => {
  const original = structuredClone(baseInvitation);
  original.staff.userId = "user-b";
  assert.throws(() => consumeModel(original, validInput));
  assert.equal(original.teacher.userId, null);
  assert.equal(original.staff.userId, "user-b");
  assert.equal(original.consumed, false);
});

test("invitation API routes remain closed after owner and resource validation", async () => {
  const contracts = await source("src/lib/invitations/issuerContracts.ts");
  for (const path of [
    "src/app/api/enseignants/[id]/inviter/route.ts",
    "src/app/api/personnel/[id]/inviter/route.ts",
  ]) {
    const route = await source(path);
    const authorization = route.indexOf("authorizeEstablishmentRoute");
    const resourceLookup = route.indexOf('.eq("etablissement_id", access.establishment.id)');
    const closedResponse = route.indexOf("!isInvitationIssuerExplicitlyEnabled()");
    assert.ok(authorization >= 0 && resourceLookup > authorization && closedResponse > resourceLookup, path);
    assert.match(route, /!isInvitationIssuerActivationReady\(\)/);
    assert.match(route, /normalizeStoredInvitationEmail\((?:teacher|member)\.email\)/);
    assert.doesNotMatch(route, /createAdminClient|inviteUserByEmail/);
  }
  assert.match(contracts, /value\.trim\(\)\.toLowerCase\(\)/);
});

test("token preparation is POST-only and stores the secret in a short-lived HttpOnly cookie", async () => {
  const preparation = await source("src/app/auth/preparer-invitation/route.ts");
  const helper = await source("src/lib/invitations/targetedInvitation.ts");
  assert.match(preparation, /export async function POST/);
  assert.doesNotMatch(preparation, /export async function GET/);
  assert.match(preparation, /request\.formData\(\)/);
  assert.match(preparation, /form\.get\("token"\)/);
  assert.match(preparation, /request\.headers\.get\("origin"\) !== request\.nextUrl\.origin/);
  assert.match(preparation, /setTargetedInvitationCookie/);
  assert.match(helper, /httpOnly: true/);
  assert.match(helper, /secure: process\.env\.NODE_ENV === "production"/);
  assert.match(helper, /sameSite: "lax"/);
  assert.match(helper, /maxAge: TARGETED_INVITATION_MAX_AGE_SECONDS/);
});

test("callback never reads or propagates an invitation token in a URL", async () => {
  const callback = await source("src/app/auth/callback/route.ts");
  const preparation = await source("src/app/auth/preparer-invitation/route.ts");
  const completion = await source("src/app/auth/consommer-invitation/route.ts");
  const config = await source("next.config.js");
  const flow = `${callback}\n${preparation}\n${completion}`;
  assert.doesNotMatch(callback, /searchParams\.get\(["']invitation["']\)/);
  assert.doesNotMatch(flow, /searchParams\.(?:set|append)\(["'](?:token|invitation)["']/);
  assert.doesNotMatch(flow, /redirect[^\n]*(?:token|invitation)\s*\}/i);
  assert.match(callback, /cookieStore\.has\(TARGETED_INVITATION_COOKIE\)/);
  assert.match(config, /source: '\/auth\/preparer-invitation'/);
  assert.match(config, /Referrer-Policy', value: 'no-referrer'/);
  assert.match(config, /Cache-Control', value: 'no-store, max-age=0'/);
});

test("GET confirmation has no side effect and only POST consumes the invitation", async () => {
  const completion = await source("src/app/auth/consommer-invitation/route.ts");
  const getStart = completion.indexOf("export async function GET");
  const postStart = completion.indexOf("export async function POST");
  assert.ok(getStart >= 0 && postStart > getStart);
  assert.doesNotMatch(completion.slice(getStart, postStart), /consume_targeted_invitation/);
  assert.match(completion.slice(postStart), /rpc\("consume_targeted_invitation"/);
  assert.match(completion, /<form method="post" action="\/auth\/consommer-invitation">/);
});

test("the invitation cookie is cleared on every terminal success or failure", async () => {
  const callback = await source("src/app/auth/callback/route.ts");
  const preparation = await source("src/app/auth/preparer-invitation/route.ts");
  const completion = await source("src/app/auth/consommer-invitation/route.ts");
  const helper = await source("src/lib/invitations/targetedInvitation.ts");
  assert.match(helper, /clearTargetedInvitationCookie[\s\S]*maxAge: 0/);
  assert.match(callback, /exchangeError[\s\S]*clearTargetedInvitationCookie/);
  assert.match(callback, /return clearTargetedInvitationCookie[\s\S]*\/auth\/connexion/);
  assert.match(preparation, /invalidPreparation[\s\S]*clearTargetedInvitationCookie/);
  assert.match(completion, /completionResponse[\s\S]*clearTargetedInvitationCookie/);
  assert.match(completion, /return completionResponse\(request, "success"/);
});

test("authenticated consumption never uses service_role, email lookup or token logging", async () => {
  const completion = await source("src/app/auth/consommer-invitation/route.ts");
  const welcome = await source("src/app/auth/enseignant-bienvenue/page.tsx");
  assert.match(completion, /auth\.getUser\(\)/);
  assert.match(completion, /rpc\("consume_targeted_invitation"/);
  assert.doesNotMatch(`${completion}\n${welcome}`, /createAdminClient|\.eq\(["']email["']|console\.|logger\./);
  assert.doesNotMatch(welcome, /p_token|invitation\?: string/);
  assert.match(welcome, /\.eq\("id", params\.resource_id\)/);
  assert.match(welcome, /\.eq\("etablissement_id", params\.school\)/);
  assert.match(welcome, /\.eq\("user_id", user\.id\)/);
});
