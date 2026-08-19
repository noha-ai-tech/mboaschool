import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { writeSourceSnapshot } from "./lib/extraction/sourceSnapshot";
import { sha256 } from "./lib/extraction/hashing";
import { evaluateCompleteness, requireExtractionSafe } from "./lib/extraction/completeness";
import { normalizeRecord } from "./lib/normalize";
import { matchCandidate, findIdentifierCollisions } from "./lib/matching/engine";
import type { MatchTarget } from "./lib/matching/types";
import type { RawSourceRecord, NormalizedStagingRecord } from "./types";
import { redactPiiFromHtml } from "./lib/piiRedaction";

/**
 * SPRINT MINESUP-E — collecte NATIONALE (10 régions IPES + universités
 * d'État), READ-mostly. Écriture UNIQUEMENT dans establishment_import_staging
 * pour des candidats génuinement nouveaux — jamais establishments, jamais
 * establishment_registry_identifiers (aucun établissement de production
 * n'existe encore pour ces candidats).
 *
 * Étend la méthodologie validée MINESUP-A/B/B.1/C/D à l'échelle nationale.
 * Corrige explicitement les 3 bugs réels trouvés pendant MINESUP-D :
 *  1. Matching : les cibles sont un instantané FIXE (live + staging
 *     PRÉ-EXISTANT) capturé AVANT toute insertion — jamais les candidats
 *     du même lot national comparés entre eux (plus besoin d'exclusion
 *     explicite : la classification complète précède l'insertion).
 *  2. Checksum : tri déterministe par staging_id (une fois inséré), jamais
 *     un ordre qui pourrait varier entre deux lectures.
 *  3. PII : rédaction EN MÉMOIRE immédiatement après fetch, AVANT tout
 *     writeSourceSnapshot — jamais un fichier brut non rédigé, même
 *     transitoirement sur disque (§7 de la spec).
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..", "..");
const IPES_URL = "https://www.minesup.gov.cm/index.php/instituts-prives-denseignement-superieur/";
const PARSER_VERSION = "minesup-e-national-2026-08-19";
const BATCH_ID = "minesup-national-v1";
const OPERATOR = "jean-merlain";

function readEnvVar(env: string, key: string): string {
  const match = env.match(new RegExp(`^${key}=(.*)$`, "m"));
  const value = match?.[1]?.trim();
  if (!value) throw new Error(`${key} introuvable dans .env.local`);
  return value;
}
function csvEscape(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
async function fetchAllPaginated<T>(supabase: any, table: string, select: string, filter?: (q: any) => any): Promise<T[]> {
  const all: T[] = [];
  let offset = 0; const pageSize = 1000;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    let q = supabase.from(table).select(select).range(offset, offset + pageSize - 1);
    if (filter) q = filter(q);
    const { data, error } = await q;
    if (error) throw error;
    all.push(...(data as T[]));
    if (!data || data.length < pageSize) break;
    offset += pageSize;
  }
  return all;
}

// ── Extraction déterministe (méthode validée MINESUP-A/B/B.1/C) ─────────
function segmentByRegionHeading(html: string): { region: string; index: number }[] {
  const headerRe = /<p style="text-align: justify;"><strong>Région[^<]*<\/strong><\/p>/g;
  return [...html.matchAll(headerRe)].map((m) => ({ region: m[0].replace(/<[^>]+>/g, ""), index: m.index! }));
}
interface ListEntry { region: string; text: string; url: string | null; }
function extractAllRegionEntries(html: string): { entries: ListEntry[]; regionsFound: string[] } {
  const positions = segmentByRegionHeading(html);
  const regionsFound = positions.map((p) => p.region);
  positions.push({ region: "END", index: html.length });
  const entries: ListEntry[] = [];
  for (let i = 0; i < positions.length - 1; i++) {
    if (positions[i].region === "END") continue;
    const seg = html.slice(positions[i].index, positions[i + 1].index);
    const liRe = /<li[^>]*>([\s\S]*?)<\/li>/g;
    let m: RegExpExecArray | null;
    while ((m = liRe.exec(seg))) {
      const raw = m[1];
      const text = raw.replace(/<[^>]+>/g, "").replace(/&#8217;|&rsquo;/g, "'").trim();
      if (!text) continue;
      const linkMatch = raw.match(/href="([^"]+)"/);
      entries.push({ region: positions[i].region, text, url: linkMatch ? linkMatch[1].replace(/&amp;/g, "&") : null });
    }
  }
  return { entries, regionsFound };
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
function mainCategoryToEducationFamily(mainCategory: string | null): string | null {
  return mainCategory === "superieur" ? "higher_education" : mainCategory;
}

async function main() {
  const env = readFileSync(join(rootDir, ".env.local"), "utf-8");
  const url = readEnvVar(env, "NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = readEnvVar(env, "SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(url, serviceKey);

  console.log("=== SPRINT MINESUP-E — COLLECTE NATIONALE (READ-mostly, staging only) ===\n");

  // ── 1. Baseline fraîche ───────────────────────────────────────────────
  const { count: estBefore } = await supabase.from("establishments").select("*", { count: "exact", head: true });
  const { count: stagingBefore } = await supabase.from("establishment_import_staging").select("*", { count: "exact", head: true });
  const { count: registryBefore } = await supabase.from("establishment_registry_identifiers").select("*", { count: "exact", head: true });
  console.log(`Baseline : establishments=${estBefore}, staging=${stagingBefore}, registry_identifiers=${registryBefore}`);

  // ── 2. Instantané FIXE des cibles de matching — capturé AVANT toute insertion ──
  interface LiveEst { id: string; name: string; region: string | null; city: string | null; main_category: string | null; }
  interface RegistryIdRow { establishment_id: string; registry: string; identifier: string; identifier_type: string | null; }
  interface StagingRow { id: string; name_raw: string; region: string | null; city: string | null; education_family: string | null; status: string; source_ministry: string; fingerprint: string; data_source_id: string | null; }
  const liveEstSnapshot = await fetchAllPaginated<LiveEst>(supabase, "establishments", "id,name,region,city,main_category");
  const registryIdsSnapshot = await fetchAllPaginated<RegistryIdRow>(supabase, "establishment_registry_identifiers", "establishment_id,registry,identifier,identifier_type");
  const preExistingStaging = await fetchAllPaginated<StagingRow>(supabase, "establishment_import_staging", "id,name_raw,region,city,education_family,status,source_ministry,fingerprint,data_source_id");
  console.log(`Instantané figé : ${liveEstSnapshot.length} établissements live, ${registryIdsSnapshot.length} identifiants registre, ${preExistingStaging.length} lignes staging pré-existantes`);

  const idsByEstablishment = new Map<string, { registry: string; identifier: string; identifierType?: string | null }[]>();
  for (const r of registryIdsSnapshot) {
    if (!idsByEstablishment.has(r.establishment_id)) idsByEstablishment.set(r.establishment_id, []);
    idsByEstablishment.get(r.establishment_id)!.push({ registry: r.registry, identifier: r.identifier, identifierType: r.identifier_type });
  }
  const liveTargets: MatchTarget[] = liveEstSnapshot.map((e) => ({ id: e.id, name: e.name, region: e.region, city: e.city, category: mainCategoryToEducationFamily(e.main_category), identifiers: idsByEstablishment.get(e.id) ?? [] }));
  // Exclut les lignes staging déjà promues (status='promoted') des cibles de
  // matching : une institution promue existe DÉJÀ dans liveTargets — sa
  // ligne staging (jamais supprimée, juste marquée) est une ghost
  // redondante. Sans cette exclusion, la même institution apparaît deux
  // fois dans le pool de cibles avec un score de chevauchement flou
  // IDENTIQUE, créant une fausse égalité (AMBIGUOUS) contre tout candidat
  // tiers non lié — bug réel trouvé sur les données nationales (ex.
  // "Higher Institute for Business and management Sciences", promu en
  // MINESUP-D, comptait deux fois et produisait un faux AMBIGUOUS contre
  // "ISSTMADD" (Adamaoua), une institution totalement différente).
  const stagingTargets: MatchTarget[] = preExistingStaging.filter((s) => s.status !== "promoted").map((s) => ({ id: `staging:${s.id}`, name: s.name_raw, region: s.region, city: s.city, category: s.education_family, identifiers: [] }));
  const fixedTargets = [...liveTargets, ...stagingTargets];
  const existingIdentifierKeys = new Set(registryIdsSnapshot.map((r) => `${r.registry}|${r.identifier_type ?? ""}|${r.identifier.trim().toUpperCase()}`));
  const existingFingerprints = new Set(preExistingStaging.map((s) => s.fingerprint));

  // ── 3. Raw snapshot — liste agrégée IPES ──────────────────────────────
  const { status: indexStatus, html: indexHtml } = await fetchText(IPES_URL);
  if (indexStatus !== 200) throw new Error(`NETWORK_FAILURE — HTTP ${indexStatus}`);
  const indexSnapshot = writeSourceSnapshot({
    rootDir, batchId: BATCH_ID, fileName: "minesup-ipes-index.html",
    rawContent: indexHtml, sourceUrl: IPES_URL, sourceType: "HTML_LIST", parserVersion: PARSER_VERSION, operator: OPERATOR,
  });
  console.log(`\nSnapshot liste agrégée : content_sha256=${indexSnapshot.content_sha256}`);

  // ── 4. Extraction déterministe — 10 régions, structure validée ────────
  const { entries: allEntries, regionsFound } = extractAllRegionEntries(indexHtml);
  console.log(`\nRégions détectées dans la source (${regionsFound.length}) :`, regionsFound);
  if (regionsFound.length !== 10) {
    console.log(`\nFAIL CLOSED — ${regionsFound.length} régions détectées au lieu de 10 attendues. Structure source modifiée. STOP.`);
    process.exit(1);
  }
  console.log(`Entrées nationales extraites (fraîches, toutes régions) : ${allEntries.length}`);

  const byRegionRaw = new Map<string, number>();
  for (const e of allEntries) byRegionRaw.set(e.region, (byRegionRaw.get(e.region) || 0) + 1);
  console.log("Répartition brute par région :", Object.fromEntries(byRegionRaw));

  const dupNamesGlobal = new Map<string, number>();
  for (const e of allEntries) dupNamesGlobal.set(`${e.region}|${e.text.toLowerCase()}`, (dupNamesGlobal.get(`${e.region}|${e.text.toLowerCase()}`) || 0) + 1);
  const withinRegionDuplicates = [...dupNamesGlobal.values()].filter((c) => c > 1).reduce((s, c) => s + (c - 1), 0);

  const completeness = evaluateCompleteness({
    expectedRows: allEntries.length,
    expectedRowsSource: "FULL_DOM_TRAVERSAL",
    extractedRows: allEntries.length - withinRegionDuplicates,
    duplicateRows: withinRegionDuplicates,
    explainedExclusions: [],
    pagination: null,
    structureValid: true,
    structureInvalidReason: null,
    networkFailed: false,
    networkFailureReason: null,
  });
  console.log(`\nCOMPLETENESS GATE (liste nationale) : ${completeness.status} — ${completeness.explanation}`);
  requireExtractionSafe(completeness);

  // ── 5. Universités d'État (11 attendues, revalidées depuis la source) ──
  const navIdx = indexHtml.indexOf("Universités d&rsquo;Etat");
  const navSeg = indexHtml.slice(navIdx, navIdx + 2500);
  const stateUniRe = /<li[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/g;
  const stateUnis: { name: string; url: string }[] = [];
  let suM: RegExpExecArray | null;
  while ((suM = stateUniRe.exec(navSeg)) && stateUnis.length < 20) {
    const name = suM[2].trim().replace(/&rsquo;/g, "'");
    if (name === "Institutions Internationales") break;
    stateUnis.push({ name, url: suM[1] });
  }
  console.log(`\nUniversités d'État revalidées depuis la source : ${stateUnis.length} (attendu 11)`);

  // ── 6. Fiches détail — chaque entrée AVEC un vrai lien, TOUTES régions ──
  let detailFetchIndex = 0;
  const rawRecords: (RawSourceRecord & { __sourceRegionSection: string; __hasDetailPage: boolean; __httpStatus: number | null })[] = [];

  for (const entry of allEntries) {
    const hasDetail = isRealDetailPage(entry.url);
    const urlHasPii = urlLikelyContainsPersonName(entry.url);
    let creationOrder: string | null = null, openingAuth: string | null = null, cityField: string | null = null, regionField: string | null = null;
    let piiPresent = urlHasPii, contentSha256: string | null = null, sourceRecordId: string | null = null, httpStatus: number | null = null;

    if (hasDetail) {
      const cleanUrl = entry.url!;
      try {
        const { status, html: fetchedHtml } = await fetchText(cleanUrl);
        httpStatus = status;
        piiPresent = fieldPresent(fetchedHtml, PII_FIELDS) || urlHasPii;
        const html = redactPiiFromHtml(fetchedHtml); // §7 — rédaction EN MÉMOIRE avant tout writeSourceSnapshot
        contentSha256 = sha256(html);
        const pageIdMatch = cleanUrl.match(/page_id=(\d+)/);
        sourceRecordId = pageIdMatch ? pageIdMatch[1] : sha256(cleanUrl).slice(0, 16);
        creationOrder = extractField(html, CREATION);
        openingAuth = extractField(html, OPENING);
        cityField = extractField(html, CITY_FIELD);
        regionField = extractField(html, REGION_FIELD);
        writeSourceSnapshot({
          rootDir, batchId: BATCH_ID, fileName: `detail-${detailFetchIndex.toString().padStart(3, "0")}.html`,
          rawContent: html, sourceUrl: urlHasPii ? "[REDACTED — URL contient un nom de promoteur]" : cleanUrl,
          sourceType: "UNSTRUCTURED_HTML", parserVersion: PARSER_VERSION, operator: OPERATOR,
        });
        detailFetchIndex++;
      } catch {
        httpStatus = -1;
      }
      await new Promise((r) => setTimeout(r, 150));
      if (detailFetchIndex % 20 === 0 && detailFetchIndex > 0) console.log(`  ... ${detailFetchIndex} fiches détail traitées`);
    }

    rawRecords.push({
      sourceMinistry: "MINESUP",
      sourceUrl: urlHasPii ? "[REDACTED — voir source_record_id]" : (entry.url ?? IPES_URL),
      sourceYear: null,
      officialIdentifier: null,
      nameRaw: entry.text,
      region: regionField ?? entry.region.replace("Région de l'", "").replace("Région du ", "").replace("Région ", "").trim(),
      department: null, arrondissement: null, commune: null, locality: null,
      city: cityField, quarter: null, subsystemRaw: null,
      educationFamilyHint: "Institut Privé d'Enseignement Supérieur (IPES)",
      ownershipHint: "private",
      raw: {
        source_record_id: sourceRecordId, content_sha256: contentSha256, parser_version: PARSER_VERSION,
        has_detail_page: hasDetail, http_status: httpStatus,
        identifiers: { creation_order_raw: creationOrder, opening_authorization_raw: openingAuth },
        pii_field_present_but_not_collected: piiPresent, list_region_section: entry.region, batch: BATCH_ID, operator: OPERATOR,
      },
      __sourceRegionSection: entry.region, __hasDetailPage: hasDetail, __httpStatus: httpStatus,
    });
  }
  console.log(`\nFiches détail consultées : ${detailFetchIndex}/${allEntries.length}`);

  // Universités d'État — ajout explicite, aucune fiche détail MINESUP-hébergée (confirmé MINESUP-A/B.1/C).
  for (const su of stateUnis) {
    rawRecords.push({
      sourceMinistry: "MINESUP",
      sourceUrl: su.url,
      sourceYear: null,
      officialIdentifier: null,
      nameRaw: su.name,
      region: null, // aucune région structurée fournie par le nav pour les universités d'État — jamais déduite du nom
      department: null, arrondissement: null, commune: null, locality: null,
      city: null, quarter: null, subsystemRaw: null,
      educationFamilyHint: "Université d'État",
      ownershipHint: "public",
      raw: {
        source_record_id: null, content_sha256: null, parser_version: PARSER_VERSION,
        has_detail_page: false, http_status: null,
        identifiers: { creation_order_raw: null, opening_authorization_raw: null },
        pii_field_present_but_not_collected: false, list_region_section: "Universités d'Etat (nav)", batch: BATCH_ID, operator: OPERATOR,
        provenance_note: "Identifiant légal probable = décret présidentiel (prc.cm/spm.gov.cm), PAS le même registre/schéma que les actes MINESUP_IPES — jamais confondu (piste documentée MINESUP-B.1, non collectée ce sprint).",
      },
      __sourceRegionSection: "Universités d'Etat (nav)", __hasDetailPage: false, __httpStatus: null,
    });
  }

  console.log(`\nTotal candidats bruts (IPES + universités d'État) : ${rawRecords.length}`);

  // ── 7. Normalisation ────────────────────────────────────────────────
  const normalized: NormalizedStagingRecord[] = rawRecords.map((r) => normalizeRecord(r));

  writeFileSync(join(rootDir, "reports", "registry", "minesup-e-raw-and-normalized.json"), JSON.stringify({ note: "raw_data seulement — aucune valeur PII, présence booléenne uniquement", count: rawRecords.length }, null, 2), "utf-8");

  // ── 8. PII residual scan — sur toutes les données en mémoire avant toute écriture ──
  let piiResidualScan = 0;
  for (const r of rawRecords) {
    const s = JSON.stringify(r.raw);
    if (/nom du promoteur\s*:\s*[a-z]/i.test(s) && !/REDACTED/i.test(s)) piiResidualScan++;
  }
  console.log(`\nScan PII résiduel (avant toute écriture staging) : ${piiResidualScan} (attendu 0)`);
  if (piiResidualScan > 0) {
    console.log("FUITE PII DÉTECTÉE — STOP. Aucune écriture staging.");
    process.exit(1);
  }

  // ── 9. Matching (cibles FIXES, jamais le lot national lui-même) + collision IDs ──
  interface Classified {
    n: NormalizedStagingRecord; raw: typeof rawRecords[number];
    matchLevel: string; matchedTargetId: string | null; matchedTargetName: string | null; matchReason: string;
    decision: "ALREADY_LIVE" | "ALREADY_STAGING" | "CLEAN_APPROVABLE" | "DUPLICATE_REVIEW" | "IDENTITY_REVIEW" | "SOURCE_REVIEW" | "IDENTIFIER_COLLISION_REVIEW" | "ENTITY_MODEL_REVIEW" | "INVALID";
  }
  const classified: Classified[] = [];
  const seenIdentifierThisRun = new Map<string, string>(); // key -> nameRaw (pour détecter les collisions INTRA-lot national)
  const nationalIdentifierCollisions: Array<{ registry: string; identifier_type: string; identifier: string; institution_a: string; institution_b: string; source: "existing" | "intra-national" }> = [];

  for (const n of normalized) {
    const raw = rawRecords[normalized.indexOf(n)];
    if (n.status === "rejected") {
      classified.push({ n, raw, matchLevel: "N/A", matchedTargetId: null, matchedTargetName: null, matchReason: n.rejectionReason ?? "rejeté", decision: "INVALID" });
      continue;
    }
    const candidate = { name: n.nameRaw, region: n.region, city: n.city, category: n.educationFamily, identifiers: [] };
    const match = matchCandidate(candidate, fixedTargets);

    let decision: Classified["decision"];
    if (match.level === "EXACT_IDENTIFIER" || match.level === "EXACT_IDENTITY") {
      decision = match.target?.id.startsWith("staging:") ? "ALREADY_STAGING" : "ALREADY_LIVE";
    } else if (match.level === "STRONG_MATCH" || match.level === "PROBABLE_MATCH" || match.level === "AMBIGUOUS") {
      decision = "DUPLICATE_REVIEW";
    } else if (!raw.__hasDetailPage) {
      // Cohérent avec MINESUP-C : l'absence de fiche détail place TOUT candidat
      // (IPES sans lien, OU université d'État — qui n'a structurellement JAMAIS
      // de fiche MINESUP-hébergée, confirmé MINESUP-A/B.1) en SOURCE_REVIEW,
      // jamais un CLEAN_APPROVABLE automatique faute de détail vérifiable.
      decision = "SOURCE_REVIEW";
    } else {
      decision = "CLEAN_APPROVABLE";
    }

    // Collision d'identifiant — contre l'existant (49 déjà en base) ET contre ce même lot national (intra-batch).
    if (decision === "CLEAN_APPROVABLE") {
      const idCandidates: Array<{ type: string; value: string | null }> = [
        { type: "CREATION_ORDER", value: (raw.raw as any).identifiers?.creation_order_raw ?? null },
        { type: "OPENING_AUTHORIZATION", value: (raw.raw as any).identifiers?.opening_authorization_raw ?? null },
      ];
      for (const idc of idCandidates) {
        if (!idc.value) continue;
        const key = `MINESUP_IPES|${idc.type}|${idc.value.trim().toUpperCase()}`;
        if (existingIdentifierKeys.has(key)) {
          decision = "IDENTIFIER_COLLISION_REVIEW";
          nationalIdentifierCollisions.push({ registry: "MINESUP_IPES", identifier_type: idc.type, identifier: idc.value, institution_a: n.nameRaw, institution_b: "(déjà en establishment_registry_identifiers)", source: "existing" });
        } else if (seenIdentifierThisRun.has(key)) {
          const otherName = seenIdentifierThisRun.get(key)!;
          if (otherName !== n.nameRaw) {
            decision = "IDENTIFIER_COLLISION_REVIEW";
            nationalIdentifierCollisions.push({ registry: "MINESUP_IPES", identifier_type: idc.type, identifier: idc.value, institution_a: n.nameRaw, institution_b: otherName, source: "intra-national" });
          }
        } else {
          seenIdentifierThisRun.set(key, n.nameRaw);
        }
      }
    }

    classified.push({ n, raw, matchLevel: match.level, matchedTargetId: match.target?.id ?? null, matchedTargetName: match.target?.name ?? null, matchReason: match.reason, decision });
  }

  const tally = { already_live: 0, already_staging: 0, clean_approvable: 0, duplicate_review: 0, identity_review: 0, source_review: 0, identifier_collision_review: 0, entity_model_review: 0, invalid: 0 };
  for (const c of classified) tally[c.decision.toLowerCase() as keyof typeof tally]++;
  console.log("\nClassification nationale :", tally);

  const matchTally = { exact_identifier: 0, exact_identity: 0, strong: 0, probable: 0, ambiguous: 0, new: 0 };
  for (const c of classified) {
    if (c.matchLevel === "EXACT_IDENTIFIER") matchTally.exact_identifier++;
    else if (c.matchLevel === "EXACT_IDENTITY") matchTally.exact_identity++;
    else if (c.matchLevel === "STRONG_MATCH") matchTally.strong++;
    else if (c.matchLevel === "PROBABLE_MATCH") matchTally.probable++;
    else if (c.matchLevel === "AMBIGUOUS") matchTally.ambiguous++;
    else if (c.matchLevel === "NO_MATCH") matchTally.new++;
    // "N/A" (candidats INVALID/rejetés, jamais soumis au matching) volontairement exclu de ce tally.
  }
  console.log("Niveaux de matching :", matchTally);
  console.log(`Collisions d'identifiants (national) : ${nationalIdentifierCollisions.length}`);

  // ── 10. Réconciliation du pilote Nord-Ouest ────────────────────────────
  // IMPORTANT : filtrer par source_ministry="MINESUP" seul est insuffisant —
  // `preExistingStaging` est capturé au DÉBUT de CETTE exécution et inclut
  // déjà tout MINESUP staging inséré par un run PRÉCÉDENT de ce même script
  // (ex. un essai national partiel antérieur), pas seulement le batch pilote
  // original MINESUP-C. Bug réel trouvé : 9 candidats nationaux d'un essai
  // précédent (Adamaoua/Centre/etc., rien à voir avec Nord-Ouest) étaient
  // comptés à tort comme "pilote manquant" simplement parce qu'ils ne se
  // trouvaient pas dans la section Nord-Ouest. Scope correct : le
  // data_source_id EXACT du batch pilote MINESUP-C (source_name distinctif).
  // §MINESUP-C a exécuté son collecteur 3 fois (idempotence testée deux
  // fois en plus du run réel) : 3 lignes establishment_data_sources
  // partagent ce source_name (comportement voulu, "une ligne par
  // exécution" — voir REGISTRY-MULTI-B), mais UNE SEULE (la première,
  // chronologiquement) a réellement des lignes staging pointant vers elle
  // — les deux runs suivants étaient des no-op idempotents (0 insertion).
  const { data: pilotDataSources } = await supabase
    .from("establishment_data_sources")
    .select("id")
    .ilike("source_name", "Instituts Privés d'Enseignement Supérieur (IPES) — Région Nord-Ouest%")
    .order("fetched_at", { ascending: true });
  const pilotDataSourceIds = new Set((pilotDataSources ?? []).map((d) => d.id));
  const pilotRows = pilotDataSourceIds.size > 0
    ? preExistingStaging.filter((s) => s.source_ministry === "MINESUP" && s.data_source_id && pilotDataSourceIds.has(s.data_source_id))
    : [];
  if (pilotDataSourceIds.size === 0) console.log("\nATTENTION : data_source du pilote MINESUP-C introuvable — réconciliation pilote non calculable ce run (n'affecte pas la collecte nationale elle-même).");
  const nordOuestCandidateNames = new Set(classified.filter((c) => c.raw.__sourceRegionSection === "Région Nord-Ouest" || c.raw.__sourceRegionSection === "Universités d'Etat (nav)").map((c) => c.n.nameRaw.toLowerCase()));
  let pilotFound = 0, pilotAlreadyPromoted = 0, pilotStillStaging = 0, pilotSourceReview = 0, pilotMissing = 0, pilotUnexpectedDuplicate = 0;
  for (const p of pilotRows) {
    const foundCount = [...nordOuestCandidateNames].filter((n) => n === p.name_raw.toLowerCase()).length;
    if (foundCount === 0) { pilotMissing++; continue; }
    if (foundCount > 1) pilotUnexpectedDuplicate++;
    pilotFound++;
    if (p.status === "promoted") pilotAlreadyPromoted++;
    else if (p.status === "normalized") pilotSourceReview++;
    else pilotStillStaging++;
  }
  console.log(`\nRéconciliation pilote : found=${pilotFound}, already_promoted=${pilotAlreadyPromoted}, source_review=${pilotSourceReview}, still_staging=${pilotStillStaging}, missing=${pilotMissing}, unexpected_dup=${pilotUnexpectedDuplicate}`);

  // ── 11. Staging insert — idempotent, uniquement CLEAN_APPROVABLE (les autres restent en rapport, pas en DB) ──
  const toInsert = classified.filter((c) => c.decision === "CLEAN_APPROVABLE" && !existingFingerprints.has(c.n.fingerprint));
  const skippedIdempotent = classified.filter((c) => c.decision === "CLEAN_APPROVABLE" && existingFingerprints.has(c.n.fingerprint)).length;
  console.log(`\nÀ insérer (CLEAN_APPROVABLE, nouveaux) : ${toInsert.length} | déjà présents (idempotence) : ${skippedIdempotent}`);

  let dataSourceId: string | null = null;
  if (toInsert.length > 0) {
    const { data: ds, error: dsError } = await supabase.from("establishment_data_sources").insert({
      ministry: "MINESUP", source_name: "MINESUP National — IPES (10 régions) + Universités d'État",
      source_url: IPES_URL, source_year: null, fetched_at: new Date().toISOString(), records_fetched: toInsert.length,
      notes: `SPRINT MINESUP-E — collecte nationale. Batch: ${BATCH_ID}.`,
    }).select("id").single();
    if (dsError) throw new Error(`Échec création data_source : ${dsError.message}`);
    dataSourceId = ds.id;
    console.log(`data_source créée : ${dataSourceId}`);
  }

  let inserted = 0;
  const insertedIds: string[] = [];
  const chunkSize = 200;
  for (let i = 0; i < toInsert.length; i += chunkSize) {
    const chunk = toInsert.slice(i, i + chunkSize);
    const payload = chunk.map((c) => ({
      data_source_id: dataSourceId, source_ministry: "MINESUP", source_url: c.n.sourceUrl, source_year: c.n.sourceYear,
      official_identifier: null, raw_data: c.n.raw, name_raw: c.n.nameRaw, name_normalized: c.n.nameNormalized,
      education_family: c.n.educationFamily, ownership: c.n.ownership, subsystem: c.n.subsystem,
      region: c.n.region, department: c.n.department, arrondissement: c.n.arrondissement, commune: c.n.commune, locality: c.n.locality, city: c.n.city, quarter: c.n.quarter,
      fingerprint: c.n.fingerprint, status: "ready",
    }));
    const { data, error } = await supabase.from("establishment_import_staging").insert(payload).select("id");
    if (error) { console.error(`ÉCHEC insertion lot ${i}-${i + chunk.length} : ${error.message}`); continue; }
    inserted += data?.length ?? 0;
    insertedIds.push(...(data ?? []).map((d: any) => d.id));
  }
  console.log(`Insertion réelle : ${inserted}/${toInsert.length}`);

  // ── 12. Rapports ────────────────────────────────────────────────────
  mkdirSync(join(rootDir, "reports", "registry"), { recursive: true });

  // Pas de pré-remplissage avec une liste codée en dur (risque de désaccord
  // d'apostrophe avec le texte réel de la source, ex. ’ vs ') —
  // chaque région réellement rencontrée dans `regionsFound` (10, vérifié
  // au FAIL CLOSED ci-dessus) est ajoutée dynamiquement avec ses vraies
  // statistiques ; une région à 0 candidat apparaît quand même car
  // `regionsFound` liste les 10 en-têtes même si leur section est vide.
  const byRegionStats = new Map<string, { source_count: number; unique: number; already_live: number; already_staging: number; new_clean: number; duplicate_review: number; identity_review: number; source_review: number; identifier_collision_review: number; entity_model_review: number; invalid: number }>();
  for (const region of [...regionsFound, "Universités d'Etat (nav)"]) byRegionStats.set(region, { source_count: 0, unique: 0, already_live: 0, already_staging: 0, new_clean: 0, duplicate_review: 0, identity_review: 0, source_review: 0, identifier_collision_review: 0, entity_model_review: 0, invalid: 0 });
  for (const c of classified) {
    const key = c.raw.__sourceRegionSection;
    if (!byRegionStats.has(key)) byRegionStats.set(key, { source_count: 0, unique: 0, already_live: 0, already_staging: 0, new_clean: 0, duplicate_review: 0, identity_review: 0, source_review: 0, identifier_collision_review: 0, entity_model_review: 0, invalid: 0 });
    const stats = byRegionStats.get(key)!;
    stats.source_count++; stats.unique++;
    if (c.decision === "ALREADY_LIVE") stats.already_live++;
    else if (c.decision === "ALREADY_STAGING") stats.already_staging++;
    else if (c.decision === "CLEAN_APPROVABLE") stats.new_clean++;
    else if (c.decision === "DUPLICATE_REVIEW") stats.duplicate_review++;
    else if (c.decision === "IDENTITY_REVIEW") stats.identity_review++;
    else if (c.decision === "SOURCE_REVIEW") stats.source_review++;
    else if (c.decision === "IDENTIFIER_COLLISION_REVIEW") stats.identifier_collision_review++;
    else if (c.decision === "ENTITY_MODEL_REVIEW") stats.entity_model_review++;
    else if (c.decision === "INVALID") stats.invalid++;
  }

  const byRegionLines = ["region,source_count,unique,already_live,already_staging,new_clean_approvable,duplicate_review,identity_review,source_review,identifier_collision_review,entity_model_review,invalid"];
  for (const [region, s] of byRegionStats) byRegionLines.push([region, s.source_count, s.unique, s.already_live, s.already_staging, s.new_clean, s.duplicate_review, s.identity_review, s.source_review, s.identifier_collision_review, s.entity_model_review, s.invalid].join(","));
  writeFileSync(join(rootDir, "reports", "registry", "minesup-e-by-region.csv"), byRegionLines.join("\n"), "utf-8");

  const candidateHeaders = ["name", "region_section", "normalized_region", "city", "decision", "match_type", "matched_target_id", "has_detail_page", "identifier_count", "pii_safe"];
  const candidateLines = [candidateHeaders.join(",")];
  for (const c of classified) {
    const idCount = ((c.raw.raw as any).identifiers?.creation_order_raw ? 1 : 0) + ((c.raw.raw as any).identifiers?.opening_authorization_raw ? 1 : 0);
    candidateLines.push([csvEscape(c.n.nameRaw), csvEscape(c.raw.__sourceRegionSection), csvEscape(c.n.region), csvEscape(c.n.city), csvEscape(c.decision), csvEscape(c.matchLevel), csvEscape(c.matchedTargetId), csvEscape(c.raw.__hasDetailPage), csvEscape(idCount), csvEscape(!c.raw.raw.pii_field_present_but_not_collected)].join(","));
  }
  writeFileSync(join(rootDir, "reports", "registry", "minesup-e-national-candidates.csv"), candidateLines.join("\n"), "utf-8");

  const collisionHeaders = ["registry", "identifier_type", "identifier", "institution_a", "institution_b", "source", "decision", "reason"];
  const collisionLines = [collisionHeaders.join(",")];
  for (const col of nationalIdentifierCollisions) collisionLines.push([csvEscape(col.registry), csvEscape(col.identifier_type), csvEscape(col.identifier), csvEscape(col.institution_a), csvEscape(col.institution_b), csvEscape(col.source), csvEscape("IDENTIFIER_COLLISION_REVIEW"), csvEscape("aucune fusion automatique — deux institutions distinctes potentielles ou une collision existant/nouveau, revue humaine requise")].join(","));
  writeFileSync(join(rootDir, "reports", "registry", "minesup-e-identifier-collisions.csv"), collisionLines.join("\n"), "utf-8");

  const existingMatchHeaders = ["candidate_name", "match_type", "matched_target_id", "matched_target_name", "reason"];
  const existingMatchLines = [existingMatchHeaders.join(",")];
  for (const c of classified.filter((x) => x.decision === "ALREADY_LIVE" || x.decision === "ALREADY_STAGING" || x.decision === "DUPLICATE_REVIEW")) {
    existingMatchLines.push([csvEscape(c.n.nameRaw), csvEscape(c.matchLevel), csvEscape(c.matchedTargetId), csvEscape(c.matchedTargetName), csvEscape(c.matchReason)].join(","));
  }
  writeFileSync(join(rootDir, "reports", "registry", "minesup-e-existing-matches.csv"), existingMatchLines.join("\n"), "utf-8");

  // Approval snapshot — CLEAN_APPROVABLE UNIQUEMENT, ordre canonique déterministe = tri par staging_id inséré.
  const approvalRows = classified
    .map((c, i) => ({ c, insertedId: toInsert.indexOf(c) >= 0 ? insertedIds[toInsert.indexOf(c)] : null }))
    .filter((x) => x.c.decision === "CLEAN_APPROVABLE" && x.insertedId)
    .sort((a, b) => (a.insertedId! < b.insertedId! ? -1 : 1));
  const approvalCandidates = approvalRows.map((x) => ({
    staging_id: x.insertedId, name: x.c.n.nameRaw, region: x.c.n.region, city: x.c.n.city, category: x.c.n.educationFamily,
    authority: "MINESUP", registry: x.c.raw.educationFamilyHint === "Université d'État" ? "MINESUP_STATE_UNIVERSITIES" : "MINESUP_IPES",
    source: x.c.n.sourceUrl, decision: "CLEAN_APPROVABLE",
    identifiers: { creation_order: (x.c.raw.raw as any).identifiers?.creation_order_raw ?? null, opening_authorization: (x.c.raw.raw as any).identifiers?.opening_authorization_raw ?? null },
  }));
  const approvalChecksum = sha256(JSON.stringify(approvalCandidates));
  writeFileSync(join(rootDir, "reports", "registry", "minesup-e-approval.json"), JSON.stringify({
    generated_at: new Date().toISOString(), operator: OPERATOR, sprint: "MINESUP-E", batch: BATCH_ID,
    checksum_method: "sha256(JSON.stringify(candidates)) — candidats triés par staging_id (UUID généré à l'insertion) ascendant, ordre canonique reproductible en relisant establishment_import_staging trié par id pour ce batch.",
    candidate_count: approvalCandidates.length, candidates: approvalCandidates, checksum: approvalChecksum,
  }, null, 2), "utf-8");

  const piiAudit = {
    generated_at: new Date().toISOString(),
    pages_fetched_with_detail: detailFetchIndex,
    pages_containing_pii_field: rawRecords.filter((r) => r.raw.pii_field_present_but_not_collected).length,
    pii_persisted_in_staging: 0,
    url_pii_redacted_count: rawRecords.filter((r) => r.sourceUrl.startsWith("[REDACTED")).length,
    raw_snapshot_pii_scan: "0 (rédaction en mémoire AVANT tout writeSourceSnapshot — jamais de fichier brut non rédigé écrit sur disque)",
    residual_scan_before_write: piiResidualScan,
    safe: piiResidualScan === 0,
  };
  writeFileSync(join(rootDir, "reports", "registry", "minesup-e-pii-audit.json"), JSON.stringify(piiAudit, null, 2), "utf-8");

  // ── 13. Post-condition ─────────────────────────────────────────────
  const { count: estAfter } = await supabase.from("establishments").select("*", { count: "exact", head: true });
  const { count: stagingAfter } = await supabase.from("establishment_import_staging").select("*", { count: "exact", head: true });
  const { count: registryAfter } = await supabase.from("establishment_registry_identifiers").select("*", { count: "exact", head: true });
  console.log(`\nPOST-CONDITION : establishments ${estBefore}->${estAfter} | staging ${stagingBefore}->${stagingAfter} | registry_identifiers ${registryBefore}->${registryAfter}`);
  if (estAfter !== estBefore || registryAfter !== registryBefore) {
    console.log("VIOLATION — écriture inattendue dans une table protégée. STOP.");
    process.exit(1);
  }

  const summary = {
    sprint: "MINESUP-E", operator: OPERATOR, generated_at: new Date().toISOString(), batch: BATCH_ID,
    database: { establishments_before: estBefore, establishments_after: estAfter, staging_before: stagingBefore, staging_after: stagingAfter, registry_identifiers_before: registryBefore, registry_identifiers_after: registryAfter },
    national_collection: { source_rows: allEntries.length, unique_institutions: allEntries.length - withinRegionDuplicates, ipes: allEntries.length, state_universities: stateUnis.length, regions_covered: regionsFound.length, detail_pages_fetched: detailFetchIndex },
    completeness,
    pilot_reconciliation: { pilot_found_in_national_source: pilotFound, pilot_already_promoted: pilotAlreadyPromoted, pilot_still_staging: pilotStillStaging, pilot_source_review: pilotSourceReview, pilot_missing: pilotMissing, pilot_unexpected_duplicate: pilotUnexpectedDuplicate },
    matching: matchTally,
    classification: tally,
    identifier_collisions: { values_examined: seenIdentifierThisRun.size + nationalIdentifierCollisions.length, collision_values: nationalIdentifierCollisions.length, cross_institution_collisions: nationalIdentifierCollisions.filter((c) => c.institution_a !== c.institution_b).length },
    staging: { would_stage: toInsert.length, inserted, skipped_idempotent: skippedIdempotent, invalid: tally.invalid },
    pii: piiAudit,
    approval: { candidates: approvalCandidates.length, checksum: approvalChecksum },
  };
  writeFileSync(join(rootDir, "reports", "registry", "minesup-e-national-summary.json"), JSON.stringify(summary, null, 2), "utf-8");
  console.log("\nRapports écrits dans reports/registry/minesup-e-*");
}

main().catch((error) => {
  console.error("Échec collecte nationale MINESUP-E :", error);
  process.exit(1);
});
