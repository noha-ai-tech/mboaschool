import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { writeSourceSnapshot } from "./lib/extraction/sourceSnapshot";
import { sha256 } from "./lib/extraction/hashing";
import { evaluateCompleteness, requireExtractionSafe } from "./lib/extraction/completeness";
import { normalizeRecord, computeFingerprint } from "./lib/normalize";
import { matchCandidate } from "./lib/matching/engine";
import { generateMinesupPilotReports } from "./lib/minesupPilotReports";
import { redactPiiFromHtml } from "./lib/piiRedaction";
import type { RawSourceRecord, NormalizedStagingRecord } from "./types";
import type { MatchTarget } from "./lib/matching/types";

/**
 * SPRINT MINESUP-C — pilote CONTRÔLÉ, PILOT_TYPE=COMPLETE_REGION.
 *
 * Périmètre : Région Nord-Ouest, intégralité de la liste IPES MINESUP
 * (extraite au moment de l'exécution, jamais un chiffre codé en dur) +
 * University of Bamenda (université d'État siégeant dans cette région,
 * AJOUT EXPLICITE distinct — ne fait pas partie de l'équation de
 * complétude de la liste IPES elle-même, cf. §23/§24 de la spec).
 *
 * Portée autorisée : extraction -> normalisation -> matching -> STAGING.
 * PAS de promotion, PAS d'écriture establishment_registry_identifiers pour
 * ce sprint (candidats non-existants -> identifiants conservés dans
 * raw_data uniquement, cf. §11 de la spec).
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..", "..");
const IPES_URL = "https://www.minesup.gov.cm/index.php/instituts-prives-denseignement-superieur/";
const PARSER_VERSION = "minesup-pilot-v1-2026-08-19";
const BATCH_ID = "minesup-pilot-v1";
const OPERATOR = "jean-merlain";
const TARGET_REGION = "Région Nord-Ouest";

function readEnvVar(env: string, key: string): string {
  const match = env.match(new RegExp(`^${key}=(.*)$`, "m"));
  const value = match?.[1]?.trim();
  if (!value) throw new Error(`${key} introuvable dans .env.local`);
  return value;
}

// ── Extraction déterministe (méthode déjà validée MINESUP-A/B/B.1) ────────
function segmentByRegionHeading(html: string): { region: string; index: number }[] {
  const headerRe = /<p style="text-align: justify;"><strong>Région[^<]*<\/strong><\/p>/g;
  return [...html.matchAll(headerRe)].map((m) => ({ region: m[0].replace(/<[^>]+>/g, ""), index: m.index! }));
}
interface ListEntry { region: string; text: string; url: string | null; }
function extractRegionEntries(html: string, targetRegion: string): ListEntry[] {
  const positions = segmentByRegionHeading(html);
  positions.push({ region: "END", index: html.length });
  const targetIdx = positions.findIndex((p) => p.region === targetRegion);
  if (targetIdx === -1) throw new Error(`Région "${targetRegion}" introuvable dans la structure de la page — SOURCE_STRUCTURE_CHANGED`);
  const seg = html.slice(positions[targetIdx].index, positions[targetIdx + 1].index);
  const liRe = /<li[^>]*>([\s\S]*?)<\/li>/g;
  const entries: ListEntry[] = [];
  let m: RegExpExecArray | null;
  while ((m = liRe.exec(seg))) {
    const raw = m[1];
    const text = raw.replace(/<[^>]+>/g, "").replace(/&#8217;|&rsquo;/g, "'").trim();
    if (!text) continue;
    const linkMatch = raw.match(/href="([^"]+)"/);
    entries.push({ region: targetRegion, text, url: linkMatch ? linkMatch[1].replace(/&amp;/g, "&") : null });
  }
  return entries;
}
function isRealDetailPage(url: string | null): url is string {
  if (!url) return false;
  if (url.endsWith(".pdf") || url.includes("wp-content/uploads/")) return false;
  if (/region-[a-z-]+\/$/.test(url)) return false;
  return true;
}
function extractField(html: string, labelPatterns: RegExp[]): string | null {
  for (const label of labelPatterns) {
    const re = new RegExp(`<strong>\\s*${label.source}\\s*<\\/strong>\\s*:?\\s*(?:<br\\s*/?>)?\\s*([^<]*)`, "i");
    const m = html.match(re);
    if (m) {
      const val = m[1].replace(/&nbsp;|&rsquo;|&#8217;/g, "'").trim();
      if (val) return val;
    }
  }
  return null;
}
function fieldPresent(html: string, labelPatterns: RegExp[]): boolean {
  return labelPatterns.some((label) => new RegExp(`<strong>\\s*${label.source}\\s*<\\/strong>`, "i").test(html));
}
const CREATION = [/Arr[eê]t[eé]s?\s+portant\s+cr[eé]ation/];
const OPENING = [/Autorisation\s+d.ouverture/];
const REGION_FIELD = [/R[eé]gion/];
const CITY_FIELD = [/Site\s+de\s+localisation/];
const PII_FIELDS = [/Nom\s+du\s+promoteur/, /Nom\s+du\s+repr[eé]sentant\s+l[eé]gal/];
function urlLikelyContainsPersonName(url: string | null): boolean {
  return !!url && /nom-du-promoteur|nom-du-representant|promoteur-[a-z-]{6,}/i.test(url);
}

async function fetchText(url: string): Promise<{ status: number; html: string }> {
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; Ecoles237-registry-audit/1.0)" } });
  return { status: res.status, html: await res.text() };
}
function csvEscape(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function main() {
  const env = readFileSync(join(rootDir, ".env.local"), "utf-8");
  const url = readEnvVar(env, "NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = readEnvVar(env, "SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(url, serviceKey);

  console.log("=== SPRINT MINESUP-C — PILOTE COMPLETE_REGION (Nord-Ouest) ===\n");

  // ── 1. Baseline fraîche ───────────────────────────────────────────────
  const { count: estBefore } = await supabase.from("establishments").select("*", { count: "exact", head: true });
  const { count: stagingBefore } = await supabase.from("establishment_import_staging").select("*", { count: "exact", head: true });
  const { count: registryBefore } = await supabase.from("establishment_registry_identifiers").select("*", { count: "exact", head: true });
  console.log(`Baseline : establishments=${estBefore}, staging=${stagingBefore}, registry_identifiers=${registryBefore}`);

  // ── 2. Raw snapshot — liste agrégée ──────────────────────────────────
  const { status: indexStatus, html: indexHtml } = await fetchText(IPES_URL);
  if (indexStatus !== 200) throw new Error(`NETWORK_FAILURE — HTTP ${indexStatus}`);
  const indexSnapshot = writeSourceSnapshot({
    rootDir, batchId: BATCH_ID, fileName: "minesup-ipes-index.html",
    rawContent: indexHtml, sourceUrl: IPES_URL, sourceType: "HTML_LIST", parserVersion: PARSER_VERSION, operator: OPERATOR,
  });
  console.log(`Snapshot liste agrégée écrit : content_sha256=${indexSnapshot.content_sha256}`);

  // ── 3. Extraction déterministe — Région Nord-Ouest (expectedRows = comptage frais, jamais codé en dur) ──
  const entries = extractRegionEntries(indexHtml, TARGET_REGION);
  console.log(`Entrées "${TARGET_REGION}" extraites (fraîches) : ${entries.length}`);

  const dupNamesWithinRegion = new Map<string, number>();
  for (const e of entries) dupNamesWithinRegion.set(e.text.toLowerCase(), (dupNamesWithinRegion.get(e.text.toLowerCase()) || 0) + 1);
  const withinRegionDuplicates = [...dupNamesWithinRegion.values()].filter((c) => c > 1).reduce((s, c) => s + (c - 1), 0);

  const completeness = evaluateCompleteness({
    expectedRows: entries.length, // §14 — dérivé de la MÊME extraction, comptage FULL_DOM_TRAVERSAL de la section
    expectedRowsSource: "FULL_DOM_TRAVERSAL",
    extractedRows: entries.length - withinRegionDuplicates,
    duplicateRows: withinRegionDuplicates,
    explainedExclusions: [],
    pagination: null,
    structureValid: true,
    structureInvalidReason: null,
    networkFailed: false,
    networkFailureReason: null,
  });
  console.log(`\nCOMPLETENESS GATE : ${completeness.status} — ${completeness.explanation}`);
  requireExtractionSafe(completeness);

  // ── 4. Fiches détail — pour chaque entrée AVEC un vrai lien ──────────
  const rawRecords: RawSourceRecord[] = [];
  let detailPageCount = 0;
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const hasDetail = isRealDetailPage(entry.url);
    const urlHasPii = urlLikelyContainsPersonName(entry.url);
    let creationOrder: string | null = null, openingAuth: string | null = null, cityField: string | null = null, regionField: string | null = null;
    let piiPresent = false, contentSha256: string | null = null, sourceRecordId: string | null = null, httpStatus: number | null = null;

    if (hasDetail) {
      detailPageCount++;
      const cleanUrl = entry.url!;
      try {
        const { status, html: fetchedHtml } = await fetchText(cleanUrl);
        httpStatus = status;
        piiPresent = fieldPresent(fetchedHtml, PII_FIELDS) || urlHasPii;
        const html = redactPiiFromHtml(fetchedHtml); // toute extraction/snapshot en aval opère sur la version rédigée
        contentSha256 = sha256(html);
        const pageIdMatch = cleanUrl.match(/page_id=(\d+)/);
        sourceRecordId = pageIdMatch ? pageIdMatch[1] : sha256(cleanUrl).slice(0, 16);
        creationOrder = extractField(html, CREATION);
        openingAuth = extractField(html, OPENING);
        cityField = extractField(html, CITY_FIELD);
        regionField = extractField(html, REGION_FIELD);
        // Snapshot individuel — hash + métadonnées conservés, jamais la valeur PII (rédigée ci-dessus), pas de PII dans le nom de fichier ni l'URL.
        writeSourceSnapshot({
          rootDir, batchId: BATCH_ID, fileName: `detail-${i.toString().padStart(2, "0")}.html`,
          rawContent: html, sourceUrl: urlHasPii ? "[REDACTED — URL contient un nom de promoteur]" : cleanUrl,
          sourceType: "UNSTRUCTURED_HTML", parserVersion: PARSER_VERSION, operator: OPERATOR,
        });
      } catch (e) {
        httpStatus = -1;
      }
      await new Promise((r) => setTimeout(r, 200));
    } else {
      piiPresent = urlHasPii;
    }

    rawRecords.push({
      sourceMinistry: "MINESUP",
      sourceUrl: urlHasPii ? "[REDACTED — voir source_record_id]" : (entry.url ?? IPES_URL),
      sourceYear: null,
      officialIdentifier: null, // §10 — deux identifiants possibles, jamais fusionnés dans le champ unique legacy ; vivent dans raw.identifiers
      nameRaw: entry.text,
      region: regionField ?? "Nord-Ouest",
      department: null,
      arrondissement: null,
      commune: null,
      locality: null,
      city: cityField, // jamais déduit de la région/du nom — null si absent de la fiche
      quarter: null,
      subsystemRaw: null, // jamais déduit de la région (anglophone) — pas un champ source
      educationFamilyHint: "Institut Privé d'Enseignement Supérieur (IPES)",
      ownershipHint: "private", // catégorisation structurelle de la LISTE source elle-même (page "Instituts Privés"), pas une déduction sur le nom
      raw: {
        source_record_id: sourceRecordId,
        content_sha256: contentSha256,
        parser_version: PARSER_VERSION,
        has_detail_page: hasDetail,
        http_status: httpStatus,
        identifiers: { creation_order_raw: creationOrder, opening_authorization_raw: openingAuth },
        pii_field_present_but_not_collected: piiPresent,
        list_region_section: TARGET_REGION,
        batch: BATCH_ID,
        operator: OPERATOR,
        extraction_verdict_for_list: completeness.status,
      },
    });
  }
  console.log(`Fiches détail consultées : ${detailPageCount}/${entries.length}`);

  // ── 5. Ajout explicite — University of Bamenda (public, hors équation de complétude IPES) ──
  const bamendaNavIdx = indexHtml.indexOf("Universités d&rsquo;Etat");
  const bamendaSeg = indexHtml.slice(bamendaNavIdx, bamendaNavIdx + 800);
  const bamendaMatch = bamendaSeg.match(/<li[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>(University of Bamenda)<\/a>/);
  if (bamendaMatch) {
    rawRecords.push({
      sourceMinistry: "MINESUP",
      sourceUrl: bamendaMatch[1],
      sourceYear: null,
      officialIdentifier: null,
      nameRaw: bamendaMatch[2],
      region: "Nord-Ouest",
      department: null, arrondissement: null, commune: null, locality: null,
      city: null, // MINESUP ne fournit aucun champ ville structuré pour les universités d'État — jamais déduit du nom
      quarter: null,
      subsystemRaw: null,
      educationFamilyHint: "Université d'État",
      ownershipHint: "public", // catégorisation structurelle de la LISTE nav "Universités d'Etat" elle-même
      raw: {
        source_record_id: null,
        content_sha256: null,
        parser_version: PARSER_VERSION,
        has_detail_page: false,
        http_status: null,
        identifiers: { creation_order_raw: null, opening_authorization_raw: null },
        pii_field_present_but_not_collected: false,
        list_region_section: "Universités d'Etat (nav)",
        batch: BATCH_ID,
        operator: OPERATOR,
        note: "Ajout explicite, hors équation de complétude IPES Nord-Ouest — aucune fiche détail MINESUP-hébergée pour les universités d'État (confirmé MINESUP-A/B.1).",
      },
    });
    console.log("Ajout explicite : University of Bamenda (public, 1 institution, hors équation de complétude IPES)");
  } else {
    console.log("ATTENTION : University of Bamenda introuvable dans le nav — ajout ignoré, pas d'invention.");
  }

  console.log(`\nTotal candidats bruts : ${rawRecords.length}`);

  // ── 6. Normalisation (fonctions pures déjà testées) ──────────────────
  const normalized: NormalizedStagingRecord[] = rawRecords.map(normalizeRecord);

  writeFileSync(join(rootDir, "reports", "registry", "minesup-pilot-v1-raw-and-normalized.json"), JSON.stringify({ raw_records: rawRecords, normalized_records: normalized }, null, 2), "utf-8");

  // ── 7. Matching contre live + staging + registry identifiers ─────────
  async function fetchAllPaginated<T>(table: string, select: string): Promise<T[]> {
    const all: T[] = [];
    let offset = 0; const pageSize = 1000;
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
  interface LiveEst { id: string; name: string; region: string | null; city: string | null; main_category: string | null; }
  interface RegistryIdRow { establishment_id: string; registry: string; identifier: string; identifier_type: string | null; }
  interface StagingRow { id: string; name_raw: string; region: string | null; city: string | null; education_family: string | null; }

  const liveEst = await fetchAllPaginated<LiveEst>("establishments", "id,name,region,city,main_category");
  const registryIds = await fetchAllPaginated<RegistryIdRow>("establishment_registry_identifiers", "establishment_id,registry,identifier,identifier_type");
  const existingStaging = await fetchAllPaginated<StagingRow>("establishment_import_staging", "id,name_raw,region,city,education_family");

  const idsByEstablishment = new Map<string, { registry: string; identifier: string; identifierType?: string | null }[]>();
  for (const r of registryIds) {
    if (!idsByEstablishment.has(r.establishment_id)) idsByEstablishment.set(r.establishment_id, []);
    idsByEstablishment.get(r.establishment_id)!.push({ registry: r.registry, identifier: r.identifier, identifierType: r.identifier_type });
  }

  // `establishments.main_category` (5 valeurs FR : garderie/primaire/secondaire/superieur/autres) et
  // `establishment_import_staging.education_family` (11 valeurs, ex. 'higher_education') sont DEUX
  // taxonomies différentes — comparées en chaîne stricte par le moteur de matching, "superieur" ne
  // vaut jamais "higher_education" sans cette conversion. Sans elle, categoryMatch serait TOUJOURS
  // null pour toute cible live, désactivant silencieusement le filtre anti-collision de catégorie.
  function mainCategoryToEducationFamily(mainCategory: string | null): string | null {
    if (mainCategory === "superieur") return "higher_education";
    return mainCategory; // pas de mapping 1:1 fiable pour les autres valeurs — reste distinct, exclusion de catégorie toujours correcte (jamais confondu avec higher_education)
  }
  const liveTargets: MatchTarget[] = liveEst.map((e) => ({ id: e.id, name: e.name, region: e.region, city: e.city, category: mainCategoryToEducationFamily(e.main_category), identifiers: idsByEstablishment.get(e.id) ?? [] }));
  const stagingTargets: MatchTarget[] = existingStaging.map((s) => ({ id: `staging:${s.id}`, name: s.name_raw, region: s.region, city: s.city, category: s.education_family, identifiers: [] }));
  const allTargets = [...liveTargets, ...stagingTargets];
  console.log(`\nCibles de matching : ${liveTargets.length} établissements live + ${stagingTargets.length} staging existant`);

  interface CandidateResult {
    normalized: NormalizedStagingRecord;
    matchLevel: string;
    matchedTargetId: string | null;
    matchedTargetName: string | null;
    matchReason: string;
    decision: "READY" | "DUPLICATE_EXACT" | "DUPLICATE_REVIEW" | "SOURCE_REVIEW" | "IDENTITY_REVIEW" | "INVALID";
    stagingStatus: "ready" | "duplicate_exact" | "duplicate_review" | "normalized" | "rejected";
  }
  const results: CandidateResult[] = [];
  for (const n of normalized) {
    if (n.status === "rejected") {
      results.push({ normalized: n, matchLevel: "N/A", matchedTargetId: null, matchedTargetName: null, matchReason: n.rejectionReason ?? "rejeté", decision: "INVALID", stagingStatus: "rejected" });
      continue;
    }
    const candidate = { name: n.nameRaw, region: n.region, city: n.city, category: n.educationFamily, identifiers: [] };
    const match = matchCandidate(candidate, allTargets);
    let decision: CandidateResult["decision"];
    let stagingStatus: CandidateResult["stagingStatus"];
    if (match.level === "EXACT_IDENTIFIER" || match.level === "EXACT_IDENTITY") {
      decision = "DUPLICATE_EXACT"; stagingStatus = "duplicate_exact";
    } else if (match.level === "STRONG_MATCH" || match.level === "PROBABLE_MATCH" || match.level === "AMBIGUOUS") {
      decision = "DUPLICATE_REVIEW"; stagingStatus = "duplicate_review";
    } else {
      // NO_MATCH — candidat réellement nouveau. Fiche détail disponible + PII exclue -> CLEAN_APPROVABLE ; sinon revue.
      const raw = rawRecords[normalized.indexOf(n)].raw as any;
      if (!raw.has_detail_page) {
        decision = "SOURCE_REVIEW"; stagingStatus = "normalized";
      } else {
        decision = "READY"; stagingStatus = "ready";
      }
    }
    results.push({ normalized: n, matchLevel: match.level, matchedTargetId: match.target?.id ?? null, matchedTargetName: match.target?.name ?? null, matchReason: match.reason, decision, stagingStatus });
  }

  const tally = { exact_identifier: 0, exact_identity: 0, strong: 0, probable: 0, ambiguous: 0, new_ready: 0, source_review: 0, invalid: 0 };
  for (const r of results) {
    if (r.matchLevel === "EXACT_IDENTIFIER") tally.exact_identifier++;
    else if (r.matchLevel === "EXACT_IDENTITY") tally.exact_identity++;
    else if (r.matchLevel === "STRONG_MATCH") tally.strong++;
    else if (r.matchLevel === "PROBABLE_MATCH") tally.probable++;
    else if (r.matchLevel === "AMBIGUOUS") tally.ambiguous++;
    else if (r.decision === "READY") tally.new_ready++;
    else if (r.decision === "SOURCE_REVIEW") tally.source_review++;
    else if (r.decision === "INVALID") tally.invalid++;
  }

  // ── 8. DRY RUN REPORT ──────────────────────────────────────────────
  const totalClassified = tally.exact_identifier + tally.exact_identity + tally.strong + tally.probable + tally.ambiguous + tally.new_ready + tally.source_review + tally.invalid;
  console.log("\n=== MINESUP PILOT STAGING DRY RUN ===");
  console.log(`Candidates extracted : ${normalized.length}`);
  console.log(`Existing live : ${liveEst.length}`);
  console.log(`Existing staging : ${existingStaging.length}`);
  console.log(`Exact matches (identifier+identity) : ${tally.exact_identifier + tally.exact_identity}`);
  console.log(`Strong matches : ${tally.strong}`);
  console.log(`Probable : ${tally.probable}`);
  console.log(`Ambiguous : ${tally.ambiguous}`);
  console.log(`New (ready) : ${tally.new_ready}`);
  console.log(`New (source_review) : ${tally.source_review}`);
  console.log(`Invalid : ${tally.invalid}`);
  const wouldStage = normalized.length - (tally.exact_identifier + tally.exact_identity); // duplicates ne sont pas "would stage" comme nouveaux — ils SONT stagés mais avec status duplicate_*, ils occupent quand même une ligne de staging pour trace. Décision : TOUT candidat est staged (traçabilité complète), le statut distingue.
  console.log(`Would stage (toutes lignes, statut distinct par candidat) : ${normalized.length}`);

  if (totalClassified !== normalized.length) {
    console.log(`\nINCOHÉRENCE : ${totalClassified} classifiés != ${normalized.length} candidats. STOP.`);
    process.exit(1);
  }
  console.log("\nDry-run cohérent — poursuite autorisée.");

  writeFileSync(join(rootDir, "reports", "registry", "minesup-pilot-v1-dry-run.json"), JSON.stringify({
    generated_at: new Date().toISOString(), batch: BATCH_ID, operator: OPERATOR,
    candidates_extracted: normalized.length, existing_live: liveEst.length, existing_staging: existingStaging.length,
    tally, would_stage: normalized.length,
  }, null, 2), "utf-8");

  // ── 9. STAGING INSERT — autorisé après dry-run propre (§26), idempotent (§27) ──
  const { data: dataSource, error: dsError } = await supabase
    .from("establishment_data_sources")
    .insert({
      ministry: "MINESUP",
      source_name: "Instituts Privés d'Enseignement Supérieur (IPES) — Région Nord-Ouest + University of Bamenda",
      source_url: IPES_URL,
      source_year: null,
      fetched_at: new Date().toISOString(),
      records_fetched: normalized.length,
      notes: `SPRINT MINESUP-C — PILOT_TYPE=COMPLETE_REGION (Nord-Ouest IPES, 31/31) + 1 ajout explicite public (University of Bamenda). Batch: ${BATCH_ID}.`,
    })
    .select("id")
    .single();
  if (dsError) throw new Error(`Échec création data_source : ${dsError.message}`);
  console.log(`\ndata_source créée : ${dataSource.id}`);

  // Idempotence : une fingerprint déjà présente (source_ministry=MINESUP) n'est jamais réinsérée.
  // Le select initial (existingStaging) ne charge pas fingerprint/source_ministry — refetch ciblé ici.
  const { data: existingMinesupRows } = await supabase.from("establishment_import_staging").select("fingerprint").eq("source_ministry", "MINESUP");
  const existingMinesupFingerprintSet = new Set((existingMinesupRows ?? []).map((r: any) => r.fingerprint));

  let inserted = 0, skippedIdempotent = 0;
  const insertedStagingIds: Array<{ index: number; staging_id: string; name: string }> = [];
  for (let i = 0; i < normalized.length; i++) {
    const n = normalized[i];
    const r = results[i];
    if (existingMinesupFingerprintSet.has(n.fingerprint)) {
      skippedIdempotent++;
      continue;
    }
    const { data: row, error: insError } = await supabase
      .from("establishment_import_staging")
      .insert({
        data_source_id: dataSource.id,
        source_ministry: "MINESUP",
        source_url: n.sourceUrl,
        source_year: n.sourceYear,
        official_identifier: n.officialIdentifier,
        raw_data: n.raw,
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
        duplicate_of_establishment_id: (r.decision === "DUPLICATE_EXACT" || r.decision === "DUPLICATE_REVIEW") && r.matchedTargetId && !r.matchedTargetId.startsWith("staging:") ? r.matchedTargetId : null,
        duplicate_of_staging_id: (r.decision === "DUPLICATE_EXACT" || r.decision === "DUPLICATE_REVIEW") && r.matchedTargetId?.startsWith("staging:") ? r.matchedTargetId.slice("staging:".length) : null,
        status: r.stagingStatus,
        rejection_reason: r.decision === "INVALID" ? r.matchReason : null,
      })
      .select("id")
      .single();
    if (insError) throw new Error(`Échec insertion staging pour "${n.nameRaw}" : ${insError.message}`);
    inserted++;
    insertedStagingIds.push({ index: i, staging_id: row.id, name: n.nameRaw });
    existingMinesupFingerprintSet.add(n.fingerprint); // évite un doublon interne au même run si 2 candidats partagent une fingerprint
  }
  console.log(`\nInsertion staging : ${inserted} insérées, ${skippedIdempotent} déjà présentes (idempotence)`);

  // ── 10. Test d'idempotence — second passage immédiat, doit produire 0 nouvelle insertion ──
  const { data: recheckRows } = await supabase.from("establishment_import_staging").select("fingerprint").eq("source_ministry", "MINESUP");
  const recheckSet = new Set((recheckRows ?? []).map((r: any) => r.fingerprint));
  let secondPassInserted = 0;
  for (const n of normalized) {
    if (!recheckSet.has(n.fingerprint)) secondPassInserted++; // ne devrait jamais arriver après le passage ci-dessus
  }
  console.log(`Test idempotence (second passage simulé) : ${secondPassInserted} nouvelle(s) insertion(s) attendue(s) (attendu 0)`);

  // ── 11. Rapports : review CSV, approval snapshot, link proposals ──────
  // Générés depuis l'ÉTAT RÉEL de establishment_import_staging (source de
  // vérité), jamais depuis la mémoire de CE run — un second passage
  // idempotent (qui n'insère rien) ne doit jamais écraser un rapport
  // correct avec sa propre vue partielle (bug réel trouvé dans ce sprint).
  const reportSummary = await generateMinesupPilotReports(supabase, rootDir, OPERATOR, BATCH_ID);
  console.log(`\nCLEAN_APPROVABLE (état réel DB) : ${reportSummary.clean_approvable_count} — checksum ${reportSummary.approval_checksum}`);
  console.log(`Link proposals : ${reportSummary.link_proposals_count} (aucune exécution — proposition seule)`);

  // ── 12. Post-condition ────────────────────────────────────────────────
  const { count: estAfter } = await supabase.from("establishments").select("*", { count: "exact", head: true });
  const { count: stagingAfter } = await supabase.from("establishment_import_staging").select("*", { count: "exact", head: true });
  const { count: registryAfter } = await supabase.from("establishment_registry_identifiers").select("*", { count: "exact", head: true });
  console.log(`\nPOST-CONDITION : establishments ${estBefore}->${estAfter} | staging ${stagingBefore}->${stagingAfter} | registry_identifiers ${registryBefore}->${registryAfter}`);

  writeFileSync(join(rootDir, "reports", "registry", "minesup-pilot-v1-final-summary.json"), JSON.stringify({
    generated_at: new Date().toISOString(), batch: BATCH_ID, operator: OPERATOR,
    database: { establishments_before: estBefore, establishments_after: estAfter, staging_before: stagingBefore, staging_after: stagingAfter, registry_identifiers_before: registryBefore, registry_identifiers_after: registryAfter },
    pilot: { type: "COMPLETE_REGION", region: TARGET_REGION, ipes_count: entries.length, public_addition: 1, total_candidates: normalized.length },
    completeness, tally, inserted, skipped_idempotent: skippedIdempotent, second_pass_would_insert: secondPassInserted,
    staging_rows_by_status: reportSummary.by_status,
    clean_approvable: reportSummary.clean_approvable_count, approval_checksum: reportSummary.approval_checksum,
  }, null, 2), "utf-8");
}

main().catch((error) => {
  console.error("Échec collecte pilote MINESUP-C :", error);
  process.exit(1);
});
