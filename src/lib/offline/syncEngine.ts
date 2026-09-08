// OFFLINE-01 Phase 3 — moteur de synchronisation.
//
// Déclenchement : retour réseau, retour au premier plan, ouverture de
// l'application, action manuelle "Synchroniser". Jamais de boucle
// agressive — un verrou en mémoire empêche deux synchronisations
// concurrentes, et chaque mutation respecte son propre backoff
// exponentiel (voir outbox.computeNextRetryAt) avant d'être retentée.

import { computeNextRetryAt, listPendingMutations, removeMutation, updateMutation } from "./outbox.ts";
import type { OfflineMutation, OfflineMutationWire, SyncPushResponse } from "./types.ts";

export type SyncListener = (state: SyncEngineState) => void;

export type SyncEngineState = {
  syncing: boolean;
  lastSyncAt: string | null;
  lastError: string | null;
};

let state: SyncEngineState = { syncing: false, lastSyncAt: null, lastError: null };
const listeners = new Set<SyncListener>();
let syncInFlight: Promise<void> | null = null;

function emit() {
  listeners.forEach((listener) => listener(state));
}

export function subscribeSyncState(listener: SyncListener): () => void {
  listeners.add(listener);
  listener(state);
  return () => listeners.delete(listener);
}

export function getSyncState(): SyncEngineState {
  return state;
}

function toWire(mutation: OfflineMutation): OfflineMutationWire {
  return {
    mutationId: mutation.mutationId,
    entityType: mutation.entityType,
    operation: mutation.operation,
    entityId: mutation.entityId,
    payload: mutation.payload,
    baseVersion: mutation.baseVersion,
    deviceTimestamp: mutation.deviceTimestamp,
    establishmentId: mutation.establishmentId,
  };
}

// Injectable pour les tests — en production, `fetch` global du navigateur.
export type SyncFetch = (input: string, init: RequestInit) => Promise<Response>;

export async function runSync(fetchImpl: SyncFetch = fetch): Promise<SyncEngineState> {
  if (syncInFlight) {
    await syncInFlight;
    return state;
  }

  // navigator.onLine n'existe que dans un vrai navigateur ; en son absence
  // (SSR, tests) on suppose "en ligne" plutôt que de bloquer silencieusement
  // toute synchronisation — seule une valeur explicitement `false` compte.
  const isOnline = typeof navigator === "undefined" || navigator.onLine !== false;
  if (!isOnline) return state;

  const pending = await listPendingMutations();
  if (pending.length === 0) return state;

  state = { ...state, syncing: true };
  emit();

  syncInFlight = (async () => {
    try {
      for (const mutation of pending) {
        await updateMutation(mutation.mutationId, { status: "syncing" });
      }

      const response = await fetchImpl("/api/sync/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mutations: pending.map(toWire) }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        const error = body?.error ?? `Échec de synchronisation (HTTP ${response.status})`;
        for (const mutation of pending) {
          await updateMutation(mutation.mutationId, {
            status: "error",
            lastError: error,
            retryCount: mutation.retryCount + 1,
            nextRetryAt: computeNextRetryAt(mutation.retryCount + 1),
          });
        }
        state = { syncing: false, lastSyncAt: state.lastSyncAt, lastError: error };
        emit();
        return;
      }

      const body: SyncPushResponse = await response.json();
      const byId = new Map(body.results.map((result) => [result.mutationId, result]));

      for (const mutation of pending) {
        const result = byId.get(mutation.mutationId);
        if (!result) {
          await updateMutation(mutation.mutationId, {
            status: "error",
            lastError: "Aucune réponse du serveur pour cette mutation",
            retryCount: mutation.retryCount + 1,
            nextRetryAt: computeNextRetryAt(mutation.retryCount + 1),
          });
          continue;
        }

        if (result.status === "applied" || result.status === "duplicate") {
          await removeMutation(mutation.mutationId);
        } else if (result.status === "conflict") {
          await updateMutation(mutation.mutationId, {
            status: "conflict",
            lastError: result.error ?? "Conflit détecté",
          });
        } else {
          // rejected : erreur définitive (ex: droit retiré) — jamais réessayée
          // automatiquement, l'utilisateur doit être informé explicitement.
          await updateMutation(mutation.mutationId, {
            status: "rejected",
            lastError: result.error ?? "Mutation refusée par le serveur",
          });
        }
      }

      state = { syncing: false, lastSyncAt: new Date().toISOString(), lastError: null };
      emit();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erreur réseau pendant la synchronisation";
      for (const mutation of pending) {
        await updateMutation(mutation.mutationId, {
          status: "error",
          lastError: message,
          retryCount: mutation.retryCount + 1,
          nextRetryAt: computeNextRetryAt(mutation.retryCount + 1),
        }).catch(() => {});
      }
      state = { syncing: false, lastSyncAt: state.lastSyncAt, lastError: message };
      emit();
    } finally {
      syncInFlight = null;
    }
  })();

  await syncInFlight;
  return state;
}

const MIN_INTERVAL_MS = 15_000;
let lastTriggerAt = 0;

function throttledSync() {
  const now = Date.now();
  if (now - lastTriggerAt < MIN_INTERVAL_MS) return;
  lastTriggerAt = now;
  void runSync();
}

// Câblage des déclencheurs (Phase 3). Retourne une fonction de nettoyage —
// à appeler une seule fois, depuis un composant client monté à la racine.
export function initSyncEngine(): () => void {
  if (typeof window === "undefined") return () => {};

  const onOnline = () => throttledSync();
  const onVisibility = () => {
    if (document.visibilityState === "visible" && navigator.onLine) throttledSync();
  };

  window.addEventListener("online", onOnline);
  document.addEventListener("visibilitychange", onVisibility);
  if (navigator.onLine) throttledSync();

  return () => {
    window.removeEventListener("online", onOnline);
    document.removeEventListener("visibilitychange", onVisibility);
  };
}

// Action utilisateur "Synchroniser" — jamais throttlée, c'est une intention
// explicite.
export function triggerManualSync(): Promise<SyncEngineState> {
  return runSync();
}
