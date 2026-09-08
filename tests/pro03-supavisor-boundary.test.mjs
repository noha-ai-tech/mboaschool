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
import { inspectInvitationIssuerActivationReadiness } from "../src/lib/invitations/issuerServerWiring.ts";

const PROJECT_REF = "abcdefghijklmnopqrst";
const OTHER_PROJECT_REF = "zyxwvutsrqponmlkjihg";
const EXPECTED_HOST = "aws-0-us-west-1.pooler.supabase.com";
const TEST_PASSWORD = ["not", "a", "real", "credential"].join("-");

function connectionUrl(overrides = {}) {
  const protocol = overrides.protocol ?? "postgresql:";
  const url = new URL([protocol, "//", "seed.invalid"].join(""));
  url.username = overrides.username ?? `${STAGING_INVITATION_LOGIN}.${PROJECT_REF}`;
  url.password = overrides.password === undefined ? TEST_PASSWORD : overrides.password;
  url.hostname = overrides.host ?? EXPECTED_HOST;
  url.port = overrides.port ?? "6543";
  url.pathname = overrides.pathname ?? "/postgres";
  url.search = overrides.search ?? "?sslmode=verify-full";
  url.hash = overrides.hash ?? "";
  return url.toString();
}

function stagingEnvironment(overrides = {}) {
  return {
    INVITATION_ISSUER_DATABASE_URL:
      overrides.connectionString ?? connectionUrl(overrides.url),
    INVITATION_ISSUER_STAGING_PROJECT_REF:
      overrides.expectedProjectRef ?? PROJECT_REF,
    INVITATION_ISSUER_STAGING_SUPAVISOR_HOST:
      overrides.expectedHost ?? EXPECTED_HOST,
    ...(overrides.extraEnvironment ?? {}),
  };
}

function assertConfigurationRejected(environment) {
  let error;
  try {
    readDedicatedDatabaseConfiguration(environment);
  } catch (caught) {
    error = caught;
  }
  assert.equal(error instanceof DedicatedDatabaseConfigurationError, true);
  assert.equal(error.message, "Dedicated invitation database configuration is unavailable");
  assert.equal("cause" in error, false);
  const suppliedConnectionString = environment.INVITATION_ISSUER_DATABASE_URL;
  if (suppliedConnectionString) {
    assert.equal(error.message.includes(suppliedConnectionString), false);
  }
  assert.doesNotMatch(error.message, new RegExp(TEST_PASSWORD));
  assert.doesNotMatch(error.message, /pooler\.supabase\.com|postgres(?:ql)?:/);
}

test("valid staging Supavisor URL requires exact suffixed user, host, database, port and verify-full", () => {
  for (const protocol of ["postgres:", "postgresql:"]) {
    const configuration = readDedicatedDatabaseConfiguration(stagingEnvironment({
      url: { protocol },
    }));
    assert.deepEqual(configuration, {
      projectRef: PROJECT_REF,
      host: EXPECTED_HOST,
      database: "postgres",
      username: `${STAGING_INVITATION_LOGIN}.${PROJECT_REF}`,
      poolMax: 2,
      statementTimeoutMs: 4_000,
      transactionTimeoutMs: 8_000,
    });
    assert.equal("connectionString" in configuration, false);
    assert.equal("password" in configuration, false);
  }
});

test("Supavisor user without exact staging project reference is rejected", () => {
  assertConfigurationRejected(stagingEnvironment({
    url: { username: STAGING_INVITATION_LOGIN },
  }));
  assertConfigurationRejected(stagingEnvironment({
    url: { username: `${STAGING_INVITATION_LOGIN}.${OTHER_PROJECT_REF}` },
  }));
  assertConfigurationRejected(stagingEnvironment({
    expectedProjectRef: "shortref",
  }));
});

test("postgres, service_role, authenticator and other database roles are rejected", () => {
  for (const role of ["postgres", "service_role", "authenticator", "another_role"]) {
    assertConfigurationRejected(stagingEnvironment({
      url: { username: `${role}.${PROJECT_REF}` },
    }));
  }
});

test("arbitrary, spoofed, IP and localhost hosts are rejected", () => {
  for (const host of [
    "database.example.test",
    "aws-0-us-west-1.pooler.supabase.com.evil.test",
    "127.0.0.1",
    "localhost",
  ]) {
    assertConfigurationRejected(stagingEnvironment({ url: { host } }));
  }
  assertConfigurationRejected(stagingEnvironment({
    expectedHost: "aws-0-us-west-1.pooler.supabase.com.evil.test",
    url: { host: "aws-0-us-west-1.pooler.supabase.com.evil.test" },
  }));
});

test("wrong port, database, missing password and weaker TLS are rejected", () => {
  assertConfigurationRejected(stagingEnvironment({ url: { port: "5432" } }));
  assertConfigurationRejected(stagingEnvironment({ url: { pathname: "/other" } }));
  assertConfigurationRejected(stagingEnvironment({ url: { password: "" } }));
  for (const search of [
    "",
    "?sslmode=require",
    "?sslmode=disable",
    "?sslmode=prefer",
    "?sslmode=verify-full&sslmode=verify-full",
    "?sslmode=verify-full&application_name=unexpected",
  ]) {
    assertConfigurationRejected(stagingEnvironment({ url: { search } }));
  }
  assertConfigurationRejected(stagingEnvironment({ url: { hash: "unexpected" } }));
});

test("related NEXT_PUBLIC configuration is rejected even when server configuration is valid", () => {
  for (const name of [
    "NEXT_PUBLIC_INVITATION_ISSUER_STAGING_PROJECT_REF",
    "NEXT_PUBLIC_INVITATION_ISSUER_DATABASE_URL",
    "NEXT_PUBLIC_POSTGRES_URL",
    "NEXT_PUBLIC_SUPAVISOR_HOST",
  ]) {
    assertConfigurationRejected(stagingEnvironment({
      extraEnvironment: { [name]: "browser-controlled" },
    }));
  }
});

test("configuration and driver errors cannot expose a supplied URI or password", async () => {
  const connectionString = connectionUrl();
  assertConfigurationRejected(stagingEnvironment({
    connectionString,
    expectedHost: "aws-0-eu-west-1.pooler.supabase.com",
  }));

  const executor = createDedicatedInvitationExecutor({
    async connect() {
      throw new Error(["driver", TEST_PASSWORD, connectionString].join(" "));
    },
  });
  await assert.rejects(
    executor.execute("private.revoke_stale_targeted_invitation_delivery", {
      p_attempt_id: "55555555-5555-4555-8555-555555555555",
    }),
    (error) => {
      assert.equal(error instanceof DedicatedDatabaseExecutorError, true);
      assert.equal(error.message, "Dedicated invitation database operation failed");
      assert.equal(error.message.includes(TEST_PASSWORD), false);
      assert.equal(error.message.includes(connectionString), false);
      return true;
    },
  );

  const source = await readFile("src/lib/invitations/dedicatedPostgresExecutor.ts", "utf8");
  assert.doesNotMatch(source, /console\.(?:log|error|warn)|logger\./);
  assert.match(source, /catch \{[\s\S]*throw new DedicatedDatabaseExecutorError\(\)/);
  assert.match(source, /sanitizedConfiguration/);
});

test("source activation remains locked, executor unwired and invitation routes remain 503", async () => {
  const readiness = inspectInvitationIssuerActivationReadiness(stagingEnvironment());
  assert.deepEqual(readiness, {
    sourceApproved: false,
    serverConfigurationValid: true,
    realProviderConfigured: false,
    ready: false,
  });

  const wiring = await readFile("src/lib/invitations/issuerServerWiring.ts", "utf8");
  const response = await readFile("src/lib/invitations/issuerHttp.ts", "utf8");
  const routes = await Promise.all([
    readFile("src/app/api/enseignants/[id]/inviter/route.ts", "utf8"),
    readFile("src/app/api/personnel/[id]/inviter/route.ts", "utf8"),
  ]);
  assert.match(wiring, /state: "locked"/);
  assert.match(wiring, /createUnavailableInvitationIssuer\(\)/);
  assert.doesNotMatch(wiring, /createConfiguredDedicatedInvitationExecutor/);
  assert.match(response, /TARGETED_INVITATIONS_NOT_DEPLOYED[\s\S]*503/);
  for (const route of routes) {
    assert.match(route, /!isInvitationIssuerExplicitlyEnabled\(\)/);
    assert.match(route, /!isInvitationIssuerActivationReady\(\)/);
    assert.match(route, /invitationIssuerLockedResponse\(\)/);
  }
});

test("PUBLIC function ACL audit is read-only and precedes LOGIN creation", async () => {
  const audit = await readFile("docs/pro/PRO-03_3_2_PUBLIC_FUNCTION_ACL_AUDIT.sql", "utf8");
  const login = await readFile("docs/pro/PRO-03_3_2_STAGING_LOGIN_PROPOSED.sql", "utf8");
  const runbook = await readFile("docs/pro/PRO-03_3_2_STAGING_RUNBOOK.md", "utf8");

  assert.match(audit, /select[\s\S]*pg_catalog\.aclexplode[\s\S]*privilege\.grantee = 0[\s\S]*privilege\.privilege_type = 'EXECUTE'/i);
  assert.doesNotMatch(audit, /\b(?:insert|update|delete|alter|grant|revoke|create|drop|truncate)\b/i);
  assert.ok(login.indexOf("PUBLIC function ACL audit must be empty") < login.indexOf("create role pro03_staging_invitation_login"));
  assert.match(runbook, /result must contain zero rows|result must contain zero rows/i);
  assert.match(runbook, /evaluate that function individually|evaluate every returned function separately/i);
  assert.match(runbook, /No global ACL revocation is automatic/i);
});
