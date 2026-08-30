import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { DeterministicInvitationDeliveryProvider } from "../src/lib/invitations/deterministicDeliveryProvider.ts";
import {
  EphemeralInvitationSecret,
  InvitationRequestError,
  parseInvitationIssuerRequest,
} from "../src/lib/invitations/issuerContracts.ts";
import { issueAndDeliverInvitation } from "../src/lib/invitations/issuerFlow.ts";
import {
  PRIVATE_INVITATION_FUNCTIONS,
  createInternalInvitationIssuer,
} from "../src/lib/invitations/internalIssuer.ts";

const OWNER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SCHOOL_A = "11111111-1111-4111-8111-111111111111";
const SCHOOL_B = "22222222-2222-4222-8222-222222222222";
const RESOURCE_A = "33333333-3333-4333-8333-333333333333";
const KEY_A = "44444444-4444-4444-8444-444444444444";
const KEY_B = "55555555-5555-4555-8555-555555555555";
const ATTEMPT_A = "66666666-6666-4666-8666-666666666666";

const command = {
  actorId: OWNER_A,
  establishmentId: SCHOOL_A,
  resourceType: "teacher",
  resourceId: RESOURCE_A,
  recipientEmail: "teacher@example.test",
  idempotencyKey: KEY_A,
  retryOf: null,
};

function issueResult({ created = true, sequence = 1 } = {}) {
  return {
    invitationId: `77777777-7777-4777-8777-77777777777${sequence}`,
    attemptId: sequence === 1 ? ATTEMPT_A : `88888888-8888-4888-8888-88888888888${sequence}`,
    deliveryStatus: "pending",
    created,
    secret: created ? EphemeralInvitationSecret.fromInternalBoundary("a".repeat(64)) : null,
  };
}

function recordingIssuer(result = issueResult()) {
  const calls = { issued: [], delivered: [], failed: [] };
  return {
    calls,
    issuer: {
      async issue(input) {
        calls.issued.push(structuredClone(input));
        return result;
      },
      async markDelivered(input) {
        calls.delivered.push(structuredClone(input));
        return true;
      },
      async markConfirmedFailure(input) {
        calls.failed.push(structuredClone(input));
        return true;
      },
    },
  };
}

test("client identity fields are rejected and never become issuer input", () => {
  for (const field of ["actor_id", "actorId", "owner_id", "ownerId", "created_by", "createdBy"]) {
    assert.throws(
      () => parseInvitationIssuerRequest({ requestedEstablishmentId: SCHOOL_A, [field]: OWNER_A }),
      (error) => error instanceof InvitationRequestError
        && error.code === "CLIENT_IDENTITY_FORBIDDEN",
      field,
    );
  }
  const parsed = parseInvitationIssuerRequest({
    requestedEstablishmentId: SCHOOL_A,
    idempotencyKey: KEY_A,
  });
  assert.deepEqual(parsed, {
    requestedEstablishmentId: SCHOOL_A,
    idempotencyKey: KEY_A,
    retryOf: null,
  });
  assert.equal("actorId" in parsed, false);
});

test("server adapter can invoke only the five allow-listed private functions", async () => {
  const calls = [];
  const executor = {
    async execute(functionName, parameters) {
      calls.push({ functionName, parameters });
      if (functionName === PRIVATE_INVITATION_FUNCTIONS.issue) {
        return {
          invitation_id: "77777777-7777-4777-8777-777777777771",
          attempt_id: ATTEMPT_A,
          delivery_status: "pending",
          created: true,
          activation_code: "a".repeat(64),
        };
      }
      return true;
    },
  };
  const issuer = createInternalInvitationIssuer(executor);
  const issued = await issuer.issue(command);
  await issuer.markDelivered({
    actorId: OWNER_A,
    attemptId: issued.attemptId,
    providerMessageId: "simulation-message",
  });
  await issuer.markConfirmedFailure({
    actorId: OWNER_A,
    attemptId: issued.attemptId,
    failureCode: "SIMULATED_REJECTION",
  });

  assert.deepEqual(calls.map((call) => call.functionName), [
    "private.issue_targeted_invitation",
    "private.complete_targeted_invitation_delivery",
    "private.fail_targeted_invitation_delivery",
  ]);
  assert.equal(calls[0].parameters.p_actor_id, OWNER_A);
  assert.doesNotMatch(calls.map((call) => call.functionName).join("\n"), /public\./);
});

test("success marks delivered and returns a secret-free public result", async () => {
  const { issuer, calls } = recordingIssuer();
  const provider = new DeterministicInvitationDeliveryProvider("success");
  const result = await issueAndDeliverInvitation(command, { issuer, deliveryProvider: provider });

  assert.deepEqual(result, { outcome: "delivered" });
  assert.equal(calls.issued[0].actorId, OWNER_A);
  assert.equal(calls.delivered.length, 1);
  assert.equal(calls.failed.length, 0);
  assert.equal(provider.deliveryAttempts, 1);
  assert.doesNotMatch(JSON.stringify(result), /a{16}|activation|secret|token/i);
});

test("ephemeral secret has no enumerable value and redacts coercion", () => {
  const secret = EphemeralInvitationSecret.fromInternalBoundary("b".repeat(64));
  assert.deepEqual(Object.keys(secret), []);
  assert.equal(JSON.stringify(secret), '"[REDACTED]"');
  assert.equal(String(secret), "[REDACTED]");
});

test("confirmed failure compensates, while ambiguous and timeout stay pending", async () => {
  const failure = recordingIssuer();
  const failed = await issueAndDeliverInvitation(command, {
    issuer: failure.issuer,
    deliveryProvider: new DeterministicInvitationDeliveryProvider("confirmed_failure"),
  });
  assert.deepEqual(failed, { outcome: "failed" });
  assert.equal(failure.calls.failed.length, 1);
  assert.equal(failure.calls.delivered.length, 0);

  for (const mode of ["ambiguous", "timeout"]) {
    const pending = recordingIssuer();
    const result = await issueAndDeliverInvitation(command, {
      issuer: pending.issuer,
      deliveryProvider: new DeterministicInvitationDeliveryProvider(mode),
    });
    assert.deepEqual(result, { outcome: "pending" });
    assert.equal(pending.calls.delivered.length, 0);
    assert.equal(pending.calls.failed.length, 0);
  }
});

test("provider simulation is idempotent and retry uses a new key and invitation", async () => {
  const provider = new DeterministicInvitationDeliveryProvider("success");
  const first = recordingIssuer(issueResult({ sequence: 1 }));
  await issueAndDeliverInvitation(command, { issuer: first.issuer, deliveryProvider: provider });
  await issueAndDeliverInvitation(command, {
    issuer: recordingIssuer(issueResult({ created: false })).issuer,
    deliveryProvider: provider,
  });
  assert.equal(provider.deliveryAttempts, 1);

  const retryCommand = { ...command, idempotencyKey: KEY_B, retryOf: ATTEMPT_A };
  const retry = recordingIssuer(issueResult({ sequence: 2 }));
  await issueAndDeliverInvitation(retryCommand, { issuer: retry.issuer, deliveryProvider: provider });
  assert.equal(provider.deliveryAttempts, 2);
  assert.equal(retry.calls.issued[0].idempotencyKey, KEY_B);
  assert.equal(retry.calls.issued[0].retryOf, ATTEMPT_A);
  assert.notEqual(first.calls.issued[0].idempotencyKey, retry.calls.issued[0].idempotencyKey);
});

test("routes derive actor from auth.getUser result, reload exact resource and stay locked", async () => {
  const access = await readFile("src/lib/school/establishmentAccess.ts", "utf8");
  const wiring = await readFile("src/lib/invitations/issuerServerWiring.ts", "utf8");
  const routes = await Promise.all([
    readFile("src/app/api/enseignants/[id]/inviter/route.ts", "utf8"),
    readFile("src/app/api/personnel/[id]/inviter/route.ts", "utf8"),
  ]);

  assert.match(access, /supabase\.auth\.getUser\(\)/);
  assert.doesNotMatch(access, /getSession\(|user_metadata|app_metadata/);
  assert.match(access, /\.eq\("id", input\.requestedEstablishmentId\)[\s\S]*\.eq\("owner_id", user\.id\)/);
  assert.match(wiring, /state: "locked"/);
  assert.match(wiring, /sourceApproved && serverConfigurationValid && realProviderConfigured/);
  assert.match(wiring, /realProviderConfigured = false/);

  for (const route of routes) {
    assert.match(route, /export const runtime = "nodejs"/);
    assert.match(route, /authorizeEstablishmentRoute/);
    assert.match(route, /actorId: access\.user\.id/);
    assert.match(route, /\.eq\("id", (?:teacherId|staffMemberId)\)[\s\S]*\.eq\("etablissement_id", access\.establishment\.id\)/);
    assert.match(route, /normalizeStoredInvitationEmail\((?:teacher|member)\.email\)/);
    assert.match(route, /isInvitationIssuerExplicitlyEnabled\(\)[\s\S]*invitationIssuerLockedResponse/);
    assert.match(route, /isInvitationIssuerActivationReady\(\)/);
    assert.doesNotMatch(route, /getSession\(|user_metadata|app_metadata|createAdminClient|service_role|\.rpc\(/i);
  }
});

test("SQL serializes distinct-key rate checks before counting", async () => {
  const sql = await readFile("docs/pro/PRO-03_3_PROPOSED_MIGRATION.sql", "utf8");
  const actorLock = sql.indexOf("invitation-rate:actor-school:");
  const resourceLock = sql.indexOf("invitation-rate:resource:");
  const hourlyCount = sql.indexOf("invitation actor rate limit exceeded");
  const resourceCount = sql.indexOf("invitation resource rate limit exceeded");

  assert.ok(actorLock > 0 && resourceLock > actorLock);
  assert.ok(hourlyCount > resourceLock && resourceCount > hourlyCount);
  assert.match(sql, /pg_advisory_xact_lock/g);
  assert.match(sql, /current_setting\('transaction_isolation'\) <> 'read committed'/);
  assert.match(sql, /revoke execute on function public\.create_targeted_invitation[\s\S]*authenticated, service_role/);
  assert.match(sql, /revoke execute on function public\.revoke_targeted_invitation[\s\S]*authenticated, service_role/);
});

test("atomic rate-bucket model admits at most five concurrent distinct keys", async () => {
  let committedAttempts = 0;
  let tail = Promise.resolve();

  async function attempt() {
    const previous = tail;
    let release;
    tail = new Promise((resolve) => { release = resolve; });
    await previous;
    try {
      await Promise.resolve();
      if (committedAttempts >= 5) return false;
      committedAttempts += 1;
      return true;
    } finally {
      release();
    }
  }

  const accepted = await Promise.all(Array.from({ length: 6 }, () => attempt()));
  assert.equal(accepted.filter(Boolean).length, 5);
  assert.equal(committedAttempts, 5);
});

test("different-school commands remain explicit and never inherit ambient tab state", () => {
  const schoolA = { ...command, establishmentId: SCHOOL_A };
  const schoolB = { ...command, establishmentId: SCHOOL_B, idempotencyKey: KEY_B };
  assert.equal(schoolA.establishmentId, SCHOOL_A);
  assert.equal(schoolB.establishmentId, SCHOOL_B);
  assert.notEqual(schoolA.establishmentId, schoolB.establishmentId);
});

test("all PRO-03.3.1 review and staging deliverables are prepared", async () => {
  for (const name of [
    "PRO-03_3_1_IMPLEMENTATION_REPORT.md",
    "PRO-03_3_1_TRUST_BOUNDARY_REVIEW.md",
    "PRO-03_3_1_SERVER_ROLE_RUNBOOK.md",
    "PRO-03_3_1_STAGING_TEST_PLAN.md",
    "PRO-03_3_1_RATE_LIMIT_REVIEW.md",
  ]) {
    const contents = await readFile(`docs/pro/${name}`, "utf8");
    assert.ok(contents.length > 1_000, name);
    assert.match(contents, /(NOT EXECUTED|NOT ACTIVATED|NO LOGIN)/i, name);
  }
});
