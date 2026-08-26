import { Pool, type PoolConfig } from "pg";
import type {
  DedicatedInvitationRoleExecutor,
  PrivateInvitationFunction,
} from "./internalIssuer.ts";
import { PRIVATE_INVITATION_FUNCTIONS } from "./internalIssuer.ts";

export const STAGING_INVITATION_LOGIN = "pro03_staging_invitation_login";
export const INVITATION_DATABASE_URL_ENV = "INVITATION_ISSUER_DATABASE_URL";
export const INVITATION_PROJECT_REF_ENV = "INVITATION_ISSUER_STAGING_PROJECT_REF";
export const INVITATION_SUPAVISOR_HOST_ENV = "INVITATION_ISSUER_STAGING_SUPAVISOR_HOST";

const MAX_POOL_SIZE = 2;
const STATEMENT_TIMEOUT_MS = 4_000;
const TRANSACTION_TIMEOUT_MS = 8_000;
const SUPABASE_PROJECT_REF_PATTERN = /^[a-z0-9]{20}$/;
const SUPAVISOR_HOST_PATTERN = /^aws-[0-9]+-[a-z0-9]+(?:-[a-z0-9]+)*\.pooler\.supabase\.com$/;

type QueryResultPort = {
  rows: Array<Record<string, unknown>>;
  rowCount: number | null;
};

export interface DedicatedPostgresClientPort {
  query(
    query: string | { text: string; values: ReadonlyArray<string | null> },
  ): Promise<QueryResultPort>;
  release(destroy?: boolean): void;
}

export interface DedicatedPostgresPoolPort {
  connect(): Promise<DedicatedPostgresClientPort>;
  end?(): Promise<void>;
}

export type DedicatedDatabaseConfiguration = Readonly<{
  projectRef: string;
  host: string;
  database: "postgres";
  username: string;
  poolMax: number;
  statementTimeoutMs: number;
  transactionTimeoutMs: number;
}>;

type ValidatedDedicatedDatabaseConfiguration = Readonly<{
  sanitizedConfiguration: DedicatedDatabaseConfiguration;
  connectionString: string;
}>;

export class DedicatedDatabaseConfigurationError extends Error {
  constructor() {
    super("Dedicated invitation database configuration is unavailable");
    this.name = "DedicatedDatabaseConfigurationError";
  }
}

export class DedicatedDatabaseExecutorError extends Error {
  constructor() {
    super("Dedicated invitation database operation failed");
    this.name = "DedicatedDatabaseExecutorError";
  }
}

export function readDedicatedDatabaseConfiguration(
  environment: NodeJS.ProcessEnv = process.env,
): DedicatedDatabaseConfiguration {
  return readValidatedDedicatedDatabaseConfiguration(environment).sanitizedConfiguration;
}

function readValidatedDedicatedDatabaseConfiguration(
  environment: NodeJS.ProcessEnv,
): ValidatedDedicatedDatabaseConfiguration {
  const forbiddenPublicConfiguration = Object.keys(environment).some(
    (name) =>
      name.startsWith("NEXT_PUBLIC_") &&
      /(?:INVITATION_ISSUER|DATABASE_URL|POSTGRES|SUPAVISOR)/.test(name),
  );
  if (forbiddenPublicConfiguration) {
    throw new DedicatedDatabaseConfigurationError();
  }

  const rawConnectionString = environment[INVITATION_DATABASE_URL_ENV];
  const expectedProjectRef = environment[INVITATION_PROJECT_REF_ENV];
  const expectedHost = environment[INVITATION_SUPAVISOR_HOST_ENV];
  if (
    !rawConnectionString ||
    rawConnectionString !== rawConnectionString.trim() ||
    /[\u0000-\u001f\u007f]/.test(rawConnectionString) ||
    rawConnectionString.includes("#") ||
    !expectedProjectRef ||
    !SUPABASE_PROJECT_REF_PATTERN.test(expectedProjectRef) ||
    !expectedHost ||
    !SUPAVISOR_HOST_PATTERN.test(expectedHost)
  ) {
    throw new DedicatedDatabaseConfigurationError();
  }

  let databaseUrl: URL;
  try {
    databaseUrl = new URL(rawConnectionString);
  } catch {
    throw new DedicatedDatabaseConfigurationError();
  }

  const expectedUsername = `${STAGING_INVITATION_LOGIN}.${expectedProjectRef}`;
  const searchParameters = Array.from(databaseUrl.searchParams.entries());
  if (
    (databaseUrl.protocol !== "postgres:" && databaseUrl.protocol !== "postgresql:") ||
    databaseUrl.username !== expectedUsername ||
    !databaseUrl.password ||
    databaseUrl.hostname !== expectedHost ||
    !databaseUrl.hostname.endsWith(".pooler.supabase.com") ||
    !SUPAVISOR_HOST_PATTERN.test(databaseUrl.hostname) ||
    databaseUrl.port !== "6543" ||
    databaseUrl.pathname !== "/postgres" ||
    databaseUrl.hash !== "" ||
    databaseUrl.search !== "?sslmode=verify-full" ||
    searchParameters.length !== 1 ||
    searchParameters[0][0] !== "sslmode" ||
    searchParameters[0][1] !== "verify-full"
  ) {
    throw new DedicatedDatabaseConfigurationError();
  }

  return Object.freeze({
    connectionString: rawConnectionString,
    sanitizedConfiguration: Object.freeze({
      projectRef: expectedProjectRef,
      host: expectedHost,
      database: "postgres",
      username: expectedUsername,
      poolMax: MAX_POOL_SIZE,
      statementTimeoutMs: STATEMENT_TIMEOUT_MS,
      transactionTimeoutMs: TRANSACTION_TIMEOUT_MS,
    }),
  });
}

export function hasCompleteDedicatedDatabaseConfiguration(
  environment: NodeJS.ProcessEnv = process.env,
): boolean {
  try {
    readDedicatedDatabaseConfiguration(environment);
    return true;
  } catch {
    return false;
  }
}

export function createDedicatedInvitationExecutor(
  pool: DedicatedPostgresPoolPort,
  transactionTimeoutMs = TRANSACTION_TIMEOUT_MS,
): DedicatedInvitationRoleExecutor {
  return {
    async execute<T>(functionName: PrivateInvitationFunction, parameters) {
      const invocation = buildAllowListedInvocation(functionName, parameters);
      let client: DedicatedPostgresClientPort;
      try {
        client = await pool.connect();
      } catch {
        throw new DedicatedDatabaseExecutorError();
      }
      let released = false;
      let transactionStarted = false;

      const releaseOnce = (destroy = false) => {
        if (released) return;
        released = true;
        try {
          client.release(destroy);
        } catch {
          // A release failure must not leak a driver error or connection detail.
        }
      };

      let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          // Closing a PostgreSQL connection aborts its open transaction. This is
          // the hard transaction deadline if the server-side statement timeout
          // cannot return control to the client in time.
          releaseOnce(true);
          reject(new DedicatedDatabaseExecutorError());
        }, transactionTimeoutMs);
      });

      try {
        const operation = (async () => {
          await client.query("BEGIN");
          transactionStarted = true;
          await client.query("SET LOCAL ROLE invitation_issuer");
          await client.query("SET LOCAL statement_timeout = '4000ms'");
          await client.query("SET LOCAL lock_timeout = '2000ms'");
          await client.query("SET LOCAL idle_in_transaction_session_timeout = '4000ms'");

          const result = await client.query({
            text: invocation.text,
            values: invocation.values,
          });
          const value = validateInvocationResult(functionName, result);
          await client.query("COMMIT");
          transactionStarted = false;
          return value as T;
        })();

        return await Promise.race([operation, timeout]);
      } catch {
        if (transactionStarted && !released) {
          try {
            await client.query("ROLLBACK");
          } catch {
            releaseOnce(true);
          }
        }
        throw new DedicatedDatabaseExecutorError();
      } finally {
        if (timeoutHandle) clearTimeout(timeoutHandle);
        releaseOnce();
      }
    },
  };
}

export function createConfiguredDedicatedInvitationExecutor(
  environment: NodeJS.ProcessEnv = process.env,
): Readonly<{
  executor: DedicatedInvitationRoleExecutor;
  close: () => Promise<void>;
}> {
  const validated = readValidatedDedicatedDatabaseConfiguration(environment);
  const configuration = validated.sanitizedConfiguration;
  const poolConfig: PoolConfig = {
    connectionString: validated.connectionString,
    max: configuration.poolMax,
    connectionTimeoutMillis: 3_000,
    idleTimeoutMillis: 10_000,
    statement_timeout: configuration.statementTimeoutMs,
    query_timeout: configuration.statementTimeoutMs + 1_000,
    idle_in_transaction_session_timeout: configuration.statementTimeoutMs,
    allowExitOnIdle: true,
    application_name: "ecoles237-pro03-invitation-issuer",
  };
  let pool: Pool;
  try {
    pool = new Pool(poolConfig);
    pool.on("error", () => {
      // Intentionally silent: idle-client errors can contain connection data.
    });
  } catch {
    throw new DedicatedDatabaseConfigurationError();
  }
  return Object.freeze({
    executor: createDedicatedInvitationExecutor(
      pool as unknown as DedicatedPostgresPoolPort,
      configuration.transactionTimeoutMs,
    ),
    close: async () => {
      try {
        await pool.end();
      } catch {
        throw new DedicatedDatabaseExecutorError();
      }
    },
  });
}

type Invocation = Readonly<{
  text: string;
  values: ReadonlyArray<string | null>;
}>;

function buildAllowListedInvocation(
  functionName: PrivateInvitationFunction,
  parameters: Readonly<Record<string, string | null>>,
): Invocation {
  switch (functionName) {
    case PRIVATE_INVITATION_FUNCTIONS.issue:
      assertExactParameters(parameters, [
        "p_actor_id",
        "p_establishment_id",
        "p_resource_type",
        "p_resource_id",
        "p_recipient_email",
        "p_idempotency_key",
        "p_retry_of",
      ]);
      return Object.freeze({
        text: "SELECT invitation_id, attempt_id, delivery_status, created, activation_code FROM private.issue_targeted_invitation($1::uuid, $2::uuid, $3::text, $4::uuid, $5::text, $6::uuid, $7::uuid)",
        values: valuesFor(parameters, [
          "p_actor_id",
          "p_establishment_id",
          "p_resource_type",
          "p_resource_id",
          "p_recipient_email",
          "p_idempotency_key",
          "p_retry_of",
        ]),
      });
    case PRIVATE_INVITATION_FUNCTIONS.complete:
      return booleanInvocation(
        "SELECT private.complete_targeted_invitation_delivery($1::uuid, $2::uuid, $3::text) AS result",
        parameters,
        ["p_actor_id", "p_attempt_id", "p_provider_message_id"],
      );
    case PRIVATE_INVITATION_FUNCTIONS.fail:
      return booleanInvocation(
        "SELECT private.fail_targeted_invitation_delivery($1::uuid, $2::uuid, $3::text) AS result",
        parameters,
        ["p_actor_id", "p_attempt_id", "p_failure_code"],
      );
    case PRIVATE_INVITATION_FUNCTIONS.revoke:
      return booleanInvocation(
        "SELECT private.revoke_issued_targeted_invitation($1::uuid, $2::uuid, $3::text) AS result",
        parameters,
        ["p_actor_id", "p_invitation_id", "p_reason"],
      );
    case PRIVATE_INVITATION_FUNCTIONS.stale:
      return booleanInvocation(
        "SELECT private.revoke_stale_targeted_invitation_delivery($1::uuid) AS result",
        parameters,
        ["p_attempt_id"],
      );
    default:
      throw new DedicatedDatabaseExecutorError();
  }
}

function booleanInvocation(
  text: string,
  parameters: Readonly<Record<string, string | null>>,
  names: ReadonlyArray<string>,
): Invocation {
  assertExactParameters(parameters, names);
  return Object.freeze({ text, values: valuesFor(parameters, names) });
}

function assertExactParameters(
  parameters: Readonly<Record<string, string | null>>,
  expected: ReadonlyArray<string>,
) {
  const actual = Object.keys(parameters).sort();
  const sortedExpected = [...expected].sort();
  if (
    actual.length !== sortedExpected.length ||
    actual.some((name, index) => name !== sortedExpected[index]) ||
    expected.some((name) => {
      const value = parameters[name];
      return value !== null && typeof value !== "string";
    })
  ) {
    throw new DedicatedDatabaseExecutorError();
  }
}

function valuesFor(
  parameters: Readonly<Record<string, string | null>>,
  names: ReadonlyArray<string>,
): ReadonlyArray<string | null> {
  return names.map((name) => parameters[name]);
}

function validateInvocationResult(
  functionName: PrivateInvitationFunction,
  result: QueryResultPort,
): unknown {
  if (result.rowCount !== 1 || result.rows.length !== 1) {
    throw new DedicatedDatabaseExecutorError();
  }

  const row = result.rows[0];
  const expectedColumns =
    functionName === PRIVATE_INVITATION_FUNCTIONS.issue
      ? ["activation_code", "attempt_id", "created", "delivery_status", "invitation_id"]
      : ["result"];
  const actualColumns = Object.keys(row).sort();
  if (
    actualColumns.length !== expectedColumns.length ||
    actualColumns.some((column, index) => column !== expectedColumns[index])
  ) {
    throw new DedicatedDatabaseExecutorError();
  }

  if (functionName !== PRIVATE_INVITATION_FUNCTIONS.issue) {
    if (typeof row.result !== "boolean") throw new DedicatedDatabaseExecutorError();
    return row.result;
  }
  return row;
}
