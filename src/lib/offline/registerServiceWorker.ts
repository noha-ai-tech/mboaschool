// OFFLINE-01 Phase 7 — enregistrement du service worker. Ne fait rien en
// environnement non-navigateur (SSR/tests) ni si l'API n'existe pas.

function doRegister(): void {
  navigator.serviceWorker.register("/sw.js").catch(() => {
    // Échec silencieux et non bloquant : l'app doit rester utilisable
    // sans installation PWA.
  });
}

export function registerServiceWorker(): void {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;

  // Ce composant se monte après l'hydratation React, qui survient
  // généralement APRÈS l'événement `load` du navigateur — un simple
  // `addEventListener("load", ...)` raterait alors cet événement déjà
  // passé et ne s'enregistrerait jamais. On vérifie donc `readyState`
  // d'abord et on n'attend `load` que s'il n'a pas encore eu lieu.
  if (document.readyState === "complete") {
    doRegister();
  } else {
    window.addEventListener("load", doRegister, { once: true });
  }
}
