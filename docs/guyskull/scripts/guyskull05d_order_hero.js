// GUYSKULL-05D — orders the five explicitly selected hero images. The app
// code limits carousel rendering to the first five live images; the full
// twelve-row gallery remains untouched.
const fs = require("fs");
const path = require("path");
const client = require("./guyskull05_client");
const PROJECT_REF = "umcwwynrftidytxgqkwi";
const GUYSKULL = "a4cc4966-0d85-4c63-9c24-0538b8d5133b";
const EXPECTED_OWNER = "84884e49-3596-451a-b0b6-b8eeda4a9e50";
const CORE_EVIDENCE = path.join(__dirname, "guyskull05-runtime-baseline.local.json");
const REMAINING_EVIDENCE = path.join(__dirname, "guyskull05c-runtime-baseline.local.json");
const EVIDENCE_PATH = path.join(__dirname, "guyskull05d-runtime-baseline.local.json");
const HERO_FILES = [
  "guyskull-campus-master-v1.png",
  "guyskull-facade-v1.png",
  "guyskull-courtyard-v1.png",
  "guyskull-classroom-v1.png",
  "guyskull-pedagogical-activity-v1.png",
];
function assert(condition, code, details = {}) { if (!condition) { const error = new Error(code); error.code = code; error.details = details; throw error; } }
function readEvidence(file) { assert(fs.existsSync(file), "GUYSKULL_05D_EVIDENCE_MISSING"); return JSON.parse(fs.readFileSync(file, "utf8")); }
function save(evidence) { fs.writeFileSync(EVIDENCE_PATH, JSON.stringify(evidence, null, 2), "utf8"); }

async function preflight(api = client) {
  assert(new URL(api.SUPABASE_URL).hostname === `${PROJECT_REF}.supabase.co`, "GUYSKULL_05D_WRONG_PROJECT");
  const core = readEvidence(CORE_EVIDENCE);
  const remaining = readEvidence(REMAINING_EVIDENCE);
  assert(core.complete === true && core.planned.length === 8 && remaining.complete === true && remaining.planned.length === 3, "GUYSKULL_05D_SOURCE_EVIDENCE_INVALID");
  const planned = [...core.planned, ...remaining.planned];
  const byFile = new Map(planned.map((item) => [item.file, item]));
  assert(HERO_FILES.every((file) => byFile.has(file)), "GUYSKULL_05D_HERO_FILE_MISSING");
  const [school, target, all] = await Promise.all([
    api.rest(`establishments?select=id,name,main_category,owner_id&id=eq.${GUYSKULL}`),
    api.rest(`school_images?select=id,establishment_id,url,storage_path,caption,status,created_at&establishment_id=eq.${GUYSKULL}&order=created_at.desc`),
    api.rest("school_images?select=id,establishment_id"),
  ]);
  assert(school.status === 200 && school.body.length === 1 && school.body[0].name === "guyskull" && school.body[0].main_category === "garderie" && school.body[0].owner_id === EXPECTED_OWNER, "GUYSKULL_05D_TARGET_DRIFT");
  assert(target.status === 200 && target.body.length === 12, "GUYSKULL_05D_TARGET_COUNT_DRIFT");
  const targetIds = new Set(target.body.map((row) => row.id));
  assert(planned.every((item) => targetIds.has(item.id)), "GUYSKULL_05D_PLANNED_ROW_MISSING");
  assert(all.status === 200 && Array.isArray(all.body), "GUYSKULL_05D_GLOBAL_READ_FAILED");
  return { targetRows: target.body, allCount: all.body.length, otherCount: all.body.filter((row) => row.establishment_id !== GUYSKULL).length, heroItems: HERO_FILES.map((file) => byFile.get(file)) };
}

async function run(api = client, { preflightOnly = false } = {}) {
  const baseline = await preflight(api);
  if (preflightOnly) return { baseline, writes: 0 };
  assert(!fs.existsSync(EVIDENCE_PATH), "GUYSKULL_05D_RUNTIME_EVIDENCE_EXISTS");
  const timestampBase = Date.now();
  const originalById = Object.fromEntries(baseline.targetRows.map((row) => [row.id, row.created_at]));
  const planned = baseline.heroItems.map((item, index) => ({ id: item.id, file: item.file, original_created_at: originalById[item.id], ordered_created_at: new Date(timestampBase - index * 1000).toISOString(), applied: false }));
  const evidence = { marker: "GUYSKULL_05D_HERO_ORDER_V1", project_ref: PROJECT_REF, target_establishment_id: GUYSKULL, captured_at: new Date().toISOString(), baseline_target_rows: baseline.targetRows, baseline_all_count: baseline.allCount, baseline_other_count: baseline.otherCount, planned, complete: false };
  save(evidence);
  for (const item of planned) {
    const result = await api.rest(`school_images?id=eq.${item.id}&establishment_id=eq.${GUYSKULL}`, { method: "PATCH", body: { created_at: item.ordered_created_at } });
    assert(result.status === 200 || result.status === 204, "GUYSKULL_05D_ORDER_UPDATE_FAILED", { id: item.id, status: result.status });
    item.applied = true; save(evidence);
  }
  const [targetAfter, allAfter] = await Promise.all([
    api.rest(`school_images?select=id,establishment_id,created_at&establishment_id=eq.${GUYSKULL}&order=created_at.desc`),
    api.rest("school_images?select=id,establishment_id"),
  ]);
  assert(targetAfter.status === 200 && targetAfter.body.length === 12, "GUYSKULL_05D_POSTCHECK_COUNT_FAILED");
  assert(targetAfter.body.slice(0, 5).every((row, index) => row.id === planned[index].id), "GUYSKULL_05D_POSTCHECK_ORDER_FAILED");
  const changed = new Set(planned.map((item) => item.id));
  const afterById = new Map(targetAfter.body.map((row) => [row.id, row]));
  assert(baseline.targetRows.filter((row) => !changed.has(row.id)).every((row) => afterById.get(row.id)?.created_at === row.created_at), "GUYSKULL_05D_NON_HERO_ROW_CHANGED");
  assert(allAfter.body.length === baseline.allCount && allAfter.body.filter((row) => row.establishment_id !== GUYSKULL).length === baseline.otherCount, "GUYSKULL_05D_OTHER_SCHOOL_CHANGED");
  evidence.complete = true; evidence.completed_at = new Date().toISOString(); save(evidence);
  return { baseline, writes: 5, evidence };
}
module.exports = { HERO_FILES, EVIDENCE_PATH, PROJECT_REF, GUYSKULL, preflight, run };
if (require.main === module) run(client, { preflightOnly: process.argv.includes("--preflight-only") }).then((result) => console.log(JSON.stringify({ ok: true, hero_files: HERO_FILES, writes: result.writes }, null, 2))).catch((error) => { console.error(`ABORT [${error.code || error.message}]`); process.exit(1); });
