import { createHash } from "node:crypto";

/**
 * SPRINT P.6 — Garde-fou central pour toute écriture production du registre
 * national (`establishments`, en dernier ressort `establishment_import_staging`).
 *
 * Contexte : le batch minesec-master-v1-promotion-p3 (556 établissements) a
 * été promu hors de tout script tracé dans ce repo (voir SPRINT P.5,
 * reconcile-promotion-p3.ts). L'origine exacte reste non identifiée
 * (investigation SPRINT P.6 : PowerShell/bash history, git reflog, git log
 * complet — aucune trace, aucun secret exposé). Ce module empêche qu'une
 * promotion future se reproduise sans passer par ce garde-fou.
 *
 * Pipeline canonique (voir REGISTRY_PRODUCTION_RUNBOOK.md) :
 *   collect -> normalize -> staging -> matching -> review -> approval snapshot
 *   -> dry-run -> human authorization -> production promotion
 *   -> staging reconciliation -> audit verification -> QA public
 *
 * `assertRegistryProductionWriteAllowed` couvre l'étape "production
 * promotion" : elle ne fait AUCUN appel réseau, ne lit aucun secret — elle
 * valide uniquement les arguments explicites fournis par l'appelant et lève
 * si un seul est manquant ou incorrect. Volontairement pas de prompt
 * interactif (fragile en CI) : tout passe par des flags CLI explicites.
 */

export const EXPECTED_PROJECT_REF = "umcwwynrftidytxgqkwi";
export const PROMOTION_CONFIRM_PHRASE = "PROMOTE_REGISTRY_TO_PRODUCTION";

export interface RegistryWriteRequest {
  /** --commit présent sur argv (sinon dry-run implicite, jamais d'écriture). */
  commit: boolean;
  /** --confirm="PROMOTE_REGISTRY_TO_PRODUCTION" — empêche un `npm run x` accidentel de suffire. */
  confirmPhrase: string | undefined;
  /** Dérivé de NEXT_PUBLIC_SUPABASE_URL, jamais d'un flag (pour ne pas pouvoir être spoofé). */
  projectRef: string;
  /** Batch réellement ciblé par ce run (ex. registry_import_batch prévu). */
  batch: string;
  /** Batch attendu, fixé par la mission/l'approbation humaine — jamais deviné. */
  expectedBatch: string;
  /** Ministère source réellement présent sur les lignes sélectionnées. */
  sourceMinistry: string;
  expectedSourceMinistry: string;
  /** Nombre de candidats éligibles calculé maintenant par le dry-run. */
  actualCandidates: number;
  /** --expected-candidates=N, fixé au moment de l'approbation humaine. */
  expectedCandidates: number;
  /** Checksum recalculé maintenant sur le set réellement sélectionné. */
  computedChecksum: string;
  /** --approval-checksum=..., produit par le dry-run validé. */
  approvalChecksum: string | undefined;
}

export class RegistryWriteRefused extends Error {}

/**
 * Lève RegistryWriteRefused au premier garde-fou violé. Ne retourne jamais
 * "true/false" : un appelant qui ignorerait un booléen de retour serait un
 * bug silencieux, alors qu'une exception non interceptée arrête le script.
 */
export function assertRegistryProductionWriteAllowed(req: RegistryWriteRequest): void {
  if (!req.commit) {
    throw new RegistryWriteRefused("REFUSED — --commit absent. Dry-run par défaut, aucune écriture.");
  }
  if (req.confirmPhrase !== PROMOTION_CONFIRM_PHRASE) {
    throw new RegistryWriteRefused(
      `REFUSED — phrase de confirmation manquante ou incorrecte. Exiger --confirm="${PROMOTION_CONFIRM_PHRASE}".`
    );
  }
  if (req.projectRef !== EXPECTED_PROJECT_REF) {
    throw new RegistryWriteRefused(`REFUSED — project ref inattendu (${req.projectRef} != ${EXPECTED_PROJECT_REF}).`);
  }
  if (req.batch !== req.expectedBatch) {
    throw new RegistryWriteRefused(`REFUSED — batch inattendu (${req.batch} != ${req.expectedBatch}).`);
  }
  if (req.sourceMinistry !== req.expectedSourceMinistry) {
    throw new RegistryWriteRefused(`REFUSED — source ministère inattendue (${req.sourceMinistry} != ${req.expectedSourceMinistry}).`);
  }
  if (req.actualCandidates !== req.expectedCandidates) {
    throw new RegistryWriteRefused(
      `REFUSED — nombre de candidats inattendu (${req.actualCandidates} != ${req.expectedCandidates}). ` +
        "Le staging a probablement évolué depuis la revue humaine — relancer une revue + dry-run, ne jamais forcer."
    );
  }
  if (!req.approvalChecksum || req.approvalChecksum !== req.computedChecksum) {
    throw new RegistryWriteRefused(
      `REFUSED — checksum d'approbation absent ou différent (attendu ${req.approvalChecksum ?? "(absent)"}, ` +
        `calculé maintenant ${req.computedChecksum}). Le set exact approuvé a changé depuis le dry-run validé.`
    );
  }
}

/**
 * SHA256 déterministe du set approuvé : trie par id pour être stable même si
 * l'ordre de lecture réseau varie entre deux exécutions.
 */
export function computeApprovalChecksum(rows: { id: string; officialId: string | null; decision: string }[]): string {
  const material = rows
    .map((r) => `${r.id}|${r.officialId ?? ""}|${r.decision}`)
    .sort()
    .join("\n");
  return createHash("sha256").update(material).digest("hex");
}

export interface PromotionReportShape {
  eligible: number;
  inserted: number;
  skipped: number;
  failed: number;
  project_ref: string;
  timestamp: string;
  registry_import_batch: string;
  approval_checksum: string;
}

const REQUIRED_REPORT_FIELDS: (keyof PromotionReportShape)[] = [
  "eligible",
  "inserted",
  "skipped",
  "failed",
  "project_ref",
  "timestamp",
  "registry_import_batch",
  "approval_checksum",
];

/**
 * Une promotion n'est jamais "réussie" sans son rapport (§12). Un rapport
 * incomplet ou absent ne doit jamais repasser inaperçu — l'appelant doit
 * `process.exitCode = 1` si `complete` est faux, même si les écritures DB
 * elles-mêmes se sont bien passées.
 */
export function verifyPromotionReportComplete(report: Partial<PromotionReportShape>): { complete: boolean; missing: string[] } {
  const missing = REQUIRED_REPORT_FIELDS.filter((k) => {
    const v = report[k];
    return v === undefined || v === null || v === "";
  });
  return { complete: missing.length === 0, missing };
}

export type PromotionOutcome = "SUCCESS" | "PARTIAL_RECONCILIATION_REQUIRED";

/**
 * §13-14 — une promotion n'est complète que si chaque établissement créé a
 * exactement une ligne staging qui pointe vers lui. Le bug SPRINT P.3 (556
 * créés, 0 liés) ne doit plus jamais se qualifier silencieusement de SUCCESS.
 */
export function evaluatePromotionOutcome(createdCount: number, stagingLinkedCount: number): PromotionOutcome {
  return createdCount === stagingLinkedCount ? "SUCCESS" : "PARTIAL_RECONCILIATION_REQUIRED";
}
