// GUYSKULL-05E — publishes the requested office/reception concept while
// preserving the exact five-image hero order captured by GUYSKULL-05D.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const client = require("./guyskull05_client");
const PROJECT_REF = "umcwwynrftidytxgqkwi";
const GUYSKULL = "a4cc4966-0d85-4c63-9c24-0538b8d5133b";
const EXPECTED_OWNER = "84884e49-3596-451a-b0b6-b8eeda4a9e50";
const BUCKET = "school-images";
const FILE = "guyskull-office-reception-concept-v1.png";
const CAPTION = "Concept de bureau et d’accueil scolaire — équipement non confirmé par l’établissement.";
const BYTES = 2043859;
const SHA256 = "66c09cf339aec343103eebc300d6d4ad5dfbe485b77bc6b4cdf14f20e21b8e0b";
const FILE_PATH = path.join(__dirname, "..", "..", "..", "public", "images", "guyskull", FILE);
const HERO_EVIDENCE_PATH = path.join(__dirname, "guyskull05d-runtime-baseline.local.json");
const EVIDENCE_PATH = path.join(__dirname, "guyskull05e-runtime-baseline.local.json");
function assert(condition, code) { if (!condition) { const error = new Error(code); error.code = code; throw error; } }
function digest(bytes) { return crypto.createHash("sha256").update(bytes).digest("hex"); }
function save(evidence) { fs.writeFileSync(EVIDENCE_PATH, JSON.stringify(evidence, null, 2), "utf8"); }

async function preflight(api = client) {
  assert(new URL(api.SUPABASE_URL).hostname === `${PROJECT_REF}.supabase.co`, "GUYSKULL_05E_WRONG_PROJECT");
  const bytes = fs.readFileSync(FILE_PATH);
  assert(bytes.length === BYTES && bytes.length <= 5 * 1024 * 1024 && digest(bytes) === SHA256, "GUYSKULL_05E_ASSET_DRIFT");
  assert(fs.existsSync(HERO_EVIDENCE_PATH), "GUYSKULL_05E_HERO_EVIDENCE_MISSING");
  const heroEvidence = JSON.parse(fs.readFileSync(HERO_EVIDENCE_PATH, "utf8"));
  assert(heroEvidence.complete === true && heroEvidence.planned.length === 5, "GUYSKULL_05E_HERO_EVIDENCE_INVALID");
  const [school, target, all, bucket] = await Promise.all([
    api.rest(`establishments?select=id,name,main_category,owner_id&id=eq.${GUYSKULL}`),
    api.rest(`school_images?select=id,establishment_id,url,storage_path,caption,status,created_at&establishment_id=eq.${GUYSKULL}&order=created_at.desc`),
    api.rest("school_images?select=id,establishment_id"),
    api.getBucket(BUCKET),
  ]);
  assert(school.status === 200 && school.body.length === 1 && school.body[0].name === "guyskull" && school.body[0].main_category === "garderie" && school.body[0].owner_id === EXPECTED_OWNER, "GUYSKULL_05E_TARGET_DRIFT");
  assert(target.status === 200 && target.body.length === 12, "GUYSKULL_05E_TARGET_COUNT_DRIFT");
  assert(target.body.slice(0, 5).every((row, index) => row.id === heroEvidence.planned[index].id), "GUYSKULL_05E_HERO_ORDER_DRIFT");
  assert(target.body.every((row) => row.caption !== CAPTION), "GUYSKULL_05E_ALREADY_PUBLISHED");
  assert(all.status === 200 && Array.isArray(all.body) && bucket.status === 200 && bucket.body.public === true, "GUYSKULL_05E_PLATFORM_PREFLIGHT_FAILED");
  return { targetRows: target.body, allCount: all.body.length, otherCount: all.body.filter((row) => row.establishment_id !== GUYSKULL).length, heroIds: heroEvidence.planned.map((item) => item.id) };
}

async function run(api = client, { preflightOnly = false } = {}) {
  const baseline = await preflight(api);
  if (preflightOnly) return { baseline, writes: 0 };
  assert(!fs.existsSync(EVIDENCE_PATH), "GUYSKULL_05E_RUNTIME_EVIDENCE_EXISTS");
  const id = crypto.randomUUID();
  const storage_path = `${GUYSKULL}/${id}.png`;
  const fifthHeroTimestamp = Date.parse(baseline.targetRows[4].created_at);
  const created_at = new Date(fifthHeroTimestamp - 1000).toISOString();
  const planned = { id, file: FILE, caption: CAPTION, bytes: BYTES, sha256: SHA256, storage_path, url: `${api.SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${storage_path}`, created_at, uploaded: false, row_inserted: false };
  const evidence = { marker: "GUYSKULL_05E_OFFICE_V1", project_ref: PROJECT_REF, target_establishment_id: GUYSKULL, captured_at: new Date().toISOString(), baseline_target_rows: baseline.targetRows, baseline_all_count: baseline.allCount, baseline_other_count: baseline.otherCount, hero_ids: baseline.heroIds, planned, complete: false };
  save(evidence);
  const upload = await api.uploadObject(BUCKET, storage_path, fs.readFileSync(FILE_PATH), "image/png");
  assert(upload.status === 200, "GUYSKULL_05E_UPLOAD_FAILED");
  planned.uploaded = true; save(evidence);
  const insert = await api.rest("school_images", { method: "POST", body: { id, establishment_id: GUYSKULL, url: planned.url, storage_path, caption: CAPTION, status: "live", created_at } });
  if (insert.status !== 201) {
    const cleanup = await api.removeObjects(BUCKET, [storage_path]);
    if (cleanup.status === 200) planned.uploaded = false;
    save(evidence); assert(false, "GUYSKULL_05E_INSERT_FAILED");
  }
  planned.row_inserted = true; save(evidence);
  const [targetAfter, allAfter] = await Promise.all([
    api.rest(`school_images?select=id,establishment_id,url,storage_path,caption,status,created_at&establishment_id=eq.${GUYSKULL}&order=created_at.desc`),
    api.rest("school_images?select=id,establishment_id"),
  ]);
  assert(targetAfter.status === 200 && targetAfter.body.length === 13, "GUYSKULL_05E_POSTCHECK_COUNT_FAILED");
  assert(targetAfter.body.slice(0, 5).every((row, index) => row.id === baseline.heroIds[index]), "GUYSKULL_05E_HERO_ORDER_CHANGED");
  const office = targetAfter.body.find((row) => row.id === id);
  assert(office && office.status === "live" && office.url === planned.url && office.storage_path === storage_path && office.caption === CAPTION, "GUYSKULL_05E_OFFICE_ROW_DRIFT");
  assert(baseline.targetRows.every((row) => targetAfter.body.some((after) => after.id === row.id && after.created_at === row.created_at)), "GUYSKULL_05E_BASELINE_CHANGED");
  assert(allAfter.body.length === baseline.allCount + 1 && allAfter.body.filter((row) => row.establishment_id !== GUYSKULL).length === baseline.otherCount, "GUYSKULL_05E_OTHER_SCHOOL_CHANGED");
  evidence.complete = true; evidence.completed_at = new Date().toISOString(); save(evidence);
  return { baseline, writes: 2, evidence };
}
module.exports = { FILE, CAPTION, PROJECT_REF, GUYSKULL, EVIDENCE_PATH, preflight, run };
if (require.main === module) run(client, { preflightOnly: process.argv.includes("--preflight-only") }).then((result) => console.log(JSON.stringify({ ok: true, file: FILE, writes: result.writes }, null, 2))).catch((error) => { console.error(`ABORT [${error.code || error.message}]`); process.exit(1); });
