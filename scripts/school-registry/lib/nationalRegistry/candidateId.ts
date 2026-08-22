/**
 * SPRINT REGISTRY-NATIONAL-A §4 — national_candidate_id stable et
 * déterministe. JAMAIS le nom brut seul (deux ministères pourraient
 * transcrire le même nom différemment ; un seul candidat pourrait aussi
 * changer de nom brut d'une extraction à l'autre).
 *
 * Stratégie : si le candidat a déjà une origine stable connue (staging row
 * id, ou establishment id pour ALREADY_LIVE), l'utiliser directement comme
 * base — c'est la source de vérité la plus stable possible. Sinon (candidat
 * connu seulement via un artefact de rapport, ex. les 5 différés Transport),
 * dériver un hash déterministe de (ministère + identifiant de candidat
 * d'origine du rapport + nom normalisé) : stable tant que ces trois entrées
 * ne changent pas, jamais recalculé à partir du seul nom.
 */
import { createHash } from "node:crypto";

export function candidateIdFromStagingRow(stagingId: string): string {
  return `NAT-STG-${stagingId}`;
}

export function candidateIdFromEstablishment(establishmentId: string): string {
  return `NAT-EST-${establishmentId}`;
}

export function candidateIdFromArtifact(ministry: string, originId: string, normalizedName: string): string {
  const hash = createHash("sha256").update(`${ministry}::${originId}::${normalizedName}`).digest("hex").slice(0, 16);
  return `NAT-ART-${ministry}-${hash}`;
}
