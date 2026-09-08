# PRO-03.3.2 — Database executor review

Status: local code prepared — **NOT EXECUTED**, no database connection made.

## Configuration

The executor requires three server-only variables: `INVITATION_ISSUER_DATABASE_URL`, `INVITATION_ISSUER_STAGING_PROJECT_REF`, and `INVITATION_ISSUER_STAGING_SUPAVISOR_HOST`. A related `NEXT_PUBLIC_*` variable is a hard failure. The project reference is exactly 20 lowercase ASCII letters/digits. The host configuration must itself match a regional shared Supavisor hostname and the URL hostname must equal it exactly.

The URL accepts only `postgres:` or `postgresql:`, username `pro03_staging_invitation_login.<configured_project_ref>`, the configured hostname, port 6543, database `postgres`, a non-empty password, and the single query parameter `sslmode=verify-full`. It rejects generic or privileged usernames, a missing/wrong project suffix, suffix-spoofed/arbitrary hosts, IPs, localhost, other databases or ports, fragments, duplicate/extra parameters, and weaker TLS modes. Configuration errors are generic. The sanitized validation result contains no connection string or password.

The `pg` pool uses a maximum of two connections, a three-second connect timeout, a ten-second idle timeout, a four-second server statement timeout, a five-second client query timeout, and a four-second idle-in-transaction timeout. A separate eight-second application deadline destroys the connection if control is not returned; PostgreSQL then aborts the open transaction.

## SQL boundary

The only accepted function identifiers are constants for:

1. `private.issue_targeted_invitation`
2. `private.complete_targeted_invitation_delivery`
3. `private.fail_targeted_invitation_delivery`
4. `private.revoke_issued_targeted_invitation`
5. `private.revoke_stale_targeted_invitation_delivery`

Each identifier maps through a closed switch to one static, single-statement query. Function names cannot come from request data. Exact parameter names are checked and values are passed separately as `$1…$n`; no string interpolation or multi-statement function query exists. Return validation requires one row and the exact expected columns. Extra, missing, duplicated, or mistyped results fail closed.

## Transaction lifecycle

The lifecycle is `BEGIN` → `SET LOCAL ROLE invitation_issuer` → local timeouts → one allow-listed invocation → result validation → `COMMIT`. Any ordinary error runs `ROLLBACK`. If timeout or rollback itself prevents safe reuse, the client is destroyed so the server rolls back on disconnect. A `finally` release guard prevents leaks and double release. The executor has no logger and never includes an underlying exception as `cause`.

## Effective privilege warning

`NOINHERIT` does not remove privileges granted to PostgreSQL `PUBLIC`. `PRO-03_3_2_PUBLIC_FUNCTION_ACL_AUDIT.sql` therefore lists `public`/`private` functions and procedures whose effective object ACL grants EXECUTE to PUBLIC. It is read-only and must return zero rows in staging before any account creation. The LOGIN script repeats the check before `CREATE ROLE`, then audits effective privileges for the LOGIN and `invitation_issuer`. No global ACL is changed automatically; every finding requires individual review.

The executor is not wired to routes: source activation is locked, configuration is absent, and no real provider implementation exists.
