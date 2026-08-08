import type { RawSourceRecord, SourceAdapter } from "../types";

// ============================================================================
// Adaptateur MINSANTE — Écoles de formation en santé
//
// NON IMPLÉMENTÉ dans cette mission (DATA-REGISTRY-01 se limite à MINESEC).
// Source à identifier avant le prochain sprint.
// Voir docs/03_DATA_REGISTRY/SOURCE_CATALOG.md.
// ============================================================================

export function createMinsanteAdapter(): SourceAdapter {
  return {
    ministry: "MINSANTE",
    sourceName: "À déterminer",
    async fetchAll(): Promise<RawSourceRecord[]> {
      throw new Error(
        "Adaptateur MINSANTE non implémenté — voir SOURCE_CATALOG.md pour le statut de cette source."
      );
    },
  };
}
