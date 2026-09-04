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

// RELEASE-CONSOLIDATION-07 §3-6 — regression coverage for the school
// mini-site SSR metadata/JSON-LD fix. publicSchoolMeta.ts imports
// "@/lib/supabase/server" (next/headers), which only resolves inside
// Next's own bundler/runtime, so — matching this repo's existing test
// convention for such modules (see pro05-auth-password-security.test.mjs) —
// these are static source-text assertions, not a live import/execution.

const miniSiteViewsModule = await import(
  pathToFileURL(path.join(projectRoot, "src/lib/schoolPage/miniSiteViews.ts")).href
);

test("MINISITE_VIEWS labels match the mission's exact per-view title vocabulary", () => {
  const labels = Object.fromEntries(miniSiteViewsModule.MINISITE_VIEWS.map((v) => [v.key, v.label]));
  assert.equal(labels.accueil, "Accueil");
  assert.equal(labels.etablissement, "L'établissement");
  assert.equal(labels.admissions, "Formations & Admissions");
  assert.equal(labels.vie, "Vie & Résultats");
  assert.equal(labels.galerie, "Galerie & Infos");
});

test("publicSchoolMeta.ts never emits fabricated structured-data fields", async () => {
  // Strip comment lines first — the file's own docstrings legitimately
  // NAME these fields to document that they're intentionally excluded.
  const codeOnly = (await source("src/lib/schoolPage/publicSchoolMeta.ts"))
    .split("\n")
    .filter((line) => !line.trim().startsWith("*") && !line.trim().startsWith("//"))
    .join("\n");
  for (const forbidden of ["aggregateRating", '"rating"', "priceRange", "foundingDate", "numberOfStudents", '"review"', "accreditation"]) {
    assert.ok(!codeOnly.includes(forbidden), `must never emit fabricated field: ${forbidden}`);
  }
});

test("publicSchoolMeta.ts uses the shared NEXT_PUBLIC_SITE_URL fallback pattern, not a hardcoded host", async () => {
  const src = await source("src/lib/schoolPage/publicSchoolMeta.ts");
  assert.match(src, /NEXT_PUBLIC_SITE_URL \?\? "http:\/\/localhost:3000"/);
  // schema.org is the required, static JSON-LD @context value — not a
  // hostname this code is choosing to point at itself.
  const hardcodedHostLiterals = (src.match(/https?:\/\/(?!localhost)[a-z0-9.-]+\.[a-z]{2,}/gi) ?? [])
    .filter((url) => !url.includes("schema.org"));
  assert.deepEqual(hardcodedHostLiterals, [], "no hardcoded production/preview hostname literals");
});

test("publicSchoolMeta.ts: canonical is always relative, never a pre-built absolute URL string", async () => {
  const src = await source("src/lib/schoolPage/publicSchoolMeta.ts");
  assert.match(src, /alternates: \{ canonical: path \}/);
});

test("publicSchoolMeta.ts: not-found school gets robots noindex, never a fabricated title", async () => {
  const src = await source("src/lib/schoolPage/publicSchoolMeta.ts");
  assert.match(src, /robots: \{ index: false, follow: true \}/);
  assert.match(src, /Établissement introuvable/);
});

test("publicSchoolMeta.ts: fetch is React-cache-deduped (single DB read per request across layout+page)", async () => {
  const src = await source("src/lib/schoolPage/publicSchoolMeta.ts");
  assert.match(src, /export const fetchPublicSchoolMetaSource = cache\(/);
});

test("school layout.tsx renders JSON-LD as a SIBLING of the client tree, not nested inside {children}", async () => {
  // Regression guard for the exact bug found+fixed this mission: JSON-LD
  // placed as page-level JSX (nested inside a Client Component's children)
  // streamed client-hydration-only and never appeared in raw SSR HTML.
  // Placing it as a sibling in the Server Component layout keeps it in the
  // synchronously-flushed response — verified via curl during this mission.
  const src = await source("src/app/ecole/[id]/layout.tsx");
  const clientWrapperIndex = src.indexOf("<SchoolMiniSiteLayoutClient>");
  const orgScriptIndex = src.indexOf("organizationJsonLd &&");
  assert.ok(orgScriptIndex >= 0 && clientWrapperIndex >= 0, "both markers must be present");
  assert.ok(orgScriptIndex < clientWrapperIndex, "JSON-LD must be emitted before (as a sibling of) the client wrapper, not inside it");
  assert.ok(!src.includes("{organizationJsonLd") || !/<SchoolMiniSiteLayoutClient>[\s\S]*organizationJsonLd/.test(src), "JSON-LD must not be nested inside <SchoolMiniSiteLayoutClient>...</SchoolMiniSiteLayoutClient>");
});

test("all 5 school-view page.tsx files export generateMetadata (not useEffect/document.title)", async () => {
  const files = [
    "src/app/ecole/[id]/page.tsx",
    "src/app/ecole/[id]/etablissement/page.tsx",
    "src/app/ecole/[id]/formations-admissions/page.tsx",
    "src/app/ecole/[id]/vie-resultats/page.tsx",
    "src/app/ecole/[id]/galerie-infos/page.tsx",
  ];
  for (const file of files) {
    const src = await source(file);
    assert.match(src, /export async function generateMetadata/, `${file} must export generateMetadata`);
    assert.ok(!src.includes("document.title"), `${file} must not mutate document.title`);
    assert.ok(!src.includes('"use client"'), `${file} must be a Server Component (no "use client")`);
  }
});

test("sitemap.ts category slugs never drift from catMeta.ts's real category keys", async () => {
  const sitemapSrc = await source("src/app/sitemap.ts");
  const catMetaSrc = await source("src/app/categorie/[slug]/catMeta.ts");
  const sitemapSlugs = [...sitemapSrc.matchAll(/"([a-z]+)"/g)].map((m) => m[1]).filter((s) => ["garderie", "primaire", "secondaire", "superieur", "autres"].includes(s));
  for (const slug of sitemapSlugs) {
    assert.ok(catMetaSrc.includes(`${slug}:`), `sitemap references category "${slug}" which must exist in CAT_META`);
  }
  assert.ok(sitemapSlugs.length === 5, "sitemap should list exactly the 5 known categories");
});
