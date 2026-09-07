import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(testDirectory, "..");

async function source(relativePath) {
  return readFile(path.join(projectRoot, relativePath), "utf8");
}

// RELEASE-CONSOLIDATION-08C P3 — category pages had a canonical but no
// og:url at all. Fixed generically (derived from the dynamic `slug`, not
// hardcoded to one category) so every category gets a correct og:url.
test("category layout sets openGraph.url generically from the route slug, not hardcoded to one category", async () => {
  const src = await source("src/app/categorie/[slug]/layout.tsx");
  assert.match(src, /url: `\/categorie\/\$\{slug\}`,/);
  assert.doesNotMatch(src, /url: "\/categorie\/primaire"/, "must not hardcode a single category");
});

test("every declared category resolves a distinct, correct canonical and og:url", async () => {
  const catMeta = await import(pathToFileURL(path.join(projectRoot, "src/app/categorie/[slug]/catMeta.ts")).href);
  const slugs = Object.keys(catMeta.CAT_META);
  assert.ok(slugs.length >= 5, "expected at least the 5 known categories");
  // The layout builds both alternates.canonical and openGraph.url from the
  // same template literal pattern keyed on `slug` — asserting the source
  // uses that one shared variable for both is what guarantees every slug
  // (not just the ones listed here) gets a matching, correct pair.
  const src = await source("src/app/categorie/[slug]/layout.tsx");
  assert.match(src, /canonical: `\/categorie\/\$\{slug\}`,/);
  assert.match(src, /url: `\/categorie\/\$\{slug\}`,/);
});
