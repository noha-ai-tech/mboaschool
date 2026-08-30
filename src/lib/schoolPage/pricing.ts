// CMS-F.3 — source unique des 7 clés de tarifs (table `fees`, une ligne par
// établissement). Déplacé depuis src/components/school/GeneralTab.tsx (un
// composant React) pour que les routes API (server-only) n'aient plus
// jamais besoin d'importer un fichier .tsx — GeneralTab.tsx réexporte
// désormais FEE_COLS depuis ce module au lieu de le déclarer localement,
// aucune valeur ni aucun libellé n'a changé.
export type FeeKey =
  | "registration_fee"
  | "tuition_fee"
  | "transport_fee"
  | "canteen_fee"
  | "uniform_fee"
  | "exam_fee"
  | "other_fees";

export const FEE_COLS: { key: FeeKey; label: string }[] = [
  { key: "registration_fee", label: "Inscription" },
  { key: "tuition_fee",      label: "Scolarité" },
  { key: "transport_fee",    label: "Transport" },
  { key: "canteen_fee",      label: "Cantine" },
  { key: "uniform_fee",      label: "Uniforme" },
  { key: "exam_fee",         label: "Examens" },
  { key: "other_fees",       label: "Autres frais" },
];

export const FEE_KEYS: FeeKey[] = FEE_COLS.map((f) => f.key);
