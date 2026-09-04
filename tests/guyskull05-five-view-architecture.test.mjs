import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildMiniSiteViewHref, resolveMiniSiteView, MINISITE_VIEWS } from "../src/lib/schoolPage/miniSiteViews.ts";

const root = new URL("../", import.meta.url);
async function src(path) {
  return readFile(new URL(path, root), "utf8");
}

// ==================== ROUTING UTILITY ====================

test("five public URLs — exact slugs for every view", () => {
  const id = "a4cc4966-0d85-4c63-9c24-0538b8d5133b";
  const base = `/ecole/${id}`;
  assert.equal(buildMiniSiteViewHref(base, "accueil"), base);
  assert.equal(buildMiniSiteViewHref(base, "etablissement"), `${base}/etablissement`);
  assert.equal(buildMiniSiteViewHref(base, "admissions"), `${base}/formations-admissions`);
  assert.equal(buildMiniSiteViewHref(base, "vie"), `${base}/vie-resultats`);
  assert.equal(buildMiniSiteViewHref(base, "galerie"), `${base}/galerie-infos`);
});

test("active navigation — resolveMiniSiteView identifies each view from its pathname", () => {
  const base = "/ecole/abc";
  assert.equal(resolveMiniSiteView(base, base), "accueil");
  assert.equal(resolveMiniSiteView(`${base}/`, base), "accueil");
  assert.equal(resolveMiniSiteView(`${base}/etablissement`, base), "etablissement");
  assert.equal(resolveMiniSiteView(`${base}/formations-admissions`, base), "admissions");
  assert.equal(resolveMiniSiteView(`${base}/vie-resultats`, base), "vie");
  assert.equal(resolveMiniSiteView(`${base}/galerie-infos`, base), "galerie");
});

test("active navigation — unknown/extra path segments fall back to accueil rather than throwing", () => {
  const base = "/ecole/abc";
  assert.equal(resolveMiniSiteView(`${base}/some-unknown-segment`, base), "accueil");
  assert.equal(resolveMiniSiteView("/completely/unrelated/path", base), "accueil");
});

test("exactly 5 views are declared, matching the mission's required order", () => {
  assert.deepEqual(
    MINISITE_VIEWS.map((v) => v.label),
    ["Accueil", "L'établissement", "Formations & Admissions", "Vie & Résultats", "Galerie & Infos"]
  );
});

// ==================== DIRECT-ROUTE-REFRESH ARCHITECTURE (static checks) ====================

test("public route tree has one page.tsx per view plus a shared layout.tsx (no client-only fake tabs)", async () => {
  // RELEASE-CONSOLIDATION-07 §3 — layout.tsx is now a thin Server Component
  // (owns per-school JSON-LD only); the client shell logic asserted here
  // moved verbatim into the sibling SchoolMiniSiteLayoutClient.tsx.
  const layoutClient = await src("src/app/ecole/[id]/SchoolMiniSiteLayoutClient.tsx");
  const accueil = await src("src/app/ecole/[id]/page.tsx");
  const etab = await src("src/app/ecole/[id]/etablissement/page.tsx");
  const admissions = await src("src/app/ecole/[id]/formations-admissions/page.tsx");
  const vie = await src("src/app/ecole/[id]/vie-resultats/page.tsx");
  const galerie = await src("src/app/ecole/[id]/galerie-infos/page.tsx");
  assert.match(layoutClient, /MiniSiteDataProvider/);
  assert.match(layoutClient, /resolveMiniSiteView/);
  for (const page of [accueil, etab, admissions, vie, galerie]) {
    assert.doesNotMatch(page, /useState<.*activeTab/i, "no page should hold its own fake tab state");
  }
});

test("CMS Preview route tree mirrors the same 5 sub-routes under one layout", async () => {
  const layout = await src("src/app/dashboard/ecole/etablissement/preview/layout.tsx");
  assert.match(layout, /MiniSiteDataProvider/);
  assert.match(layout, /resolveMiniSiteView/);
  for (const path of [
    "src/app/dashboard/ecole/etablissement/preview/page.tsx",
    "src/app/dashboard/ecole/etablissement/preview/etablissement/page.tsx",
    "src/app/dashboard/ecole/etablissement/preview/formations-admissions/page.tsx",
    "src/app/dashboard/ecole/etablissement/preview/vie-resultats/page.tsx",
    "src/app/dashboard/ecole/etablissement/preview/galerie-infos/page.tsx",
  ]) {
    const content = await src(path);
    assert.match(content, /useMiniSiteContext/);
  }
});

// ==================== PREVIEW / PUBLIC RENDERER PARITY ====================

test("preview and public routes for the same view import the exact same view component", async () => {
  // RELEASE-CONSOLIDATION-07 §3 — each public page.tsx now renders a
  // sibling *PageClient.tsx that holds the verbatim former view-component
  // import/render; that's where the component reference actually lives now.
  const pairs = [
    ["src/app/ecole/[id]/AccueilPageClient.tsx", "src/app/dashboard/ecole/etablissement/preview/page.tsx", "AccueilView"],
    ["src/app/ecole/[id]/etablissement/EtablissementPageClient.tsx", "src/app/dashboard/ecole/etablissement/preview/etablissement/page.tsx", "EtablissementView"],
    ["src/app/ecole/[id]/formations-admissions/FormationsAdmissionsPageClient.tsx", "src/app/dashboard/ecole/etablissement/preview/formations-admissions/page.tsx", "FormationsAdmissionsView"],
    ["src/app/ecole/[id]/vie-resultats/VieResultatsPageClient.tsx", "src/app/dashboard/ecole/etablissement/preview/vie-resultats/page.tsx", "VieResultatsView"],
    ["src/app/ecole/[id]/galerie-infos/GalerieInfosPageClient.tsx", "src/app/dashboard/ecole/etablissement/preview/galerie-infos/page.tsx", "GalerieInfosView"],
  ];
  for (const [publicPath, previewPath, componentName] of pairs) {
    const publicSrc = await src(publicPath);
    const previewSrc = await src(previewPath);
    assert.match(publicSrc, new RegExp(componentName), `${publicPath} must render ${componentName}`);
    assert.match(previewSrc, new RegExp(componentName), `${previewPath} must render ${componentName}`);
  }
});

test("shared shell (header/footer) is used by both the public layout and the preview layout — never a second implementation", async () => {
  // RELEASE-CONSOLIDATION-07 §3 — MiniSiteShell usage lives in
  // SchoolMiniSiteLayoutClient.tsx now; see layout.tsx split rationale above.
  const publicLayoutClient = await src("src/app/ecole/[id]/SchoolMiniSiteLayoutClient.tsx");
  const previewLayout = await src("src/app/dashboard/ecole/etablissement/preview/layout.tsx");
  assert.match(publicLayoutClient, /MiniSiteShell/);
  assert.match(previewLayout, /MiniSiteShell/);
});

// ==================== STRUCTURED PRICING — DETAIL + HOMEPAGE PREVIEW ====================

test("StructuredPricing remains in FormationsAdmissionsView and is conditionally previewed on Accueil", async () => {
  const admissionsView = await src("src/components/school/views/FormationsAdmissionsView.tsx");
  const accueilView = await src("src/components/school/views/AccueilView.tsx");
  assert.match(admissionsView, /<StructuredPricing/);
  assert.match(accueilView, /flags\.showPricing && fees && <StructuredPricing/);
});

// ==================== ACTIVE NAVIGATION / ACCESSIBILITY (static) ====================

test("header uses aria-current and real <Link> navigation, not onClick tab-switch state", async () => {
  const header = await src("src/components/school/SchoolSiteHeader.tsx");
  assert.match(header, /aria-current=\{activeView === view\.key \? "page" : undefined\}/);
  assert.doesNotMatch(header, /onTabChange/);
  assert.doesNotMatch(header, /useState<MiniSiteTabKey>/);
});

test("mobile navigation collapses into a labeled hamburger menu, not squeezed desktop tabs", async () => {
  const header = await src("src/components/school/SchoolSiteHeader.tsx");
  assert.match(header, /aria-label=\{menuOpen \? "Fermer le menu" : "Ouvrir le menu"\}/);
  assert.match(header, /lg:hidden/);
});

// ==================== MISSING OPTIONAL CONTENT / RESULTS-RANKING GATING ====================

test("results/ranking preview only renders when results or ranking actually exist", async () => {
  const accueilView = await src("src/components/school/views/AccueilView.tsx");
  assert.match(accueilView, /results\.length > 0 \|\| !!ranking/);
});

test("MiniSiteResultsPreview component itself is the single source of the empty-state gate (no duplicated logic per view)", async () => {
  const vieView = await src("src/components/school/views/VieResultatsView.tsx");
  assert.match(vieView, /<MiniSiteResultsPreview/);
  assert.doesNotMatch(vieView, /results\.map\(/, "VieResultatsView must not re-implement result-card rendering itself");
});
