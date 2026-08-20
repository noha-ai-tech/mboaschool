// SPRINT MINSANTE-C — §19-20. Adaptateur de classification ministère-
// agnostique pour le Registry Review Center
// (src/app/dashboard/admin/registre/page.tsx).
//
// PROBLÈME RÉSOLU (§19) : la fonction `classify()` historique du Review
// Center ne comprend que les champs `raw_data._matchAudit`/
// `raw_data._localityAudit` écrits par le pipeline MINESEC
// (import-master-v1-to-staging.ts). Les lignes MINSANTE (écrites par
// minsante-b-pilot-collect.ts / minsante-c-reclassify.ts) utilisent une
// forme différente : `raw_data.classification` / `raw_data.category_decision`
// / `raw_data.match_audit` (live/staging). Faute d'adaptateur, TOUTES les
// lignes MINSANTE — y compris CATEGORY_REVIEW et DUPLICATE_REVIEW —
// s'affichaient comme "Nouveaux candidats propres" génériques.
//
// DESIGN (§20) : chaque ministère (ou source future) fournit un petit
// "reader" qui traduit sa forme de raw_data propre en un jeu de signaux
// COMMUNS (`ReviewSignals`). Un seul résolveur partagé
// (`resolveReviewState`) transforme ensuite ces signaux en état normalisé —
// AUCUN if-chain géant par ministère : ajouter un ministère futur ne
// nécessite qu'un nouveau reader optionnel (ou aucun — la colonne `status`,
// commune à tous les ministères, sert de filet de sécurité générique, cf.
// `readGenericStatusSignals`).

export type ReviewState =
  | "CLEAN_APPROVABLE"
  | "DUPLICATE_REVIEW"
  | "CATEGORY_REVIEW"
  | "SOURCE_REVIEW"
  | "IDENTITY_REVIEW"
  | "IDENTIFIER_COLLISION_REVIEW"
  | "CROSS_MINISTRY_REVIEW"
  | "PROMOTED"
  | "OTHER_REVIEW";

/** Colonnes de establishment_import_staging pertinentes pour la classification. Sous-ensemble minimal — pas de dépendance au type StagingRow complet de la page. */
export interface ReviewableStagingRow {
  status: string | null;
  source_ministry: string | null;
  raw_data: Record<string, unknown> | null;
}

/** Signaux communs, indépendants du ministère source. */
export interface ReviewSignals {
  /** Correspondance d'identité contre un établissement/ligne EXISTANT(E) (production ou staging) — jamais un doublon interne au lot. */
  identityMatch: "NONE" | "EXACT" | "STRONG" | "PROBABLE" | "AMBIGUOUS";
  /** Ambiguïté d'identité contre la production/le staging existant — distinct d'un simple signal de doublon (cf. MINSANTE `IDENTITY_REVIEW` — §20). */
  identityAmbiguous: boolean;
  /** Problème de qualité de la donnée source elle-même (localité invalide, source non fiable...). */
  sourceIssue: boolean;
  /** Ambiguïté de dédoublonnage NON résolue à l'intérieur du même lot d'import. */
  duplicateWithinBatch: boolean;
  /** Catégorie (main_category/sub_category) non résolue — §7-8 : jamais devinée. */
  categoryUnresolved: boolean;
  /** Risque qu'une même institution réelle existe déjà sous un autre ministère (§10-12). */
  crossMinistry: boolean;
  /** Collision d'identifiant officiel entre deux cibles distinctes (§findIdentifierCollisions du moteur de matching). */
  identifierCollision: boolean;
  /** Ligne déjà promue en establishment (status='promoted'). */
  promoted: boolean;
}

const EMPTY_SIGNALS: ReviewSignals = {
  identityMatch: "NONE",
  identityAmbiguous: false,
  sourceIssue: false,
  duplicateWithinBatch: false,
  categoryUnresolved: false,
  crossMinistry: false,
  identifierCollision: false,
  promoted: false,
};

/**
 * Filet de sécurité GÉNÉRIQUE, utilisé par TOUT ministère (y compris un
 * ministère futur sans reader dédié) — dérive un signal minimal depuis la
 * seule colonne `status`, commune à tout le schéma staging
 * (StagingStatus : pending/normalized/duplicate_exact/duplicate_review/
 * ready/rejected/promoted). Jamais un `classify()` par ministère écrit en
 * dur : ce lecteur EST le comportement par défaut pour tout ministère non
 * couvert ci-dessous.
 */
function readGenericStatusSignals(row: ReviewableStagingRow): ReviewSignals {
  const signals = { ...EMPTY_SIGNALS };
  switch (row.status) {
    case "promoted":
      signals.promoted = true;
      break;
    case "duplicate_exact":
      signals.identityMatch = "EXACT";
      break;
    case "duplicate_review":
      signals.duplicateWithinBatch = true;
      break;
    default:
      break;
  }
  return signals;
}

/**
 * MINESEC — reader dédié (§23 : comportement existant préservé à l'identique).
 * Lit `raw_data._matchAudit`/`raw_data._localityAudit`, écrits par
 * import-master-v1-to-staging.ts — INCHANGÉS ce sprint.
 */
function readMinesecSignals(row: ReviewableStagingRow): ReviewSignals {
  const signals = readGenericStatusSignals(row);
  const raw = row.raw_data as { _matchAudit?: { matchType?: string }; _localityAudit?: { localityStatus?: string } } | null;
  const matchType = raw?._matchAudit?.matchType;
  if (matchType === "EXISTING_OFFICIAL_ID" || matchType === "EXISTING_LEGACY_CONFIRMED") {
    signals.identityMatch = "EXACT";
  } else if (matchType === "EXISTING_PROBABLE") {
    signals.identityMatch = "PROBABLE";
  } else if (matchType === "REVIEW_REQUIRED") {
    signals.identityAmbiguous = true;
  }
  const localityStatus = raw?._localityAudit?.localityStatus;
  if (localityStatus === "CLEARLY_INVALID" || localityStatus === "NEEDS_REVIEW") {
    signals.sourceIssue = true;
  }
  return signals;
}

/**
 * MINSANTE — reader dédié (§19-20, correction du bug identifié en
 * MINSANTE-B). Lit `raw_data.classification` (état AUTHORITATIF, tenu à
 * jour additivement par minsante-b-pilot-collect.ts puis
 * minsante-c-reclassify.ts — §24-25) en priorité ; `raw_data.match_audit`
 * sert de repli si `classification` est absent (ligne écrite par un futur
 * batch MINSANTE antérieur à toute reclassification).
 */
function readMinsanteSignals(row: ReviewableStagingRow): ReviewSignals {
  const signals = readGenericStatusSignals(row);
  const raw = row.raw_data as
    | {
        classification?: string;
        match_audit?: { live?: { level?: string }; staging?: { level?: string } };
        cross_ministry_review?: { decision?: string };
      }
    | null;
  const classification = raw?.classification;

  switch (classification) {
    case "CLEAN_APPROVABLE":
      // Aucun signal négatif — laisse le filet générique décider (status
      // 'ready' -> CLEAN_APPROVABLE via resolveReviewState).
      break;
    case "CATEGORY_REVIEW":
      signals.categoryUnresolved = true;
      break;
    case "DUPLICATE_REVIEW":
      signals.duplicateWithinBatch = true;
      break;
    case "IDENTITY_REVIEW":
      signals.identityAmbiguous = true;
      break;
    case "CROSS_MINISTRY_REVIEW":
      signals.crossMinistry = true;
      break;
    case "ALREADY_LIVE":
    case "ALREADY_STAGING":
      signals.identityMatch = "EXACT";
      break;
    case "INVALID":
      signals.sourceIssue = true;
      break;
    default: {
      // Pas de `classification` connue (ligne pré-reclassification, ou
      // future) — repli sur le signal de correspondance brut le plus fort
      // disponible entre live et staging, jamais un statut deviné.
      const liveLevel = raw?.match_audit?.live?.level;
      const stagingLevel = raw?.match_audit?.staging?.level;
      for (const level of [liveLevel, stagingLevel]) {
        if (level === "AMBIGUOUS") signals.identityAmbiguous = true;
        else if (level === "STRONG_MATCH" || level === "PROBABLE_MATCH") signals.duplicateWithinBatch = true;
      }
      break;
    }
  }

  // §12 — un signal frontière inter-ministérielle explicite (écrit par
  // minsante-c-reclassify.ts) prime toujours, même si `classification`
  // n'a pas (encore) été mis à jour en conséquence.
  if (raw?.cross_ministry_review?.decision === "SAME_INSTITUTION_CROSS_MINISTRY" || raw?.cross_ministry_review?.decision === "AMBIGUOUS") {
    signals.crossMinistry = true;
  }

  return signals;
}

/** Table des readers par ministère — AUCUN if-chain géant : ajouter un ministère futur = ajouter une entrée ici (ou rien, filet générique). */
const MINISTRY_READERS: Record<string, (row: ReviewableStagingRow) => ReviewSignals> = {
  MINESEC: readMinesecSignals,
  MINSANTE: readMinsanteSignals,
  // MINESUP et tout ministère futur non listé ici : filet générique
  // status-only (readGenericStatusSignals), délibérément — MINESUP n'écrit
  // aujourd'hui aucune métadonnée riche dans raw_data (voir
  // minesup-pilot-v1-collect.ts, raw_data = n.raw tel quel), donc le statut
  // reste le seul signal fiable disponible pour ce ministère à ce jour.
};

function readSignals(row: ReviewableStagingRow): ReviewSignals {
  const reader = row.source_ministry ? MINISTRY_READERS[row.source_ministry] : undefined;
  return reader ? reader(row) : readGenericStatusSignals(row);
}

/**
 * Résolveur PARTAGÉ, unique — même logique de priorité quel que soit le
 * ministère d'origine des signaux. Ordre de priorité déterministe :
 * promotion > collision d'identifiant > frontière inter-ministérielle >
 * ambiguïté d'identité > doublon > problème de source > catégorie non
 * résolue > défaut (status-driven, jamais une valeur devinée pour un
 * statut inconnu).
 */
export function resolveReviewState(signals: ReviewSignals, status: string | null): ReviewState {
  if (signals.promoted || status === "promoted") return "PROMOTED";
  if (signals.identifierCollision) return "IDENTIFIER_COLLISION_REVIEW";
  if (signals.crossMinistry) return "CROSS_MINISTRY_REVIEW";
  if (signals.identityAmbiguous) return "IDENTITY_REVIEW";
  if (signals.identityMatch !== "NONE" || signals.duplicateWithinBatch) return "DUPLICATE_REVIEW";
  if (signals.sourceIssue) return "SOURCE_REVIEW";
  if (signals.categoryUnresolved) return "CATEGORY_REVIEW";
  if (status === "ready" || status === "normalized") return "CLEAN_APPROVABLE";
  if (status === "rejected") return "OTHER_REVIEW";
  // pending / statut inconnu / absent — jamais présumé "propre" (§8).
  return "OTHER_REVIEW";
}

/** Point d'entrée unique de l'adaptateur — §20. */
export function registryReviewClassification(row: ReviewableStagingRow): ReviewState {
  return resolveReviewState(readSignals(row), row.status);
}

/**
 * Extrait une liste de programmes lisible depuis raw_data, quel que soit le
 * ministère — §21 (affichage minimal des programmes, pas de nouvelle UI de
 * curriculum). MINSANTE stocke `programs_normalized`/`programs_raw`
 * (minsanteDedup.ts) ; tout autre ministère n'a aujourd'hui aucun champ
 * programme structuré -> tableau vide, jamais une valeur inventée.
 */
export function extractPrograms(row: ReviewableStagingRow): string[] {
  const raw = row.raw_data as { programs_normalized?: unknown; programs_raw?: unknown } | null;
  const normalized = Array.isArray(raw?.programs_normalized) ? (raw!.programs_normalized as unknown[]) : null;
  const source = normalized ?? (Array.isArray(raw?.programs_raw) ? (raw!.programs_raw as unknown[]) : []);
  return source.filter((p): p is string => typeof p === "string" && p.trim().length > 0);
}
