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

// RELEASE-CONSOLIDATION-07 §1/§20 — professionalism regression guard.
// Deliberately scoped to a SHORT list of files that are entirely
// platform-owned copy (never real school-submitted content), matching the
// mission's explicit instruction to never globally forbid words that can
// legitimately appear in real school-provided content. Guyskull's required
// demo-pricing disclosure and any other genuine school content are
// intentionally out of scope here — this only guards the platform's own
// shell/chrome/metadata.
const PLATFORM_OWNED_FILES = [
  "src/app/layout.tsx",
  "src/app/robots.ts",
  "src/app/sitemap.ts",
  "src/lib/schoolPage/publicSchoolMeta.ts",
  "src/lib/schoolPage/miniSiteViews.ts",
  "src/components/layout/SiteHeader.tsx",
  "src/components/layout/SiteFooter.tsx",
];

// The old, retired internal/legacy product name — must never leak into
// user-visible platform copy now that the product is branded "Écoles237".
test("platform-owned files never reference the old internal brand name", async () => {
  for (const file of PLATFORM_OWNED_FILES) {
    const src = await source(file);
    assert.ok(!/MboaSchool/i.test(src), `${file} must not reference the retired internal brand name`);
  }
});

test("platform-owned files never contain Lorem ipsum placeholder copy", async () => {
  for (const file of PLATFORM_OWNED_FILES) {
    const src = await source(file);
    assert.ok(!/lorem ipsum/i.test(src), `${file} must not contain Lorem ipsum text`);
  }
});

test("root layout metadata brands the product as Écoles237, never a placeholder/internal name", async () => {
  const src = await source("src/app/layout.tsx");
  assert.match(src, /siteName: "Écoles237"/);
  assert.match(src, /default: "Écoles237/);
});

test("platform-owned files hardcode no non-fallback localhost/preview hostname", async () => {
  for (const file of PLATFORM_OWNED_FILES) {
    const src = await source(file);
    const withoutFallback = src.replace(/process\.env\.NEXT_PUBLIC_SITE_URL \?\? "http:\/\/localhost:3000"/g, "");
    assert.ok(!/localhost/i.test(withoutFallback), `${file} has a localhost reference outside the documented NEXT_PUBLIC_SITE_URL fallback`);
    assert.ok(!/vercel\.app/i.test(withoutFallback), `${file} must not hardcode a *.vercel.app preview hostname`);
  }
});
