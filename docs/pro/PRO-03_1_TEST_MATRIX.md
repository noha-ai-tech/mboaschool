# PRO-03.1 — Test Matrix

Command: `npm run test:pro03`  
Result: **37 passed, 0 failed** — 17 existing PRO-03.1 tests and 20 invitation security tests.

## Unit and context tests

| Scenario | Expected | Result |
|---|---|---|
| Canonical UUID | Accepted | PASS |
| Forged/invalid UUID | Controlled denial | PASS |
| No accessible school | Empty state | PASS |
| One accessible school | Single-school fallback | PASS |
| Multiple accessible schools | Explicit selection required | PASS |
| Invalid cookie | Ignored | PASS |
| Inaccessible cookie | Ignored | PASS |
| Explicit URL vs different cookie | URL wins | PASS |
| Inaccessible explicit URL vs valid cookie | Fail closed; no fallback | PASS |
| Existing query params and fragment | Preserved when adding `school` | PASS |

## Authorization and route tests

| Scenario | Expected | Result |
|---|---|---|
| Owner A / School A | Allow | PASS |
| Owner A / foreign School B | Deny | PASS |
| Inactive staff in PRO-03.1 capability path | Deny | PASS |
| User without ownership | Deny | PASS |
| Unauthenticated user | Deny | PASS |
| Falsified establishment identifier | Deny | PASS |
| All 12 routes | Explicit ID + central authorization helper | PASS |
| Resource A in request for School B | Dual resource/school predicates required | PASS (static route assertion) |
| Teacher A + matter B | Deny before relation insert | PASS (route correlation assertion) |
| Ambiguous owner `.single()` | Absent | PASS (static search) |

## Multi-school and two-tab tests

| Scenario | Expected | Result |
|---|---|---|
| Owner with School A and School B | Neither selected arbitrarily | PASS |
| Tab 1 explicitly School A | Remains School A | PASS |
| Tab 2 explicitly School B | Remains School B | PASS |
| Cookie changed to School C | Tabs A and B remain unchanged | PASS |
| Internal Pro navigation | Preserves `school` | PASS |

## RPC tests

Four real calls were found. All pass `p_etablissement_id`:

- teacher space weekly total;
- teacher space monthly total;
- Pro attendance history;
- payroll calculation.

Teacher/staff ownership is correlated before the two modified Pro consumers invoke the RPC. Result: **PASS**.

## Invitation tests and deployment gate

| Scenario | Proposed SQL guarantee | Live status |
|---|---|---|
| Valid token | Hash match + identity + exact resource/school | BLOCKED pending migration |
| Expired token | `expires_at > now()` | BLOCKED pending migration |
| Consumed/replayed token | `consumed_at is null` + row lock | BLOCKED pending migration |
| Wrong school/resource | Exact resource ID + establishment predicates | BLOCKED pending migration |
| Wrong user | Auth user email must match token recipient after token proof | BLOCKED pending migration |
| Same email in two schools | Token identifies only one resource and one school | BLOCKED pending migration |
| Multiple-row update | Row count must equal exactly one | BLOCKED pending migration |

Static tests confirm the SQL header, hash storage, row lock, consumption field, absence of `createAdminClient` in the invitation flow, absence of email-based resource updates, and HTTP 503 on both invitation creation routes. Runtime invitation tests must be added only after approval in an isolated non-production database.

The 20 local invitation tests additionally cover dormant creation/revocation with no EXECUTE beneficiary, authenticated-only consumption, `auth.uid()` identity checks, normalized resource email, lifecycle, private-table privileges, FK/index preparation, teacher + staff atomic linkage, wrong school/email, replay/expiry/revocation, closed HTTP routes, POST-only transport, callback URL confidentiality, GET preloading safety, terminal cookie clearing and the separate delivery-options review.

Twenty SQL runtime scenarios are prepared in `PRO-03_2_INVITATION_SQL_TESTS.sql`. They were not executed because no invitation migration or database write is authorized in this phase.

## Verification commands

| Check | Result |
|---|---|
| `npx tsc --noEmit` | PASS |
| Targeted ESLint | PASS, 0 errors / 2 historical image warnings |
| `npm run test:pro03` | PASS, 37/37; invitations 20/20 |
| `npm run build` | PASS, 81/81 pages |
| PRO-03 Wave A | EXECUTED AND VERIFIED before this task (supplied state) |
| Invitation migration / Waves B–D | NOT RUN |
| Supabase/database write | 0 |
