// Utilitaires d'affichage de localisation — établissements dont `city` peut
// être `null` (registre national MINESEC, écoles dont la source officielle
// ne publie pas de localité précise, voir SPRINT P.2A §12/P.2B.1). Ne
// fabriquent jamais de valeur de repli géographique : une absence reste une
// absence, jamais remplacée par la région ou un texte générique sauf usage
// SEO explicite (formatSchoolLocation) où le repli region est un choix
// produit assumé.

/** "Bonapriso, Douala" / "Bonapriso" / "Douala" / null selon ce qui existe. */
export function formatQuartierCity(quartier?: string | null, city?: string | null): string | null {
  const q = quartier?.trim() || null;
  const c = city?.trim() || null;
  if (q && c) return `${q}, ${c}`;
  return q ?? c ?? null;
}

/** Joint des segments non vides avec " · ", en omettant silencieusement les absents. */
export function joinWithSeparator(...parts: (string | null | undefined)[]): string | null {
  const filtered = parts.map((p) => p?.trim()).filter((p): p is string => Boolean(p));
  return filtered.length > 0 ? filtered.join(" · ") : null;
}

/** Ville si connue, sinon région (repli assumé, réservé au SEO — titre/meta/JSON-LD). */
export function formatSchoolLocation({ city, region }: { city?: string | null; region?: string | null }): string | null {
  return city?.trim() || region?.trim() || null;
}
