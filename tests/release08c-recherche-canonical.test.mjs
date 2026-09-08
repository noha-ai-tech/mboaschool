import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(testDirectory, "..");

async function source(relativePath) {
  return readFile(path.join(projectRoot, relativePath), "utf8");
}

// RELEASE-CONSOLIDATION-08C §2 — /recherche is a "use client" page (no
// generateMetadata possible), so it silently inherited the root layout's
// canonical ("/"), pointing every visit — including from the homepage's
// own "Annuaire" nav link — back at the homepage instead of itself. Same
// server-layout-wraps-client-page pattern already used for
// /categorie/[slug]/layout.tsx.
test("recherche/layout.tsx is a Server Component exporting a static canonical to /recherche", async () => {
  const src = await source("src/app/recherche/layout.tsx");
  const firstNonCommentLine = src.split("\n").find((line) => line.trim() && !line.trim().startsWith("//"));
  assert.notEqual(firstNonCommentLine?.trim(), '"use client";', "must be a Server Component to export metadata (no top-of-file \"use client\" directive)");
  assert.match(src, /alternates:\s*\{\s*canonical:\s*"\/recherche"/, "canonical must be the bare route, never the homepage");
});

test("recherche canonical is index/follow (a real, useful directory page, not thin/duplicate content)", async () => {
  const src = await source("src/app/recherche/layout.tsx");
  assert.match(src, /robots:\s*\{\s*index:\s*true,\s*follow:\s*true,?\s*\}/);
});

test("recherche layout does not vary canonical by query string (no unbounded indexable filter-combination surfaces)", async () => {
  const src = await source("src/app/recherche/layout.tsx");
  // A static `export const metadata` (not an async generateMetadata reading
  // searchParams) guarantees every /recherche?... variant resolves to the
  // exact same canonical string.
  assert.match(src, /export const metadata: Metadata/);
  assert.doesNotMatch(src, /searchParams/);
});

test("recherche layout still renders children unchanged (no behavior change to the existing client page)", async () => {
  const src = await source("src/app/recherche/layout.tsx");
  assert.match(src, /return <>\{children\}<\/>;/);
});
