const fs = require("fs");
const path = require("path");
const https = require("https");
const client = require("./guyskull05_client");
const { EVIDENCE_PATH, GUYSKULL } = require("./guyskull05e_publish_office");
function assert(condition, code) { if (!condition) throw new Error(code); }
function get(url, headers = {}) { return new Promise((resolve, reject) => { const req = https.request(url, { headers }, (res) => { const chunks = []; res.on("data", (chunk) => chunks.push(chunk)); res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) })); }); req.on("error", reject); req.end(); }); }
function env(key) { const text = fs.readFileSync(path.join(__dirname, "..", "..", "..", ".env.local"), "utf8"); const match = text.match(new RegExp(`^${key}=(.*)$`, "m")); assert(match, `${key}_MISSING`); return match[1].trim(); }
async function run() {
  const evidence = JSON.parse(fs.readFileSync(EVIDENCE_PATH, "utf8"));
  assert(evidence.complete === true, "GUYSKULL_05E_EVIDENCE_INVALID");
  const rows = await client.rest(`school_images?select=id,url,caption,status,created_at&establishment_id=eq.${GUYSKULL}&order=created_at.desc`);
  assert(rows.status === 200 && rows.body.length === 13, "GUYSKULL_05E_COUNT_FAILED");
  assert(rows.body.slice(0, 5).every((row, index) => row.id === evidence.hero_ids[index]), "GUYSKULL_05E_HERO_ORDER_FAILED");
  const anonKey = env("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const anon = await get(`${client.SUPABASE_URL}/rest/v1/school_images?select=id&establishment_id=eq.${GUYSKULL}&status=eq.live`, { apikey: anonKey, Authorization: `Bearer ${anonKey}` });
  assert(anon.status === 200 && new Set(JSON.parse(anon.body.toString("utf8")).map((row) => row.id)).has(evidence.planned.id), "GUYSKULL_05E_NOT_ANON_VISIBLE");
  const image = await get(evidence.planned.url);
  assert(image.status === 200 && image.headers["content-type"] === "image/png" && image.body.length === evidence.planned.bytes, "GUYSKULL_05E_IMAGE_FAILED");
  console.log(JSON.stringify({ ok: true, gallery_rows: 13, hero_rows: 5, hero_order_preserved: true, office_public: true, office_bytes: image.body.length }, null, 2));
}
if (require.main === module) run().catch((error) => { console.error(`ABORT [${error.message}]`); process.exit(1); });
