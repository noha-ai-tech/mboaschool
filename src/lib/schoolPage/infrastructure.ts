// CMS-F.3 — source unique des 10 clés d'infrastructure (table
// `infrastructures`, une ligne par établissement). Déplacé depuis
// src/components/school/GeneralTab.tsx pour que les routes API n'aient
// plus besoin d'importer un composant React. Volontairement SANS les
// icônes lucide-react : celles-ci restent un détail purement visuel de
// GeneralTab.tsx (qui combine ces libellés avec une icône par clé) —
// importer une icône React dans une route API n'aurait aucun sens et
// romprait la règle "l'API n'importe jamais de composant React".
export type InfrastructureKey =
  | "library"
  | "laboratory"
  | "computer_room"
  | "sports_field"
  | "canteen"
  | "boarding"
  | "transport"
  | "security"
  | "wifi"
  | "infirmary";

// Correspond aux colonnes réelles de la table infrastructures.
export const INFRASTRUCTURE_LABELS: Record<InfrastructureKey, string> = {
  library: "Bibliothèque",
  laboratory: "Laboratoire",
  computer_room: "Salle informatique",
  sports_field: "Terrain de sport",
  canteen: "Cantine scolaire",
  boarding: "Internat",
  transport: "Transport scolaire",
  security: "Sécurité",
  wifi: "Connexion Wi-Fi",
  infirmary: "Infirmerie",
};

export const INFRASTRUCTURE_KEYS: InfrastructureKey[] = Object.keys(INFRASTRUCTURE_LABELS) as InfrastructureKey[];
