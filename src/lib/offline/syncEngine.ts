// OFFLINE-01 Phase 3 — moteur de synchronisation.
//
// Déclenchement : retour réseau, retour au premier plan, ouverture de
// l'application, action manuelle "Synchroniser". Jamais de boucle
// agressive — un verrou en mémoire empêche deux synchronisations
// concurrentes, et chaque mutation respecte son propre backoff
// exponentiel (voir outbox.computeNextRetryAt) avant d'être retentée.
//
// OFFLINE-01.2 (P1 fix) — runSync() sert TOUJOURS un utilisateur
// explicite (par défaut, l'identité active partagée de syncIdentity.ts,
// jamais une notion globale implicite de "l'utilisateur connecté"
// devinée ailleurs). La génération de cette identité est capturée au
// démarrage ; si l'utilisateur actif change avant que la réponse réseau
// ne revienne (Phase 9 — bascule de session pendant un aller-retour en
// vol), la réponse est jugée obsolète : on ne l'applique jamais, les
// mutations en vol ("syncing") de CE lancement sont simplement remises
// "pending" pour être retentées plus tard par leur véritable
// propriétaire, jamais marquées rejected/synced sur la base d'un
// contexte qui n'est plus le bon.

import {
  computeNextRetryAt,
  listPendingMutations,
  removeMutation,
  updateMutation,
  type UserScope,
} from "./outbox.ts";
import { getActiveSyncIdentity } from "./syncIdentity.ts";
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

export type RunSyncOptions = {
  userId?: string;
  fetchImpl?: SyncFetch;
};

export async function runSync(options: RunSyncOptions = {}): Promise<SyncEngineState> {
  if (syncInFlight) {
    await syncInFlight;
    return state;
  }

  // L'identité active est résolue UNE fois ici (ou fournie explicitement
  // par l'appelant, utile pour les tests) — jamais redemandée en cours de
  // route, précisément pour pouvoir détecter si elle change pendant que
  // la synchronisation est en vol.
  const startedIdentity = getActiveSyncIdentity();
  const userId = options.userId ?? startedIdentity.userId;
  const startedGeneration = startedIdentity.generation;
  const fetchImpl = options.fetchImpl ?? fetch;

  if (!userId || userId !== startedIdentity.userId) return state; // Rien à synchroniser sans utilisateur authentifié actif.

  const scope: UserScope = { userId };

  const isOnline = typeof navigator === "undefined" || navigator.onLine !== false;
  if (!isOnline) return state;

  const isStale = () => getActiveSyncIdentity().generation !== startedGeneration;
  const writeScope: UserScope = { ...scope, isCurrent: () => !isStale() };
  let pending: OfflineMutation[] = [];
  const marked = new Set<string>();

  // OFFLINE-01.3 : verrou acquis avant la première attente IndexedDB.
  syncInFlight = (async () => {
    async function revertInFlightToPending() {
      for (const mutation of pending) {
        if (!marked.has(mutation.mutationId)) continue;
        await updateMutation(mutation.mutationId, { status: "pending" }, scope).catch(() => {});
      }
    }

    try {
      pending = await listPendingMutations(scope);
      if (isStale() || pending.length === 0) return;
      state = { ...state, syncing: true };
      emit();
      for (const mutation of pending) {
        if (isStale()) return;
        const updated = await updateMutation(mutation.mutationId, { status: "syncing" }, writeScope);
        if (updated.ok) marked.add(mutation.mutationId);
      }
      if (isStale()) return;
      pending = pending.filter((mutation) => marked.has(mutation.mutationId));
      if (pending.length === 0) return;

      const response = await fetchImpl("/api/sync/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedUserId: userId, mutations: pending.map(toWire) }),
      });

      if (isStale()) {
        // La session a changé pendant l'aller-retour réseau : on
        // n'applique JAMAIS un résultat obsolète. Les mutations de CE
        // lancement (toujours celles de `userId`, jamais celles d'un
        // autre utilisateur) redeviennent "pending" pour une prochaine
        // synchronisation légitime, sans être marquées rejected/synced
        // sur la base d'un contexte qui n'est plus le bon.
        return;
      }

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        if (isStale()) return;
        const error = body?.error ?? `Échec de synchronisation (HTTP ${response.status})`;
        for (const mutation of pending) {
          await updateMutation(
            mutation.mutationId,
            {
              status: "error",
              lastError: error,
              retryCount: mutation.retryCount + 1,
              nextRetryAt: computeNextRetryAt(mutation.retryCount + 1),
            },
            writeScope
          );
        }
        state = { syncing: false, lastSyncAt: state.lastSyncAt, lastError: error };
        emit();
        return;
      }

      const body: SyncPushResponse = await response.json();

      if (isStale()) {
        return;
      }

      const byId = new Map(body.results.map((result) => [result.mutationId, result]));

      for (const mutation of pending) {
        if (isStale()) return;
        const result = byId.get(mutation.mutationId);
        if (!result) {
          await updateMutation(
            mutation.mutationId,
            {
              status: "error",
              lastError: "Aucune réponse du serveur pour cette mutation",
              retryCount: mutation.retryCount + 1,
              nextRetryAt: computeNextRetryAt(mutation.retryCount + 1),
            },
            writeScope
          );
          continue;
        }

        if (result.status === "applied" || result.status === "duplicate") {
          await removeMutation(mutation.mutationId, writeScope);
        } else if (result.status === "conflict") {
          await updateMutation(mutation.mutationId, { status: "conflict", lastError: result.error ?? "Conflit détecté" }, writeScope);
        } else {
          // rejected : erreur définitive (ex: droit retiré) — jamais réessayée
          // automatiquement, l'utilisateur doit être informé explicitement.
          await updateMutation(
            mutation.mutationId,
            { status: "rejected", lastError: result.error ?? "Mutation refusée par le serveur" },
            writeScope
          );
        }
      }

      if (isStale()) return;
      state = { syncing: false, lastSyncAt: new Date().toISOString(), lastError: null };
      emit();
    } catch (error) {
      if (isStale()) {
        return;
      }
      const message = error instanceof Error ? error.message : "Erreur réseau pendant la synchronisation";
      for (const mutation of pending) {
        await updateMutation(
          mutation.mutationId,
          {
            status: "error",
            lastError: message,
            retryCount: mutation.retryCount + 1,
            nextRetryAt: computeNextRetryAt(mutation.retryCount + 1),
          },
          writeScope
        ).catch(() => {});
      }
      state = { syncing: false, lastSyncAt: state.lastSyncAt, lastError: message };
      emit();
    } finally {
      if (isStale()) {
        await revertInFlightToPending();
        state = { syncing: false, lastSyncAt: null, lastError: null };
      } else {
        state = { ...state, syncing: false };
      }
      emit();
    }
  })();

  try {
    await syncInFlight;
    return state;
  } finally {
    syncInFlight = null;
  }
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
