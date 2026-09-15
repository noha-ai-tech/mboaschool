import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = path.resolve('src');
const cache = new Map();
function load(file) {
  const resolved = [file, `${file}.ts`, `${file}.tsx`].find((candidate) => fs.existsSync(candidate));
  if (!resolved) throw new Error(`Missing module ${file}`);
  if (cache.has(resolved)) return cache.get(resolved).exports;
  const module = { exports: {} };
  cache.set(resolved, module);
  const code = ts.transpileModule(fs.readFileSync(resolved, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const localRequire = (name) => {
    if (name === 'next/link') return ({ children, href, ...props }) => React.createElement('a', { ...props, href }, children);
    if (name === 'next/image') return ({ src, alt }) => React.createElement('img', { src, alt });
    if (name === '@/lib/supabase') return { supabase: {} };
    if (name.startsWith('@/')) return load(path.join(root, name.slice(2)));
    if (name.startsWith('.')) return load(path.resolve(path.dirname(resolved), name));
    return require(name);
  };
  vm.runInThisContext(`(function(require,module,exports){${code}\n})`, { filename: resolved })(localRequire, module, module.exports);
  return module.exports;
}
const { SchoolShowcase } = load(path.join(root, 'components/school/SchoolShowcase.tsx'));
function fixture(overrides = {}) {
  return {
    establishment: { id: 'school-alpha', name: 'Lycée Alpha', main_category: 'secondaire', city: 'Bafoussam', is_verified: false, is_claimed: false, logo_url: null, cover_image_url: null },
    fees: null, infra: null, images: [], docsList: [], sectionConfig: [], admissionsConfig: null, ranking: null, results: [], preinscriptionHref: '/preinscription?ecole=school-alpha', mode: 'public', ...overrides,
  };
}
const render = (data, activeView = 'accueil', baseHref = '/ecole/school-alpha') => renderToStaticMarkup(React.createElement(SchoolShowcase, { data, activeView, baseHref }));

test('an incomplete school retains the template without copied identity, photos, prices, or results', () => {
  const html = render(fixture());
  for (const label of ['Lycée Alpha', 'Présentation', 'Programmes et niveaux', 'Frais de scolarité', 'Galerie photos', 'Résultats et performances', 'Informations pratiques']) assert.ok(html.includes(label));
  assert.doesNotMatch(html, /GuySkull|guyskull|450 000|550 000|98%|95%|<img/);
  assert.ok(html.includes('/preinscription?ecole=school-alpha'));
});
test('CMS content and hero mode are reflected without another school leaking into the page', () => {
  const data = fixture();
  data.establishment = { ...data.establishment, id: 'school-beta', name: 'École Bêta', description: 'Présentation Bêta publiée', mission: 'Mission Bêta', hero_mode: 'none' };
  data.images = [{ id: 'photo', url: 'https://example.test/beta.jpg' }];
  data.admissionsConfig = { is_open: true, levels: ['Classe Bêta'], required_documents: [] };
  const html = render(data, 'etablissement', '/ecole/school-beta');
  assert.ok(html.includes('Présentation Bêta publiée') && html.includes('Mission Bêta'));
  assert.doesNotMatch(html, /Lycée Alpha|<img/);
  assert.ok(render(data).includes('Classe Bêta'));
});
test('hidden CMS sections do not expose their content and section ordering is respected', () => {
  const data = fixture();
  data.establishment.description = 'PRIVATE HIDDEN DESCRIPTION';
  data.sectionConfig = [{ key: 'pricing', is_visible: true }, { key: 'presentation', is_visible: false }, { key: 'admissions', is_visible: true }];
  const html = render(data);
  assert.doesNotMatch(html, /PRIVATE HIDDEN DESCRIPTION|id="presentation"/);
  assert.ok(html.indexOf('id="frais"') < html.indexOf('id="programmes"'));
});
test('preview and closed admissions do not expose an active preinscription link', () => {
  for (const data of [fixture({ mode: 'preview', preinscriptionHref: '#' }), fixture({ admissionsConfig: { is_open: false, levels: [], required_documents: [] } })]) {
    assert.doesNotMatch(render(data, 'admissions'), /href="(?:#|\/preinscription)/);
  }
});
test('every route uses the same school and preview links stay inside the preview tree', () => {
  const base = '/dashboard/ecole/etablissement/preview';
  for (const view of ['accueil', 'etablissement', 'admissions', 'vie', 'galerie']) {
    const html = render(fixture({ mode: 'preview', preinscriptionHref: '#' }), view, base);
    assert.ok(html.includes('Lycée Alpha'));
    assert.ok(html.includes(`${base}/formations-admissions#frais`));
    assert.ok(html.includes(`${base}/galerie-infos#contact`));
  }
});
test('qualified fees and published results are rendered from the school data', () => {
  const data = fixture({ fees: { currency: 'FCFA', legacy_amounts_qualified: true, tuition_fee: 123456, schedules: [], additional_fees: [] }, results: [{ examLabel: 'Baccalauréat Alpha', year: 2025, successRatePercent: 72 }] });
  const html = render(data);
  assert.ok(html.includes('123') && html.includes('456'));
  assert.ok(html.includes('Baccalauréat Alpha') && html.includes('72%'));
});
