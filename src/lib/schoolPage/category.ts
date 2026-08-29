// PUBLIC-SITE-01 §9 — category-aware presentation helpers for the school
// mini-site. Maps `establishments.main_category` (the only category signal
// that already exists — see schema.sql's `main_category` enum) to the
// tutelle ministry and the results vocabulary each category actually uses.
// V1 visual implementation focuses on `secondaire`; every other category
// gets a safe, generic fallback rather than a dedicated template (mission
// §9/§16 — do not build every category template in this mission).

export type SchoolMainCategory = "garderie" | "primaire" | "secondaire" | "superieur" | "autres";

export type MinistryLink = { label: string; shortLabel: string; url: string };

// Official ministry portals — Cameroon government domains only, used as
// generic "institutional resources" links, never as a claim of official
// partnership with a specific school.
const MINISTRIES: Record<string, MinistryLink> = {
  minesec: { label: "MINESEC — Ministère des Enseignements Secondaires", shortLabel: "MINESEC", url: "https://www.minesec.gov.cm" },
  minedub: { label: "MINEDUB — Ministère de l'Éducation de Base", shortLabel: "MINEDUB", url: "https://www.minedub.cm" },
  minesup: { label: "MINESUP — Ministère de l'Enseignement Supérieur", shortLabel: "MINESUP", url: "https://www.minesup.gov.cm" },
  minefop: { label: "MINEFOP — Ministère de l'Emploi et de la Formation Professionnelle", shortLabel: "MINEFOP", url: "https://www.minefop.gov.cm" },
};

export function ministryLinksForCategory(category: string | null): MinistryLink[] {
  switch (category as SchoolMainCategory) {
    case "garderie":
    case "primaire":
      return [MINISTRIES.minedub];
    case "secondaire":
      return [MINISTRIES.minesec];
    case "superieur":
      return [MINISTRIES.minesup];
    case "autres":
      return [MINISTRIES.minefop];
    default:
      return [];
  }
}

export type ResultsVocabulary = {
  /** Section title used on the Accueil preview + Vie & Résultats tab. */
  title: string;
  /** Named exam labels this category is expected to report, in display order. */
  examLabels: string[];
};

export function resultsVocabularyForCategory(category: string | null): ResultsVocabulary {
  switch (category as SchoolMainCategory) {
    case "secondaire":
      return { title: "Résultats aux examens", examLabels: ["BEPC", "Probatoire", "Baccalauréat", "GCE O'Level", "GCE A'Level"] };
    case "primaire":
      return { title: "Résultats aux examens", examLabels: ["CEP"] };
    case "superieur":
      return { title: "Insertion & réussite", examLabels: [] };
    case "autres":
      return { title: "Certifications & insertion", examLabels: [] };
    default:
      return { title: "Résultats", examLabels: [] };
  }
}
