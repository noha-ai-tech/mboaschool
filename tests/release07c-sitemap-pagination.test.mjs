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

// RELEASE-CONSOLIDATION-07C — paginate.ts has zero imports (no "@/"
// aliases, no next/supabase), so — unlike sitemap.ts itself — it can be
// dynamically imported and exercised directly, without a real database.
const paginateModule = await import(
  pathToFileURL(path.join(projectRoot, "src/lib/sitemap/paginate.ts")).href
);
const { paginateAll } = paginateModule;

function makeMockFetcher(totalRows) {
  const rows = Array.from({ length: totalRows }, (_, i) => ({ id: `row-${i}` }));
  const calls = [];
  const fetchPage = async (from, to) => {
    calls.push([from, to]);
    return rows.slice(from, to + 1);
  };
  return { fetchPage, calls, rows };
}

for (const count of [0, 1, 999, 1000, 1001, 2255, 3417]) {
  test(`paginateAll retrieves exactly ${count} rows with pageSize 1000, no duplicates/gaps`, async () => {
    const { fetchPage, rows } = makeMockFetcher(count);
    const result = await paginateAll(1000, fetchPage);
    assert.equal(result.length, count, `expected exactly ${count} rows back`);
    assert.deepEqual(result.map((r) => r.id), rows.map((r) => r.id), "must match source order exactly, no duplicates or gaps");
    const uniqueIds = new Set(result.map((r) => r.id));
    assert.equal(uniqueIds.size, count, "no duplicate rows across page boundaries");
  });
}

test("paginateAll makes exactly ceil(count/pageSize) page requests, stopping as soon as a short batch is seen", async () => {
  const cases = [
    [0, 1],
    [1, 1],
    [999, 1],
    [1000, 2], // a full first page still requires one more fetch to confirm exhaustion
    [1001, 2],
    [2255, 3],
  ];
  for (const [count, expectedCalls] of cases) {
    const { fetchPage, calls } = makeMockFetcher(count);
    await paginateAll(1000, fetchPage);
    assert.equal(calls.length, expectedCalls, `count=${count} should make ${expectedCalls} page request(s), made ${calls.length}`);
  }
});

test("paginateAll does not assume a fixed total — grows past 2255 automatically (no hardcoded row-count assumption)", async () => {
  const { fetchPage } = makeMockFetcher(10456);
  const result = await paginateAll(1000, fetchPage);
  assert.equal(result.length, 10456);
});

test("sitemap.ts orders establishments by the stable unique id column, never the tie-prone updated_at column, for pagination", async () => {
  const src = await source("src/app/sitemap.ts");
  assert.match(src, /\.order\("id", \{ ascending: true \}\)/, "must paginate ordered by id, a stable unique key");
  assert.doesNotMatch(src, /\.order\("updated_at"/, "must not paginate ordered by updated_at (ties across rows risk skipped/duplicated rows at a page boundary)");
});

test("sitemap.ts uses paginateAll rather than a single unpaginated select()", async () => {
  const src = await source("src/app/sitemap.ts");
  assert.match(src, /paginateAll\(/);
  assert.doesNotMatch(src, /\.select\("id, updated_at"\)\s*\n\s*\.order\("updated_at"/, "must not regress to the old unpaginated query shape");
});

test("sitemap.ts still lists exactly one principal /ecole/[id] URL per establishment (no per-view subview URLs added)", async () => {
  const src = await source("src/app/sitemap.ts");
  assert.match(src, /url: `\$\{SITE_URL\}\/ecole\/\$\{school\.id\}`/);
  assert.doesNotMatch(src, /etablissement|formations-admissions|vie-resultats|galerie-infos/, "sitemap must not enumerate the 5 minisite subviews per school");
});

test("sitemap.ts eligibility is unchanged: only the homepage, 5 categories, and establishments — no private/dashboard/auth/admin/preview routes", async () => {
  const src = await source("src/app/sitemap.ts");
  for (const forbidden of ["/dashboard", "/auth", "/pro/", "/admin", "/preview", "/api/"]) {
    assert.ok(!src.includes(forbidden), `sitemap.ts must not reference private route "${forbidden}"`);
  }
});
