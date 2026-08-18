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

export function getCameroonRegion(city: string | null | undefined): string | null {
  if (!city) return null;
  return CAMEROON_CITY_REGIONS[city.trim()] ?? null;
}

// Macro-zones produit (SPRINT Q) — navigation, filtres, statistiques
// UNIQUEMENT. Jamais une valeur de `region` en base : Nord-Ouest et
// Sud-Ouest (comme Adamaoua/Nord/Extrême-Nord) restent des régions
// administratives canoniques distinctes. Un regroupement produit ne doit
// jamais réécrire une donnée géographique réelle.
export const GRAND_NORD = ["Adamaoua", "Nord", "Extrême-Nord"] as const;
export const ZONE_ANGLOPHONE = ["Nord-Ouest", "Sud-Ouest"] as const;

export function isInGrandNord(region: string | null | undefined): boolean {
  return Boolean(region) && (GRAND_NORD as readonly string[]).includes(region!);
}

export function isInZoneAnglophone(region: string | null | undefined): boolean {
  return Boolean(region) && (ZONE_ANGLOPHONE as readonly string[]).includes(region!);
}
