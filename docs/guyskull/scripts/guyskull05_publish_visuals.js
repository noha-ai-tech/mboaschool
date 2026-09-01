// GUYSKULL-05B — scoped publication of the eight-image core visual pack.
// This performs production writes only when run without --preflight-only.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const liveClient = require("./guyskull05_client");

const PROJECT_REF = "umcwwynrftidytxgqkwi";
const GUYSKULL = "a4cc4966-0d85-4c63-9c24-0538b8d5133b";
const EXPECTED_NAME = "guyskull";
const EXPECTED_CATEGORY = "garderie";
const EXPECTED_OWNER = "84884e49-3596-451a-b0b6-b8eeda4a9e50";
const BUCKET = "school-images";
const MAX_BYTES = 5 * 1024 * 1024;
const EVIDENCE_PATH = path.join(__dirname, "guyskull05-runtime-baseline.local.json");
const ASSET_ROOT = path.join(__dirname, "..", "..", "..", "public", "images", "guyskull");

const ASSETS = [
  ["guyskull-campus-master-v1.png", "Visuel conceptuel de démonstration du campus Guyskull — à confirmer par l’établissement.", 2265670, "103b11733ec3143f1e4a51fdcaaf31278944ab95f36f5ca67178673b5a8f3c89"],
  ["guyskull-facade-v1.png", "Visuel conceptuel de la façade Guyskull — à confirmer par l’établissement.", 2520200, "e39ed83b6414f23ce5f09e523d0ef98959492d8d5b74e63d81a405808967136f"],
  ["guyskull-courtyard-v1.png", "Visuel conceptuel de la cour Guyskull — à confirmer par l’établissement.", 2581235, "0f2ea001a8620763a48054739bd9978c305a009f2d81e3a41a04f3a03d0996c1"],
  ["guyskull-classroom-v1.png", "Visuel conceptuel de salle de classe Guyskull — à confirmer par l’établissement.", 2298629, "4d35d9b85138ae3fa17c70e73a43852ce749848abdd9163cc63c0dde0b641f77"],
  ["guyskull-pedagogical-activity-v1.png", "Activité pédagogique de démonstration — à confirmer par l’établissement.", 2173588, "f74ab0c04ba6639a95821b2ccfda642e6d1830aaeeb40749c0807323d8e6843b"],
  ["guyskull-school-life-concept-v1.png", "Scène de vie scolaire de démonstration — à confirmer par l’établissement.", 2431319, "db107a5a68883adedb0e0f152bf2271ed550281f052b27f7b2bf6f831821d70c"],
  ["guyskull-sanitary-concept-v1.png", "Concept de sanitaires scolaires — équipement à confirmer par l’établissement.", 2085509, "52eb15d54fcd14aed9c694204ead7b5dc4137e1961ac42e73f58811e114c703b"],
  ["guyskull-canteen-concept-v1.png", "Concept de cantine scolaire — équipement à confirmer par l’établissement.", 2106506, "12943791e3336790730810258487cb9891e36ab23d9a88580f5fba56a60252b1"],
].map(([file, caption, bytes, sha256]) => ({ file, caption, bytes, sha256 }));

function assert(condition, code, details = {}) {
  if (!condition) {
    const error = new Error(code);
    error.code = code;
    error.details = details;
    throw error;
  }
}

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function saveEvidence(evidence, evidencePath = EVIDENCE_PATH) {
  fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2), "utf8");
}

async function preflight(client = liveClient) {
  const host = new URL(client.SUPABASE_URL).hostname;
  assert(host === `${PROJECT_REF}.supabase.co`, "GUYSKULL_05_WRONG_PROJECT", { expected_ref: PROJECT_REF, actual_host: host });

  const localAssets = ASSETS.map((asset) => {
    const filePath = path.join(ASSET_ROOT, asset.file);
    assert(fs.existsSync(filePath), "GUYSKULL_05_ASSET_MISSING", { file: asset.file });
    const bytes = fs.readFileSync(filePath);
    assert(bytes.length === asset.bytes && bytes.length <= MAX_BYTES, "GUYSKULL_05_ASSET_SIZE_DRIFT", { file: asset.file, expected: asset.bytes, actual: bytes.length });
    assert(sha256(bytes) === asset.sha256, "GUYSKULL_05_ASSET_HASH_DRIFT", { file: asset.file });
    return { ...asset, filePath };
  });

  const [schoolRes, targetImagesRes, allImagesRes, bucketRes] = await Promise.all([
    client.rest(`establishments?select=id,name,main_category,owner_id&id=eq.${GUYSKULL}`),
    client.rest(`school_images?select=id,establishment_id,url,storage_path,caption,status,created_at&establishment_id=eq.${GUYSKULL}&order=created_at.asc`),
    client.rest("school_images?select=id,establishment_id"),
    client.getBucket(BUCKET),
  ]);
  assert(schoolRes.status === 200 && Array.isArray(schoolRes.body) && schoolRes.body.length === 1, "GUYSKULL_05_TARGET_MISSING");
  const school = schoolRes.body[0];
  assert(school.name === EXPECTED_NAME && school.main_category === EXPECTED_CATEGORY && school.owner_id === EXPECTED_OWNER, "GUYSKULL_05_TARGET_DRIFT", { school });
  assert(targetImagesRes.status === 200 && Array.isArray(targetImagesRes.body), "GUYSKULL_05_IMAGE_PREFLIGHT_FAILED");
  assert(allImagesRes.status === 200 && Array.isArray(allImagesRes.body), "GUYSKULL_05_GLOBAL_COUNT_FAILED");
  assert(bucketRes.status === 200 && bucketRes.body && bucketRes.body.public === true, "GUYSKULL_05_BUCKET_NOT_PUBLIC");

  const captions = new Set(ASSETS.map((asset) => asset.caption));
  const duplicates = targetImagesRes.body.filter((row) => captions.has(row.caption));
  assert(duplicates.length === 0, "GUYSKULL_05_ALREADY_PUBLISHED", { ids: duplicates.map((row) => row.id) });

  return {
    localAssets,
    school,
    baselineTargetImages: targetImagesRes.body,
    baselineAllImageCount: allImagesRes.body.length,
    baselineOtherSchoolImageCount: allImagesRes.body.filter((row) => row.establishment_id !== GUYSKULL).length,
    bucket: { id: bucketRes.body.id, public: bucketRes.body.public, file_size_limit: bucketRes.body.file_size_limit ?? null },
  };
}

async function run(client = liveClient, { preflightOnly = false, evidencePath = EVIDENCE_PATH } = {}) {
  const baseline = await preflight(client);
  if (preflightOnly) return { preflight: baseline, writes: 0 };

  assert(!fs.existsSync(evidencePath), "GUYSKULL_05_EVIDENCE_ALREADY_EXISTS", { evidencePath });
  const planned = baseline.localAssets.map((asset) => {
    const id = crypto.randomUUID();
    const storagePath = `${GUYSKULL}/${id}.png`;
    return {
      id,
      file: asset.file,
      caption: asset.caption,
      sha256: asset.sha256,
      storage_path: storagePath,
      url: `${client.SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${storagePath}`,
      uploaded: false,
      row_inserted: false,
    };
  });
  const evidence = {
    marker: "GUYSKULL_05B_VISUALS_V1",
    project_ref: PROJECT_REF,
    target_establishment_id: GUYSKULL,
    captured_at: new Date().toISOString(),
    baseline_target_images: baseline.baselineTargetImages,
    baseline_all_image_count: baseline.baselineAllImageCount,
    baseline_other_school_image_count: baseline.baselineOtherSchoolImageCount,
    planned,
    complete: false,
  };
  saveEvidence(evidence, evidencePath);

  for (const item of planned) {
    const bytes = fs.readFileSync(path.join(ASSET_ROOT, item.file));
    const upload = await client.uploadObject(BUCKET, item.storage_path, bytes, "image/png");
    assert(upload.status === 200, "GUYSKULL_05_STORAGE_UPLOAD_FAILED", { file: item.file, status: upload.status });
    item.uploaded = true;
    saveEvidence(evidence, evidencePath);

    const insert = await client.rest("school_images", {
      method: "POST",
      body: {
        id: item.id,
        establishment_id: GUYSKULL,
        url: item.url,
        storage_path: item.storage_path,
        caption: item.caption,
        status: "live",
      },
    });
    if (insert.status !== 201) {
      await client.removeObjects(BUCKET, [item.storage_path]);
      item.uploaded = false;
      saveEvidence(evidence, evidencePath);
      assert(false, "GUYSKULL_05_DB_INSERT_FAILED", { file: item.file, status: insert.status });
    }
    item.row_inserted = true;
    saveEvidence(evidence, evidencePath);
  }

  const [targetAfter, allAfter] = await Promise.all([
    client.rest(`school_images?select=id,establishment_id,url,storage_path,caption,status&establishment_id=eq.${GUYSKULL}`),
    client.rest("school_images?select=id,establishment_id"),
  ]);
  assert(targetAfter.status === 200 && allAfter.status === 200, "GUYSKULL_05_POSTCHECK_READ_FAILED");
  const rowsById = new Map(targetAfter.body.map((row) => [row.id, row]));
  for (const item of planned) {
    const row = rowsById.get(item.id);
    assert(row && row.status === "live" && row.storage_path === item.storage_path && row.caption === item.caption && row.url === item.url, "GUYSKULL_05_POSTCHECK_ROW_MISMATCH", { id: item.id });
  }
  assert(allAfter.body.length === baseline.baselineAllImageCount + ASSETS.length, "GUYSKULL_05_GLOBAL_COUNT_CHANGED_UNEXPECTEDLY");
  assert(allAfter.body.filter((row) => row.establishment_id !== GUYSKULL).length === baseline.baselineOtherSchoolImageCount, "GUYSKULL_05_OTHER_SCHOOL_CHANGED");
  for (const baselineRow of baseline.baselineTargetImages) {
    assert(rowsById.has(baselineRow.id), "GUYSKULL_05_BASELINE_IMAGE_CHANGED", { id: baselineRow.id });
  }

  evidence.complete = true;
  evidence.completed_at = new Date().toISOString();
  saveEvidence(evidence, evidencePath);
  return { preflight: baseline, writes: ASSETS.length * 2, evidence };
}

module.exports = { ASSETS, PROJECT_REF, GUYSKULL, BUCKET, EVIDENCE_PATH, preflight, run };

if (require.main === module) {
  const preflightOnly = process.argv.includes("--preflight-only");
  run(liveClient, { preflightOnly })
    .then((result) => console.log(JSON.stringify({ ok: true, preflight_only: preflightOnly, target_images_before: result.preflight.baselineTargetImages.length, writes: result.writes }, null, 2)))
    .catch((error) => { console.error(`ABORT [${error.code || "GUYSKULL_05_FATAL"}]`); process.exit(1); });
}
