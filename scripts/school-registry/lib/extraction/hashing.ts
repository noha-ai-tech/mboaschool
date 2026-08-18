import { createHash } from "node:crypto";

/**
 * SPRINT R.2-SAFETY §10, §69-70 — SHA256 uniquement (§69 : "ne pas
 * sur-ingénierer avec blockchain ou système externe"). Sert la chaîne
 * d'audit RAW HASH -> EXTRACTION HASH -> NORMALIZED DATASET HASH.
 */
export function sha256(content: string): string {
  return createHash("sha256").update(content, "utf-8").digest("hex");
}

/**
 * §70 — hash déterministe d'un dataset normalisé : le tri doit être stable
 * AVANT hash, sinon le même contenu dans un ordre différent produirait un
 * hash différent (faux négatif de reproductibilité, §47).
 */
export function normalizedDatasetHash<T>(rows: T[], stableKey: (row: T) => string): string {
  const sorted = [...rows].sort((a, b) => stableKey(a).localeCompare(stableKey(b)));
  return sha256(JSON.stringify(sorted));
}
