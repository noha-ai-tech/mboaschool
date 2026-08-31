// GUYSKULL-04A — companion rollback for guyskull04_populate.js.
// Requires the local-only evidence file that script writes before its
// first write and updates after every successful step. Deletes only the
// exact ids that evidence file recorded as actually inserted, and restores
// only the exact fields that evidence file recorded as actually written —
// nothing here is inferred or broadly matched.
const fs = require("fs");
const path = require("path");
const { serviceRole } = require("./guyskull04_client");

const GUYSKULL = "a4cc4966-0d85-4c63-9c24-0538b8d5133b";
const EXPECTED_NAME = "guyskull";
const EXPECTED_CATEGORY = "garderie";
const EXPECTED_TUITION_FEE = 29000;
const EVIDENCE_PATH = path.join(__dirname, "guyskull04-runtime-baseline.local.json");

function fail(code, message, extra) {
  console.error(`\nROLLBACK ABORT [${code}]: ${message}`);
  if (extra !== undefined) console.error(JSON.stringify(extra, null, 2));
  process.exit(1);
}

function loadEvidence(evidencePath) {
  if (!fs.existsSync(evidencePath)) {
    fail("GUYSKULL_04_ROLLBACK_NO_EVIDENCE", "No evidence file found — nothing to roll back, or it was already cleaned up.", { evidencePath });
  }
  let evidence;
  try {
    evidence = JSON.parse(fs.readFileSync(evidencePath, "utf8"));
  } catch (e) {
    fail("GUYSKULL_04_ROLLBACK_EVIDENCE_CORRUPT", "Evidence file is not valid JSON — refusing to guess at rollback state.", { error: e.message });
  }
  return evidence;
}

async function run(client, { evidencePath = EVIDENCE_PATH } = {}) {
  const evidence = loadEvidence(evidencePath);

  // ==================== HARD PRECONDITIONS ====================
  if (evidence.target_establishment_id !== GUYSKULL) {
    fail("GUYSKULL_04_ROLLBACK_WRONG_TARGET", "Evidence file does not correspond to the Guyskull establishment id — refusing to touch any other school.", {
      evidence_target: evidence.target_establishment_id, expected: GUYSKULL,
    });
  }
  if (evidence.run_marker !== "GUYSKULL_04_DEMO_V1") {
    fail("GUYSKULL_04_ROLLBACK_UNKNOWN_MARKER", "Evidence file run_marker does not match the expected GUYSKULL-04 marker.", { found: evidence.run_marker });
  }
  if (!evidence.baseline || !evidence.planned_ids || !evidence.insert_progress || !evidence.writes_applied) {
    fail("GUYSKULL_04_ROLLBACK_EVIDENCE_INCOMPLETE", "Evidence file is missing required sections.");
  }

  const liveEst = (await client.serviceRole(`establishments?select=id,name,main_category&id=eq.${GUYSKULL}`)).body[0];
  if (!liveEst) fail("GUYSKULL_04_ROLLBACK_TARGET_MISSING", "Establishment row not found — refusing to proceed.", { id: GUYSKULL });
  if (liveEst.name !== EXPECTED_NAME || liveEst.main_category !== EXPECTED_CATEGORY) {
    fail("GUYSKULL_04_ROLLBACK_IDENTITY_DRIFTED", "Live name/main_category no longer match the expected Guyskull identity — refusing to proceed blind.", {
      expected: { name: EXPECTED_NAME, main_category: EXPECTED_CATEGORY }, actual: liveEst,
    });
  }
  const liveFees = (await client.serviceRole(`fees?select=tuition_fee&establishment_id=eq.${GUYSKULL}`)).body[0];
  if (!liveFees || liveFees.tuition_fee !== EXPECTED_TUITION_FEE) {
    fail("GUYSKULL_04_ROLLBACK_TUITION_DRIFTED", "Live fees.tuition_fee is not 29000 — refusing to proceed without human review.", { actual: liveFees?.tuition_fee });
  }
  console.log("PRECONDITIONS OK — evidence targets Guyskull, live identity/tuition still match.\n");

  // ==================== DELETE — EXACT IDS ONLY, CHILD ROWS FIRST ====================
  const { planned_ids: ids, insert_progress: progress } = evidence;
  const deleted = { installments: 0, additional_fees: 0, announcements: 0, schedule: 0 };

  for (let i = 0; i < ids.installment_ids.length; i += 1) {
    if (!progress.installments[i]) continue;
    const r = await client.serviceRole(`school_fee_installments?id=eq.${ids.installment_ids[i]}`, { method: "DELETE" });
    if (r.status !== 200 && r.status !== 204) fail("GUYSKULL_04_ROLLBACK_DELETE_FAILED", "Failed to delete an installment.", { id: ids.installment_ids[i], status: r.status, body: r.body });
    deleted.installments += 1;
  }

  for (let i = 0; i < ids.additional_fee_ids.length; i += 1) {
    if (!progress.additional_fees[i]) continue;
    const r = await client.serviceRole(`school_additional_fees?id=eq.${ids.additional_fee_ids[i]}&establishment_id=eq.${GUYSKULL}`, { method: "DELETE" });
    if (r.status !== 200 && r.status !== 204) fail("GUYSKULL_04_ROLLBACK_DELETE_FAILED", "Failed to delete an additional fee.", { id: ids.additional_fee_ids[i], status: r.status, body: r.body });
    deleted.additional_fees += 1;
  }

  for (let i = 0; i < ids.announcement_ids.length; i += 1) {
    if (!progress.announcements[i]) continue;
    const r = await client.serviceRole(`school_announcements?id=eq.${ids.announcement_ids[i]}&establishment_id=eq.${GUYSKULL}`, { method: "DELETE" });
    if (r.status !== 200 && r.status !== 204) fail("GUYSKULL_04_ROLLBACK_DELETE_FAILED", "Failed to delete an event announcement.", { id: ids.announcement_ids[i], status: r.status, body: r.body });
    deleted.announcements += 1;
  }

  if (progress.schedule) {
    const r = await client.serviceRole(`school_fee_schedules?id=eq.${ids.schedule_id}&establishment_id=eq.${GUYSKULL}`, { method: "DELETE" });
    if (r.status !== 200 && r.status !== 204) fail("GUYSKULL_04_ROLLBACK_DELETE_FAILED", "Failed to delete the fee schedule.", { id: ids.schedule_id, status: r.status, body: r.body });
    deleted.schedule += 1;
  }

  console.log(`DELETED — schedule=${deleted.schedule}, installments=${deleted.installments}, additional_fees=${deleted.additional_fees}, announcements=${deleted.announcements}`);

  // ==================== RESTORE — EXACT BASELINE VALUES, ONLY FOR FIELDS ACTUALLY WRITTEN ====================
  if (evidence.writes_applied.establishments_identity) {
    const b = evidence.baseline.establishments;
    const r = await client.serviceRole(`establishments?id=eq.${GUYSKULL}`, {
      method: "PATCH",
      body: { description: b.description, motto: b.motto, history: b.history, mission: b.mission, vision: b.vision },
    });
    if (!(r.status === 200 || r.status === 204)) fail("GUYSKULL_04_ROLLBACK_RESTORE_FAILED", "Failed to restore establishments identity fields.", { status: r.status, body: r.body });
    console.log("RESTORED — establishments.description/motto/history/mission/vision to baseline.");
  }

  if (evidence.writes_applied.admissions_config_demo) {
    const b = evidence.baseline.admissions_config;
    const r = await client.serviceRole(`admissions_config?establishment_id=eq.${GUYSKULL}`, {
      method: "PATCH",
      body: { levels: b.levels, required_documents: b.required_documents, additional_info: b.additional_info },
    });
    if (!(r.status === 200 || r.status === 204)) fail("GUYSKULL_04_ROLLBACK_RESTORE_FAILED", "Failed to restore admissions_config fields.", { status: r.status, body: r.body });
    console.log("RESTORED — admissions_config.levels/required_documents/additional_info to baseline.");
  }

  if (evidence.writes_applied.fees_is_qualified) {
    const b = evidence.baseline.fees;
    const r = await client.serviceRole(`fees?establishment_id=eq.${GUYSKULL}`, { method: "PATCH", body: { is_qualified: b.is_qualified } });
    if (!(r.status === 200 || r.status === 204)) fail("GUYSKULL_04_ROLLBACK_RESTORE_FAILED", "Failed to restore fees.is_qualified.", { status: r.status, body: r.body });
    console.log(`RESTORED — fees.is_qualified to baseline (${b.is_qualified}).`);
  }

  // ==================== POST-ROLLBACK VERIFICATION ====================
  const finalEst = (await client.serviceRole(`establishments?select=name,main_category,owner_id,phone,email,website,address,city,description,motto,history,mission,vision&id=eq.${GUYSKULL}`)).body[0];
  const finalFees = (await client.serviceRole(`fees?select=tuition_fee,is_qualified&establishment_id=eq.${GUYSKULL}`)).body[0];
  const finalSchedules = await client.serviceRole(`school_fee_schedules?select=id&establishment_id=eq.${GUYSKULL}`);
  const finalEvents = await client.serviceRole(`school_announcements?select=id&establishment_id=eq.${GUYSKULL}`);

  const checks = [
    ["name unchanged", finalEst.name === EXPECTED_NAME],
    ["main_category unchanged", finalEst.main_category === EXPECTED_CATEGORY],
    ["owner_id unchanged", finalEst.owner_id === evidence.baseline.establishments.owner_id],
    ["phone unchanged", finalEst.phone === evidence.baseline.establishments.phone],
    ["tuition_fee still 29000", finalFees.tuition_fee === EXPECTED_TUITION_FEE],
    ["is_qualified restored", finalFees.is_qualified === evidence.baseline.fees.is_qualified],
    ["description restored", finalEst.description === evidence.baseline.establishments.description],
    ["motto restored (null)", finalEst.motto === evidence.baseline.establishments.motto],
    ["no fee schedules remain", finalSchedules.body.length === 0],
    ["no demo events remain", finalEvents.body.length === 0],
  ];
  let allPass = true;
  for (const [label, cond] of checks) {
    console.log(`${cond ? "PASS" : "FAIL"} — ${label}`);
    if (!cond) allPass = false;
  }
  if (!allPass) fail("GUYSKULL_04_ROLLBACK_VERIFICATION_FAILED", "Rollback completed but post-rollback verification found a mismatch.");

  console.log("\nROLLBACK COMPLETE AND VERIFIED.");
}

module.exports = { run, GUYSKULL, EVIDENCE_PATH };

if (require.main === module) {
  run({ serviceRole }).catch((e) => { console.error("FATAL:", e.stack || e.message); process.exit(1); });
}
