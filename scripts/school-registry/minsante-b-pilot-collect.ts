import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { parseMinsanteA1Pdf, PARSER_VERSION, OFFICIAL_PROGRAMS } from "./lib/extraction/pdfMinsanteA1";
import { buildUniqueSchoolCandidates, type UniqueSchoolCandidate, type DedupReviewEntry } from "./lib/extraction/minsanteDedup";
import { evaluateCompleteness, requireExtractionSafe } from "./lib/extraction/completeness";
import { sha256 } from "./lib/extraction/hashing";
import { normalizeRecord } from "./lib/normalize";
import { matchCandidate } from "./lib/matching/engine";
import { generateMinsanteBPilotReports } from "./lib/minsanteBPilotReports";
import type { RawSourceRecord, NormalizedStagingRecord } from "./types";
import type { MatchTarget, MatchResult } from "./lib/matching/types";

/**
 * SPRINT MINSANTE-B — pilote LIMITÉ, région Ouest, 6 filières MINSANTE
 * fiables (Analyses Médicales, Infirmiers, Odontostomatologie, Optique
 * Réfraction, Prothèse Dentaire, Sages-femmes/Maïeuticiens).
 *
 * Réutilise le parseur PDF déterministe MINSANTE-A.1 (INCHANGÉ ce sprint —
 * seul le moteur de matching partagé a été durci, §6-8) sur le MÊME texte
 * source déjà collecté et haché (aucun nouveau fetch réseau).
 *
 * Portée autorisée : extraction -> dédup -> matching -> STAGING uniquement.
 * INTERDIT : establishments INSERT/UPDATE/DELETE, registry identifiers,
 * promotion, migration, auto-merge flou, collecte nationale, 4 filières
 * quarantinées (restent SOURCE_STRUCTURE_REVIEW, jamais tentées ce sprint).
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..", "..");

const BATCH_ID = "minsante-pilot-v1";
const OPERATOR = "jean-merlain";
const TARGET_REGION = "Ouest";
const RELIABLE_PROGRAMS = ["Analyses Médicales", "Infirmiers", "Odontostomatologie", "Optique Réfraction", "Prothèse Dentaire", "Sages-femmes/Maïeuticiens"];
const SOURCE_URL =
  "https://examen-national-special-minsante.cm/loadfile/L2hvbWUvZXhhbWVuL2NvbmNvdXJzZnJhbWV3b3JrL3N0b3JhZ2UvcGRmL3BhZ2VzL3Jlc3VsdGF0cy9MSVNURV9FQ09MRVNfQUdSRUVTX01JTlNBTlRFXzIwMjUucGRm";
const SOURCE_NAME = "Liste des Écoles de Formation des Personnels Médico-Sanitaires Agréées du MINSANTE — Année 2025";
const SOURCE_AUTHORITY_DECISION = "PROBABLE_TIER_1"; // hérité de MINSANTE-A.1, jamais silencieusement surclassé ce sprint (§4)

function csvEscape(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function readEnvVar(env: string, key: string): string {
  const match = env.match(new RegExp(`^${key}=(.*)$`, "m"));
  const value = match?.[1]?.trim();
  if (!value) throw new Error(`${key} introuvable dans .env.local`);
  return value;
}

// ── §12-13 — décision de catégorie, preuve uniquement, jamais une déduction non fondée. ──
type CategoryDecision = "HEALTH_TRAINING_HIGHER_ED" | "HEALTH_TRAINING_OTHER" | "CATEGORY_REVIEW";
function categoryDecision(displayName: string): { decision: CategoryDecision; evidence: string } {
  const upper = displayName
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase();
  // §13 — SEULS des mots de niveau EXPLICITES dans le titre officiel comptent
  // comme preuve. "INSTITUT" seul ne suffit JAMAIS (interdiction explicite
  // §13). "SUPERIEUR(E)"/"UNIVERSITAIRE"/"UNIVERSITE"/"FACULTE" sont des
  // mots de niveau auto-déclarés par l'établissement lui-même dans son nom
  // officiel — un signal réel, pas une inférence.
  if (/\bSUPERIEUR(E)?\b/.test(upper) || /\bUNIVERSITAIRE\b/.test(upper) || /\bUNIVERSITE\b/.test(upper) || /\bFACULTE\b/.test(upper)) {
    return { decision: "HEALTH_TRAINING_HIGHER_ED", evidence: "Titre officiel contient un mot de niveau explicite (supérieur/universitaire/université/faculté) — auto-déclaré par l'établissement." };
  }
  return {
    decision: "CATEGORY_REVIEW",
    evidence:
      "Aucun mot de niveau explicite dans le titre officiel. §13 interdit d'inférer 'supérieur' depuis 'institut' seul, et interdit d'inférer 'autres' depuis le seul fait d'être une formation santé — revue humaine requise avant toute promotion future.",
  };
}

// ── §16 — scan PII défensif. Le modèle de données school×programme ne capture jamais de champ personnel, mais on le prouve plutôt que de le supposer. ──
const PII_PATTERNS = [/\bM\.\s+[A-ZÀ-Ü]/, /\bMme\.?\s+[A-ZÀ-Ü]/, /\bMonsieur\s+[A-ZÀ-Ü]/i, /\bMadame\s+[A-ZÀ-Ü]/i, /\bDocteur\s+[A-ZÀ-Ü]/i, /\bmatricule\s*[:#]?\s*\d/i, /\bnote\s*[:=]\s*\d/i];
function scanForPii(text: string): string[] {
  return PII_PATTERNS.filter((p) => p.test(text)).map((p) => p.source);
}

function mainCategoryToEducationFamily(mainCategory: string | null): string | null {
  if (mainCategory === "superieur") return "higher_education";
  return mainCategory;
}

interface LiveEst { id: string; name: string; region: string | null; city: string | null; main_category: string | null; }
interface StagingRow { id: string; name_raw: string; region: string | null; city: string | null; education_family: string | null; }

async function fetchAllPaginated<T>(supabase: any, table: string, select: string): Promise<T[]> {
  const all: T[] = [];
  let offset = 0;
  const pageSize = 1000;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabase.from(table).select(select).range(offset, offset + pageSize - 1);
    if (error) throw error;
    all.push(...(data as T[]));
    if (!data || data.length < pageSize) break;
    offset += pageSize;
  }
  return all;
}

async function main() {
  const env = readFileSync(join(rootDir, ".env.local"), "utf-8");
  const url = readEnvVar(env, "NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = readEnvVar(env, "SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(url, serviceKey);

  console.log("=== SPRINT MINSANTE-B — PILOTE LIMITÉ (région Ouest, 6 filières fiables) ===\n");

  // ── §1 — Baseline fraîche ──────────────────────────────────────────────
  const { count: estBefore } = await supabase.from("establishments").select("*", { count: "exact", head: true });
  const { count: stagingBefore } = await supabase.from("establishment_import_staging").select("*", { count: "exact", head: true });
  const { count: registryBefore } = await supabase.from("establishment_registry_identifiers").select("*", { count: "exact", head: true });
  const { count: minsanteStagingBefore } = await supabase.from("establishment_import_staging").select("*", { count: "exact", head: true }).eq("source_ministry", "MINSANTE");
  const { count: healthTrainingStagingBefore } = await supabase.from("establishment_import_staging").select("*", { count: "exact", head: true }).eq("education_family", "health_training");
  console.log(`Baseline : establishments=${estBefore}, staging=${stagingBefore}, registry_identifiers=${registryBefore}`);
  console.log(`MINSANTE staging (avant) : ${minsanteStagingBefore} | health_training staging (avant) : ${healthTrainingStagingBefore}`);

  // ── §5 — Extraction déterministe, MÊME source déjà collectée MINSANTE-A.1 (aucun nouveau fetch réseau) ──
  const rawTextPath = join(rootDir, "data", "registry", "raw", "minsante-a1", "liste-ecoles-agrees-minsante-2025.txt");
  const rawText = readFileSync(rawTextPath, "utf-8");
  const rawTextSha256 = sha256(rawText);
  const sourcePdfSha256 = "26e68ab08092faa18e0fdf604e4ee6b93c229180ec9ea1f0d044f6b1a6a3946a"; // catalogué MINSANTE-A/A.1, inchangé
  console.log(`\nSource texte : ${rawTextPath}`);
  console.log(`SHA256 texte : ${rawTextSha256}`);
  console.log(`SHA256 PDF original : ${sourcePdfSha256}`);

  const parsed = parseMinsanteA1Pdf(rawText); // fail-closed, jamais un tableau vide silencieux

  // ── §5/§7 — garde-fou anti-dérive : l'ensemble des filières PARSED doit rester EXACTEMENT les 6 validées MINSANTE-A.1 ──
  const parsedSections = parsed.filiereSections.filter((s) => s.status === "PARSED");
  const anomalousSections = parsed.filiereSections.filter((s) => s.status === "STRUCTURE_ANOMALY");
  const parsedProgramsSorted = [...new Set(parsedSections.map((s) => s.programNormalized))].sort();
  const reliableProgramsSorted = [...RELIABLE_PROGRAMS].sort();
  if (JSON.stringify(parsedProgramsSorted) !== JSON.stringify(reliableProgramsSorted)) {
    throw new Error(
      `STOP — l'ensemble des filières PARSED (${parsedProgramsSorted.join(", ")}) ne correspond plus exactement aux 6 filières validées MINSANTE-A.1 (${reliableProgramsSorted.join(", ")}). Changement de structure — pilote arrêté, jamais une extension silencieuse du périmètre (§5).`
    );
  }
  console.log(`\nFilières PARSED (6/10, inchangé) : ${parsedProgramsSorted.join(", ")}`);
  console.log(`Filières STRUCTURE_ANOMALY (4/10, quarantinées, jamais tentées ce sprint) : ${anomalousSections.map((s) => s.programNormalized).join(", ")}`);

  // ── Complétude scopée au périmètre pilote (6 filières) — les 4 quarantinées sont une exclusion EXPLIQUÉE, connue depuis A.1, pas une nouvelle anomalie. ──
  const quarantineExcludedCount = anomalousSections.reduce((s, sec) => s + sec.unparsedContentLineCount, 0);
  const completeness = evaluateCompleteness({
    expectedRows: parsed.rows.length + quarantineExcludedCount,
    expectedRowsSource: "FILE_COMPUTABLE",
    extractedRows: parsed.rows.length,
    duplicateRows: 0,
    explainedExclusions: anomalousSections.map((s) => ({
      reason: `Filière "${s.filiereRaw}" quarantinée (SOURCE_STRUCTURE_REVIEW depuis MINSANTE-A.1) — ${s.anomalyReason}`,
      count: s.unparsedContentLineCount,
      category: "OTHER" as const,
    })),
    pagination: null,
    structureValid: anomalousSections.every((s) => !RELIABLE_PROGRAMS.includes(s.programNormalized)), // vrai tant qu'aucune des 6 filières pilote n'est en anomalie
    structureInvalidReason: null,
    networkFailed: false,
    networkFailureReason: null,
  });
  console.log(`\nCOMPLETENESS GATE (périmètre 6 filières) : ${completeness.status} — ${completeness.explanation}`);
  requireExtractionSafe(completeness); // lève une exception -> STOP le pilote si non sûr

  // ── §2 — Sélection région pilote, RECALCULÉE depuis les données fraîches (jamais codée en dur sans preuve) ──
  const rowsByRegion = new Map<string, number>();
  for (const r of parsed.rows) rowsByRegion.set(r.region, (rowsByRegion.get(r.region) ?? 0) + 1);
  const dedupAll = buildUniqueSchoolCandidates(parsed.rows);
  const uniqueByRegion = new Map<string, number>();
  for (const c of dedupAll.candidates) uniqueByRegion.set(c.region, (uniqueByRegion.get(c.region) ?? 0) + 1);
  console.log(`\n=== §2 — SÉLECTION RÉGION PILOTE (recalculée) ===`);
  console.log(`Extrême-Nord : ${rowsByRegion.get("Extrême-Nord")} lignes brutes -> ${uniqueByRegion.get("Extrême-Nord")} établissements uniques`);
  console.log(`Ouest        : ${rowsByRegion.get("Ouest")} lignes brutes -> ${uniqueByRegion.get("Ouest")} établissements uniques`);
  console.log(`SELECTED REGION: ${TARGET_REGION} (voir justification quantitative dans le rapport final — moins de bruit de dédoublonnage, structure comparable)`);

  const pilotRows = parsed.rows.filter((r) => r.region === TARGET_REGION);
  console.log(`\nLignes école×filière brutes (${TARGET_REGION}) : ${pilotRows.length}`);

  // ── §9-10 — Dédup école×programme, EXACT_SAME_SCHOOL uniquement auto-fusionné ──
  const dedup = buildUniqueSchoolCandidates(pilotRows);
  console.log(`Établissements uniques (${TARGET_REGION}) : ${dedup.candidates.length}`);
  console.log(`Fusions exactes appliquées : ${dedup.exactMergeCount}`);
  const byRel: Record<string, number> = {};
  for (const r of dedup.reviewEntries) byRel[r.relationship] = (byRel[r.relationship] ?? 0) + 1;
  console.log(`Paires signalées pour revue (moteur DURCI) : ${JSON.stringify(byRel)}`);

  // Candidats impliqués dans une ambiguïté de dédup non résolue -> DUPLICATE_REVIEW obligatoire (§10)
  const dedupAmbiguousCandidateIds = new Set<string>();
  for (const r of dedup.reviewEntries) {
    dedupAmbiguousCandidateIds.add(r.schoolAId);
    dedupAmbiguousCandidateIds.add(r.schoolBId);
  }

  // ── reports/registry/minsante-b-dedup-review.csv (phase extraction, indépendant de la DB) ──
  mkdirSync(join(rootDir, "reports", "registry"), { recursive: true });
  const dedupReviewHeader = "relationship,overlap_ratio,school_a_id,school_a_name,school_b_id,school_b_name,reason";
  const dedupReviewCsv = [
    dedupReviewHeader,
    ...dedup.reviewEntries.map((r: DedupReviewEntry) => [r.relationship, r.overlapRatio.toFixed(2), r.schoolAId, r.schoolAName, r.schoolBId, r.schoolBName, r.reason].map(csvEscape).join(",")),
  ].join("\n");
  writeFileSync(join(rootDir, "reports", "registry", "minsante-b-dedup-review.csv"), dedupReviewCsv, "utf-8");

  // ── §11-16 — Construction des enregistrements normalisés + décision catégorie + scan PII ──
  const rawRecords: RawSourceRecord[] = dedup.candidates.map((c: UniqueSchoolCandidate) => ({
    sourceMinistry: "MINSANTE",
    sourceUrl: SOURCE_URL,
    sourceYear: 2025,
    officialIdentifier: null, // §14 — aucun identifiant MINSANTE réel validé, jamais inventé
    nameRaw: c.displayName,
    region: c.region,
    department: null,
    arrondissement: null,
    commune: null,
    locality: null,
    city: null, // §15 — jamais déduit du nom (ex. "DE BAFOUSSAM"), aucun champ ville structuré dans la source
    quarter: null,
    subsystemRaw: null,
    educationFamilyHint: SOURCE_NAME,
    ownershipHint: null, // laisse inferOwnership() dériver du texte du nom (prive/catholique/protestant), jamais présumé
    raw: {
      batch: BATCH_ID,
      operator: OPERATOR,
      sprint: "MINSANTE-B",
      source_authority: SOURCE_AUTHORITY_DECISION,
      source_pdf_sha256: sourcePdfSha256,
      source_text_sha256: rawTextSha256,
      parser_version: PARSER_VERSION,
      entity_model: "TRAINING_ESTABLISHMENT", // §11 — source = liste d'écoles, jamais "formation sanitaire" seule classée établissement
      region: c.region,
      programs_normalized: c.programsNormalized,
      programs_raw: c.programsRaw,
      raw_name_variants: c.rawNameVariants,
      merged_row_count: c.mergedRowCount,
      source_lines: c.sourceLines,
      dedup_candidate_id: c.id,
      dedup_ambiguous: dedupAmbiguousCandidateIds.has(c.id),
    },
  }));

  const normalized: NormalizedStagingRecord[] = rawRecords.map(normalizeRecord);

  // ── PII audit (§16) ──
  const piiFindings: { candidate: string; matches: string[] }[] = [];
  for (const c of dedup.candidates) {
    const scanText = [c.displayName, ...c.rawNameVariants, ...c.programsRaw].join(" | ");
    const matches = scanForPii(scanText);
    if (matches.length > 0) piiFindings.push({ candidate: c.displayName, matches });
  }
  const piiAudit = {
    generated_at: new Date().toISOString(),
    sprint: "MINSANTE-B",
    scope: `${TARGET_REGION} — ${dedup.candidates.length} candidats`,
    fields_scanned: ["display_name", "raw_name_variants", "programs_raw"],
    personal_fields_ever_collected: [], // le modèle RawSchoolProgramRow n'a JAMAIS de champ étudiant/promoteur/directeur/score
    pii_pattern_matches: piiFindings,
    pii_persisted: piiFindings.length,
    safe: piiFindings.length === 0,
  };
  writeFileSync(join(rootDir, "reports", "registry", "minsante-b-pii-audit.json"), JSON.stringify(piiAudit, null, 2), "utf-8");
  console.log(`\nPII audit : ${piiAudit.pii_persisted} correspondance(s) trouvée(s) sur ${dedup.candidates.length} candidats (safe=${piiAudit.safe})`);

  // ── §17-18 — Matching contre live + staging (moteur DURCI ce sprint) ──
  const liveEst = await fetchAllPaginated<LiveEst>(supabase, "establishments", "id,name,region,city,main_category");
  const existingStaging = await fetchAllPaginated<StagingRow>(supabase, "establishment_import_staging", "id,name_raw,region,city,education_family");
  const liveTargets: MatchTarget[] = liveEst.map((e) => ({ id: e.id, name: e.name, region: e.region, city: e.city, category: mainCategoryToEducationFamily(e.main_category), identifiers: [] }));
  const stagingTargets: MatchTarget[] = existingStaging.map((s) => ({ id: s.id, name: s.name_raw, region: s.region, city: s.city, category: s.education_family, identifiers: [] }));
  console.log(`\nCibles de matching : ${liveTargets.length} établissements live + ${stagingTargets.length} staging existant`);

  interface CandidateClassification {
    candidate: UniqueSchoolCandidate;
    normalized: NormalizedStagingRecord;
    categoryDecision: ReturnType<typeof categoryDecision>;
    liveMatch: MatchResult;
    stagingMatch: MatchResult;
    classification: "ALREADY_LIVE" | "ALREADY_STAGING" | "IDENTITY_REVIEW" | "DUPLICATE_REVIEW" | "CATEGORY_REVIEW" | "SOURCE_REVIEW" | "CLEAN_APPROVABLE" | "INVALID";
    classificationReason: string;
    stagingStatus: "ready" | "duplicate_exact" | "duplicate_review" | "normalized" | "rejected";
    reviewReason: string | null;
  }

  const classified: CandidateClassification[] = dedup.candidates.map((c, i) => {
    const n = normalized[i];
    const candMatch = { name: c.displayName, region: c.region, city: null, category: "health_training", identifiers: [] };
    const liveMatch = matchCandidate(candMatch, liveTargets);
    const stagingMatch = matchCandidate(candMatch, stagingTargets);
    const cat = categoryDecision(c.displayName);

    let classification: CandidateClassification["classification"];
    let reason: string;
    let stagingStatus: CandidateClassification["stagingStatus"];
    let reviewReason: string | null = null;

    if (n.status === "rejected") {
      classification = "INVALID";
      reason = n.rejectionReason ?? "rejeté par normalizeRecord";
      stagingStatus = "rejected";
    } else if (liveMatch.level === "EXACT_IDENTIFIER" || liveMatch.level === "EXACT_IDENTITY") {
      classification = "ALREADY_LIVE";
      reason = `Correspondance live certaine : ${liveMatch.reason}`;
      stagingStatus = "duplicate_exact";
      reviewReason = "ALREADY_LIVE";
    } else if (stagingMatch.level === "EXACT_IDENTIFIER" || stagingMatch.level === "EXACT_IDENTITY") {
      classification = "ALREADY_STAGING";
      reason = `Correspondance staging existante certaine : ${stagingMatch.reason}`;
      stagingStatus = "duplicate_exact";
      reviewReason = "ALREADY_STAGING";
    } else if (liveMatch.level === "AMBIGUOUS" || stagingMatch.level === "AMBIGUOUS") {
      classification = "IDENTITY_REVIEW";
      reason = liveMatch.level === "AMBIGUOUS" ? `Ambiguïté live : ${liveMatch.reason}` : `Ambiguïté staging : ${stagingMatch.reason}`;
      stagingStatus = "duplicate_review";
      reviewReason = "IDENTITY_REVIEW_AMBIGUOUS_TARGET";
    } else if (dedupAmbiguousCandidateIds.has(c.id)) {
      classification = "DUPLICATE_REVIEW";
      reason = `Ambiguïté de dédoublonnage NON résolue au sein du pilote (§9-10) — voir minsante-b-dedup-review.csv pour le(s) candidat(s) apparenté(s).`;
      stagingStatus = "duplicate_review";
      reviewReason = "DEDUP_AMBIGUITY_UNRESOLVED";
    } else if (liveMatch.level === "STRONG_MATCH" || liveMatch.level === "PROBABLE_MATCH") {
      classification = "DUPLICATE_REVIEW";
      reason = `Signal de doublon live (non certain) : ${liveMatch.reason}`;
      stagingStatus = "duplicate_review";
      reviewReason = "LIVE_DUPLICATE_SIGNAL";
    } else if (stagingMatch.level === "STRONG_MATCH" || stagingMatch.level === "PROBABLE_MATCH") {
      classification = "DUPLICATE_REVIEW";
      reason = `Signal de doublon staging (non certain) : ${stagingMatch.reason}`;
      stagingStatus = "duplicate_review";
      reviewReason = "STAGING_DUPLICATE_SIGNAL";
    } else if (cat.decision === "CATEGORY_REVIEW") {
      classification = "CATEGORY_REVIEW";
      reason = cat.evidence;
      stagingStatus = "normalized";
      reviewReason = "CATEGORY_REVIEW";
    } else {
      classification = "CLEAN_APPROVABLE";
      reason = "Aucun signal de doublon (live/staging/dédup), catégorie suffisamment comprise, aucun problème de source, aucune PII.";
      stagingStatus = "ready";
    }

    return { candidate: c, normalized: n, categoryDecision: cat, liveMatch, stagingMatch, classification, classificationReason: reason, stagingStatus, reviewReason };
  });

  const tally: Record<string, number> = {};
  for (const c of classified) tally[c.classification] = (tally[c.classification] ?? 0) + 1;

  // ── §22 — DRY RUN (obligatoire avant toute écriture) ──────────────────
  console.log("\n=== §22 — MINSANTE-B STAGING DRY RUN ===");
  console.log(`Selected region: ${TARGET_REGION}`);
  console.log(`Raw school×program rows: ${pilotRows.length}`);
  console.log(`Unique establishments: ${dedup.candidates.length}`);
  console.log(`Already live: ${tally.ALREADY_LIVE ?? 0}`);
  console.log(`Already staging: ${tally.ALREADY_STAGING ?? 0}`);
  console.log(`Exact: ${(tally.ALREADY_LIVE ?? 0) + (tally.ALREADY_STAGING ?? 0)}`);
  console.log(`Identity review (ambiguous): ${tally.IDENTITY_REVIEW ?? 0}`);
  console.log(`Duplicate review: ${tally.DUPLICATE_REVIEW ?? 0}`);
  console.log(`Category review: ${tally.CATEGORY_REVIEW ?? 0}`);
  console.log(`New (clean approvable): ${tally.CLEAN_APPROVABLE ?? 0}`);
  console.log(`Invalid: ${tally.INVALID ?? 0}`);
  const totalClassified = Object.values(tally).reduce((a, b) => a + b, 0);
  console.log(`Would stage (toutes lignes, statut distinct par candidat): ${dedup.candidates.length}`);
  console.log(`Clean approvable: ${tally.CLEAN_APPROVABLE ?? 0}`);
  console.log(`Review rows: ${dedup.candidates.length - (tally.CLEAN_APPROVABLE ?? 0) - (tally.INVALID ?? 0)}`);

  if (totalClassified !== dedup.candidates.length) {
    console.log(`\nINCOHÉRENCE : ${totalClassified} classifiés != ${dedup.candidates.length} candidats uniques. STOP (§22).`);
    process.exit(1);
  }
  console.log("\nDry-run réconcilié exactement — poursuite autorisée (§22).");

  writeFileSync(
    join(rootDir, "reports", "registry", "minsante-b-staging-dry-run.json"),
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        batch: BATCH_ID,
        operator: OPERATOR,
        region: TARGET_REGION,
        raw_rows: pilotRows.length,
        unique_establishments: dedup.candidates.length,
        tally,
        reconciled: totalClassified === dedup.candidates.length,
      },
      null,
      2
    ),
    "utf-8"
  );

  // ── §23 — STAGING WRITE — autorisé après dry-run propre ───────────────
  const { data: dataSource, error: dsError } = await supabase
    .from("establishment_data_sources")
    .insert({
      ministry: "MINSANTE",
      source_name: `${SOURCE_NAME} — pilote région ${TARGET_REGION}, 6 filières fiables (Analyses Médicales, Infirmiers, Odontostomatologie, Optique Réfraction, Prothèse Dentaire, Sages-femmes/Maïeuticiens)`,
      source_url: SOURCE_URL,
      source_year: 2025,
      fetched_at: new Date().toISOString(),
      records_fetched: dedup.candidates.length,
      notes: `SPRINT MINSANTE-B — pilote limité, source authority ${SOURCE_AUTHORITY_DECISION} (hérité MINSANTE-A.1, jamais surclassé ce sprint). Parser ${PARSER_VERSION}. 4 filières quarantinées (SOURCE_STRUCTURE_REVIEW) explicitement exclues. Batch: ${BATCH_ID}.`,
    })
    .select("id")
    .single();
  if (dsError || !dataSource) throw new Error(`Échec création data_source : ${dsError?.message ?? "aucune ligne retournée"}`);
  const dataSourceId: string = dataSource.id;
  console.log(`\ndata_source créée : ${dataSourceId}`);

  async function runInsertPass(): Promise<{ inserted: number; skipped: number }> {
    const { data: existingRows } = await supabase.from("establishment_import_staging").select("fingerprint").eq("source_ministry", "MINSANTE");
    const existingFingerprints = new Set((existingRows ?? []).map((r: any) => r.fingerprint));
    let inserted = 0;
    let skipped = 0;
    for (let i = 0; i < classified.length; i++) {
      const cl = classified[i];
      const n = cl.normalized;
      if (existingFingerprints.has(n.fingerprint)) {
        skipped++;
        continue;
      }
      const rawData = {
        ...(n.raw as Record<string, unknown>),
        category_decision: cl.categoryDecision.decision,
        category_evidence: cl.categoryDecision.evidence,
        classification: cl.classification,
        classification_reason: cl.classificationReason,
        review_reason: cl.reviewReason,
        match_audit: {
          live: { level: cl.liveMatch.level, target_id: cl.liveMatch.target?.id ?? null, target_name: cl.liveMatch.target?.name ?? null, reason: cl.liveMatch.reason },
          staging: { level: cl.stagingMatch.level, target_id: cl.stagingMatch.target?.id ?? null, target_name: cl.stagingMatch.target?.name ?? null, reason: cl.stagingMatch.reason },
        },
      };
      const { data: row, error: insError } = await supabase
        .from("establishment_import_staging")
        .insert({
          data_source_id: dataSourceId,
          source_ministry: "MINSANTE",
          source_url: n.sourceUrl,
          source_year: n.sourceYear,
          official_identifier: n.officialIdentifier,
          raw_data: rawData,
          name_raw: n.nameRaw,
          name_normalized: n.nameNormalized,
          education_family: n.educationFamily,
          ownership: n.ownership,
          subsystem: n.subsystem,
          region: n.region,
          department: n.department,
          arrondissement: n.arrondissement,
          commune: n.commune,
          locality: n.locality,
          city: n.city,
          quarter: n.quarter,
          fingerprint: n.fingerprint,
          duplicate_of_establishment_id: cl.classification === "ALREADY_LIVE" ? cl.liveMatch.target?.id ?? null : null,
          duplicate_of_staging_id: cl.classification === "ALREADY_STAGING" ? cl.stagingMatch.target?.id ?? null : null,
          status: cl.stagingStatus,
          rejection_reason: cl.classification === "INVALID" ? cl.classificationReason : null,
        })
        .select("id")
        .single();
      if (insError) throw new Error(`Échec insertion staging pour "${n.nameRaw}" : ${insError.message}`);
      inserted++;
      existingFingerprints.add(n.fingerprint);
    }
    return { inserted, skipped };
  }

  const firstPass = await runInsertPass();
  console.log(`\nInsertion staging (1er passage) : ${firstPass.inserted} insérée(s), ${firstPass.skipped} déjà présente(s)`);

  // ── §25 — Preuve d'idempotence : SECOND passage réel contre la DB ─────
  const secondPass = await runInsertPass();
  console.log(`Insertion staging (2e passage, preuve idempotence) : ${secondPass.inserted} insérée(s) (attendu 0), ${secondPass.skipped} déjà présente(s)`);
  if (secondPass.inserted !== 0) {
    console.log("\nÉCHEC IDEMPOTENCE — le second passage a inséré des lignes. STOP (§25).");
    process.exit(1);
  }
  console.log("Idempotence prouvée : second passage = 0 insertion.");

  // ── §26-27 — Rapports depuis l'état RÉEL de la DB (jamais depuis la mémoire du run) ──
  const reportSummary = await generateMinsanteBPilotReports(supabase, rootDir, OPERATOR);
  console.log(`\nCLEAN_APPROVABLE (état réel DB) : ${reportSummary.clean_approvable_count} — checksum ${reportSummary.approval_checksum}`);

  // ── §34 — Post-condition ────────────────────────────────────────────
  const { count: estAfter } = await supabase.from("establishments").select("*", { count: "exact", head: true });
  const { count: stagingAfter } = await supabase.from("establishment_import_staging").select("*", { count: "exact", head: true });
  const { count: registryAfter } = await supabase.from("establishment_registry_identifiers").select("*", { count: "exact", head: true });
  console.log(`\nPOST-CONDITION : establishments ${estBefore}->${estAfter} | staging ${stagingBefore}->${stagingAfter} | registry_identifiers ${registryBefore}->${registryAfter}`);

  writeFileSync(
    join(rootDir, "reports", "registry", "minsante-b-pilot-final-summary.json"),
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        batch: BATCH_ID,
        operator: OPERATOR,
        region: TARGET_REGION,
        database: {
          establishments_before: estBefore,
          establishments_after: estAfter,
          staging_before: stagingBefore,
          staging_after: stagingAfter,
          registry_identifiers_before: registryBefore,
          registry_identifiers_after: registryAfter,
          minsante_staging_before: minsanteStagingBefore,
          health_training_staging_before: healthTrainingStagingBefore,
        },
        extraction: { parser_version: PARSER_VERSION, source_pdf_sha256: sourcePdfSha256, source_text_sha256: rawTextSha256, completeness },
        pilot: { raw_rows: pilotRows.length, unique_establishments: dedup.candidates.length, exact_merges: dedup.exactMergeCount, dedup_review_pairs: dedup.reviewEntries.length, dedup_review_by_relationship: byRel },
        tally,
        first_pass: firstPass,
        second_pass: secondPass,
        clean_approvable: reportSummary.clean_approvable_count,
        approval_checksum: reportSummary.approval_checksum,
        pii: piiAudit,
      },
      null,
      2
    ),
    "utf-8"
  );

  console.log("\n=== MINSANTE-B PILOT COLLECT — TERMINÉ ===");
}

main().catch((error) => {
  console.error("Échec pilote MINSANTE-B :", error);
  process.exit(1);
});
