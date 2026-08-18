// SPRINT R.2 §28 — Configuration produit des villes prioritaires, pour la
// recherche publique (/recherche, Landing) et les filtres du Review Center
// (§68-69). Distincte de scripts/school-registry/lib/majorCities.ts, qui
// sert l'outillage de collecte/audit du registre (mêmes 26 villes, mais
// jamais importée depuis le code applicatif — pas de dépendance app ->
// scripts). Les deux listes doivent rester alignées manuellement si l'une
// évolue.
//
// Aucune valeur ici ne remplace la géographie administrative réelle
// (src/lib/cameroonRegions.ts reste la seule source pour `region`). Cette
// configuration sert uniquement une couche de recherche/produit — voir §29,
// ne jamais en déduire une valeur `city` fabriquée.

export type CityPriority = "A" | "B" | "C";

export interface MajorCity {
  name: string;
  region: string;
  priority: CityPriority;
  /**
   * Variantes orthographiques/coloniales confirmées dans la donnée source
   * elle-même (jamais inventées — §24/§29). "Kimbo" trouvé le 2026-08-18
   * dans establishment_import_staging ("Lyce Bilingue de KIMBO").
   */
  aliases?: string[];
  /**
   * Arrondissements vérifiés (§10-12). Laissé vide si non confirmé dans la
   * source — jamais inventé. Douala et Yaoundé sont les deux seules villes
   * confirmées à ce jour (audit §20-22 : seulement 4/56 fiches mentionnent
   * un arrondissement, donc peu exploitable pour le filtrage, utile
   * seulement pour la recherche libre).
   */
  zones?: string[];
  anglophone?: boolean;
}

export const MAJOR_CITIES: MajorCity[] = [
  { name: "Douala", region: "Littoral", priority: "A", zones: ["Douala I", "Douala II", "Douala III", "Douala IV", "Douala V", "Douala VI"] },
  { name: "Yaoundé", region: "Centre", priority: "A", aliases: ["Yaounde"], zones: ["Yaoundé I", "Yaoundé II", "Yaoundé III", "Yaoundé IV", "Yaoundé V", "Yaoundé VI", "Yaoundé VII"] },

  { name: "Bafoussam", region: "Ouest", priority: "B" },
  { name: "Bamenda", region: "Nord-Ouest", priority: "B", anglophone: true },
  { name: "Buea", region: "Sud-Ouest", priority: "B", anglophone: true },
  { name: "Limbe", region: "Sud-Ouest", priority: "B", anglophone: true },
  { name: "Kumba", region: "Sud-Ouest", priority: "B", anglophone: true },
  { name: "Garoua", region: "Nord", priority: "B" },
  { name: "Maroua", region: "Extrême-Nord", priority: "B" },
  { name: "Ngaoundéré", region: "Adamaoua", priority: "B", aliases: ["Ngaoundere"] },
  { name: "Bertoua", region: "Est", priority: "B" },
  { name: "Ebolowa", region: "Sud", priority: "B" },

  { name: "Kribi", region: "Sud", priority: "C" },
  { name: "Dschang", region: "Ouest", priority: "C" },
  { name: "Foumban", region: "Ouest", priority: "C" },
  { name: "Nkongsamba", region: "Littoral", priority: "C" },
  { name: "Edéa", region: "Littoral", priority: "C" },
  { name: "Kousséri", region: "Extrême-Nord", priority: "C" },
  { name: "Mbouda", region: "Ouest", priority: "C" },
  { name: "Bangangté", region: "Ouest", priority: "C" },
  { name: "Mokolo", region: "Extrême-Nord", priority: "C" },
  { name: "Sangmélima", region: "Sud", priority: "C" },
  { name: "Batouri", region: "Est", priority: "C" },
  { name: "Abong-Mbang", region: "Est", priority: "C" },
  { name: "Mamfe", region: "Sud-Ouest", priority: "C", anglophone: true },
  { name: "Kumbo", region: "Nord-Ouest", priority: "C", anglophone: true, aliases: ["Kimbo"] },
];

/**
 * §13 — Termes institutionnels anglais à inclure dans la recherche pour les
 * villes anglophones. Ce sont des termes de TYPE d'établissement (comme
 * "Lycée"/"CES" côté francophone), pas des variantes du nom de ville — à ne
 * jamais confondre avec `aliases` ci-dessus. Ne jamais franciser
 * automatiquement un nom officiel qui les contient (§13).
 */
export const ANGLOPHONE_INSTITUTION_TERMS = [
  "College",
  "Secondary School",
  "High School",
  "Bilingual College",
  "Technical College",
  "Government Secondary School",
  "Government High School",
] as const;

export function getMajorCity(name: string | null | undefined): MajorCity | null {
  if (!name) return null;
  const key = name.trim().toLowerCase();
  return MAJOR_CITIES.find((c) => c.name.toLowerCase() === key || (c.aliases ?? []).some((a) => a.toLowerCase() === key)) ?? null;
}
