# PRO-03.3 — Test matrix

Status: **PREPARED — DATABASE/INTEGRATION TESTS NOT EXECUTED**

Legend: `STATIC` is locally inspectable now; `STAGING` requires the proposed
migration in an isolated disposable database; `E2E` requires the future provider
adapter. No staging or E2E test is executed in this step.

| ID | Scenario | Expected result | Level |
|---|---|---|---|
| ACL-01 | authenticated invokes public/private issuer directly | `42501`/permission denied | STAGING |
| ACL-02 | anon creates, revokes, consumes, or invokes private function | permission denied for every call | STAGING |
| ACL-03 | service_role invokes create/revoke/private issuer | permission denied | STAGING |
| ACL-04 | authenticated consumes | EXECUTE exists only on public consume | STAGING |
| ACL-05 | direct DML/select on both private tables by standard/internal roles | permission denied | STAGING |
| ACL-06 | newly created private function by migration owner | PUBLIC has no default EXECUTE | STAGING |
| OWN-01 | Owner A, School A, resource A, matching email | one pending invitation; allowed | STAGING |
| OWN-02 | Owner A supplies School B | denied | STAGING |
| OWN-03 | authenticated non-owner supplies a school | denied | STAGING |
| OWN-04 | nonexistent resource or resource from another school | denied without existence disclosure | STAGING |
| OWN-05 | supplied email differs from exact resource | denied | STAGING |
| OWN-06 | trusted boundary is passed a forged Owner B UUID for Owner A's school | DB owner proof denies | STAGING |
| OWN-07 | owner changes between route check and SQL issue | DB recheck denies | STAGING |
| OWN-08 | two browser tabs select different schools | each explicit UUID stays isolated; no ambient-school fallback | E2E |
| CON-01 | two concurrent keys target same resource | one open invitation only; loser gets conflict | STAGING |
| CON-02 | same idempotency key repeats concurrently | one attempt/invitation, secret-free prior status returned | STAGING |
| CON-03 | same key reused with different payload | conflict; no new invitation | STAGING |
| CON-04 | attempt limit exceeds actor/school or resource threshold | rate-limit error; no invitation | STAGING |
| DEL-01 | provider accepts and completion commits | status delivered; consumable | E2E |
| DEL-02 | provider is unavailable/rejects | failed attempt; invitation revoked; token unusable | E2E |
| DEL-03 | server crashes after provider call before completion | pending token remains unusable; stale reconciliation revokes | E2E |
| DEL-04 | retry after failure with new key and `retry_of` | old token remains unusable; one new token generated | STAGING/E2E |
| DEL-05 | exact idempotent retry | no provider resend and no token returned | E2E |
| SEC-01 | canary token through complete success flow | absent from URL, response, redirect, logs, analytics, DB audit | E2E |
| SEC-02 | email content | non-secret landing URL; raw code only in message body | E2E |
| SEC-03 | issuer credential imported into browser build | build/static test fails | STATIC |
| LIFE-01 | pending/failed invitation consumption | rejected | STAGING |
| LIFE-02 | expired invitation consumption | rejected | STAGING |
| LIFE-03 | revoked invitation consumption | rejected | STAGING |
| LIFE-04 | second consumption/replay | rejected | STAGING |
| LIFE-05 | token used by wrong authenticated email/user | rejected | STAGING |
| LIFE-06 | owner revokes another school's invitation | denied | STAGING |
| ATOM-01 | teacher-only link then injected failure | no user link and no consumed marker | STAGING |
| ATOM-02 | linked staff/teacher success | both same-school records and consumed marker commit atomically | STAGING |
| ATOM-03 | cross-school linked teacher/staff mismatch | denied; no partial link | STAGING |
| HTTP-01 | pre-approval create routes | remain HTTP 503 | STATIC |
| HTTP-02 | token transport in current callback/redirects | no `invitation` query parameter; POST and short HttpOnly cookie only | STATIC |
| MIG-01 | production baseline has nonzero invitations | proposed migration aborts before schema change | STAGING |
| MIG-02 | migration rollback preconditions | rollback refuses destructive column/table removal with retained audit/business rows | STAGING |

## Local static suite

`tests/pro03-issuer-design.test.mjs` verifies document completeness, dormant RPC
ACL declarations, private-role grants, delivery-state guard, idempotency/audit
constraints, and continued HTTP 503 routes. These tests validate proposal text,
not PostgreSQL execution. SQL syntax, catalog ACLs, concurrency, injected provider
failures, and atomic linkage remain mandatory gates after architect approval.

