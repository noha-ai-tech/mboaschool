import assert from "node:assert/strict";
import test from "node:test";
import { buildDirectionBrief } from "../src/lib/intelligence/directionBrief.ts";

// DAILY-INTELLIGENCE-02 — pure unit tests for the deterministic direction
// brief classification/wording rules. buildDirectionBrief has zero I/O and
// zero "@/" imports specifically so it can be tested this way, alongside
// the Postgres-level tests covering the reducers that feed it real data.

const EMPTY_METRIC = { count: 0, eventIds: [] };
const BASE_INPUT = {
  establishmentId: "est-1",
  day: "2026-09-15",
  attendance: { presentFacts: EMPTY_METRIC, absentFacts: EMPTY_METRIC, lateFacts: EMPTY_METRIC },
  staff: { checkedIn: EMPTY_METRIC, checkedOut: EMPTY_METRIC, currentlyCheckedInCount: 0 },
  admissions: { applicationsReceived: EMPTY_METRIC, admissionsAccepted: EMPTY_METRIC },
  timesheets: { approvals: EMPTY_METRIC },
  alerts: [],
};

test("an empty day produces the exact empty headline, no highlights, no attention items", () => {
  const brief = buildDirectionBrief(BASE_INPUT);
  assert.equal(brief.headline, "Aucune activité enregistrée aujourd’hui.");
  assert.deepEqual(brief.highlights, []);
  assert.deepEqual(brief.attentionItems, []);
  assert.deepEqual(brief.sources, []);
  assert.equal(brief.day, "2026-09-15");
  assert.equal(brief.establishmentId, "est-1");
});

test("applications received, admissions accepted, and timesheet approvals are highlights, never attention items", () => {
  const brief = buildDirectionBrief({
    ...BASE_INPUT,
    admissions: {
      applicationsReceived: { count: 3, eventIds: ["a1", "a2", "a3"] },
      admissionsAccepted: { count: 1, eventIds: ["b1"] },
    },
    timesheets: { approvals: { count: 2, eventIds: ["t1", "t2"] } },
  });
  assert.equal(brief.highlights.length, 3);
  assert.equal(brief.attentionItems.length, 0);
  assert.ok(brief.highlights.every((h) => h.kind === "highlight"));
  const byId = Object.fromEntries(brief.highlights.map((h) => [h.id, h]));
  assert.equal(byId.applications_received.label, "3 nouvelles candidatures reçues");
  assert.equal(byId.applications_received.sourceType, "application.received");
  assert.deepEqual(byId.applications_received.sourceIds, ["a1", "a2", "a3"]);
  assert.equal(byId.admissions_accepted.label, "1 admission acceptée");
  assert.equal(byId.timesheets_approved.label, "2 feuilles de temps approuvées");
});

test("absent/late attendance and open shifts are attention items with exact, cautious wording", () => {
  const brief = buildDirectionBrief({
    ...BASE_INPUT,
    attendance: {
      presentFacts: EMPTY_METRIC,
      absentFacts: { count: 12, eventIds: ["ab1"] },
      lateFacts: { count: 1, eventIds: ["la1"] },
    },
    alerts: [
      { type: "staff_checked_in_without_checkout", subjectId: "t1", eventId: "ev1" },
      { type: "staff_checked_in_without_checkout", subjectId: "t2", eventId: "ev2" },
    ],
  });
  assert.equal(brief.highlights.length, 0);
  assert.equal(brief.attentionItems.length, 3);
  assert.ok(brief.attentionItems.every((a) => a.kind === "attention"));
  const byId = Object.fromEntries(brief.attentionItems.map((a) => [a.id, a]));
  assert.equal(byId.attendance_absent.label, "12 élèves absents");
  assert.equal(byId.attendance_late.label, "1 élève en retard");
  assert.equal(byId.staff_open_shifts.label, "2 arrivées sans départ enregistré");
  assert.deepEqual(byId.staff_open_shifts.sourceIds, ["ev1", "ev2"]);
});

test("open-shift wording never implies proven physical presence, singular and plural", () => {
  const one = buildDirectionBrief({
    ...BASE_INPUT,
    alerts: [{ type: "staff_checked_in_without_checkout", subjectId: "t1", eventId: "ev1" }],
  });
  const label = one.attentionItems.find((a) => a.id === "staff_open_shifts").label;
  assert.equal(label, "1 arrivée sans départ enregistré");
  for (const forbidden of ["encore dans l'école", "actuellement sur place", "présent", "sur place"]) {
    assert.ok(!label.toLowerCase().includes(forbidden.toLowerCase()), `must not say "${forbidden}"`);
  }
});

test("headline mentions the attention count only when at least one attention item exists", () => {
  const withAttention = buildDirectionBrief({
    ...BASE_INPUT,
    attendance: { ...BASE_INPUT.attendance, absentFacts: { count: 2, eventIds: ["x", "y"] } },
    admissions: { ...BASE_INPUT.admissions, applicationsReceived: { count: 1, eventIds: ["z"] } },
  });
  assert.equal(withAttention.headline, "2 faits enregistrés aujourd’hui, dont 1 nécessitant votre attention.");

  const noAttention = buildDirectionBrief({
    ...BASE_INPUT,
    admissions: { ...BASE_INPUT.admissions, applicationsReceived: { count: 1, eventIds: ["z"] } },
  });
  assert.equal(noAttention.headline, "1 fait enregistré aujourd’hui.");
});

test("source blending: every non-zero category is listed in sources exactly once, deterministic order, no metric recomputed from raw counts alone", () => {
  const brief = buildDirectionBrief({
    establishmentId: "est-1",
    day: "2026-09-15",
    attendance: {
      presentFacts: { count: 3, eventIds: ["p1", "p2", "p3"] },
      absentFacts: { count: 1, eventIds: ["a1"] },
      lateFacts: { count: 1, eventIds: ["l1"] },
    },
    staff: { checkedIn: { count: 2, eventIds: ["c1", "c2"] }, checkedOut: { count: 1, eventIds: ["c3"] }, currentlyCheckedInCount: 1 },
    admissions: { applicationsReceived: { count: 2, eventIds: ["r1", "r2"] }, admissionsAccepted: { count: 1, eventIds: ["ac1"] } },
    timesheets: { approvals: { count: 2, eventIds: ["ts1", "ts2"] } },
    alerts: [{ type: "staff_checked_in_without_checkout", subjectId: "t1", eventId: "c1" }],
  });
  const sourceTypes = brief.sources.map((s) => s.type);
  assert.deepEqual(sourceTypes, [
    "application.received",
    "admission.accepted",
    "timesheet.approved",
    "student.absent",
    "student.late",
    "staff_open_shift",
    "student.present",
    "staff.checked_in",
    "staff.checked_out",
  ]);
  // exactly one entry per category, no duplicates
  assert.equal(new Set(sourceTypes).size, sourceTypes.length);
  const byType = Object.fromEntries(brief.sources.map((s) => [s.type, s.count]));
  assert.equal(byType["student.present"], 3);
  assert.equal(byType["staff.checked_in"], 2);
  assert.equal(byType["staff.checked_out"], 1);
});

test("privacy: no field on any brief item can ever carry more than static labels, ids, and counts (structural guarantee)", () => {
  const brief = buildDirectionBrief({
    ...BASE_INPUT,
    admissions: { ...BASE_INPUT.admissions, applicationsReceived: { count: 1, eventIds: ["r1"] } },
  });
  for (const item of [...brief.highlights, ...brief.attentionItems]) {
    assert.equal(typeof item.id, "string");
    assert.equal(typeof item.label, "string");
    assert.equal(typeof item.sourceType, "string");
    assert.ok(Array.isArray(item.sourceIds));
    assert.deepEqual(Object.keys(item).sort(), ["id", "kind", "label", "sourceIds", "sourceType"]);
  }
});
