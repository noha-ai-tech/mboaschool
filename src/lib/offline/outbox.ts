// OFFLINE-01 Phase 2 — outbox locale des mutations offline.
//
// OFFLINE-01.2 (P1 fix) — TOUTE lecture/mise à jour/suppression utilisée
// par un chemin authentifié (sync, statut, retry) doit être scopée par
// userId. Il n'existe plus d'API générique "toutes les mutations, peu
// importe à qui" utilisable pour cela : listMutations/listPendingMutations
// exigent un userId, et updateMutation/removeMutation vérifient que la
// ligne visée appartient bien au userId fourni avant d'agir — jamais
// après coup, jamais en se fiant à l'appelant pour avoir déjà filtré.

import { OUTBOX_STORE, getAllByIndex, openOfflineDb, runInStore } from "./db.ts";
import type { EnqueueMutationInput, MutationStatus, OfflineMutation } from "./types.ts";

function generateId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  // Environnement de test sans crypto.randomUUID — jamais utilisé en production.
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export async function enqueueMutation<TPayload>(
  input: EnqueueMutationInput<TPayload>
): Promise<OfflineMutation<TPayload>> {
  const now = new Date().toISOString();
  const mutation: OfflineMutation<TPayload> = {
    mutationId: generateId(),
    localId: generateId(),
    entityType: input.entityType,
    operation: input.operation,
    entityId: input.entityId,
    payload: input.payload,
    baseVersion: input.baseVersion,
    deviceTimestamp: now,
    userId: input.userId,
    establishmentId: input.establishmentId,
    status: "pending",
    retryCount: 0,
    lastError: null,
    nextRetryAt: null,
    createdAtLocal: now,
    syncedAt: null,
  };

  await runInStore(OUTBOX_STORE, "readwrite", (store) => store.add(mutation));
  return mutation;
}

// isCurrent est évalué dans la transaction, juste avant put/delete.
export type UserScope = { userId: string; isCurrent?: () => boolean };

// Jamais de valeur par défaut permettant d'omettre userId — un appel sans
// userId explicite est une erreur de programmation, pas un cas à
// supporter silencieusement (cela reproduirait exactement le P1 corrigé
// ici : un appelant qui "oublie" de scoper).
export async function listMutations(scope: UserScope): Promise<OfflineMutation[]> {
  if (!scope?.userId) {
    throw new Error("listMutations requiert un userId — jamais de lecture non scopée de l'outbox");
  }
  const rows = await getAllByIndex<OfflineMutation>(OUTBOX_STORE, "by_userId", scope.userId);
  return rows.sort((a, b) => a.createdAtLocal.localeCompare(b.createdAtLocal));
}

export async function listPendingMutations(scope: UserScope, now: Date = new Date()): Promise<OfflineMutation[]> {
  const all = await listMutations(scope);
  return all.filter((mutation) => {
    if (mutation.status === "synced" || mutation.status === "rejected") return false;
    if (mutation.status === "syncing") return false;
    if (mutation.nextRetryAt && new Date(mutation.nextRetryAt) > now) return false;
    return true;
  });
}

// Note : implémenté avec sa propre transaction plutôt qu'avec runInStore()
// — un get-puis-put chaîné a besoin que la transaction reste ouverte
// jusqu'à ce que le put() soit effectivement émis, ce que le contrat
// "une seule requête" de runInStore() ne permet pas d'exprimer proprement.
//
// Retourne { ok: false } sans rien écrire si la ligne n'appartient pas au
// userId fourni (ou n'existe pas) — jamais une exception qui interromprait
// le traitement du reste d'un lot, jamais un écrasement silencieux d'une
// mutation étrangère.
export async function updateMutation(
  mutationId: string,
  patch: Partial<OfflineMutation>,
  scope: UserScope
): Promise<{ ok: boolean }> {
  if (!scope?.userId) {
    throw new Error("updateMutation requiert un userId — jamais d'écriture non scopée de l'outbox");
  }
  const db = await openOfflineDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(OUTBOX_STORE, "readwrite");
    const store = tx.objectStore(OUTBOX_STORE);
    const getRequest = store.get(mutationId);
    let ok = false;

    getRequest.onsuccess = () => {
      const existing = getRequest.result as OfflineMutation | undefined;
      if (existing && existing.userId === scope.userId && (scope.isCurrent?.() ?? true)) {
        store.put({ ...existing, ...patch });
        ok = true;
      }
      // Ligne absente OU appartenant à un autre utilisateur : ne rien
      // faire — elle doit rester intacte pour son propriétaire réel.
    };
    getRequest.onerror = () => reject(getRequest.error ?? new Error("Échec de lecture de la mutation"));

    tx.oncomplete = () => resolve({ ok });
    tx.onerror = () => reject(tx.error ?? new Error("Transaction outbox échouée"));
    tx.onabort = () => reject(tx.error ?? new Error("Transaction outbox annulée"));
  });
}

export async function removeMutation(mutationId: string, scope: UserScope): Promise<{ ok: boolean }> {
  if (!scope?.userId) {
    throw new Error("removeMutation requiert un userId — jamais de suppression non scopée de l'outbox");
  }
  const db = await openOfflineDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(OUTBOX_STORE, "readwrite");
    const store = tx.objectStore(OUTBOX_STORE);
    const getRequest = store.get(mutationId);
    let ok = false;

    getRequest.onsuccess = () => {
      const existing = getRequest.result as OfflineMutation | undefined;
      if (existing && existing.userId === scope.userId && (scope.isCurrent?.() ?? true)) {
        store.delete(mutationId);
        ok = true;
      }
    };
    getRequest.onerror = () => reject(getRequest.error ?? new Error("Échec de lecture de la mutation"));

    tx.oncomplete = () => resolve({ ok });
    tx.onerror = () => reject(tx.error ?? new Error("Transaction outbox échouée"));
    tx.onabort = () => reject(tx.error ?? new Error("Transaction outbox annulée"));
  });
}

export function setMutationStatus(
  mutationId: string,
  status: MutationStatus,
  scope: UserScope,
  extra: Partial<OfflineMutation> = {}
): Promise<{ ok: boolean }> {
  return updateMutation(mutationId, { status, ...extra }, scope);
}

// Backoff exponentiel plafonné — Phase 3 : jamais de boucle agressive.
// 5s, 10s, 20s, 40s ... plafonné à 5 minutes.
export function computeNextRetryAt(retryCount: number, from: Date = new Date()): string {
  const delayMs = Math.min(5000 * 2 ** retryCount, 5 * 60 * 1000);
  return new Date(from.getTime() + delayMs).toISOString();
}
