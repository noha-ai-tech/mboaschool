# PRO-05.1 — Final anonymous write lockdown execution report

Date: 2026-08-24  
Branch: `feat/pro-school-organization`  
Project: Ecoles237 (`umcwwynrftidytxgqkwi`)  
Migration version: `20260824214831`  
Migration name: `pro_05_1_anonymous_public_write_lockdown`  
Approved source: `docs/pro/PRO-05_1_ANONYMOUS_PUBLIC_WRITE_LOCKDOWN_PROPOSED.sql`  
Executed migration: `supabase/migrations/20260824214831_pro_05_1_anonymous_public_write_lockdown.sql`  
SHA-256 of both files: `5876a923c67aff8282371d2b1406f3d8545ba15280d6a614446b2cd48700e5f4`

## Execution result

The corrected PRO-05.1 migration completed and committed successfully. PostgreSQL
accepted every integrated preflight, the catalog-structure checks, the rollback-only
behavioral truth table, and every post-check. No automatic retry and no separate
rollback were performed.

The earlier failed attempt remains documented separately in
`PRO-05_1_ANONYMOUS_PUBLIC_WRITE_LOCKDOWN_EXECUTION_REPORT.md`; it did not commit
and is not the migration recorded in remote history.

## Preflight

- exact project ref: `umcwwynrftidytxgqkwi` (`ACTIVE_HEALTHY`, PostgreSQL 17.6);
- exact branch: `feat/pro-school-organization`;
- initial policies: 11 total (`classes=5`, `class_announcements=3`,
  `school_dashboard_context=3`);
- dangerous anonymous write policies: 6;
- initial policy checksums:
  - `classes`: `ad19aadfc8bd8d0f7b326322cf5aa623`;
  - `class_announcements`: `82c5366e02982c43ff95945ded8b928c`;
  - `school_dashboard_context`: `7910f825740bddd3163519aaed6bd630`;
- initial ACL on all three tables:
  `{postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}`;
- initial business counts: `classes=2`, `class_announcements=0`,
  `school_dashboard_context=0`;
- combined structure checksum: `59f185d3f0bbf13bbfda775de0d551a7`;
- zero existing cross-school class/section mismatch;
- `applications_public_insert` checksum:
  `c53e8fd1b720fc18e2dca2c131ad109c`;
- the six dangerous anonymous write plans were compiled in a read-only,
  rollback-only transaction without modifying rows.

## Post-check

Remote migration history contains version `20260824214831` with the expected name.
The final state contains exactly four policies, all on `public.classes`:

- `classes_public_read`: `SELECT` for `anon, authenticated`;
- `classes_owner_insert`: `INSERT` for `authenticated`;
- `classes_owner_update`: `UPDATE` for `authenticated`, with both `USING` and
  `WITH CHECK`;
- `classes_owner_delete`: `DELETE` for `authenticated`.

The final classes policy checksum is
`2a962540f86016e925dfa15cf09ef3b8`. Catalog dependency checks confirm that each
owner policy depends on `auth.uid()` and on the correlated ownership columns. No
policy contains a `platform_admin` bypass.

`class_announcements` and `school_dashboard_context` have RLS enabled, zero
policies, and no client table privileges. They are therefore intentionally deny-all
for `anon`, `authenticated`, and `service_role`.

Final ACL:

- `classes`: `postgres=arwdDxtm`, `anon=r`, `authenticated=arwd`, no
  `service_role` privilege;
- `class_announcements`: `postgres=arwdDxtm` only;
- `school_dashboard_context`: `postgres=arwdDxtm` only.

## Behavioral truth table

The migration tested actual operations in rollback-only subtransactions:

| Actor | School/resource | Insert | Update | Delete |
|---|---|---:|---:|---:|
| Legitimate owner A | own School A | allow | allow | allow |
| Owner A | foreign School B | deny | deny | deny |
| Authenticated owner B/non-owner | School A | deny | deny | deny |
| Anonymous | any school | deny | deny | deny |

All truth-table fixtures and attempted writes were rolled back before commit.

## Data and regression controls

- final business counts: `2/0/0`, identical to preflight;
- `applications_public_insert` remains byte-for-byte catalog-equivalent at checksum
  `c53e8fd1b720fc18e2dca2c131ad109c`;
- cross-school class/section mismatches remain zero;
- no persistent business DML was performed;
- TypeScript: pass (`npx tsc --noEmit --incremental false`);
- targeted lint: pass with zero errors and two pre-existing React hook warnings;
- PRO-03/PRO-04/PRO-05 tests: 113/113 pass;
- production build: pass.

## Security Advisor

Security Advisor now reports 15 findings and no ERROR/CRITICAL finding. Compared
with the preceding snapshot, the only additions are the two expected INFO findings
`rls_enabled_no_policy` for the intentionally inactive deny-all tables:

- `public.class_announcements`;
- `public.school_dashboard_context`.

The existing out-of-scope backlog is unchanged. These INFO findings are an
intentional consequence of keeping RLS enabled while exposing no policy or client
grant.

## Required status

- PRO-05.1 EXECUTED: **YES**
- MIGRATION HISTORY: **VERIFIED — `20260824214831`**
- PREFLIGHT: **PASS**
- POST-CHECK: **PASS**
- ANON WRITES REMAINING: **0 on the three in-scope tables**
- CLASSES OWNER ACCESS: **PASS**
- CROSS-SCHOOL ISOLATION: **PASS**
- INACTIVE TABLES DENY-ALL: **YES**
- APPLICATIONS PUBLIC INSERT: **STRICTLY UNCHANGED**
- BUSINESS DATA CHANGED: **NO**
- SECURITY ADVISOR: **PASS — no new critical finding; 2 expected INFO**
- TYPESCRIPT: **PASS**
- LINT: **PASS — 0 errors, 2 pre-existing warnings**
- TESTS: **PASS — 113/113**
- BUILD: **PASS**
- ROLLBACK EXECUTED: **NO — not required**
- INVITATIONS ACTIVATED: **NO**
- ORACLE/CONFIGURATION AUTH CHANGED: **NO**
- PUSH/DEPLOYMENT: **NO/NO**
- READY FOR PRO-05.2 REVIEW: **YES — PRO-05.2 NOT STARTED**
