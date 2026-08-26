# PRO-03.3 — Architecture decision

Status: **PROPOSED — NOT EXECUTED — ARCHITECT APPROVAL REQUIRED**  
Decision: **Option A, Next.js Node server route with a dedicated internal database capability**  
Complement: **Option D, out-of-band activation code in the message body**

## Decision drivers

- Derive the actor from a server-verified user session.
- Recheck exact-school ownership and exact resource identity in the database.
- Make direct browser invocation of the SQL issuer impossible.
- Never expose the raw token in browser responses, URLs, redirects, logs,
  analytics, database rows, or a queue.
- Keep the failure model fail-closed and observable.
- Fit the repository's current low-volume Next.js architecture without adding an
  unused asynchronous platform.

## Options compared

| Option | Identity proof | Browser cannot invoke issuer | Token confidentiality | Delivery failure | Auditability | New operational cost | Decision |
|---|---|---|---|---|---|---|---|
| A. Next.js server + dedicated capability | Verified session plus DB owner check | Yes: private direct-Postgres function and non-login capability | Token lives only in issuer process memory and provider body | Pending is non-consumable; failure revokes; reconciliation handles unknown outcome | Private attempt ledger | Direct DB connection, one provider adapter, cleanup job | **Primary** |
| B. Private outbox + worker | Same proof at enqueue time | Yes | Token must never enter queue; worker would need late generation or protected handoff | Best durable retry semantics | Strong | Queue, worker, monitoring, poison-message handling | Future upgrade if volume warrants |
| C. Authenticated Edge Function | JWT validation plus DB owner check | Browser can call the Edge endpoint, though not SQL directly | Achievable with careful implementation | Similar to A | Good | New Supabase Functions runtime, deployment and secrets | Not selected for current repo |
| D. Out-of-band activation code | Complements A/B/C; not an issuer boundary | No, by itself | Avoids token in links and prefetch | Depends on primary option | Neutral | User entry friction | **Required complement** |

## Selected boundary

```text
browser (session + non-secret request)
    -> Next.js Node route
       -> verified auth.getUser()
       -> exact establishment/resource check
       -> direct PostgreSQL login dedicated to invitation issuance
          -> NOLOGIN invitation_issuer capability
          -> private.issue_targeted_invitation(... actor UUID ...)
             -> DB independently proves auth.users + exact owner_id + resource/email
             -> dormant public.create_targeted_invitation invoked internally
       -> email provider (raw code only in message body)
       -> private complete/fail function
browser <- generic status with no token
```

The direct database login is a future deployment identity. It must inherit only
the `invitation_issuer` capability and must not inherit or receive `service_role`,
table DML, `BYPASSRLS`, object ownership, or broad schema rights. The browser has
neither the login nor any executable issuer RPC through PostgREST.

## Identity and anti-spoofing

The route derives `actor_id` from `supabase.auth.getUser()`; it does not accept an
owner ID from JSON. Passing an actor UUID across the internal DB boundary is not
the sole proof: the dedicated credential identifies the trusted issuer, and the
private function independently requires that actor to exist and currently own
the exact establishment. It also resolves the resource by explicit UUID and
school, and compares its normalized email. A forged actor/resource combination
therefore fails even if application validation regresses.

## Secret and delivery contract

- Generate 32 random bytes and store only the hexadecimal SHA-256 hash.
- Return the raw code once, only across the private DB connection to server
  memory; pass it directly to the provider adapter.
- Email contains a non-secret landing URL and the activation code in its body.
  The user submits the code by POST through the existing HttpOnly-cookie flow.
- Provider success transitions `pending` to `delivered`; only `delivered` may be
  consumed.
- Provider rejection transitions the attempt to `failed` and revokes the
  invitation. A timeout/crash leaves `pending`, which remains non-consumable.
  Reconciliation later revokes stale pending rows before an explicit retry.
- Unknown provider outcome can sacrifice delivery availability, never token
  exploitability. A new retry uses a new token.

## Idempotency, concurrency, and limits

The client generates a non-secret UUID idempotency key. A unique constraint makes
the same request return its prior secret-free status without issuing again. The
existing one-open-resource unique index plus resource advisory lock serializes
different-key concurrent requests. A failed retry uses a new key and references
the failed attempt. Database limits are proposed at five attempts per actor and
school per hour and three attempts per resource per 24 hours; the route may add
an outer IP/session limiter.

## Dormant functions

- `public.create_targeted_invitation`: retained, no EXECUTE beneficiary among
  PUBLIC/anon/authenticated/service_role; invoked only by the private definer.
- `public.revoke_targeted_invitation`: retained and equally dormant; internal
  revocation uses a private owner-checked wrapper.
- `public.consume_targeted_invitation`: remains authenticated-only and gains a
  delivery-state guard through a table trigger.

Moving public functions into `private` is preferable in a later clean migration,
but not necessary for the minimum reversible boundary. No direct grant is added
to `authenticated` or `service_role`.

## Consequences and approval gates

Before activation, the architect must approve the SQL, runtime role provisioning,
provider, timeout/reconciliation policy, rate limits, and redaction controls.
Eddy must approve creation of the runtime credential and provider secret. Until
then the two HTTP routes stay at 503 and no delivery occurs.
