import type { RawSourceRecord, SourceAdapter } from "../types";

// ============================================================================
// Adaptateur MINESUP — Enseignement supérieur (universités, grandes écoles)
//
// NON IMPLÉMENTÉ dans cette mission (DATA-REGISTRY-01 se limite à MINESEC).
// Source à identifier : MINESUP publie une liste des institutions privées
// d'enseignement supérieur agréées (IPES) — URL et structure exacte à
// confirmer avant le prochain sprint. Voir docs/03_DATA_REGISTRY/SOURCE_CATALOG.md.
// ============================================================================

export function createMinesupAdapter(): SourceAdapter {
  return {
    ministry: "MINESUP",
    sourceName: "À déterminer — liste IPES à localiser et vérifier",
    async fetchAll(): Promise<RawSourceRecord[]> {
      throw new Error(
        "Adaptateur MINESUP non implémenté — voir SOURCE_CATALOG.md pour le statut de cette source."
      );
    },
  };
}
