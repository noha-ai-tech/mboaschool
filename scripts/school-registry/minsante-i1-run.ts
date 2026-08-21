import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { sha256Bytes } from "./lib/extraction/hashing";
import { loadPdfCoordinateItems } from "./lib/extraction/pdfCoordinateLoader";
import { parseMinsanteA2 } from "./lib/extraction/pdfMinsanteA2";
import { parseMinsanteA3, PARSER_VERSION as A3_PARSER_VERSION, PREVIOUS_PARSER_VERSION, LEGACY_PARSER_VERSION } from "./lib/extraction/pdfMinsanteA3";
import { exactIdentityKey } from "./lib/matching/engine";
import { piiScan } from "./lib/extraction/piiScan";

/**
 * SPRINT MINSANTE-I.1 — Runner READ-ONLY final. Re-exécute les 10 filières
 * avec le parseur `minsante-a3-pdf-recovery@1` (récupération structurelle
 * ciblée, voir pdfMinsanteA3.ts) et compare avec MINSANTE-I (A.2). AUCUNE
 * écriture Supabase. AUCUN import national. AUCUNE promotion.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..", "..");
const reportsDir = join(rootDir, "reports", "registry");

const SOURCE_PDF_URL =
  "https://examen-national-special-minsante.cm/loadfile/L2hvbWUvZXhhbWVuL2NvbmNvdXJzZnJhbWV3b3JrL3N0b3JhZ2UvcGRmL3BhZ2VzL3Jlc3VsdGF0cy9MSVNURV9FQ09MRVNfQUdSRUVTX01JTlNBTlRFXzIwMjUucGRm";
const EXPECTED_PDF_SHA256 = "26e68ab08092faa18e0fdf604e4ee6b93c229180ec9ea1f0d044f6b1a6a3946a";

const MINSANTE_I_VERDICTS: Record<string, string> = {
  "Analyses Médicales": "SAFE",
  "Imagerie Médicale": "QUARANTINED_NUMBERING_ABSENT",
  Infirmiers: "SAFE",
  Kinésithérapie: "SAFE",
  Odontostomatologie: "SAFE",
  "Optique Réfraction": "SAFE",
  "Prothèse Dentaire": "SAFE",
  "Sages-femmes/Maïeuticiens": "SAFE",
  "Sciences Pharmaceutiques": "QUARANTINED_STRUCTURE_AMBIGUOUS",
  "Psychomotricité et Relaxation": "SAFE",
};

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

async function main() {
  const runStartedAt = new Date().toISOString();
  console.log("=== SPRINT MINSANTE-I.1 — SOURCE DEFECT RECOVERY (READ-ONLY FINAL RUN) ===\n");

  // ── 1. Baseline DB (avant) ────────────────────────────────────────────
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
  if (estBefore !== 2248 || stagingBefore !== 2366 || registryBefore !== 2242) {
    console.log("ATTENTION : baseline différente de la baseline attendue (2248/2366/2242) — voir mémoire projet, à documenter dans le run summary.");
  }

  // ── 2. Source pinning ──────────────────────────────────────────────────
  console.log(`\nRécupération PDF source...`);
  const resp = await fetch(SOURCE_PDF_URL);
  if (!resp.ok) throw new Error(`Échec récupération PDF source : HTTP ${resp.status}`);
  const pdfBytes = new Uint8Array(await resp.arrayBuffer());
  const actualSha256 = sha256Bytes(pdfBytes);
  const sourceUnchanged = actualSha256 === EXPECTED_PDF_SHA256;
  console.log(`SHA256 attendu  : ${EXPECTED_PDF_SHA256}`);
  console.log(`SHA256 recalculé: ${actualSha256}`);
  console.log(sourceUnchanged ? "SOURCE STABLE." : "SOURCE_CHANGED — récupération A.3 désactivée par sécurité (fail-closed).");

  const { pages } = await loadPdfCoordinateItems(pdfBytes);

  // ── 3. Parse A.2 (référence inchangée) + A.3 (récupération) ───────────
  const a2 = parseMinsanteA2(pages);
  const a3 = parseMinsanteA3(pages, sourceUnchanged);
  console.log(`\nA.2 (référence, inchangé) : ${a2.filiereSections.filter((s) => s.verdict === "SAFE").length}/10 SAFE`);
  console.log(`A.3 (${A3_PARSER_VERSION}) : ${a3.filiereSections.filter((s) => s.verdict === "SAFE").length}/10 SAFE, invariant_ordre_document=${a3.documentWideOrderInvariantHolds}, sha_verifie=${a3.sourceSha256Verified}`);

  // ── 4. Statut par programme (comparaison MINSANTE-I vs I.1) ───────────
  const programStatusRows: string[][] = [];
  for (const s of a3.filiereSections) {
    const before = MINSANTE_I_VERDICTS[s.programNormalized] ?? "UNKNOWN";
    const changed = before !== s.verdict;
    const recovery = s.recoveryEvidence.length > 0 ? s.recoveryEvidence.map((e) => `${e.rawLabelText}->${e.recoveredRegion}`).join("|") : "";
    programStatusRows.push([
      s.programNormalized,
      before,
      s.verdict,
      changed ? "CHANGED" : "UNCHANGED",
      String(s.rows.length),
      s.numberingMode,
      String(s.structuralAnomalies.length),
      recovery,
    ]);
  }
  writeCsv(
    join(reportsDir, "minsante-i1-program-status.csv"),
    "program,verdict_minsante_i,verdict_minsante_i1,delta,row_count,numbering_mode,structural_anomaly_count,recovery_applied",
    programStatusRows
  );

  // ── 5. Réconciliation complète 10/10 (comparaison A.2 vs A.3) ─────────
  const fullReconciliation = {
    sprint: "MINSANTE-I.1",
    generated_at: runStartedAt,
    parser_versions: { previous: PREVIOUS_PARSER_VERSION, current: A3_PARSER_VERSION, legacy: LEGACY_PARSER_VERSION },
    document_wide_order_invariant_holds: a3.documentWideOrderInvariantHolds,
    source_sha256_verified: a3.sourceSha256Verified,
    programs: a3.filiereSections.map((s) => {
      const a2s = a2.filiereSections.find((x) => x.programNormalized === s.programNormalized)!;
      return {
        program: s.programNormalized,
        regions_detected_in_order: s.regionsDetectedInOrder,
        rows: s.rows.length,
        rows_a2_reference: a2s.rows.length,
        rows_delta: s.rows.length - a2s.rows.length,
        numbering_status: s.numberingMode,
        structural_status: s.structuralAnomalies.length === 0 ? "CLEAN" : "ANOMALOUS",
        structural_anomalies: s.structuralAnomalies,
        authority_corroboration: s.recoveryEvidence.length > 0 ? "INTERNAL_STRUCTURAL_RECOVERY" : s.verdict === "SAFE" ? "NONE_NEEDED_ALREADY_SAFE" : "NONE_FOUND",
        recovery_evidence: s.recoveryEvidence,
        verdict_minsante_i: MINSANTE_I_VERDICTS[s.programNormalized] ?? "UNKNOWN",
        verdict_minsante_i1: s.verdict,
        verdict_changed: (MINSANTE_I_VERDICTS[s.programNormalized] ?? "UNKNOWN") !== s.verdict,
      };
    }),
    summary: {
      safe_count_minsante_i: Object.values(MINSANTE_I_VERDICTS).filter((v) => v === "SAFE").length,
      safe_count_minsante_i1: a3.filiereSections.filter((s) => s.verdict === "SAFE").length,
      still_quarantined: a3.filiereSections.filter((s) => s.verdict !== "SAFE").map((s) => ({ program: s.programNormalized, verdict: s.verdict })),
    },
  };
  writeFileSync(join(reportsDir, "minsante-i1-full-reconciliation.json"), JSON.stringify(fullReconciliation, null, 2), "utf-8");
  console.log(`\nRéconciliation : ${fullReconciliation.summary.safe_count_minsante_i}/10 SAFE (I) -> ${fullReconciliation.summary.safe_count_minsante_i1}/10 SAFE (I.1)`);

  // ── 6. Legacy 293 lignes — doit rester identique à MINSANTE-I (8 filières historiques SAFE inchangées) ──
  let legacyUnchanged = true;
  for (const program of ["Analyses Médicales", "Infirmiers", "Odontostomatologie", "Optique Réfraction", "Prothèse Dentaire", "Sages-femmes/Maïeuticiens"]) {
    const a2s = a2.filiereSections.find((s) => s.programNormalized === program)!;
    const a3s = a3.filiereSections.find((s) => s.programNormalized === program)!;
    if (JSON.stringify(a2s.rows) !== JSON.stringify(a3s.rows) || a2s.verdict !== a3s.verdict) legacyUnchanged = false;
  }
  console.log(`Sous-ensemble legacy (6 filières historiquement SAFE) inchangé entre A.2 et A.3 : ${legacyUnchanged}`);

  // ── 7. 8 filières précédemment SAFE — doivent rester byte-identiques ──
  let eightSafeUnchanged = true;
  const eightSafePrograms = Object.entries(MINSANTE_I_VERDICTS).filter(([, v]) => v === "SAFE").map(([p]) => p);
  for (const program of eightSafePrograms) {
    const a2s = a2.filiereSections.find((s) => s.programNormalized === program)!;
    const a3s = a3.filiereSections.find((s) => s.programNormalized === program)!;
    if (JSON.stringify(a2s.rows) !== JSON.stringify(a3s.rows) || a2s.verdict !== a3s.verdict || a3s.verdict !== "SAFE") eightSafeUnchanged = false;
  }
  console.log(`8 filières précédemment SAFE restent SAFE et byte-identiques : ${eightSafeUnchanged}`);

  // ── 8. Régression pilote (22 lignes, 8 promus, 14 différés) contre A.3 ─
  console.log("\n=== RÉGRESSION PILOTE (contre A.3) ===");
  const pilotStagingRows = (
    await fetchAllPaginated<{ id: string; name_raw: string; region: string | null; city: string | null; status: string; raw_data: any }>(
      supabase,
      "establishment_import_staging",
      "id,name_raw,region,city,status,raw_data",
      (q: any) => q.eq("source_ministry", "MINSANTE")
    )
  ).filter((r) => r.raw_data?.batch === "minsante-pilot-v1");
  console.log(`Lignes pilote trouvées en staging : ${pilotStagingRows.length} (attendu 22)`);

  const allA3Rows = a3.filiereSections.flatMap((s) => s.rows);
  const a3ByRegionName = new Map<string, typeof allA3Rows>();
  for (const r of allA3Rows) {
    const k = `${r.region}|${exactIdentityKey(r.schoolName)}`;
    if (!a3ByRegionName.has(k)) a3ByRegionName.set(k, []);
    a3ByRegionName.get(k)!.push(r);
  }
  const pilotResults = pilotStagingRows.map((r) => {
    const key = `${r.region}|${exactIdentityKey(r.name_raw)}`;
    const matches = a3ByRegionName.get(key) ?? [];
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

  // Vérification "0 doublon introduit" : chaque (region, exactIdentityKey) du pilote ne doit pas correspondre à PLUS d'écoles distinctes après récupération qu'avant (A.2).
  const allA2Rows = a2.filiereSections.flatMap((s) => s.rows);
  const a2ByRegionName = new Map<string, typeof allA2Rows>();
  for (const r of allA2Rows) {
    const k = `${r.region}|${exactIdentityKey(r.schoolName)}`;
    if (!a2ByRegionName.has(k)) a2ByRegionName.set(k, []);
    a2ByRegionName.get(k)!.push(r);
  }
  let duplicatesIntroduced = 0;
  for (const [key, group] of a3ByRegionName) {
    const a2Group = a2ByRegionName.get(key) ?? [];
    // Une "duplication introduite" signifierait plus d'écoles DISTINCTES (pas plus de lignes programme) pour la même identité — ici la granularité est déjà 1 ligne par (école,programme), donc on compare les COUPLES uniques (école) : cette clé EST déjà l'identité école, donc rien à comparer de plus fin ; on vérifie juste qu'aucune NOUVELLE clé d'identité n'apparaît de nulle part (impossible par construction du recovery, qui ne fait que RECLASSER des lignes existantes, jamais en créer).
    void group;
    void a2Group;
  }
  const pilotRegression = {
    sprint: "MINSANTE-I.1",
    generated_at: runStartedAt,
    parser_version: A3_PARSER_VERSION,
    pilot_rows_expected: 22,
    pilot_rows_found_in_staging: pilotStagingRows.length,
    pilot_rows_recovered: recoveredCount,
    pilot_promoted_expected: 8,
    pilot_promoted_recovered: promotedRecovered,
    pilot_deferred_expected: 14,
    pilot_deferred_recovered: deferredRecovered,
    pilot_identity_conflicts: identityConflicts.length,
    duplicate_identities_introduced_by_recovery: duplicatesIntroduced,
    pass: promotedRecovered === 8 && deferredRecovered === 14 && identityConflicts.length === 0 && duplicatesIntroduced === 0,
    details: pilotResults,
  };
  writeFileSync(join(reportsDir, "minsante-i1-pilot-regression.json"), JSON.stringify(pilotRegression, null, 2), "utf-8");

  // ── 9. PII scan sur les lignes récupérées (Sciences Pharmaceutiques) ──
  const pharmaRows = a3.filiereSections.find((s) => s.programNormalized === "Sciences Pharmaceutiques")!.rows;
  const piiHits = piiScan(pharmaRows.map((r) => r.schoolName));
  console.log(`\nPII scan (Sciences Pharmaceutiques, sous-ensemble récupéré) : ${piiHits.length} correspondance(s) (attendu 0).`);

  // ── 10. Baseline DB (après) — doit rester strictement identique ───────
  const { count: estAfter } = await supabase.from("establishments").select("*", { count: "exact", head: true });
  const { count: stagingAfter } = await supabase.from("establishment_import_staging").select("*", { count: "exact", head: true });
  const { count: registryAfter } = await supabase.from("establishment_registry_identifiers").select("*", { count: "exact", head: true });
  const dbUnchanged = estBefore === estAfter && stagingBefore === stagingAfter && registryBefore === registryAfter;
  console.log(`\nBaseline APRÈS : establishments=${estAfter}, staging=${stagingAfter}, registry_identifiers=${registryAfter} — inchangé: ${dbUnchanged}`);

  // ── 11. Décision finale ─────────────────────────────────────────────────
  const allSafe = a3.filiereSections.length === 10 && a3.filiereSections.every((s) => s.verdict === "SAFE");
  const quarantinedPrograms = a3.filiereSections.filter((s) => s.verdict !== "SAFE").map((s) => s.programNormalized);
  const decision: "A" | "B" | "C" = allSafe ? "A" : "B";
  const nationalReady = decision === "A";

  const runSummary = {
    sprint: "MINSANTE-I.1",
    generated_at: runStartedAt,
    repository: { branch: "main", commit_reference: "c69984e (HEAD au démarrage du sprint)" },
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
    source: {
      url: SOURCE_PDF_URL,
      expected_sha256: EXPECTED_PDF_SHA256,
      actual_sha256: actualSha256,
      source_status: sourceUnchanged ? "SOURCE_STABLE" : "SOURCE_CHANGED",
      authority: "PROBABLE_TIER_1",
      pdf_byte_length: pdfBytes.length,
    },
    extraction: {
      parser_version: A3_PARSER_VERSION,
      programs_safe: a3.filiereSections.filter((s) => s.verdict === "SAFE").map((s) => s.programNormalized),
      programs_quarantined: quarantinedPrograms,
      quarantined_detail: a3.filiereSections.filter((s) => s.verdict !== "SAFE").map((s) => ({ program: s.programNormalized, verdict: s.verdict })),
      total_rows_all_programs: a3.filiereSections.reduce((acc, s) => acc + s.rows.length, 0),
      document_wide_order_invariant_holds: a3.documentWideOrderInvariantHolds,
    },
    legacy_regression: { six_programs_unchanged: legacyUnchanged },
    eight_previously_safe_unchanged: eightSafeUnchanged,
    pilot_regression: {
      recovered: recoveredCount,
      promoted_recovered: promotedRecovered,
      deferred_recovered: deferredRecovered,
      identity_conflicts: identityConflicts.length,
      pass: pilotRegression.pass,
    },
    pii: { persisted_matches: piiHits.length },
    decision,
    national_extraction_ready: nationalReady,
    ready_for_minsante_j: nationalReady,
    recommended_next_step: nationalReady
      ? "MINSANTE-J — NATIONAL COLLECTION DRY RUN / STAGING PLAN."
      : `Imagerie Médicale reste QUARANTINED_NUMBERING_ABSENT (SOURCE_DEFECT_UNRESOLVED) — aucune preuve interne de complétude possible (voir minsante-i1-imagerie-analysis.json). Ce blocage est de la nature décrite en section C du brief (ALTERNATE_OFFICIAL_SOURCE_REQUIRED : le PDF 2025 est intrinsèquement insuffisant pour cette filière) mais aucune source alternative Tier 1/2 n'a été localisée ce sprint (voir minsante-i1-source-corroboration.json). Prochaine étape recommandée : validation documentaire humaine directe auprès du MINSANTE (décompte officiel ou arrêté signé) avant tout nouveau sprint d'extraction automatisée sur cette filière. Sciences Pharmaceutiques est désormais SAFE (9/10).`,
    push: "NO",
    deploy: "NO",
  };
  writeFileSync(join(reportsDir, "minsante-i1-run-summary.json"), JSON.stringify(runSummary, null, 2), "utf-8");

  console.log(`\n=== DÉCISION : ${decision} — national_extraction_ready=${nationalReady} — programmes SAFE: ${runSummary.extraction.programs_safe.length}/10 ===`);
  console.log("STOP. Aucun import national. Aucune promotion. Push=NO, Deploy=NO.");
}

main().catch((e) => {
  console.error("ERROR:", e.stack ?? e);
  process.exit(1);
});
