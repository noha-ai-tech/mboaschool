import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = (file) => readFile(path.join(root, file), "utf8");

test("premium hero stays fully data-driven", async () => {
  const hero = await source("src/components/school/MiniSiteHero.tsx");
  const accueil = await source("src/components/school/views/AccueilView.tsx");
  assert.match(hero, /logoUrl\?: string \| null/);
  assert.match(hero, /categoryLabel\?: string \| null/);
  assert.match(hero, /locationLabel\?: string \| null/);
  assert.match(accueil, /logoUrl=\{school\.logo_url\}/);
  assert.match(accueil, /categoryLabel=\{categoryLabel\}/);
  assert.doesNotMatch(hero, />\s*(?:100%|98%|Top 10|Bastos)\s*</);
});

test("homepage composition follows CMS visibility and real content", async () => {
  const accueil = await source("src/components/school/views/AccueilView.tsx");
  assert.match(accueil, /flags\.showAdmissions && admissionsConfig\?\.levels\?\.length/);
  assert.match(accueil, /flags\.showPricing && fees/);
  assert.match(accueil, /MiniSiteEnvironmentShowcase/);
  assert.match(accueil, /MiniSiteResultsPreview/);
  assert.match(accueil, /SchoolQuickInfoAside data=\{data\}/);
});

test("quick actions are rendered only from actual school contact fields", async () => {
  const aside = await source("src/components/school/SchoolQuickInfoAside.tsx");
  assert.match(aside, /school\.phone &&/);
  assert.match(aside, /whatsappHref &&/);
  assert.match(aside, /school\.email \?/);
  assert.match(aside, /school\.website \?/);
  assert.doesNotMatch(aside, /6 99 12 34 56|guyskullschool/);
});
