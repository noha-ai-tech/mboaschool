# PRO-03.3 — Rollback plan

Status: **PREPARED — NOT EXECUTED — NO ROLLBACK OR MIGRATION EXECUTED**

## Trigger conditions

Rollback/containment is required for ACL drift, token exposure, cross-school
authorization failure, provider leakage, unexpected duplicate delivery, pending
backlog, consumption of non-delivered invitations, or runtime credential theft.

## Immediate containment (preferred and reversible)

1. Return both creation routes to HTTP 503 with `no-store`/`no-referrer`.
2. Revoke membership from the dedicated runtime LOGIN and rotate/delete its
   server-only connection secret.
3. Revoke EXECUTE on every `private.*targeted_invitation*` function from the
   runtime capability role. Keep public create/revoke closed.
4. Disable provider credentials/sender and stop the reconciliation job.
5. Query only secret-free attempt metadata to identify pending/delivered scope.
6. Revoke every unconsumed affected invitation through an approved owner/system
   procedure; never print token hashes, recipient data, or provider bodies.

Containment does not require dropping tables or functions and preserves forensic
audit rows.

## Application rollback

Revert only the future issuer route/module/provider change to the reviewed HTTP
503 implementation. Preserve the current authenticated POST consumption flow if
no consumption defect exists. Do not roll back unrelated PRO multi-school work.

## Database rollback decision

Before structural rollback, lock the change window and verify:

- no active application connection has the issuer capability;
- no pending/delivered/open invitation exists;
- attempt rows have been exported to an approved secret-free audit archive or
  retention has been explicitly waived;
- no consumed row depends on delivery-state history;
- the architect approves destructive removal.

If any condition fails, keep the additive columns/table/functions and use ACL
containment only.

## Structural rollback outline (review, do not execute)

In one controlled transaction:

1. revoke issuer function EXECUTE and schema usage;
2. drop delivery triggers;
3. drop only the five private issuer/delivery functions and two trigger functions
   by exact signature;
4. drop delivery-attempt indexes/table only after the zero/retention preflight;
5. drop delivery constraints/columns only when `targeted_invitations` is empty;
6. drop `invitation_issuer` only when no LOGIN/member depends on it;
7. reassert PRO-03.2.2: public create/revoke closed, public consume authenticated
   only, private table ACLs denied to standard roles.

Do not use `CASCADE`; enumerate dependencies. Default-privilege hardening should
normally remain because removing it would reopen future functions to PUBLIC.

## Verification after rollback

- ACL catalog truth table matches PRO-03.2.2.
- Creation routes return 503.
- anon/service_role/authenticated cannot create or revoke.
- authenticated can still consume a previously valid baseline invitation only if
  the incident decision allows it.
- business tables and staff/teacher links are unchanged by rollback itself.
- TypeScript, lint, PRO-03 tests, and build pass before any redeployment.
