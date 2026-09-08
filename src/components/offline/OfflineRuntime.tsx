"use client";

// OFFLINE-01 — point de montage unique du moteur offline : enregistrement
// du service worker, câblage des déclencheurs de synchronisation (Phase 3),
// et nettoyage du cache local privé au logout (Phase 8). Monté une seule
// fois depuis le layout racine ; ne rend rien.

import { useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { registerServiceWorker } from "@/lib/offline/registerServiceWorker";
import { initSyncEngine } from "@/lib/offline/syncEngine";
import { clearOfflineCache } from "@/lib/offline/db";

export function OfflineRuntime() {
  useEffect(() => {
    registerServiceWorker();
    const stopSyncEngine = initSyncEngine();

    const { data: subscription } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        // Aucune fuite entre comptes sur un appareil partagé (kiosque,
        // tablette d'école) : on efface tout le cache local, jamais un
        // nettoyage partiel par utilisateur.
        clearOfflineCache().catch(() => {});
      }
    });

    return () => {
      stopSyncEngine();
      subscription.subscription.unsubscribe();
    };
  }, []);

  return null;
}
