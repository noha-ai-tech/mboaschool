-- PRO-03.2.2 — SQL TEST PLAN, PREPARED, NOT EXECUTED
-- Run only after applying PRO-03_1_INVITATIONS_PROPOSED.sql to an isolated,
-- disposable test database. Never run this file in production.
--
-- Expected ACL model after theoretical application:
--   create_targeted_invitation: no EXECUTE grant
--   revoke_targeted_invitation: no EXECUTE grant
--   consume_targeted_invitation: authenticated only
--
-- Every data case uses synthetic fixtures, its own transaction and ROLLBACK.

-- 01 PUBLIC has no creation EXECUTE
-- Inspect pg_proc.proacl via aclexplode; no grantee OID 0 EXECUTE entry for the
-- exact create_targeted_invitation(uuid,text,uuid,text,interval) signature.
-- EXPECT: zero rows.

-- 02 anon cannot create
-- SET LOCAL ROLE anon; call create_targeted_invitation with synthetic values.
-- EXPECT: permission denied before function body; zero invitation rows.

-- 03 authenticated cannot create
-- SET LOCAL ROLE authenticated and a valid owner JWT sub; call create.
-- EXPECT: permission denied despite valid ownership; zero invitation rows.

-- 04 service_role cannot create
-- SET LOCAL ROLE service_role; call create.
-- EXPECT: permission denied; zero invitation rows.

-- 05 PUBLIC has no revocation EXECUTE
-- Inspect pg_proc.proacl via aclexplode for the exact
-- revoke_targeted_invitation(uuid,text) signature.
-- EXPECT: no PUBLIC EXECUTE entry.

-- 06 anon cannot revoke
-- EXPECT permission denied before function body; invitation unchanged.

-- 07 authenticated cannot revoke
-- Use a valid owner JWT sub and an invitation for that owner's school.
-- EXPECT permission denied; invitation unchanged.

-- 08 service_role cannot revoke
-- EXPECT permission denied; invitation unchanged.

-- 09 PUBLIC has no consumption EXECUTE
-- Inspect exact consume_targeted_invitation(text) proacl.
-- EXPECT no PUBLIC EXECUTE entry.

-- 10 anon cannot consume
-- EXPECT permission denied before function body; no linkage.

-- 11 service_role cannot consume
-- EXPECT permission denied before function body; no linkage.

-- 12 authenticated alone can execute consumption
-- has_function_privilege('authenticated', consume_signature, 'EXECUTE') = true.
-- The equivalent result for anon and service_role is false.
-- Also assert pg_has_role('service_role', 'authenticated', 'member') = false so
-- service_role cannot inherit the authenticated grant in the target project.

-- Fixture rule for cases 13–20:
-- The isolated database owner inserts a synthetic invitation row directly with
-- SHA-256 hash of a known test token. This is test setup, not an application
-- issuance path and must never be used outside the disposable database.

-- 13 migration creates no invitation automatically
-- Count private.targeted_invitations immediately after theoretical migration.
-- EXPECT zero rows and no change to teacher/staff user_id values.

-- 14 valid authenticated consumption
-- auth.uid() = user_invited with exact normalized Auth email; POST-equivalent
-- RPC call with the seeded test token.
-- EXPECT one consume result and consumed_by = user_invited.

-- 15 wrong authenticated user/email
-- auth.uid() = user_conflict with nonmatching email.
-- EXPECT SQLSTATE 22023; invitation and resources unchanged.

-- 16 expired token
-- Seed expires_at in the past.
-- EXPECT SQLSTATE 22023; no linkage and no consumed marker.

-- 17 revoked token
-- Seed revoked_at/revoked_by as fixture owner.
-- EXPECT SQLSTATE 22023; no linkage.

-- 18 replay
-- Consume once, then repeat with the same token.
-- EXPECT first PASS, second SQLSTATE 22023; exactly one history row.

-- 19 staff/teacher atomicity and school boundary
-- Valid same-school pair: both user_id fields change together. Separately verify
-- the composite FK rejects cross-school association and a conflicting companion
-- user_id rolls back the complete consumption statement.

-- 20 existing business data unchanged by migration
-- Snapshot counts/checksums for establishments, enseignants and staff_members
-- before applying the proposal in the disposable clone; compare immediately
-- after migration, before test fixtures.
-- EXPECT identical rows and values. Schema/ACL objects only; zero business writes.

-- Global postconditions:
--   create has no PUBLIC/anon/authenticated/service_role EXECUTE beneficiary;
--   revoke has no PUBLIC/anon/authenticated/service_role EXECUTE beneficiary;
--   consume EXECUTE beneficiary is authenticated only;
--   no plaintext token exists in private.targeted_invitations;
--   every negative case leaves teacher, staff and invitation state unchanged.
