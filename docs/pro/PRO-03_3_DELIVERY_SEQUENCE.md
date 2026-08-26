# PRO-03.3 — Delivery sequence

Status: **DESIGN ONLY — ROUTES REMAIN HTTP 503**

```mermaid
sequenceDiagram
    autonumber
    actor Owner as Owner browser
    participant Route as Next.js Node issuer route
    participant Auth as Supabase Auth
    participant DB as PostgreSQL private issuer
    participant Mail as Email provider
    participant Recipient as Recipient browser
    participant Consume as POST consume route/RPC

    Owner->>Route: POST resource UUID, explicit school UUID, idempotency UUID
    Note over Owner,Route: No actor ID and no token in request URL
    Route->>Auth: getUser() using request session
    Auth-->>Route: verified user UUID or reject
    Route->>DB: verify exact school + owner and exact resource + normalized email
    DB-->>Route: allowed or generic denial
    Route->>DB: issue(actor UUID, school, resource, email, idempotency key)
    Note over Route,DB: Dedicated internal credential; DB repeats all ownership checks
    DB->>DB: advisory lock + idempotency + rate limit
    DB->>DB: create SHA-256-only invitation and pending attempt atomically
    DB-->>Route: invitation/attempt IDs + one-time raw activation code
    Route->>Mail: send non-secret landing URL + code in body

    alt Provider confirms delivery
        Mail-->>Route: accepted + provider message ID
        Route->>DB: complete_delivery(actor, attempt, sanitized message ID)
        DB->>DB: pending → delivered (now consumable)
        Route-->>Owner: generic 202/200, no token
    else Provider rejects delivery
        Mail-->>Route: rejected
        Route->>DB: fail_delivery(actor, attempt, sanitized failure code)
        DB->>DB: pending → failed; invitation revoked
        Route-->>Owner: generic failure, no token
    else Timeout/crash/ambiguous result
        Note over DB: Invitation remains pending and cannot be consumed
        Route-->>Owner: generic pending/failed status, no token
        Route->>DB: later reconcile stale attempt
        DB->>DB: revoke stale invitation before any retry
    end

    opt Explicit retry after failed/revoked attempt
        Owner->>Route: POST new idempotency UUID + retry_of
        Route->>DB: reverify session, ownership, resource and prior attempt
        DB->>DB: generate a new invitation/token only
        DB-->>Route: new attempt + new one-time code
        Route->>Mail: deliver new code
    end

    opt Owner revokes
        Owner->>Route: POST invitation UUID + explicit school UUID
        Route->>DB: revoke_internal(verified actor, invitation, reason)
        DB->>DB: current-owner check + atomic revoke
        Route-->>Owner: secret-free result
    end

    Recipient->>Recipient: Open non-secret landing page
    Recipient->>Consume: POST activation code (HttpOnly short cookie flow)
    Consume->>Auth: verify recipient session and email
    Consume->>DB: authenticated consume_targeted_invitation(code)
    DB->>DB: lock; require delivered, open, unexpired, matching user/email
    DB->>DB: atomically link teacher/staff and mark consumed
    DB-->>Consume: secret-free resource result
    Consume-->>Recipient: terminal redirect; clear cookie on success/failure
```

## Failure invariants

- Creation and its pending audit attempt are one database transaction.
- The provider call is outside that transaction; locks are never held across I/O.
- `pending` and `failed` invitations are not consumable.
- A delivery failure never reuses or exposes the old token.
- Repeating the same idempotency key never returns the raw token and never sends
  again; an intentional retry is a new request linked to the old attempt.
- Every terminal application path clears the recipient token cookie; neither the
  issuer nor the provider puts the code into a URL.

