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

// SPRINT R.2-B §9 — variantes accentuées CONFIRMÉES par les cas d'usage
// documentés (§9/§15/§45), pour la recherche CÔTÉ SERVEUR (PostgREST ILIKE
// ne fait pas de repli d'accents — contrairement à normalizeSearchText() qui
// compare deux chaînes déjà en mémoire côté client, une requête serveur doit
// comparer le mot tapé à une colonne stockée AVEC ses accents d'origine).
//
// Portée volontairement bornée à des paires confirmées, pas un repli Unicode
// général (qui nécessiterait l'extension Postgres `unaccent` — migration
// préparée mais non exécutée, voir supabase/migrations/0020_search_v2_unaccent_rpc.sql
// et REGISTRY_EXTRACTION_SAFETY §35 pour la même logique appliquée à ce
// sprint : une migration additive est autorisée à être préparée, pas
// nécessairement exécutée par cet agent — pas d'accès direct à la base au-delà
// de PostgREST dans cet environnement). Étendre cette liste à la main au fur
// et à mesure de nouveaux cas confirmés, jamais deviner un mot absent d'ici.
const ACCENT_VARIANT_PAIRS: readonly (readonly [string, string])[] = [
  ["ecole", "école"],
  ["college", "collège"],
  ["prive", "privé"],
  ["superieur", "supérieur"],
  ["yaounde", "yaoundé"],
  ["ngaoundere", "ngaoundéré"],
  ["edea", "edéa"],
  ["kousseri", "kousséri"],
  ["bangangte", "bangangté"],
];
const ACCENT_VARIANTS: ReadonlyMap<string, readonly string[]> = (() => {
  const map = new Map<string, string[]>();
  for (const [plain, accented] of ACCENT_VARIANT_PAIRS) {
    map.set(plain, [plain, accented]);
    map.set(accented, [plain, accented]);
  }
  return map;
})();

/**
 * Toutes les formes connues d'un mot NORMALISÉ (déjà passé par
 * normalizeSearchText, donc en minuscules sans accents) à utiliser pour
 * construire une requête serveur (ILIKE OR) — combine l'alias lycée/lyce
 * (§10) et les paires accentuées confirmées (§9/§15) ci-dessus. Le mot
 * d'origine est toujours inclus.
 */
export function serverSearchWordForms(normalizedWord: string): readonly string[] {
  const lyceeForms = searchWordVariants(normalizedWord);
  const accentForms = ACCENT_VARIANTS.get(normalizedWord) ?? [normalizedWord];
  return Array.from(new Set([...lyceeForms, ...accentForms]));
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
