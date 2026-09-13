import type { createClient } from "@/lib/supabase/server";
import { getDailySchoolProof, getSchoolEvents, type SchoolEventType } from "@/lib/events/schoolEvents";

// DAILY-INTELLIGENCE-01 (+ DAILY-INTELLIGENCE-01.1 local-day fix) —
// deterministic "what happened in my school today" contract, built
// strictly on the School Event Engine (EVENT-01 + EVENT-01.1). No LLM, no
// prompt, no heuristic narrative: every field here is a direct, traceable
// count or a bounded list of real events. This is also the exact,
// contractual surface a future ScorgIA MUST be built on — never arbitrary
// school_events/operational-table SQL, never service_role (mission
// §41/§42). See docs/intelligence/daily-intelligence-v1.md.

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// Écoles237 has no per-establishment timezone column today (audited,
// confirmed absent from `establishments`). Cameroon (Africa/Douala) is a
// fixed UTC+1 offset year-round, no DST — this is the single, explicit,
// documented place that assumption is NAMED, though the actual conversion
// arithmetic lives in exactly one place, the SQL function
// `school_day_window(p_day)`
// (20260916090000_daily_intelligence_01_activity.sql) — never duplicated
// here or anywhere else (DAILY-INTELLIGENCE-01.1: the previous version of
// this file computed its own "+01:00" window in TypeScript, which is
// exactly the "scattered arithmetic" the mission's own local-day audit
// flagged; every reducer, including this one, now asks Postgres for the
// same canonical window instead). A canonical per-establishment timezone
// column is deferred (mission §12/§58) until the product needs one — only
// `school_day_window`'s body would need to change then.
export const SCHOOL_DAY_TIMEZONE_ASSUMPTION =
  "Africa/Douala (UTC+1, fixe, sans heure d'été) — aucun fuseau horaire par établissement n'existe encore ; voir docs/intelligence/daily-intelligence-v1.md.";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class InvalidSchoolDateError extends Error {
  constructor(date: string) {
    super(`Invalid date "${date}", expected an existing calendar date in YYYY-MM-DD format`);
    this.name = "InvalidSchoolDateError";
  }
}

// A regex only checks shape ("2026-13-40" matches \d{4}-\d{2}-\d{2}" but
// month 13 / day 40 do not exist). Round-tripping through Date.UTC and
// checking the components survive unchanged rejects any impossible
// calendar date (Feb 30, month 13, ...) while correctly accepting every
// real one, leap years included — never a silent reinterpretation
// (mission §13).
export function isValidCalendarDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const asUtc = new Date(Date.UTC(year, month - 1, day));
  return asUtc.getUTCFullYear() === year && asUtc.getUTCMonth() === month - 1 && asUtc.getUTCDate() === day;
}

// "Today" resolved in the school's assumed timezone, never the server's or
// browser's local time — deterministic regardless of where this runs.
// Cameroon has no DST, so a fixed +1h shift correctly identifies which
// calendar date it is in Africa/Douala right now; this is only ever used
// to pick the `p_day` string handed to school_day_window, never to
// compute the window itself.
export function resolveTodayInSchoolTimezone(): string {
  const shifted = new Date(Date.now() + 60 * 60 * 1000);
  return shifted.toISOString().slice(0, 10);
}

export type DailyMetric = { count: number; eventIds: string[] };

const EMPTY_METRIC: DailyMetric = { count: 0, eventIds: [] };

export type SchoolDailyActivityItem = {
  id: string;
  eventType: SchoolEventType;
  label: string;
  occurredAt: string;
  subjectType: string;
  subjectId: string;
  sourceType: string;
  sourceId: string;
  // True only for an attendance fact that was corrected (more than one
  // event shares its source_id) — the item shown is always the FINAL
  // state, never a superseded one (mission §36, option A, decided
  // explicitly). Routine, uncorrected attendance marks never appear here;
  // they are counted in `attendance`, not itemized in the timeline
  // (mission §10/§11 — never dump hundreds of individual marks).
  wasCorrected: boolean;
};

export type SchoolDailyAlertType = "staff_checked_in_without_checkout";

export type SchoolDailyAlert = {
  type: SchoolDailyAlertType;
  subjectId: string;
  eventId: string;
};

export type SchoolDailyIntelligence = {
  establishmentId: string;
  date: string; // 'YYYY-MM-DD', resolved school day
  generatedAt: string; // server timestamp when this result was computed — never confused with any event's occurred_at
  attendance: {
    presentFacts: DailyMetric;
    absentFacts: DailyMetric;
    lateFacts: DailyMetric;
  };
  staff: {
    checkedIn: DailyMetric;
    checkedOut: DailyMetric;
    // Derived, NOT a raw event count (mission §22/§23): the number of staff
    // whose check-in count exceeds their check-out count in the window —
    // i.e., an unclosed shift as of the most recent punch. Never presented
    // as "N staff present" without this distinction; the UI label must say
    // "shift(s) still open," never "personnel actuellement sur place" —
    // this cannot prove physical on-site presence, only an unmatched punch
    // pair (mission §23, DAILY-INTELLIGENCE-01.1).
    currentlyCheckedInCount: number;
  };
  admissions: {
    applicationsReceived: DailyMetric;
    admissionsAccepted: DailyMetric;
  };
  timesheets: {
    approvals: DailyMetric;
  };
  activity: SchoolDailyActivityItem[];
  alerts: SchoolDailyAlert[];
  meta: {
    timezoneAssumption: string;
    activityLimit: number;
    activityTruncated: boolean;
  };
};

const EVENT_TYPE_LABELS: Record<SchoolEventType, string> = {
  "student.present": "Présence enregistrée",
  "student.absent": "Absence enregistrée",
  "student.late": "Retard enregistré",
  "staff.checked_in": "Arrivée pointée",
  "staff.checked_out": "Départ pointé",
  "timesheet.approved": "Feuille de temps approuvée",
  "application.received": "Nouvelle demande reçue",
  "admission.accepted": "Admission acceptée",
};

type ActivityRow = {
  id: string;
  event_type: SchoolEventType;
  occurred_at: string;
  recorded_at: string;
  subject_type: string;
  subject_id: string;
  source_type: string;
  source_id: string;
  was_corrected: boolean;
};

type OpenShiftRow = {
  subject_id: string;
  last_checked_in_event_id: string;
  last_checked_in_at: string;
};

type SchoolDayWindowRow = { window_from: string; window_to: string };

// Canonical, tenant-safe, correction-aware, multi-session-correct,
// traceable daily projection over school_events. Authorization is the
// caller's responsibility (see src/lib/school/establishmentAccess.ts,
// capability "intelligence:view") — this function does not re-derive it,
// matching the existing schoolEvents.ts convention: pass an
// already-scoped, already-authenticated server client, RLS is the
// enforcement backstop, never a silent bypass.
export async function getSchoolDailyIntelligence(input: {
  supabase: SupabaseServerClient;
  establishmentId: string;
  date?: string;
  activityLimit?: number;
}): Promise<SchoolDailyIntelligence> {
  const date = input.date ?? resolveTodayInSchoolTimezone();
  if (!isValidCalendarDate(date)) {
    throw new InvalidSchoolDateError(date);
  }
  const activityLimit = input.activityLimit ?? 20;

  // Ask Postgres for the one canonical window — never recomputed here.
  const windowResult = await input.supabase.rpc("school_day_window", { p_day: date });
  if (windowResult.error) throw new Error(`getSchoolDailyIntelligence: ${windowResult.error.message}`);
  const windowRow = ((windowResult.data ?? []) as SchoolDayWindowRow[])[0];
  if (!windowRow) throw new Error(`getSchoolDailyIntelligence: school_day_window returned no row for "${date}"`);
  const { window_from: from, window_to: to } = windowRow;

  const [proof, admissionAcceptedEvents, activityResult, openShiftResult] = await Promise.all([
    getDailySchoolProof({ supabase: input.supabase, establishmentId: input.establishmentId, day: date }),
    // get_daily_school_proof does not compute an admission.accepted count
    // — this reuses the existing, already-tested getSchoolEvents
    // repository directly against school_events (still event-first, never
    // the applications table) rather than adding a fourth SQL function
    // for a single low-volume metric. It uses the exact same canonical
    // window fetched above, never a second computation of it.
    getSchoolEvents({
      supabase: input.supabase,
      establishmentId: input.establishmentId,
      from,
      to,
      types: ["admission.accepted"],
      limit: 1000,
    }),
    input.supabase.rpc("get_school_daily_activity", {
      p_establishment_id: input.establishmentId,
      p_day: date,
      p_limit: activityLimit + 1, // one extra row, purely to detect truncation deterministically
    }),
    input.supabase.rpc("get_school_staff_open_shifts", {
      p_establishment_id: input.establishmentId,
      p_day: date,
    }),
  ]);

  if (activityResult.error) throw new Error(`getSchoolDailyIntelligence: ${activityResult.error.message}`);
  if (openShiftResult.error) throw new Error(`getSchoolDailyIntelligence: ${openShiftResult.error.message}`);

  const rawActivity = (activityResult.data ?? []) as ActivityRow[];
  const activityTruncated = rawActivity.length > activityLimit;
  const activity: SchoolDailyActivityItem[] = rawActivity.slice(0, activityLimit).map((row) => ({
    id: row.id,
    eventType: row.event_type,
    label: EVENT_TYPE_LABELS[row.event_type] ?? row.event_type,
    occurredAt: row.occurred_at,
    subjectType: row.subject_type,
    subjectId: row.subject_id,
    sourceType: row.source_type,
    sourceId: row.source_id,
    wasCorrected: row.was_corrected,
  }));

  const openShifts = (openShiftResult.data ?? []) as OpenShiftRow[];
  const alerts: SchoolDailyAlert[] = openShifts.map((row) => ({
    type: "staff_checked_in_without_checkout",
    subjectId: row.subject_id,
    eventId: row.last_checked_in_event_id,
  }));

  return {
    establishmentId: input.establishmentId,
    date,
    generatedAt: new Date().toISOString(),
    attendance: {
      presentFacts: proof.students_present ?? EMPTY_METRIC,
      absentFacts: proof.students_absent ?? EMPTY_METRIC,
      lateFacts: proof.students_late ?? EMPTY_METRIC,
    },
    staff: {
      checkedIn: proof.staff_checked_in ?? EMPTY_METRIC,
      checkedOut: proof.staff_checked_out ?? EMPTY_METRIC,
      currentlyCheckedInCount: openShifts.length,
    },
    admissions: {
      applicationsReceived: proof.applications_received ?? EMPTY_METRIC,
      admissionsAccepted: {
        count: admissionAcceptedEvents.length,
        eventIds: admissionAcceptedEvents.map((e) => e.id),
      },
    },
    timesheets: {
      approvals: proof.timesheets_approved ?? EMPTY_METRIC,
    },
    activity,
    alerts,
    meta: {
      timezoneAssumption: SCHOOL_DAY_TIMEZONE_ASSUMPTION,
      activityLimit,
      activityTruncated,
    },
  };
}
