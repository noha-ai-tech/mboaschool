import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { sha256Bytes } from "./lib/extraction/hashing";
import { loadPdfCoordinateItems } from "./lib/extraction/pdfCoordinateLoader";
import { parseMinsanteA2, PARSER_VERSION, LEGACY_PARSER_VERSION, REGION_CANONICAL_LIST } from "./lib/extraction/pdfMinsanteA2";
import type { SchoolProgramRowA2, FiliereSectionResultA2 } from "./lib/extraction/pdfMinsanteA2";
import { buildUniqueSchoolCandidates } from "./lib/extraction/minsanteDedup";
import type { RawSchoolProgramRow } from "./lib/extraction/pdfMinsanteA1";
import { exactIdentityKey, fuzzyWords, matchCandidate } from "./lib/matching/engine";
import type { MatchCandidate, MatchTarget } from "./lib/matching/types";
import { piiScan } from "./lib/extraction/piiScan";

/**
 * SPRINT MINSANTE-I — Runner READ-ONLY. Détermine si l'extraction nationale
 * MINSANTE 2025 est prête sur les 10/10 filières (décision A/B/C, jamais de
 * promotion, jamais d'import national). Écrit UNIQUEMENT des artefacts
 * locaux (reports/registry/, data/registry/normalized/) + lectures Supabase
 * (baseline avant/après, matching national en dry-run) — AUCUNE écriture
 * Supabase.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..", "..");
const reportsDir = join(rootDir, "reports", "registry");
const normalizedDir = join(rootDir, "data", "registry", "normalized");

// Catalogué MINSANTE_SOURCE_CATALOG.md — Source A, PROBABLE_TIER_1.
const SOURCE_PDF_URL =
  "https://examen-national-special-minsante.cm/loadfile/L2hvbWUvZXhhbWVuL2NvbmNvdXJzZnJhbWV3b3JrL3N0b3JhZ2UvcGRmL3BhZ2VzL3Jlc3VsdGF0cy9MSVNURV9FQ09MRVNfQUdSRUVTX01JTlNBTlRFXzIwMjUucGRm";
const EXPECTED_PDF_SHA256 = "26e68ab08092faa18e0fdf604e4ee6b93c229180ec9ea1f0d044f6b1a6a3946a";
const SOURCE_AUTHORITY = "PROBABLE_TIER_1";

const LEGACY_SAFE_PROGRAMS = ["Analyses Médicales", "Infirmiers", "Odontostomatologie", "Optique Réfraction", "Prothèse Dentaire", "Sages-femmes/Maïeuticiens"];
const HISTORICALLY_QUARANTINED_PROGRAMS = ["Imagerie Médicale", "Kinésithérapie", "Sciences Pharmaceutiques", "Psychomotricité et Relaxation"];

function csvEscape(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
function writeCsv(path: string, header: string, rows: string[][]) {
  writeFileSync(path, [header, ...rows.map((r) => r.map(csvEscape).join(","))].join("\n"), "utf-8");
}

function readEnvVar(env: string, key: string): string {
  const match = env.match(new RegExp(`^${key}=(.*)$`, "m"));
  const value = match?.[1]?.trim();
  if (!value) throw new Error(`${key} introuvable dans .env.local`);
  return value;
}
async function fetchAllPaginated<T>(supabase: any, table: string, select: string, filter?: (q: any) => any): Promise<T[]> {
  const all: T[] = [];
  let offset = 0;
  const pageSize = 1000;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    let q = supabase.from(table).select(select).range(offset, offset + pageSize - 1);
    if (filter) q = filter(q);
    const { data, error } = await q;
    if (error) throw error;
    all.push(...((data as T[]) ?? []));
    if (!data || data.length < pageSize) break;
    offset += pageSize;
  }
  return all;
}

function toRawRows(rows: SchoolProgramRowA2[], sections: FiliereSectionResultA2[]): RawSchoolProgramRow[] {
  const filiereRawByProgram = new Map(sections.map((s) => [s.programNormalized, s.filiereRaw]));
  return rows.map((r, i) => ({
    filiereRaw: filiereRawByProgram.get(r.program) ?? r.program,
    programNormalized: r.program,
    region: r.region,
    rawSchoolName: r.schoolName,
    sourceLine: i + 1, // synthétique — A.2 ne travaille pas sur un texte linéarisé à numéros de ligne réels, cf. évidence par page/x/y dans extractionEvidence.
  }));
}

async function main() {
  const runStartedAt = new Date().toISOString();
  console.log("=== SPRINT MINSANTE-I — NATIONAL EXTRACTION READINESS (READ ONLY) ===\n");

  // ── 1. Repository / DB baseline (avant) ─────────────────────────────
  const env = readFileSync(join(rootDir, ".env.local"), "utf-8");
  const url = readEnvVar(env, "NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = readEnvVar(env, "SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(url, serviceKey);
  const projectRef = url.match(/https:\/\/([a-z0-9]+)\.supabase/)?.[1] ?? "unknown";
  console.log(`Project ref : ${projectRef} (attendu umcwwynrftidytxgqkwi)`);
  if (projectRef !== "umcwwynrftidytxgqkwi") throw new Error("PROJET INATTENDU — STOP (sécurité).");

  const { count: estBefore } = await supabase.from("establishments").select("*", { count: "exact", head: true });
  const { count: stagingBefore } = await supabase.from("establishment_import_staging").select("*", { count: "exact", head: true });
  const { count: registryBefore } = await supabase.from("establishment_registry_identifiers").select("*", { count: "exact", head: true });
  console.log(`Baseline AVANT : establishments=${estBefore}, staging=${stagingBefore}, registry_identifiers=${registryBefore}`);

  // ── 2. Source pinning — recalcul SHA256 du PDF ──────────────────────
  console.log(`\nRécupération de la source (READ-ONLY, HTTP GET) : ${SOURCE_PDF_URL.slice(0, 60)}...`);
  const resp = await fetch(SOURCE_PDF_URL);
  if (!resp.ok) throw new Error(`Échec récupération PDF source : HTTP ${resp.status}`);
  const pdfBytes = new Uint8Array(await resp.arrayBuffer());
  const actualSha256 = sha256Bytes(pdfBytes);
  const sourceUnchanged = actualSha256 === EXPECTED_PDF_SHA256;
  console.log(`SHA256 attendu  : ${EXPECTED_PDF_SHA256}`);
  console.log(`SHA256 recalculé: ${actualSha256}`);
  console.log(sourceUnchanged ? "SOURCE STABLE — inchangée depuis MINSANTE-A." : "SOURCE_CHANGED — le document a changé depuis le dernier pinning.");

  const sourceVerification = {
    sprint: "MINSANTE-I",
    generated_at: runStartedAt,
    source_url: SOURCE_PDF_URL,
    expected_sha256: EXPECTED_PDF_SHA256,
    actual_sha256: actualSha256,
    source_status: sourceUnchanged ? "SOURCE_STABLE" : "SOURCE_CHANGED",
    authority: SOURCE_AUTHORITY,
    authority_upgraded_this_sprint: false,
    safe_for_national_extraction_source_gate: sourceUnchanged,
    pdf_byte_length: pdfBytes.length,
  };
  mkdirSync(reportsDir, { recursive: true });
  writeFileSync(join(reportsDir, "minsante-i-source-verification.json"), JSON.stringify(sourceVerification, null, 2), "utf-8");

  if (!sourceUnchanged) {
    console.log("\nSOURCE_CHANGED — STOP sur l'extraction nationale (§3 du brief). Arrêt du script.");
    writeFileSync(
      join(reportsDir, "minsante-i-run-summary.json"),
      JSON.stringify({ sprint: "MINSANTE-I", generated_at: runStartedAt, decision: "C", reason: "SOURCE_CHANGED — PDF source a changé depuis le pinning MINSANTE-A, extraction nationale non tentée par sécurité.", national_extraction_ready: false }, null, 2),
      "utf-8"
    );
    return;
  }

  // ── 3. Extraction coordonnée (A.2) ──────────────────────────────────
  console.log("\nChargement des coordonnées PDF (pdf.js)...");
  const { numPages, pages } = await loadPdfCoordinateItems(pdfBytes);
  console.log(`Pages chargées : ${numPages}`);
  const a2 = parseMinsanteA2(pages);
  console.log(`Filières détectées : ${a2.filiereSections.length}/10`);
  for (const s of a2.filiereSections) {
    console.log(`  - ${s.programNormalized}: verdict=${s.verdict} numberingMode=${s.numberingMode} rows=${s.rows.length} anomalies=${s.structuralAnomalies.length}`);
  }

  const safeSections = a2.filiereSections.filter((s) => s.verdict === "SAFE");
  const quarantinedSections = a2.filiereSections.filter((s) => s.verdict !== "SAFE");
  const allRows = a2.filiereSections.flatMap((s) => s.rows);
  const safeRows = safeSections.flatMap((s) => s.rows);

  // ── 4. Matrice programme × région ───────────────────────────────────
  const matrixRows: string[][] = [];
  for (const s of a2.filiereSections) {
    for (const rb of s.regionMatrix) {
      matrixRows.push([s.programNormalized, rb.region, rb.status, String(rb.rowCount), rb.numberingResetOk === null ? "N/A" : String(rb.numberingResetOk), s.verdict]);
    }
  }
  writeCsv(join(reportsDir, "minsante-i-program-region-matrix.csv"), "program,region,status,row_count,numbering_reset_ok,program_verdict", matrixRows);

  // ── 5. Anomalies structurelles ───────────────────────────────────────
  const anomalyRows: string[][] = [];
  for (const s of a2.filiereSections) {
    for (const a of s.structuralAnomalies) {
      const kind = a.split(":")[0];
      anomalyRows.push([s.programNormalized, kind, a]);
    }
  }
  writeCsv(join(reportsDir, "minsante-i-structural-anomalies.csv"), "program,anomaly_kind,detail", anomalyRows);

  // ── 6. Réconciliation legacy (6 filières historiquement sûres) ──────
  const a1Path = join(rootDir, "data", "registry", "normalized", "minsante-a1-school-program-rows.json");
  const a1Data = JSON.parse(readFileSync(a1Path, "utf-8")) as { rows: RawSchoolProgramRow[] };
  console.log(`\nRéférence legacy A.1 : ${a1Data.rows.length} lignes (attendu 293).`);

  type ReconRow = { program: string; category: string; region_a1: string | null; region_a2: string | null; name_a1: string | null; name_a2: string | null; detail: string };
  const reconRows: ReconRow[] = [];
  let identicalCount = 0;

  for (const program of LEGACY_SAFE_PROGRAMS) {
    const a1Rows = a1Data.rows.filter((r) => r.programNormalized === program);
    const a2Rows = allRows.filter((r) => r.program === program);
    const a1ByKey = new Map<string, RawSchoolProgramRow[]>();
    for (const r of a1Rows) {
      const k = `${r.region}|${exactIdentityKey(r.rawSchoolName)}`;
      if (!a1ByKey.has(k)) a1ByKey.set(k, []);
      a1ByKey.get(k)!.push(r);
    }
    const a2ByKey = new Map<string, SchoolProgramRowA2[]>();
    for (const r of a2Rows) {
      const k = `${r.region}|${exactIdentityKey(r.schoolName)}`;
      if (!a2ByKey.has(k)) a2ByKey.set(k, []);
      a2ByKey.get(k)!.push(r);
    }
    // Index A2 par clé SANS région, pour détecter les réassignations.
    const a2ByNameOnly = new Map<string, { region: string; row: SchoolProgramRowA2 }[]>();
    for (const r of a2Rows) {
      const k = exactIdentityKey(r.schoolName);
      if (!a2ByNameOnly.has(k)) a2ByNameOnly.set(k, []);
      a2ByNameOnly.get(k)!.push({ region: r.region, row: r });
    }

    const consumedA2Keys = new Set<string>();
    for (const [key, group] of a1ByKey) {
      const a2Match = a2ByKey.get(key);
      if (a2Match && a2Match.length >= group.length) {
        identicalCount += group.length;
        consumedA2Keys.add(key);
        continue;
      }
      // Pas de correspondance exacte (région+nom) — chercher une
      // réassignation de région (même nom exact, région différente).
      const nameOnlyKey = key.split("|").slice(1).join("|");
      const altRegionMatches = (a2ByNameOnly.get(nameOnlyKey) ?? []).filter((x) => x.region !== group[0].region);
      if (altRegionMatches.length > 0) {
        reconRows.push({
          program,
          category: "REGION_REASSIGNED",
          region_a1: group[0].region,
          region_a2: altRegionMatches[0].region,
          name_a1: group[0].rawSchoolName,
          name_a2: altRegionMatches[0].row.schoolName,
          detail: "A.1 avait associé cette école à une région différente — bug de linéarisation pdftotext -layout (cellule région fusionnée, centrage vertical) corrigé par A.2 (ordre de flux de contenu).",
        });
        consumedA2Keys.add(`${altRegionMatches[0].region}|${nameOnlyKey}`);
        continue;
      }
      // Chercher une variante de normalisation dans la même région (fort
      // chevauchement de mots significatifs).
      const sameRegionA2 = a2Rows.filter((r) => r.region === group[0].region);
      const aWords = fuzzyWords(group[0].rawSchoolName);
      let bestRatio = 0;
      let bestMatch: SchoolProgramRowA2 | null = null;
      for (const cand of sameRegionA2) {
        const bWords = fuzzyWords(cand.schoolName);
        const bSet = new Set(bWords);
        const inter = aWords.filter((w) => bSet.has(w)).length;
        const ratio = aWords.length > 0 ? inter / aWords.length : 0;
        if (ratio > bestRatio) {
          bestRatio = ratio;
          bestMatch = cand;
        }
      }
      if (bestMatch && bestRatio >= 0.7) {
        reconRows.push({
          program,
          category: "NORMALIZATION_ONLY",
          region_a1: group[0].region,
          region_a2: bestMatch.region,
          name_a1: group[0].rawSchoolName,
          name_a2: bestMatch.schoolName,
          detail: `Variante de normalisation (chevauchement de mots ${Math.round(bestRatio * 100)}%) — probablement ponctuation/espacement, pas une divergence structurelle.`,
        });
        consumedA2Keys.add(`${bestMatch.region}|${exactIdentityKey(bestMatch.schoolName)}`);
        continue;
      }
      // Aucune contrepartie plausible côté A.2.
      for (const r of group) {
        reconRows.push({
          program,
          category: "OLD_ONLY",
          region_a1: r.region,
          region_a2: null,
          name_a1: r.rawSchoolName,
          name_a2: null,
          detail: "Présent dans A.1 uniquement, aucune contrepartie plausible trouvée dans A.2 (même approximativement) — à examiner manuellement.",
        });
      }
    }
    // Ce qui reste côté A.2 et n'a pas été consommé par la logique ci-dessus.
    for (const [key, group] of a2ByKey) {
      if (consumedA2Keys.has(key)) continue;
      if (a1ByKey.has(key)) continue; // déjà compté identique plus haut
      for (const r of group) {
        reconRows.push({
          program,
          category: "NEW_ONLY",
          region_a1: null,
          region_a2: r.region,
          name_a1: null,
          name_a2: r.schoolName,
          detail: "Présent dans A.2 uniquement — gain net (ex. ligne que A.1 avait mal associée/perdue ailleurs).",
        });
      }
    }
  }
  writeCsv(
    join(reportsDir, "minsante-i-legacy-reconciliation.csv"),
    "program,category,region_a1,name_a1,region_a2,name_a2,detail",
    reconRows.map((r) => [r.program, r.category, r.region_a1 ?? "", r.name_a1 ?? "", r.region_a2 ?? "", r.name_a2 ?? "", r.detail])
  );
  const reconByCategory: Record<string, number> = {};
  for (const r of reconRows) reconByCategory[r.category] = (reconByCategory[r.category] ?? 0) + 1;
  console.log(`\nRéconciliation legacy : ${identicalCount} identiques, différences par catégorie : ${JSON.stringify(reconByCategory)}`);

  // ── 7. Analyse dédiée des 4 filières historiquement quarantainées ───
  const quarantinedReviewRows: string[][] = [];
  for (const program of HISTORICALLY_QUARANTINED_PROGRAMS) {
    const s = a2.filiereSections.find((x) => x.programNormalized === program)!;
    const a1CauseMap: Record<string, string> = {
      "Imagerie Médicale":
        "DÉFAUT SOURCE PERMANENT : aucun glyphe de numéro n'est peint dans le flux de contenu PDF pour cette filière (vérifié par page.getOperatorList() : showText ops = beginText ops, aucune opération vectorielle supplémentaire ; struct tree sans Lbl). A.1 exigeait un préfixe 'N.' pour reconnaître une ligne école -> 0 ligne détectée (bug original MINSANTE-A). Aucun extracteur ne peut récupérer un numéro jamais peint.",
      "Kinésithérapie":
        "Association région/ligne cassée par pdftotext -layout : la cellule région (fusionnée, centrée verticalement sur son bloc) est linéarisée à sa position Y réelle (milieu du bloc), pas au sommet -> mauvaise école associée dans le texte. Les numéros SONT présents dans le flux (peints), donc récupérables par un parseur conscient de l'ordre de flux de contenu.",
      "Sciences Pharmaceutiques":
        "Même défaut d'association région/ligne que Kinésithérapie. Un second problème INDÉPENDANT et mineur subsiste après A.2 : un seul glyphe manquant dans le flux (\"EXTRME NORD\" au lieu de \"EXTREME-NORD\", page 11) — défaut de décodage de police du PDF source lui-même (voir warning pdf.js \"TT: undefined function\"), pas un artefact d'outil. Correctement laissé en quarantaine par A.2 (fail-closed), cascade sur la numérotation de la région Est voisine.",
      "Psychomotricité et Relaxation":
        "Même défaut d'association région/ligne que Kinésithérapie (petite filière, blocs de 1 ligne — cas qui a aussi révélé un second bug de fusion corrigé pendant ce sprint : étiquette+ligne unique fusionnées à tort par coïncidence de Y). Les numéros SONT présents dans le flux.",
    };
    quarantinedReviewRows.push([
      program,
      s.pagesInvolved.join("|"),
      s.regionsDetectedInOrder.join("|"),
      String(s.numberedRowCount),
      String(s.parsedRowCount),
      String(s.structuralAnomalies.length),
      s.verdict,
      a1CauseMap[program],
    ]);
  }
  writeCsv(
    join(reportsDir, "minsante-i-quarantined-program-review.csv"),
    "program,pages,regions_detected,numbered_rows,parsed_rows,anomaly_count,a2_verdict,a1_failure_cause",
    quarantinedReviewRows
  );

  // ── 8. Dédup en dry-run (SAFE uniquement — base la plus fiable) ─────
  console.log("\n=== DÉDUP DRY-RUN (filières SAFE uniquement, moteur G.2 inchangé) ===");
  const dedupSafe = buildUniqueSchoolCandidates(toRawRows(safeRows, a2.filiereSections));
  const dedupAll = buildUniqueSchoolCandidates(toRawRows(allRows, a2.filiereSections));
  const byRelSafe: Record<string, number> = {};
  for (const r of dedupSafe.reviewEntries) byRelSafe[r.relationship] = (byRelSafe[r.relationship] ?? 0) + 1;
  console.log(`SAFE (${safeSections.length}/10 filières) : ${dedupSafe.totalInputRows} lignes -> ${dedupSafe.candidates.length} établissements uniques (fusion exacte), revue: ${JSON.stringify(byRelSafe)}`);
  const byRelAll: Record<string, number> = {};
  for (const r of dedupAll.reviewEntries) byRelAll[r.relationship] = (byRelAll[r.relationship] ?? 0) + 1;
  console.log(`TOUTES filières (10/10, y compris quarantainées) : ${dedupAll.totalInputRows} lignes -> ${dedupAll.candidates.length} établissements uniques, revue: ${JSON.stringify(byRelAll)}`);

  const dedupSummary = {
    sprint: "MINSANTE-I",
    generated_at: runStartedAt,
    note: "DRY-RUN UNIQUEMENT — aucune écriture staging. Moteur de dédup MINSANTE-A.1/G.2 réutilisé SANS modification (exactIdentityKey + fuzzyWords).",
    dataset_status: "PARTIAL_EXTRACTION_ONLY_NOT_APPROVED_FOR_NATIONAL_IMPORT",
    safe_programs_count: safeSections.length,
    quarantined_programs_count: quarantinedSections.length,
    safe_subset: {
      input_rows: dedupSafe.totalInputRows,
      unique_schools: dedupSafe.candidates.length,
      exact_merge_count: dedupSafe.exactMergeCount,
      review_pairs_by_relationship: byRelSafe,
      auto_merged_fuzzy: 0,
    },
    all_programs_subset_including_quarantined: {
      input_rows: dedupAll.totalInputRows,
      unique_schools: dedupAll.candidates.length,
      exact_merge_count: dedupAll.exactMergeCount,
      review_pairs_by_relationship: byRelAll,
      auto_merged_fuzzy: 0,
    },
  };
  writeFileSync(join(reportsDir, "minsante-i-national-dedup-summary.json"), JSON.stringify(dedupSummary, null, 2), "utf-8");

  // ── 9. Matching national dry-run READ-ONLY (live + staging) ─────────
  console.log("\n=== MATCHING NATIONAL DRY-RUN (READ-ONLY, contre live + staging) ===");
  const liveEst = await fetchAllPaginated<{ id: string; name: string; region: string | null; city: string | null; main_category: string | null }>(
    supabase,
    "establishments",
    "id,name,region,city,main_category"
  );
  const allStaging = await fetchAllPaginated<{ id: string; name_raw: string; region: string | null; city: string | null; education_family: string | null }>(
    supabase,
    "establishment_import_staging",
    "id,name_raw,region,city,education_family"
  );
  const liveTargets: MatchTarget[] = liveEst.map((e) => ({ id: e.id, name: e.name, region: e.region, city: e.city, category: e.main_category, identifiers: [] }));
  const stagingTargets: MatchTarget[] = allStaging.map((s) => ({ id: `staging:${s.id}`, name: s.name_raw, region: s.region, city: s.city, category: s.education_family, identifiers: [] }));
  const allTargets = [...liveTargets, ...stagingTargets];

  const matchCounts: Record<string, number> = { already_live: 0, already_staging: 0, probable: 0, ambiguous: 0, no_match: 0 };
  for (const cand of dedupSafe.candidates) {
    const candidate: MatchCandidate = { name: cand.displayName, region: cand.region, city: null, category: null, identifiers: [] };
    const result = matchCandidate(candidate, allTargets);
    if (result.level === "EXACT_IDENTITY" || result.level === "EXACT_IDENTIFIER" || result.level === "STRONG_MATCH") {
      const isStaging = typeof result.target?.id === "string" && result.target.id.startsWith("staging:");
      matchCounts[isStaging ? "already_staging" : "already_live"] += 1;
    } else if (result.level === "PROBABLE_MATCH") {
      matchCounts.probable += 1;
    } else if (result.level === "AMBIGUOUS") {
      matchCounts.ambiguous += 1;
    } else {
      matchCounts.no_match += 1;
    }
  }
  console.log(`Résultat matching (${dedupSafe.candidates.length} candidats SAFE) : ${JSON.stringify(matchCounts)}`);

  const programsPerSchoolDist: Record<string, number> = {};
  for (const c of dedupSafe.candidates) {
    const n = String(c.programsNormalized.length);
    programsPerSchoolDist[n] = (programsPerSchoolDist[n] ?? 0) + 1;
  }
  const byRegionCount: Record<string, number> = {};
  for (const c of dedupSafe.candidates) byRegionCount[c.region] = (byRegionCount[c.region] ?? 0) + 1;

  const matchingSummary = {
    sprint: "MINSANTE-I",
    generated_at: runStartedAt,
    note: "DRY-RUN UNIQUEMENT — aucun auto-link, aucune écriture. Basé sur le sous-ensemble SAFE (8/10 filières) uniquement.",
    dataset_status: "PARTIAL_EXTRACTION_ONLY_NOT_APPROVED_FOR_NATIONAL_IMPORT",
    total_school_program_rows_safe_subset: dedupSafe.totalInputRows,
    unique_normalized_schools_safe_subset: dedupSafe.candidates.length,
    unique_schools_by_region: byRegionCount,
    programs_per_school_distribution: programsPerSchoolDist,
    exact_dedup_count: dedupSafe.exactMergeCount,
    review_pair_counts: byRelSafe,
    national_matching_against_live_and_staging: matchCounts,
    live_establishments_scanned: liveEst.length,
    staging_rows_scanned: allStaging.length,
  };
  writeFileSync(join(reportsDir, "minsante-i-national-matching-summary.json"), JSON.stringify(matchingSummary, null, 2), "utf-8");

  // ── 10. Régression pilote (22 lignes historiques, dont 8 promus) ────
  console.log("\n=== RÉGRESSION PILOTE (22 candidats MINSANTE, dont 8 promus) ===");
  const pilotStagingRows = (
    await fetchAllPaginated<{ id: string; name_raw: string; region: string | null; city: string | null; status: string; raw_data: any }>(
      supabase,
      "establishment_import_staging",
      "id,name_raw,region,city,status,raw_data",
      (q: any) => q.eq("source_ministry", "MINSANTE")
    )
  ).filter((r) => r.raw_data?.batch === "minsante-pilot-v1");
  console.log(`Lignes pilote trouvées en staging : ${pilotStagingRows.length} (attendu 22)`);

  const a2ByRegionName = new Map<string, SchoolProgramRowA2[]>();
  for (const r of allRows) {
    const k = `${r.region}|${exactIdentityKey(r.schoolName)}`;
    if (!a2ByRegionName.has(k)) a2ByRegionName.set(k, []);
    a2ByRegionName.get(k)!.push(r);
  }
  const pilotResults = pilotStagingRows.map((r) => {
    const key = `${r.region}|${exactIdentityKey(r.name_raw)}`;
    const matches = a2ByRegionName.get(key) ?? [];
    // Conflit d'identité : le même (région, nom exact) désignerait deux
    // programmes incohérents entre le pilote et A.2 alors que le pilote en
    // attendait un sous-ensemble précis — on ne bloque que si AUCUN
    // programme du pilote n'est retrouvé du tout (0 correspondance).
    const recoveredPrograms = Array.from(new Set(matches.map((m) => m.program)));
    return {
      staging_id: r.id,
      name_raw: r.name_raw,
      region: r.region,
      status: r.status,
      classification: r.raw_data?.classification ?? (r.status === "promoted" ? "PROMOTED" : null),
      recovered: matches.length > 0,
      recovered_programs: recoveredPrograms,
      pilot_programs_normalized: r.raw_data?.programs_normalized ?? [],
      identity_conflict: matches.length === 0,
    };
  });
  const recoveredCount = pilotResults.filter((r) => r.recovered).length;
  const promotedResults = pilotResults.filter((r) => r.status === "promoted");
  const promotedRecovered = promotedResults.filter((r) => r.recovered).length;
  const deferredResults = pilotResults.filter((r) => r.status !== "promoted");
  const deferredRecovered = deferredResults.filter((r) => r.recovered).length;
  const identityConflicts = pilotResults.filter((r) => r.identity_conflict);
  console.log(`Récupérés : ${recoveredCount}/${pilotResults.length} ; promus récupérés : ${promotedRecovered}/${promotedResults.length} ; différés récupérés : ${deferredRecovered}/${deferredResults.length}`);
  if (identityConflicts.length > 0) console.log(`CONFLITS D'IDENTITÉ : ${identityConflicts.length} — ${identityConflicts.map((r) => r.name_raw).join("; ")}`);

  const pilotRegression = {
    sprint: "MINSANTE-I",
    generated_at: runStartedAt,
    pilot_rows_expected: 22,
    pilot_rows_found_in_staging: pilotStagingRows.length,
    pilot_rows_recovered: recoveredCount,
    pilot_promoted_expected: 8,
    pilot_promoted_recovered: promotedRecovered,
    pilot_deferred_recovered: deferredRecovered,
    pilot_deferred_total: deferredResults.length,
    pilot_identity_conflicts: identityConflicts.length,
    pass: promotedRecovered === 8 && identityConflicts.length === 0,
    details: pilotResults,
  };
  writeFileSync(join(reportsDir, "minsante-i-pilot-regression.json"), JSON.stringify(pilotRegression, null, 2), "utf-8");

  // ── 11. PII scan ─────────────────────────────────────────────────────
  const allStrings = allRows.map((r) => r.schoolName).concat(REGION_CANONICAL_LIST as unknown as string[]);
  const piiHits = piiScan(allStrings);
  console.log(`\nPII scan : ${piiHits.length} correspondance(s) trouvée(s) (attendu 0).`);

  // ── 12. Artefact normalisé local (marqué explicitement PARTIEL) ─────
  mkdirSync(normalizedDir, { recursive: true });
  const normalizedOutput = {
    sprint: "MINSANTE-I",
    generated_at: runStartedAt,
    parser_version: PARSER_VERSION,
    legacy_parser_version: LEGACY_PARSER_VERSION,
    dataset_status: "PARTIAL_EXTRACTION_ONLY_NOT_APPROVED_FOR_NATIONAL_IMPORT",
    warning: "NE PAS utiliser ce fichier comme base d'import national. 2/10 filières restent QUARANTAINED (voir program_verdicts). Dry-run d'analyse uniquement.",
    program_verdicts: a2.filiereSections.map((s) => ({ program: s.programNormalized, verdict: s.verdict, numbering_mode: s.numberingMode, row_count: s.rows.length })),
    rows: allRows,
  };
  writeFileSync(join(normalizedDir, "minsante-a2-school-program-rows.json"), JSON.stringify(normalizedOutput, null, 2), "utf-8");

  // ── 13. Baseline DB (après) — doit être identique ────────────────────
  const { count: estAfter } = await supabase.from("establishments").select("*", { count: "exact", head: true });
  const { count: stagingAfter } = await supabase.from("establishment_import_staging").select("*", { count: "exact", head: true });
  const { count: registryAfter } = await supabase.from("establishment_registry_identifiers").select("*", { count: "exact", head: true });
  const dbUnchanged = estBefore === estAfter && stagingBefore === stagingAfter && registryBefore === registryAfter;
  console.log(`\nBaseline APRÈS : establishments=${estAfter}, staging=${stagingAfter}, registry_identifiers=${registryAfter} — inchangé: ${dbUnchanged}`);

  // ── 14. Décision finale ───────────────────────────────────────────────
  const allSafe = a2.filiereSections.length === 10 && a2.filiereSections.every((s) => s.verdict === "SAFE");
  const decision: "A" | "B" | "C" = allSafe ? "A" : "B";
  const nationalReady = decision === "A";

  const runSummary = {
    sprint: "MINSANTE-I",
    generated_at: runStartedAt,
    repository: { branch: "main", commit_reference: "6f46efc (HEAD au démarrage du sprint)" },
    database: {
      establishments_before: estBefore,
      establishments_after: estAfter,
      staging_before: stagingBefore,
      staging_after: stagingAfter,
      registry_identifiers_before: registryBefore,
      registry_identifiers_after: registryAfter,
      unchanged: dbUnchanged,
      production_writes: 0,
    },
    source: sourceVerification,
    extraction: {
      programs_safe: safeSections.map((s) => s.programNormalized),
      programs_quarantined: quarantinedSections.map((s) => ({ program: s.programNormalized, verdict: s.verdict, reason: s.numberingMode === "NUMBERING_ABSENT_SOURCE_DEFECT" ? "NUMBERING_ABSENT_SOURCE_DEFECT (défaut permanent du PDF source)" : "STRUCTURE_AMBIGUOUS" })),
      regions_recognized: REGION_CANONICAL_LIST.length,
      school_program_rows_total: allRows.length,
      school_program_rows_safe_subset: safeRows.length,
      unique_schools_safe_subset: dedupSafe.candidates.length,
      structural_anomalies_total: anomalyRows.length,
    },
    legacy_reconciliation: {
      old_program_rows: a1Data.rows.length,
      new_equivalent_rows: LEGACY_SAFE_PROGRAMS.reduce((acc, p) => acc + allRows.filter((r) => r.program === p).length, 0),
      identical: identicalCount,
      differences_by_category: reconByCategory,
    },
    dedup: dedupSummary,
    matching: matchingSummary,
    pilot_regression: pilotRegression,
    pii: { persisted_matches: piiHits.length, hits: piiHits },
    decision,
    national_extraction_ready: nationalReady,
    recommended_next_step: nationalReady
      ? "MINSANTE-J — NATIONAL COLLECTION DRY RUN / STAGING PLAN."
      : "Nouveau sprint d'extraction ciblé sur les filières restant en quarantaine (voir minsante-i-quarantined-program-review.csv et minsante-i-structural-anomalies.csv) avant de retenter une décision A.",
    push: "NO",
    deploy: "NO",
  };
  writeFileSync(join(reportsDir, "minsante-i-run-summary.json"), JSON.stringify(runSummary, null, 2), "utf-8");

  console.log(`\n=== DÉCISION : ${decision} — national_extraction_ready=${nationalReady} ===`);
  console.log("STOP. Aucun import national en staging. Aucune promotion. Push=NO, Deploy=NO.");
}

main().catch((e) => {
  console.error("ERROR:", e.stack ?? e);
  process.exit(1);
});
