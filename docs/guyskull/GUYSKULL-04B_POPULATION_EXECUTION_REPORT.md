# GUYSKULL-04B POPULATION EXECUTION REPORT

Date: 2026-08-31
Project: umcwwynrftidytxgqkwi ("Ecoles237"), ACTIVE_HEALTHY
Branch: codex/guyskull-01b-reconciliation (execution base commit: 14d1f1b)

## FREEZE
- Branch: `codex/guyskull-01b-reconciliation`
- HEAD: `14d1f1baaeea2a0a248fc6471338f095cd0a997c`
- Remote parity: `origin/codex/guyskull-01b-reconciliation` matched exactly before execution
- Populate SHA-256: `a33dfb257607e872865adeee4cff8406474e593890736fe7f54ee1ad5eb15061` — matched expected exactly
- Rollback SHA-256: `cbd7f025c9d19f4f6e484a397c915bb3da567f8fc4780cb5819f5194b1970356` — matched expected exactly

## TARGET
- Project: umcwwynrftidytxgqkwi ("Ecoles237") — ACTIVE_HEALTHY
- School ID: a4cc4966-0d85-4c63-9c24-0538b8d5133b — confirmed to exist exactly once; 0037 objects (`school_fee_schedules`/`installments`/`additional_fees`, `publish_school_page_v2`) confirmed present before execution
- Project health: healthy, no drift detected

## EXECUTION
- Command: `node docs/guyskull/scripts/guyskull04_populate.js` (run exactly as frozen, no wrapper, no modification)
- Exit code: 0
- Started: 2026-08-31T21:43:2x UTC (first insert timestamp) — Completed: 2026-08-31T21:43:36 UTC
- Rollback required: **NO** — all 18 pre-write guards passed, all 9 inserts succeeded, all 16 post-write assertions passed

## IDENTITY PRESERVATION
- Name: unchanged — `guyskull`
- Category: unchanged — `garderie`
- Owner: unchanged — `84884e49-3596-451a-b0b6-b8eeda4a9e50`
- Contact: unchanged — phone `+237674816227`, email/website/address still null, city `Douala`, neighborhood `Pk10`
- 29,000: unchanged — `fees.tuition_fee = 29000` (independently re-read from production, not just trusted from script output)
- is_qualified: unchanged — `false`

## SHOWCASE CONTENT
- Description: set, live (Pk10/Douala early-childhood description)
- Motto: set — "Grandir, apprendre, s'épanouir."
- History: set, ends with the discreet demo disclaimer sentence, no founding date/founders claimed
- Mission: set
- Vision: set, includes the 6 values (bienveillance/apprentissage/curiosité/respect/autonomie/collaboration)
- Admissions: `levels` (6 demo programs), `required_documents` (5-item checklist), `additional_info` (demo disclaimer + transport/cantine note) all set; `conditions`/`period_start`/`period_end` confirmed unchanged (still null — no fabricated dates)

## PRICING
- Fee schedules: exactly 1 ("Programme découverte", 2026-2027, registration 25,000 / tuition 300,000 FCFA)
- Installments: exactly 3, all belonging to that one schedule (Tranche 1/2/3, 100,000 FCFA each)
- Additional fees: exactly 2 (Badge 5,000 FCFA mandatory; Tenue/activités 15,000 FCFA optional)
- Demo disclaimer: `schedule.notes = "Tarifs de démonstration — à remplacer par les tarifs officiels de l'établissement."` — confirmed rendering publicly directly under the pricing table (via the new generic `StructuredPricing.tsx` notes caption, not buried in a fee's own notes)
- Legacy 29,000 shown as structured: **NO** — confirmed absent from the Formations & Admissions tab text at every breakpoint tested
- Duplicates: none — exactly 1/3/2 rows confirmed via direct production read-back, independent of the script's own self-report

## EVENTS
- Count: exactly 3 ("Journée portes ouvertes" 2026-10-10, "Atelier parents-enfants" 2026-11-14, "Journée créative et sportive" 2027-03-13)
- Demo labeling: each event's own content ends with "Événement de démonstration — à confirmer par l'établissement." — confirmed rendered publicly on the Vie & Résultats tab

## OTHER SCHOOLS
- Modified: **NO**
- Evidence: a direct production query for any row updated/created in `establishments`, `fees`, `admissions_config`, `school_fee_schedules`, `school_additional_fees`, `school_announcements` in the hour surrounding execution, excluding Guyskull's id, returned zero rows in every table. Total `establishments` row count (2255) consistent with no new/deleted rows.

## PUBLIC PAGE
- HTTP: 200 at all 4 breakpoints
- 5 tabs: confirmed exact set and order — Accueil / L'établissement / Formations & Admissions / Vie & Résultats / Galerie & Infos
- Pricing: schedule, 3 installments (after expanding the accordion), 2 additional fees, and the disclaimer all render correctly
- Admissions: 6 demo levels, 5-item checklist, and the admissions demo disclaimer all render correctly
- Events: all 3 demo events with their disclaimers render correctly
- Results hidden: YES — no BEPC/Probatoire/Baccalauréat text anywhere on the page
- Ranking hidden: YES — no ranking/classement block rendered
- Key numbers hidden: YES — no founding-year/student-count/teacher-count figures rendered (all three remain null)
- No invented contact: confirmed — only the real phone number appears; no fabricated email/website
- No invented category label: confirmed — page uses the existing `garderie` category label throughout, nothing implying a different institution type (no "Collège"/"École bilingue" invented)

## RESPONSIVE
- 1440: PASS — no overflow, all content verified
- 1024: PASS — no overflow, all content verified
- 768: PASS — no overflow, mobile hamburger nav verified, all content verified
- 390: **initially FAILED**, then fixed and re-verified PASS (see below)
- Overflow: **one real regression found and fixed this mission.** `TabShell`'s `items-start` cross-axis alignment let the stacked mobile content column shrink-to-fit instead of filling the viewport; on the Formations & Admissions tab the pricing table's `overflow-x-auto` wrapper (previously harmless when unused, since Guyskull had no pricing before this mission) could then stretch the whole column past 390px, causing page-level horizontal scroll. Fixed generically in `MiniSiteRenderer.tsx` by adding `w-full` to the shared content-column wrapper (4 identical occurrences, one per tab) — a CSS-only fix with zero Guyskull-specific code, verified by flexbox semantics not to affect the desktop row layout (`flex-1`'s `flex-basis: 0%` already governs sizing along the row axis; `w-full` only matters in the column/mobile axis). Re-ran the full 96-assertion responsive suite after the fix: 96/96 PASS, 0 FAIL, at all 4 breakpoints.

## QUALITY
- TypeScript: `npx tsc --noEmit` — 0 errors
- Lint: targeted eslint on `MiniSiteRenderer.tsx` + `StructuredPricing.tsx` — 0 errors
- Tests: `node --test tests/*.mjs` — 179/179 pass
- Build: `npm run build` — succeeded, exit 0

## ROLLBACK EVIDENCE
- Baseline file present: YES — `docs/guyskull/scripts/guyskull04-runtime-baseline.local.json` (gitignored, kept local, NOT committed)
- Rollback tested previously: YES — 12/12 mocked unit tests in GUYSKULL-04A, including F/G/H/I exactness tests, all passing against this exact frozen rollback script
- Rollback executed: **NO** — not needed, population succeeded cleanly

## GIT
- Report: `docs/guyskull/GUYSKULL-04B_POPULATION_EXECUTION_REPORT.md` (this file)
- Commit: includes the `MiniSiteRenderer.tsx` mobile-overflow fix (a real code change discovered during this mission's own responsive QA) alongside this report
- Remote parity: pushed to `origin/codex/guyskull-01b-reconciliation`, no merge, no Vercel deploy

## VERDICT
- POPULATION SUCCESS: **YES**
- IDENTITY PRESERVED: **YES**
- 29,000 PRESERVED: **YES**
- DEMO LABELING SAFE: **YES**
- NO OTHER SCHOOL TOUCHED: **YES**
- PUBLIC PAGE PASS: **YES**
- RESPONSIVE PASS: **YES** (one regression found and fixed within this mission, then re-verified clean)
- SAFE TO KEEP GUYSKULL POPULATED: **YES**
- READY FOR GUYSKULL-05 VISUAL ASSETS: **YES**

STOP.
