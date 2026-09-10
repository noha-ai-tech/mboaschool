import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import test from "node:test";
import { clearOfflineCache } from "../src/lib/offline/db.ts";
import { enqueueMutation, listMutations, listPendingMutations, removeMutation, updateMutation } from "../src/lib/offline/outbox.ts";
import { runSync } from "../src/lib/offline/syncEngine.ts";
import {
  __resetSyncIdentityForTests,
  getActiveSyncIdentity,
  setActiveSyncUser,
} from "../src/lib/offline/syncIdentity.ts";

// OFFLINE-01.2 (P1 fix) — la file IndexedDB doit être isolée par
// utilisateur actif dans la DATA ACCESS LAYER elle-même, pas seulement
// via l'UI ou le nettoyage au SIGNED_OUT. Ces 13 scénarios exécutent
// RÉELLEMENT l'outbox (fake-indexeddb) et le moteur de sync (fetch
// simulé) en simulant des bascules de session via setActiveSyncUser(),
// exactement comme OfflineRuntime le ferait en production.

const A = "user-A";
const B = "user-B";

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function alwaysAppliedFetch() {
  return async (url, init) => {
    const body = JSON.parse(init.body);
    return jsonResponse({ results: body.mutations.map((m) => ({ mutationId: m.mutationId, status: "applied", serverId: `server-${m.mutationId}` })) });
  };
}

async function seed(userId, establishmentId = "school-1", count = 1) {
  const created = [];
  for (let i = 0; i < count; i += 1) {
    created.push(
      await enqueueMutation({
        entityType: "absence",
        operation: "create",
        entityId: null,
        payload: { staff_member_id: `staff-${userId}-${i}`, type: "absence", date_debut: "2026-09-01", date_fin: "2026-09-02" },
        baseVersion: null,
        userId,
        establishmentId,
      })
    );
  }
  return created;
}

test.beforeEach(async () => {
  await clearOfflineCache();
  __resetSyncIdentityForTests();
});

// 1. A crée 3 mutations, A sync → 3 envoyées.
test("1. A crée 3 mutations, A sync → les 3 sont envoyées", async () => {
  setActiveSyncUser(A);
  await seed(A, "school-1", 3);

  let sentCount = 0;
  const fetchImpl = async (url, init) => {
    sentCount = JSON.parse(init.body).mutations.length;
    return alwaysAppliedFetch()(url, init);
  };

  await runSync({ fetchImpl });
  assert.equal(sentCount, 3);
  assert.equal((await listMutations({ userId: A })).length, 0);
});

// 2. A crée 3 mutations, B devient session active, B sync → 0 mutation A envoyée.
test("2. A crée 3 mutations puis B devient actif ; B sync → aucune mutation de A n'est envoyée", async () => {
  setActiveSyncUser(A);
  await seed(A, "school-1", 3);

  setActiveSyncUser(B); // B se connecte, aucune mutation locale pour B
  let fetchCalled = false;
  const fetchImpl = async () => {
    fetchCalled = true;
    return jsonResponse({ results: [] });
  };

  await runSync({ fetchImpl });
  assert.equal(fetchCalled, false, "B n'a rien à synchroniser — les mutations de A ne doivent jamais être ramassées");
  assert.equal((await listMutations({ userId: A })).length, 3, "les mutations de A doivent rester intactes, jamais touchées par la session de B");
});

// 3. A pending, B pending, B sync → uniquement B.
test("3. A et B ont chacun des mutations en attente ; le sync de B n'envoie que les siennes", async () => {
  setActiveSyncUser(A);
  await seed(A, "school-1", 2);
  setActiveSyncUser(B);
  const bMutations = await seed(B, "school-2", 1);

  let sentIds = [];
  const fetchImpl = async (url, init) => {
    sentIds = JSON.parse(init.body).mutations.map((m) => m.mutationId);
    return alwaysAppliedFetch()(url, init);
  };

  await runSync({ fetchImpl });
  assert.deepEqual(sentIds, [bMutations[0].mutationId]);
});

// 4. B sync réussie → mutations A restent intactes.
test("4. après un sync réussi de B, les mutations de A n'ont pas bougé", async () => {
  setActiveSyncUser(A);
  const aMutations = await seed(A, "school-1", 2);
  setActiveSyncUser(B);
  await seed(B, "school-2", 1);

  await runSync({ fetchImpl: alwaysAppliedFetch() });

  const aAfter = await listMutations({ userId: A });
  assert.equal(aAfter.length, 2);
  assert.deepEqual(
    aAfter.map((m) => m.status).sort(),
    ["pending", "pending"],
    "les mutations de A ne doivent porter aucune trace du sync de B"
  );
  assert.deepEqual(
    aAfter.map((m) => m.mutationId).sort(),
    aMutations.map((m) => m.mutationId).sort()
  );
});

// 5. A logout explicite → la stratégie de nettoyage prévue fonctionne.
test("5. logout explicite (SIGNED_OUT) déclenche bien clearOfflineCache — comportement inchangé", async () => {
  setActiveSyncUser(A);
  await seed(A, "school-1", 2);
  assert.equal((await listMutations({ userId: A })).length, 2);

  // OfflineRuntime appelle clearOfflineCache() sur SIGNED_OUT — simulé
  // directement ici (la logique d'abonnement elle-même est un composant
  // React, testée par ailleurs en QA navigateur / lecture de source).
  await clearOfflineCache();
  setActiveSyncUser(null);

  assert.equal((await listMutations({ userId: A })).length, 0);
});

// 6. A ferme l'app sans logout, B ouvre → aucune fuite.
test("6. A ferme l'application sans se déconnecter (pas de SIGNED_OUT) ; B ouvre l'app plus tard → aucune fuite", async () => {
  setActiveSyncUser(A);
  await seed(A, "school-1", 3);
  // Pas de clearOfflineCache() ici — c'est exactement le scénario du P1 :
  // A quitte sans SIGNED_OUT, les données restent en IndexedDB.

  __resetSyncIdentityForTests(); // simulate reload cold start, no user resolved yet
  setActiveSyncUser(B); // B se connecte directement, sans SIGNED_OUT intermédiaire

  const bView = await listMutations({ userId: B });
  assert.equal(bView.length, 0, "B ne doit voir aucune des mutations laissées par A");

  const bPending = await listPendingMutations({ userId: B });
  assert.equal(bPending.length, 0);

  // Les données de A existent toujours quelque part (pas perdues), mais
  // sont invisibles pour B — l'isolation vient du scoping, pas d'une
  // suppression destructrice du travail non synchronisé de A.
  assert.equal((await listMutations({ userId: A })).length, 3);
});

// 7. A sync démarre, session bascule vers B avant la réponse → la réponse de A ne touche pas B.
test("7. la session bascule vers B pendant qu'un sync de A est en vol ; la réponse tardive de A ne s'applique pas et ne touche jamais B", async () => {
  // A est l'utilisateur RÉELLEMENT actif au moment où son propre sync
  // démarre (comme en production, runSync() sans override lit l'identité
  // active) — c'est cette génération-là qui doit devenir obsolète.
  setActiveSyncUser(A);
  const [aMutation] = await seed(A, "school-1", 1);

  let resolveFetch;
  const pendingResponse = new Promise((resolve) => {
    resolveFetch = resolve;
  });

  const aSyncPromise = runSync({
    fetchImpl: async () => {
      await pendingResponse;
      return jsonResponse({ results: [{ mutationId: aMutation.mutationId, status: "applied", serverId: "server-a" }] });
    },
  });

  // La session bascule vers B AVANT que la réponse de A ne revienne —
  // B seed sa propre mutation seulement maintenant, une fois actif.
  setActiveSyncUser(B);
  const [bMutation] = await seed(B, "school-2", 1);

  resolveFetch();
  await aSyncPromise;

  // La mutation de A ne doit PAS avoir été marquée "applied"/supprimée
  // sur la base d'une réponse devenue obsolète — elle redevient "pending"
  // pour être retentée proprement plus tard.
  const aAfter = await listMutations({ userId: A });
  assert.equal(aAfter.length, 1);
  assert.equal(aAfter[0].status, "pending", "une réponse obsolète ne doit jamais marquer 'applied' silencieusement");

  // La mutation de B, elle, n'a jamais été touchée par ce cycle de A.
  const bAfter = await listMutations({ userId: B });
  assert.equal(bAfter.length, 1);
  assert.equal(bAfter[0].mutationId, bMutation.mutationId);
  assert.equal(bAfter[0].status, "pending");
});

// 8. A et B utilisent le même mutationId localement → isolation correcte côté client
// (le comportement serveur pour une vraie collision cross-user est couvert
// et documenté séparément par tests/offline-sync-security-postgres.test.mjs,
// issu du correctif OFFLINE-01.1).
test("8. si B tente d'agir sur le mutationId d'une ligne appartenant à A (id connu/deviné/collision), la couche d'accès aux données refuse — la ligne de A reste intacte", async () => {
  setActiveSyncUser(A);
  const [aMutation] = await seed(A, "school-1", 1);

  // B tente d'agir directement sur ce mutationId (bug applicatif, ou
  // tentative malveillante) — updateMutation/removeMutation DOIVENT
  // refuser puisque la ligne appartient à A, jamais à B.
  const updateAsB = await updateMutation(aMutation.mutationId, { status: "rejected" }, { userId: B });
  assert.equal(updateAsB.ok, false, "B ne doit jamais pouvoir modifier une ligne appartenant à A, même en connaissant son mutationId");

  const removeAsB = await removeMutation(aMutation.mutationId, { userId: B });
  assert.equal(removeAsB.ok, false, "B ne doit jamais pouvoir supprimer une ligne appartenant à A");

  const stillA = await listMutations({ userId: A });
  assert.equal(stillA.length, 1);
  assert.equal(stillA[0].status, "pending", "la ligne de A doit rester intacte après les tentatives de B");
});

// 9. Même utilisateur, deux établissements → gérées sans fuite (ne casse pas le multi-écoles).
test("9. le même utilisateur avec deux établissements voit ses mutations école X et école Y toutes deux synchronisées ensemble", async () => {
  setActiveSyncUser(A);
  await seed(A, "school-X", 1);
  await seed(A, "school-Y", 1);

  let sentEstablishments = [];
  const fetchImpl = async (url, init) => {
    sentEstablishments = JSON.parse(init.body).mutations.map((m) => m.establishmentId);
    return alwaysAppliedFetch()(url, init);
  };

  await runSync({ fetchImpl });
  assert.deepEqual(sentEstablishments.sort(), ["school-X", "school-Y"], "le multi-écoles pour un même utilisateur ne doit pas être cassé par le scoping par userId");
});

// 10. SyncStatus (via listMutations scopé) pour B ne compte jamais A.
test("10. une lecture scopée sur B ne compte jamais les mutations de A (base du comptage affiché par <SyncStatus />)", async () => {
  setActiveSyncUser(A);
  await seed(A, "school-1", 5);
  setActiveSyncUser(B);

  const bCount = (await listMutations({ userId: B })).length;
  assert.equal(bCount, 0, "B doit voir 0 mutation en attente, jamais les 5 de A");
});

// 11. Conflits de A invisibles pour B.
test("11. un conflit sur une mutation de A n'apparaît jamais dans la lecture scopée de B", async () => {
  setActiveSyncUser(A);
  const [aMutation] = await seed(A, "school-1", 1);
  await updateMutation(aMutation.mutationId, { status: "conflict", lastError: "Conflit A" }, { userId: A });

  const bView = await listMutations({ userId: B });
  assert.equal(bView.filter((m) => m.status === "conflict").length, 0);
});

// 12. Erreurs de A invisibles pour B.
test("12. une erreur sur une mutation de A n'apparaît jamais dans la lecture scopée de B", async () => {
  setActiveSyncUser(A);
  const [aMutation] = await seed(A, "school-1", 1);
  await updateMutation(aMutation.mutationId, { status: "error", lastError: "Erreur A" }, { userId: A });

  const bView = await listMutations({ userId: B });
  assert.equal(bView.filter((m) => m.status === "error").length, 0);
});

// 13. retry de B ne retente jamais une mutation de A.
test("13. triggerManualSync/runSync pour B ne retente jamais une mutation en erreur appartenant à A", async () => {
  setActiveSyncUser(A);
  const [aMutation] = await seed(A, "school-1", 1);
  await updateMutation(aMutation.mutationId, { status: "error", nextRetryAt: null }, { userId: A });

  setActiveSyncUser(B);
  let fetchCalled = false;
  const fetchImpl = async () => {
    fetchCalled = true;
    return jsonResponse({ results: [] });
  };

  await runSync({ fetchImpl });
  assert.equal(fetchCalled, false, "B n'a rien en attente — le retry de A ne doit jamais être ramassé par le sync de B");

  const aAfter = await listMutations({ userId: A });
  assert.equal(aAfter[0].status, "error", "la mutation en erreur de A doit rester intacte, jamais retentée par B");
});

test("l'identité active est idempotente : redéfinir le même userId ne change pas la génération (ne casse pas un sync en cours pour rien)", () => {
  __resetSyncIdentityForTests();
  setActiveSyncUser(A);
  const gen1 = getActiveSyncIdentity().generation;
  setActiveSyncUser(A);
  const gen2 = getActiveSyncIdentity().generation;
  assert.equal(gen1, gen2);

  setActiveSyncUser(B);
  const gen3 = getActiveSyncIdentity().generation;
  assert.notEqual(gen1, gen3, "changer réellement d'utilisateur doit incrémenter la génération");
});
