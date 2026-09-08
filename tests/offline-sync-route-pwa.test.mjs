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

const ROUTE = "src/app/api/sync/push/route.ts";

test("la route exige une authentification avant tout traitement", async () => {
  const src = await source(ROUTE);
  const authIndex = src.indexOf("if (!user)");
  assert.ok(authIndex > -1);
  assert.match(src.slice(authIndex, authIndex + 100), /status: 401/);
});

test("la route plafonne la taille du lot (économie réseau / anti-abus, Phase 6)", async () => {
  const src = await source(ROUTE);
  assert.match(src, /mutations\.length > 50/);
});

test("la mutation métier réelle passe par la fonction RPC atomique, jamais par un insert direct dans cette route", async () => {
  const src = await source(ROUTE);
  assert.match(src, /\.rpc\("sync_apply_absence_create"/);
  assert.doesNotMatch(src, /\.from\("absences"\)\.insert/);
});

test("la route n'utilise jamais createAdminClient — RLS reste l'autorité (Phase 8)", async () => {
  const src = await source(ROUTE);
  assert.doesNotMatch(src, /createAdminClient/);
});

test("un type d'entité non pris en charge et une opération non câblée sont explicitement rejetés, jamais silencieusement ignorés", async () => {
  const src = await source(ROUTE);
  assert.match(src, /Type d'entité non pris en charge/);
  assert.match(src, /operation !== "create"/);
  assert.match(src, /non encore prise en charge pour/);
});

test("les rejets sans effet de bord métier utilisent un upsert idempotent (ignoreDuplicates) plutôt qu'un insert qui pourrait échouer en course", async () => {
  const src = await source(ROUTE);
  assert.match(src, /ignoreDuplicates: true/);
  assert.match(src, /onConflict: "mutation_id"/);
});

// PWA — Phase 7 : coquille applicative minimale, jamais de cache dangereux
// de pages sensibles.
test("le service worker exclut explicitement /api, /dashboard, /pro, /auth et /enseignant de toute mise en cache", async () => {
  const sw = await source("public/sw.js");
  assert.match(sw, /pathname\.startsWith\("\/api\/"\)/);
  assert.match(sw, /pathname\.startsWith\("\/dashboard\/"\)/);
  assert.match(sw, /pathname\.startsWith\("\/pro\/"\)/);
  assert.match(sw, /pathname\.startsWith\("\/auth\/"\)/);
  assert.match(sw, /pathname\.startsWith\("\/enseignant\/"\)/);
});

test("l'enregistrement du service worker gère le cas où l'événement 'load' est déjà passé au montage (readyState complete), pas seulement le cas où il reste à venir", async () => {
  // Bug réel trouvé en QA live : un simple addEventListener("load", ...)
  // raterait l'événement s'il a déjà eu lieu avant que ce composant client
  // ne se monte (fréquent : le montage post-hydratation React survient
  // souvent après le `load` du navigateur) — le service worker ne
  // s'enregistrait alors jamais, silencieusement.
  const src = await source("src/lib/offline/registerServiceWorker.ts");
  assert.match(src, /document\.readyState === "complete"/);
  assert.match(src, /doRegister\(\)/);
  assert.match(src, /addEventListener\("load", doRegister, \{ once: true \}\)/);
});

test("le service worker ignore les requêtes non-GET (jamais de mutation interceptée)", async () => {
  const sw = await source("public/sw.js");
  assert.match(sw, /if \(request\.method !== "GET"\) return;/);
});

test("le service worker ne répond en repli hors-ligne que pour une navigation dont le réseau a réellement échoué (network-first)", async () => {
  const sw = await source("public/sw.js");
  assert.match(sw, /request\.mode === "navigate"/);
  assert.match(sw, /fetch\(request\)\.catch\(\(\) => caches\.match\(OFFLINE_URL\)/);
});

test("la page /offline est statique, non indexée, et ne prétend enregistrer aucune donnée serveur", async () => {
  const src = await source("src/app/offline/page.tsx");
  assert.match(src, /robots: \{ index: false, follow: false \}/);
  assert.doesNotMatch(src, /supabase|fetch\(/);
});

test("OfflineRuntime nettoie tout le cache local au SIGNED_OUT (Phase 8) et câble le moteur de sync une seule fois", async () => {
  const src = await source("src/components/offline/OfflineRuntime.tsx");
  assert.match(src, /event === "SIGNED_OUT"/);
  assert.match(src, /clearOfflineCache\(\)/);
  assert.match(src, /initSyncEngine\(\)/);
  assert.match(src, /registerServiceWorker\(\)/);
});

test("le layout racine monte OfflineRuntime une seule fois", async () => {
  const src = await source("src/app/layout.tsx");
  assert.match(src, /<OfflineRuntime \/>/);
});
