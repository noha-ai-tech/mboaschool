# PRO-03.3.1 — Trust boundary review

Status: **PREPARED — LOCAL IMPLEMENTATION ONLY — NOT ACTIVATED**

## Boundary

```text
Untrusted browser
  POST { requestedEstablishmentId, idempotencyKey?, retryOf? }
      │
      ▼
Next.js Node route
  strict body parser ── rejects actor/owner/creator/unknown fields
  Supabase SSR client ─ auth.getUser()
  exact school helper ─ establishments.id + owner_id + Pro plan
  exact resource load ─ resource UUID + etablissement_id
  stored normalized email only
  actorId = access.user.id only
      │  [currently stopped by source lock: HTTP 503]
      ▼
Dedicated-role adapter (prepared, unavailable)
  allow-listed private functions only
      ▼
PostgreSQL rechecks actor + exact owner/school/resource/email
```

## Identity proof

The web identity proof is the current Auth user returned by the server call to
`auth.getUser()`. No identity is accepted from JSON, URL parameters, cookies
other than the Auth session managed by the server client, user metadata, or app
metadata. The helper queries the exact school with `owner_id = user.id`; the route
then copies only `access.user.id` into the internal command.

The direct database login proves that a request came from the dedicated server
boundary, not that a specific human session exists. The private SQL function
therefore treats `p_actor_id` as a server attestation and independently proves
that this UUID currently exists and owns the exact school. This prevents a
mismatched actor/school/resource but cannot protect against complete compromise
of the dedicated server credential. Credential isolation, rate limits, audit,
rotation and immediate revocation are required residual-risk controls.

## Input authority table

| Value | Authority | Browser value accepted? | Database recheck? |
|---|---|---:|---:|
| Actor UUID | `auth.getUser().user.id` | **No** | actor exists + exact current owner |
| School UUID | explicit request field | Yes, as untrusted selector | exact school + owner |
| Resource UUID | route path | Yes, as untrusted selector | exact UUID + same school |
| Recipient email | selected resource row | **No** | normalized exact resource email |
| Idempotency key | browser-generated non-secret UUID | Yes | unique key + payload equality + locks |
| Retry reference | browser-provided non-secret UUID | Yes | same actor/school/resource and failed/revoked state |
| Activation code | database CSPRNG | **No** | SHA-256 hash only stored |

## Browser and module isolation

- The two routes never import `src/lib/supabase/admin.ts` and never call `.rpc()`.
- The internal adapter contains an exact private-function allow-list and no
  arbitrary SQL/function name from input.
- No Client Component imports an issuer module. The only client request fields
  currently sent are the explicit school; routes remain closed before an
  idempotency key becomes mandatory.
- `NEXT_PUBLIC_*` is never used for the future database credential.
- HTTP responses are generic and always set `Cache-Control: no-store` and
  `Referrer-Policy: no-referrer`.

## Activation safety

Activation is two-step and source controlled:

1. change `ACTIVATION.state` from `locked` only in an approved change;
2. replace the unavailable issuer with a reviewed dedicated-role executor.

Missing, empty or malformed environment variables cannot enable the route. With
the repository in its current state, valid requests reach the explicit lock and
return HTTP 503 after session, school and resource verification.

## Failure boundary

The SQL creation transaction ends before provider I/O. `pending` is
non-consumable. Confirmed provider failure invokes compensation; ambiguous and
timeout outcomes remain pending and are later stale-revoked. No automatic retry
reuses a code. This chooses confidentiality and one-time semantics over immediate
availability after an uncertain provider response.

## Review conclusion

The local application boundary satisfies the intended browser/server split. It
is ready for staging architecture review, not for activation: the database
executor, LOGIN, secret, real provider and staging evidence do not yet exist.

