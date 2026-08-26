# PRO-03.3.2 — Staging runbook

Status: proposal only — **DO NOT EXECUTE / NOT EXECUTED** without Eddy and architect approval.

## Preconditions

Use an isolated staging project cloned from the reviewed production schema. Load synthetic owners, schools, teachers, staff, and mailboxes only. Disable all real email/webhook providers and analytics. Confirm PRO-03.2.2 posture: public creation/revocation closed, authenticated consumption only, private tables inaccessible, and zero production-derived invitation rows.

## Sequenced staging operation

1. Create/refresh the isolated environment and record PostgreSQL version, pooler mode, and schema checksum.
2. Insert synthetic fixtures only; prove no production email, UUID, cookie, or secret exists.
3. Apply the reviewed `PRO-03_3_PROPOSED_MIGRATION.sql` in staging and stop on any preflight error.
4. Before creating any account, run only `PRO-03_3_2_PUBLIC_FUNCTION_ACL_AUDIT.sql` in staging. It is a single read-only catalog query. The result must contain zero rows. If it lists a function, evaluate that function individually with the architect; do not continue and do not run a blanket `REVOKE`.
5. Apply `PRO-03_3_2_STAGING_LOGIN_PROPOSED.sql` only after the audit is empty. Its own preflight repeats the check and fails before `CREATE ROLE` while any `PUBLIC` executable application function remains. No global ACL revocation is automatic.
6. Through an approved secret manager/admin procedure, set a random temporary password and `VALID UNTIL` no longer than four hours. Configure three server-only values: `INVITATION_ISSUER_DATABASE_URL`, `INVITATION_ISSUER_STAGING_PROJECT_REF`, and `INVITATION_ISSUER_STAGING_SUPAVISOR_HOST`. Never print, snapshot, or store the connection string in shell history/version control.
7. Keep the deterministic simulated provider only. PRO-03.3.2 source activation remains locked, so first validate HTTP 503. A separate reviewed staging-only commit would be required to test issuance; no real provider is permitted.
8. Execute the E2E matrix: owner/resource forgery, concurrency, idempotency, provider outcomes, expiry during delivery, SQL confirmation failure, cookie lifecycle, and POST-only consumption.
9. Immediately set `NOLOGIN`, `PASSWORD NULL`, `VALID UNTIL 'epoch'`, revoke `invitation_issuer`, terminate only that LOGIN’s sessions, and drop `pro03_staging_invitation_login`.
10. Delete the environment secret/version, rotate any external staging credential that could have observed it, and verify no secret remains in logs or CI output.
11. Roll back the staging migration or destroy the isolated project; repeat ACL, row-count, and log scans. Archive only secret-free results.

## Supavisor configuration gate

Copy the staging project reference and the exact shared-pooler hostname from the staging dashboard into the two dedicated server variables. The project reference must be 20 lowercase ASCII letters/digits. The configured hostname must match the exact regional `aws-…​.pooler.supabase.com` host; suffix-only matching is insufficient. The URL user is the PostgreSQL LOGIN plus `.` plus that exact project reference. The underlying PostgreSQL role remains `pro03_staging_invitation_login`.

Only transaction mode on port 6543, database `postgres`, and `sslmode=verify-full` are accepted. Install the Supabase CA through the staging runtime trust store when required; do not weaken TLS or put certificate/password material in a `NEXT_PUBLIC_*` value. The executor rejects duplicated/extra query parameters, fragments, raw IPs, localhost, arbitrary hosts, mismatched project references, generic `postgres`, `service_role`, `authenticator`, and any other database role.

## Failure and rollback

If provider simulation succeeds but SQL confirmation fails, the invitation remains pending and non-consumable; the stale revoker must terminally fail/revoke it. If expiry occurs before confirmation, SQL atomically marks invitation and attempt failed. If the preliminary PUBLIC audit detects any ambient capability, stop before account creation: evaluate every returned function separately, do not weaken the audit, and do not make global ACL changes under this runbook.

No production migration, LOGIN, secret, provider, email, or deployment is authorized by this document.
