import type { RawSourceRecord, SourceAdapter } from "../types";

// ============================================================================
// Adaptateur MINEFOP — Formation professionnelle
//
// NON IMPLÉMENTÉ dans cette mission (DATA-REGISTRY-01 se limite à MINESEC).
// Source à identifier avant le prochain sprint.
// Voir docs/03_DATA_REGISTRY/SOURCE_CATALOG.md.
// ============================================================================

export function createMinefopAdapter(): SourceAdapter {
  return {
    ministry: "MINEFOP",
    sourceName: "À déterminer",
    async fetchAll(): Promise<RawSourceRecord[]> {
      throw new Error(
        "Adaptateur MINEFOP non implémenté — voir SOURCE_CATALOG.md pour le statut de cette source."
      );
    },
  };
}
