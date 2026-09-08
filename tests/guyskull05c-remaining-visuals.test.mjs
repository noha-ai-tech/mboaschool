import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { ASSETS, PROJECT_REF, GUYSKULL } = require("../docs/guyskull/scripts/guyskull05c_publish_remaining_visuals.js");

test("the explicitly added facility batch contains only the three previously excluded concepts", () => {
  assert.equal(ASSETS.length, 3);
  assert.deepEqual(ASSETS.map((asset) => asset.file), [
    "guyskull-computer-room-concept-v1.png",
    "guyskull-library-concept-v1.png",
    "guyskull-play-sport-concept-v1.png",
  ]);
  assert.ok(ASSETS.every((asset) => asset.caption.includes("non confirmé")));
});

test("the remaining batch is hard-scoped to Ecoles237 and Guyskull", () => {
  assert.equal(PROJECT_REF, "umcwwynrftidytxgqkwi");
  assert.equal(GUYSKULL, "a4cc4966-0d85-4c63-9c24-0538b8d5133b");
});
