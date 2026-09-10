// MOBILE-01 (OFFLINE-01 Phase 12) — cache local du strict nécessaire pour
// continuer à travailler hors-ligne : le store ENTITIES_STORE existait
// déjà dans le schéma (db.ts) mais n'était utilisé par aucune
// fonctionnalité avant MOBILE-01. Jamais toute l'école : uniquement
// "aujourd'hui → cours concernés → classes concernées → élèves
// concernés", par enseignant.

import { ENTITIES_STORE, runInStore } from "./db.ts";

type CachedEntity<T> = { key: string; value: T; cachedAt: string };

export async function setCachedEntity<T>(key: string, value: T): Promise<void> {
  const entry: CachedEntity<T> = { key, value, cachedAt: new Date().toISOString() };
  await runInStore(ENTITIES_STORE, "readwrite", (store) => store.put(entry));
}

export async function getCachedEntity<T>(key: string): Promise<{ value: T; cachedAt: string } | null> {
  const result = await runInStore<CachedEntity<T> | undefined>(ENTITIES_STORE, "readonly", (store) => store.get(key));
  if (!result) return null;
  return { value: result.value, cachedAt: result.cachedAt };
}

// Clés stables, dérivées uniquement d'identifiants déjà connus du client
// (jamais un id généré serveur qu'il faudrait d'abord aller chercher en
// ligne) — cohérent avec le choix de sync_apply_attendance_mark de ne
// jamais exiger un id de séance côté client.
export function todayScheduleCacheKey(teacherEnseignantId: string, dateStr: string): string {
  return `schedule:${teacherEnseignantId}:${dateStr}`;
}

export function classRosterCacheKey(classeId: string): string {
  return `roster:${classeId}`;
}
