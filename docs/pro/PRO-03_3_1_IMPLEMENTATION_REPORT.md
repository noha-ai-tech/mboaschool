# PRO-03.3.1 — Invitation issuer application implementation report

Status: **IMPLEMENTED LOCALLY — LOCKED — NOT CONNECTED — NOT EXECUTED**  
Branch: `feat/pro-school-organization`  
Date: 2026-08-20

## Outcome

The Option A application boundary is implemented for the teacher and personnel
invitation routes. Both are explicit Node.js Route Handlers and remain closed by
a source-controlled `locked` state. The state is not read from an environment
variable. A second independent safeguard wires an unavailable database issuer,
so changing the lock alone still cannot create an invitation.

No LOGIN, membership, connection string, provider secret, provider SDK, email,
Supabase call, migration execution, deployment, or database write was performed.

## Application changes

| Component | Result |
|---|---|
| `issuerContracts.ts` | Strict body allow-list; rejects client actor/owner/creator fields; UUID and stored-email validation; opaque redacting secret wrapper; ports/types. |
| `internalIssuer.ts` | Adapter restricted to the five `private.*` issuer functions; prepared executor contract; unavailable default. No public RPC or Supabase admin client. |
| `deterministicDeliveryProvider.ts` | Network-free success, confirmed failure, ambiguous and timeout modes; secret-free idempotency cache. |
| `issuerFlow.ts` | Issue → deliver → complete/compensate orchestration; ambiguous/timeout stay pending; public result contains outcome only. |
| `issuerServerWiring.ts` | Explicit source lock plus unavailable issuer. No environment-controlled activation. |
| `issuerHttp.ts` | Generic secret-free JSON and `no-store`/`no-referrer` headers on every response. |
| Teacher/personnel routes | Node runtime, strict request, verified session helper, exact owner school, exact UUID+school resource reload, stored normalized email, session-derived actor. |

## Trust decisions

- `actorId` is assigned only from `access.user.id`. That user is returned by the
  existing helper's server-side `supabase.auth.getUser()` call.
- The request parser rejects `actor_id`, `actorId`, `owner_id`, `ownerId`,
  `created_by`, and `createdBy`, and rejects any unknown body field.
- Neither route reads user/app metadata, `getSession()`, a client email, an
  ambient school cookie, nor `service_role`.
- The exact resource is selected by path UUID and
  `etablissement_id = access.establishment.id`; only its stored email is normalized
  and forwarded.
- The proposed database function repeats actor existence, exact owner, resource,
  school, email, lifecycle, uniqueness and rate-limit checks.

## Delivery behavior

| Simulated result | Application transition |
|---|---|
| success | Calls private completion; public outcome `delivered`. |
| confirmed failure | Calls private failure compensation; invitation becomes failed/revoked. |
| ambiguous | No terminal transition; remains pending and non-consumable. |
| timeout/throw | No guessed success or resend; remains pending for stale revocation. |
| same idempotency key | Existing secret-free state; no second provider attempt. |
| explicit retry | New key plus `retryOf`; database must create a new invitation/code. |

The activation code exists only as an opaque in-memory object between the
internal issuer and provider port. Its string and JSON coercions return
`[REDACTED]`. It is absent from route responses, redirects, URLs, client code,
errors, logs, analytics, queues and durable application storage.

## Migration adjustment

`PRO-03_3_PROPOSED_MIGRATION.sql` now serializes different-key rate-limit checks
with ordered transaction advisory locks for actor+school and resource. It also
requires `READ COMMITTED`, because a long-lived repeatable-read snapshot could
miss a just-committed concurrent attempt. This SQL remains proposed and was not
executed or syntax-validated against PostgreSQL.

## Activation gates still open

1. Architect approval of the trust boundary and changed SQL.
2. Disposable staging migration and SQL/catalog/concurrency tests.
3. Temporary staging LOGIN exercise, then destruction.
4. Selection and security review of a real provider.
5. Separate reviewed direct-Postgres executor using explicit `SET LOCAL ROLE`.
6. Secret provisioning and rotation procedure.
7. Explicit source change replacing both the lock and unavailable adapter.

## Local verification result

| Check | Result |
|---|---|
| Targeted issuer lint | PASS — zero error |
| PRO-03 tests | PASS — 52/52 at the recorded validation pass |
| Static leakage scan | PASS — zero forbidden issuer log/service-role/public-RPC/client-import match |
| TypeScript | BLOCKED OUTSIDE SCOPE — `school-page/admissions/route.ts` `FieldResult.error` narrowing errors and a concurrent `AdmissionsConfig` reference |
| Next build | COMPILES, THEN BLOCKED OUTSIDE SCOPE by the same admissions TypeScript error |

The PRO-03.3.1 files themselves passed TypeScript before the unrelated concurrent
admissions changes appeared, and continue to pass targeted lint and tests. The
global TypeScript/build status must nevertheless be reported as failed until the
separate admissions worktree changes are corrected by their owner.
