import type { createClient } from "@/lib/supabase/server";
import { getDailySchoolProof, getSchoolEvents, type SchoolEventType } from "@/lib/events/schoolEvents";

// DAILY-INTELLIGENCE-01 — deterministic "what happened in my school today"
// contract, built strictly on the School Event Engine (EVENT-01 +
// EVENT-01.1). No LLM, no prompt, no heuristic narrative: every field here
// is a direct, traceable count or a bounded list of real events. This is
// also the exact, contractual surface a future ScorgIA MUST be built on —
// never arbitrary school_events/operational-table SQL, never service_role
// (mission §41/§42). See docs/intelligence/daily-intelligence-v1.md.

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// Écoles237 has no per-establishment timezone column today (audited,
// confirmed absent from `establishments`). Cameroon (Africa/Douala) is a
// fixed UTC+1 offset year-round, no DST — this is the single, explicit,
// documented place that assumption is made, never silently inherited from
// server/browser local time. A canonical per-establishment timezone column
// is deferred (mission §16/§58) until the product needs one.
const SCHOOL_DAY_UTC_OFFSET = "+01:00";
export const SCHOOL_DAY_TIMEZONE_ASSUMPTION =
  "Africa/Douala (UTC+1, fixe, sans heure d'été) — aucun fuseau horaire par établissement n'existe encore ; voir docs/intelligence/daily-intelligence-v1.md.";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// "Today" resolved in the school's assumed timezone, never the server's or
// browser's local time — deterministic regardless of where this runs.
export function resolveTodayInSchoolTimezone(): string {
  const shifted = new Date(Date.now() + 60 * 60 * 1000);
  return shifted.toISOString().slice(0, 10);
}

function resolveDayWindow(date: string): { from: string; to: string } {
  const from = new Date(`${date}T00:00:00.000${SCHOOL_DAY_UTC_OFFSET}`);
  if (Number.isNaN(from.getTime())) {
    throw new Error(`getSchoolDailyIntelligence: invalid date "${date}", expected YYYY-MM-DD`);
  }
  const to = new Date(from.getTime() + 24 * 60 * 60 * 1000);
  return { from: from.toISOString(), to: to.toISOString() };
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
    // as "N staff present" without this distinction.
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
  if (!DATE_PATTERN.test(date)) {
    throw new Error(`getSchoolDailyIntelligence: invalid date "${date}", expected YYYY-MM-DD`);
  }
  const activityLimit = input.activityLimit ?? 20;
  const { from, to } = resolveDayWindow(date);

  const [proof, admissionAcceptedEvents, activityResult, openShiftResult] = await Promise.all([
    getDailySchoolProof({ supabase: input.supabase, establishmentId: input.establishmentId, day: date }),
    // get_daily_school_proof (EVENT-01, never modified here) does not
    // compute an admission.accepted count — this reuses the existing,
    // already-tested getSchoolEvents repository directly against
    // school_events (still event-first, never the applications table)
    // rather than adding a third SQL function for a single low-volume
    // metric.
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
      p_from: from,
      p_to: to,
      p_limit: activityLimit + 1, // one extra row, purely to detect truncation deterministically
    }),
    input.supabase.rpc("get_school_staff_open_shifts", {
      p_establishment_id: input.establishmentId,
      p_from: from,
      p_to: to,
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
