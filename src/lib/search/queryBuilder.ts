// SPRINT R.2-B — Logique de construction de filtre pure (aucun appel réseau),
// extraite de la route pour rester testable sans serveur Next.js. Utilisée
// par src/app/api/recherche/route.ts.

import { normalizeSearchText, serverSearchWordForms } from "./normalizeSearchText";
import { GRAND_NORD, ZONE_ANGLOPHONE, normalizeRegionCasing } from "@/lib/cameroonRegions";
import { getMajorCity } from "@/lib/cameroonMajorCities";

/**
 * Colonnes texte interrogées par la recherche mot-par-mot (§13) — jamais
 * raw_data. `main_category` est un ENUM Postgres (voir supabase/schema.sql),
 * pas du texte — ILIKE dessus échoue avec "operator does not exist:
 * main_category ~~* unknown" (constaté en testant contre la base réelle).
 * Exclu ici : la catégorie a de toute façon son propre filtre dédié
 * (`category` sur cette même route), pas besoin de la recherche libre.
 */
export const SEARCHABLE_COLUMNS = ["name", "city", "region", "neighborhood", "quartier", "address", "sub_category"] as const;

/** Colonnes utilisées pour le repli géographique "ville" (§14 — city NULL ne doit pas disparaître). */
export const CITY_FALLBACK_COLUMNS = ["city", "neighborhood", "quartier", "address", "name"] as const;

/**
 * PostgREST exige que toute valeur de filtre contenant `,` `(` `)` soit
 * entourée de guillemets doubles (avec échappement interne) — sans ça, une
 * recherche utilisateur contenant une virgule casserait la syntaxe `.or()`.
 */
export function escapeOrValue(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export function ilikeOrGroup(columns: readonly string[], forms: readonly string[]): string {
  const parts: string[] = [];
  for (const col of columns) {
    for (const form of forms) {
      parts.push(`${col}.ilike.${escapeOrValue(`%${form}%`)}`);
    }
  }
  return parts.join(",");
}

export function clampInt(raw: string | null, fallback: number, min: number, max: number): number {
  const n = raw ? parseInt(raw, 10) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** §16 — macro-zone produit -> liste de régions réelles. Jamais region = "Grand Nord" en base. */
export function resolveRegionFilter(raw: string | null): { regions: string[] } | null {
  if (!raw || raw === "all") return null;
  if (raw === "grand-nord") return { regions: [...GRAND_NORD] };
  if (raw === "zone-anglophone") return { regions: [...ZONE_ANGLOPHONE] };
  const canonical = normalizeRegionCasing(raw);
  return canonical ? { regions: [canonical] } : null;
}

/**
 * §15 — formes de ville à comparer (nom tapé + alias confirmés
 * cameroonMajorCities.ts). Doit inclure la forme ACCENTUÉE d'origine — ILIKE
 * ne replie pas les accents, donc une valeur uniquement passée par
 * normalizeSearchText() (qui les retire) ne matcherait jamais une colonne
 * stockée "Ngaoundéré". serverSearchWordForms() réintroduit la forme
 * accentuée via la table de variantes confirmées ; on ajoute aussi les
 * valeurs brutes de la config en filet de sécurité pour toute ville dont
 * l'accent ne serait pas encore dans cette table.
 */
export function cityForms(cityParam: string): string[] {
  const normalizedCity = normalizeSearchText(cityParam);
  const major = getMajorCity(cityParam);
  const forms = new Set<string>([normalizedCity, ...serverSearchWordForms(normalizedCity)]);
  if (major) {
    const majorNormalized = normalizeSearchText(major.name);
    forms.add(majorNormalized);
    forms.add(major.name);
    for (const f of serverSearchWordForms(majorNormalized)) forms.add(f);
    for (const alias of major.aliases ?? []) {
      forms.add(normalizeSearchText(alias));
      forms.add(alias);
    }
  }
  return Array.from(forms);
}

/** §12 — un groupe OR (colonnes x variantes) par mot de la requête, à AND-er entre mots. */
export function queryWordGroups(q: string): string[] {
  const words = normalizeSearchText(q).split(" ").filter(Boolean);
  return words.map((word) => ilikeOrGroup(SEARCHABLE_COLUMNS, serverSearchWordForms(word)));
}
