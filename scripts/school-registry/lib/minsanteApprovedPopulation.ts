/**
 * SPRINT MINSANTE-G §4/§20 — la population de promotion du pilote MINSANTE
 * ne peut JAMAIS être dérivée d'un statut/classification/re-matching seul :
 * elle est l'intersection stricte de DEUX conditions indépendantes :
 *
 *   1. staging_id figure EXPLICITEMENT dans le snapshot d'approbation
 *      MINSANTE-F (reports/registry/minsante-f-pilot-approval.json, 8
 *      candidats, checksum 26ea91c1...) ;
 *   2. classification ACTUELLE de la ligne = CLEAN_APPROVABLE (revalidation
 *      fraîche — §5, jamais un statut historique réutilisé sans preuve).
 *
 * Extrait en fonction pure (même principe que approvedPopulationFilter.ts,
 * MINESUP-F §17) pour être testable indépendamment de la requête Supabase
 * réelle, et pour prouver MÉCANIQUEMENT (§20) qu'aucune des 14 lignes
 * différées (13 CATEGORY_REVIEW + 1 DUPLICATE_REVIEW) ne peut jamais entrer
 * dans le payload de promotion — MÊME SI son nom ou sa catégorie semble
 * valide, MÊME SI un futur re-matching la ferait sembler éligible : ne pas
 * figurer dans le snapshot suffit seule à l'exclure définitivement, sans
 * dépendre d'aucune autre propriété de la ligne.
 */

export interface MinsantePilotRowForPopulation {
  staging_id: string;
  classification: string;
}

export function isInMinsanteApprovedPopulation(row: MinsantePilotRowForPopulation, approvedStagingIds: readonly string[]): boolean {
  return approvedStagingIds.includes(row.staging_id) && row.classification === "CLEAN_APPROVABLE";
}

export function selectMinsanteApprovedPopulation<T extends MinsantePilotRowForPopulation>(rows: readonly T[], approvedStagingIds: readonly string[]): T[] {
  return rows.filter((r) => isInMinsanteApprovedPopulation(r, approvedStagingIds));
}
