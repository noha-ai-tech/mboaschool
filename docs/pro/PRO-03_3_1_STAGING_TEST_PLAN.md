# PRO-03.3.1 — Staging integration test plan

Status: **PREPARED — NOT EXECUTED — REQUIRES ARCHITECT APPROVAL**

## Isolation requirements

Use a disposable staging project or production-schema clone with synthetic data
only. Never point the test runner at production. The project must start from the
verified PRO-03.2.2 schema with zero invitations. Use a temporary dedicated
LOGIN created according to the server-role runbook, then destroy it and its
secret at the end.

The future test harness needs a pinned direct PostgreSQL driver and accepts the
temporary connection through a server-only process environment variable. The
plan intentionally contains no connection string, password, project reference,
email-provider credential or real address.

## Synthetic fixtures

- Owner A + Pro School A + unlinked Teacher A + unlinked Staff A.
- Owner B + Pro School B + unlinked Teacher B + unlinked Staff B.
- Authenticated non-owner C.
- Recipient users with synthetic verified emails matching A/B resources.
- A deterministic provider double; no network and no actual email.

Every UUID and email is generated for staging. Fixture cleanup is explicit and
must be restricted to the staging fixture prefix/IDs.

## Phase 1 — migration and catalog proof

1. Snapshot role/function/table ACLs and row counts.
2. Apply `PRO-03_3_PROPOSED_MIGRATION.sql` to staging only.
3. Confirm `invitation_issuer` is NOLOGIN/NOINHERIT/no bypass attributes.
4. Confirm PUBLIC, anon, authenticated and service_role cannot execute public
   create/revoke or any private issuer function.
5. Confirm authenticated alone can execute public consume.
6. Confirm standard roles and `invitation_issuer` have no direct rights on either
   private table.
7. Confirm function owners, empty search paths and default EXECUTE revocations.
8. Run syntax/schema advisors and preserve secret-free output.

## Phase 2 — temporary LOGIN proof

1. Create a randomly named temporary LOGIN with NOINHERIT and only
   `invitation_issuer` membership.
2. Connect with TLS and prove private function invocation fails before `SET ROLE`.
3. Begin READ COMMITTED; `SET LOCAL ROLE invitation_issuer`; prove exact private
   calls are allowed.
4. Prove direct table access and public create/revoke/consume remain denied.
5. Prove SET ROLE to authenticated, service_role, postgres and business roles is
   denied.
6. Prove a non-owner actor/school pair and mismatched resource/email are denied.

The dedicated credential can attest any actor parameter if fully compromised;
the route-to-adapter test must therefore separately prove the actor always comes
from `auth.getUser().user.id` and is never accepted from request data.

## Phase 3 — HTTP trust-boundary tests

Run the app with the deterministic provider and a reviewed staging-only executor,
but keep production configuration untouched:

| Case | Expected |
|---|---|
| no session | 401; no issuer call |
| body contains actor/owner/created-by field | 400; no issuer call |
| Owner A + School A + exact resource A | issuer receives Owner A from `getUser` |
| Owner A + School B | 403; no issuer call |
| resource B path + School A | 404; no issuer call |
| client email/unknown field | 400; stored resource email remains authoritative |
| missing/invalid school UUID | 400 |
| missing/invalid idempotency key after staging activation | 400 |
| response/headers | generic body, no secret; no-store/no-referrer |

Capture HTTP bodies/headers only after installing a canary scanner that fails if
the known synthetic code appears. Do not retain request/provider bodies.

## Phase 4 — lifecycle and failure injection

- Success: one pending row/attempt, simulated provider acceptance, completion to
  delivered, then authenticated matching recipient consumes once.
- Confirmed failure: failure function marks attempt failed and invitation revoked;
  consumption fails.
- Ambiguous/timeout/crash-after-provider: invitation remains pending and cannot
  be consumed; after 15 minutes (or a controlled clock fixture), stale revocation
  marks it failed/revoked.
- Idempotent replay: same key/payload returns existing secret-free status, creates
  no row and causes no second provider call.
- Payload conflict: same key with different school/resource/email/retry is denied.
- Explicit retry: new key referencing failed attempt creates a different
  invitation/hash; old code remains unusable.
- Expiry, owner revoke, wrong user/email and replay are denied.
- Staff/teacher linkage and consumed marker commit atomically under injected SQL
  failures.

## Phase 5 — concurrency and rate limits

Use independent database connections and a start barrier:

1. submit two different keys for one resource simultaneously: exactly one open
   invitation, no duplicate provider delivery;
2. submit the same key simultaneously: one creation, other replay;
3. submit six distinct resources/keys for one actor+school inside one hour: five
   succeed at most and the sixth receives the rate-limit error;
4. submit four distinct keys for one resource inside 24 hours, revoking failures
   between attempts: three succeed at most and the fourth is limited;
5. repeat at the threshold from 20 runs to expose snapshot races;
6. run with REPEATABLE READ and prove the issuer rejects isolation `25000`;
7. observe locks/deadlocks/timeouts; expected deadlocks: zero.

## Phase 6 — static leakage scan

Search built client chunks, route responses, redirects, server logs, analytics
payloads, attempt rows, error traces and provider-double state for the canary
activation code. Expected matches: zero outside the controlled in-memory delivery
assertion. Verify no `SUPABASE_SERVICE_ROLE_KEY` reference exists in issuer files.

## Cleanup and evidence

Lock routes, stop the app, revoke membership, terminate only the temporary
LOGIN's connections, drop that LOGIN without CASCADE, delete the temporary secret,
and remove synthetic fixtures from staging by exact IDs. Preserve only ACL output,
test results, timings, row counts and sanitized failure codes.

Passing this plan validates staging behavior; it does not authorize production
migration, provider activation or deployment.

