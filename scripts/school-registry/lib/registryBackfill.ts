/**
 * SPRINT REGISTRY-MULTI-B — règles pures du backfill
 * `establishment_registry_identifiers`, extraites pour être testables
 * isolément (cf. REGISTRY-MULTI-A : la longueur, pas un motif de
 * caractères, reste le seul signal homogène pour MINESEC_ESG — un motif
 * fixe aurait classé à tort 764 identifiants valides comme invalides).
 */

export const ESG_EXPECTED_LENGTH = 17;

export type OfficialIdClassification =
  | { status: "VALID"; registry: "MINESEC_ESG"; identifierType: "OFFICIAL_ID" }
  | { status: "REVIEW_REQUIRED"; reason: string };

/** Classifie un official_id MINESEC historique — jamais un insert direct sans passer par ici. */
export function classifyMinesecOfficialId(officialId: string, sourceMinistry: string | null): OfficialIdClassification {
  if (sourceMinistry !== "MINESEC") {
    return { status: "REVIEW_REQUIRED", reason: `official_id présent mais source_ministry="${sourceMinistry}" non reconnu pour un registre automatique` };
  }
  const value = officialId.trim();
  if (value.length !== ESG_EXPECTED_LENGTH) {
    return { status: "REVIEW_REQUIRED", reason: `longueur inattendue (${value.length} caractères, attendu ${ESG_EXPECTED_LENGTH})` };
  }
  return { status: "VALID", registry: "MINESEC_ESG", identifierType: "OFFICIAL_ID" };
}
