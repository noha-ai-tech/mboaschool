// OFFLINE-01 Phase 1 — couche de cache local structurée. IndexedDB plutôt
// que localStorage : les mutations en attente et les entités mises en cache
// sont des données métier, pas de simples préférences d'interface.
//
// Aucune dépendance externe (Dexie/localForage) : le contrat est petit
// (deux object stores) et une fine couche maison reste plus simple à
// auditer pour une base de sécurité aussi sensible que des mutations
// offline. S'appuie uniquement sur `globalThis.indexedDB`, ce qui permet
// aux tests d'injecter `fake-indexeddb` sans changer ce module.

const DB_NAME = "ecoles237-offline";
const DB_VERSION = 1;
export const OUTBOX_STORE = "outbox";
export const ENTITIES_STORE = "entities";

let dbPromise: Promise<IDBDatabase> | null = null;

function getIndexedDB(): IDBFactory {
  const idb = (globalThis as { indexedDB?: IDBFactory }).indexedDB;
  if (!idb) {
    throw new Error("IndexedDB indisponible dans cet environnement");
  }
  return idb;
}

export function openOfflineDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = getIndexedDB().open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(OUTBOX_STORE)) {
        const outbox = db.createObjectStore(OUTBOX_STORE, { keyPath: "mutationId" });
        outbox.createIndex("by_status", "status");
        outbox.createIndex("by_establishment", "establishmentId");
        outbox.createIndex("by_createdAtLocal", "createdAtLocal");
      }
      if (!db.objectStoreNames.contains(ENTITIES_STORE)) {
        const entities = db.createObjectStore(ENTITIES_STORE, { keyPath: "key" });
        entities.createIndex("by_establishment", "establishmentId");
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Échec d'ouverture d'IndexedDB"));
  });

  return dbPromise;
}

export async function runInStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T> | void
): Promise<T> {
  const db = await openOfflineDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    const request = fn(store);

    tx.onerror = () => reject(tx.error ?? new Error(`Transaction ${storeName} échouée`));
    tx.onabort = () => reject(tx.error ?? new Error(`Transaction ${storeName} annulée`));

    if (request) {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error(`Requête ${storeName} échouée`));
    } else {
      tx.oncomplete = () => resolve(undefined as T);
    }
  });
}

export async function getAllFromStore<T>(storeName: string): Promise<T[]> {
  return runInStore<T[]>(storeName, "readonly", (store) => store.getAll() as unknown as IDBRequest<T[]>);
}

// Phase 8 — nettoyage complet au logout. Un appareil peut être partagé
// entre plusieurs membres du personnel (kiosque, tablette d'école) : on ne
// tente pas un nettoyage sélectif par utilisateur, on efface tout le cache
// local pour garantir qu'aucune donnée du compte précédent ne survit.
export async function clearOfflineCache(): Promise<void> {
  const db = dbPromise ? await dbPromise : null;
  if (db) {
    db.close();
    dbPromise = null;
  }
  await new Promise<void>((resolve, reject) => {
    const request = getIndexedDB().deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error("Échec de suppression du cache local"));
    request.onblocked = () => resolve();
  });
}
