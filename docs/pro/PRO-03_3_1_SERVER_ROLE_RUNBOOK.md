# PRO-03.3.1 — Dedicated server role runbook

Status: **PROCEDURE ONLY — NO LOGIN, MEMBERSHIP OR SECRET CREATED**

## Target role model

```text
temporary/production LOGIN (NOINHERIT, no elevated attributes)
    └── may SET ROLE invitation_issuer
            └── USAGE private schema
            └── EXECUTE five exact private functions
            └── no table/sequence privileges
```

The migration creates only the `invitation_issuer` NOLOGIN capability. A LOGIN is
an independently approved infrastructure action and is never created by an
application migration.

## Required LOGIN properties

- `LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`.
- Membership only in `invitation_issuer`; no membership in `authenticated`,
  `anon`, `service_role`, `postgres`, platform-admin or any business role.
- No object ownership, schema CREATE, direct table/sequence privileges, or
  default privileges.
- TLS-only pooled connection appropriate to serverless execution, low connection
  limit, `statement_timeout`, `lock_timeout`, and `idle_in_transaction_session_timeout`.

## Future provisioning sequence

This sequence is descriptive and must be performed by an approved DBA with a
generated secret that is never pasted into tickets, SQL history or logs:

1. create a uniquely named LOGIN with the attributes above;
2. `GRANT invitation_issuer TO <dedicated_login>`;
3. set safe role/database defaults for timeouts and read-committed isolation;
4. verify role memberships and attributes from `pg_roles`/`pg_auth_members`;
5. verify direct SELECT/INSERT/UPDATE/DELETE and public RPC calls fail;
6. verify `SET LOCAL ROLE invitation_issuer` inside a transaction permits only
   the five private functions;
7. store the connection string under the server-only name
   `INVITATION_ISSUER_DATABASE_URL` in the approved secret store;
8. never add that name to a `NEXT_PUBLIC_*` variable or client bundle.

No command in this runbook was executed.

## Executor contract

For each operation, the future driver must:

1. borrow a pooled TLS connection;
2. begin a `READ COMMITTED` transaction;
3. set local statement/lock timeouts;
4. execute `SET LOCAL ROLE invitation_issuer` as a fixed statement;
5. call one compile-time allow-listed `private.*` function using parameters;
6. commit or roll back immediately;
7. release the connection before provider I/O.

It must never interpolate a function/role name from request input, execute
arbitrary SQL, use the Supabase Data API/service key, or hold a transaction while
calling the provider.

## Rotation

1. Keep routes locked or use the route kill switch.
2. Create a second narrowly scoped LOGIN and verify its ACLs.
3. install the new server-only secret in staging/preview first;
4. exercise secret-free health checks and private-function denials;
5. roll production instances to the new credential;
6. revoke membership and LOGIN from the old identity;
7. remove the old secret and confirm no connection remains;
8. record only actor/operation/time/outcome, never credentials or invitation data.

## Emergency revocation

Return routes to the locked source state, revoke `invitation_issuer` membership
from the compromised LOGIN, terminate only its verified sessions, disable the
LOGIN, rotate the secret, and inspect the private secret-free attempt ledger.
Keep public create/revoke closed. Do not grant `service_role` as a workaround.

