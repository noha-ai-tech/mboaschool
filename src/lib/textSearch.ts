// Comparaison de texte insensible à la casse ET aux accents — "Douala",
// "douala", "DOUALA" doivent être traités comme la même valeur partout où
// l'utilisateur cherche ou filtre. Ne modifie jamais la donnée affichée
// (chaque fiche garde son texte d'origine) — sert uniquement à COMPARER.

/** Clé de comparaison : accents retirés, minuscules, espaces normalisés. */
export function normalizeForSearch(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

/** true si `haystack` contient `needle`, indépendamment de la casse/accents. */
export function includesInsensitive(haystack: string | null | undefined, needle: string): boolean {
  const n = normalizeForSearch(needle);
  if (!n) return true;
  return normalizeForSearch(haystack).includes(n);
}

/**
 * Déduplique une liste de valeurs (ex. villes) qui ne diffèrent que par la
 * casse/les accents, en conservant une seule entrée par valeur normalisée.
 * L'entrée conservée est la plus fréquente dans la liste d'origine (à
 * égalité, la première rencontrée) — jamais une valeur reformatée/inventée,
 * toujours une valeur réellement présente dans les données.
 */
export function dedupeInsensitive(values: (string | null | undefined)[]): string[] {
  const groups = new Map<string, Map<string, number>>();
  for (const raw of values) {
    if (!raw || !raw.trim()) continue;
    const key = normalizeForSearch(raw);
    if (!groups.has(key)) groups.set(key, new Map());
    const variants = groups.get(key)!;
    variants.set(raw, (variants.get(raw) ?? 0) + 1);
  }
  const result: string[] = [];
  for (const variants of Array.from(groups.values())) {
    let best: string | null = null;
    let bestCount = -1;
    for (const [variant, count] of Array.from(variants.entries())) {
      if (count > bestCount) {
        best = variant;
        bestCount = count;
      }
    }
    if (best) result.push(best);
  }
  return result.sort((a, b) => a.localeCompare(b, "fr"));
}
