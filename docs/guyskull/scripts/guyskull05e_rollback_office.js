const fs = require("fs");
const client = require("./guyskull05_client");
const { EVIDENCE_PATH, PROJECT_REF, GUYSKULL } = require("./guyskull05e_publish_office");
const BUCKET = "school-images";
function assert(condition, code) { if (!condition) { const error = new Error(code); error.code = code; throw error; } }
async function rollback(api = client) {
  assert(fs.existsSync(EVIDENCE_PATH), "GUYSKULL_05E_ROLLBACK_EVIDENCE_MISSING");
  const evidence = JSON.parse(fs.readFileSync(EVIDENCE_PATH, "utf8"));
  const item = evidence.planned;
  assert(evidence.marker === "GUYSKULL_05E_OFFICE_V1" && evidence.project_ref === PROJECT_REF && evidence.target_establishment_id === GUYSKULL, "GUYSKULL_05E_ROLLBACK_WRONG_TARGET");
  if (item.row_inserted) {
    const check = await api.rest(`school_images?select=id,establishment_id,url,storage_path,caption,status,created_at&id=eq.${item.id}`);
    assert(check.status === 200 && check.body.length === 1 && check.body[0].establishment_id === GUYSKULL && check.body[0].url === item.url && check.body[0].storage_path === item.storage_path && check.body[0].caption === item.caption && check.body[0].status === "live" && check.body[0].created_at === item.created_at, "GUYSKULL_05E_ROLLBACK_ROW_DRIFT");
    const deleted = await api.rest(`school_images?id=eq.${item.id}&establishment_id=eq.${GUYSKULL}`, { method: "DELETE" });
    assert(deleted.status === 200 || deleted.status === 204, "GUYSKULL_05E_ROLLBACK_DB_FAILED");
    item.row_inserted = false; fs.writeFileSync(EVIDENCE_PATH, JSON.stringify(evidence, null, 2), "utf8");
  }
  if (item.uploaded) {
    const deleted = await api.removeObjects(BUCKET, [item.storage_path]);
    assert(deleted.status === 200, "GUYSKULL_05E_ROLLBACK_STORAGE_FAILED");
    item.uploaded = false; fs.writeFileSync(EVIDENCE_PATH, JSON.stringify(evidence, null, 2), "utf8");
  }
}
module.exports = { rollback };
if (require.main === module) rollback().then(() => console.log("GUYSKULL-05E office rollback complete.")).catch((error) => { console.error(`ABORT [${error.code || error.message}]`); process.exit(1); });
