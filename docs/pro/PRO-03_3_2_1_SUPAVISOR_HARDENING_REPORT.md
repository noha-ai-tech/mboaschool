# PRO-03.3.2.1 — Supavisor connection boundary hardening

Status: local preparation only — **NOT EXECUTED**, no real connection attempted.

## Accepted boundary

The shared Supavisor transaction endpoint is accepted only when all independently configured server values agree. The staging project reference must be exactly 20 lowercase ASCII letters/digits. The exact staging pooler hostname must be supplied separately and must match the regional Supabase pooler pattern as well as the URL hostname. The PostgreSQL client username is `pro03_staging_invitation_login` plus a dot plus that exact staging project reference; the underlying PostgreSQL LOGIN remains unsuffixed.

The URI protocol is `postgres:` or `postgresql:`, port is exactly 6543, database is exactly `postgres`, password is non-empty, and the only parameter is `sslmode=verify-full`. Fragments, duplicate or additional parameters, weaker TLS, other ports/databases, arbitrary domains, suffix spoofing, IP addresses, localhost, missing/mismatched project references, generic `postgres`, `service_role`, `authenticator`, and every other role are rejected.

The configuration validator returns only sanitized non-secret fields. Parsing, pool construction, connection acquisition, execution, rollback, cleanup, and close errors are replaced by fixed generic exceptions. No logger is present. Tests never snapshot a URI or credential.

## Activation posture

Source activation remains `locked`, the real-provider gate remains false, and prepared route dependencies still contain the unavailable issuer rather than the configured PostgreSQL executor. A valid-looking staging configuration therefore cannot enable issuance. Teacher and staff invitation routes continue returning HTTP 503 after their existing session, ownership, and exact-resource checks.

## PUBLIC ACL preflight

`PRO-03_3_2_PUBLIC_FUNCTION_ACL_AUDIT.sql` is a single read-only catalog query. It lists application functions/procedures in `public` and `private` whose effective object ACL grants EXECUTE to PostgreSQL `PUBLIC`. It changes no ACL or row and was not run during this task.

The staging runbook requires this list to be empty before any account creation. The proposed LOGIN script repeats the condition before `CREATE ROLE` and aborts if a finding remains. There is no blanket or automatic `REVOKE`; every function must receive a separate ownership, caller, RLS, `SECURITY DEFINER`, and compatibility assessment.

## Safety result

No migration was validated or executed. No LOGIN, password, project configuration, real provider, email, database session, push, or deployment was created. Database writes: **0**.

## Local verification — 2026-08-21

- TypeScript with incremental cache disabled: PASS.
- Targeted ESLint: PASS.
- Full PRO-03 suite: PASS, 70/70.
- PRO-03.3.2.1 Supavisor/security subset: PASS, 9/9.
- Next.js production build: PASS, 86/86 static pages.
- Static secret/URI/logger scan: PASS; no literal PostgreSQL URI, credential, or logger found in the boundary scope.
