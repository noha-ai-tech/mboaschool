"use client";

// OFFLINE-01 Phase 13 — hook derrière <SyncStatus />. Combine l'état
// réseau du navigateur, l'état du moteur de synchronisation et le contenu
// de l'outbox pour produire un état unique et sans ambiguïté à afficher.

import { useCallback, useEffect, useState } from "react";
import { listMutations } from "./outbox.ts";
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

export function useSyncStatus(): SyncStatusSnapshot {
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  const [mutations, setMutations] = useState<OfflineMutation[]>([]);
  const [engineSyncing, setEngineSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);

  const refreshMutations = useCallback(() => {
    listMutations()
      .then(setMutations)
      .catch(() => setMutations([]));
  }, []);

  useEffect(() => {
    refreshMutations();
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    const unsubscribe = subscribeSyncState((syncState) => {
      setEngineSyncing(syncState.syncing);
      setLastSyncAt(syncState.lastSyncAt);
      refreshMutations();
    });

    // Poll léger — l'outbox change aussi hors du moteur (enqueueMutation
    // depuis un formulaire) sans passer par subscribeSyncState.
    const interval = window.setInterval(refreshMutations, 4000);

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      unsubscribe();
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
