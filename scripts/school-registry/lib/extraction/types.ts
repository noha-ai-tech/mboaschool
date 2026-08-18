/**
 * SPRINT R.2-SAFETY §3-13 — Contrat partagé par TOUT futur extracteur de
 * source du registre national (MINESEC, MINEDUB, MINESUP, MINEFOP, MINSANTE,
 * délégations, annuaires officiels...). Déclenché par un incident réel :
 * un résumé IA d'une page Yaoundé avait annoncé ~10 établissements, alors
 * que l'extraction déterministe du même HTML brut en a trouvé 231 (§ voir
 * REGISTRY_EXTRACTION_SAFETY.md, "Incident R.2 Yaoundé").
 *
 * Principe directeur : CODE DÉTERMINISTE POUR COLLECTER, IA POUR COMPRENDRE.
 * Un extracteur ne "pense" jamais qu'une page est complète — il le PROUVE
 * avec un compte (DOM, pagination, compteur source, fichier).
 */

/** §7 — classification de la source avant toute extraction. */
export type SourceClassification = "STRUCTURED" | "SEMI_STRUCTURED" | "UNSTRUCTURED";

/** §6 — types de source supportés par l'architecture. */
export type SourceType =
  | "HTML_TABLE"
  | "HTML_LIST"
  | "PAGINATED_HTML"
  | "JSON_API"
  | "CSV"
  | "XLSX"
  | "PDF_TEXT"
  | "PDF_TABLE"
  | "UNSTRUCTURED_HTML"
  | "OTHER";

/**
 * §38 — statut final d'une extraction. Un seul de ces statuts autorise un
 * import staging automatique (§39) : PASS, ou PASS_WITH_EXPLAINED_EXCLUSIONS
 * si chaque exclusion est auditée (§16).
 */
export type ExtractionStatus =
  | "PASS"
  | "PASS_WITH_EXPLAINED_EXCLUSIONS"
  | "INCOMPLETE_EXTRACTION"
  | "SOURCE_STRUCTURE_CHANGED"
  | "PAGINATION_GAP"
  | "PAGINATION_LOOP"
  | "NETWORK_FAILURE"
  | "INVALID_SOURCE_RESPONSE"
  | "MANUAL_REVIEW_REQUIRED";

/** §13 — comment expectedRows a été déterminé, par ordre de priorité décroissante. */
export type ExpectedRowsSource =
  | "SOURCE_EXPLICIT_COUNTER"
  | "API_TOTAL"
  | "PAGINATION_TIMES_ROWS"
  | "FULL_DOM_TRAVERSAL"
  | "FILE_COMPUTABLE"
  | "UNKNOWN";

/** §16-17 — une ligne source exclue de extractedRows, mais comptabilisée. */
export interface ExplainedExclusion {
  reason: string;
  count: number;
  /** ex. "header/footer mal compté par le compteur source", "doublon exact interne" */
  category: "HEADER_FOOTER" | "DUPLICATE_EXACT" | "REJECTED_INVALID" | "OTHER";
}

/** §19 — état de la pagination pour une source paginée. */
export interface PaginationAccounting {
  pagesExpected: number | null;
  pagesFetched: number;
  fetchedPageIds: (string | number)[];
  /** §20 — empreinte de contenu par page, pour détecter une boucle. */
  pageFingerprints: Record<string, string>;
  gapDetected: boolean;
  loopDetected: boolean;
}

/** §48 — traçabilité minimale d'une assistance IA pendant la collecte. */
export interface AiAssistanceLog {
  used: boolean;
  purpose?: "classification" | "ambiguity" | "fuzzy_matching" | "pdf_understanding" | "structure_understanding" | "other";
  note?: string;
}

/**
 * §12 — résultat structuré que TOUT extracteur doit retourner. Les noms
 * suivent la terminologie du sprint (pas de renommage pour "faire propre" —
 * elle doit rester identique à REGISTRY_EXTRACTION_SAFETY.md).
 */
export interface ExtractionResult {
  source: string;
  sourceUrl: string;
  sourceType: SourceType;
  classification: SourceClassification;
  fetchedAt: string;

  expectedRows: number | null;
  expectedRowsSource: ExpectedRowsSource;
  detectedRows: number;
  extractedRows: number;
  normalizedRows: number;
  rejectedRows: number;
  duplicateRows: number;
  explainedExclusions: ExplainedExclusion[];

  pagination: PaginationAccounting | null;

  contentSha256: string | null;
  parserVersion: string;
  operator: string;

  aiAssistance: AiAssistanceLog;

  warnings: string[];
  errors: string[];

  status: ExtractionStatus;
}

/** §42 — le rapport humain dérive de ce même objet, jamais une donnée séparée qui pourrait diverger. */
export interface CompletenessCheckOutcome {
  status: ExtractionStatus;
  safeForNormalization: boolean;
  safeForStaging: boolean;
  accounted: number;
  expected: number | null;
  explanation: string;
}
