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

// HOTFIX — a public school profile exists independently of whether it has
// been claimed. is_claimed must never decide where a public school card's
// primary click goes; claiming is a separate action. Regression guard for
// the exact bug: every public school-link site once had
// `school.isClaimed ? "/ecole/${id}" : "/auth/inscription?ecole=${id}"` —
// RELEASE-CONSOLIDATION-07D fixed only Guyskull's case via an API-layer
// override; this hotfix removes the conditional itself everywhere it
// appeared, so no unclaimed real school (or any future one) can regress.
const PUBLIC_SCHOOL_LINK_FILES = [
  "src/components/schools/SchoolCard.tsx",
  "src/components/search/SearchSuggestions.tsx",
  "src/lib/useSiteTickerItems.ts",
  "src/app/page.tsx",
  "src/app/categorie/[slug]/page.tsx",
];

test("no public school-link site branches on is_claimed/isClaimed to choose between /ecole and /auth/inscription", async () => {
  for (const file of PUBLIC_SCHOOL_LINK_FILES) {
    const src = await source(file);
    assert.doesNotMatch(
      src,
      /is_?[Cc]laimed[^\n]*\?[^\n]*\/auth\/inscription/,
      `${file} must not route unclaimed schools to /auth/inscription — a public profile exists regardless of claim status`
    );
  }
});

test("SchoolCard's primary href is unconditionally /ecole/{id}, never gated on claim status", async () => {
  const src = await source("src/components/schools/SchoolCard.tsx");
  assert.match(src, /const href = `\/ecole\/\$\{school\.id\}`;/);
});

test("SearchSuggestions routes school suggestions unconditionally to /ecole/{id}", async () => {
  const src = await source("src/components/search/SearchSuggestions.tsx");
  assert.match(src, /router\.push\(`\/ecole\/\$\{school\.id\}`\)/);
});

test("homepage and category-page ticker items link unconditionally to /ecole/{id} for the featured school", async () => {
  const homepage = await source("src/app/page.tsx");
  assert.match(homepage, /href: `\/ecole\/\$\{featuredSchools\[0\]\.id\}`,/);
  const category = await source("src/app/categorie/[slug]/page.tsx");
  assert.match(category, /href: `\/ecole\/\$\{featured\[0\]\.id\}`,/);
});

test("useSiteTickerItems links unconditionally to /ecole/{id} for the featured school", async () => {
  const src = await source("src/lib/useSiteTickerItems.ts");
  assert.match(src, /href: `\/ecole\/\$\{featured\.id\}`,/);
});

test("the now-unnecessary Guyskull-only is_claimed override was removed from /api/homepage", async () => {
  // The generic fix above makes the RELEASE-07D-era per-school override
  // redundant; leaving it in place would be confusing dead special-casing.
  const src = await source("src/app/api/homepage/route.ts");
  assert.doesNotMatch(src, /is_claimed: true/, "the Guyskull-specific is_claimed override should be removed now that the underlying bug is fixed generically");
  assert.match(src, /is_featured: true/, "the is_featured override (unrelated to this bug, controls a real display flag) must remain");
});

// RELEASE hotfix — homepage search filter labels. The floating search card
// is capped at max-w-[440px] (src/app/page.tsx) at every breakpoint from
// `sm:` upward, so a 3-column select row never has enough room for full
// French option text ("Toutes les catégories") and silently
// ellipsis-truncated to "Toutes les c...". Guards against regressing back
// to a cramped multi-column layout and confirms the clarifying labels exist.
test("HeroSearch stacks category/region/city selects one per row (never squeezed into 3 columns)", async () => {
  const src = await source("src/components/hero/HeroSearch.tsx");
  assert.doesNotMatch(src, /grid-cols-1 sm:grid-cols-3/, "must not reintroduce the 3-column layout that truncated select text inside the 440px-capped card");
  assert.match(src, /Catégories<\/p>/);
  assert.match(src, /Région<\/p>/);
  assert.match(src, /Ville<\/p>/);
});
