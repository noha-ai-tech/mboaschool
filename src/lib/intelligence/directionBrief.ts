// DAILY-INTELLIGENCE-02 — deterministic direction brief.
//
// Deliberately a pure, zero-dependency module (no "@/" imports at all,
// unlike dailyIntelligence.ts which imports the live schoolEvents.ts
// repository) so `buildDirectionBrief` can be unit-tested directly via a
// relative import, without a database and without Next's module
// resolution — the same pattern already used by src/lib/school/heroMode.ts.
//
// This is a deterministic RESHAPING of fields already computed by
// getSchoolDailyIntelligence — never a new query, never a second source of
// truth. It is exposed as the `directionBrief` property of
// SchoolDailyIntelligence (see dailyIntelligence.ts), not a competing
// sibling DTO: every fact it could need already exists on the object it
// lives inside.

export type DailyMetric = { count: number; eventIds: string[] };

export type SchoolDailyAlertType = "staff_checked_in_without_checkout";

export type SchoolDailyAlert = {
  type: SchoolDailyAlertType;
  subjectId: string;
  eventId: string;
};

export type SchoolDirectionBriefKind = "highlight" | "attention";

export type SchoolDirectionBriefItem = {
  id: string;
  kind: SchoolDirectionBriefKind;
  label: string;
  sourceType: string;
  sourceIds: string[];
};

export type SchoolDirectionBriefSource = { type: string; count: number };

export type SchoolDirectionBrief = {
  day: string;
  establishmentId: string;
  // A single, fixed-template sentence — interpolated numbers only, never
  // generated prose (mission §2/§4: this is not AI narrative text).
  headline: string;
  highlights: SchoolDirectionBriefItem[];
  attentionItems: SchoolDirectionBriefItem[];
  sources: SchoolDirectionBriefSource[];
};

function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return count === 1 ? singular : plural;
}

export function buildDirectionBrief(input: {
  establishmentId: string;
  day: string;
  attendance: { presentFacts: DailyMetric; absentFacts: DailyMetric; lateFacts: DailyMetric };
  staff: { checkedIn: DailyMetric; checkedOut: DailyMetric; currentlyCheckedInCount: number };
  admissions: { applicationsReceived: DailyMetric; admissionsAccepted: DailyMetric };
  timesheets: { approvals: DailyMetric };
  alerts: SchoolDailyAlert[];
}): SchoolDirectionBrief {
  const highlights: SchoolDirectionBriefItem[] = [];
  const attentionItems: SchoolDirectionBriefItem[] = [];
  const sources: SchoolDirectionBriefSource[] = [];

  // Highlights — informative, positive/neutral facts (mission §5).
  if (input.admissions.applicationsReceived.count > 0) {
    const n = input.admissions.applicationsReceived.count;
    highlights.push({
      id: "applications_received",
      kind: "highlight",
      label: `${n} nouvelle${pluralize(n, "", "s")} candidature${pluralize(n, "", "s")} reçue${pluralize(n, "", "s")}`,
      sourceType: "application.received",
      sourceIds: input.admissions.applicationsReceived.eventIds,
    });
    sources.push({ type: "application.received", count: n });
  }
  if (input.admissions.admissionsAccepted.count > 0) {
    const n = input.admissions.admissionsAccepted.count;
    highlights.push({
      id: "admissions_accepted",
      kind: "highlight",
      label: `${n} admission${pluralize(n, "", "s")} acceptée${pluralize(n, "", "s")}`,
      sourceType: "admission.accepted",
      sourceIds: input.admissions.admissionsAccepted.eventIds,
    });
    sources.push({ type: "admission.accepted", count: n });
  }
  if (input.timesheets.approvals.count > 0) {
    const n = input.timesheets.approvals.count;
    highlights.push({
      id: "timesheets_approved",
      kind: "highlight",
      label: `${n} feuille${pluralize(n, "", "s")} de temps approuvée${pluralize(n, "", "s")}`,
      sourceType: "timesheet.approved",
      sourceIds: input.timesheets.approvals.eventIds,
    });
    sources.push({ type: "timesheet.approved", count: n });
  }

  // Attention items — facts that may warrant direction's attention
  // (mission §5). A plain presence check (count > 0), never an invented
  // numeric threshold ("more than N is high") — no canonical threshold
  // exists in the product today, so none is fabricated here.
  if (input.attendance.absentFacts.count > 0) {
    const n = input.attendance.absentFacts.count;
    attentionItems.push({
      id: "attendance_absent",
      kind: "attention",
      label: `${n} élève${pluralize(n, "", "s")} absent${pluralize(n, "", "s")}`,
      sourceType: "student.absent",
      sourceIds: input.attendance.absentFacts.eventIds,
    });
    sources.push({ type: "student.absent", count: n });
  }
  if (input.attendance.lateFacts.count > 0) {
    const n = input.attendance.lateFacts.count;
    attentionItems.push({
      id: "attendance_late",
      kind: "attention",
      label: `${n} élève${pluralize(n, "", "s")} en retard`,
      sourceType: "student.late",
      sourceIds: input.attendance.lateFacts.eventIds,
    });
    sources.push({ type: "student.late", count: n });
  }
  if (input.alerts.length > 0) {
    const n = input.alerts.length;
    // Exact required wording (mission §5/§19, DAILY-INTELLIGENCE-01.1
    // §23): never "encore dans l'école" / "actuellement sur place" — the
    // reducer can only prove an unmatched punch pair, never physical
    // presence.
    attentionItems.push({
      id: "staff_open_shifts",
      kind: "attention",
      label: `${n} arrivée${pluralize(n, "", "s")} sans départ enregistré`,
      sourceType: "staff.checked_in",
      sourceIds: input.alerts.map((a) => a.eventId),
    });
    sources.push({ type: "staff_open_shift", count: n });
  }
  // Present facts and raw staff check-in/out counts are informational
  // context, not highlight/attention items on their own — they are still
  // listed in `sources` for provenance/traceability transparency.
  if (input.attendance.presentFacts.count > 0) {
    sources.push({ type: "student.present", count: input.attendance.presentFacts.count });
  }
  if (input.staff.checkedIn.count > 0) {
    sources.push({ type: "staff.checked_in", count: input.staff.checkedIn.count });
  }
  if (input.staff.checkedOut.count > 0) {
    sources.push({ type: "staff.checked_out", count: input.staff.checkedOut.count });
  }

  const totalFacts = highlights.length + attentionItems.length;
  const headline =
    totalFacts === 0
      ? "Aucune activité enregistrée aujourd’hui."
      : attentionItems.length > 0
        ? `${totalFacts} fait${pluralize(totalFacts, "", "s")} enregistré${pluralize(totalFacts, "", "s")} aujourd’hui, dont ${attentionItems.length} nécessitant votre attention.`
        : `${totalFacts} fait${pluralize(totalFacts, "", "s")} enregistré${pluralize(totalFacts, "", "s")} aujourd’hui.`;

  return {
    day: input.day,
    establishmentId: input.establishmentId,
    headline,
    highlights,
    attentionItems,
    sources,
  };
}
