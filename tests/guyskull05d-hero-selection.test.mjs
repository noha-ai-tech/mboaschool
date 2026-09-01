import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { HERO_FILES, PROJECT_REF, GUYSKULL } = require("../docs/guyskull/scripts/guyskull05d_order_hero.js");

test("Guyskull hero selection contains exactly the five editorial images", () => {
  assert.deepEqual(HERO_FILES, [
    "guyskull-campus-master-v1.png",
    "guyskull-facade-v1.png",
    "guyskull-courtyard-v1.png",
    "guyskull-classroom-v1.png",
    "guyskull-pedagogical-activity-v1.png",
  ]);
});

test("hero ordering remains hard-scoped to the exact project and school", () => {
  assert.equal(PROJECT_REF, "umcwwynrftidytxgqkwi");
  assert.equal(GUYSKULL, "a4cc4966-0d85-4c63-9c24-0538b8d5133b");
});
