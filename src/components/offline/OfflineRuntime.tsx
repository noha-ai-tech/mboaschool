"use client";

// OFFLINE-01 — point de montage unique du moteur offline : enregistrement
// du service worker, câblage des déclencheurs de synchronisation (Phase 3),
// et nettoyage du cache local privé au logout (Phase 8). Monté une seule
// fois depuis le layout racine ; ne rend rien.
//
// OFFLINE-01.2 (P1 fix) — ne suppose JAMAIS que le cache local appartient
// à la session courante. Au montage, résout la VRAIE session Supabase
// (getUser(), pas seulement l'attente d'un futur événement) avant de
// câbler quoi que ce soit, et pousse cette identité dans syncIdentity.ts
// AVANT de démarrer le moteur de synchronisation — un utilisateur B qui
// ouvre l'application ne doit jamais voir passer, même un instant, l'état
// offline d'un utilisateur A resté en cache. Écoute aussi SIGNED_IN,
// TOKEN_REFRESHED et USER_UPDATED (pas seulement SIGNED_OUT) : le
// nettoyage complet au SIGNED_OUT reste une hygiène utile pour un
// appareil partagé, mais l'isolation réelle vient du scoping par userId
// dans la couche d'accès aux données (outbox.ts), pas de ce seul
// événement — un utilisateur A qui ferme l'app sans se déconnecter, puis
// un utilisateur B qui se connecte SANS SIGNED_OUT intermédiaire, doit
// être protégé exactement pareil.

import { useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { registerServiceWorker } from "@/lib/offline/registerServiceWorker";
import { initSyncEngine } from "@/lib/offline/syncEngine";
import { clearOfflineCache } from "@/lib/offline/db";
import { setActiveSyncUser } from "@/lib/offline/syncIdentity";

export function OfflineRuntime() {
  useEffect(() => {
    let stopSyncEngine: (() => void) | null = null;
    let cancelled = false;

    async function resolveInitialIdentityThenStart() {
      // getUser() revalide auprès de Supabase plutôt que de faire confiance
      // à un état local potentiellement périmé — c'est cette identité,
      // pas une supposition, qui détermine ce que le moteur peut toucher.
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled) return;
      setActiveSyncUser(user?.id ?? null);

      registerServiceWorker();
      stopSyncEngine = initSyncEngine();
    }

    void resolveInitialIdentityThenStart();

    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      switch (event) {
        case "SIGNED_IN":
        case "TOKEN_REFRESHED":
        case "USER_UPDATED":
          // setActiveSyncUser est idempotent (n'incrémente la génération
          // que si l'identité change réellement) — un simple rafraîchissement
          // de token pour le même utilisateur n'invalide pas une
          // synchronisation en cours pour rien.
          setActiveSyncUser(session?.user?.id ?? null);
          break;
        case "SIGNED_OUT":
          setActiveSyncUser(null);
          // Aucune fuite entre comptes sur un appareil partagé (kiosque,
          // tablette d'école) : on efface tout le cache local. Mesure
          // d'hygiène secondaire — l'isolation elle-même ne dépend pas de
          // cet événement se déclenchant de façon fiable (Phase 5).
          clearOfflineCache().catch(() => {});
          break;
        default:
          break;
      }
    });

    return () => {
      cancelled = true;
      stopSyncEngine?.();
      subscription.subscription.unsubscribe();
    };
  }, []);

  return null;
}
