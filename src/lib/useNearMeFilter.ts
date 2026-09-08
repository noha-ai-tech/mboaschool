"use client";

import { useState } from "react";

// Filtre géolocalisé "Près de moi" — partagé par toutes les pages qui
// filtrent des établissements (/recherche, /categorie/[slug]) pour que le
// comportement soit identique partout (§ demande "filtres cohérents dans
// toutes les pages"). Filtre uniquement la liste déjà chargée côté client
// (distance à vol d'oiseau) — pas une recherche par rayon server-side.
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function useNearMeFilter(onLocated?: () => void) {
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [useLocation, setUseLocation] = useState(false);
  const [radius] = useState("5");
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  function handleLocationToggle() {
    setLocationError(null);
    if (!navigator.geolocation) {
      setLocationError("La géolocalisation n'est pas disponible sur cet appareil. Vous pouvez rechercher par ville.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setUserLocation({ lat: p.coords.latitude, lng: p.coords.longitude });
        setUseLocation(true);
        setLocating(false);
        onLocated?.();
      },
      () => {
        setLocating(false);
        setLocationError("Position indisponible. Vous pouvez rechercher par ville ou consulter la carte manuellement.");
      }
    );
  }

  function clearLocation() {
    setUseLocation(false);
    setUserLocation(null);
  }

  return { userLocation, useLocation, radius, locating, locationError, setLocationError, handleLocationToggle, clearLocation };
}
