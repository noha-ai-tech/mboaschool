// Types canoniques partagés par tous les adaptateurs de source.
// Miroir volontaire des enums SQL définis dans
// supabase/migrations/0006_national_registry_staging.sql (non exécutée).
// Toute modification ici doit être répercutée dans cette migration.

export type SourceMinistry =
  | "MINEDUB"
  | "MINESEC"
  | "MINESUP"
  | "MINEFOP"
  | "MINSANTE"
  | "MINADER"
  | "MINEPIA"
  | "MINFOF"
  | "OTHER";

export type EducationFamily =
  | "basic"
  | "secondary_general"
  | "secondary_technical"
  | "teacher_training"
  | "higher_education"
  | "vocational_training"
  | "health_training"
  | "agricultural_training"
  | "livestock_fisheries_training"
  | "forestry_wildlife_training"
  | "other";

export type Ownership = "public" | "private" | "community" | "other";

export type Subsystem = "francophone" | "anglophone" | "bilingual" | "not_applicable" | "unknown";

export type StagingStatus =
  | "pending"
  | "normalized"
  | "duplicate_exact"
  | "duplicate_review"
  | "ready"
  | "rejected"
  | "promoted";

/**
 * Format canonique retourné par CHAQUE adaptateur de source, avant
 * normalisation. `raw` doit contenir les données originales intactes —
 * principe absolu de la mission DATA-REGISTRY-01 : jamais d'établissement
 * sans pouvoir remonter à sa source exacte.
 */
export interface RawSourceRecord {
  sourceMinistry: SourceMinistry;
  sourceUrl: string;
  sourceYear: number | null;
  officialIdentifier: string | null;
  /** Données brutes exactement telles qu'extraites de la source, avant toute transformation. */
  raw: Record<string, unknown>;

  // Champs extraits tels quels (avant normalisation canonique) — un adaptateur
  // ne devine ni n'invente une valeur absente de la source.
  nameRaw: string;
  region: string | null;
  department: string | null;
  arrondissement: string | null;
  commune: string | null;
  locality: string | null;
  city: string | null;
  quarter: string | null;
  subsystemRaw: string | null;
  educationFamilyHint: string | null; // ex. "Cycles", "Type d'enseignement" — texte brut, non classifié
  ownershipHint: string | null;       // ex. présence d'un "fondateur" -> indice de statut privé
}

/** Enregistrement après normalisation — ce qui serait inséré dans establishment_import_staging. */
export interface NormalizedStagingRecord extends RawSourceRecord {
  nameNormalized: string;
  educationFamily: EducationFamily | null;
  ownership: Ownership | null;
  subsystem: Subsystem;
  fingerprint: string;
  status: StagingStatus;
  duplicateOfIndex: number | null; // index dans le même batch, si doublon détecté localement
  rejectionReason: string | null;
}

/** Contrat que chaque adaptateur de source doit respecter. */
export interface SourceAdapter {
  ministry: SourceMinistry;
  sourceName: string;
  /** Récupère les enregistrements bruts depuis la source (réseau). */
  fetchAll(): Promise<RawSourceRecord[]>;
}
