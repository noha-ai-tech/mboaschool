// SPRINT R.1 §3-6 — Normalisation de texte pour la RECHERCHE uniquement.
// Ne modifie jamais une donnée stockée (official_name reste exactement
// celui de la source MINESEC) : cette fonction transforme une copie de
// travail pour comparer une requête utilisateur à un texte, jamais la
// donnée elle-même.
//
// Différent de scripts/school-registry/lib/normalize.ts (normalizeName) :
// ce dernier RETIRE "lycee"/"ecole"/... pour calculer un fingerprint de
// dédoublonnage — inutilisable ici, une recherche doit au contraire
// CONSERVER ces mots pour qu'un utilisateur tapant "lycée" trouve un
// établissement dont le nom contient justement "Lycée".

const DIACRITICS_RE = /[̀-ͯ]/g;

/** minuscules, espaces réduits, diacritiques retirés, apostrophes normalisées. */
export function normalizeSearchText(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .normalize("NFD")
    .replace(DIACRITICS_RE, "")
    .toLowerCase()
    .replace(/[’‘´`]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Alias techniques minimaux (SPRINT R.1 §5) — pas un dictionnaire général,
 * seulement les variantes orthographiques réellement observées dans les
 * sources officielles importées. "lycee"/"lyce" : la table ESG MINESEC
 * tronque systématiquement "Lycée" en "Lyce" (accent + dernière lettre
 * perdus à la source, confirmé SPRINT R sur le HTML brut) — sans cet alias,
 * une recherche "lycée bafoussam" (accent normalisé "lycee") ne trouve
 * aucun des établissements MINESEC dont le nom dit "Lyce Bafoussam".
 */
const SEARCH_WORD_ALIASES: ReadonlyMap<string, readonly string[]> = new Map([
  ["lycee", ["lyce"]],
  ["lyce", ["lycee"]],
]);

/** Le mot normalisé et ses variantes connues (lui-même inclus). */
export function searchWordVariants(word: string): readonly string[] {
  const extra = SEARCH_WORD_ALIASES.get(word);
  return extra ? [word, ...extra] : [word];
}

/**
 * Découpe une requête normalisée en mots, chacun étendu à ses variantes —
 * `wordsForQuery("lycée bafoussam")` -> [["lycee","lyce"], ["bafoussam"]].
 * Le tri en ET logique (chaque groupe doit avoir au moins un match) reste
 * à la charge de l'appelant.
 */
export function wordsForQuery(query: string): readonly (readonly string[])[] {
  return normalizeSearchText(query)
    .split(" ")
    .filter(Boolean)
    .map(searchWordVariants);
}

/** true si CHAQUE mot de la requête (ou l'une de ses variantes) apparaît dans le texte normalisé. */
export function matchesSearchQuery(normalizedHaystack: string, query: string): boolean {
  const groups = wordsForQuery(query);
  if (groups.length === 0) return true;
  return groups.every((variants) => variants.some((v) => normalizedHaystack.includes(v)));
}
