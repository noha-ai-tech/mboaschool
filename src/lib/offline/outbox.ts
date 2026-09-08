// OFFLINE-01 Phase 2 — outbox locale des mutations offline.

import { OUTBOX_STORE, getAllFromStore, openOfflineDb, runInStore } from "./db.ts";
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

export async function listMutations(): Promise<OfflineMutation[]> {
  const all = await getAllFromStore<OfflineMutation>(OUTBOX_STORE);
  return all.sort((a, b) => a.createdAtLocal.localeCompare(b.createdAtLocal));
}

export async function listPendingMutations(now: Date = new Date()): Promise<OfflineMutation[]> {
  const all = await listMutations();
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
export async function updateMutation(mutationId: string, patch: Partial<OfflineMutation>): Promise<void> {
  const db = await openOfflineDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(OUTBOX_STORE, "readwrite");
    const store = tx.objectStore(OUTBOX_STORE);
    const getRequest = store.get(mutationId);

    getRequest.onsuccess = () => {
      const existing = getRequest.result as OfflineMutation | undefined;
      if (existing) {
        store.put({ ...existing, ...patch });
      }
    };
    getRequest.onerror = () => reject(getRequest.error ?? new Error("Échec de lecture de la mutation"));

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Transaction outbox échouée"));
    tx.onabort = () => reject(tx.error ?? new Error("Transaction outbox annulée"));
  });
}

export async function removeMutation(mutationId: string): Promise<void> {
  await runInStore(OUTBOX_STORE, "readwrite", (store) => store.delete(mutationId));
}

export function setMutationStatus(
  mutationId: string,
  status: MutationStatus,
  extra: Partial<OfflineMutation> = {}
): Promise<void> {
  return updateMutation(mutationId, { status, ...extra });
}

// Backoff exponentiel plafonné — Phase 3 : jamais de boucle agressive.
// 5s, 10s, 20s, 40s ... plafonné à 5 minutes.
export function computeNextRetryAt(retryCount: number, from: Date = new Date()): string {
  const delayMs = Math.min(5000 * 2 ** retryCount, 5 * 60 * 1000);
  return new Date(from.getTime() + delayMs).toISOString();
}
