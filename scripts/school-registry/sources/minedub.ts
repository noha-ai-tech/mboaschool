import type { RawSourceRecord, SourceAdapter } from "../types";

// ============================================================================
// Adaptateur MINEDUB — Éducation de base (maternelle + primaire)
//
// NON IMPLÉMENTÉ dans cette mission (DATA-REGISTRY-01 se limite à MINESEC).
// Source à identifier : MINEDUB ne publie pas, à la connaissance de cette
// mission, de répertoire national consultable en ligne équivalent à celui
// de MINESEC — à vérifier auprès du ministère ou par recherche complémentaire
// avant le prochain sprint (voir docs/03_DATA_REGISTRY/SOURCE_CATALOG.md).
// ============================================================================

export function createMinedubAdapter(): SourceAdapter {
  return {
    ministry: "MINEDUB",
    sourceName: "À déterminer — aucun répertoire en ligne identifié à ce stade",
    async fetchAll(): Promise<RawSourceRecord[]> {
      throw new Error(
        "Adaptateur MINEDUB non implémenté — voir SOURCE_CATALOG.md pour le statut de cette source."
      );
    },
  };
}
