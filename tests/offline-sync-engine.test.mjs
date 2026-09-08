import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import test from "node:test";
import { clearOfflineCache } from "../src/lib/offline/db.ts";
import { enqueueMutation, listMutations } from "../src/lib/offline/outbox.ts";
import { runSync } from "../src/lib/offline/syncEngine.ts";

// OFFLINE-01 Phase 3/14 — exécution réelle du moteur de synchronisation
// (outbox réelle via fake-indexeddb + fetch simulé) plutôt que de simples
// assertions sur le texte source. Couvre directement les scénarios Phase 14
// F (double envoi), G (retry) et E (retour réseau après mutation offline).

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

test.beforeEach(async () => {
  await clearOfflineCache();
});

async function seedAbsenceMutation() {
  return enqueueMutation({
    entityType: "absence",
    operation: "create",
    entityId: null,
    payload: { staff_member_id: "staff-1", type: "absence", date_debut: "2026-09-01", date_fin: "2026-09-02" },
    baseVersion: null,
    userId: "user-1",
    establishmentId: "school-1",
  });
}

test("scénario D→E : une mutation en attente est envoyée au serveur et retirée de l'outbox une fois 'applied'", async () => {
  const mutation = await seedAbsenceMutation();
  let capturedBody = null;

  const fakeFetch = async (url, init) => {
    capturedBody = JSON.parse(init.body);
    return jsonResponse({ results: [{ mutationId: mutation.mutationId, status: "applied", serverId: "server-abs-1" }] });
  };

  await runSync(fakeFetch);

  assert.equal(capturedBody.mutations.length, 1);
  assert.equal(capturedBody.mutations[0].mutationId, mutation.mutationId);
  assert.equal((await listMutations()).length, 0, "une mutation confirmée 'applied' doit disparaître de l'outbox");
});

test("scénario F : le serveur renvoie 'duplicate' pour un second envoi du même mutationId — pas d'erreur, pas de doublon local", async () => {
  const mutation = await seedAbsenceMutation();
  const fakeFetch = async () =>
    jsonResponse({ results: [{ mutationId: mutation.mutationId, status: "duplicate", serverId: "server-abs-1" }] });

  await runSync(fakeFetch);
  assert.equal((await listMutations()).length, 0, "un statut 'duplicate' doit être traité comme un succès, la mutation sort de l'outbox");
});

test("scénario M : le serveur rejette une mutation (droit retiré) — jamais réessayée automatiquement, marquée 'rejected'", async () => {
  const mutation = await seedAbsenceMutation();
  const fakeFetch = async () =>
    jsonResponse({ results: [{ mutationId: mutation.mutationId, status: "rejected", error: "Accès refusé pour cet établissement" }] });

  await runSync(fakeFetch);
  const [stored] = await listMutations();
  assert.equal(stored.status, "rejected");
  assert.equal(stored.lastError, "Accès refusé pour cet établissement");
});

test("scénario O : le serveur signale un conflit de version — la mutation reste visible, jamais silencieusement appliquée ni supprimée", async () => {
  const mutation = await seedAbsenceMutation();
  const fakeFetch = async () =>
    jsonResponse({ results: [{ mutationId: mutation.mutationId, status: "conflict", error: "Conflit de version" }] });

  await runSync(fakeFetch);
  const [stored] = await listMutations();
  assert.equal(stored.status, "conflict");
});

test("scénario G/erreur réseau : une panne réseau pendant l'envoi marque la mutation 'error' avec un nextRetryAt futur, jamais silencieusement perdue", async () => {
  const mutation = await seedAbsenceMutation();
  const fakeFetch = async () => {
    throw new Error("network down");
  };

  await runSync(fakeFetch);
  const [stored] = await listMutations();
  assert.equal(stored.status, "error");
  assert.equal(stored.retryCount, 1);
  assert.ok(stored.nextRetryAt, "une mutation en erreur doit porter un prochain essai programmé");
  assert.ok(new Date(stored.nextRetryAt).getTime() > Date.now(), "nextRetryAt doit être dans le futur (backoff)");
});

test("hors-ligne : runSync ne tente aucun appel réseau et laisse la mutation intacte", async () => {
  await seedAbsenceMutation();
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "navigator", { value: { onLine: false }, configurable: true });

  let fetchCalled = false;
  const fakeFetch = async () => {
    fetchCalled = true;
    return jsonResponse({ results: [] });
  };

  try {
    await runSync(fakeFetch);
  } finally {
    if (originalNavigator) Object.defineProperty(globalThis, "navigator", originalNavigator);
  }

  assert.equal(fetchCalled, false, "aucun appel réseau ne doit être tenté hors-ligne");
  const [stored] = await listMutations();
  assert.equal(stored.status, "pending", "la mutation doit rester intacte et visible, jamais perdue");
});

test("un lot avec plusieurs mutations est envoyé en une seule requête (économie de data, Phase 6)", async () => {
  await seedAbsenceMutation();
  await seedAbsenceMutation();
  await seedAbsenceMutation();

  let callCount = 0;
  const fakeFetch = async (url, init) => {
    callCount += 1;
    const body = JSON.parse(init.body);
    return jsonResponse({
      results: body.mutations.map((m) => ({ mutationId: m.mutationId, status: "applied", serverId: `server-${m.mutationId}` })),
    });
  };

  await runSync(fakeFetch);
  assert.equal(callCount, 1, "trois mutations en attente doivent partir dans une seule requête HTTP, pas trois");
  assert.equal((await listMutations()).length, 0);
});
