// Exact rollback for GUYSKULL-05C; not run unless a later explicit request
// authorizes removal of these three rows and objects.
const fs = require("fs");
const client = require("./guyskull05_client");
const { EVIDENCE_PATH, PROJECT_REF, GUYSKULL, BUCKET } = require("./guyskull05c_publish_remaining_visuals");
function assert(condition, code) { if (!condition) { const error = new Error(code); error.code = code; throw error; } }
async function rollback(api = client, evidencePath = EVIDENCE_PATH) {
  assert(fs.existsSync(evidencePath), "GUYSKULL_05C_ROLLBACK_EVIDENCE_MISSING");
  const evidence = JSON.parse(fs.readFileSync(evidencePath, "utf8"));
  assert(evidence.marker === "GUYSKULL_05C_REMAINING_VISUALS_V1" && evidence.project_ref === PROJECT_REF && evidence.target_establishment_id === GUYSKULL, "GUYSKULL_05C_ROLLBACK_WRONG_TARGET");
  for (const item of evidence.planned) {
    if (!item.row_inserted) continue;
    const check = await api.rest(`school_images?select=id,establishment_id,url,storage_path,caption,status&id=eq.${item.id}`);
    assert(check.status === 200 && check.body.length === 1, "GUYSKULL_05C_ROLLBACK_ROW_MISSING");
    const row = check.body[0];
    assert(row.establishment_id === GUYSKULL && row.url === item.url && row.storage_path === item.storage_path && row.caption === item.caption && row.status === "live", "GUYSKULL_05C_ROLLBACK_ROW_DRIFT");
  }
  for (const item of [...evidence.planned].reverse()) {
    if (item.row_inserted) {
      const deleted = await api.rest(`school_images?id=eq.${item.id}&establishment_id=eq.${GUYSKULL}`, { method: "DELETE" });
      assert(deleted.status === 200 || deleted.status === 204, "GUYSKULL_05C_ROLLBACK_DB_FAILED");
      item.row_inserted = false; fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2), "utf8");
    }
    if (item.uploaded) {
      const deleted = await api.removeObjects(BUCKET, [item.storage_path]);
      assert(deleted.status === 200, "GUYSKULL_05C_ROLLBACK_STORAGE_FAILED");
      item.uploaded = false; fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2), "utf8");
    }
  }
}
module.exports = { rollback };
if (require.main === module) rollback().then(() => console.log("GUYSKULL-05C rollback complete.")).catch((error) => { console.error(`ABORT [${error.code || error.message}]`); process.exit(1); });
