// Read-only public verification for the three GUYSKULL-05C images.
const fs = require("fs");
const path = require("path");
const https = require("https");
const client = require("./guyskull05_client");
const { EVIDENCE_PATH, GUYSKULL } = require("./guyskull05c_publish_remaining_visuals");
function assert(condition, code) { if (!condition) throw new Error(code); }
function env(key) {
  const text = fs.readFileSync(path.join(__dirname, "..", "..", "..", ".env.local"), "utf8");
  const match = text.match(new RegExp(`^${key}=(.*)$`, "m"));
  if (!match) throw new Error(`${key}_MISSING`);
  return match[1].trim();
}
function get(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, { headers }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on("error", reject); req.end();
  });
}
async function run() {
  const evidence = JSON.parse(fs.readFileSync(EVIDENCE_PATH, "utf8"));
  assert(evidence.complete === true && evidence.planned.length === 3, "GUYSKULL_05C_EVIDENCE_INVALID");
  const rows = await client.rest(`school_images?select=id,establishment_id,url,storage_path,caption,status&establishment_id=eq.${GUYSKULL}`);
  assert(rows.status === 200 && rows.body.length === 12, "GUYSKULL_05C_TARGET_COUNT_FAILED");
  const byId = new Map(rows.body.map((row) => [row.id, row]));
  assert(evidence.baseline_target_images.every((row) => byId.has(row.id)), "GUYSKULL_05C_BASELINE_CHANGED");
  const anonKey = env("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const anon = await get(`${client.SUPABASE_URL}/rest/v1/school_images?select=id&establishment_id=eq.${GUYSKULL}&status=eq.live`, { apikey: anonKey, Authorization: `Bearer ${anonKey}` });
  assert(anon.status === 200, "GUYSKULL_05C_ANON_READ_FAILED");
  const anonIds = new Set(JSON.parse(anon.body.toString("utf8")).map((row) => row.id));
  const image_checks = [];
  for (const item of evidence.planned) {
    const row = byId.get(item.id);
    assert(row && row.status === "live" && row.url === item.url && row.storage_path === item.storage_path && row.caption === item.caption && anonIds.has(item.id), "GUYSKULL_05C_ROW_NOT_PUBLIC");
    const image = await get(item.url);
    assert(image.status === 200 && image.headers["content-type"] === "image/png" && image.body.length === item.bytes, "GUYSKULL_05C_IMAGE_FAILED");
    image_checks.push({ file: item.file, status: image.status, content_type: image.headers["content-type"], bytes: image.body.length });
  }
  console.log(JSON.stringify({ ok: true, target_rows: rows.body.length, prior_rows_preserved: evidence.baseline_target_images.length, added_rows_public: 3, image_checks }, null, 2));
}
if (require.main === module) run().catch((error) => { console.error(`ABORT [${error.message}]`); process.exit(1); });
