import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import test from "node:test";
import { clearOfflineCache } from "../src/lib/offline/db.ts";
import {
  computeNextRetryAt,
  enqueueMutation,
  listMutations,
  listPendingMutations,
  removeMutation,
  updateMutation,
} from "../src/lib/offline/outbox.ts";

// OFFLINE-01 Phase 1/2 — ces tests exécutent RÉELLEMENT le store IndexedDB
// et l'outbox (via fake-indexeddb, une implémentation pure JS de l'API
// IndexedDB standard) plutôt que de se contenter d'inspecter le code
// source : le contrat d'idempotence/ordre/retry est vérifié par exécution.
//
// OFFLINE-01.2 — listMutations/listPendingMutations/updateMutation/
// removeMutation exigent désormais un { userId } explicite ; voir
// tests/offline-outbox-isolation.test.mjs pour la couverture dédiée à
// l'isolation cross-utilisateur elle-même.

const U = "u";

test.beforeEach(async () => {
  await clearOfflineCache();
});

test("enqueueMutation persiste une mutation avec un statut 'pending' et un mutationId unique", async () => {
  const a = await enqueueMutation({
    entityType: "absence",
    operation: "create",
    entityId: null,
    payload: { staff_member_id: "s1", type: "absence", date_debut: "2026-09-01", date_fin: "2026-09-02" },
    baseVersion: null,
    userId: "user-1",
    establishmentId: "school-1",
  });
  const b = await enqueueMutation({
    entityType: "absence",
    operation: "create",
    entityId: null,
    payload: { staff_member_id: "s2", type: "conge", date_debut: "2026-09-03", date_fin: "2026-09-04" },
    baseVersion: null,
    userId: "user-1",
    establishmentId: "school-1",
  });

  assert.notEqual(a.mutationId, b.mutationId);
  assert.equal(a.status, "pending");
  assert.equal(a.retryCount, 0);

  const all = await listMutations({ userId: "user-1" });
  assert.equal(all.length, 2);
});

test("listMutations refuse un appel sans userId — jamais de lecture non scopée de l'outbox", async () => {
  await assert.rejects(() => listMutations({}), /userId/);
  await assert.rejects(() => listMutations(), /userId/);
});

test("listMutations conserve l'ordre chronologique (createdAtLocal croissant)", async () => {
  const first = await enqueueMutation({
    entityType: "absence", operation: "create", entityId: null,
    payload: {}, baseVersion: null, userId: U, establishmentId: "e",
  });
  await new Promise((r) => setTimeout(r, 5));
  const second = await enqueueMutation({
    entityType: "absence", operation: "create", entityId: null,
    payload: {}, baseVersion: null, userId: U, establishmentId: "e",
  });

  const all = await listMutations({ userId: U });
  assert.deepEqual(all.map((m) => m.mutationId), [first.mutationId, second.mutationId]);
});

test("listPendingMutations exclut les mutations déjà 'synced' ou 'rejected'", async () => {
  const pending = await enqueueMutation({
    entityType: "absence", operation: "create", entityId: null,
    payload: {}, baseVersion: null, userId: U, establishmentId: "e",
  });
  const rejected = await enqueueMutation({
    entityType: "absence", operation: "create", entityId: null,
    payload: {}, baseVersion: null, userId: U, establishmentId: "e",
  });
  await updateMutation(rejected.mutationId, { status: "rejected" }, { userId: U });

  const result = await listPendingMutations({ userId: U });
  assert.deepEqual(result.map((m) => m.mutationId), [pending.mutationId]);
});

test("listPendingMutations respecte le backoff : une mutation en erreur avec nextRetryAt futur n'est pas reprise trop tôt", async () => {
  const mutation = await enqueueMutation({
    entityType: "absence", operation: "create", entityId: null,
    payload: {}, baseVersion: null, userId: U, establishmentId: "e",
  });
  const future = new Date(Date.now() + 60_000).toISOString();
  await updateMutation(mutation.mutationId, { status: "error", nextRetryAt: future }, { userId: U });

  const now = new Date();
  const stillWaiting = await listPendingMutations({ userId: U }, now);
  assert.equal(stillWaiting.length, 0, "ne doit pas être repris avant nextRetryAt");

  const later = new Date(Date.now() + 120_000);
  const readyNow = await listPendingMutations({ userId: U }, later);
  assert.equal(readyNow.length, 1, "doit redevenir éligible une fois nextRetryAt dépassé");
});

test("computeNextRetryAt applique un backoff exponentiel plafonné à 5 minutes", () => {
  const from = new Date("2026-01-01T00:00:00.000Z");
  const r0 = new Date(computeNextRetryAt(0, from));
  const r3 = new Date(computeNextRetryAt(3, from));
  const r10 = new Date(computeNextRetryAt(10, from));

  assert.equal(r0.getTime() - from.getTime(), 5000);
  assert.equal(r3.getTime() - from.getTime(), 40_000);
  assert.equal(r10.getTime() - from.getTime(), 5 * 60 * 1000, "doit être plafonné, pas illimité");
});

test("updateMutation renvoie { ok: false } et ne modifie rien pour un mutationId inexistant", async () => {
  const result = await updateMutation("does-not-exist", { status: "error" }, { userId: U });
  assert.equal(result.ok, false);
});

test("removeMutation supprime bien la mutation de l'outbox (utilisé après un ack serveur)", async () => {
  const mutation = await enqueueMutation({
    entityType: "absence", operation: "create", entityId: null,
    payload: {}, baseVersion: null, userId: U, establishmentId: "e",
  });
  const result = await removeMutation(mutation.mutationId, { userId: U });
  assert.equal(result.ok, true);
  const remaining = await listMutations({ userId: U });
  assert.equal(remaining.length, 0);
});

test("clearOfflineCache efface tout l'outbox (nettoyage logout, Phase 8) — aucune fuite entre comptes", async () => {
  await enqueueMutation({
    entityType: "absence", operation: "create", entityId: null,
    payload: {}, baseVersion: null, userId: "user-a", establishmentId: "school-a",
  });
  assert.equal((await listMutations({ userId: "user-a" })).length, 1);

  await clearOfflineCache();

  assert.equal((await listMutations({ userId: "user-a" })).length, 0, "le cache doit être totalement vide après un logout");
});
