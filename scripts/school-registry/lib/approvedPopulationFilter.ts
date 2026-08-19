/**
 * SPRINT MINESUP-F §17 — la population "approuvée" pour une promotion
 * contrôlée provient EXCLUSIVEMENT d'un statut staging précis
 * (`status = 'ready'`, jamais deviné sur le nom ou toute autre heuristique
 * qui pourrait un jour sembler "propre"). Extrait en fonction pure pour
 * être testable indépendamment de la requête Supabase réelle.
 */
export type StagingStatus = "pending" | "normalized" | "duplicate_exact" | "duplicate_review" | "ready" | "rejected" | "promoted";

export function isEligibleForApprovedPopulation(status: StagingStatus): boolean {
  return status === "ready";
}
