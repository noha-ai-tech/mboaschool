/**
 * SPRINT R.2-SAFETY §24-25 — HTTP 200 n'est pas un succès. Vérifie que le
 * contenu récupéré ressemble structurellement à ce qui était attendu avant
 * d'en extraire quoi que ce soit.
 */
export interface StructureExpectation {
  /** Chaînes qui DOIVENT apparaître dans le contenu brut (ex. un id de table, un header de colonne). */
  requiredMarkers: string[];
  /** Chaînes dont la présence indique une page d'erreur/captcha/maintenance. */
  forbiddenMarkers?: string[];
  /** Taille minimale plausible du contenu — une page quasi vide n'est jamais valide. */
  minLength?: number;
}

export interface StructureCheckResult {
  valid: boolean;
  reason: string | null;
}

export function checkSourceStructure(content: string, expectation: StructureExpectation): StructureCheckResult {
  if (expectation.minLength && content.length < expectation.minLength) {
    return { valid: false, reason: `Contenu trop court (${content.length} < ${expectation.minLength}) — probable page vide/erreur.` };
  }
  for (const marker of expectation.forbiddenMarkers ?? []) {
    if (content.includes(marker)) {
      return { valid: false, reason: `Marqueur interdit trouvé ("${marker}") — probable captcha/login/maintenance.` };
    }
  }
  for (const marker of expectation.requiredMarkers) {
    if (!content.includes(marker)) {
      return { valid: false, reason: `Marqueur attendu absent ("${marker}") — structure de la source probablement changée.` };
    }
  }
  return { valid: true, reason: null };
}
