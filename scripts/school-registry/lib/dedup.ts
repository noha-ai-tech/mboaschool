import type { NormalizedStagingRecord } from "../types";

export interface DedupResult {
  records: NormalizedStagingRecord[];
  exactDuplicates: number;
  potentialDuplicates: number;
}

/**
 * Dédoublonnage au sein d'un même batch d'import.
 *
 * Règle absolue (voir DEDUPLICATION_RULES.md) : aucune suppression
 * automatique. Un doublon certain (même matricule officiel, ou fingerprint
 * nom+géo strictement identique) est marqué `duplicate_exact`. Toute
 * ambiguïté — nom très proche mais pas identique, localisation partielle —
 * est marquée `duplicate_review` et laissée à une décision humaine.
 *
 * Le premier enregistrement rencontré pour un fingerprint donné reste
 * `normalized` (ou `ready` après ce passage) ; les suivants sont marqués
 * comme doublons de celui-ci via `duplicateOfIndex`.
 */
export function deduplicateBatch(records: NormalizedStagingRecord[]): DedupResult {
  const seenByFingerprint = new Map<string, number>();
  const seenByNormalizedNameOnly = new Map<string, number[]>();

  let exactDuplicates = 0;
  let potentialDuplicates = 0;

  const result = records.map((record, index) => {
    if (record.status === "rejected") {
      return record;
    }

    const exactMatchIndex = seenByFingerprint.get(record.fingerprint);

    if (exactMatchIndex !== undefined) {
      exactDuplicates++;
      return {
        ...record,
        status: "duplicate_exact" as const,
        duplicateOfIndex: exactMatchIndex,
      };
    }

    seenByFingerprint.set(record.fingerprint, index);

    // Doublon potentiel : même nom normalisé, mais fingerprint différent
    // (ex. localité renseignée différemment, matricule absent d'un côté).
    // Ambigu par nature — jamais résolu automatiquement.
    const sameNameIndexes = seenByNormalizedNameOnly.get(record.nameNormalized) ?? [];
    if (sameNameIndexes.length > 0) {
      potentialDuplicates++;
      seenByNormalizedNameOnly.set(record.nameNormalized, [...sameNameIndexes, index]);
      return {
        ...record,
        status: "duplicate_review" as const,
        duplicateOfIndex: sameNameIndexes[0],
      };
    }
    seenByNormalizedNameOnly.set(record.nameNormalized, [index]);

    return { ...record, status: "ready" as const };
  });

  return { records: result, exactDuplicates, potentialDuplicates };
}
