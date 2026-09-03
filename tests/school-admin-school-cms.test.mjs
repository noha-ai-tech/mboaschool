import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("l’éditeur conserve les sections canoniques et les flux brouillon, aperçu et publication", async () => {
  const page = await read("src/app/dashboard/ecole/etablissement/page.tsx");
  assert.match(page, /CANONICAL_SECTION_KEYS\.map/);
  for (const section of ["presentation", "admissions", "pricing", "infrastructure", "gallery", "news", "documents", "contact"]) assert.match(page, new RegExp(`"${section}"`));
  assert.match(page, /fetch\("\/api\/school-page\/draft"/);
  assert.match(page, /fetch\("\/api\/school-page\/publish"/);
  assert.match(page, /expected_updated_at/);
  assert.match(page, /res\.status === 409/);
  assert.doesNotMatch(page, /\.from\("applications"\)/);
});

test("la distinction brouillon et publication immédiate reste explicite", async () => {
  const page = await read("src/app/dashboard/ecole/etablissement/page.tsx");
  assert.match(page, /admissions_config\.is_open/);
  assert.match(page, /fetch\("\/api\/school-page\/admissions"/);
  assert.match(page, /fetch\("\/api\/school-page\/news"/);
  assert.match(page, /fetch\("\/api\/school-page\/documents"/);
  assert.match(page, /draftPayload\.pricing\[f\.key\] != null/);
  assert.match(page, /String\(draftPayload\.pricing\[f\.key\]\)/);
});

test("l’aperçu reste privé, contextualisé et utilise le renderer public existant", async () => {
  // RELEASE-CONSOLIDATION-02 §5B — GUYSKULL-05 replaced the single-page
  // preview (fetch + buildSchoolPageSections inline in page.tsx) with a
  // five-view route tree: preview/layout.tsx now owns the fetch, the
  // private-preview banner, and the auth/establishment context; each
  // page.tsx (including the Accueil root asserted here) is a thin view
  // that only reads from useMiniSiteContext(). The equivalent public page
  // (src/app/ecole/[id]/page.tsx) follows the identical thin pattern.
  const previewLayout = await read("src/app/dashboard/ecole/etablissement/preview/layout.tsx");
  const previewPage = await read("src/app/dashboard/ecole/etablissement/preview/page.tsx");
  const publicPage = await read("src/app/ecole/[id]/page.tsx");
  assert.match(previewLayout, /fetch\("\/api\/school-page\/preview"\)/);
  assert.match(previewLayout, /MiniSiteDataProvider/);
  assert.match(previewLayout, /Cette version n&apos;est pas encore publique/);
  assert.doesNotMatch(previewLayout, /\.from\("applications"\)/);
  assert.match(previewPage, /useMiniSiteContext/);
  assert.match(publicPage, /useMiniSiteContext/);
});

test("la galerie reste une redirection unique et le tiroir conserve ses garanties accessibles", async () => {
  const gallery = await read("src/app/dashboard/ecole/galerie/page.tsx");
  const drawer = await read("src/components/cms/Drawer.tsx");
  const overlay = await read("src/components/school-admin/ui/Overlay.tsx");
  assert.match(gallery, /router\.replace\(withEstablishmentQuery\("\/dashboard\/ecole\/etablissement"/);
  assert.doesNotMatch(gallery, /import .*supabase|supabase\.|await .*\.upload\(/);
  assert.match(drawer, /SchoolAdminDrawer/);
  assert.match(drawer, /closeDisabled/);
  assert.match(overlay, /event\.key === "Escape"/);
  assert.match(overlay, /event\.key !== "Tab"/);
  assert.match(overlay, /document\.body\.style\.overflow = "hidden"/);
  assert.match(overlay, /restoreFocusRef\.current\?\.focus/);
});

test("les tests CMS sont exclusivement structurels et sans client distant", async () => {
  const source = await read("tests/school-admin-school-cms.test.mjs");
  assert.match(source, /node:fs\/promises/);
  assert.doesNotMatch(source, /from ["']@supabase|from ["']@\/lib\/supabase/);
});

test("les surfaces plein écran compensent exactement le padding mobile du shell", async () => {
  // RELEASE-CONSOLIDATION-02 §5B — the preview's full-screen wrapper now
  // lives in preview/layout.tsx (shared across all five views), not in
  // the individual page.tsx files.
  const [editor, previewLayout] = await Promise.all([
    read("src/app/dashboard/ecole/etablissement/page.tsx"),
    read("src/app/dashboard/ecole/etablissement/preview/layout.tsx"),
  ]);
  for (const source of [editor, previewLayout]) {
    assert.match(source, /-mx-4 -my-6/);
    assert.doesNotMatch(source, /className="-m-6 lg:-m-8/);
  }
});
