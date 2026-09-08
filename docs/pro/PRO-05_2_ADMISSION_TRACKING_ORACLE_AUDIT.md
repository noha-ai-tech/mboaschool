# PRO-05.2 — Admission tracking oracle audit

Date: 2026-08-24

Branch: `feat/pro-school-organization`

Scope: local audit and preparation only

Production SQL executed: **none**

Supabase writes: **0**

## Current boundary

`public.get_admission_by_tracking(text,text)` is the intentional public lookup
oracle for an admission. The validated PRO-04 production snapshot and local
history establish the following current state:

| Check | Current state |
|---|---|
| Signature | `get_admission_by_tracking(text,text)` |
| Owner | `postgres` expected; must be re-captured before execution |
| Language | SQL |
| Security | `SECURITY DEFINER` |
| Volatility | `STABLE` |
| `search_path` | `public` |
| Result | six curated fields; never application id, internal notes, parent phone or email |
| Direct table read by anon | none |
| Effective execution | `PUBLIC`, `anon`, `authenticated`, and therefore `service_role` through PUBLIC |
| Dedicated lookup rate-limit | none |

`SECURITY DEFINER` remains necessary while this public flow exists: changing to
`SECURITY INVOKER` would require public `SELECT` access to `applications` and
`establishments`, which would materially widen exposure. The hardening therefore
keeps the definer boundary, makes every referenced object explicit and sets
`search_path=''`.

## Application consumers

The exhaustive local search found one direct RPC consumer:

- `src/app/suivi-admission/page.tsx` calls
  `supabase.rpc("get_admission_by_tracking", ...)` from the browser.

Related but indirect consumers are:

- `src/app/preinscription/page.tsx`, which receives and displays the newly
  generated code and links to the tracking page;
- `src/components/layout/SiteFooter.tsx`, which links to `/suivi-admission`;
- the school admission dashboard, which displays/copies an existing code but
  does not call this RPC;
- migration `0012_admissions_v1.sql` and the admission documentation.

No API route, server action, trigger, RLS policy, scheduled job or other RPC
calls `get_admission_by_tracking` locally.

The preinscription success link previously put the code in
`/suivi-admission?code=...`. The local application correction now stages it in
tab-scoped `sessionStorage`, navigates to a token-free URL and deletes the staged
value immediately after reading it. Manual entry still works. The public page
also validates the exact code shape and bounds input size before calling the
RPC. This removes the code from URLs, browser history, referrers and normal HTTP
access logs.

## Grants decision

| Role | Proposed EXECUTE | Reason |
|---|---:|---|
| `PUBLIC` | no | default function privilege is too broad and grants future/unreviewed roles |
| `anon` | yes | required by the public tracking flow |
| `authenticated` | yes | a signed-in visitor uses the same Supabase browser client/session and must not lose the public flow |
| `service_role` | no | no consumer needs it and PUBLIC inheritance must no longer provide it |
| `postgres` | yes | owner/maintenance only |

Keeping `anon` means the Security Advisor warning for an executable anonymous
`SECURITY DEFINER` function remains intentional. The correction is a hardened
public capability, not an attempt to silence the advisor by breaking the
feature. The authenticated warning also remains while the browser consumer can
carry a session.

## Rate-limit design

The proposed migration creates
`private.admission_tracking_rate_limits`, a private RLS-enabled table with no
policy, no schema usage and no table privilege for `PUBLIC`, `anon`,
`authenticated` or `service_role`.

Security Advisor may therefore add an informational `rls_enabled_no_policy`
finding for this table. It is intentional deny-all defense in depth, provided
the schema and table ACL post-checks continue to pass.

The function maintains two fixed-window counters with atomic
`INSERT ... ON CONFLICT DO UPDATE ... RETURNING` operations:

| Counter | Limit | Purpose |
|---|---:|---|
| Global | 300 structurally valid requests/minute | bounds broad enumeration and database load when codes vary |
| Per normalized tracking code | 10 requests/15 minutes | bounds phone guessing for a known code |

Properties:

- concurrency cannot bypass either ceiling because each key is serialized by
  the unique primary-key row update;
- only SHA-256 hashes are stored; raw codes and phone numbers never enter the
  rate-limit table;
- the global row is constant and code rows older than one hour are deleted in
  bounded batches of 64;
- invalid shape, wrong phone, unknown code, per-code limit and global limit all
  return the same empty result set;
- expected denials never raise a distinct SQL error or expose a counter;
- the original six-column success result remains unchanged.

The limits are defensive defaults. Before execution, production traffic must be
checked to confirm that 300/minute globally and 10/15 minutes per code do not
block legitimate peaks.

## Enumeration analysis

The code alphabet contains 32 symbols over six random positions, approximately
1.07 billion possibilities, and a successful lookup also requires the exact
stored phone string. Shape validation prevents arbitrary payloads; the global
counter prevents an attacker from bypassing the ceiling merely by changing the
code; the per-code counter prevents unrestricted phone guessing after a code is
known.

The API deliberately does not distinguish:

| Input/state | Observable RPC result |
|---|---|
| unknown or malformed code | empty set |
| valid code, wrong phone | empty set |
| per-code rate-limited | empty set |
| globally rate-limited | empty set |
| valid code and correct phone below limits | one curated row |

Residual risks remain and are documented rather than hidden:

- PostgreSQL cannot derive a non-forgeable visitor identity from a shared anon
  role, so this is not a reliable per-IP limit;
- an attacker can intentionally consume a known code's ten attempts and cause a
  temporary lookup denial for that dossier;
- the shared global bucket can itself be used for short denial of service;
- response-time differences cannot be proven constant across all database and
  network states.

A later defense-in-depth layer may add trusted edge/IP throttling, but it must
not accept an IP or actor identifier from the browser and is not required for
this SQL proposal. Moving the lookup behind a server route would only improve
the boundary if the direct anon RPC were also closed and the server used a
narrow dedicated database capability; using `service_role` on an anonymous
route was rejected as a wider privilege risk.

## Migration safety

The proposed migration:

- is one transaction with `lock_timeout=5s` and `statement_timeout=2min`;
- accepts only the known initial state or the exact final state;
- verifies the function signature, owner, return shape, security mode,
  volatility, body markers, effective ACL and unique B-tree coverage of
  `applications.tracking_code`;
- verifies the private schema is not usable by client roles;
- creates no business row and changes no `applications` or `establishments`
  data;
- validates real anon/authenticated behavior in rollback-only subtransactions;
- preserves existing operational counters on a replay;
- does not modify `applications_public_insert`, admission RLS policies, the
  submission trigger or any registry field.

Because this was a local-only audit, the execution gate must first re-capture
the exact production OID, owner, `prosrc` checksum, `proconfig`, ACL, return
shape, dependent objects, row counts and current traffic. Any difference must
stop execution.

## Rollback

The rollback is final-state gated and transactional. It restores the original
SQL/STABLE function, `search_path=public`, and the original effective public,
anon and authenticated execution surface, then drops the private operational
counter table with `RESTRICT`.

Rollback consequence: active rate-limit buckets are discarded and the oracle
again has no dedicated lookup throttling. No admission or establishment row is
changed.

## Local preparation status

- ORACLE CONSUMERS: **AUDITED**
- SECURITY DEFINER: **RETAINED WITH JUSTIFICATION**
- SEARCH_PATH: **PROPOSED `''`**
- PUBLIC EXECUTE: **PROPOSED REVOKED**
- ANON EXECUTE: **PROPOSED RETAINED**
- AUTHENTICATED EXECUTE: **PROPOSED RETAINED FOR SESSION COMPATIBILITY**
- SERVICE_ROLE EXECUTE: **PROPOSED REVOKED**
- RATE LIMIT: **ATOMIC GLOBAL + PER-CODE PROPOSAL**
- ENUMERATION RESPONSE: **UNIFORM EMPTY SET**
- TRACKING CODE IN URL: **REMOVED LOCALLY**
- TARGETED TESTS: **PASS — 10/10**
- PRO-03/PRO-04/PRO-05 TESTS: **PASS — 123/123**
- TYPESCRIPT: **PASS**
- TARGETED LINT: **PASS — 0 warning, 0 error**
- BUILD: **PASS — 93/93 pages**
- MIGRATION EXECUTED: **NO** *(true as of this document's 2026-08-24 date — see status update below)*
- DATABASE WRITES: **0** *(true as of this document's 2026-08-24 date — see status update below)*

## RELEASE-CONSOLIDATION-03 status update (verified 2026-09-02)

The two lines above described the state at the time this audit was written,
before the execution gate mentioned under "Migration safety" was cleared.
Direct, read-only inspection of production (`umcwwynrftidytxgqkwi`) now shows
this migration **has since been executed**:

- `supabase_migrations.schema_migrations` records version `20260825054125` /
  `pro_05_2_admission_tracking_hardening` as applied; its stored statement's
  MD5 (`4d756d2e180d7cead44911b0952e590a`, 23398 bytes) is byte-for-byte
  identical to the executed migration file's body.
- `private.admission_tracking_rate_limits` exists live with exactly the 5
  columns/5 constraints/2 indexes this migration's own "final state" preflight
  check expects, RLS enabled, zero policies, zero `anon`/`authenticated`/
  `service_role` grants.
- `public.get_admission_by_tracking` is live as `SECURITY DEFINER`,
  `search_path=''`, with `anon`/`authenticated` able to execute and
  `service_role` unable to — the hardened target state, not the pre-hardening
  `STABLE`/`search_path=public` state this document's "Current boundary"
  table above describes.

No production write was made by this or the two prior RELEASE-CONSOLIDATION
missions to reach this conclusion — this is a report of pre-existing state,
found via read-only queries. Current corrected status:

- MIGRATION EXECUTED: **YES**
- DATABASE WRITES: **1 migration, applied prior to 2026-08-26** (exact
  timestamp not independently determinable from `schema_migrations` alone)
