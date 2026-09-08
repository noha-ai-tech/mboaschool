// Read-only post-publication verification for GUYSKULL-05B.
const fs = require("fs");
const path = require("path");
const https = require("https");
const { EVIDENCE_PATH, GUYSKULL, PROJECT_REF } = require("./guyskull05_publish_visuals");
const client = require("./guyskull05_client");

function readEnvVar(key) {
  const env = fs.readFileSync(path.join(__dirname, "..", "..", "..", ".env.local"), "utf8");
  const match = env.match(new RegExp(`^${key}=(.*)$`, "m"));
  if (!match || !match[1]) throw new Error(`${key}_MISSING`);
  return match[1].trim();
}

function publicRequest(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, { method: "GET", headers }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on("error", reject);
    req.end();
  });
}

function assert(condition, code) {
  if (!condition) throw new Error(code);
}

async function run() {
  const evidence = JSON.parse(fs.readFileSync(EVIDENCE_PATH, "utf8"));
  assert(evidence.complete === true && evidence.project_ref === PROJECT_REF && evidence.target_establishment_id === GUYSKULL, "POSTCHECK_EVIDENCE_INVALID");

  const serviceRows = await client.rest(`school_images?select=id,establishment_id,url,storage_path,caption,status,created_at&establishment_id=eq.${GUYSKULL}&order=created_at.asc`);
  assert(serviceRows.status === 200 && serviceRows.body.length === evidence.baseline_target_images.length + evidence.planned.length, "POSTCHECK_TARGET_COUNT_FAILED");
  const byId = new Map(serviceRows.body.map((row) => [row.id, row]));
  for (const baseline of evidence.baseline_target_images) assert(byId.has(baseline.id), "POSTCHECK_BASELINE_ROW_MISSING");

  const anonKey = readEnvVar("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const anonUrl = `${client.SUPABASE_URL}/rest/v1/school_images?select=id,url,caption,status&establishment_id=eq.${GUYSKULL}&status=eq.live`;
  const anonRows = await publicRequest(anonUrl, { apikey: anonKey, Authorization: `Bearer ${anonKey}` });
  assert(anonRows.status === 200, "POSTCHECK_ANON_GALLERY_FAILED");
  const anonBody = JSON.parse(anonRows.body.toString("utf8"));
  const anonIds = new Set(anonBody.map((row) => row.id));

  const imageChecks = [];
  for (const planned of evidence.planned) {
    const row = byId.get(planned.id);
    assert(row && row.status === "live" && row.url === planned.url && row.storage_path === planned.storage_path && row.caption === planned.caption, "POSTCHECK_ROW_DRIFT");
    assert(anonIds.has(planned.id), "POSTCHECK_ROW_NOT_PUBLIC");
    const image = await publicRequest(planned.url);
    assert(image.status === 200 && String(image.headers["content-type"] || "").startsWith("image/png") && image.body.length > 0, "POSTCHECK_IMAGE_NOT_PUBLIC");
    imageChecks.push({ id: planned.id, file: planned.file, status: image.status, content_type: image.headers["content-type"], bytes: image.body.length });
  }

  console.log(JSON.stringify({
    ok: true,
    project_ref: PROJECT_REF,
    target_rows: serviceRows.body.length,
    prior_rows_preserved: evidence.baseline_target_images.length,
    selected_rows_public: evidence.planned.length,
    image_checks: imageChecks,
  }, null, 2));
}

if (require.main === module) {
  run().catch((error) => { console.error(`ABORT [${error.message}]`); process.exit(1); });
}
