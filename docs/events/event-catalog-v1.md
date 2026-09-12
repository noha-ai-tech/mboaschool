# School Event Engine — Event Catalog V1 (EVENT-01)

Status: **implemented, forward-only, no AI/LLM involved.**

## Architecture

```
Operational Data (canonical write paths already in production use)
  → school_events (this document)
  → [future: Daily Intelligence]
  → [future: AI Gateway]
  → [future: role-scoped assistant]
```

EVENT-01 builds only the first arrow. No summarization, no chatbot, no
arbitrary data access is implemented or planned here.

A **School Event** represents a fact accepted by the server and relevant to
understanding an establishment's activity. It is created **only after** the
corresponding operational write has been accepted — never from a queued
offline mutation, never from a rejected or conflicting attempt.

## Why not reuse an existing table

- `public.admissions_history` — a real precedent for the *pattern* (an
  `AFTER INSERT`/`AFTER UPDATE` trigger, `SECURITY DEFINER`), but scoped to
  one domain only (admission status transitions), with no
  `establishment_id`, no `event_type` taxonomy, no actor/subject
  separation, no metadata. Not a School Event Engine.
- `public.platform_audit_log` — structurally generic, but read-restricted
  to `platform_admin` for platform-level actions. Wrong security boundary
  for establishment-scoped operational events.
- `public.sync_mutations` — the offline replay-safety ledger. Records
  *every* attempt, including `rejected`/`conflict` ones, has no
  `occurred_at` distinct from `applied_at`, and is not the semantic layer
  this engine needs. A school event is a strict subset of its `applied`
  rows, never the reverse.

None of the above were extended or repurposed. `school_events` is a new,
single, canonical table.

## Canonical event contract

| Field | Purpose |
|---|---|
| `id` | Event identity |
| `event_type` | One of the fixed catalog below — validated server-side against an allow-list, never an arbitrary string |
| `establishment_id` | Tenant boundary — always derived from the canonical source row, never trusted from a client |
| `occurred_at` | The authoritative business moment of the fact (§ below) |
| `recorded_at` | When this row was durably written — always `now()` server default |
| `actor_user_id` | Who caused/recorded the fact (nullable — e.g. an anonymous admission submission) |
| `subject_type` / `subject_id` | The business entity the fact is about |
| `source_type` / `source_id` | Pointer to the exact canonical row this event was derived from — traceability, never a copy |
| `metadata` | Minimal, justified-per-field only |
| `schema_version` | `1` for every V1 event, so future consumers can version safely |

`occurred_at` vs `recorded_at` is enforced structurally, not by convention:
for `staff.*` it is always `pointages.horodatage` (the server-computed
arrival/departure time), **never** `device_occurred_at`, which only ever
appears inside `metadata` when relevant (an anomaly flag). For `student.*`
it is the exact `updated_at` written to `student_attendance` in the same
transaction as the event (that table has no separate device-reported
timestamp today).

## Idempotency

`unique (source_type, source_id, event_type)`. A retried mutation (same
`mutation_id`, replay-safe via the existing `sync_mutations` ledger) never
even reaches `emit_school_event` a second time for the same logical fact —
the RPC's own replay short-circuit returns the cached result first. As a
second, independent layer, `emit_school_event` itself absorbs an exact
duplicate silently (`ON CONFLICT ... DO NOTHING`, returns `null`) rather
than raising — a duplicate emission attempt must never fail the
operational transaction it rides inside.

A **correction** (e.g. `student.absent` → `student.present` for the same
underlying row) is a *different* `event_type` for the *same* `source_id` —
explicitly allowed, producing a second, distinct event. See "Correction
semantics" below for how a reader is expected to interpret this.

## Write architecture (per domain, chosen from the real repo, not assumed)

| Domain | Mechanism | Why |
|---|---|---|
| Attendance | Embedded in `sync_apply_attendance_mark` (`CREATE OR REPLACE`, same transaction) | Already the sole write path (`SECURITY DEFINER` RPC); atomic by construction |
| Staff punch | Embedded in `sync_apply_staff_punch` (`CREATE OR REPLACE`, same transaction) | Same reasoning |
| Timesheet approval | `AFTER INSERT` trigger on `timesheet_approvals` | No central RPC exists for this write (direct RLS-scoped insert by the owner) — trigger matches the `admissions_history` precedent |
| Application received / Admission accepted | `AFTER INSERT` / `AFTER UPDATE OF admission_status` triggers on `applications` | Same reasoning; added *alongside*, never replacing, the existing `admissions_history` triggers |

All four paths call the same `emit_school_event(...)` function, which:
- validates `event_type` against a fixed allow-list (`raise exception` on
  anything else),
- requires `establishment_id`/`occurred_at`/`subject_*`/`source_*`,
- is `SECURITY DEFINER`, `set search_path = public`,
- has **zero** `EXECUTE` grant to `anon`, `authenticated`, `service_role`,
  or `PUBLIC` — only reachable from other `SECURITY DEFINER` functions and
  triggers, never directly from a browser session under any role.

**Trigger safety**: `applications.establishment_id` is nullable at the
schema level (a pre-existing, unrelated fact — the one real write path,
`src/app/preinscription/page.tsx`, already requires it client-side before
submission). Both application triggers explicitly skip emission (never
raise) when `establishment_id is null`, so a hypothetical row without one
can never cause the event trigger to abort the application/admission
write itself. Verified with a dedicated test.

## Event Catalog V1

| Event type | Source table | Source transition | Subject | Actor | `occurred_at` authority | Metadata |
|---|---|---|---|---|---|---|
| `student.present` / `student.absent` / `student.late` | `student_attendance` | Accepted upsert via `sync_apply_attendance_mark` | `student` | the marking teacher | `student_attendance.updated_at` (never a device time — none exists on this table) | none |
| `staff.checked_in` | `pointages` | Accepted `arrivee` insert via `sync_apply_staff_punch` (mobile self-service) | `enseignant` | the checking-in teacher | `pointages.horodatage` (server) | `{ anomaly }` only if flagged |
| `staff.checked_out` | `pointages` | Accepted `depart` insert via `sync_apply_staff_punch` | `enseignant` | the checking-out teacher | `pointages.horodatage` (server) | `{ anomaly }` only if flagged |
| `timesheet.approved` | `timesheet_approvals` | Any insert (original or superseding) | `enseignant` | `approved_by` (the owner) | `timesheet_approvals.approved_at` | `{ approved_minutes, period_start, period_end }` — justified: this is exactly the number the event claims happened, needed to interpret it without a join |
| `application.received` | `applications` | Insert | `application` | `null` (public submissions have no authenticated actor) | `applications.created_at` | none |
| `admission.accepted` | `applications` | `admission_status` transitions to `'accepted'` | `application` | `auth.uid()` at transition time (the reviewing owner) | transition time (`now()` in the trigger) | none |

## Deferred events (explicit, with the evidence)

| Event | Reason |
|---|---|
| `class.scheduled` | `emplois_du_temps` is a recurring weekly template, never a dated occurrence — there is nothing to "schedule" as a one-time fact. |
| `class.started` / `class.completed` | `lesson_sessions.status` is defined with `'ouverte'`/`'terminee'` but **grepped exhaustively across the full migration history and application code: nothing ever sets it to `'terminee'`**. No canonical signal exists today. |
| `class.cancelled` / `class.uncovered` | Same table, same absence of any writer. No domain evidence. |
| `incident.created` / `incident.updated` | No `incidents` table exists anywhere in the schema. Domain absent. |
| `enrollment.confirmed` | No code path was found that creates a `students` row from an accepted `applications` row — admissions and the roster are entirely disconnected today (confirmed by grep). Inventing this event would fabricate a transition that doesn't exist. |
| `registration_payment.confirmed` | `public.payments` (student registration payments) exists in `supabase/schema.sql` but has **zero** application code reading or writing it (`grep -rn "from(\"payments\")" src/` → no results). `public.platform_payments` is unrelated SaaS billing for the platform's own establishments, not a student registration payment. Dead table, no write path — deferred for that precise reason, not "no table exists." |
| `timesheet.submitted` | The current model has the owner approve directly; there is no teacher-initiated "submit for approval" step distinct from a correction request. |
| `timesheet.disputed` | `timesheet_approvals.status` reserves `'disputed'` in its `CHECK` constraint, but no write path anywhere ever sets it. |

## Correction semantics (student attendance)

Events are **immutable and additive**, never rewritten. A correction
(teacher changes a student's status) produces a brand-new event with the
new `event_type`, sharing the same `source_id` (the `student_attendance`
row is upserted in place). A naive `count(*) group by event_type` would
therefore be wrong — it would count both the original and the corrected
mark.

The correct read is a **reducer**: for a given `(session, student)` pair,
take only the event with the latest `occurred_at`. `get_daily_school_proof`
implements exactly this via `DISTINCT ON (subject_id) ... ORDER BY
occurred_at DESC` scoped to the sessions of the requested day, before
counting by final `event_type`. Verified with a dedicated test:
`present` → `absent` correction yields `students_present = 0`,
`students_absent = 1` — never `1` and `1`.

## Privacy minimization

Metadata is deliberately tiny and enumerated above field-by-field. Never
included, by construction (verified with a sentinel-scan test across every
implemented event type): private notes, message/chat bodies, document
contents, passwords/tokens, signed URLs, storage paths, or any PII beyond
the UUIDs already required for traceability.

## Read model (V1)

- **Owner**: `SELECT` on `school_events` for establishments they own
  (`school_events_owner_read`).
- **Teacher**: no read access. No current product surface needs it; adding
  a policy without a real consumer would be speculative scope.
- **Anonymous**: none.
- **No client role** — owner included — has any `INSERT`/`UPDATE`/`DELETE`
  policy on `school_events`. The table is written exclusively by
  `emit_school_event()` and the triggers above, all `SECURITY DEFINER`,
  none reachable directly from a browser session.

Server-side access is exposed only via `src/lib/events/schoolEvents.ts`
(`getSchoolEvents`, `getDailySchoolProof`) — both use the caller's own
Supabase session client, never `service_role`, and never construct
unscoped SQL. This is the same surface a future AI Gateway must be built
on top of, never a bypass of it.

## Offline rule

A queued/pending offline mutation is **not** a School Event. Only once
`sync_apply_attendance_mark` / `sync_apply_staff_punch` return `applied`
(inside the same transaction as the operational write) does an event get
created. A `rejected` or `conflict` result never emits anything. The
existing OFFLINE-01.3 session-isolation protections
(`syncEngine.ts`/`syncIdentity.ts`/`outbox.ts`, `expectedUserId` binding in
`/api/sync/push`) are entirely untouched by this migration (verified
zero-diff) — a stale mutation resurfacing under a different session still
cannot reach the server-side RPC under the wrong actor, so it still cannot
produce an event under the wrong establishment or teacher.

## Backfill

**None.** Events start from the moment this migration is applied forward.
No historical `pointages`/`student_attendance`/`applications`/
`timesheet_approvals` rows are backfilled into `school_events`. An
incorrect backfill would be worse than a gap in history.

## Retention

Deferred. No deletion policy is implemented. Operational events may carry
audit value; a retention policy is a decision for a later, dedicated
mission.

## Versioning

`schema_version` (currently `1` on every row) exists so a future consumer
can detect and handle a shape change without guessing. No message broker,
no schema registry — Postgres is sufficient for this scale.
