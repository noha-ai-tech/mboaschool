# PRO-03.3 — Threat model

Status: **PREPARED — NOT VALIDATED — NOT EXECUTED**

## Assets and trust boundaries

Assets are the raw activation code, invitation hash/lifecycle, recipient email,
owner identity, establishment/resource binding, issuer database credential, and
provider credential. Trust boundaries are: browser → Next.js route; Next.js →
PostgreSQL; Next.js → email provider; recipient → consume route; and operational
logs/analytics.

## Threats and controls

| Threat | Required controls | Residual risk / response |
|---|---|---|
| Browser calls SQL issuer directly | Issuer lives in `private`; PUBLIC/anon/authenticated/service_role have no EXECUTE; Data API client has no private schema/table rights | A compromised server credential remains powerful inside its narrow capability; rotate and revoke it. |
| Owner identity is forged in JSON | Route ignores actor input and uses verified `auth.getUser()`; DB requires actor in `auth.users` and exact `establishments.owner_id` | Compromised authenticated session acts as that owner; normal session security and rate limits apply. |
| Cross-school/tab confusion | Explicit establishment UUID on every request; resource resolved by UUID + school in route and DB | UI state is untrusted; mismatches fail closed. |
| Foreign/nonexistent resource or email substitution | DB exact-resource query and normalized-email equality; linked staff/teacher consistency check | Email account compromise is outside issuer scope. |
| Token leakage through URL/prefetch/referrer | Email uses non-secret landing URL; code is in body and submitted by POST; existing callback has no token query parameter | Clipboard/email mailbox compromise remains possible; short TTL and revocation reduce exposure. |
| Token leakage through response/log/analytics | Issuer response is secret-free; provider adapter accepts a secret-marked value; structured audit excludes token/body; error messages are generic | Provider may retain message contents under its policy; approve retention/DPA. |
| Database dump reveals bearer token | Only SHA-256 hash is stored | Low-entropy tokens would be vulnerable; require 32 random bytes. |
| Provider rejects delivery | Mark attempt failed and revoke invitation atomically | Retry requires a new token/key. |
| Provider accepts, acknowledgement is lost | Invitation stays pending and cannot be consumed; stale reconciliation revokes before retry | Recipient may receive an unusable code; this is the intentional fail-safe tradeoff. |
| Duplicate or concurrent issuance | Unique idempotency key, advisory resource lock, existing one-open-resource constraint | Provider-side duplicate after ambiguous timeout is possible; use provider idempotency where supported and never reactivate old token. |
| Replay/expired/revoked token | Existing authenticated atomic consume plus delivery guard, expiry, revoke, and row locks | Online guessing is rate-limited at HTTP boundary; 256-bit secret makes offline guessing infeasible. |
| Partial staff/teacher link | Existing consume function locks in fixed order and commits linkage plus `consumed_at` atomically | SQL regression requires integration tests before execution. |
| Privilege drift/new function defaults | Revoke schema/table rights and function EXECUTE explicitly; alter default function privileges for deployment owner; automated ACL assertions | Functions created by a different owner need their own default-privilege configuration and review. |
| SQL injection/direct DB misuse | Parameterized direct-Postgres calls; fixed function names; credential has function-only grants | Runtime host compromise can invoke allowed functions; rate limits and audit contain impact. |
| Audit tampering or secret injection | Private table, enumerated status/failure code, no raw error/provider body, no client DML | Database owner can alter audit; infrastructure logs need separate access controls. |
| Denial of service / invitation spam | Per-actor/school and per-resource DB limits plus route/session/IP limits | Distributed session abuse requires external WAF/provider monitoring. |
| Stolen issuer/provider credential | Server-only env variables, least privilege, rotation runbook, no browser bundle | Secret management and incident response must be approved before activation. |

## Explicitly out of scope

Mailbox security, organization-wide identity federation, provider procurement,
WAF deployment, and Waves B–D are outside this preparation. They cannot weaken
the invariants above when added later.

## Security acceptance criteria

No architecture approval should be given until the migration is tested in an
isolated database, ACLs are introspected by role, failure injection proves pending
tokens non-consumable, logs/responses are scanned for canary secrets, and the
credential/provider lifecycle is documented operationally.

