"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

// CORRECTION 4 — les parents n'ont pas de compte, donc "est favori ?" est
// une préférence 100% locale au navigateur (localStorage), jamais une
// donnée serveur par utilisateur. Le compteur agrégé, lui, vit en base
// (establishments.favorite_count, migration 20260911121500) et est ajusté
// via la fonction RPC adjust_favorite_count — jamais un GRANT UPDATE direct
// qui exposerait toute la ligne establishments à un visiteur anonyme.
const STORAGE_KEY = "ecoles237.favoris:v1";

function readStoredIds(): string[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : [];
  } catch {
    return [];
  }
}

function writeStoredIds(ids: string[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // Stockage indisponible (navigation privée, quota) — le bouton reste
    // utilisable pendant la session, juste non persisté après rechargement.
  }
}

export function useFavorite(establishmentId: string) {
  const [isFavorite, setIsFavorite] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setIsFavorite(readStoredIds().includes(establishmentId));
    setReady(true);
  }, [establishmentId]);

  const toggle = useCallback(() => {
    const current = readStoredIds();
    const currentlyFavorite = current.includes(establishmentId);
    const next = currentlyFavorite
      ? current.filter((id) => id !== establishmentId)
      : [...current, establishmentId];
    writeStoredIds(next);
    setIsFavorite(!currentlyFavorite);

    supabase
      .rpc("adjust_favorite_count", {
        p_establishment_id: establishmentId,
        p_delta: currentlyFavorite ? -1 : 1,
      })
      .then(({ error }) => {
        if (error) {
          // Le favori reste marqué côté navigateur même si le compteur
          // serveur n'a pas pu être ajusté (ex. RPC pas encore déployée) —
          // l'expérience du parent ne doit jamais dépendre de cet appel.
          console.error("adjust_favorite_count failed", error);
        }
      });
  }, [establishmentId]);

  return { isFavorite, toggle, ready };
}
