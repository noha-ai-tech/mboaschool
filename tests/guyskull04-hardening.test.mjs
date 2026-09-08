// GUYSKULL-04A — unit tests for the population/rollback hardening, run
// entirely against an in-memory mock PostgREST client. No network call,
// no .env secret value is ever used (guyskull04_client.js's module-scope
// reads of .env.local execute on import, but its serviceRole() export is
// never called here — every table access goes through the mock below).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import populateModule from "../docs/guyskull/scripts/guyskull04_populate.js";
import rollbackModule from "../docs/guyskull/scripts/guyskull04_rollback.js";

const { run: runPopulate, GUYSKULL } = populateModule;
const { run: runRollback } = rollbackModule;

class FakeExit extends Error {
  constructor(code) {
    super(`process.exit(${code})`);
    this.code = code;
  }
}

async function withMockedExit(fn) {
  const originalExit = process.exit;
  process.exit = (code) => { throw new FakeExit(code); };
  try {
    return await fn();
  } finally {
    process.exit = originalExit;
  }
}

function tmpEvidencePath() {
  return path.join(os.tmpdir(), `guyskull04-test-${Math.random().toString(36).slice(2)}.json`);
}

function cleanup(p) {
  try { fs.unlinkSync(p); } catch {}
}

const OTHER_SCHOOL = "11272543-9707-4352-aa4f-f0fad18acb9d"; // a different, real, unrelated id — never the target

function defaultTables() {
  return {
    establishments: [{
      id: GUYSKULL, name: "guyskull", main_category: "garderie", owner_id: "84884e49-3596-451a-b0b6-b8eeda4a9e50",
      description: "hhhhhh", motto: null, history: null, mission: null, vision: null,
      phone: "+237674816227", email: null, website: null, address: null, city: "Douala", neighborhood: "Pk10",
      hero_mode: "carousel", founding_year: null, student_count: null, teacher_count: null,
      is_verified: true, is_claimed: false, verification_status: "verified", official_id: null, source_ministry: null,
    }],
    fees: [{ establishment_id: GUYSKULL, tuition_fee: 29000, is_qualified: false, currency: "FCFA", registration_fee: null }],
    admissions_config: [{ establishment_id: GUYSKULL, is_open: true, levels: [], conditions: null, required_documents: [], period_start: null, period_end: null, additional_info: null }],
    school_fee_schedules: [],
    school_fee_installments: [],
    school_additional_fees: [],
    school_announcements: [],
  };
}

// Minimal in-memory PostgREST stand-in. Parses `table?key=eq.value&...`
// exactly like the real query strings the two scripts build, applies
// simple equality filters, and returns { status, body } shaped the same
// way cmsd2a_lib's real serviceRole() does. No network I/O.
function createFakeSupabase(initialTables) {
  const db = JSON.parse(JSON.stringify(initialTables));

  function parseQuery(pathAndQuery) {
    const [table, qs] = pathAndQuery.split("?");
    const params = new URLSearchParams(qs || "");
    const filters = [];
    for (const [key, val] of params.entries()) {
      if (key === "select" || key === "order") continue;
      const m = val.match(/^eq\.(.*)$/);
      if (m) filters.push({ key, value: m[1] });
    }
    return { table, filters };
  }

  function matches(row, filters) {
    return filters.every(({ key, value }) => String(row[key]) === value);
  }

  async function serviceRole(pathAndQuery, { method = "GET", body = null } = {}) {
    const { table, filters } = parseQuery(pathAndQuery);
    db[table] = db[table] || [];
    if (method === "GET") {
      return { status: 200, body: db[table].filter((r) => matches(r, filters)) };
    }
    if (method === "PATCH") {
      const rows = db[table].filter((r) => matches(r, filters));
      rows.forEach((r) => Object.assign(r, body));
      return { status: 200, body: rows };
    }
    if (method === "POST") {
      const row = { ...body };
      db[table].push(row);
      return { status: 201, body: [row] };
    }
    if (method === "DELETE") {
      db[table] = db[table].filter((r) => !matches(r, filters));
      return { status: 200, body: [] };
    }
    return { status: 500, body: { error: "unsupported method in mock" } };
  }

  return { serviceRole, db };
}

// ==================== HAPPY PATH ====================

test("populate: happy path succeeds, writes 9 rows, records evidence with all ids", async () => {
  const evidencePath = tmpEvidencePath();
  const client = createFakeSupabase(defaultTables());
  try {
    await runPopulate(client, { evidencePath });
    assert.equal(client.db.school_fee_schedules.length, 1);
    assert.equal(client.db.school_fee_installments.length, 3);
    assert.equal(client.db.school_additional_fees.length, 2);
    assert.equal(client.db.school_announcements.length, 3);
    assert.equal(client.db.fees[0].tuition_fee, 29000);
    assert.equal(client.db.fees[0].is_qualified, false);
    assert.equal(client.db.establishments[0].name, "guyskull");
    assert.equal(client.db.establishments[0].main_category, "garderie");
    assert.equal(client.db.establishments[0].motto, "Grandir, apprendre, s'épanouir.");

    const evidence = JSON.parse(fs.readFileSync(evidencePath, "utf8"));
    assert.equal(evidence.target_establishment_id, GUYSKULL);
    assert.equal(evidence.writes_applied.establishments_identity, true);
    assert.equal(evidence.writes_applied.admissions_config_demo, true);
    assert.equal(evidence.writes_applied.fees_is_qualified, true);
    assert.equal(evidence.insert_progress.schedule, true);
    assert.deepEqual(evidence.insert_progress.installments, [true, true, true]);
    assert.deepEqual(evidence.insert_progress.additional_fees, [true, true]);
    assert.deepEqual(evidence.insert_progress.announcements, [true, true, true]);
    assert.equal(evidence.planned_ids.schedule_id, client.db.school_fee_schedules[0].id);
  } finally {
    cleanup(evidencePath);
  }
});

// ==================== A-D: PRE-WRITE INVARIANT ABORTS ====================

test("populate A: aborts before any write when fees.tuition_fee != 29000", async () => {
  const evidencePath = tmpEvidencePath();
  const tables = defaultTables();
  tables.fees[0].tuition_fee = 99999;
  const client = createFakeSupabase(tables);
  try {
    await withMockedExit(() => assert.rejects(() => runPopulate(client, { evidencePath }), FakeExit));
    assert.equal(client.db.school_fee_schedules.length, 0, "no schedule must be inserted when the tuition guard fails");
    assert.equal(client.db.establishments[0].motto, null, "establishments must not be touched when the tuition guard fails");
    assert.equal(fs.existsSync(evidencePath), false, "no evidence file should be written before the guards pass");
  } finally {
    cleanup(evidencePath);
  }
});

test("populate B: aborts before any write when main_category != garderie", async () => {
  const evidencePath = tmpEvidencePath();
  const tables = defaultTables();
  tables.establishments[0].main_category = "college";
  const client = createFakeSupabase(tables);
  try {
    await withMockedExit(() => assert.rejects(() => runPopulate(client, { evidencePath }), FakeExit));
    assert.equal(client.db.school_fee_schedules.length, 0);
    assert.equal(client.db.establishments[0].motto, null);
  } finally {
    cleanup(evidencePath);
  }
});

test("populate C: aborts before any write when name != guyskull", async () => {
  const evidencePath = tmpEvidencePath();
  const tables = defaultTables();
  tables.establishments[0].name = "guyskull-renamed";
  const client = createFakeSupabase(tables);
  try {
    await withMockedExit(() => assert.rejects(() => runPopulate(client, { evidencePath }), FakeExit));
    assert.equal(client.db.school_fee_schedules.length, 0);
  } finally {
    cleanup(evidencePath);
  }
});

test("populate D: aborts before any write when fees.is_qualified baseline != false", async () => {
  const evidencePath = tmpEvidencePath();
  const tables = defaultTables();
  tables.fees[0].is_qualified = true;
  const client = createFakeSupabase(tables);
  try {
    await withMockedExit(() => assert.rejects(() => runPopulate(client, { evidencePath }), FakeExit));
    assert.equal(client.db.school_fee_schedules.length, 0);
    assert.equal(client.db.fees[0].is_qualified, true, "must not silently coerce an unexpected baseline back to false");
  } finally {
    cleanup(evidencePath);
  }
});

// ==================== E: SECOND-RUN / IDEMPOTENCE ====================

test("populate E: aborts with GUYSKULL_04_ALREADY_POPULATED when the demo schedule already exists", async () => {
  const evidencePath = tmpEvidencePath();
  const tables = defaultTables();
  tables.school_fee_schedules.push({ id: "existing-id", establishment_id: GUYSKULL, academic_year: "2026-2027", level_label: "Programme découverte" });
  const client = createFakeSupabase(tables);
  const originalError = console.error;
  let loggedCode = null;
  console.error = (...args) => { const s = args.join(" "); if (s.includes("GUYSKULL_04_ALREADY_POPULATED")) loggedCode = "GUYSKULL_04_ALREADY_POPULATED"; };
  try {
    await withMockedExit(() => assert.rejects(() => runPopulate(client, { evidencePath }), FakeExit));
    assert.equal(loggedCode, "GUYSKULL_04_ALREADY_POPULATED");
    assert.equal(client.db.school_fee_schedules.length, 1, "must not duplicate — still exactly the one pre-existing row");
  } finally {
    console.error = originalError;
    cleanup(evidencePath);
  }
});

test("populate: target establishment id is fixed — a substituted school id is never operated on", async () => {
  const evidencePath = tmpEvidencePath();
  const tables = defaultTables();
  tables.establishments[0].id = OTHER_SCHOOL; // GUYSKULL's row "moved" — the module's hardcoded GUYSKULL id now matches nothing
  const client = createFakeSupabase(tables);
  try {
    await withMockedExit(() => assert.rejects(() => runPopulate(client, { evidencePath }), FakeExit));
    assert.equal(client.db.establishments[0].motto, null, "the other school's row must never be written to");
  } finally {
    cleanup(evidencePath);
  }
});

// ==================== F-H: ROLLBACK EXACTNESS ====================

async function populateThenReturnEvidence(evidencePath, tables) {
  const client = createFakeSupabase(tables);
  await runPopulate(client, { evidencePath });
  return client;
}

test("rollback F: deletes exactly the recorded ids and none other (cross-school row untouched)", async () => {
  const evidencePath = tmpEvidencePath();
  try {
    const client = await populateThenReturnEvidence(evidencePath, defaultTables());
    // Seed an unrelated row for a different establishment in the same tables.
    client.db.school_fee_schedules.push({ id: "foreign-schedule", establishment_id: OTHER_SCHOOL, academic_year: "2026-2027", level_label: "Autre école" });
    client.db.school_announcements.push({ id: "foreign-event", establishment_id: OTHER_SCHOOL, title: "Événement d'une autre école" });

    await runRollback(client, { evidencePath });

    assert.equal(client.db.school_fee_schedules.length, 1, "only the foreign row should remain");
    assert.equal(client.db.school_fee_schedules[0].id, "foreign-schedule");
    assert.equal(client.db.school_fee_installments.length, 0);
    assert.equal(client.db.school_additional_fees.length, 0);
    assert.equal(client.db.school_announcements.length, 1, "only the foreign event should remain");
    assert.equal(client.db.school_announcements[0].id, "foreign-event");
  } finally {
    cleanup(evidencePath);
  }
});

test("rollback G: restores establishments/admissions_config to exact null baseline", async () => {
  const evidencePath = tmpEvidencePath();
  try {
    const client = await populateThenReturnEvidence(evidencePath, defaultTables());
    assert.equal(client.db.establishments[0].motto, "Grandir, apprendre, s'épanouir.", "sanity: populate did write demo content");

    await runRollback(client, { evidencePath });

    const est = client.db.establishments[0];
    assert.equal(est.description, "hhhhhh");
    assert.equal(est.motto, null);
    assert.equal(est.history, null);
    assert.equal(est.mission, null);
    assert.equal(est.vision, null);
    const adm = client.db.admissions_config[0];
    assert.deepEqual(adm.levels, []);
    assert.deepEqual(adm.required_documents, []);
    assert.equal(adm.additional_info, null);
    assert.equal(client.db.fees[0].is_qualified, false);
  } finally {
    cleanup(evidencePath);
  }
});

test("rollback H: fees.tuition_fee is never modified across a full populate+rollback cycle", async () => {
  const evidencePath = tmpEvidencePath();
  try {
    const client = await populateThenReturnEvidence(evidencePath, defaultTables());
    assert.equal(client.db.fees[0].tuition_fee, 29000, "unchanged immediately after populate");

    await runRollback(client, { evidencePath });

    assert.equal(client.db.fees[0].tuition_fee, 29000, "unchanged after rollback");
    assert.equal(client.db.establishments[0].name, "guyskull");
    assert.equal(client.db.establishments[0].main_category, "garderie");
    assert.equal(client.db.establishments[0].owner_id, "84884e49-3596-451a-b0b6-b8eeda4a9e50");
  } finally {
    cleanup(evidencePath);
  }
});

// ==================== I: CROSS-SCHOOL PROTECTION ON ROLLBACK ====================

test("rollback I: refuses to run when the evidence file targets a different establishment id", async () => {
  const evidencePath = tmpEvidencePath();
  try {
    const client = await populateThenReturnEvidence(evidencePath, defaultTables());
    const evidence = JSON.parse(fs.readFileSync(evidencePath, "utf8"));
    evidence.target_establishment_id = OTHER_SCHOOL;
    fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2), "utf8");

    const scheduleCountBefore = client.db.school_fee_schedules.length;
    await withMockedExit(() => assert.rejects(() => runRollback(client, { evidencePath }), FakeExit));
    assert.equal(client.db.school_fee_schedules.length, scheduleCountBefore, "no delete must occur when the target id doesn't match");
    assert.equal(client.db.establishments[0].motto, "Grandir, apprendre, s'épanouir.", "no restore must occur either");
  } finally {
    cleanup(evidencePath);
  }
});

test("rollback: refuses to run when no evidence file exists", async () => {
  const evidencePath = tmpEvidencePath(); // never written
  const client = createFakeSupabase(defaultTables());
  await withMockedExit(() => assert.rejects(() => runRollback(client, { evidencePath }), FakeExit));
});
