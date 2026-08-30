# PRO-03.3.2 — Implementation report

Status: local preparation only — **NOT EXECUTED**, not activated, not deployed.

## Outcome

The out-of-band activation surface is prepared at `/auth/activer-invitation`. It is a public, non-secret Server Component containing a plain HTML form. The activation code is submitted by same-origin POST to `/auth/preparer-invitation`, moved into the existing short-lived HttpOnly cookie, and never inserted into a URL, redirect, client component, Server Action, log, analytics event, or durable store. Invalid input produces a generic message and the submitted value is not rendered again.

The delivery contract now carries two separate message fields: an opaque ephemeral activation code and the constant non-secret path `/auth/activer-invitation`. The deterministic provider remains network-free and sends no email. Idempotent replay returns the previous secret-free status and does not call the provider again.

## Server boundary

`dedicatedPostgresExecutor.ts` implements the future Node PostgreSQL boundary with `pg`. It requires the URI, staging project reference, and exact staging Supavisor hostname in three dedicated server variables. Related `NEXT_PUBLIC_*` configuration is rejected. The URL must use the LOGIN `pro03_staging_invitation_login` suffixed by the exact configured project reference, the exact configured shared-pooler hostname, port 6543, database `postgres`, and only `sslmode=verify-full`. The sanitized configuration object contains no URI or password. The pool is capped at two connections.

Every call selects one of five compile-time SQL statements, validates the exact parameter set, uses `$n` bound values, starts `BEGIN`, runs `SET LOCAL ROLE invitation_issuer`, applies statement/lock/idle timeouts, validates the exact returned columns, and commits. Errors cause rollback; a hard transaction deadline destroys the connection, which makes PostgreSQL roll back the open transaction. Connections are released exactly once. Exceptions are replaced by a generic error with no connection string, code, email, SQL parameter, or provider response.

## Activation posture

Three gates are represented: source approval, valid dedicated server configuration, and a real provider. The committed source state is `locked`; no real provider exists; prepared dependencies still use an unavailable issuer and a deterministic simulated provider. Both teacher and staff routes therefore remain HTTP 503 even if an environment value is present.

## SQL corrections

The proposed migration now uses `activation_code` consistently, restores simulated claims in success and exception paths, requires `postgres` as explicit function owner, closes default function privileges, serializes concurrent actor+school and resource counters, blocks consumption while pending, and keeps terminal transitions atomic. Expiry during provider delivery produces failed/revoked state. Provider success followed by SQL confirmation failure stays pending and non-consumable until controlled reconciliation. An idempotent replay returns no activation code and never redelivers.

No migration was applied, no LOGIN or secret was created, no provider was enabled, no email was sent, and database writes are **0**.

## PRO-03.3.2.1 addendum

`PRO-03_3_2_PUBLIC_FUNCTION_ACL_AUDIT.sql` is a read-only staging preflight that lists functions/procedures in `public` and `private` with EXECUTE granted to PostgreSQL `PUBLIC`. It must return zero rows before any temporary LOGIN is created. The LOGIN proposal repeats this test before its `CREATE ROLE`; it performs no automatic ACL revocation and requires individual architect review of every finding.

## Local verification (2026-08-21)

- `npx tsc --noEmit --incremental false`: PASS.
- targeted ESLint over all PRO-03.3.2 application/test files: PASS.
- `npm run test:pro03`: PASS, 70/70.
- `npm run test:pro03:staging`: PASS, 9/9.
- `npm run test:pro03:supavisor`: PASS, 9/9.
- `npm run build`: PASS, 86/86 static pages generated.
- global `npm run lint`: FAIL only on eight pre-existing `react/no-unescaped-entities` errors outside PRO-03.3.2; all targeted sprint files pass ESLint.
- static scans: no raw-token identifier or literal PostgreSQL URI in PRO-03.3.2 scope, no third-party activation-page resource, and no privileged client/logger. The configured executor factory appears only at its definition and is not wired. The only `NEXT_PUBLIC_` occurrence in issuer code is the explicit rejection guard.
