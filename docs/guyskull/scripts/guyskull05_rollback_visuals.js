// Exact rollback for GUYSKULL-05B. It refuses any row/path drift and removes
// only ids and Storage objects recorded before publication.
const fs = require("fs");
const { EVIDENCE_PATH, GUYSKULL, BUCKET, PROJECT_REF } = require("./guyskull05_publish_visuals");
const liveClient = require("./guyskull05_client");

function assert(condition, code) {
  if (!condition) { const error = new Error(code); error.code = code; throw error; }
}

async function rollback(client = liveClient, evidencePath = EVIDENCE_PATH) {
  assert(fs.existsSync(evidencePath), "GUYSKULL_05_ROLLBACK_EVIDENCE_MISSING");
  const evidence = JSON.parse(fs.readFileSync(evidencePath, "utf8"));
  assert(evidence.marker === "GUYSKULL_05B_VISUALS_V1" && evidence.project_ref === PROJECT_REF && evidence.target_establishment_id === GUYSKULL, "GUYSKULL_05_ROLLBACK_WRONG_TARGET");

  for (const item of evidence.planned) {
    if (!item.row_inserted) continue;
    const check = await client.rest(`school_images?select=id,establishment_id,storage_path,caption,url,status&id=eq.${item.id}`);
    assert(check.status === 200 && check.body.length === 1, "GUYSKULL_05_ROLLBACK_ROW_MISSING");
    const row = check.body[0];
    assert(row.establishment_id === GUYSKULL && row.storage_path === item.storage_path && row.caption === item.caption && row.url === item.url && row.status === "live", "GUYSKULL_05_ROLLBACK_ROW_DRIFT");
  }

  for (const item of [...evidence.planned].reverse()) {
    if (item.row_inserted) {
      const removedRow = await client.rest(`school_images?id=eq.${item.id}&establishment_id=eq.${GUYSKULL}`, { method: "DELETE" });
      assert(removedRow.status === 200 || removedRow.status === 204, "GUYSKULL_05_ROLLBACK_DB_DELETE_FAILED");
      item.row_inserted = false;
      fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2), "utf8");
    }
    if (item.uploaded) {
      const removedObject = await client.removeObjects(BUCKET, [item.storage_path]);
      assert(removedObject.status === 200, "GUYSKULL_05_ROLLBACK_STORAGE_DELETE_FAILED");
      item.uploaded = false;
      fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2), "utf8");
    }
  }
  evidence.rolled_back_at = new Date().toISOString();
  fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2), "utf8");
}

module.exports = { rollback };

if (require.main === module) {
  rollback().then(() => console.log("GUYSKULL-05B exact rollback complete."))
    .catch((error) => { console.error(`ABORT [${error.code || "GUYSKULL_05_ROLLBACK_FATAL"}]`); process.exit(1); });
}
