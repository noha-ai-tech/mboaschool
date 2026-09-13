-- DAILY-INTELLIGENCE-01.1 — canonical local-day boundary fix for
-- get_daily_school_proof.
--
-- Root cause (P1, found by this mission's own audit): Daily Intelligence
-- defines "today" using the Africa/Douala assumption (see
-- school_day_window() in 20260916090000_daily_intelligence_01_activity.sql),
-- but get_daily_school_proof — already merged into integration as part of
-- EVENT-01/EVENT-01.1, so it cannot be edited in place; a new migration is
-- required — still classified its staff/application/timesheet metrics
-- with `occurred_at::date = p_day`, an implicit cast in whatever timezone
-- the Postgres session defaults to (UTC on Supabase). The SAME requested
-- logical date could therefore be interpreted under two different day
-- boundaries by two halves of the same SchoolDailyIntelligence result —
-- exactly the "get_daily_school_proof says X, Daily Intelligence says Y"
-- contradiction the mission forbids.
--
-- Fix: `create or replace` the exact same function (signature unchanged,
-- `getDailySchoolProof()` in src/lib/events/schoolEvents.ts needs no
-- changes), replacing `occurred_at::date = p_day` with the same
-- centralized `school_day_window(p_day)` helper every other
-- Daily-Intelligence reducer now uses. Attendance is untouched — it was
-- already correct: a student_attendance fact's day is
-- `lesson_sessions.session_date`, supplied directly by the marking device,
-- never derived from occurred_at, so it needs no timezone conversion at
-- all (see docs/intelligence/daily-intelligence-v1.md). This migration
-- changes nothing else: no new event types, no schema change, no change
-- to emit_school_event or any write path.
create or replace function public.get_daily_school_proof(p_establishment_id uuid, p_day date)
returns table (
  metric text,
  count_value bigint,
  event_ids uuid[]
)
language sql
stable
security invoker
set search_path = public
as $$
  with window_bounds as (
    select * from public.school_day_window(p_day)
  ),
  attendance_events as (
    -- Unchanged from EVENT-01.1: one event retained per ATTENDANCE FACT
    -- (source_id), scoped by lesson_sessions.session_date — already the
    -- canonical local school date, never occurred_at-derived.
    select distinct on (se.source_id)
      se.id, se.event_type, se.source_id, se.occurred_at
    from public.school_events se
    join public.student_attendance sa on sa.id = se.source_id and se.source_type = 'student_attendance'
    join public.lesson_sessions ls on ls.id = sa.session_id
    where se.establishment_id = p_establishment_id
      and se.event_type in ('student.present', 'student.absent', 'student.late')
      and ls.session_date = p_day
    order by se.source_id, se.occurred_at desc, se.recorded_at desc, se.id desc
  ),
  staff_in as (
    select se.id from public.school_events se, window_bounds w
    where se.establishment_id = p_establishment_id and se.event_type = 'staff.checked_in'
      and se.occurred_at >= w.window_from and se.occurred_at < w.window_to
  ),
  staff_out as (
    select se.id from public.school_events se, window_bounds w
    where se.establishment_id = p_establishment_id and se.event_type = 'staff.checked_out'
      and se.occurred_at >= w.window_from and se.occurred_at < w.window_to
  ),
  apps_received as (
    select se.id from public.school_events se, window_bounds w
    where se.establishment_id = p_establishment_id and se.event_type = 'application.received'
      and se.occurred_at >= w.window_from and se.occurred_at < w.window_to
  ),
  timesheets_approved as (
    select se.id from public.school_events se, window_bounds w
    where se.establishment_id = p_establishment_id and se.event_type = 'timesheet.approved'
      and se.occurred_at >= w.window_from and se.occurred_at < w.window_to
  )
  select 'students_present'::text, count(*) filter (where event_type = 'student.present')::bigint, coalesce(array_agg(id) filter (where event_type = 'student.present'), array[]::uuid[]) from attendance_events
  union all
  select 'students_absent'::text, count(*) filter (where event_type = 'student.absent')::bigint, coalesce(array_agg(id) filter (where event_type = 'student.absent'), array[]::uuid[]) from attendance_events
  union all
  select 'students_late'::text, count(*) filter (where event_type = 'student.late')::bigint, coalesce(array_agg(id) filter (where event_type = 'student.late'), array[]::uuid[]) from attendance_events
  union all
  select 'staff_checked_in'::text, count(*)::bigint, coalesce(array_agg(id), array[]::uuid[]) from staff_in
  union all
  select 'staff_checked_out'::text, count(*)::bigint, coalesce(array_agg(id), array[]::uuid[]) from staff_out
  union all
  select 'applications_received'::text, count(*)::bigint, coalesce(array_agg(id), array[]::uuid[]) from apps_received
  union all
  select 'timesheets_approved'::text, count(*)::bigint, coalesce(array_agg(id), array[]::uuid[]) from timesheets_approved;
$$;

-- Grants unchanged from EVENT-01 — same function identity, same policy.
revoke all on function public.get_daily_school_proof(uuid, date) from public, anon, service_role;
grant execute on function public.get_daily_school_proof(uuid, date) to authenticated;
