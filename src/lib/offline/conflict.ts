// OFFLINE-01 Phase 4 — stratégie de conflit par type d'entité.
//
// Aucune table actuelle ne porte encore de colonne updated_at/version
// (voir l'audit Phase 0) : le pilote "absence" est create-only et ne
// déclenche donc jamais ce chemin en conditions réelles aujourd'hui. Cette
// fonction existe pour que les futurs modules update-heavy (Présence,
// Timesheet) réutilisent immédiatement le moteur sans le reconstruire —
// elle est prouvée par des tests avec un type d'entité synthétique
// ("draft-note") plutôt que simulée dans le pilote lui-même.
//
// Règle non négociable (Phase 4) : jamais d'écrasement silencieux. Le
// last-write-wins n'est autorisé que pour les types explicitement classés
// "brouillon" ; tout le reste exige un conflit explicite.

import type { OfflineEntityType } from "./types.ts";

export type ConflictStrategy = "last-write-wins" | "server-wins-explicit-conflict";

const STRATEGY_BY_ENTITY: Record<OfflineEntityType, ConflictStrategy> = {
  // Une déclaration d'absence est un enregistrement create-only : deux
  // créations ne "s'écrasent" jamais, elles coexistent. Classée ici pour
  // documenter l'intention si une édition est ajoutée plus tard.
  absence: "server-wins-explicit-conflict",
  "draft-note": "last-write-wins",
};

export function strategyFor(entityType: OfflineEntityType): ConflictStrategy {
  return STRATEGY_BY_ENTITY[entityType] ?? "server-wins-explicit-conflict";
}

export type ConflictDecision =
  | { outcome: "apply"; reason: "no-conflict" | "last-write-wins" }
  | { outcome: "conflict"; reason: "version-mismatch" };

// baseVersion = dernier server_updated_at connu du client au moment de la
// mutation locale. serverVersion = server_updated_at actuel en base au
// moment de la synchronisation. S'ils divergent, quelqu'un d'autre a
// modifié la ligne entre-temps.
export function resolveConflict(
  entityType: OfflineEntityType,
  baseVersion: string | null,
  serverVersion: string | null
): ConflictDecision {
  if (!baseVersion || !serverVersion || baseVersion === serverVersion) {
    return { outcome: "apply", reason: "no-conflict" };
  }

  const strategy = strategyFor(entityType);
  if (strategy === "last-write-wins") {
    return { outcome: "apply", reason: "last-write-wins" };
  }

  return { outcome: "conflict", reason: "version-mismatch" };
}
