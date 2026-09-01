import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { ASSETS, PROJECT_REF, GUYSKULL, preflight } = require("../docs/guyskull/scripts/guyskull05_publish_visuals.js");

function client(overrides = {}) {
  return {
    SUPABASE_URL: `https://${PROJECT_REF}.supabase.co`,
    rest: async (query) => {
      if (query.startsWith("establishments?")) return { status: 200, body: [{ id: GUYSKULL, name: "guyskull", main_category: "garderie", owner_id: "84884e49-3596-451a-b0b6-b8eeda4a9e50" }] };
      if (query.includes(`establishment_id=eq.${GUYSKULL}`)) return { status: 200, body: [{ id: "48295f7f-af6c-45e5-b110-e35b65a3962f", establishment_id: GUYSKULL, caption: null }] };
      return { status: 200, body: [{ id: "other", establishment_id: "00000000-0000-4000-8000-000000000001" }] };
    },
    getBucket: async () => ({ status: 200, body: { id: "school-images", public: true } }),
    ...overrides,
  };
}

test("the core publication contains exactly eight selected assets and safe demo captions", () => {
  assert.equal(ASSETS.length, 8);
  assert.ok(ASSETS.some((asset) => asset.file.includes("sanitary")));
  assert.ok(ASSETS.some((asset) => asset.file.includes("canteen")));
  assert.ok(!ASSETS.some((asset) => /computer|library|sport/.test(asset.file)));
  assert.ok(ASSETS.every((asset) => /concept|démonstration|confirmer/.test(asset.caption)));
});

test("preflight accepts only the exact production ref and exact Guyskull identity", async () => {
  const result = await preflight(client());
  assert.equal(result.school.id, GUYSKULL);
  await assert.rejects(() => preflight(client({ SUPABASE_URL: "https://wrong.supabase.co" })), /GUYSKULL_05_WRONG_PROJECT/);
  await assert.rejects(() => preflight(client({ rest: async (query) => query.startsWith("establishments?") ? { status: 200, body: [{ id: GUYSKULL, name: "other", main_category: "garderie", owner_id: "84884e49-3596-451a-b0b6-b8eeda4a9e50" }] } : { status: 200, body: [] } })), /GUYSKULL_05_TARGET_DRIFT/);
});

test("preflight refuses an already published selected caption", async () => {
  const duplicateClient = client({
    rest: async (query) => {
      if (query.startsWith("establishments?")) return { status: 200, body: [{ id: GUYSKULL, name: "guyskull", main_category: "garderie", owner_id: "84884e49-3596-451a-b0b6-b8eeda4a9e50" }] };
      if (query.includes(`establishment_id=eq.${GUYSKULL}`)) return { status: 200, body: [{ id: "duplicate", establishment_id: GUYSKULL, caption: ASSETS[0].caption }] };
      return { status: 200, body: [] };
    },
  });
  await assert.rejects(() => preflight(duplicateClient), /GUYSKULL_05_ALREADY_PUBLISHED/);
});
