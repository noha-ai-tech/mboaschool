"use client";

// OFFLINE-01 Phase 13 — hook derrière <SyncStatus />. Combine l'état
// réseau du navigateur, l'état du moteur de synchronisation et le contenu
// de l'outbox pour produire un état unique et sans ambiguïté à afficher.
//
// OFFLINE-01.2 (P1 fix) — scopé par l'identité active partagée
// (syncIdentity.ts), jamais par une lecture globale de l'outbox. Quand
// l'utilisateur actif change (B se connecte après A), les compteurs
// retombent immédiatement à zéro le temps que la lecture scopée sur B
// revienne — jamais un résidu des compteurs de A affiché, même
// brièvement.

import { useCallback, useEffect, useState } from "react";
import { listMutations } from "./outbox.ts";
import { getActiveSyncIdentity, subscribeActiveSyncIdentity } from "./syncIdentity.ts";
import { subscribeSyncState, triggerManualSync } from "./syncEngine.ts";
import type { OfflineMutation } from "./types.ts";

export type DisplaySyncState =
  | "online" // rien en attente, dernière sync confirmée
  | "offline" // navigateur hors-ligne
  | "pending" // mutation(s) en attente, réseau disponible
  | "syncing"
  | "error"
  | "conflict";

export type SyncStatusSnapshot = {
  state: DisplaySyncState;
  pendingCount: number;
  errorCount: number;
  conflictCount: number;
  lastSyncAt: string | null;
  retry: () => void;
};

const EMPTY_SNAPSHOT_MUTATIONS: OfflineMutation[] = [];

export function useSyncStatus(): SyncStatusSnapshot {
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  const [mutations, setMutations] = useState<OfflineMutation[]>(EMPTY_SNAPSHOT_MUTATIONS);
  const [engineSyncing, setEngineSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);

  const refreshMutations = useCallback((forUserId: string | null) => {
    if (!forUserId) {
      setMutations(EMPTY_SNAPSHOT_MUTATIONS);
      return;
    }
    listMutations({ userId: forUserId })
      .then((rows) => {
        // Anti-course : si l'utilisateur actif a déjà changé pendant que
        // cette lecture était en vol, on jette le résultat plutôt que
        // d'afficher les compteurs d'un utilisateur qui n'est plus actif.
        if (getActiveSyncIdentity().userId !== forUserId) return;
        setMutations(rows);
      })
      .catch(() => setMutations(EMPTY_SNAPSHOT_MUTATIONS));
  }, []);

  useEffect(() => {
    const unsubscribeIdentity = subscribeActiveSyncIdentity((identity) => {
      // Bascule immédiate à vide pendant le changement d'utilisateur —
      // jamais un résidu des compteurs de l'utilisateur précédent affiché
      // le temps que la lecture scopée sur le nouveau revienne.
      setMutations(EMPTY_SNAPSHOT_MUTATIONS);
      refreshMutations(identity.userId);
    });

    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    const unsubscribeSync = subscribeSyncState((syncState) => {
      setEngineSyncing(syncState.syncing);
      setLastSyncAt(syncState.lastSyncAt);
      refreshMutations(getActiveSyncIdentity().userId);
    });

    // Poll léger — l'outbox change aussi hors du moteur (enqueueMutation
    // depuis un formulaire) sans passer par subscribeSyncState.
    const interval = window.setInterval(() => refreshMutations(getActiveSyncIdentity().userId), 4000);

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      unsubscribeIdentity();
      unsubscribeSync();
      window.clearInterval(interval);
    };
  }, [refreshMutations]);

  const pendingCount = mutations.filter((m) => m.status === "pending" || m.status === "syncing").length;
  const errorCount = mutations.filter((m) => m.status === "error" || m.status === "rejected").length;
  const conflictCount = mutations.filter((m) => m.status === "conflict").length;

  let displayState: DisplaySyncState = "online";
  if (!online) displayState = "offline";
  else if (engineSyncing) displayState = "syncing";
  else if (conflictCount > 0) displayState = "conflict";
  else if (errorCount > 0) displayState = "error";
  else if (pendingCount > 0) displayState = "pending";

  return {
    state: displayState,
    pendingCount,
    errorCount,
    conflictCount,
    lastSyncAt,
    retry: () => {
      void triggerManualSync();
    },
  };
}
