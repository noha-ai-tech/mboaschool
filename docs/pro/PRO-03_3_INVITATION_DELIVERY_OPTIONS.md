# PRO-03.3 — Invitation Delivery Options

Date: 2026-08-20  
Status: architecture options only; no option is activated.

## Fixed PRO-03.2.2 baseline

`create_targeted_invitation` and `revoke_targeted_invitation` exist only as dormant, versioned functions. They have no `EXECUTE` beneficiary among `PUBLIC`, `anon`, `authenticated` or `service_role`. The browser-facing creation routes remain HTTP 503. Only `consume_targeted_invitation` is callable by `authenticated`, and it accepts an already-issued high-entropy token through the POST/cookie flow.

Any future option must introduce a separately reviewed issuer boundary. It must never solve delivery by granting `authenticated` direct execution of the token-returning creation RPC. It must also keep the raw token out of browser JavaScript, URLs, redirects, logs, analytics and durable queue payloads.

## Comparative summary

| Option | Owner identity proof | Direct browser creation RPC | Token confidentiality | Delivery-failure revocation | Auditability | Operational cost |
|---|---|---|---|---|---|---|
| Server-only session proof | Strong if session is verified server-side and school ownership is re-read | Impossible when issuer credential exists only server-side | Strong; server sends token directly to provider | Synchronous or compensating internal action | Good with request and delivery audit rows | Medium |
| Private outbox and controlled worker | Strong at enqueue time and rechecked by worker | Impossible; browser cannot read queue or issuer credential | Strong if queue contains no raw token | Strong, retryable lifecycle | Excellent | High |
| Authenticated Edge Function | Strong with validated user JWT plus live ownership lookup | Direct database RPC impossible; browser may invoke only the controlled Edge boundary | Strong if function never returns token and sends server-side | Immediate internal revocation on provider failure | Good with function logs and audit table | Medium |
| Out-of-band activation code | Depends on the server/worker that authorizes issuance | Impossible only when combined with a server-only issuer | Good if code is high entropy, POST-only and separately delivered | Explicit revoke/expiry required | Medium to good | Medium to high |

## Option A — Server-only session proof

### Design

A Next.js server route validates the current session with an authentic server-side user lookup, reloads the exact establishment and proves current ownership. A future migration introduces a dedicated issuer role or internal wrapper reachable only through a server-side database connection. That boundary creates the invitation and sends the token directly to the email/SMS provider; the HTTP response contains only a generic outcome.

The server credential must not be a public Supabase key and must never use an RPC privilege also granted to `authenticated`. The internal transaction must preserve the verified actor ID for `created_by` and repeat the ownership check at issuance time.

- **Owner proof:** verified session plus live `establishments.owner_id` lookup; never request metadata or caller-provided owner ID.
- **Browser bypass:** browser cannot possess the dedicated issuer credential or call the dormant RPC.
- **Token confidentiality:** raw token exists transiently in backend memory and delivery-provider request only.
- **Delivery failure:** the same internal boundary revokes immediately or records an undelivered state for controlled expiry.
- **Auditability:** record actor, school, resource, provider message ID, outcome and timestamps without token.
- **Dependencies/cost:** server-only database credential, connection pooling, email/SMS provider and secret rotation; simplest option at modest volume.

### Principal risk

Compromise of the server issuer credential widens impact. The role must be dedicated to the narrow issuance/revocation functions, rate-limited at the HTTP boundary and excluded from client bundles.

## Option B — Private outbox and controlled worker

### Design

The authenticated route validates the session and exact school, then writes a non-secret issuance request to a private outbox. A controlled worker claims requests, revalidates current ownership/resource state, generates and delivers the invitation, and archives the delivery outcome. The queue must never contain the raw token; it contains only request identifiers and delivery metadata.

Supabase Queues/PGMQ can provide a durable pull queue, visibility timeout and archival. Queues are not exposed through the Data API by default; that default must be retained. A custom private outbox table with explicit row states is another implementation choice.

- **Owner proof:** captured from verified session at enqueue and rechecked before issuance.
- **Browser bypass:** browser can request enqueue only through the controlled route; it cannot pop the queue or invoke the issuer.
- **Token confidentiality:** worker generates token immediately before provider submission; only the hash remains in the invitation table.
- **Delivery failure:** retry with idempotency; after terminal failure revoke the invitation or never mark it deliverable.
- **Auditability:** strongest option—request, claim, retry, provider response, revocation and archive form one timeline.
- **Dependencies/cost:** queue/outbox schema, worker runtime, scheduler, idempotency keys, monitoring, dead-letter policy and alerting.

### Principal risk

Retry semantics can accidentally create multiple invitations or send multiple messages. The resource lock, one-open-invitation constraint and idempotent worker key must remain authoritative.

## Option C — Authenticated Edge Function

### Design

An Edge Function accepts the signed-in user's JWT, validates it using the supported Supabase user-auth mode, then performs a live exact-school ownership check. A browser may invoke this reviewed Edge endpoint, but cannot invoke the database creation RPC or receive the token. The function uses a future dedicated internal issuer capability, sends the invitation itself and returns only a generic success/failure result.

JWT verification is authentication, not school authorization: ownership must still be loaded from the database. `user_metadata` must not be trusted. The privileged client/issuer must remain inside the function and have a narrower capability than general `service_role` where technically possible.

- **Owner proof:** verified JWT identity plus current database ownership check.
- **Browser bypass:** direct creation RPC remains denied; the browser can only request the controlled Edge workflow.
- **Token confidentiality:** Edge memory to provider only; never response body, URL or log.
- **Delivery failure:** Edge invokes the internal revocation/undelivered path before returning failure.
- **Auditability:** structured audit row plus function request ID/provider message ID; avoid sensitive log bodies.
- **Dependencies/cost:** Edge Function deployment, JWT/auth configuration, secrets, provider SDK, rate limits, observability and cold/runtime behavior.

### Principal risk

An authorization bug inside the function or misuse of its privileged client bypasses the closed RPC surface. The function needs targeted abuse tests, rate limiting and separate deployment approval.

## Option D — Out-of-band activation code

### Design

The recipient receives a high-entropy activation code through a channel separate from the non-secret application landing page and submits it in a same-origin POST. No code appears in a URL. This option governs recipient delivery and bootstrap; it does not independently solve owner-authorized creation, so it must be combined with Option A, B or C.

- **Owner proof:** inherited from the server/worker/Edge issuer used to create the code.
- **Browser bypass:** safe only if creation stays behind that issuer; code submission can call consumption only.
- **Token confidentiality:** no URL/referrer/history exposure; cookie bootstrap remains short-lived and HttpOnly.
- **Delivery failure:** owner or controlled worker revokes, and short expiry limits an undelivered code.
- **Auditability:** issuance channel, attempts, rate-limit events, success and revocation recorded without code.
- **Dependencies/cost:** second channel or manual code transfer, support UX, rate limiting, attempt counters and recovery process.

### Principal risk

Short numeric codes are brute-forceable. Use sufficient entropy, short TTL, single use, attempt throttling and generic errors. Treat the code as the bearer token even when humans type it.

## Recommendation for later architecture review

For low initial volume, Option A is the smallest defensible issuer if a narrow server-only database role and provider audit are acceptable. Option B is preferable when reliable retries, operational traceability and delivery volume justify a worker. Option C is viable within the Supabase platform but still needs an internal issuer capability and must never return the token. Option D is a transport complement, not a standalone creation architecture.

No SQL grant, route activation, Edge Function, queue, worker, provider integration or delivery mechanism is created in PRO-03.2.2.
