# PUBLIC-SITE-02B MIGRATION PREFLIGHT

Security/lifecycle audit of `supabase/migrations/0035_school_page_identity_results_ranking.sql`
before it is applied to production. Migration NOT applied — this document
covers the audit, the fix, and the release plan for when it is.

## RESULTS SECURITY

`school_exam_results`, first draft of 0035:

- Direct live INSERT: **possible** — the original policy was a blanket
  `for all using (owner check)` with no `status` restriction in the WITH
  CHECK, so an owner could `INSERT ... status: 'live'` directly.
- Direct promotion (`draft_pending_add` → `live`): **possible** — same
  blanket policy allowed an owner UPDATE of `status` with no restriction.
- Direct live UPDATE (editing an already-published row's exam/counts):
  **possible** — same policy, no column or status restriction at all.
- Direct live DELETE: **possible** — same policy, `for all` includes
  DELETE with no status restriction.
- **Fix required: YES.** Applied — see "RLS" below. Split into 4 precise
  per-command policies:
  - `school_exam_results_public_read` (SELECT, `status='live'`, all roles)
  - `school_exam_results_owner_read` (SELECT, owner sees own rows
    regardless of status — needed for the CMS UI)
  - `school_exam_results_owner_insert_draft` (INSERT, owner, WITH CHECK
    `status = 'draft_pending_add'` — a live insert is rejected outright)
  - `school_exam_results_publish_rpc_update` (UPDATE, owner AND the
    transaction-local trusted flag `app.school_page_publish = 'on'` — set
    only inside `publish_school_page()`, so a direct owner UPDATE always
    has the flag unset and matches zero rows)
  - `school_exam_results_owner_delete_pending` (DELETE, owner,
    `status='draft_pending_add'` only — cancelling your own pending add)
  - `school_exam_results_publish_rpc_delete_live` (DELETE, owner AND
    trusted flag, `status='live'` only — Publish processing
    `results.remove_ids`)

## RANKING SECURITY

`school_official_ranking`, first draft of 0035:

- Direct published write: **possible** — blanket `for all using (owner
  check)`, no gate at all. An owner could INSERT/UPDATE/DELETE the live
  ranking row directly, any time, with no provenance re-validation beyond
  the table's own CHECK constraints.
- **Fix required: YES.** Applied — the owner-write policy was removed
  entirely and replaced with `school_official_ranking_publish_rpc_only`
  (ALL commands, gated by the same trusted-flag + ownership check as
  above). There is now **no** owner-direct write path on this table at
  all — draft ranking lives only in `school_page_drafts.payload.ranking`
  (JSON) until Publish writes the row. Public SELECT (`using (true)`)
  unchanged.

## ESTABLISHMENTS CMS FIELDS

- Direct bypass possible: **YES — and empirically confirmed live against
  production today**, independent of this migration. `"Owners can update
  own establishments"` (`schema.sql:143`) is `for update using (auth.uid()
  = owner_id)` with no column restriction beyond the 0014 trigger
  (`is_verified`/`is_featured`/`subscription_plan`/`forfait`/
  `verification_status`) and the 0023 trigger (registry columns). None of
  the 8 pre-existing Draft/Publish-lifecycle scalar columns
  (`description`/`phone`/`email`/`website`/`address`/`city`/`hero_mode`)
  were ever protected — this is a pre-existing gap, not one introduced by
  0035, but the 7 new columns would have inherited it unchanged.

  **Live proof (School A2, Owner A's real session, direct PostgREST PATCH,
  no app code involved):**
  ```
  PATCH .../establishments?id=eq.<school-a2-id>  { "description": "PUBLIC-SITE-02B-PROBE-..." }
  → 200, description changed immediately
  ```
  Restored to the original value immediately after the probe. This
  confirms the bypass is real today, at the RLS layer, for the *existing*
  8 fields — not a hypothetical about the 7 new ones only.

  (Live-testing the *new* 7 columns or the 2 new tables the same way is
  not possible pre-migration — they don't exist yet. Section RLS below
  documents the design; the test matrix documents what to run once 0035
  is applied.)

- Protection mechanism: extended `establishments_protect_school_page_
  published_columns` trigger (new function
  `protect_school_page_published_columns()`), same shape as 0014's
  `protect_profile_privileged_columns()`/`protect_establishment_
  privileged_columns()` — fires `before update`, blocks the write only
  when `auth.uid() = old.owner_id` (never blocks service-role, `auth.uid()`
  is null there) **and** the trusted-context flag is unset, **and** one of
  the 15 governed columns actually changed. Covers the original 8 fields
  **and** the new 7 in one consistent trigger — protecting only the new 7
  and leaving the original 8 exposed would have been an inconsistent
  security posture with no principled justification.

  Every other `establishments` column (name, registry fields, platform-
  trust fields, category, etc.) is untouched — the row is not made
  immutable, only these 15 columns are governed.

## WEBSITE

- Current lifecycle: **already fully correct**, confirmed by direct code
  read (not assumed):
  - Stored: `establishments.website` (live) / `payload.contact.website`
    (draft) — already existed since CMS-F.2, unrelated to this migration.
  - CMS edits it in draft: **yes** — `draft/route.ts`'s `validateContact()`
    validates it, `PATCH /api/school-page/draft` writes it into
    `payload.contact.website`.
  - Public page reads published value: **yes** —
    `src/app/ecole/[id]/page.tsx`'s `ESTABLISHMENT_COLUMNS` selects
    `establishments.website` directly (live).
  - Preview sees draft: **yes** — `preview/page.tsx` builds
    `website: draft.contact.website`, never the live column.
  - Publish commits it: **yes** — `publish_school_page()` writes
    `website = v_payload->'contact'->>'website'` (unchanged by 0035).
  - Discard restores published state: **yes** — `discard_school_page_
    draft()` replaces the whole draft payload with `buildLiveSnapshot()`'s
    output, which reads `website` from live `establishments`.
- Required change: **none.** No duplicate `official_website_url` field
  was created — the mission's IDENTITY "official website" requirement is
  already served end-to-end by this existing field, and it is now also
  covered by the new establishments-column trigger (any future direct
  bypass attempt on `website` specifically is blocked the same as the
  other 14 governed columns).

## RPC INTEGRITY

Line-by-line comparison of the revised `publish_school_page()` /
`discard_school_page_draft()` bodies against the current canonical 0033 /
0034 versions:

- **Publish existing behavior preserved: YES** — ownership check, draft
  row lock (`for update`), optimistic-concurrency guard
  (`updated_at is distinct from`), dirty guard, full structural validation
  (domain presence, `hero_mode` enum, 8-section shape/positions/
  duplicates), gallery `remove_ids` UUID/ownership/status validation,
  scalar `establishments` update, `fees`/`infrastructures`/
  `admissions_config` upserts (never touching `is_open`), `school_page_
  sections` upsert loop, gallery delete + `draft_pending_add` promotion,
  `is_dirty=false` + payload `remove_ids` clearing, generic
  `PUBLISH_FAILED` on exception (raw `sqlerrm` only in `RAISE LOG`, never
  returned to the client), `revoke`/`grant` — every one of these is
  byte-identical to 0033 except the one line adding `perform
  set_config(...)` and the 3 new `establishments` columns in the same
  UPDATE statement.
- **Discard existing behavior preserved: YES** — ownership check, lock,
  concurrency guard, pending-add-aware "nothing to discard" check, minimal
  live-payload shape validation, full payload replacement +
  `is_dirty=false`, `draft_pending_add` image cleanup, generic
  `DISCARD_FAILED` on exception, `revoke`/`grant` — all unchanged except
  the pending-add check now also covers `school_exam_results` and the
  cleanup block now also deletes `draft_pending_add` exam-result rows.
- **New domains correct:**
  - `presentation` (motto/history/mission/vision): written from
    `payload.presentation.*` via `nullif(..., '')` (empty string → NULL,
    consistent with how the rest of the function treats blank optional
    text).
  - `key_numbers`: written via `nullif(...,'')::int` from
    `payload.key_numbers.*`.
  - `results`: `remove_ids` validated identically to `gallery.remove_ids`
    (UUID shape → ownership+status='live' membership), live rows deleted,
    `draft_pending_add` rows promoted, `remove_ids` cleared in the stored
    payload — exact structural mirror of the gallery handling already in
    0033, distinct `RESULTS_INVALID` error code so a client can tell which
    list failed.
  - `ranking`: upserted when `payload.ranking` is a non-null object,
    **deleted** when null (never a row of NULLs sitting around implying a
    "configured but empty" ranking).

## DATA INTEGRITY

- **Year constraints:** `founding_year` 1800–current year;
  `school_exam_results.academic_year` and `school_official_ranking.year`
  both 1990–(current year + 1) (allows entering next year's just-released
  results without waiting for a year rollover).
- **Counts:** `candidates_count >= 0`, `admitted_count >= 0`,
  `admitted_count <= candidates_count` (all NULL-tolerant — a school may
  not have every number).
- **Success rate:** **Option B chosen** (stored, with a DB consistency
  rule) over full derivation — a school may legitimately know only the
  official published rate without raw counts, so forcing derivation would
  reject valid entries. New constraint
  `school_exam_results_success_rate_consistency_check`: when candidates,
  admitted, **and** success_rate_percent are all provided, they must agree
  within ±1 point (`abs(rate - admitted/candidates*100) <= 1.0`) — rejects
  the mission's own example (150/144/"82%": true rate is 96%, off by 14
  points) while tolerating official rounding.
- **Ranking:** year/rank/scope/source all `not null` (required together —
  enforced at the column level, reinforced by the app-layer validator in
  `draft/route.ts` requiring all four whenever `ranking` is non-null);
  `source_url` optional, validated `^https?://` at both the DB
  (`school_official_ranking_source_url_check`) and app layer; `rank <= 0`
  blocked via `school_official_ranking_rank_check` (`rank` stays free text
  for display flexibility like "12e", but a bare integer must be `> 0`);
  blank rank/scope/source rejected via `btrim(...) <> ''` checks.

## RLS

- **Anonymous:** SELECT-only everywhere (`school_exam_results` limited to
  `status='live'`, `school_official_ranking` and `establishments`
  unrestricted SELECT, matching existing public-read policies) — zero
  write grants anywhere in this migration.
- **Owner, own school:** may INSERT `draft_pending_add` exam results, may
  DELETE their own `draft_pending_add` exam results, may SELECT their own
  rows regardless of status, may edit any *other* `establishments` column
  (name, address details unrelated to the school page, etc.) freely — may
  **not** insert/update/delete `school_official_ranking` directly, may
  **not** promote/edit/delete a live exam result directly, may **not**
  write the 15 governed `establishments` columns directly. All of the
  above enforced by RLS/trigger, not merely by the application routes.
- **Cross-school isolation:** unchanged — every new policy scopes through
  `establishments.owner_id = auth.uid()` on the SPECIFIC row's
  `establishment_id`, identical join pattern to every existing policy in
  the codebase (fees/infrastructures/admissions_config/school_page_drafts).
  No new cross-school read/write path introduced.

## MIGRATION

- 0035 revised: **YES** — `supabase/migrations/0035_school_page_identity_results_ranking.sql`
  (in place, same filename, `feat/public-school-minisite-v1` worktree).
- Rollback file: `docs/pro/PUBLIC-SITE-02_0035_ROLLBACK.sql` (prepared,
  not executed) — restores the exact verbatim 0033/0034 RPC bodies, drops
  both new tables and their policies/triggers, drops the establishments
  protection trigger/function, drops the 7 new columns last. Documented
  IRREVERSIBLE data loss for any already-published motto/history/mission/
  vision/founding_year/student_count/teacher_count values if rolled back
  after real use.
- Production applied: **NO**.

## RELEASE ORDER

1. Backup/check production state (`pg_dump` or Supabase's own backup
   snapshot before running any DDL — standard practice for every
   migration this session, not specific to 0035).
2. Apply `0035_school_page_identity_results_ranking.sql` (revised) via the
   Supabase SQL Editor — Eddy/architect execution, this environment has no
   DDL capability.
3. Reload PostgREST schema cache if it doesn't pick up new
   tables/columns/RPC signatures automatically (`NOTIFY pgrst,
   'reload schema'` or the Supabase dashboard's "reload schema" action).
4. Verify DB objects resolve: `school_exam_results` and
   `school_official_ranking` exist with RLS enabled, `publish_school_page`
   and `discard_school_page_draft` show the new signatures/bodies, the
   `establishments_protect_school_page_published_columns` trigger exists.
5. Run the direct security probes below (Owner A/B, anonymous) BEFORE any
   application code touches the new domains.
6. Deploy application code (this branch, `feat/public-school-minisite-v1`)
   — only now, since the code depends on the schema existing.
7. Smoke-test the public page (`/ecole/[id]`) for a school with no new
   data configured yet — must render exactly as before (graceful-empty,
   confirmed in PUBLIC-SITE-01/02 testing).
8. Smoke-test CMS Preview for a real draft with motto/mission/key numbers/
   a ranking/an exam result staged.
9. Test Draft → Publish → Discard end-to-end for every new field (motto,
   history, mission, vision, key numbers, ranking, one exam result
   add+publish, one exam result add+discard).
10. Rollback (`docs/pro/PUBLIC-SITE-02_0035_ROLLBACK.sql`) only if a
    critical failure surfaces — with the caveat above about irreversible
    data loss for anything already published through the new fields.

## SECURITY TEST MATRIX

Designed and ready to execute immediately after step 4 above (cannot run
before — the tables/columns/trigger don't exist pre-migration). Uses the
existing QA topology (Owner A / School A2, Owner B / School B, anonymous)
and the same live-probe-then-restore methodology already used throughout
this session.

| # | Test | Expected |
|---|---|---|
| 1 | Owner A: `POST /api/school-page/results` (app route) | 200, row created `status='draft_pending_add'` |
| 2 | Owner A: direct PostgREST `INSERT school_exam_results {status:'live'}` | Denied (RLS `WITH CHECK` rejects — 401/403 from PostgREST) |
| 3 | Owner A: direct PostgREST `UPDATE school_exam_results SET status='live' WHERE status='draft_pending_add'` | Denied (0 rows affected — flag unset) |
| 4 | Owner A: direct PostgREST `UPDATE` on a `status='live'` row's `exam`/`success_rate_percent` | Denied (0 rows affected) |
| 5 | Owner A: direct PostgREST `DELETE` on a `status='live'` row | Denied (0 rows affected) |
| 6 | Owner A: direct PostgREST write (INSERT/UPDATE/DELETE) to `school_official_ranking` | Denied (no owner-write policy exists at all — 0 rows / 403) |
| 7 | Owner A: direct PostgREST `UPDATE establishments SET motto=...` (or `description`/`phone`/etc.) on their own row | Denied — trigger raises `42501` |
| 8 | Owner A: any of tests 2–7 targeting **School B**'s rows | Denied (both the pre-existing ownership check AND the new restriction reject it) |
| 9 | Owner B: same as 8, targeting School A2 | Denied, symmetric |
| 10 | Anonymous: `SELECT` a `status='live'` exam result | 200, visible |
| 11 | Anonymous: `SELECT` a `status='draft_pending_add'` exam result | Not returned (RLS filters it out — empty result, not an error) |
| 12 | Anonymous: `SELECT school_official_ranking` for a school with a published ranking | 200, visible |
| 13 | Anonymous: any INSERT/UPDATE/DELETE anywhere in this migration's scope | Denied (no grant to `anon` beyond SELECT) |
| 14 | `publish_school_page()`: draft with one `draft_pending_add` exam result + a configured ranking + new scalar identity fields | Result promoted to `live`, ranking row upserted, `establishments` scalars updated — all in the one call |
| 15 | `discard_school_page_draft()`: draft with a pending exam result and unpublished scalar edits | Pending result row deleted, draft payload reset to the live snapshot, public data completely untouched |

Note on what "denied" looks like: RLS denial (tests 2–6, 8–9, 13) shows up
as **zero rows affected** (PostgREST returns 200 with an empty array for
UPDATE/DELETE, or a 401/403 for INSERT depending on the exact `Prefer`
header), not a thrown error — this is standard Postgres RLS behavior, in
contrast to the `establishments` trigger (test 7), which raises an actual
exception (`42501`) surfaced as a PostgREST error response. Both are
correct "denied" outcomes; the test runner should check for absence of
change, not for a specific status code.

## QUALITY

- TypeScript: `npx tsc --noEmit` — clean (no app code changed this
  mission; only SQL).
- Build: `npm run build` — clean, all routes compile.
- Tests: no existing automated test references these tables/RPCs (none
  existed before this migration); the security test matrix above is
  designed but **not executable** until the migration is applied — no
  staging database is available in this environment, only the single
  production Supabase project. One live probe WAS executed against
  production today: proof of the pre-existing `establishments` bypass via
  `description` (see ESTABLISHMENTS CMS FIELDS above), run and reverted
  cleanly.

## FINAL VERDICT

- MIGRATION 0035 SAFE TO APPLY: **YES** (revised version — the original
  draft reviewed in PUBLIC-SITE-02A was not safe; this document's fixes
  address every finding)
- DRAFT/PUBLISH BYPASS POSSIBLE: **NO** (in the revised migration; **YES**
  it was possible in the original draft, and **YES** it is still possible
  TODAY for the 8 pre-existing scalar fields until 0035 — revised — is
  actually applied)
- ROLLBACK READY: **YES** — `docs/pro/PUBLIC-SITE-02_0035_ROLLBACK.sql`
- READY FOR ARCHITECT APPROVAL: **YES**

STOP.
