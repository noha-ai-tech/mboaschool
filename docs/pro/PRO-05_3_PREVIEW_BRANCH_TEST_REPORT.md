# PRO-05.3 — Temporary preview branch test report

Date: 2026-08-27

## Scope

- Production project: `Ecoles237` (`umcwwynrftidytxgqkwi`)
- Temporary preview: `pro-05-3-auth-preview-24h`
- Preview project ref: `yyxejkcppqxtgyrefogk`
- Persistent branch: **NO**
- Production data copied: **NO**
- Production configuration changed: **NO**

## Preview validation

The preview reached `ACTIVE_HEALTHY` with `is_default = false`,
`persistent = false`, and a project ref distinct from production.

A synthetic signup using a reserved `.invalid` email address and a known
compromised password was executed against the preview only. The Auth endpoint
returned HTTP 200, created an authenticated preview user, and did not return a
`weak_password` error or a `weakPassword` signal. This proves leaked-password
protection was not active on the preview at test time. The preview reported
email auto-confirmation enabled.

The setting could not be enabled safely in this session. The official CLI
configuration surface does not expose `password_hibp_enabled`; the supported
hosted control is the Supabase Management API or Dashboard. The available
Management API route required access to a stored management credential outside
the normal CLI command surface. No credential was extracted, printed, saved,
or reused through a custom workaround.

Consequently, tests requiring an enabled HIBP setting were not claimed as
executed:

- signup rejection with `weak_password`;
- login `data.weakPassword` signal for an existing weak password;
- weak-password rejection during password update/recovery.

## Local application tests

Command: `npm run test:pro05`

- Tests: **8/8 PASS**
- `weak_password` safe mapping: **PASS**
- SDK `data.weakPassword` handling: **PASS**
- `PASSWORD_RECOVERY` gate: **PASS**
- `updateUser({ password })` implementation contract: **PASS**
- Safe non-enumerating messages and recovery redirect contract: **PASS**

## Cleanup and cost boundary

The preview branch was deleted immediately after the blocked live test. A
post-cleanup branch inventory showed only production `main`; the temporary
project ref no longer appears. The synthetic preview user was deleted with the
isolated branch.

- Preview deleted: **YES**
- Production branch deleted or modified: **NO**
- Production database writes: **0**
- Production Auth configuration writes: **0**
- Maximum authorized duration: **24 hours**
- Actual observed lifetime: approximately **56 minutes**
- Rate used for the preflight estimate: **USD 0.01344/hour**
- Approximate compute charge from elapsed time: **USD 0.013** maximum estimate;
  the Supabase Billing ledger remains authoritative.

## Decision

PRO-05.3 local application readiness remains validated, but the staging Auth
test matrix is **INCOMPLETE** because HIBP could not be enabled through an
approved safe control surface in this session.

Before activation review, repeat the same ephemeral-branch test with either:

1. an authenticated Supabase Dashboard session available to the automation; or
2. an explicitly authorized, scoped Management API credential with
   `auth_config_write` for the preview project only.

`READY FOR ACTIVATION REVIEW`: **NO**

