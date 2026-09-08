import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { FILE, CAPTION, PROJECT_REF, GUYSKULL } = require("../docs/guyskull/scripts/guyskull05e_publish_office.js");
test("office asset is a single non-confirmed Guyskull concept", () => {
  assert.equal(FILE, "guyskull-office-reception-concept-v1.png");
  assert.match(CAPTION, /bureau.*accueil.*non confirmé/i);
  assert.equal(PROJECT_REF, "umcwwynrftidytxgqkwi");
  assert.equal(GUYSKULL, "a4cc4966-0d85-4c63-9c24-0538b8d5133b");
});
