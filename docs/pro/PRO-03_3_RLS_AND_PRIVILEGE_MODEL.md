# PRO-03.3 — RLS and privilege model

Status: **PROPOSED — NOT APPLIED**

## Roles and capabilities

| Principal | Direct invitation table | Public create | Public revoke | Public consume | Private issuer functions |
|---|---:|---:|---:|---:|---:|
| PUBLIC | none | no | no | no | no |
| anon | none | no | no | no | no |
| authenticated | none | no | no | **EXECUTE only** | no |
| service_role | none | no | no | no | no |
| `invitation_issuer` NOLOGIN capability | none | no | no | no | **EXECUTE exact functions only** |
| Future dedicated server login | none directly; inherits only capability | no | no | no | through `invitation_issuer` membership |
| Function owner/migration owner | object ownership | internal owner invocation | internal owner invocation | owner | owner |

RLS remains enabled on both private tables and no client policy is added. RLS is
defense in depth; table ACL revocation is the first boundary. The internal role
does not receive SELECT/INSERT/UPDATE/DELETE on either table.

## Invocation and owner proof

Only a dedicated server-side PostgreSQL login may inherit the non-login
`invitation_issuer` role. It invokes parameterized private functions over a
direct PostgreSQL connection. The browser cannot address those functions through
the exposed Data API and none of the Supabase standard roles receives EXECUTE.

The Node route derives the actor UUID from a verified user session. The private
issuer accepts that UUID only from the trusted connection, then independently:

1. requires the actor to exist in `auth.users`;
2. selects the exact `establishments.id` with `owner_id = actor_id`;
3. resolves the exact resource UUID within that establishment;
4. compares normalized email and linked teacher/staff identity;
5. applies locks, uniqueness, idempotency, and rate limits.

This deliberately uses two different proofs: verified web session at the route,
and current ownership facts at the database. An actor parameter alone is not
trusted.

## Function security

Private functions are `SECURITY DEFINER` only because the internal runtime role
has no table rights. Each uses `SET search_path = ''`, schema-qualifies objects,
validates all input, and has EXECUTE revoked from PUBLIC, anon, authenticated,
and service_role before the exact grant to `invitation_issuer`.

The proposal also alters default function privileges **for the actual deployment
owner role** in schema `private`, revoking PUBLIC execution. The placeholder
owner in the SQL must be confirmed in staging; default privileges are per object
creator and do not retroactively repair existing functions.

## Revocation

Revocation is exposed only as an internal function. The route supplies its
session-derived actor; the database locks the invitation and verifies that actor
still owns its exact school. Revocation is denied after consumption and is
idempotent for already terminal rows. No platform-admin exception is implicit.

## Dormant public functions

- Creation and revocation stay in place for compatibility but remain completely
  closed to standard roles. The private issuer, owned by the same controlled
  migration owner, may call them internally after establishing a transaction-
  local JWT subject used by their existing `auth.uid()` checks.
- Consumption remains the sole Data API RPC and is granted only to
  `authenticated`.
- A later migration may move or replace dormant functions in `private` after all
  dependency signatures are catalogued. PRO-03.3 does not broaden them.

## Credential isolation requirements

- Server-only environment name: `INVITATION_ISSUER_DATABASE_URL` (not created).
- Dedicated LOGIN, `NOINHERIT` by default unless controlled `SET ROLE` is used;
  no `BYPASSRLS`, superuser, database ownership, or service-role secret.
- TLS required, connection limit and statement timeout constrained, credential
  rotatable independently from the Supabase service key.
- Never import the connection module from a Client Component.

