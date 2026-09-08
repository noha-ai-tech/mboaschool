# PRO-03.3 — Application implementation plan

Status: **PREPARED ONLY — APPLICATION ISSUER NOT IMPLEMENTED**

## Gate 0 — approvals and isolated validation

1. Eddy and the architect approve the ADR, threat model, SQL, failure tradeoff,
   delivery provider, retention policy, and rate limits.
2. Apply and exercise the proposal only in a disposable production-schema clone.
3. Inspect `proacl`, `nspacl`, `relacl`, role membership, function owners, and
   default privileges. Execute all STAGING cases in the test matrix, including
   concurrency and transaction-failure injection.
4. Confirm the migration owner used by production. Replace no placeholder by
   assumption; default privileges must target every actual object creator.

## Gate 1 — minimal runtime identity

- Provision a dedicated PostgreSQL LOGIN outside application code and grant it
  membership only in `invitation_issuer`. It must have no service role,
  `BYPASSRLS`, schema CREATE, table rights, or object ownership.
- Require TLS, a low connection limit, short statement/lock timeouts, and an
  independently rotatable password.
- Add a server-only secret named `INVITATION_ISSUER_DATABASE_URL`. Do not prefix
  it with `NEXT_PUBLIC_`. Do not create it during this design step.
- Pin a supported direct PostgreSQL driver after review. Do not implement the
  internal issuer through Supabase PostgREST, because the desired private role is
  deliberately absent from browser/Data API roles.

## Gate 2 — provider adapter

Create a narrow server-only interface such as:

```ts
type DeliveryResult =
  | { ok: true; providerMessageId: string }
  | { ok: false; failureCode: string; retryable: boolean };

sendInvitation(input: {
  recipientEmail: string;
  activationCode: SecretString;
  nonSecretLandingUrl: string;
  providerIdempotencyKey: string;
}): Promise<DeliveryResult>;
```

Select one provider, approve its DPA/retention, configure a verified sender, and
store its key server-side. The adapter must never log request bodies, activation
codes, provider raw errors, or rendered messages. Map failures to a short allow-
listed code. The landing URL contains no invitation identifier or token.

## Gate 3 — server-only issuer module

Add a module under `src/lib/invitations/server/` with `server-only` protection.
It should:

1. accept only the session-derived actor, explicit school/resource UUIDs,
   resource email already resolved by the route, and a non-secret idempotency UUID;
2. call `private.issue_targeted_invitation` using a parameterized query;
3. hold the returned code only in a local variable marked secret;
4. invoke the provider directly;
5. call `complete_targeted_invitation_delivery` on confirmed success or
   `fail_targeted_invitation_delivery` on confirmed failure;
6. return only `{ status, invitationId?, attemptId? }`, never the code;
7. treat timeouts as unknown/pending and schedule reconciliation, not delivery
   success;
8. redact thrown errors at the route boundary.

No global cache, queue, database audit row, analytics event, error message, or
response may receive the activation code.

## Gate 4 — routes, still closed until final activation approval

After Gates 0–3 pass, update only:

- `src/app/api/enseignants/[id]/inviter/route.ts`
- `src/app/api/personnel/[id]/inviter/route.ts`

Pin `export const runtime = "nodejs"`. Keep `authorizeEstablishmentRoute`, exact
resource + establishment filters, normalized-email checks, and explicit
`requestedEstablishmentId`. Ignore any client actor/owner ID. Add CSRF/origin and
request-size checks, application-level session/IP rate limiting, a required UUID
idempotency key, `Cache-Control: no-store`, and `Referrer-Policy: no-referrer`.

Do not remove HTTP 503 until a separate activation change receives explicit Eddy
and architect approval. The current PRO-03.3 preparation changes no route.

## Gate 5 — consume and out-of-band UX

Preserve the current POST-only consumption and short HttpOnly cookie. Email opens
a generic non-secret landing page; the recipient enters/pastes the activation
code into a POST form. The callback never reads an invitation query parameter.
Clear the cookie on every terminal success and failure path. Do not add token
analytics or client persistence.

## Gate 6 — reconciliation, monitoring, and rollout

- Implement a controlled scheduled task that identifies stale attempt IDs
  without reading tokens and calls the fixed-threshold stale-revoke function.
- Add metrics for counts/status/latency by provider and failure code only. Alert
  on pending age, failure rate, rate-limit abuse, and ACL drift.
- Run the full test matrix with a provider sandbox and canary code scan.
- Activate for an internal test school, then a limited cohort. Keep a route-level
  kill switch capable of returning 503 before any DB issuance.

## Explicit non-work in this step

No driver or provider package is installed, no source route is activated, no
secret/login is created, no email is sent, no migration is run, no Wave B–D is
run, and no Supabase/Vercel state is changed.

