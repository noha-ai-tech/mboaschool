import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseMinsanteA1Pdf, PARSER_VERSION } from "./lib/extraction/pdfMinsanteA1";
import { buildUniqueSchoolCandidates } from "./lib/extraction/minsanteDedup";
import { evaluateCompleteness } from "./lib/extraction/completeness";
import { sha256 } from "./lib/extraction/hashing";

/**
 * SPRINT MINSANTE-A.1 — Runner READ-ONLY. Parse le texte brut déjà collecté
 * (data/registry/raw/minsante-a1/liste-ecoles-agrees-minsante-2025.txt,
 * extrait via `pdftotext -layout` du PDF Source A, SHA256 du PDF original
 * = 26e68ab08092faa18e0fdf604e4ee6b93c229180ec9ea1f0d044f6b1a6a3946a,
 * inchangé depuis MINSANTE-A), applique la déduplication, et écrit
 * UNIQUEMENT des artefacts locaux (data/registry/normalized/,
 * reports/registry/). AUCUNE écriture Supabase — ce script n'importe même
 * pas de client réseau.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..", "..");

function csvEscape(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function main() {
  const rawTextPath = join(rootDir, "data", "registry", "raw", "minsante-a1", "liste-ecoles-agrees-minsante-2025.txt");
  const rawText = readFileSync(rawTextPath, "utf-8");
  const rawTextSha256 = sha256(rawText);
  const sourcePdfSha256 = "26e68ab08092faa18e0fdf604e4ee6b93c229180ec9ea1f0d044f6b1a6a3946a"; // PDF original, catalogué MINSANTE-A, revérifié identique ce sprint (curl -> même hash).

  console.log(`Texte source : ${rawTextPath}`);
  console.log(`SHA256 texte extrait (pdftotext -layout) : ${rawTextSha256}`);
  console.log(`SHA256 PDF original (Source A, catalogué MINSANTE-A) : ${sourcePdfSha256}`);

  // §7 — parseMinsanteA1Pdf lève une exception (jamais un tableau vide) si
  // le document est structurellement méconnaissable. Aucun catch ici : un
  // échec doit arrêter le script, pas produire un rapport vide.
  const parsed = parseMinsanteA1Pdf(rawText);

  const anomalousSections = parsed.filiereSections.filter((s) => s.status === "STRUCTURE_ANOMALY");
  const parsedSections = parsed.filiereSections.filter((s) => s.status === "PARSED");

  // §6-7 — verdict de complétude dérivé du framework partagé, jamais d'une
  // règle ad hoc locale. structureValid=false dès qu'UNE SEULE filière est
  // en anomalie structurelle (§7 : "changement de structure majeur" à
  // l'échelle du document ne se limite pas à un seul recoin isolé — un
  // sous-ensemble non fiable rend l'extraction complète non sûre pour un
  // futur staging, même si le sous-ensemble fiable reste exploitable en
  // DISCOVERY).
  const completeness = evaluateCompleteness({
    expectedRows: null,
    expectedRowsSource: "UNKNOWN",
    extractedRows: parsed.rows.length,
    duplicateRows: 0,
    explainedExclusions: parsed.explainedExclusions.map((e) => ({ reason: e.reason, count: e.count, category: "OTHER" as const })),
    pagination: null,
    structureValid: anomalousSections.length === 0,
    structureInvalidReason:
      anomalousSections.length > 0
        ? `${anomalousSections.length}/10 filière(s) en anomalie structurelle (assignation région non fiable) : ${anomalousSections.map((s) => s.filiereRaw).join(", ")}.`
        : null,
    networkFailed: false,
    networkFailureReason: null,
    unknownCountExplicitlyComplete:
      anomalousSections.length === 0
        ? { reason: "10/10 filières officielles connues détectées, 11/11 pages du document lues intégralement, chaque section numérotée vérifiée (redémarrages de région = étiquettes région)." }
        : null,
  });

  console.log(`\n=== EXTRACTION STATUS: ${completeness.status} ===`);
  console.log(`safeForStaging: ${completeness.safeForStaging} (attendu : false — aucune écriture staging ce sprint de toute façon, §17)`);
  console.log(completeness.explanation);
  console.log(`\nFilières PARSED (${parsedSections.length}/10) : ${parsedSections.map((s) => s.filiereRaw).join(", ")}`);
  console.log(`Filières STRUCTURE_ANOMALY (${anomalousSections.length}/10) : ${anomalousSections.map((s) => s.filiereRaw).join(", ")}`);
  console.log(`\nTotal école×filière rows (filières PARSED uniquement) : ${parsed.rows.length}`);
  console.log(`Régions observées (${parsed.regionsObserved.length}/10) : ${parsed.regionsObserved.join(", ")}`);

  const dedup = buildUniqueSchoolCandidates(parsed.rows);
  console.log(`\nÉtablissements uniques (post-dédoublonnage EXACT_SAME_SCHOOL) : ${dedup.candidates.length}`);
  console.log(`Fusions exactes appliquées : ${dedup.exactMergeCount} ligne(s) fusionnée(s) dans un groupe existant`);
  const byRel: Record<string, number> = {};
  for (const r of dedup.reviewEntries) byRel[r.relationship] = (byRel[r.relationship] ?? 0) + 1;
  console.log(`Paires signalées pour revue : ${JSON.stringify(byRel)}`);
  const multiProgram = dedup.candidates.filter((c) => c.programsNormalized.length > 1);
  console.log(`Établissements multi-filières : ${multiProgram.length}/${dedup.candidates.length}`);

  // §18 — data/registry/normalized/*.json (artefacts locaux uniquement).
  const normalizedDir = join(rootDir, "data", "registry", "normalized");
  mkdirSync(normalizedDir, { recursive: true });

  const schoolProgramRowsOutput = {
    sprint: "MINSANTE-A.1",
    generated_at: new Date().toISOString(),
    parser_version: PARSER_VERSION,
    source_pdf_sha256: sourcePdfSha256,
    source_text_sha256: rawTextSha256,
    extraction_status: completeness.status,
    safe_for_staging: completeness.safeForStaging,
    declared_total_pages: parsed.declaredTotalPages,
    pages_found: parsed.pagesFound.length,
    filiere_sections: parsed.filiereSections.map((s) => ({
      filiere_raw: s.filiereRaw,
      program_normalized: s.programNormalized,
      status: s.status,
      row_count: s.rows.length,
      region_reset_count: s.regionResetCount,
      region_label_count: s.regionLabelCount,
      anomaly_reason: s.anomalyReason,
    })),
    explained_exclusions: parsed.explainedExclusions,
    regions_observed: parsed.regionsObserved,
    rows: parsed.rows,
  };
  writeFileSync(join(normalizedDir, "minsante-a1-school-program-rows.json"), JSON.stringify(schoolProgramRowsOutput, null, 2), "utf-8");

  const uniqueSchoolsOutput = {
    sprint: "MINSANTE-A.1",
    generated_at: new Date().toISOString(),
    input_row_count: dedup.totalInputRows,
    unique_school_count: dedup.candidates.length,
    exact_merge_count: dedup.exactMergeCount,
    review_pair_count: dedup.reviewEntries.length,
    review_pair_counts_by_relationship: byRel,
    candidates: dedup.candidates,
  };
  writeFileSync(join(normalizedDir, "minsante-a1-unique-schools.json"), JSON.stringify(uniqueSchoolsOutput, null, 2), "utf-8");

  // §19 — reports/registry/*.csv
  const reportsDir = join(rootDir, "reports", "registry");
  mkdirSync(reportsDir, { recursive: true });

  const programRowsHeader = "region,filiere_raw,program_normalized,raw_school_name,source_line";
  const programRowsCsv = [
    programRowsHeader,
    ...parsed.rows.map((r) => [r.region, r.filiereRaw, r.programNormalized, r.rawSchoolName, r.sourceLine].map(csvEscape).join(",")),
  ].join("\n");
  writeFileSync(join(reportsDir, "minsante-a1-program-rows.csv"), programRowsCsv, "utf-8");

  const uniqueSchoolsHeader = "id,region,display_name,program_count,programs_normalized,merged_row_count,source_lines";
  const uniqueSchoolsCsv = [
    uniqueSchoolsHeader,
    ...dedup.candidates.map((c) =>
      [c.id, c.region, c.displayName, c.programsNormalized.length, c.programsNormalized.join(" | "), c.mergedRowCount, c.sourceLines.join(" | ")].map(csvEscape).join(",")
    ),
  ].join("\n");
  writeFileSync(join(reportsDir, "minsante-a1-unique-schools.csv"), uniqueSchoolsCsv, "utf-8");

  const dedupReviewHeader = "relationship,overlap_ratio,school_a_id,school_a_name,school_a_region,school_b_id,school_b_name,school_b_region,reason";
  const dedupReviewCsv = [
    dedupReviewHeader,
    ...dedup.reviewEntries.map((r) =>
      [r.relationship, r.overlapRatio.toFixed(2), r.schoolAId, r.schoolAName, r.schoolARegion, r.schoolBId, r.schoolBName, r.schoolBRegion, r.reason].map(csvEscape).join(",")
    ),
  ].join("\n");
  writeFileSync(join(reportsDir, "minsante-a1-dedup-review.csv"), dedupReviewCsv, "utf-8");

  console.log(`\nFichiers écrits :`);
  console.log(`  data/registry/normalized/minsante-a1-school-program-rows.json (${parsed.rows.length} lignes)`);
  console.log(`  data/registry/normalized/minsante-a1-unique-schools.json (${dedup.candidates.length} établissements)`);
  console.log(`  reports/registry/minsante-a1-program-rows.csv`);
  console.log(`  reports/registry/minsante-a1-unique-schools.csv`);
  console.log(`  reports/registry/minsante-a1-dedup-review.csv`);
  console.log(`\nAucune écriture Supabase effectuée par ce script (aucun appel réseau).`);
}

main();
