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

const COMPONENT = "src/components/offline/SyncStatus.tsx";

test("les sept états requis par le brief sont tous couverts avec un libellé explicite", async () => {
  const src = await source(COMPONENT);
  assert.match(src, /online: \{ label: "Synchronisé"/);
  assert.match(src, /offline: \{ label: "Enregistré sur cet appareil"/);
  assert.match(src, /pending: \{ label: "Synchronisation en attente"/);
  assert.match(src, /syncing: \{ label: "Synchronisation…"/);
  assert.match(src, /error: \{ label: "Échec de synchronisation"/);
  assert.match(src, /conflict: \{ label: "Conflit à résoudre"/);
});

test("jamais 'Synchronisé' tant qu'il reste des mutations en attente ou en erreur (ordre de priorité des états)", async () => {
  const src = await source("src/lib/offline/useSyncStatus.ts");
  const priorityBlock = src.slice(src.indexOf('let displayState'), src.indexOf("return {"));
  const offlineIdx = priorityBlock.indexOf('"offline"');
  const syncingIdx = priorityBlock.indexOf('"syncing"');
  const conflictIdx = priorityBlock.indexOf('"conflict"');
  const errorIdx = priorityBlock.indexOf('"error"');
  const pendingIdx = priorityBlock.indexOf('"pending"');
  assert.ok(offlineIdx < syncingIdx && syncingIdx < conflictIdx && conflictIdx < errorIdx && errorIdx < pendingIdx, "l'ordre de priorité doit être offline > syncing > conflict > error > pending avant de retomber sur online");
});

test("un état error/conflict propose une action de retry explicite", async () => {
  const src = await source(COMPONENT);
  assert.match(src, /state === "error" \|\| state === "conflict"/);
  assert.match(src, /Réessayer/);
  assert.match(src, /onClick=\{retry\}/);
});

test("l'état online affiche l'horodatage de dernière synchronisation, jamais présenté comme du temps réel", async () => {
  const src = await source(COMPONENT);
  assert.match(src, /Dernière synchronisation : \{timestamp\}/);
});

test("le composant est accessible (role=status, aria-live) pour une mise à jour d'état non intrusive", async () => {
  const src = await source(COMPONENT);
  assert.match(src, /role="status"/);
  assert.match(src, /aria-live="polite"/);
});

test("useSyncStatus rafraîchit l'outbox périodiquement en plus des événements réseau — un changement hors du moteur (nouvelle saisie) reste visible", async () => {
  const src = await source("src/lib/offline/useSyncStatus.ts");
  assert.match(src, /window\.setInterval\(\(\) => refreshMutations\(getActiveSyncIdentity\(\)\.userId\), 4000\)/);
  assert.match(src, /window\.addEventListener\("online"/);
  assert.match(src, /window\.addEventListener\("offline"/);
});

// OFFLINE-01.2 (P1 fix) — <SyncStatus /> ne doit jamais compter les
// mutations d'un autre utilisateur. Voir
// tests/offline-outbox-isolation.test.mjs pour la preuve par exécution
// réelle (scénario 10) ; ces tests verrouillent le câblage source qui la
// rend possible.
test("useSyncStatus lit l'outbox scopée par l'identité active partagée, jamais un listMutations() global", async () => {
  const src = await source("src/lib/offline/useSyncStatus.ts");
  assert.match(src, /listMutations\(\{ userId: forUserId \}\)/);
  assert.doesNotMatch(src, /listMutations\(\)/);
});

test("un changement d'utilisateur actif vide immédiatement les compteurs affichés avant même que la nouvelle lecture ne revienne", async () => {
  const src = await source("src/lib/offline/useSyncStatus.ts");
  const subscribeBlock = src.slice(src.indexOf("subscribeActiveSyncIdentity((identity)"), src.indexOf("const onOnline"));
  assert.match(subscribeBlock, /setMutations\(EMPTY_SNAPSHOT_MUTATIONS\)/);
  assert.match(subscribeBlock, /refreshMutations\(identity\.userId\)/);
});

test("une lecture d'outbox devenue obsolète (l'utilisateur actif a changé pendant l'appel) est jetée plutôt qu'affichée", async () => {
  const src = await source("src/lib/offline/useSyncStatus.ts");
  const refreshFn = src.slice(src.indexOf("const refreshMutations ="), src.indexOf("}, []);"));
  assert.match(refreshFn, /if \(getActiveSyncIdentity\(\)\.userId !== forUserId\) return;/);
});

// MOBILE-01.2 — regression for a real bug found by browser E2E: the
// `online` state's initial useState value used to read `navigator.onLine`
// directly (`typeof navigator === "undefined" ? true : navigator.onLine`).
// The server can only ever assume "online" (no navigator exists there), so
// the moment a real browser's very first client render evaluated
// navigator.onLine as false, that first render diverged from the
// server-rendered HTML — a genuine React hydration error (#418), observed
// live on /enseignant/cours/[id] with Playwright against a real Next.js
// server. Locking the fix in place: the initial value must always be the
// server-safe literal `true`, with the real browser value applied only
// after mount, inside the effect.
test("useSyncStatus never reads navigator.onLine for its initial render — only the server-safe default, applied for real only after mount", async () => {
  const src = await source("src/lib/offline/useSyncStatus.ts");
  assert.match(src, /const \[online, setOnline\] = useState\(true\);/, "the initial client render must match what the server assumed (online), never read navigator.onLine synchronously");
  assert.doesNotMatch(
    src.slice(src.indexOf("const [online, setOnline]"), src.indexOf("useEffect(() => {")),
    /navigator\.onLine/,
    "navigator.onLine must never be read before the first effect runs (post-hydration) — reading it in the initial render/state reintroduces the hydration mismatch"
  );
  const effectBlock = src.slice(src.indexOf("useEffect(() => {"), src.indexOf("const onOnline ="));
  assert.match(effectBlock, /setOnline\(navigator\.onLine\)/, "the real value must be applied once mounted, inside the effect");
});
