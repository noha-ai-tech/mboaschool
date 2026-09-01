import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const visualPackSource = readFileSync(resolve(root, "src/lib/schoolPage/visualPacks.ts"), "utf8");
const editorSource = readFileSync(resolve(root, "src/app/dashboard/ecole/etablissement/page.tsx"), "utf8");
// GUYSKULL-05 — the preview fetch (and its visualPack query-param handling)
// moved from preview/page.tsx into the shared preview/layout.tsx (the 5
// mini-site views are now sibling routes under one layout, not client tabs).
const previewSource = readFileSync(resolve(root, "src/app/dashboard/ecole/etablissement/preview/layout.tsx"), "utf8");
const publicSource =
  readFileSync(resolve(root, "src/app/ecole/[id]/page.tsx"), "utf8") +
  readFileSync(resolve(root, "src/app/ecole/[id]/layout.tsx"), "utf8");

const expectedFiles = [
  "guyskull-campus-master-v1.png",
  "guyskull-facade-v1.png",
  "guyskull-courtyard-v1.png",
  "guyskull-classroom-v1.png",
  "guyskull-pedagogical-activity-v1.png",
  "guyskull-computer-room-concept-v1.png",
  "guyskull-library-concept-v1.png",
  "guyskull-play-sport-concept-v1.png",
  "guyskull-school-life-concept-v1.png",
  "guyskull-sanitary-concept-v1.png",
  "guyskull-canteen-concept-v1.png",
  "guyskull-office-reception-concept-v1.png",
];

test("Guyskull visual pack contains all twelve local assets in canonical order", () => {
  for (const filename of expectedFiles) {
    assert.equal(existsSync(resolve(root, "public/images/guyskull", filename)), true, `${filename} is missing`);
  }

  const positions = expectedFiles.map((filename) => visualPackSource.indexOf(filename));
  assert.ok(positions.every((position) => position >= 0), "every asset must be declared");
  assert.deepEqual([...positions].sort((a, b) => a - b), positions, "canonical editorial order must stay stable");
});

test("visual pack is scoped to the exact Guyskull establishment", () => {
  assert.match(visualPackSource, /a4cc4966-0d85-4c63-9c24-0538b8d5133b/);
  assert.match(visualPackSource, /candidate\.establishmentId === establishmentId/);
  assert.match(visualPackSource, /slug && slug !== pack\.slug/);
});

test("unverified facilities and activities remain explicitly gated", () => {
  assert.equal((visualPackSource.match(/facility_confirmation_required/g) ?? []).length, 7);
  assert.equal((visualPackSource.match(/activity_confirmation_required/g) ?? []).length, 3);
  assert.match(visualPackSource, /ne sont jamais ajoutés automatiquement à la galerie publiée/);
});

test("CMS exposes a read-only local review and preview path", () => {
  assert.match(editorSource, /SchoolVisualPackPanel/);
  assert.match(previewSource, /visualPack/);
  assert.match(previewSource, /localVisualPack\.assets\.map/);
  assert.doesNotMatch(previewSource, /\.from\("school_images"\)\.insert/);
  assert.doesNotMatch(previewSource, /storage\.from/);
});

test("public school page never imports or overlays the local visual pack", () => {
  assert.doesNotMatch(publicSource, /visualPacks|visualPack|guyskull-campus-master/);
});
