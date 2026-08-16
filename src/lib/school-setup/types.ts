// Types d'architecture pour "School Setup Intelligence" (Sprint L, V1).
// Aucune dépendance DB, aucun appel réseau ici — squelette de référence pour
// la prochaine phase (implémentation réelle après validation d'Eddy et de
// l'architecte, une fois la migration 0015 exécutée).
//
// Un seul fournisseur IA sera implémenté en V1, mais le reste du pipeline ne
// doit jamais dépendre directement de son SDK — toute intégration passe par
// cette interface (règle Sprint L §42).

export type SchoolSetupEntityType =
  | "teacher"
  | "staff"
  | "class"
  | "subject"
  | "room"
  | "assignment"
  | "timetable_slot"
  | "payroll_hint";

export type SchoolSetupConfidence = "high" | "medium" | "low";

/** Une entité proposée par l'extraction — jamais écrite dans une table réelle
 *  avant confirmation explicite du directeur (school_setup_drafts.data). */
export type ExtractedItem = {
  entityType: SchoolSetupEntityType;
  data: Record<string, unknown>;
  confidence: SchoolSetupConfidence;
  source: {
    fileId: string;
    fileName: string;
    page?: number;
  };
};

/** Sortie stricte attendue de toute extraction IA (règle §8/§46) — validée
 *  par schéma avant d'être acceptée. Le texte libre n'est jamais un résultat
 *  final du pipeline. */
export type ExtractionResult = {
  teachers: ExtractedItem[];
  classes: ExtractedItem[];
  subjects: ExtractedItem[];
  rooms: ExtractedItem[];
  assignments: ExtractedItem[];
  timetableSlots: ExtractedItem[];
  payrollHints: ExtractedItem[];
  warnings: string[];
  uncertainties: string[];
};

export type MatchSuggestion = {
  candidateId: string;
  existingId: string;
  existingLabel: string;
  candidateLabel: string;
  confidence: SchoolSetupConfidence;
  reason: string;
};

/** Abstraction fournisseur IA — aucune partie du pipeline ne doit importer un
 *  SDK (OpenAI/Anthropic/...) directement en dehors d'une implémentation de
 *  cette interface. */
export interface AIExtractionProvider {
  readonly name: string;
  extract(input: { fileId: string; fileName: string; mimeType: string; content: Buffer | string }): Promise<ExtractionResult>;
  normalize(items: ExtractedItem[]): Promise<ExtractedItem[]>;
  match(candidate: ExtractedItem, existingRecords: { id: string; label: string }[]): Promise<MatchSuggestion[]>;
}

/** Le moteur de conflits n'est PAS une IA (règle §21) — code déterministe
 *  uniquement. Ce type documente son contrat, l'implémentation réelle vivra
 *  dans src/lib/school-setup/conflicts.ts (phase suivante). */
export type ScheduleConflict = {
  type: "teacher" | "room" | "class";
  draftIds: string[];
  description: string;
};
