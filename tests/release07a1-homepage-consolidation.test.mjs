import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = (file) => readFile(path.join(root, file), "utf8");

test("homepage statistics come from the server aggregate instead of a 1000-row browser query", async () => {
  const page = await source("src/app/page.tsx");
  const route = await source("src/app/api/homepage/route.ts");

  assert.doesNotMatch(page, /from\("establishments"\)/);
  assert.match(page, /fetch\("\/api\/homepage"/);
  assert.match(route, /count: from === 0 \? "exact" : undefined/);
  assert.match(route, /for \(let from = 0; ; from \+= PAGE_SIZE\)/);
  assert.doesNotMatch(page, /(?:1[ .]?000|2[ .]?255)\s+établissement/i);
});

test("homepage exposes category, region and dependent city filters to the directory", async () => {
  const page = await source("src/app/page.tsx");
  const search = await source("src/components/hero/HeroSearch.tsx");

  assert.match(search, /Toutes les catégories/);
  assert.match(search, /Filtrer par région/);
  assert.match(search, /Toutes les villes/);
  assert.match(page, /citiesForRegionFilter\(region\)/);
  assert.match(page, /setRegion\(value\); setCity\("all"\)/);
  assert.match(page, /params\.set\("region", region\)/);
  assert.match(page, /params\.set\("ville", city\)/);
  assert.match(page, /params\.set\("categorie", activeCategory\)/);
});

test("Guyskull is selected first, deduplicated and capped with generic featured schools", async () => {
  const route = await source("src/app/api/homepage/route.ts");

  assert.match(route, /a4cc4966-0d85-4c63-9c24-0538b8d5133b/);
  assert.match(route, /\[selected, \.\.\.\(generic \?\? \[\]\)\]/);
  assert.match(route, /findIndex\(\(candidate\) => candidate\.id === school\.id\) === index/);
  assert.match(route, /slice\(0, FEATURED_LIMIT\)/);
});

test("the shared logo uses the validated assets and does not alter favicon behavior", async () => {
  const logo = await source("src/components/branding/Logo.tsx");
  const manifest = await source("src/app/manifest.ts");

  assert.match(logo, /\/branding\/logo-dark\.png/);
  assert.match(logo, /\/branding\/logo-light\.png/);
  assert.doesNotMatch(logo, /<svg|glossyStyle/);
  assert.match(manifest, /\/branding\/favicon\.png/);
});

test("RELEASE-07 SEO surfaces remain present", async () => {
  const layout = await source("src/app/layout.tsx");
  const sitemap = await source("src/app/sitemap.ts");
  const robots = await source("src/app/robots.ts");

  assert.match(layout, /alternates:\s*\{\s*canonical:/s);
  assert.match(layout, /application\/ld\+json/);
  assert.match(layout, /openGraph:/);
  assert.match(sitemap, /MetadataRoute\.Sitemap/);
  assert.match(robots, /MetadataRoute\.Robots/);
});

test("search autocomplete suggests real cities and schools after two characters", async () => {
  const route = await source("src/app/api/search-suggestions/route.ts");
  const suggestions = await source("src/components/search/SearchSuggestions.tsx");
  const homepageSearch = await source("src/components/hero/HeroSearch.tsx");
  const directory = await source("src/app/recherche/page.tsx");

  assert.match(route, /normalized\.length < 2/);
  assert.match(route, /\.limit\(12\)/);
  assert.match(route, /select\("id, name, city, is_claimed"\)/);
  assert.match(suggestions, /setTimeout\(async \(\) =>/);
  assert.match(suggestions, /\/api\/search-suggestions/);
  assert.match(homepageSearch, /<SearchSuggestions/);
  assert.match(directory, /<SearchSuggestions/);
});
