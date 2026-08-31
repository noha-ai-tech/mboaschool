# PRO-04.5 — Lot 4 FK indexes execution report

Date d'exécution production : 2026-08-24 UTC  
Projet : Ecoles237 (`umcwwynrftidytxgqkwi`)  
Branche locale : `feat/pro-school-organization`

## Résultat

- LOT 4 EXECUTED: YES
- MIGRATION HISTORY: `20260824062038_pro_04_lot_04_high_volume_fk_indexes`
- PREFLIGHT: PASS
- POST-CHECK: PASS
- INDEXES CREATED: 8
- INDEX VALIDITY: 8/8 valid, ready, live, non-partial, non-expression B-tree
- FK UNCHANGED: YES — 8/8 validated definitions unchanged
- LOCK/TIMEOUT: `lock_timeout=5s`, `statement_timeout=2min`; no timeout or waiting lock
- PERFORMANCE ADVISOR: 8 targeted findings before, 0 after
- BUSINESS DATA CHANGED: NO
- TYPESCRIPT: PASS
- TESTS: PRO-03 72/72; PRO-04 31/31
- BUILD: PASS — 91 pages generated
- PRO-04 LOTS COMPLETE: YES
- READY FOR PRO-04 CLOSURE REVIEW: YES

## Preflight production

The exact integrated preflight was first executed in a read-only transaction.
It confirmed:

- project Ecoles237 and ref `umcwwynrftidytxgqkwi`;
- all eight validated FK constraints and their exact source/target columns;
- zero equivalent valid/ready/non-partial left-prefix B-tree coverage;
- all eight proposed names absent, therefore a complete initial state;
- zero waiting locks on the two target tables;
- 2,378 rows in `establishment_import_staging`;
- 2,252 rows in `establishments`.

The first read-only parse exposed an ambiguous unparenthesized PL/pgSQL
`CASE`. No DDL had run. Parentheses were added without changing behavior,
then the exact preflight passed. The executed proposal and local migration are
byte-identical, SHA-256:
`afb829a79170fe87136ec15651c4b99f0746861da1885fb1aad21151dcc2f1c7`.

## Production execution

Supabase applied the named migration once. The proposal's single transaction,
timeouts, drift rejection and integrated post-check were preserved. No retry
was needed and the rollback was not executed.

Created indexes:

1. `idx_establishment_import_staging_arrondissement_id`
2. `idx_establishment_import_staging_department_id`
3. `idx_establishment_import_staging_duplicate_of_establishment_id`
4. `idx_establishment_import_staging_duplicate_of_staging_id`
5. `idx_establishment_import_staging_promoted_establishment_id`
6. `idx_establishment_import_staging_region_id`
7. `idx_establishments_arrondissement_id`
8. `idx_establishments_owner_id`

Independent catalog verification found each index valid, ready, live,
non-partial, non-expression, single-column B-tree, with the expected column
and order.

## Business-data and size control

| Table | Rows before | Rows after | Heap before/after | Index bytes before | Index bytes after |
|---|---:|---:|---:|---:|---:|
| `establishment_import_staging` | 2,378 | 2,378 | 2,719,744 / 2,719,744 | 770,048 | 1,032,192 |
| `establishments` | 2,252 | 2,252 | 1,138,688 / 1,138,688 | 507,904 | 573,440 |

Only index storage changed. No business row was inserted, updated or deleted.

## Advisors and local verification

Performance Advisor reported all eight targeted
`0001_unindexed_foreign_keys` findings before execution and none afterward.
No critical Performance or Security Advisor finding was returned after the
migration. Other pre-existing Advisor findings remain outside this lot.

Invitations remain disabled. No push or deployment was performed.
