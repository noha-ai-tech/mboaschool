import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  DedicatedDatabaseConfigurationError,
  DedicatedDatabaseExecutorError,
  STAGING_INVITATION_LOGIN,
  createDedicatedInvitationExecutor,
  readDedicatedDatabaseConfiguration,
} from "../src/lib/invitations/dedicatedPostgresExecutor.ts";
import { EphemeralInvitationSecret } from "../src/lib/invitations/issuerContracts.ts";
import { issueAndDeliverInvitation } from "../src/lib/invitations/issuerFlow.ts";
import { PRIVATE_INVITATION_FUNCTIONS } from "../src/lib/invitations/internalIssuer.ts";
import { inspectInvitationIssuerActivationReadiness } from "../src/lib/invitations/issuerServerWiring.ts";

const OWNER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SCHOOL = "11111111-1111-4111-8111-111111111111";
const RESOURCE = "22222222-2222-4222-8222-222222222222";
const KEY = "33333333-3333-4333-8333-333333333333";
const INVITATION = "44444444-4444-4444-8444-444444444444";
const ATTEMPT = "55555555-5555-4555-8555-555555555555";
const CODE = "a".repeat(64);
const PROJECT_REF = "abcdefghijklmnopqrst";
const SUPAVISOR_HOST = "aws-0-us-west-1.pooler.supabase.com";

function dedicatedEnvironment() {
  const url = new URL(["postgresql", "://", "seed.invalid"].join(""));
  url.username = `${STAGING_INVITATION_LOGIN}.${PROJECT_REF}`;
  url.password = ["synthetic", "credential"].join("-");
  url.hostname = SUPAVISOR_HOST;
  url.port = "6543";
  url.pathname = "/postgres";
  url.search = "?sslmode=verify-full";
  return {
    INVITATION_ISSUER_DATABASE_URL: url.toString(),
    INVITATION_ISSUER_STAGING_PROJECT_REF: PROJECT_REF,
    INVITATION_ISSUER_STAGING_SUPAVISOR_HOST: SUPAVISOR_HOST,
  };
}

async function source(path) {
  return readFile(path, "utf8");
}

function fakePool({ failInvocation = false, extraColumn = false } = {}) {
  const calls = [];
  const releases = [];
  const client = {
    async query(query) {
      calls.push(query);
      if (typeof query === "object") {
        if (failInvocation) throw new Error(`synthetic failure ${CODE}`);
        return {
          rowCount: 1,
          rows: [{
            invitation_id: INVITATION,
            attempt_id: ATTEMPT,
            delivery_status: "pending",
            created: true,
            activation_code: CODE,
            ...(extraColumn ? { unexpected: "not allowed" } : {}),
          }],
        };
      }
      return { rowCount: null, rows: [] };
    },
    release(destroy = false) {
      releases.push(destroy);
    },
  };
  return {
    calls,
    releases,
    pool: { async connect() { return client; } },
  };
}

const issueParameters = {
  p_actor_id: OWNER,
  p_establishment_id: SCHOOL,
  p_resource_type: "teacher",
  p_resource_id: RESOURCE,
  p_recipient_email: "teacher@example.test",
  p_idempotency_key: KEY,
  p_retry_of: null,
};

test("activation page is public/non-secret and submits only a same-origin POST", async () => {
  const page = await source("src/app/auth/activer-invitation/page.tsx");
  const preparation = await source("src/app/auth/preparer-invitation/route.ts");
  const headers = await source("next.config.js");

  assert.match(page, /<form[\s\S]*method="post"[\s\S]*action="\/auth\/preparer-invitation"/);
  assert.match(page, /autoComplete="off"/);
  assert.match(page, /spellCheck=\{false\}/);
  assert.doesNotMatch(page, /use server|searchParams.*(?:token|code)|defaultValue|value=\{/i);
  assert.doesNotMatch(page, /https?:\/\/|analytics|script|iframe/i);
  assert.match(preparation, /request\.headers\.get\("origin"\) !== request\.nextUrl\.origin/);
  assert.match(headers, /source: '\/auth\/activer-invitation'/);
  assert.match(headers, /Cache-Control', value: 'no-store, max-age=0'/);
  assert.match(headers, /Referrer-Policy', value: 'no-referrer'/);
  assert.match(headers, /X-Robots-Tag', value: 'noindex, nofollow, noarchive'/);
});

test("code travels in the provider message but never in its activation URL", async () => {
  let outbound;
  const issuer = {
    async issue() {
      return {
        invitationId: INVITATION,
        attemptId: ATTEMPT,
        deliveryStatus: "pending",
        created: true,
        secret: EphemeralInvitationSecret.fromInternalBoundary(CODE),
      };
    },
    async markDelivered() { return true; },
    async markConfirmedFailure() { return true; },
  };
  const provider = {
    kind: "simulated",
    async deliver(input) {
      outbound = input;
      return { kind: "delivered", providerMessageId: "synthetic-message" };
    },
  };

  const result = await issueAndDeliverInvitation({
    actorId: OWNER,
    establishmentId: SCHOOL,
    resourceType: "teacher",
    resourceId: RESOURCE,
    recipientEmail: "teacher@example.test",
    idempotencyKey: KEY,
    retryOf: null,
  }, { issuer, deliveryProvider: provider });

  assert.deepEqual(result, { outcome: "delivered" });
  assert.equal(outbound.message.activationUrl, "/auth/activer-invitation");
  assert.equal(outbound.message.activationUrl.includes(CODE), false);
  assert.equal(
    outbound.message.activationCode.revealForDelivery((value) => value),
    CODE,
  );
  assert.doesNotMatch(JSON.stringify(outbound), new RegExp(CODE));
});

test("provider success followed by SQL confirmation failure stays pending", async () => {
  const issuer = {
    async issue() {
      return {
        invitationId: INVITATION,
        attemptId: ATTEMPT,
        deliveryStatus: "pending",
        created: true,
        secret: EphemeralInvitationSecret.fromInternalBoundary(CODE),
      };
    },
    async markDelivered() { throw new Error(`synthetic SQL failure ${CODE}`); },
    async markConfirmedFailure() { throw new Error("unexpected"); },
  };
  const provider = {
    kind: "simulated",
    async deliver() { return { kind: "delivered", providerMessageId: "synthetic" }; },
  };

  const result = await issueAndDeliverInvitation({
    actorId: OWNER,
    establishmentId: SCHOOL,
    resourceType: "teacher",
    resourceId: RESOURCE,
    recipientEmail: "teacher@example.test",
    idempotencyKey: KEY,
    retryOf: null,
  }, { issuer, deliveryProvider: provider });
  assert.deepEqual(result, { outcome: "pending" });
  assert.doesNotMatch(JSON.stringify(result), new RegExp(CODE));
});

test("database configuration is dedicated, server-only, TLS and pooler constrained", () => {
  assert.throws(
    () => readDedicatedDatabaseConfiguration({
      NEXT_PUBLIC_INVITATION_ISSUER_DATABASE_URL:
        ["postgresql", "://", "public.invalid/db"].join(""),
    }),
    DedicatedDatabaseConfigurationError,
  );
  assert.throws(() => readDedicatedDatabaseConfiguration({}), DedicatedDatabaseConfigurationError);
  assert.throws(
    () => readDedicatedDatabaseConfiguration({
      ...dedicatedEnvironment(),
      INVITATION_ISSUER_STAGING_PROJECT_REF: "wrongprojectref00000",
    }),
    DedicatedDatabaseConfigurationError,
  );

  const environment = dedicatedEnvironment();
  const configuration = readDedicatedDatabaseConfiguration(environment);
  assert.equal(configuration.poolMax, 2);
  assert.equal(configuration.projectRef, PROJECT_REF);
  assert.equal(configuration.host, SUPAVISOR_HOST);
  assert.equal(configuration.username, `${STAGING_INVITATION_LOGIN}.${PROJECT_REF}`);
  assert.equal("connectionString" in configuration, false);

  const readiness = inspectInvitationIssuerActivationReadiness(environment);
  assert.deepEqual(readiness, {
    sourceApproved: false,
    serverConfigurationValid: true,
    realProviderConfigured: false,
    ready: false,
  });
});

test("executor uses one transaction, SET LOCAL ROLE and bound allow-listed SQL", async () => {
  const fake = fakePool();
  const executor = createDedicatedInvitationExecutor(fake.pool);
  const row = await executor.execute(PRIVATE_INVITATION_FUNCTIONS.issue, issueParameters);

  assert.equal(row.invitation_id, INVITATION);
  assert.deepEqual(fake.calls.slice(0, 6), [
    "BEGIN",
    "SET LOCAL ROLE invitation_issuer",
    "SET LOCAL statement_timeout = '4000ms'",
    "SET LOCAL lock_timeout = '2000ms'",
    "SET LOCAL idle_in_transaction_session_timeout = '4000ms'",
    {
      text: "SELECT invitation_id, attempt_id, delivery_status, created, activation_code FROM private.issue_targeted_invitation($1::uuid, $2::uuid, $3::text, $4::uuid, $5::text, $6::uuid, $7::uuid)",
      values: Object.values(issueParameters),
    },
  ]);
  assert.equal(fake.calls.at(-1), "COMMIT");
  assert.deepEqual(fake.releases, [false]);
  assert.doesNotMatch(fake.calls[5].text, /teacher@example\.test|a{8}|11111111/);
  assert.equal(fake.calls[5].text.includes(";"), false);
});

test("executor rolls back, releases and returns only a generic error", async () => {
  const fake = fakePool({ failInvocation: true });
  const executor = createDedicatedInvitationExecutor(fake.pool);

  await assert.rejects(
    executor.execute(PRIVATE_INVITATION_FUNCTIONS.issue, issueParameters),
    (error) => {
      assert.equal(error instanceof DedicatedDatabaseExecutorError, true);
      assert.doesNotMatch(error.message, new RegExp(CODE));
      assert.equal("cause" in error, false);
      return true;
    },
  );
  assert.equal(fake.calls.at(-1), "ROLLBACK");
  assert.deepEqual(fake.releases, [false]);
});

test("executor rejects unknown functions, parameter drift and unexpected columns", async () => {
  assert.equal(Object.keys(PRIVATE_INVITATION_FUNCTIONS).length, 5);
  assert.deepEqual(new Set(Object.values(PRIVATE_INVITATION_FUNCTIONS)), new Set([
    "private.issue_targeted_invitation",
    "private.complete_targeted_invitation_delivery",
    "private.fail_targeted_invitation_delivery",
    "private.revoke_issued_targeted_invitation",
    "private.revoke_stale_targeted_invitation_delivery",
  ]));
  const neverConnected = { async connect() { throw new Error("must not connect"); } };
  const executor = createDedicatedInvitationExecutor(neverConnected);
  await assert.rejects(
    executor.execute("public.create_targeted_invitation", issueParameters),
    DedicatedDatabaseExecutorError,
  );
  await assert.rejects(
    executor.execute(PRIVATE_INVITATION_FUNCTIONS.issue, { ...issueParameters, extra: "x" }),
    DedicatedDatabaseExecutorError,
  );

  const extra = fakePool({ extraColumn: true });
  await assert.rejects(
    createDedicatedInvitationExecutor(extra.pool).execute(
      PRIVATE_INVITATION_FUNCTIONS.issue,
      issueParameters,
    ),
    DedicatedDatabaseExecutorError,
  );
  assert.equal(extra.calls.at(-1), "ROLLBACK");
  assert.deepEqual(extra.releases, [false]);
});

test("migration keeps pending unusable and hardens claims, ownership, expiry and rate limits", async () => {
  const sql = await source("docs/pro/PRO-03_3_PROPOSED_MIGRATION.sql");
  assert.match(sql, /returns table\([\s\S]*activation_code text/);
  assert.match(sql, /exception when others then[\s\S]*set_config\('request\.jwt\.claim\.sub'[\s\S]*raise;/);
  assert.match(sql, /alter default privileges for role postgres in schema private[\s\S]*public, anon, authenticated, service_role/);
  assert.equal((sql.match(/owner to postgres;/g) ?? []).length, 10);
  assert.match(sql, /new\.consumed_at is not null and new\.delivery_status <> 'delivered'/);
  assert.match(sql, /EXPIRED_DURING_DELIVERY/);
  assert.match(sql, /if not found then return false; end if;[\s\S]*set status = 'failed'/);
  assert.match(sql, /invitation-rate:actor-school:[\s\S]*invitation-rate:resource:[\s\S]*count\(\*\)/);
  assert.match(sql, /v_existing\.status, false, null::text/);
  const privateGrants = sql.slice(
    sql.indexOf("-- Grant only the minimal internal capability role."),
    sql.indexOf("-- Preserve the PRO-03.2.2 public RPC posture exactly."),
  );
  assert.doesNotMatch(privateGrants, /to (?:anon|authenticated|service_role)/i);
});

test("all PRO-03.3.2 review artifacts are present and explicitly non-executed", async () => {
  for (const name of [
    "PRO-03_3_2_IMPLEMENTATION_REPORT.md",
    "PRO-03_3_2_ACTIVATION_CODE_SECURITY_REVIEW.md",
    "PRO-03_3_2_DATABASE_EXECUTOR_REVIEW.md",
    "PRO-03_3_2_STAGING_RUNBOOK.md",
    "PRO-03_3_2_STAGING_LOGIN_PROPOSED.sql",
    "PRO-03_3_2_E2E_TEST_MATRIX.md",
  ]) {
    const contents = await source(`docs/pro/${name}`);
    assert.ok(contents.length > 750, name);
    assert.match(contents, /(NOT EXECUTED|NON EXÉCUTÉ|NE PAS EXÉCUTER|NO LOGIN)/i, name);
  }

  const loginSql = await source("docs/pro/PRO-03_3_2_STAGING_LOGIN_PROPOSED.sql");
  assert.match(loginSql, /login noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls/);
  assert.match(loginSql, /connection limit 2 password null valid until 'epoch'/);
  assert.match(loginSql, /grant invitation_issuer to pro03_staging_invitation_login/);
  assert.doesNotMatch(loginSql, /grant (?:select|insert|update|delete|usage) /i);
  assert.match(loginSql, /temporary login inherits executable application functions/);
  assert.match(loginSql, /effective EXECUTE ACL exceeds allow-list/);
});
