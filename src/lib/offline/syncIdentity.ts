// OFFLINE-01.2 — identité active du moteur offline (Phase 5/9).
//
// Source de vérité unique pour "quel utilisateur authentifié le moteur
// sert-il en ce moment ?", partagée entre syncEngine (déclenché depuis
// initSyncEngine, loin de tout composant React) et useSyncStatus
// (affiché depuis un formulaire, ailleurs dans l'arbre). Jamais déduite
// implicitement d'un état global "session courante" lu à la volée — un
// seul point d'écriture (OfflineRuntime, après lecture réelle de la
// session Supabase), un seul point de lecture partagé.
//
// `generation` s'incrémente à CHAQUE changement d'utilisateur actif (y
// compris vers/depuis null). Une synchronisation capture la génération au
// moment où elle démarre ; si elle a changé avant que la réponse réseau ne
// revienne, cette réponse est considérée obsolète (Phase 9) — la session
// a changé pendant que la requête était en vol.

export type SyncIdentity = {
  userId: string | null;
  generation: number;
};

let identity: SyncIdentity = { userId: null, generation: 0 };
const listeners = new Set<(identity: SyncIdentity) => void>();

export function getActiveSyncIdentity(): SyncIdentity {
  return identity;
}

// Idempotent : ne bascule (et n'incrémente la génération) que si
// l'utilisateur actif change réellement — un événement TOKEN_REFRESHED
// pour le même utilisateur ne doit pas invalider une synchronisation en
// cours pour rien.
export function setActiveSyncUser(userId: string | null): void {
  if (userId === identity.userId) return;
  identity = { userId, generation: identity.generation + 1 };
  listeners.forEach((listener) => listener(identity));
}

export function subscribeActiveSyncIdentity(listener: (identity: SyncIdentity) => void): () => void {
  listeners.add(listener);
  listener(identity);
  return () => listeners.delete(listener);
}

// Réservé aux tests — remet l'identité partagée à son état initial entre
// deux scénarios pour éviter qu'une génération élevée d'un test précédent
// ne fausse les assertions du suivant.
export function __resetSyncIdentityForTests(): void {
  identity = { userId: null, generation: 0 };
}
