// OFFLINE-01 Phase 7 — service worker minimal : coquille applicative
// installable + repli hors-ligne. Volontairement restreint à des
// ressources publiques et statiques.
//
// Portée délibérément étroite (Phase 7 sécurité) : ne met JAMAIS en cache
// /api/**, /dashboard/**, /pro/**, /auth/** ni aucune page portant des
// données privées. La disponibilité hors-ligne des données métier vient
// exclusivement du cache IndexedDB (src/lib/offline/db.ts) + de l'outbox,
// jamais d'une réponse HTTP mise en cache par ce service worker.

const CACHE_NAME = "ecoles237-shell-v1";
const OFFLINE_URL = "/offline";
const SHELL_ASSETS = [OFFLINE_URL, "/manifest.webmanifest", "/branding/favicon.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

function isPrivateOrDynamicPath(pathname) {
  return (
    pathname.startsWith("/api/") ||
    pathname.startsWith("/dashboard/") ||
    pathname.startsWith("/pro/") ||
    pathname.startsWith("/auth/") ||
    pathname.startsWith("/enseignant/")
  );
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (isPrivateOrDynamicPath(url.pathname)) return;

  // Navigation (changement de page) : réseau d'abord, repli hors-ligne
  // seulement si le réseau échoue réellement.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match(OFFLINE_URL).then((cached) => cached ?? Response.error()))
    );
    return;
  }

  // Assets statiques publics (branding, manifest, bundles Next) :
  // cache d'abord, réseau en repli.
  if (url.pathname.startsWith("/branding/") || url.pathname.startsWith("/_next/static/") || url.pathname === "/manifest.webmanifest") {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        });
      })
    );
  }
});
