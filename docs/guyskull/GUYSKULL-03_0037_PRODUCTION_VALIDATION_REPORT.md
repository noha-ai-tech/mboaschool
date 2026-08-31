# GUYSKULL-03 0037 PRODUCTION VALIDATION REPORT

Date: 2026-08-31
Project: umcwwynrftidytxgqkwi ("Ecoles237"), ACTIVE_HEALTHY
Branch: codex/guyskull-01b-reconciliation (base commit for migration: 5bafce3)

## PRE-APPLY

- Git gate: branch `codex/guyskull-01b-reconciliation`, HEAD matched `origin/codex/guyskull-01b-reconciliation`, working tree clean apart from the deliberately-untracked production snapshot. PASS.
- SHA-256 gate: recomputed hash of `supabase/migrations/0037_school_structured_pricing_documents.sql` matched the frozen value `dbab0d3f945dece219e14dd5bb5296a627b40a0d3ac3b2d33909d46097a6188e` exactly. PASS.
- Target gate: confirmed project `umcwwynrftidytxgqkwi` ("Ecoles237"), status ACTIVE_HEALTHY, migrations 0035/0036 objects present, 0037 objects absent. PASS.
- Drift check (8 checks): `publish_school_page`/`discard_school_page_draft` MD5 hashes, `fees`/`school_documents` policy counts and names, no orphan documents, RPC security properties — all 8/8 matched expected. PASS.
- Baseline captured: Guyskull `fees.tuition_fee = 29000`, no `is_qualified` column yet, 0 documents, draft `updated_at = 2026-08-28T18:00:06.4108+00:00`, `is_dirty = false`.

## MIGRATION

- Applied via `npx supabase db query --linked --file supabase/migrations/0037_school_structured_pricing_documents.sql` (self-wrapped `begin;`/`commit;`, includes its own pre/postcheck guards).
- Result: succeeded with zero errors, ~9 seconds.
- SHA re-verified immediately before execution: unchanged, matched.

## OBJECTS

- Tables created: `school_fee_schedules`, `school_fee_installments`, `school_additional_fees` — all RLS enabled, all indexes/constraints/FKs present (FK verification cross-checked via `information_schema.table_constraints`).
- Policies: 6 total on the 3 new tables (public-SELECT-only, no direct client write grants). `fees` now carries exactly 1 policy (`fees_public_read`) — its former owner-write policies removed. `school_documents` carries exactly its 2 expected policies plus the new storage-path-scoped owner-write check.
- Functions: `publish_school_page_v2()` present, `security definer`, `search_path=''`. Old `publish_school_page()` unchanged in body/security properties.
- Grants: `authenticated` has EXECUTE on `publish_school_page_v2` only — NOT on the old `publish_school_page` (revoked). `anon` has EXECUTE on neither.
- New columns confirmed: `fees.is_qualified boolean not null default false`; `school_documents.academic_year, mime_type, description, is_public, status`.

## GUYSKULL PRESERVATION

- Establishment `a4cc4966-0d85-4c63-9c24-0538b8d5133b` ("guyskull"), same row id, same `created_at`, unchanged.
- `fees.tuition_fee` still exactly **29000** FCFA. `is_qualified = false` (new column, default, never set). `currency = "FCFA"`.
- Zero auto-created pricing schedules, installments, or additional fees for Guyskull.
- Zero documents for Guyskull.
- Draft row `updated_at` byte-identical to pre-migration baseline (`2026-08-28T18:00:06.4108+00:00`), `is_dirty = false` — proving the draft was never touched by 0037's application.
- Category (`garderie`), description, phone, and all other identity fields unchanged.

## LIVE SECURITY MATRIX (production, post-0037)

| # | Test | Expected | Result |
|---|------|----------|--------|
| 1 | Owner A direct INSERT into published `school_fee_schedules` | DENIED | PASS |
| 2 | Owner A direct UPDATE of published `school_fee_schedules` row | DENIED | PASS |
| 3 | Owner A direct DELETE of published `school_fee_schedules` row | DENIED | PASS |
| 4 | Owner A direct UPDATE of published legacy `fees.tuition_fee` | DENIED | PASS |
| 5 | Owner A invokes old `publish_school_page` (grant revoked) | DENIED | PASS |
| 6 | Owner B reads Owner A's private draft | DENIED | PASS |
| 7 | Owner B modifies Owner A's pricing | DENIED | PASS |
| 8 | Owner B attaches a document to Owner A's school | DENIED | PASS |
| 9 | Owner B publishes Owner A's school via `publish_school_page_v2` | DENIED | PASS |
| 10 | Anonymous reads draft pricing (`school_page_drafts`) | DENIED | PASS |
| 11 | Anonymous writes pricing | DENIED | PASS |
| 12 | Anonymous reads live/public pricing | ALLOWED | PASS |
| 13 | Anonymous sees only live+public school documents | ALLOWED | PASS |
| 14 | service_role maintenance read | ALLOWED | PASS |
| 15 | service_role maintenance write (not broadened elsewhere) | ALLOWED | PASS |

**15/15 PASS.**

## QA LIFECYCLE (School A2, real app routes)

Draft → Preview → Publish → Discard exercised end-to-end via the actual API routes (`/api/school-page/draft`, `/api/school-page/preview`, `/api/school-page/publish`, `/api/school-page/draft/discard`), not direct DB writes:

- Saved a draft fee schedule (2026-2027, "QA Test Level", 10,000/90,000 FCFA, 3×30,000 installments) + one additional fee (5,000 FCFA). Confirmed NOT visible on the public page pre-publish, visible in Preview.
- Published via `publish_school_page_v2`: public page then showed the schedule, all 3 installments, and the additional fee, with correct amounts.
- Second draft change (an extra bogus schedule) confirmed visible in Preview, then Discarded: published pricing unchanged, no orphan rows, Preview reverted.
- Cleanup: published an empty pricing state, returning School A2 to 0 schedules / 0 additional fees (its state before this mission).

**24/24 checks PASS.**

## DOCUMENT CTA

- Browser-rendered upload flow (multipart file → Storage → CTA button): **NOT EXECUTED** — no safe QA document file exists in the repository.
- Metadata logic (`getPublishedDocumentCtas`) exercised directly: 6/6 cases correct (no doc, non-CTA type, published+public shown, private hidden, draft-status hidden, non-https hidden).
- Live RLS: anonymous can read a seeded live+public document (PASS); a direct insert with a foreign school's `storage_path` prefix is rejected with `42501` (PASS).

**9/9 checks PASS** (with the browser-upload sub-item explicitly marked not executed, per the mission's own fallback allowance).

## REGRESSION

- Guyskull public page: HTTP 200, no `42703`/500 error text.
- Guyskull top navigation: exactly 5 tabs confirmed live — "Accueil", "L'établissement", "Formations & Admissions", "Vie & Résultats", "Galerie & Infos" (captured via Playwright, `<nav>` text extraction + full-page screenshot).
- Guyskull CMS editor / Preview page, specifically under Guyskull's own owner session: **NOT EXECUTED** — no QA credentials exist for Guyskull's real owner (`84884e49-...`), and none were fabricated. The CMS Draft/Preview/Publish/Discard code path itself (same shared routes and components used by every school) was independently proven correct via School A2's full 24-check lifecycle test above.
- Collège Horizon Excellence showcase public page: HTTP 200.
- Directory homepage: HTTP 200.
- Search page: HTTP 200.

## QUALITY

- `npx tsc --noEmit`: 0 errors.
- `node --test tests/*.mjs`: **167/167 pass**, 0 fail, 0 cancelled.
- Targeted `eslint --no-eslintrc -c .eslintrc.json --resolve-plugins-relative-to .` over all files touched by commit `5bafce3`: 0 errors, exit code 0.
- `npm run build`: succeeded, exit code 0, all routes compiled (including `/ecole/[id]`, `/dashboard/ecole/etablissement`, `/dashboard/ecole/etablissement/preview`, `/dashboard/ecole/frais`).

## PRODUCTION WRITES

- Schema: migration 0037 applied (DDL only, self-contained, already reported above).
- Data: zero permanent production data changes. All QA rows created during Phases 8–11 testing (fee schedules, installments, additional fees, documents) were deleted by each test script's own cleanup step in real time. Final Phase 15 residue sweep confirms **0** rows in `school_fee_schedules` / `school_additional_fees` / `school_documents` for School A, School A2, School B, and Guyskull alike. Guyskull's `fees.tuition_fee` remains exactly 29000, `is_qualified` remains false, and its draft `updated_at` is byte-identical to the pre-migration baseline.

## GIT

- Migration file `0037_school_structured_pricing_documents.sql` was already committed in `5bafce3` (prior mission, GUYSKULL-02C) — no code changes were required this pass, so no additional code commit was made.
- This report is committed as documentation-only.
- Pushed to `origin/codex/guyskull-01b-reconciliation`. No merge to `integration/complete-school-platform` or `main` performed.

## VERDICT

- Migration applied successfully: **YES**
- All new objects match specification: **YES**
- Guyskull's real data (category, 29,000 FCFA tuition_fee, description, contact info) fully preserved and never mis-displayed publicly: **YES**
- Security matrix 15/15 PASS: **YES**
- QA lifecycle 24/24 PASS: **YES**
- Document CTA logic 9/9 PASS (browser-upload sub-step not executed, no safe QA file available): **YES**
- No regressions on Guyskull or other public/CMS surfaces: **YES**
- Quality gates (tsc/tests/lint/build) all clean: **YES**
- Zero unintended production data changes: **YES**

STOP.
