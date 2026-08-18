// SPRINT R.2 §2-3, §7 — Configuration officielle des villes prioritaires.
// Dédupliquée. Chaque ville pointe vers sa région canonique administrative
// (jamais modifiée) — voir src/lib/cameroonRegions.ts pour la liste des 10
// régions et CAMEROON_CITY_REGIONS pour le mapping ville->région déjà
// utilisé côté produit (réutilisé ici, pas dupliqué).

export type CityPriority = 1 | 2 | 3;

export interface MajorCity {
  name: string;
  priority: CityPriority;
  region: string;
  /** Arrondissements/zones connus pour l'analyse approfondie (§20-22) — laissé vide si non seedé, jamais inventé. */
  zones?: string[];
  /** Termes anglais à inclure dans la recherche (§24) — villes anglophones uniquement. */
  anglophone?: boolean;
  /**
   * §24 — Variantes orthographiques anglaises/coloniales confirmées dans la
   * source (jamais inventées). "Kimbo" = ancienne graphie de Kumbo,
   * observée telle quelle dans establishment_import_staging
   * ("Lyce Bilingue de KIMBO", locality NSO). Les autres variantes connues
   * (ex. "Victoria" pour Limbe, "Banso" pour Kumbo) ont été cherchées dans
   * les 448 lignes Nord-Ouest/Sud-Ouest et ne sont pas présentes — non
   * ajoutées.
   */
  variants?: string[];
}

export const MAJOR_CITIES: MajorCity[] = [
  { name: "Douala", priority: 1, region: "Littoral", zones: ["Douala I", "Douala II", "Douala III", "Douala IV", "Douala V", "Douala VI"] },
  { name: "Yaoundé", priority: 1, region: "Centre", zones: ["Yaoundé I", "Yaoundé II", "Yaoundé III", "Yaoundé IV", "Yaoundé V", "Yaoundé VI", "Yaoundé VII"] },

  { name: "Bafoussam", priority: 2, region: "Ouest" },
  { name: "Bamenda", priority: 2, region: "Nord-Ouest", anglophone: true },
  { name: "Buea", priority: 2, region: "Sud-Ouest", anglophone: true },
  { name: "Limbe", priority: 2, region: "Sud-Ouest", anglophone: true },
  { name: "Kumba", priority: 2, region: "Sud-Ouest", anglophone: true },
  { name: "Garoua", priority: 2, region: "Nord" },
  { name: "Maroua", priority: 2, region: "Extrême-Nord" },
  { name: "Ngaoundéré", priority: 2, region: "Adamaoua" },

  { name: "Bertoua", priority: 3, region: "Est" },
  { name: "Ebolowa", priority: 3, region: "Sud" },
  { name: "Kribi", priority: 3, region: "Sud" },
  { name: "Dschang", priority: 3, region: "Ouest" },
  { name: "Foumban", priority: 3, region: "Ouest" },
  { name: "Nkongsamba", priority: 3, region: "Littoral" },
  { name: "Edéa", priority: 3, region: "Littoral" },
  { name: "Kousséri", priority: 3, region: "Extrême-Nord" },
  { name: "Mbouda", priority: 3, region: "Ouest" },
  { name: "Bangangté", priority: 3, region: "Ouest" },
  { name: "Mokolo", priority: 3, region: "Extrême-Nord" },
  { name: "Sangmélima", priority: 3, region: "Sud" },
  { name: "Batouri", priority: 3, region: "Est" },
  { name: "Abong-Mbang", priority: 3, region: "Est" },
  { name: "Mamfe", priority: 3, region: "Sud-Ouest", anglophone: true },
  { name: "Kumbo", priority: 3, region: "Nord-Ouest", anglophone: true, variants: ["Kimbo"] },
];

/**
 * §7 — Alias d'arrondissement -> macro-ville produit. Niveau de
 * recherche/agrégation UNIQUEMENT : ne remplace jamais l'arrondissement
 * administratif réel (non seedé dans establishments.arrondissement pour
 * la plupart des lignes MINESEC — voir SPRINT R §37, non résolu ce sprint
 * non plus, hors périmètre §22).
 */
export function macroCityForZone(zone: string): string | null {
  const m = zone.match(/^(Douala|Yaound[ée]|Bafoussam)\s+[IVX]+$/i);
  if (!m) return null;
  const base = m[1];
  return base.toLowerCase().startsWith("yaound") ? "Yaoundé" : base;
}

function stripAccents(s: string | null | undefined): string {
  return (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/**
 * §6 — Une ligne "appartient" à une ville si son city, sa locality, OU son
 * nom mentionne la ville (substring, insensible aux accents) — jamais
 * seulement `city`, qui est presque toujours NULL pour les lignes MINESEC
 * (confirmé SPRINT Q/R : la source ne publie pas de colonne ville, la
 * ville n'apparaît souvent que dans le nom de l'établissement, ex. "Lyce
 * Bilingue de KRIBI").
 */
export function rowMentionsCity(city: string, variants: string[] = []): (row: { city?: string | null; locality?: string | null; name?: string | null; nameRaw?: string | null }) => boolean {
  const keys = [city, ...variants].map(stripAccents);
  return (row) => {
    const c = stripAccents(row.city);
    const l = stripAccents(row.locality);
    const n = stripAccents(row.name ?? row.nameRaw);
    return keys.some((key) => c.includes(key) || l.includes(key) || n.includes(key));
  };
}
