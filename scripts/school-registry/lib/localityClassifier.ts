/**
 * SPRINT Q — généralisation du classifieur de localité de SPRINT P
 * (classify-suspicious-localities.ts), qui opérait sur une liste déjà
 * pré-filtrée de valeurs "suspectes" issue d'une revue humaine antérieure.
 * Batch Q est un nouveau batch sans historique de revue préalable : ce
 * module applique la même logique de tokens directement à CHAQUE localité
 * brute, sans présupposer qu'une liste "suspecte" existe déjà.
 *
 * Même règle CLEARLY_INVALID/POSSIBLE_REAL_LOCALITY/NEEDS_REVIEW que SPRINT
 * P (voir classify-suspicious-localities.ts pour la justification détaillée
 * des tokens de bruit). Ajoute VALID (aucun token de bruit détecté) et
 * MISSING (valeur vide) pour couvrir le cas général — SPRINT P n'avait pas
 * besoin de ces deux états puisqu'il ne classifiait que des valeurs déjà
 * signalées suspectes.
 */

export type LocalityStatus = "VALID" | "MISSING" | "CLEARLY_INVALID" | "POSSIBLE_REAL_LOCALITY" | "NEEDS_REVIEW";

const NOISE_TOKENS = new Set([
  "oui", "non", "degre", "degres", "deg", "er", "e", "eme", "me", "1r", "de", "du", "et",
]);
const ORDINAL_RE = /^\d+(er|eme|me|e|r)$/;

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function tokenize(value: string): string[] {
  return stripAccents(value)
    .toLowerCase()
    .replace(/[()/]/g, " ")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

export function classifyLocality(raw: string | null | undefined): LocalityStatus {
  const value = (raw ?? "").trim();
  if (value.length === 0) return "MISSING";

  const lower = stripAccents(value).toLowerCase();
  if (lower.includes("chefferie")) return "POSSIBLE_REAL_LOCALITY";

  const tokens = tokenize(value);
  const residual = tokens.filter((t) => !NOISE_TOKENS.has(t) && !/^\d+$/.test(t) && !ORDINAL_RE.test(t));

  if (residual.length === 0) return "CLEARLY_INVALID";
  if (residual.length === tokens.length) return "VALID";
  return "NEEDS_REVIEW";
}
