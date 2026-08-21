import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { sha256Bytes } from "./lib/extraction/hashing";
import { loadPdfCoordinateItems } from "./lib/extraction/pdfCoordinateLoader";
import { parseMinsanteA2 } from "./lib/extraction/pdfMinsanteA2";
import { parseMinsanteA3, PARSER_VERSION as A3_PARSER_VERSION } from "./lib/extraction/pdfMinsanteA3";
import { exactIdentityKey } from "./lib/matching/engine";
import { piiScan } from "./lib/extraction/piiScan";

/**
 * SPRINT MINSANTE-I.2 — Documentary Validation & Source Closure (READ-ONLY).
 *
 * Périmètre strictement limité à Imagerie Médicale. Aucune écriture
 * Supabase. Aucun import national. Aucune promotion. Ni le parseur A.2 ni
 * le parseur A.3 ne sont modifiés par ce sprint — ce script les invoque
 * tels quels, uniquement pour :
 *   1. revérifier la baseline DB (avant/après, doit être strictement
 *      identique) ;
 *   2. revérifier le SHA256 de la source pinnée (fail-closed si changée) ;
 *   3. produire la liste actuelle des 30 lignes école×programme d'Imagerie
 *      Médicale, nécessaire pour construire le dossier de validation
 *      humaine (§9 du brief) — ces noms d'établissements ne sont PAS des
 *      données personnelles (PII = individus, pas des personnes morales) ;
 *   4. revalider sans modification la régression pilote (22/22, 8/8, 14/14,
 *      0 conflit) ;
 *   5. exécuter un scan PII générique sur les lignes Imagerie avant
 *      persistance dans le dossier de validation humaine.
 *
 * La recherche de source alternative documentaire (§4-8 du brief) a été
 * effectuée hors de ce script, via WebSearch/WebFetch (non scriptable en
 * environnement Node headless) — voir reports/registry/minsante-i2-source-search.json
 * et minsante-i2-source-comparison.csv, rédigés manuellement à partir de ces
 * recherches, avec le même niveau de traçabilité (URL, tier, date, résultat)
 * que MINSANTE-I.1.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..", "..");
const reportsDir = join(rootDir, "reports", "registry");

const SOURCE_PDF_URL =
  "https://examen-national-special-minsante.cm/loadfile/L2hvbWUvZXhhbWVuL2NvbmNvdXJzZnJhbWV3b3JrL3N0b3JhZ2UvcGRmL3BhZ2VzL3Jlc3VsdGF0cy9MSVNURV9FQ09MRVNfQUdSRUVTX01JTlNBTlRFXzIwMjUucGRm";
const EXPECTED_PDF_SHA256 = "26e68ab08092faa18e0fdf604e4ee6b93c229180ec9ea1f0d044f6b1a6a3946a";

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
  console.log("=== SPRINT MINSANTE-I.2 — DOCUMENTARY VALIDATION & SOURCE CLOSURE (READ-ONLY) ===\n");

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
    console.log("ATTENTION : baseline différente de la baseline attendue (2248/2366/2242) — à documenter dans le run summary.");
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
  console.log(sourceUnchanged ? "SOURCE STABLE." : "SOURCE_CHANGED — STOP (fail-closed, hors périmètre I.2).");
  if (!sourceUnchanged) throw new Error("Source PDF changée depuis MINSANTE-I.1 — hors périmètre de ce sprint documentaire.");

  const { pages } = await loadPdfCoordinateItems(pdfBytes);

  // ── 3. Parse A.2 (référence inchangée) + A.3 (inchangé, non modifié) ──
  const a2 = parseMinsanteA2(pages);
  const a3 = parseMinsanteA3(pages, sourceUnchanged);
  const safeCount = a3.filiereSections.filter((s) => s.verdict === "SAFE").length;
  console.log(`\nA.3 (${A3_PARSER_VERSION}, non modifié) : ${safeCount}/10 SAFE.`);

  const imagerieSection = a3.filiereSections.find((s) => s.programNormalized === "Imagerie Médicale")!;
  console.log(`Imagerie Médicale : ${imagerieSection.rows.length} lignes, verdict=${imagerieSection.verdict} (inchangé attendu).`);

  // ── 4. PII scan sur les 30 lignes Imagerie avant toute persistance ────
  const imagerieSchoolNames = imagerieSection.rows.map((r) => r.schoolName);
  const piiHits = piiScan(imagerieSchoolNames);
  console.log(`PII scan (Imagerie Médicale, noms d'établissements) : ${piiHits.length} correspondance(s) (attendu 0).`);

  // ── 5. NOUVEAU EN I.2 : détection générique de risque de FUSION de lignes ──
  // La section Imagerie n'a pas de numérotation (défaut connu depuis
  // MINSANTE-I). Sans numérotation, l'heuristique d'écart Y de A.2/A.3 ne
  // peut être confirmée par un redémarrage de numéro (contrairement à la
  // récupération Sciences Pharmaceutiques en I.1) : une paire de lignes
  // dont l'écart interne tombe SOUS le seuil de continuation (13.0pt, voir
  // pdfMinsanteA2.ts) sera fusionnée en UNE SEULE ligne reconstruite, MÊME
  // SI ce sont en réalité deux écoles distinctes. Ceci est un risque
  // DIFFÉRENT du défaut de numérotation lui-même : ce n'est pas juste
  // "on ne peut pas prouver que 30 est complet", c'est "30 pourrait déjà
  // être FAUX en tant que reconstruction, indépendamment de la complétude".
  //
  // Détection, générique (aucune chaîne de caractères câblée en dur) :
  //   (a) repérer les noms anormalement longs dans la section Imagerie
  //       (> 1.4x le nom le plus long de tous les AUTRES lignes de la
  //       même section) ;
  //   (b) pour chaque nom suspect, essayer TOUS les points de coupure
  //       possibles au début d'un mot-marqueur institutionnel générique
  //       (ECOLE/INSTITUT/CENTRE/COMPLEXE/COLLEGE/UNIVERSITE/FACULTE),
  //       hors position 0 ;
  //   (c) pour chaque coupure candidate, vérifier si LES DEUX moitiés
  //       correspondent (exactIdentityKey, même région) à des lignes
  //       existant déjà dans N'IMPORTE QUELLE AUTRE filière de CE MÊME
  //       document pinné — la même philosophie de corroboration interne
  //       que la récupération A.3 de Sciences Pharmaceutiques (I.1), mais
  //       appliquée ici en LECTURE SEULE, à des fins de RAPPORT uniquement
  //       — AUCUNE ligne n'est modifiée, fusionnée ou divisée dans les
  //       données réellement utilisées par le parseur.
  const allA3RowsForCorroboration = a3.filiereSections.flatMap((s) => s.rows.map((r) => ({ ...r, program: s.programNormalized })));
  const byRegionKey = new Map<string, string[]>(); // "region|exactIdentityKey" -> [programs where seen]
  for (const r of allA3RowsForCorroboration) {
    const k = `${r.region}|${exactIdentityKey(r.schoolName)}`;
    if (!byRegionKey.has(k)) byRegionKey.set(k, []);
    byRegionKey.get(k)!.push(r.program);
  }
  const INSTITUTIONAL_MARKER_RE = /\b(ECOLE|INSTITUT|CENTRE|COMPLEXE|COLLEGE|UNIVERSITE|FACULTE)\b/gi;
  const otherImagerieLengths = imagerieSection.rows.map((r) => r.schoolName.length);
  const maxOtherLength = (excludeIdx: number) => Math.max(...otherImagerieLengths.filter((_, i) => i !== excludeIdx));

  const mergeRiskFindings: Array<{
    sequence: number;
    school_name: string;
    region: string;
    name_length: number;
    max_other_row_length_in_section: number;
    length_ratio: number;
    flagged_as_merge_suspected: boolean;
    corroborated_split: null | { left: string; right: string; left_seen_in: string[]; right_seen_in: string[] };
  }> = [];

  imagerieSection.rows.forEach((r, idx) => {
    const maxOther = maxOtherLength(idx);
    const ratio = maxOther > 0 ? r.schoolName.length / maxOther : 1;
    const flagged = ratio > 1.4;
    let corroboratedSplit: (typeof mergeRiskFindings)[number]["corroborated_split"] = null;

    if (flagged) {
      const markerPositions: number[] = [];
      let m: RegExpExecArray | null;
      INSTITUTIONAL_MARKER_RE.lastIndex = 0;
      while ((m = INSTITUTIONAL_MARKER_RE.exec(r.schoolName)) !== null) {
        if (m.index > 0) markerPositions.push(m.index);
      }
      for (const pos of markerPositions) {
        const left = r.schoolName.slice(0, pos).trim();
        const right = r.schoolName.slice(pos).trim();
        if (left.length < 5 || right.length < 5) continue;
        const leftKey = `${r.region}|${exactIdentityKey(left)}`;
        const rightKey = `${r.region}|${exactIdentityKey(right)}`;
        const leftSeenIn = (byRegionKey.get(leftKey) ?? []).filter((p) => p !== "Imagerie Médicale");
        const rightSeenIn = (byRegionKey.get(rightKey) ?? []).filter((p) => p !== "Imagerie Médicale");
        if (leftSeenIn.length > 0 && rightSeenIn.length > 0) {
          corroboratedSplit = { left, right, left_seen_in: leftSeenIn, right_seen_in: rightSeenIn };
          break;
        }
      }
    }

    mergeRiskFindings.push({
      sequence: idx + 1,
      school_name: r.schoolName,
      region: r.region,
      name_length: r.schoolName.length,
      max_other_row_length_in_section: maxOther,
      length_ratio: Number(ratio.toFixed(2)),
      flagged_as_merge_suspected: flagged,
      corroborated_split: corroboratedSplit,
    });
  });

  const corroboratedMerges = mergeRiskFindings.filter((f) => f.corroborated_split !== null);
  console.log(`\nDétection de risque de fusion (générique, lecture seule) : ${mergeRiskFindings.filter((f) => f.flagged_as_merge_suspected).length} ligne(s) suspecte(s) par longueur, ${corroboratedMerges.length} corroborée(s) par cross-référence interne au document.`);
  for (const f of corroboratedMerges) {
    console.log(`  -> ligne ${f.sequence} (${f.region}) : "${f.corroborated_split!.left}" (vu dans ${f.corroborated_split!.left_seen_in.join(",")}) + "${f.corroborated_split!.right}" (vu dans ${f.corroborated_split!.right_seen_in.join(",")})`);
  }

  // ── 6. Détail des 30 lignes pour le dossier de validation humaine ─────
  const imagerieRowsDetail = imagerieSection.rows.map((r, idx) => ({
    sequence_in_extraction: idx + 1,
    region: r.region,
    school_name: r.schoolName,
    page: r.page,
    row_number_in_source: r.rowNumber, // toujours null — c'est précisément le défaut
  }));

  const imagerieValidation = {
    sprint: "MINSANTE-I.2",
    generated_at: runStartedAt,
    program: "Imagerie Médicale",
    source_sha256: actualSha256,
    parser_version: A3_PARSER_VERSION,
    verdict: imagerieSection.verdict,
    verdict_unchanged_from_i1: imagerieSection.verdict === "QUARANTINED_NUMBERING_ABSENT",
    row_count: imagerieSection.rows.length,
    row_count_caveat:
      corroboratedMerges.length > 0
        ? `NOUVEAU EN I.2 : ${corroboratedMerges.length} ligne(s) parmi les ${imagerieSection.rows.length} reconstruites sont en réalité la FUSION de 2 écoles distinctes (détecté par cross-référence interne au document pinné, voir merge_risk_analysis). Le nombre physique minimum démontré est donc ${imagerieSection.rows.length + corroboratedMerges.length}, PAS ${imagerieSection.rows.length}. Ceci est un défaut DIFFÉRENT et ADDITIONNEL au défaut de numérotation absente : sans numérotation, une paire de lignes dont l'écart Y interne tombe sous le seuil de continuation est indiscernable d'une ligne unique qui s'enroule sur 2 lignes physiques. Ce défaut n'a pas été détecté par MINSANTE-I ni MINSANTE-I.1 (leur analyse structurelle a testé l'absence de numéro peint, pas le risque de fusion de lignes).`
        : "Aucune fusion de lignes suspectée n'a été corroborée par cross-référence interne ce sprint.",
    regions_detected_in_order: imagerieSection.regionsDetectedInOrder,
    region_distribution: imagerieSection.regionMatrix,
    rows: imagerieRowsDetail,
    merge_risk_analysis: {
      method:
        "Générique, lecture seule, aucune ligne réellement modifiée : (a) repérer les noms >1.4x la longueur du nom le plus long parmi les AUTRES lignes de la section ; (b) essayer tous les points de coupure sur un marqueur institutionnel générique (ECOLE/INSTITUT/CENTRE/COMPLEXE/COLLEGE/UNIVERSITE/FACULTE) hors position 0 ; (c) vérifier si LES DEUX moitiés correspondent (exactIdentityKey, même région) à une ligne déjà connue dans N'IMPORTE QUELLE AUTRE filière de ce même document pinné.",
      findings: mergeRiskFindings,
      corroborated_merge_count: corroboratedMerges.length,
      demonstrated_minimum_physical_row_count: imagerieSection.rows.length + corroboratedMerges.length,
    },
    pii_scan: { persisted_matches: piiHits.length, hits: piiHits },
    numbering_status: imagerieSection.numberingMode,
    completeness_proof_options_checked: {
      A_explicit_total_plus_reconciliation: false,
      B_second_official_complete_list: false,
      C_regional_aggregation_10_of_10_regions: false,
      D_explicit_exhaustive_decision_annex: false,
      E_formal_minsante_documentary_validation: false,
      note:
        "Aucune des 5 formes de preuve de complétude acceptables (§8 A-E) n'a été localisée pour Imagerie Médicale 2025 après recherche documentaire ciblée (voir minsante-i2-source-search.json). '30 lignes semblent plausibles' et 'aucune autre école trouvée sur Google' sont explicitement refusées comme preuve, conformément au brief.",
    },
  };
  writeFileSync(join(reportsDir, "minsante-i2-imagerie-validation.json"), JSON.stringify(imagerieValidation, null, 2), "utf-8");
  console.log(`\n${imagerieRowsDetail.length} lignes Imagerie Médicale écrites dans minsante-i2-imagerie-validation.json (pour le dossier de validation humaine).`);

  // ── 6. Régression pilote (22/22, 8/8, 14/14, 0 conflit) — REVALIDATION SANS MODIFICATION ──
  console.log("\n=== RÉGRESSION PILOTE (revalidation sans modification, contre A.3 inchangé) ===");
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
    return {
      staging_id: r.id,
      name_raw: r.name_raw,
      region: r.region,
      status: r.status,
      classification: r.raw_data?.classification ?? (r.status === "promoted" ? "PROMOTED" : null),
      recovered: matches.length > 0,
      recovered_programs: Array.from(new Set(matches.map((m) => m.program))),
      identity_conflict: matches.length === 0,
    };
  });
  const recoveredCount = pilotResults.filter((r) => r.recovered).length;
  const promotedResults = pilotResults.filter((r) => r.status === "promoted");
  const promotedRecovered = promotedResults.filter((r) => r.recovered).length;
  const deferredResults = pilotResults.filter((r) => r.status !== "promoted");
  const deferredRecovered = deferredResults.filter((r) => r.recovered).length;
  const identityConflicts = pilotResults.filter((r) => r.identity_conflict);
  console.log(`Récupérés : ${recoveredCount}/${pilotResults.length} ; promus : ${promotedRecovered}/8 ; différés : ${deferredRecovered}/14 ; conflits : ${identityConflicts.length}`);

  const pilotRegression = {
    sprint: "MINSANTE-I.2",
    generated_at: runStartedAt,
    parser_version: A3_PARSER_VERSION,
    note: "Revalidation SANS MODIFICATION — aucun changement attendu depuis MINSANTE-I.1 (voir minsante-i1-pilot-regression.json).",
    pilot_rows_expected: 22,
    pilot_rows_found_in_staging: pilotStagingRows.length,
    pilot_rows_recovered: recoveredCount,
    pilot_promoted_expected: 8,
    pilot_promoted_recovered: promotedRecovered,
    pilot_deferred_expected: 14,
    pilot_deferred_recovered: deferredRecovered,
    pilot_identity_conflicts: identityConflicts.length,
    pass: promotedRecovered === 8 && deferredRecovered === 14 && identityConflicts.length === 0,
    details: pilotResults,
  };
  writeFileSync(join(reportsDir, "minsante-i2-pilot-regression.json"), JSON.stringify(pilotRegression, null, 2), "utf-8");

  // ── 7. Baseline DB (après) — doit rester strictement identique ────────
  const { count: estAfter } = await supabase.from("establishments").select("*", { count: "exact", head: true });
  const { count: stagingAfter } = await supabase.from("establishment_import_staging").select("*", { count: "exact", head: true });
  const { count: registryAfter } = await supabase.from("establishment_registry_identifiers").select("*", { count: "exact", head: true });
  const dbUnchanged = estBefore === estAfter && stagingBefore === stagingAfter && registryBefore === registryAfter;
  console.log(`\nBaseline APRÈS : establishments=${estAfter}, staging=${stagingAfter}, registry_identifiers=${registryAfter} — inchangé: ${dbUnchanged}`);

  // ── 8. Résumé de run (le fichier source-search / source-comparison / ─
  // human-validation-pack sont rédigés séparément à partir des recherches
  // web effectuées hors de ce script Node headless) ─────────────────────
  // Décision : A si SAFE (jamais atteint ce sprint, aucune preuve de
  // complétude en ligne trouvée) ; B si une preuve — ICI, la corroboration
  // interne au document pinné lui-même — démontre que les lignes
  // reconstruites sont incomplètes/inexactes (voir §7-8 du brief : la
  // preuve n'a pas besoin de venir d'un DEUXIÈME document pour être
  // valable, elle doit juste démontrer l'incomplétude ou l'inexactitude
  // de manière rigoureuse) ; C sinon (aucune preuve ni de complétude ni
  // d'incomplétude, juste absence de preuve).
  const decision: "A" | "B" | "C" = imagerieSection.verdict === "SAFE" ? "A" : corroboratedMerges.length > 0 ? "B" : "C";
  const runSummary = {
    sprint: "MINSANTE-I.2",
    generated_at: runStartedAt,
    repository: { branch: "main", commit_reference: "2909851 (HEAD au démarrage du sprint)" },
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
    },
    imagerie: {
      row_count_as_reconstructed: imagerieSection.rows.length,
      corroborated_merged_rows_found: corroboratedMerges.length,
      demonstrated_minimum_physical_row_count: imagerieSection.rows.length + corroboratedMerges.length,
      verdict: imagerieSection.verdict,
      verdict_unchanged_from_i1: imagerieSection.verdict === "QUARANTINED_NUMBERING_ABSENT",
    },
    programs_safe_count: safeCount,
    pilot_regression: {
      recovered: recoveredCount,
      promoted_recovered: promotedRecovered,
      deferred_recovered: deferredRecovered,
      identity_conflicts: identityConflicts.length,
      pass: pilotRegression.pass,
    },
    pii: { persisted_matches: piiHits.length },
    decision,
    national_extraction_ready: decision === "A",
    ready_for_minsante_j: decision === "A",
    human_validation_required: decision !== "A", // §9 : aucune preuve en ligne suffisante (Tier 1/2) trouvée dans les 2 cas B et C — le dossier de validation humaine reste nécessaire
    push: "NO",
    deploy: "NO",
  };
  writeFileSync(join(reportsDir, "minsante-i2-technical-run.json"), JSON.stringify(runSummary, null, 2), "utf-8");

  console.log(`\n=== Technique : ${safeCount}/10 SAFE, Imagerie=${imagerieSection.verdict}, décision préliminaire=${decision} ===`);
  console.log("STOP. Aucun import national. Aucune promotion. Push=NO, Deploy=NO.");
}

main().catch((e) => {
  console.error("ERROR:", e.stack ?? e);
  process.exit(1);
});
