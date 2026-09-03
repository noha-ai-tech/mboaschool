# PRO-05.3 — Preview Auth activation test report

Date: 2026-08-27

## Scope and isolation

- Preview name: `pro-05-3-auth-preview-eddy`
- Preview project ref: `aeuotedgyhdvjxtcahcj`
- Production project ref: `umcwwynrftidytxgqkwi`
- Preview ref distinct from production: **YES**
- Default branch: **NO**
- Persistent branch: **NO**
- Production data copied: **NO**
- Preview project health: `ACTIVE_HEALTHY`
- Branch deployment status observed during testing: `MIGRATIONS_FAILED`
- Production operations: **0**

## Live Auth tests — expected HIBP enabled

All calls below targeted only `https://aeuotedgyhdvjxtcahcj.supabase.co` with
the preview publishable key. No privileged key or production credential was
used.

| Check | Expected | Actual | Result |
| --- | --- | --- | --- |
| Signup with `Password123!` | `weak_password` rejection | Account and session created | **FAIL** |
| Confirmation signup with `password` | `weak_password` rejection | Account and session created | **FAIL** |
| Signup with generated robust password | Accepted | Account and session created | **PASS** |
| Existing-user login with robust password | Accepted | Session created, no weak signal | **PASS** |
| Change to compromised password | `weak_password` rejection | Change accepted | **FAIL** |
| Change to a second generated robust password | Accepted | Change accepted | **PASS** |
| Login with changed robust password | Accepted | Session created, no weak signal | **PASS** |

The two independent compromised-password probes prove that leaked-password
protection was not effective on the preview at test time. No rollback toggle
was attempted because the required initial state, HIBP enabled and effective,
was not established.

## Recovery

A recovery request using a reserved `.invalid` synthetic address was rejected
with `email_address_invalid`, as expected for a non-deliverable domain. A live
recovery-link round trip was not attempted against an uncontrolled external
mailbox. A controlled test inbox is required to validate the hosted recovery
email and callback end to end without sending a bearer link to a third party.

## Application messages and recovery flow

Command: `npm run test:pro05`

- Tests: **8/8 PASS**
- Safe mapping of `weak_password` and `AuthWeakPasswordError`: **PASS**
- Generic non-enumerating Auth errors: **PASS**
- SDK `data.weakPassword` warning: **PASS**
- `PASSWORD_RECOVERY` event gate: **PASS**
- Recovery redirect to the new page: **PASS**
- Password form and `updateUser({ password })` contract: **PASS**
- Email-confirmation wording: **PASS**

## Rollback and cleanup status

- HIBP disable test: **NOT RUN — initial enabled state not effective**
- HIBP re-enabled and verified: **NOT CONFIRMED**
- Preview deleted: **NO — retained for Eddy to correct the toggle**
- Production Auth configuration changed: **NO**
- Production database writes: **0**
- Production activation attempted: **NO**

## Required next action

In the Dashboard for project `aeuotedgyhdvjxtcahcj`, re-open
**Authentication → Providers → Email → Password security**, verify that
**Leaked password protection** is enabled, save the setting, and confirm the
project ref before the test is resumed. A controlled test inbox must also be
provided or explicitly designated for the live recovery-link round trip.

`READY FOR PRODUCTION ACTIVATION`: **NO**

