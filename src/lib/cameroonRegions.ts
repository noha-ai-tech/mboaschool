// Répartition réelle des villes camerounaises par région administrative —
// géographie factuelle (pas une donnée produit), utilisée uniquement pour
// calculer un nombre honnête de "régions couvertes" à partir des villes
// réellement présentes en base. Une ville absente de cette liste n'est
// simplement pas comptée (sous-estimation prudente plutôt qu'une supposition
// hasardeuse) — la liste n'a pas vocation à être exhaustive.
export const CAMEROON_CITY_REGIONS: Record<string, string> = {
  "Ngaoundéré": "Adamaoua",
  "Tibati": "Adamaoua",
  "Meiganga": "Adamaoua",
  "Tignère": "Adamaoua",

  "Yaoundé": "Centre",
  "Mbalmayo": "Centre",
  "Obala": "Centre",
  "Mfou": "Centre",
  "Akonolinga": "Centre",
  "Monatélé": "Centre",
  "Bafia": "Centre",
  "Eséka": "Centre",

  "Bertoua": "Est",
  "Abong-Mbang": "Est",
  "Batouri": "Est",
  "Yokadouma": "Est",

  "Maroua": "Extrême-Nord",
  "Kousséri": "Extrême-Nord",
  "Mokolo": "Extrême-Nord",
  "Kaélé": "Extrême-Nord",
  "Yagoua": "Extrême-Nord",

  "Douala": "Littoral",
  "Nkongsamba": "Littoral",
  "Edéa": "Littoral",
  "Loum": "Littoral",
  "Manjo": "Littoral",
  "Mbanga": "Littoral",

  "Garoua": "Nord",
  "Guider": "Nord",
  "Poli": "Nord",
  "Tcholliré": "Nord",

  "Bamenda": "Nord-Ouest",
  "Kumbo": "Nord-Ouest",
  "Wum": "Nord-Ouest",
  "Ndop": "Nord-Ouest",
  "Mbengwi": "Nord-Ouest",

  "Bafoussam": "Ouest",
  "Dschang": "Ouest",
  "Foumban": "Ouest",
  "Mbouda": "Ouest",
  "Bandjoun": "Ouest",
  "Bangangté": "Ouest",
  "Foumbot": "Ouest",

  "Ebolowa": "Sud",
  "Kribi": "Sud",
  "Sangmélima": "Sud",
  "Ambam": "Sud",

  "Buea": "Sud-Ouest",
  "Limbe": "Sud-Ouest",
  "Kumba": "Sud-Ouest",
  "Mamfe": "Sud-Ouest",
  "Tiko": "Sud-Ouest",
  "Muyuka": "Sud-Ouest",
};

import { normalizeForSearch } from "./textSearch";

// Index normalisé (accents/casse indifférents) construit une seule fois —
// "Douala", "douala", "DOUALA" doivent tous retrouver "Littoral".
const NORMALIZED_CITY_REGIONS: Record<string, string> = Object.fromEntries(
  Object.entries(CAMEROON_CITY_REGIONS).map(([city, region]) => [normalizeForSearch(city), region])
);

export function getCameroonRegion(city: string | null | undefined): string | null {
  if (!city) return null;
  return NORMALIZED_CITY_REGIONS[normalizeForSearch(city)] ?? null;
}
