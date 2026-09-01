// Restores only the five original created_at values captured by 05D.
const fs = require("fs");
const client = require("./guyskull05_client");
const { EVIDENCE_PATH, PROJECT_REF, GUYSKULL } = require("./guyskull05d_order_hero");
function assert(condition, code) { if (!condition) { const error = new Error(code); error.code = code; throw error; } }
async function rollback(api = client) {
  assert(fs.existsSync(EVIDENCE_PATH), "GUYSKULL_05D_ROLLBACK_EVIDENCE_MISSING");
  const evidence = JSON.parse(fs.readFileSync(EVIDENCE_PATH, "utf8"));
  assert(evidence.marker === "GUYSKULL_05D_HERO_ORDER_V1" && evidence.project_ref === PROJECT_REF && evidence.target_establishment_id === GUYSKULL, "GUYSKULL_05D_ROLLBACK_WRONG_TARGET");
  for (const item of evidence.planned) {
    if (!item.applied) continue;
    const check = await api.rest(`school_images?select=id,created_at&id=eq.${item.id}&establishment_id=eq.${GUYSKULL}`);
    assert(check.status === 200 && check.body.length === 1 && check.body[0].created_at === item.ordered_created_at, "GUYSKULL_05D_ROLLBACK_DRIFT");
  }
  for (const item of [...evidence.planned].reverse()) {
    if (!item.applied) continue;
    const restored = await api.rest(`school_images?id=eq.${item.id}&establishment_id=eq.${GUYSKULL}`, { method: "PATCH", body: { created_at: item.original_created_at } });
    assert(restored.status === 200 || restored.status === 204, "GUYSKULL_05D_ROLLBACK_UPDATE_FAILED");
    item.applied = false; fs.writeFileSync(EVIDENCE_PATH, JSON.stringify(evidence, null, 2), "utf8");
  }
}
module.exports = { rollback };
if (require.main === module) rollback().then(() => console.log("GUYSKULL-05D hero order rollback complete.")).catch((error) => { console.error(`ABORT [${error.code || error.message}]`); process.exit(1); });
