import type { RawSourceRecord, SourceAdapter } from "../types";

// ============================================================================
// Adaptateur MINEPIA — Écoles de formation élevage / pêches
//
// NON IMPLÉMENTÉ dans cette mission (DATA-REGISTRY-01 se limite à MINESEC).
// Source à identifier avant le prochain sprint.
// Voir docs/03_DATA_REGISTRY/SOURCE_CATALOG.md.
// ============================================================================

export function createMinepiaAdapter(): SourceAdapter {
  return {
    ministry: "MINEPIA",
    sourceName: "À déterminer",
    async fetchAll(): Promise<RawSourceRecord[]> {
      throw new Error(
        "Adaptateur MINEPIA non implémenté — voir SOURCE_CATALOG.md pour le statut de cette source."
      );
    },
  };
}
