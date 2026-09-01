// GUYSKULL-05C — publication of the three facility concepts explicitly
// added by Eddy after the eight-image core pack. Production writes occur
// only when run without --preflight-only.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const client = require("./guyskull05_client");

const PROJECT_REF = "umcwwynrftidytxgqkwi";
const GUYSKULL = "a4cc4966-0d85-4c63-9c24-0538b8d5133b";
const EXPECTED_OWNER = "84884e49-3596-451a-b0b6-b8eeda4a9e50";
const BUCKET = "school-images";
const ASSET_ROOT = path.join(__dirname, "..", "..", "..", "public", "images", "guyskull");
const EVIDENCE_PATH = path.join(__dirname, "guyskull05c-runtime-baseline.local.json");
const CORE_EVIDENCE_PATH = path.join(__dirname, "guyskull05-runtime-baseline.local.json");

const ASSETS = [
  ["guyskull-computer-room-concept-v1.png", "Concept de salle informatique — équipement non confirmé par l’établissement.", 2065116, "bda950e3bb25f23fb6e362131adbb66e090f89677622916b7b849adb3b5ad611"],
  ["guyskull-library-concept-v1.png", "Concept de bibliothèque — équipement non confirmé par l’établissement.", 2288330, "b214763ef1eadef39fc567eb86d9ca526f66e8ef59b6f824d9e226d141e02aa5"],
  ["guyskull-play-sport-concept-v1.png", "Concept d’aire de jeux et de motricité — équipement non confirmé par l’établissement.", 2588356, "ef2e23a35884f47a7bf00ff62420d650a431e4382c1f0f4dcf35e669be29c732"],
].map(([file, caption, bytes, sha256]) => ({ file, caption, bytes, sha256 }));

function assert(condition, code, details = {}) {
  if (!condition) { const error = new Error(code); error.code = code; error.details = details; throw error; }
}
function digest(bytes) { return crypto.createHash("sha256").update(bytes).digest("hex"); }
function save(evidence, evidencePath = EVIDENCE_PATH) { fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2), "utf8"); }

async function preflight(api = client) {
  assert(new URL(api.SUPABASE_URL).hostname === `${PROJECT_REF}.supabase.co`, "GUYSKULL_05C_WRONG_PROJECT");
  assert(fs.existsSync(CORE_EVIDENCE_PATH), "GUYSKULL_05C_CORE_EVIDENCE_MISSING");
  const coreEvidence = JSON.parse(fs.readFileSync(CORE_EVIDENCE_PATH, "utf8"));
  assert(coreEvidence.complete === true && coreEvidence.planned.length === 8, "GUYSKULL_05C_CORE_EVIDENCE_INVALID");

  for (const asset of ASSETS) {
    const bytes = fs.readFileSync(path.join(ASSET_ROOT, asset.file));
    assert(bytes.length === asset.bytes && bytes.length <= 5 * 1024 * 1024 && digest(bytes) === asset.sha256, "GUYSKULL_05C_ASSET_DRIFT", { file: asset.file });
  }

  const [school, targetImages, allImages, bucket] = await Promise.all([
    api.rest(`establishments?select=id,name,main_category,owner_id&id=eq.${GUYSKULL}`),
    api.rest(`school_images?select=id,establishment_id,url,storage_path,caption,status,created_at&establishment_id=eq.${GUYSKULL}&order=created_at.asc`),
    api.rest("school_images?select=id,establishment_id"),
    api.getBucket(BUCKET),
  ]);
  assert(school.status === 200 && school.body.length === 1, "GUYSKULL_05C_TARGET_MISSING");
  assert(school.body[0].name === "guyskull" && school.body[0].main_category === "garderie" && school.body[0].owner_id === EXPECTED_OWNER, "GUYSKULL_05C_TARGET_DRIFT");
  assert(targetImages.status === 200 && targetImages.body.length === 9, "GUYSKULL_05C_BASELINE_COUNT_DRIFT", { actual: targetImages.body.length });
  assert(allImages.status === 200 && Array.isArray(allImages.body), "GUYSKULL_05C_GLOBAL_COUNT_FAILED");
  assert(bucket.status === 200 && bucket.body.public === true, "GUYSKULL_05C_BUCKET_DRIFT");

  const targetIds = new Set(targetImages.body.map((row) => row.id));
  assert(coreEvidence.planned.every((item) => targetIds.has(item.id)), "GUYSKULL_05C_CORE_ROW_MISSING");
  const captions = new Set(ASSETS.map((asset) => asset.caption));
  assert(targetImages.body.every((row) => !captions.has(row.caption)), "GUYSKULL_05C_ALREADY_PUBLISHED");
  return {
    targetImages: targetImages.body,
    allCount: allImages.body.length,
    otherCount: allImages.body.filter((row) => row.establishment_id !== GUYSKULL).length,
  };
}

async function run(api = client, { preflightOnly = false, evidencePath = EVIDENCE_PATH } = {}) {
  const baseline = await preflight(api);
  if (preflightOnly) return { baseline, writes: 0 };
  assert(!fs.existsSync(evidencePath), "GUYSKULL_05C_EVIDENCE_ALREADY_EXISTS");
  const planned = ASSETS.map((asset) => {
    const id = crypto.randomUUID();
    const storage_path = `${GUYSKULL}/${id}.png`;
    return { ...asset, id, storage_path, url: `${api.SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${storage_path}`, uploaded: false, row_inserted: false };
  });
  const evidence = { marker: "GUYSKULL_05C_REMAINING_VISUALS_V1", project_ref: PROJECT_REF, target_establishment_id: GUYSKULL, captured_at: new Date().toISOString(), baseline_target_images: baseline.targetImages, baseline_all_count: baseline.allCount, baseline_other_count: baseline.otherCount, planned, complete: false };
  save(evidence, evidencePath);

  for (const item of planned) {
    const upload = await api.uploadObject(BUCKET, item.storage_path, fs.readFileSync(path.join(ASSET_ROOT, item.file)), "image/png");
    assert(upload.status === 200, "GUYSKULL_05C_UPLOAD_FAILED", { file: item.file, status: upload.status });
    item.uploaded = true; save(evidence, evidencePath);
    const insert = await api.rest("school_images", { method: "POST", body: { id: item.id, establishment_id: GUYSKULL, url: item.url, storage_path: item.storage_path, caption: item.caption, status: "live" } });
    if (insert.status !== 201) {
      const cleanup = await api.removeObjects(BUCKET, [item.storage_path]);
      if (cleanup.status === 200) item.uploaded = false;
      save(evidence, evidencePath);
      assert(false, "GUYSKULL_05C_INSERT_FAILED", { file: item.file, status: insert.status });
    }
    item.row_inserted = true; save(evidence, evidencePath);
  }

  const [targetAfter, allAfter] = await Promise.all([
    api.rest(`school_images?select=id,establishment_id,url,storage_path,caption,status&establishment_id=eq.${GUYSKULL}`),
    api.rest("school_images?select=id,establishment_id"),
  ]);
  assert(targetAfter.status === 200 && targetAfter.body.length === 12, "GUYSKULL_05C_POSTCHECK_TARGET_COUNT_FAILED");
  const byId = new Map(targetAfter.body.map((row) => [row.id, row]));
  assert(baseline.targetImages.every((row) => byId.has(row.id)), "GUYSKULL_05C_BASELINE_ROW_CHANGED");
  assert(planned.every((item) => { const row = byId.get(item.id); return row && row.status === "live" && row.url === item.url && row.storage_path === item.storage_path && row.caption === item.caption; }), "GUYSKULL_05C_POSTCHECK_ROW_DRIFT");
  assert(allAfter.body.length === baseline.allCount + 3 && allAfter.body.filter((row) => row.establishment_id !== GUYSKULL).length === baseline.otherCount, "GUYSKULL_05C_OTHER_SCHOOL_CHANGED");
  evidence.complete = true; evidence.completed_at = new Date().toISOString(); save(evidence, evidencePath);
  return { baseline, writes: 6, evidence };
}

module.exports = { ASSETS, EVIDENCE_PATH, PROJECT_REF, GUYSKULL, BUCKET, preflight, run };
if (require.main === module) {
  run(client, { preflightOnly: process.argv.includes("--preflight-only") })
    .then((result) => console.log(JSON.stringify({ ok: true, target_images_before: result.baseline.targetImages.length, writes: result.writes }, null, 2)))
    .catch((error) => { console.error(`ABORT [${error.code || error.message}]`); process.exit(1); });
}
