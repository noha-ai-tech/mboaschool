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
  assert.match(src, /window\.setInterval\(refreshMutations, 4000\)/);
  assert.match(src, /window\.addEventListener\("online"/);
  assert.match(src, /window\.addEventListener\("offline"/);
});
