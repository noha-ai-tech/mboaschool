// CMS-F.3 — définition canonique UNIQUE des 8 clés de section de la fiche
// publique. Avant ce fichier, deux tableaux concurrents existaient avec des
// ORDRES DIFFÉRENTS (trouvé lors de l'audit CMS-F.2) :
//   - src/app/ecole/[id]/page.tsx (le rendu public lui-même, faisant
//     autorité pour l'ordre par défaut réellement affiché) ;
//   - src/app/api/school-page/sections/route.ts (ALLOWED_SECTION_KEYS, un
//     ordre différent, sans conséquence là-bas car utilisé uniquement pour
//     valider un ensemble/une longueur, jamais comme ordre d'affichage).
// L'ordre ci-dessous est copié EXACTEMENT depuis le rendu public — seule
// source qui ait jamais eu un effet visuel réel — et devient la source
// unique pour tout le reste du code (renderer, /api/school-page/sections,
// /api/school-page/draft, éditeur CMS).
export const CANONICAL_SECTION_KEYS = [
  "presentation", "admissions", "pricing", "infrastructure",
  "gallery", "news", "documents", "contact",
] as const;

export type SchoolPageSectionKey = typeof CANONICAL_SECTION_KEYS[number];

export const DEFAULT_SECTION_ORDER: readonly SchoolPageSectionKey[] = CANONICAL_SECTION_KEYS;

// CMS-F.4 — extrait tel quel (comportement inchangé) depuis
// src/app/ecole/[id]/page.tsx : repli sur l'ordre canonique par défaut
// quand une clé n'a pas de ligne (lazy configuration, jamais de backfill).
// Fonctionne aussi bien pour school_page_sections (lignes potentiellement
// partielles/absentes) que pour school_page_drafts.payload.sections
// (toujours les 8 clés, donc les replis ne se déclenchent jamais côté
// brouillon) — même fonction, une seule source de vérité pour les deux.
export function resolveSectionConfig(
  rows: { section_key: string; position: number; is_visible: boolean }[]
): { key: SchoolPageSectionKey; position: number; is_visible: boolean }[] {
  const byKey = new Map(rows.map((r) => [r.section_key, r]));
  return CANONICAL_SECTION_KEYS
    .map((key, i) => {
      const row = byKey.get(key);
      return { key, position: row?.position ?? i, is_visible: row?.is_visible ?? true };
    })
    .sort((a, b) => a.position - b.position);
}
