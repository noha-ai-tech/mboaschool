# Daily Intelligence — V1 (DAILY-INTELLIGENCE-01)

Status: **deterministic, no AI/LLM involved.**

## Purpose

Daily Intelligence answers, precisely and without invention:

> "What happened in my school today?"

It is not a chatbot, not a raw event dump, not a graphical analytics
dashboard, not a PDF report, and not an AI model. It is a deterministic
projection of the facts already recorded by the
[School Event Engine](../events/event-catalog-v1.md) (EVENT-01 +
EVENT-01.1) — tenant-safe, correction-aware, multi-session-correct,
traceable back to source. This is also the exact, contractual surface a
future ScorgIA assistant must be built on top of.

```
Operational Data → school_events → Daily Intelligence (this document)
  → [future: AI Gateway] → [future: role-scoped assistant]
```

## Why not a new table

No `daily_summary`/`ai_summary`/`school_insights` table was created.
`school_events` already is the canonical fact store; Daily Intelligence is
computed on demand from it via two new, narrowly-scoped SQL reducers
(`get_school_daily_activity`, `get_school_staff_open_shifts`) plus the
already-existing `get_daily_school_proof` and `getSchoolEvents` (EVENT-01).
A persisted snapshot table is explicitly deferred (mission §43) until a
real performance measurement justifies one — not before.

## Canonical contract

`src/lib/intelligence/dailyIntelligence.ts` exports `SchoolDailyIntelligence`
and `getSchoolDailyIntelligence({ supabase, establishmentId, date?,
activityLimit? })`. This is the single, shared type — no duplicated DTOs.
It is consumed via `GET /api/intelligence/daily?establishmentId=...&date=...`
(`src/app/api/intelligence/daily/route.ts`), the only sanctioned way to
read it from the browser.

| Field | Meaning |
|---|---|
| `establishmentId` / `date` | The exact tenant + school day this result describes |
| `generatedAt` | Server timestamp when this result was computed — never confused with any event's `occurred_at` |
| `attendance.{presentFacts,absentFacts,lateFacts}` | Final attendance facts per (student, session) for the day — see "Attendance semantics" |
| `staff.{checkedIn,checkedOut}` | Raw event counts for the day |
| `staff.currentlyCheckedInCount` | A **derived** state (see "Staff semantics"), never confused with the event counts above |
| `admissions.{applicationsReceived,admissionsAccepted}` | Event counts for the day |
| `timesheets.approvals` | Approval events for the day (not payroll completion — see "Timesheet semantics") |
| `activity` | A bounded, ordered list of notable events — see "Activity timeline" |
| `alerts` | Deterministic, rule-based flags only — see "Alerts" |
| `meta.timezoneAssumption` / `activityLimit` / `activityTruncated` | Self-describing, never silent |

Every `DailyMetric` (`{ count, eventIds }`) carries the exact `school_events`
ids behind it — traceable by construction, never a number without a
drill-down path (mission §19).

## Data authority — event-first, no new counting

Every metric is computed from `school_events`, never by re-querying
`student_attendance`/`pointages`/`applications`/`timesheet_approvals`
independently. The one pre-existing, ad-hoc exception found during the
audit — `src/app/dashboard/ecole/page.tsx`'s "Personnel aujourd'hui" card,
which counted `pointages` directly with a JS-local midnight boundary — was
replaced to source from this same contract, removing the one place that
would otherwise show a second, possibly contradictory "today" number on
the same page.

## Attendance semantics

Unchanged from EVENT-01.1: `presentFacts`/`absentFacts`/`lateFacts` count
**final attendance facts per (student, session)**, not unique students. A
student attending two subjects the same day can contribute up to two
facts; a corrected mark contributes exactly one (its final state). Unique
student counts are a different, currently unneeded aggregate — deliberately
not added here (mission §9/§58).

## Staff semantics

`staff.checkedIn`/`staff.checkedOut` are **event counts**, never a
headcount. `staff.currentlyCheckedInCount` is a **derived** state computed
by `get_school_staff_open_shifts`: a teacher has an open shift in the
window if their check-in count exceeds their check-out count — the only
unambiguous thing that pair can express without inventing shift/break
semantics. It is the source of the single V1 alert type,
`staff_checked_in_without_checkout`.

**(DAILY-INTELLIGENCE-01.1)** The UI must never word this as "personnel
actuellement sur place" or any other phrasing implying provable physical
on-site presence — the reducer can only prove an unmatched punch pair,
never actual attendance (a phone left checked in, a missed checkout, a
device issue are all indistinguishable from genuine presence at this
layer). The dashboard's wording is "arrivée(s) sans départ enregistré"
("arrival(s) with no departure recorded") — a precise statement of what
was actually observed, not an inference about where anyone physically is.

## Admission semantics

`applicationsReceived` counts `application.received` events (applications
created today); `admissionsAccepted` counts real `admission.accepted`
transitions today. Neither represents "applications currently in accepted
state" — that would require querying `applications.admission_status`
directly, which this contract deliberately does not do.

## Timesheet semantics

`timesheets.approvals` counts `timesheet.approved` events today —
approvals performed today, nothing about payroll completion, salary
amounts, or CNPS status. No payroll semantics are implied or computed here.

## Activity timeline

A single school day can have thousands of individual attendance marks —
showing them all would turn "activity" into exactly the raw event dump the
mission forbids. `get_school_daily_activity` therefore includes exactly two
kinds of rows, and nothing else:

1. Every `staff.checked_in` / `staff.checked_out` / `application.received`
   / `admission.accepted` / `timesheet.approved` event in the window — these
   are naturally low-volume (one row per real action).
2. An attendance (`student.*`) fact is included **only if it was
   corrected** (its `source_id` — the canonical (student, session) identity
   established by EVENT-01.1 — has more than one event that day), and only
   as its single **final** state, using the exact same tie-break as
   `get_daily_school_proof` (`occurred_at desc, recorded_at desc, id desc`).
   A routine, uncorrected mark never appears in the timeline; it is counted
   in `attendance`, not itemized here.

This was a deliberate decision among the options the mission raised
(§36/§37): the **summary is final-state only**, the **timeline shows
corrections as their final state, marked `wasCorrected: true`**, never a
superseded value presented as current, and full event-level traceability
remains available via `eventIds`/`sourceId` for drill-down. The list is
bounded (`activityLimit`, default 20) and ordered by `occurred_at desc`
with the same deterministic tie-break; `meta.activityTruncated` says
whether more events existed than were returned.

## Alerts

Exactly one deterministic, rule-based alert type exists in V1:
`staff_checked_in_without_checkout`. No arbitrary thresholds
("high absenteeism", "unusual activity", "school performance declining")
were introduced — the mission explicitly forbids inventing one without a
canonical, product-defined rule, and none is deferred as a placeholder;
they are simply not built (mission §12/§13).

## Authorization

`GET /api/intelligence/daily` goes through the same
`requireEstablishmentAccess` used by every other Pro-scoped route
(`src/lib/school/establishmentAccess.ts`), with a new capability,
`"intelligence:view"`, added to the existing union. An owner requesting a
school they do not own gets an explicit `403 ESTABLISHMENT_FORBIDDEN` —
never a silently-zeroed result that could be mistaken for a legitimately
quiet day (mission §55). This reuses an existing, previously-tested
authorization module unchanged; it is not a new, parallel security
boundary. Like every other capability in that module today, this is
Pro-plan-gated — consistent with the existing "Personnel aujourd'hui" /
"Emploi du temps" / "Paie" cards on the same dashboard page, not a new
restriction invented for this feature. A teacher has no read access in V1
(no product surface needs it yet); anonymous access is denied entirely.
The underlying SQL reducers are `security invoker` (never `definer`), so
RLS (`school_events_owner_read`) remains the enforcement backstop even if
the application-layer check were ever bypassed — belt-and-suspenders,
matching EVENT-01's own design.

## Time boundary — "today"

Écoles237 has no per-establishment timezone column (audited, confirmed
absent from `establishments`). Cameroon (Africa/Douala) is a fixed UTC+1
offset year-round, with no DST. This is the **single, explicit, documented**
assumption (`SCHOOL_DAY_TIMEZONE_ASSUMPTION` in `dailyIntelligence.ts`) —
never silently inherited from server or browser local time. A canonical
per-establishment timezone column is deferred until the product expands
beyond a single timezone and genuinely needs one.

**(DAILY-INTELLIGENCE-01.1)** The actual conversion arithmetic lives in
exactly **one** place: the SQL function `school_day_window(p_day)`
(`20260916090000_daily_intelligence_01_activity.sql`), using Postgres's
own tzdata (`p_day::timestamp at time zone 'Africa/Douala'`) rather than
hand-rolled "+01:00" offset arithmetic. Every event-timestamp-based
reducer — `get_school_daily_activity`, `get_school_staff_open_shifts`,
and `get_daily_school_proof` (fixed via a new migration,
`20260917090000_daily_intelligence_01_1_local_day_boundary.sql`, since it
was already merged into integration and could not be edited in place) —
calls this same helper. The original V1 implementation had
`get_daily_school_proof` still classify staff/application/timesheet
events with `occurred_at::date = p_day` (an implicit UTC-session cast),
which could disagree with the Africa/Douala window the rest of Daily
Intelligence used for the same requested date — found and classified P1
by this mission's own audit, fixed by routing everything through
`school_day_window`. Regression-tested at the exact boundary
(22:59:59Z/23:00:00Z either side of a day change) for every affected
category.

**Attendance** is deliberately the one path that does **not** go through
`school_day_window`: a `student_attendance` fact's day is
`lesson_sessions.session_date` — a plain date supplied directly by the
marking device at the moment of the mark. This is already inherently
local to whoever is marking attendance; converting it through a
timezone-aware window would be both unnecessary and wrong. Both paths
refer to the same logical school day; they are simply resolved
differently because they start from different kinds of source data (an
already-local date vs. a UTC instant needing conversion).

`getSchoolDailyIntelligence` accepts an explicit `date` and defaults to
"today" resolved in the same Africa/Douala assumption
(`resolveTodayInSchoolTimezone()`), never the server's or a browser's local
`Date`. Historical dates work identically — there is nothing today-specific
hardcoded in the query path. `isValidCalendarDate()` rejects both
malformed shapes and impossible-but-correctly-shaped dates (`2026-13-40`,
`2026-02-30`) with an explicit `400`, never a silent reinterpretation or
a 500 from a downstream date-parsing failure.

## Privacy

No application private message, timesheet note, student private note,
`photo_path`, storage path, signed URL, token, or document content is
exposed anywhere in this contract — every field is either a count, an
event id, or a static label. Person names are deliberately not resolved
here; enrichment with display names (if a future UI screen needs it) is a
separate, explicit concern for that screen to own, never bundled into the
aggregate contract by default.

## Performance

All aggregation happens server-side, inside Postgres — never "fetch
events, count in the browser." `get_daily_school_proof` and
`get_school_staff_open_shifts` are set-based aggregate queries;
`get_school_daily_activity` unions two narrowly-filtered CTEs and applies
one final `ORDER BY ... LIMIT`. No new index was added — none of the
queries here are more selective than what EVENT-01's existing indexes
(implicit from `school_events`'s primary key and the unique constraint on
`(source_type, source_id, event_type)`) already support at the volumes a
single school-day realistically produces; a real `EXPLAIN ANALYZE`-driven
index addition is deferred until an actual measurement calls for it.

## Localization

No i18n framework exists in this repo (audited, confirmed) — every other
dashboard page uses hardcoded French strings and small static label maps.
`EVENT_TYPE_LABELS` in `dailyIntelligence.ts` follows the exact same
convention; no new localization architecture was introduced.

## Future AI boundary

A future ScorgIA assistant **may** consume `SchoolDailyIntelligence`
exactly as returned by `GET /api/intelligence/daily`. It **may not**:
query `school_events` or any operational table directly, use
`service_role`, bypass `requireEstablishmentAccess`, or receive arbitrary
SQL access "to figure out what it needs." This boundary is deliberate and
exists now, before any AI work begins, precisely so that boundary is never
retrofitted under pressure later.

## Deferred (explicit, not silently missing)

- Class completion/cancellation/uncovered-class signals (no canonical
  write path exists yet — see the EVENT-01 event catalog).
- Incidents, enrollment confirmation, registration payments (same reason).
- Unique-student attendance metrics (distinct from per-session facts).
- Attendance-rate / high-absenteeism alerts, weekly/monthly trend
  analytics — no canonical threshold exists in the product today; inventing
  one was explicitly out of scope (mission §12/§13).
- A persisted `daily_summary`/snapshot table — compute-on-demand only,
  until a real measurement justifies caching.
- Realtime/WebSocket updates, push/email/SMS notifications — normal
  page refresh is sufficient for V1.
- Per-establishment timezone configuration (see "Time boundary" above).
- **Any AI/LLM narrative summary** ("Your day went well...", "It looks
  like..."). Every output here is a number, an id, or a static label.
