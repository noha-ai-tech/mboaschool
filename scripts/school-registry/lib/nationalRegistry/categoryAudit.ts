/**
 * SPRINT REGISTRY-NATIONAL-A §19 — audit catégorie/taxonomie, fonction pure.
 *
 * `establishments.main_category` (colonne NOT NULL, confirmée par
 * introspection empirique dans les scripts de promotion MINESUP-D/MINSANTE-H)
 * n'accepte aujourd'hui, en pratique, que les valeurs déjà observées en
 * production : 'primaire' | 'secondaire' | 'superieur' | 'autres' | 'garderie'
 * (vérifié en direct §3 de ce sprint — 5 valeurs distinctes recensées sur
 * 2249 lignes live). Ce n'est PAS un enum Postgres (colonne text), donc rien
 * n'empêche techniquement une autre valeur — mais en écrire une nouvelle
 * SANS l'avoir vue ailleurs dans le produit serait une migration taxonomy
 * de facto, hors périmètre de ce sprint (§19 : "ne pas lancer une migration
 * taxonomy nationale"). Toute valeur hors de cette liste connue -> CATEGORY_REVIEW.
 */

export const KNOWN_MAIN_CATEGORIES = ["primaire", "secondaire", "superieur", "autres", "garderie"] as const;
export type KnownMainCategory = (typeof KNOWN_MAIN_CATEGORIES)[number];

/**
 * education_family (colonne `establishment_import_staging.education_family`,
 * enum Postgres registry_education_family, migration 0006) — reproduit ici
 * en lecture seule, jamais dupliqué comme source de vérité.
 */
export const KNOWN_EDUCATION_FAMILIES = [
  "basic",
  "secondary_general",
  "secondary_technical",
  "teacher_training",
  "higher_education",
  "vocational_training",
  "health_training",
  "agricultural_training",
  "livestock_fisheries_training",
  "forestry_wildlife_training",
  "other",
] as const;

export interface CategoryAuditInput {
  mainCategory: string | null;
  educationFamily: string | null;
}

export interface CategoryAuditResult {
  compatible: boolean;
  issue: string | null;
}

/**
 * education_family -> main_category attendu, même mapping que
 * mainCategoryToEducationFamily() (sens inverse) répliqué dans chaque
 * script de promotion (minesup-d-promote.ts:107, minsante-h-promote.ts:90,
 * etc.) — ici la direction est education_family -> main_category attendu,
 * pour vérifier la COHÉRENCE plutôt que pour la dériver en écriture.
 */
const EXPECTED_MAIN_CATEGORY_FOR_FAMILY: Record<string, KnownMainCategory | null> = {
  basic: "primaire",
  secondary_general: "secondaire",
  secondary_technical: "secondaire",
  teacher_training: null, // observé sous 'autres' ou 'superieur' selon les cas réels — pas assez homogène pour une règle stricte, jamais forcé
  higher_education: "superieur",
  vocational_training: "autres",
  health_training: null, // observé à la fois sous 'superieur' (instituts) et 'autres' (écoles courtes) dans les données MINSANTE réelles — pas de règle stricte imposée
  agricultural_training: "autres",
  livestock_fisheries_training: "autres",
  forestry_wildlife_training: "autres",
  other: "autres",
};

export function auditCategory(input: CategoryAuditInput): CategoryAuditResult {
  if (!input.mainCategory) {
    return { compatible: false, issue: "main_category manquant — colonne NOT NULL côté establishments, aucune valeur par défaut sûre à inventer." };
  }
  if (!(KNOWN_MAIN_CATEGORIES as readonly string[]).includes(input.mainCategory)) {
    return { compatible: false, issue: `main_category="${input.mainCategory}" hors des ${KNOWN_MAIN_CATEGORIES.length} valeurs déjà observées en production — migration taxonomy hors périmètre de ce sprint.` };
  }
  if (input.educationFamily) {
    if (!(KNOWN_EDUCATION_FAMILIES as readonly string[]).includes(input.educationFamily)) {
      return { compatible: false, issue: `education_family="${input.educationFamily}" absent de l'enum Postgres registry_education_family connu.` };
    }
    const expected = EXPECTED_MAIN_CATEGORY_FOR_FAMILY[input.educationFamily];
    if (expected && expected !== input.mainCategory) {
      return { compatible: false, issue: `education_family="${input.educationFamily}" attend usuellement main_category="${expected}", trouvé "${input.mainCategory}" — incohérence à examiner (pas nécessairement une erreur, mais jamais forcée silencieusement).` };
    }
  }
  return { compatible: true, issue: null };
}
