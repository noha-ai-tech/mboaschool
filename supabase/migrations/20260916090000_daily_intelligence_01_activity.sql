-- DAILY-INTELLIGENCE-01 (+ DAILY-INTELLIGENCE-01.1 local-day fix, applied
-- in place since this migration has never been merged/shipped anywhere) —
-- deterministic daily activity + staff open-shift reducers, built strictly
-- on top of the School Event Engine
-- (20260915090000_event_01_school_event_engine.sql). No AI/LLM, no new
-- event types, no changes to school_events or emit_school_event.
--
-- Purpose: get_daily_school_proof already gives correction-aware,
-- multi-session-correct AGGREGATE counts. It does not give a bounded,
-- ordered list of what actually happened today (mission's "activity
-- timeline"), and it has no notion of "a staff member's shift is still
-- open" (checked in, never checked out). Both are new, narrowly-scoped
-- reducers over the same immutable school_events facts — never a second,
-- contradictory way of counting the same thing.
--
-- Both functions are `security invoker`, exactly like get_daily_school_proof
-- (never definer): RLS (school_events_owner_read) still applies to the
-- calling role, so an owner can only ever see their own establishment's
-- activity, with no manual authorization check needed here — the same
-- belt-and-suspenders design as EVENT-01 (RLS is the enforcement, the
-- application layer's explicit establishmentId check on top is
-- defense-in-depth, not a substitute).

-- ============================================================================
-- 0. CANONICAL SCHOOL-DAY WINDOW (DAILY-INTELLIGENCE-01.1)
--
--    Single, centralized place resolving a logical school date into an
--    exact [from, to) UTC instant window — every event-timestamp-based
--    reducer below calls this, instead of each inventing its own
--    arithmetic. No per-establishment timezone column exists yet
--    (audited, confirmed absent from `establishments`); Écoles237's
--    current operational scope is Cameroon, so the V1 fallback is the
--    fixed IANA zone `Africa/Douala` (UTC+1, no DST). `at time zone`
--    uses Postgres's own tzdata rather than hand-rolled "-1 hour"
--    arithmetic, so this is correct even if the server/session timezone
--    is something else entirely. When a per-establishment timezone field
--    is eventually added, only this one function's body needs to change
--    — every caller stays the same.
--
--    Attendance is deliberately NOT resolved through this window: a
--    student_attendance fact's day is `lesson_sessions.session_date`, a
--    plain date supplied directly by the marking device at the moment of
--    the mark — already inherently local, never a UTC-derived value, so
--    converting it through this window would be both unnecessary and
--    wrong. Both paths (this window, and session_date) refer to the same
--    logical school day; they are just resolved differently because they
--    start from different kinds of source data (a timestamp vs. an
--    already-local date) — see docs/intelligence/daily-intelligence-v1.md.
-- ============================================================================
create or replace function public.school_day_window(p_day date)
returns table (window_from timestamptz, window_to timestamptz)
language sql
immutable
set search_path = public
as $$
  select
    (p_day::timestamp at time zone 'Africa/Douala'),
    ((p_day + 1)::timestamp at time zone 'Africa/Douala');
$$;

revoke all on function public.school_day_window(date) from public, anon, service_role;
grant execute on function public.school_day_window(date) to authenticated;

-- ============================================================================
-- 1. BOUNDED DAILY ACTIVITY — a small, deterministic, chronological list of
--    "what happened", never a raw event dump.
--
--    Two kinds of rows are included, deliberately excluding everything else:
--      a) every staff.checked_in / staff.checked_out / application.received
--         / admission.accepted / timesheet.approved event in the
--         school_day_window(p_day) — these are naturally low-volume (one
--         row per real action), safe to show individually.
--      b) attendance (student.*) facts are EXCLUDED by default — a single
--         school day can have thousands of individual marks, which would
--         turn "activity" into exactly the event dump the mission forbids.
--         The one attendance case that IS surfaced is a genuine correction:
--         a source_id (the canonical (student, session) attendance-fact
--         identity established by EVENT-01.1) with more than one event
--         attached is represented by its single FINAL event, using the
--         exact same tie-break as get_daily_school_proof
--         (occurred_at desc, recorded_at desc, id desc), so the timeline
--         never shows a superseded state as current. Routine, uncorrected
--         marks stay purely in the aggregate counts — that is what those
--         counts are for. Attendance's day boundary is
--         lesson_sessions.session_date, exactly like get_daily_school_proof
--         — never school_day_window (see §0 above for why).
-- ============================================================================
create or replace function public.get_school_daily_activity(
  p_establishment_id uuid,
  p_day date,
  p_limit integer default 20
)
returns table (
  id uuid,
  event_type text,
  occurred_at timestamptz,
  recorded_at timestamptz,
  subject_type text,
  subject_id uuid,
  source_type text,
  source_id uuid,
  was_corrected boolean
)
language sql
stable
security invoker
set search_path = public
as $$
  with window_bounds as (
    select * from public.school_day_window(p_day)
  ),
  notable_events as (
    select se.id, se.event_type, se.occurred_at, se.recorded_at, se.subject_type, se.subject_id, se.source_type, se.source_id, false as was_corrected
    from public.school_events se, window_bounds w
    where se.establishment_id = p_establishment_id
      and se.event_type in ('staff.checked_in', 'staff.checked_out', 'application.received', 'admission.accepted', 'timesheet.approved')
      and se.occurred_at >= w.window_from and se.occurred_at < w.window_to
  ),
  attendance_corrections as (
    -- Only source_ids with more than one event that day (a real correction
    -- happened) are represented, and only by their final state — same
    -- identity and tie-break as EVENT-01.1's get_daily_school_proof. Day
    -- boundary is lesson_sessions.session_date, exactly like
    -- get_daily_school_proof — not school_day_window.
    select distinct on (se.source_id)
      se.id, se.event_type, se.occurred_at, se.recorded_at, se.subject_type, se.subject_id, se.source_type, se.source_id, true as was_corrected
    from public.school_events se
    join public.student_attendance sa on sa.id = se.source_id and se.source_type = 'student_attendance'
    join public.lesson_sessions ls on ls.id = sa.session_id
    where se.establishment_id = p_establishment_id
      and se.event_type in ('student.present', 'student.absent', 'student.late')
      and ls.session_date = p_day
      and exists (
        select 1 from public.school_events se2
        where se2.source_type = se.source_type and se2.source_id = se.source_id and se2.id <> se.id
      )
    order by se.source_id, se.occurred_at desc, se.recorded_at desc, se.id desc
  ),
  combined as (
    select * from notable_events
    union all
    select * from attendance_corrections
  )
  select id, event_type, occurred_at, recorded_at, subject_type, subject_id, source_type, source_id, was_corrected
  from combined
  order by occurred_at desc, recorded_at desc, id desc
  limit greatest(p_limit, 0);
$$;

revoke all on function public.get_school_daily_activity(uuid, date, integer) from public, anon, service_role;
grant execute on function public.get_school_daily_activity(uuid, date, integer) to authenticated;

-- ============================================================================
-- 2. STAFF OPEN SHIFTS — deterministic, rule-based (never a heuristic or an
--    invented threshold): a teacher has an open shift in the
--    school_day_window(p_day) if their staff.checked_in event count
--    exceeds their staff.checked_out event count. This is the exact and
--    only state this event pair can express without ambiguity; it is NOT
--    the same thing as "N staff present now" (a staff.checked_in COUNT is
--    an event count, never a headcount — see
--    docs/intelligence/daily-intelligence-v1.md). Used to derive the
--    single V1 alert type: "staff_checked_in_without_checkout".
-- ============================================================================
create or replace function public.get_school_staff_open_shifts(
  p_establishment_id uuid,
  p_day date
)
returns table (
  subject_id uuid,
  last_checked_in_event_id uuid,
  last_checked_in_at timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  with window_bounds as (
    select * from public.school_day_window(p_day)
  ),
  counts as (
    select subject_id,
      count(*) filter (where event_type = 'staff.checked_in') as in_count,
      count(*) filter (where event_type = 'staff.checked_out') as out_count
    from public.school_events, window_bounds w
    where establishment_id = p_establishment_id
      and event_type in ('staff.checked_in', 'staff.checked_out')
      and occurred_at >= w.window_from and occurred_at < w.window_to
    group by subject_id
  ),
  last_checkin as (
    select distinct on (subject_id) subject_id, id, occurred_at
    from public.school_events, window_bounds w
    where establishment_id = p_establishment_id
      and event_type = 'staff.checked_in'
      and occurred_at >= w.window_from and occurred_at < w.window_to
    order by subject_id, occurred_at desc, recorded_at desc, id desc
  )
  select c.subject_id, lc.id as last_checked_in_event_id, lc.occurred_at as last_checked_in_at
  from counts c
  join last_checkin lc on lc.subject_id = c.subject_id
  where c.in_count > c.out_count;
$$;

revoke all on function public.get_school_staff_open_shifts(uuid, date) from public, anon, service_role;
grant execute on function public.get_school_staff_open_shifts(uuid, date) to authenticated;
