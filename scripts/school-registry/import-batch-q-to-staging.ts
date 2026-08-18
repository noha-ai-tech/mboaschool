import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeName } from "./lib/normalize";
import { classifyLocality, type LocalityStatus } from "./lib/localityClassifier";
import type { NormalizedStagingRecord } from "./types";

/**
 * SPRINT Q — Import du Batch 003 (Sud, Est, Nord-Ouest, Sud-Ouest) vers
 * `establishment_import_staging`. Réutilise intégralement le pipeline
 * staging -> matching -> review de SPRINT P.2C (import-master-v1-to-staging.ts) :
 * mêmes 4 niveaux de rapprochement, même modèle de statut, aucune nouvelle
 * architecture. Différences uniquement dues à l'état réel de production
 * (migration 0018 appliquée depuis) :
 *   - LEVEL 1 (official_id) matche contre TOUS les établissements
 *     source_ministry='MINESEC' déjà live (1229 aujourd'hui : 673 Batch 002
 *     + 556 Master V1 promus SPRINT P.3/P.5), pas seulement les 673
 *     d'origine.
 *   - LEVEL 2-4 (nom+région+localité) restent limités aux 48 fiches
 *     antérieures au registre (source_ministry IS NULL) — jamais aux lignes
 *     déjà matriculées MINESEC.
 *
 * Opérateur de cette collecte : Jean Merlain (voir SPRINT Q §0 — jamais
 * inféré depuis git author / nom de session, toujours explicite).
 *
 * ÉCRIT dans establishment_data_sources / establishment_import_staging
 * UNIQUEMENT (autorisé SPRINT Q §17). N'ÉCRIT JAMAIS dans `establishments` —
 * une seule requête vers cette table, en lecture (fetchAllEstablishments).
 * Aucune promotion : la ligne staging créée reste status='ready' /
 * 'duplicate_exact' / 'duplicate_review', jamais 'promoted'.
 *
 * Idempotence : fingerprint (déjà géré par normalize.ts) contre TOUTES les
 * lignes staging existantes (1251 avant ce batch), + vérifie que la source
 * "MINESEC Batch 003" n'est créée qu'une seule fois.
 *
 * Usage :
 *   tsx import-batch-q-to-staging.ts --dry-run   (défaut)
 *   tsx import-batch-q-to-staging.ts --commit     (écrit staging uniquement)
 */

const OPERATOR = "jean-merlain";
const SOURCE_NAME = "MINESEC Batch 003 (Sud, Est, Nord-Ouest, Sud-Ouest)";
const SOURCE_URL = "https://www.minesec.gov.cm/web/index.php/fr/carte-scolaire/immatriculation-fr";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..", "..");

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

function matchKey(nameNormalized: string): string {
  return nameNormalized.replace(/^lyce\s+/, "").replace(/^lycee\s+/, "").trim();
}

function readEnvVar(env: string, key: string): string {
  const match = env.match(new RegExp(`^${key}=(.*)$`, "m"));
  const value = match?.[1]?.trim();
  if (!value) throw new Error(`${key} introuvable dans .env.local`);
  return value;
}

function csvEscape(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function findLatestNormalizedFile(): string {
  const dir = join(rootDir, "data", "registry", "normalized");
  const candidates = readdirSync(dir).filter((f) => f.startsWith("minesec-sud-est-anglophone-"));
  if (candidates.length === 0) throw new Error("Aucun fichier normalisé minesec-sud-est-anglophone-*.json trouvé — lancer collect-batch-003.ts d'abord.");
  candidates.sort();
  return join(dir, candidates[candidates.length - 1]);
}

type QRecord = NormalizedStagingRecord & {
  rawLocality: string | null;
  normalizedLocality: string | null;
  localityStatus: LocalityStatus;
};

interface LiveEstablishment {
  id: string;
  name: string;
  region: string | null;
  city: string | null;
  main_category: string | null;
  official_id: string | null;
  source_ministry: string | null;
}

type MatchType = "EXISTING_OFFICIAL_ID" | "EXISTING_LEGACY_CONFIRMED" | "EXISTING_PROBABLE" | "REVIEW_REQUIRED" | "NEW_CANDIDATE";

interface MatchResult {
  matchType: MatchType;
  duplicateOfId: string | null;
  duplicateOfName: string | null;
  matchReason: string;
  confidence: "high" | "medium" | "low" | "none";
}

function matchAgainstLegacy(r: QRecord, legacy: LiveEstablishment[]): MatchResult {
  const key = matchKey(r.nameNormalized);
  const rLocality = (r.locality ?? r.rawLocality ?? "").trim().toLowerCase();

  for (const c of legacy) {
    const cKey = matchKey(normalizeName(c.name));
    if (cKey.length === 0 || key.length === 0 || cKey !== key) continue;

    const cCity = (c.city ?? "").trim().toLowerCase();
    const geoCorroborated = Boolean(rLocality && cCity && rLocality === cCity);

    if (geoCorroborated) {
      return {
        matchType: "EXISTING_LEGACY_CONFIRMED",
        duplicateOfId: c.id,
        duplicateOfName: c.name,
        matchReason: `nom normalisé identique + région (${r.region}) + localité/ville corroborée ("${rLocality}" = "${cCity}")`,
        confidence: "high",
      };
    }
    return {
      matchType: "EXISTING_PROBABLE",
      duplicateOfId: c.id,
      duplicateOfName: c.name,
      matchReason: `nom normalisé identique + région (${r.region}), mais localité non corroborable (Batch Q: "${rLocality || "absente"}", production: "${cCity || "absente"}") — le nom seul n'est jamais une preuve suffisante`,
      confidence: "medium",
    };
  }

  for (const c of legacy) {
    const cKey = matchKey(normalizeName(c.name));
    if (key.length < 4 || cKey.length === 0) continue;
    if (cKey.includes(key) || key.includes(cKey)) {
      return {
        matchType: "REVIEW_REQUIRED",
        duplicateOfId: c.id,
        duplicateOfName: c.name,
        matchReason: `correspondance floue (sous-chaîne) + région (${r.region}) — ambiguë, jamais fusionnée automatiquement`,
        confidence: "low",
      };
    }
  }

  return { matchType: "NEW_CANDIDATE", duplicateOfId: null, duplicateOfName: null, matchReason: "aucune correspondance production trouvée", confidence: "none" };
}

async function main() {
  const args = process.argv.slice(2);
  const commit = args.includes("--commit");

  const env = readFileSync(join(rootDir, ".env.local"), "utf-8");
  const url = readEnvVar(env, "NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = readEnvVar(env, "SUPABASE_SERVICE_ROLE_KEY");

  const normalizedPath = findLatestNormalizedFile();
  const batchRaw: NormalizedStagingRecord[] = JSON.parse(readFileSync(normalizedPath, "utf-8"));
  console.log(`Fichier source : ${normalizedPath} (${batchRaw.length} ligne(s))`);

  const batch: QRecord[] = batchRaw.map((r) => {
    const rawLocality = r.locality ?? null;
    return { ...r, rawLocality, normalizedLocality: rawLocality, localityStatus: classifyLocality(rawLocality) };
  });

  async function fetchAllEstablishments(): Promise<LiveEstablishment[]> {
    const all: LiveEstablishment[] = [];
    const pageSize = 1000;
    let offset = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const res = await fetch(
        `${url}/rest/v1/establishments?select=id,name,region,city,main_category,official_id,source_ministry&limit=${pageSize}&offset=${offset}`,
        { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
      );
      if (!res.ok) throw new Error(`Lecture establishments -> HTTP ${res.status}`);
      const page: LiveEstablishment[] = await res.json();
      all.push(...page);
      if (page.length < pageSize) break;
      offset += pageSize;
    }
    return all;
  }
  const liveBefore = await fetchAllEstablishments();

  const minesecByOfficialId = new Map<string, LiveEstablishment>();
  const legacyByRegion = new Map<string, LiveEstablishment[]>();
  for (const e of liveBefore) {
    if (e.source_ministry === "MINESEC" && e.official_id) {
      minesecByOfficialId.set(e.official_id.trim().toUpperCase(), e);
    } else if (!e.source_ministry) {
      const key = stripAccents(e.region ?? "");
      if (!legacyByRegion.has(key)) legacyByRegion.set(key, []);
      legacyByRegion.get(key)!.push(e);
    }
  }
  console.log(`Établissements live : ${liveBefore.length} (MINESEC matriculés : ${minesecByOfficialId.size}, legacy non tracés : ${[...legacyByRegion.values()].reduce((a, v) => a + v.length, 0)})`);

  async function fetchAllFingerprints(): Promise<Set<string>> {
    const all = new Set<string>();
    const pageSize = 1000;
    let offset = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const res = await fetch(
        `${url}/rest/v1/establishment_import_staging?select=fingerprint&limit=${pageSize}&offset=${offset}`,
        { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
      );
      if (!res.ok) throw new Error(`Lecture establishment_import_staging -> HTTP ${res.status}`);
      const page: { fingerprint: string }[] = await res.json();
      for (const r of page) all.add(r.fingerprint);
      if (page.length < pageSize) break;
      offset += pageSize;
    }
    return all;
  }

  const [existingFingerprints, existingSourceRes, stagingCountRes] = await Promise.all([
    fetchAllFingerprints(),
    fetch(`${url}/rest/v1/establishment_data_sources?select=id,source_name&source_name=eq.${encodeURIComponent(SOURCE_NAME)}`, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    }),
    fetch(`${url}/rest/v1/establishment_import_staging?select=id`, { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, Prefer: "count=exact" } }),
  ]);
  if (!existingSourceRes.ok) throw new Error(`Lecture establishment_data_sources -> HTTP ${existingSourceRes.status}`);
  const existingSources: { id: string; source_name: string }[] = await existingSourceRes.json();
  const stagingBefore = existingFingerprints.size;
  void stagingCountRes;

  interface Classified {
    r: QRecord;
    match: MatchResult;
    reviewFlags: string[];
  }
  const classified: Classified[] = [];

  for (const r of batch) {
    if (r.status === "rejected") {
      classified.push({ r, match: { matchType: "NEW_CANDIDATE", duplicateOfId: null, duplicateOfName: null, matchReason: "rejeté à la normalisation", confidence: "none" }, reviewFlags: ["rejected_at_normalization"] });
      continue;
    }
    if (r.status === "duplicate_exact" || r.status === "duplicate_review") {
      // Doublon intra-batch déjà détecté par deduplicateBatch — pas de rematching production nécessaire,
      // évite de compter deux fois le même établissement contre production.
      classified.push({ r, match: { matchType: "NEW_CANDIDATE", duplicateOfId: null, duplicateOfName: null, matchReason: `doublon intra-batch (${r.status})`, confidence: "none" }, reviewFlags: [`intra_batch_${r.status}`] });
      continue;
    }

    const officialId = r.officialIdentifier?.trim().toUpperCase() ?? "";
    const officialHit = officialId ? minesecByOfficialId.get(officialId) : undefined;

    let match: MatchResult;
    if (officialHit) {
      match = {
        matchType: "EXISTING_OFFICIAL_ID",
        duplicateOfId: officialHit.id,
        duplicateOfName: officialHit.name,
        matchReason: `official_id exact (${r.officialIdentifier}) contre establishments.source_ministry=MINESEC`,
        confidence: "high",
      };
    } else {
      const legacyCandidates = legacyByRegion.get(stripAccents(r.region ?? "")) ?? [];
      match = matchAgainstLegacy(r, legacyCandidates);
    }

    const reviewFlags: string[] = [];
    if (match.matchType === "REVIEW_REQUIRED") reviewFlags.push("ambiguous_match");
    if (r.localityStatus === "CLEARLY_INVALID") reviewFlags.push("locality_clearly_invalid");
    if (r.localityStatus === "NEEDS_REVIEW") reviewFlags.push("locality_needs_review");
    if (r.localityStatus === "POSSIBLE_REAL_LOCALITY") reviewFlags.push("locality_possible_real");
    if (r.localityStatus === "MISSING") reviewFlags.push("locality_missing");

    classified.push({ r, match, reviewFlags });
  }

  const counts = { EXISTING_OFFICIAL_ID: 0, EXISTING_LEGACY_CONFIRMED: 0, EXISTING_PROBABLE: 0, REVIEW_REQUIRED: 0, NEW_CANDIDATE: 0 };
  for (const c of classified) counts[c.match.matchType]++;

  const rejectedIntraBatch = batch.filter((r) => r.status === "rejected").length;
  const duplicateIntraBatch = batch.filter((r) => r.status === "duplicate_exact" || r.status === "duplicate_review").length;
  const eligibleForProdMatch = batch.length - rejectedIntraBatch - duplicateIntraBatch;

  function isCleanNewCandidate(c: Classified): boolean {
    return (
      Boolean(c.r.officialIdentifier) &&
      Boolean(c.r.nameRaw) &&
      Boolean(c.r.region) &&
      Boolean(c.r.educationFamily) &&
      c.r.localityStatus !== "CLEARLY_INVALID" &&
      c.r.localityStatus !== "NEEDS_REVIEW"
    );
  }

  const newCandidates = classified.filter((c) => c.match.matchType === "NEW_CANDIDATE" && c.r.status === "ready");
  const cleanNewCandidates = newCandidates.filter(isCleanNewCandidate).length;
  const reviewRequiredNewCandidates = newCandidates.length - cleanNewCandidates;

  const byRegionCount: Record<string, { raw: number; newCandidates: number; officialIds: number }> = {};
  for (const c of classified) {
    const region = c.r.region ?? "(région inconnue)";
    byRegionCount[region] ??= { raw: 0, newCandidates: 0, officialIds: 0 };
    byRegionCount[region].raw++;
    if (c.r.officialIdentifier) byRegionCount[region].officialIds++;
    if (c.match.matchType === "NEW_CANDIDATE" && c.r.status === "ready") byRegionCount[region].newCandidates++;
  }

  console.log("\n=== DRY RUN — import-batch-q-to-staging.ts (opérateur: jean-merlain) ===");
  console.log(`Batch Q rows: ${batch.length} (rejetées normalisation: ${rejectedIntraBatch}, doublons intra-batch: ${duplicateIntraBatch}, comparées à production: ${eligibleForProdMatch})`);
  console.log(`Official ID exact matches: ${counts.EXISTING_OFFICIAL_ID}`);
  console.log(`Legacy confirmed matches: ${counts.EXISTING_LEGACY_CONFIRMED}`);
  console.log(`Probable matches: ${counts.EXISTING_PROBABLE}`);
  console.log(`Ambiguous matches: ${counts.REVIEW_REQUIRED}`);
  console.log(`New candidates: ${newCandidates.length} (clean: ${cleanNewCandidates}, review required: ${reviewRequiredNewCandidates})`);
  console.log(`Par région:`, byRegionCount);

  const wouldSkipIdempotent = batch.filter((r) => existingFingerprints.has(r.fingerprint)).length;
  const wouldInsert = batch.length - wouldSkipIdempotent - rejectedIntraBatch;
  console.log(`Would insert staging: ${wouldInsert} (déjà en staging via fingerprint: ${wouldSkipIdempotent})`);
  console.log(`Would touch establishments: 0`);

  const sourceExists = existingSources.length > 0;
  console.log(`Source déjà existante ("${SOURCE_NAME}") : ${sourceExists ? "OUI" : "NON — sera créée au commit"}`);

  mkdirSync(join(rootDir, "reports", "registry"), { recursive: true });

  const dedupCsv = [
    "official_id,official_name,region,locality,status,duplicate_of_establishment_id,match_type,match_reason",
    ...classified.map((c) =>
      [c.r.officialIdentifier, c.r.nameRaw, c.r.region, c.r.locality ?? c.r.rawLocality ?? "", c.r.status, c.match.duplicateOfId ?? "", c.match.matchType, c.match.matchReason]
        .map(csvEscape)
        .join(",")
    ),
  ].join("\n");
  writeFileSync(join(rootDir, "reports", "registry", "batch-q-dedup.csv"), dedupCsv, "utf-8");

  const localityReviewRows = classified.filter((c) => c.r.localityStatus === "CLEARLY_INVALID" || c.r.localityStatus === "NEEDS_REVIEW" || c.r.localityStatus === "POSSIBLE_REAL_LOCALITY");
  const localityCsv = [
    "official_id,official_name,region,raw_locality,locality_status",
    ...localityReviewRows.map((c) => [c.r.officialIdentifier, c.r.nameRaw, c.r.region, c.r.rawLocality ?? "", c.r.localityStatus].map(csvEscape).join(",")),
  ].join("\n");
  writeFileSync(join(rootDir, "reports", "registry", "batch-q-locality-review.csv"), localityCsv, "utf-8");

  console.log(`\nRapports écrits : batch-q-dedup.csv (${classified.length} lignes), batch-q-locality-review.csv (${localityReviewRows.length} lignes)`);

  const dryRunSummary = {
    operator: OPERATOR,
    approved_by: null,
    git_author: null,
    timestamp: new Date().toISOString(),
    source_name: SOURCE_NAME,
    batch_rows: batch.length,
    rejected_at_normalization: rejectedIntraBatch,
    duplicate_intra_batch: duplicateIntraBatch,
    counts,
    new_candidates: newCandidates.length,
    clean_new_candidates: cleanNewCandidates,
    review_required_new_candidates: reviewRequiredNewCandidates,
    by_region: byRegionCount,
    would_insert: wouldInsert,
    would_skip_idempotent: wouldSkipIdempotent,
    would_touch_establishments: 0,
    establishments_live_count: liveBefore.length,
    staging_count_before: stagingBefore,
  };
  writeFileSync(join(rootDir, "reports", "registry", "batch-q-summary.json"), JSON.stringify(dryRunSummary, null, 2), "utf-8");
  console.log(`Rapport écrit : reports/registry/batch-q-summary.json`);

  if (!commit) {
    console.log("\nAUCUNE écriture effectuée (dry-run). Relancer avec --commit pour écrire dans establishment_data_sources / establishment_import_staging.");
    return;
  }

  let dataSourceId: string;
  if (sourceExists) {
    dataSourceId = existingSources[0].id;
  } else {
    const sourceRes = await fetch(`${url}/rest/v1/establishment_data_sources`, {
      method: "POST",
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify([
        {
          ministry: "MINESEC",
          source_name: SOURCE_NAME,
          source_url: SOURCE_URL,
          records_fetched: batch.length,
          notes: `SPRINT Q — collecte Sud, Est, Nord-Ouest, Sud-Ouest. Opérateur : ${OPERATOR} (déclaré explicitement, jamais inféré depuis git author/session). Complète la couverture nationale MINESEC (10/10 régions).`,
        },
      ]),
    });
    if (!sourceRes.ok) throw new Error(`Création data_source -> HTTP ${sourceRes.status} — ${await sourceRes.text()}`);
    [{ id: dataSourceId }] = await sourceRes.json();
  }

  type StagingRow = Record<string, unknown>;
  const rowsToInsert: StagingRow[] = [];
  let skippedAlreadyStaged = 0;
  let skippedRejected = 0;

  for (const c of classified) {
    const r = c.r;
    if (r.status === "rejected") { skippedRejected++; continue; }
    if (existingFingerprints.has(r.fingerprint)) { skippedAlreadyStaged++; continue; }

    const stagingStatus =
      r.status === "duplicate_exact" || r.status === "duplicate_review"
        ? r.status
        : c.match.matchType === "EXISTING_OFFICIAL_ID" || c.match.matchType === "EXISTING_LEGACY_CONFIRMED"
          ? "duplicate_exact"
          : c.match.matchType === "EXISTING_PROBABLE" || c.match.matchType === "REVIEW_REQUIRED"
            ? "duplicate_review"
            : "ready";

    rowsToInsert.push({
      data_source_id: dataSourceId,
      source_ministry: r.sourceMinistry,
      source_url: r.sourceUrl,
      source_year: r.sourceYear,
      official_identifier: r.officialIdentifier,
      raw_data: {
        ...r.raw,
        _operator: OPERATOR,
        _localityAudit: { rawLocality: r.rawLocality, normalizedLocality: r.normalizedLocality, localityStatus: r.localityStatus },
        _matchAudit: { matchType: c.match.matchType, matchReason: c.match.matchReason, confidence: c.match.confidence, reviewFlags: c.reviewFlags },
      },
      name_raw: r.nameRaw,
      name_normalized: r.nameNormalized,
      education_family: r.educationFamily,
      ownership: r.ownership,
      subsystem: r.subsystem,
      region: r.region,
      department: r.department,
      arrondissement: r.arrondissement,
      commune: r.commune,
      locality: r.locality,
      city: r.city,
      quarter: r.quarter,
      fingerprint: r.fingerprint,
      duplicate_of_establishment_id: c.match.duplicateOfId,
      status: stagingStatus,
    });
  }

  console.log(`\n${rowsToInsert.length} ligne(s) à insérer — ${skippedAlreadyStaged} déjà présente(s) (idempotence), ${skippedRejected} rejetée(s) à la normalisation.`);

  const CHUNK = 200;
  let inserted = 0;
  let failed = 0;
  for (let i = 0; i < rowsToInsert.length; i += CHUNK) {
    const chunk = rowsToInsert.slice(i, i + CHUNK);
    const res = await fetch(`${url}/rest/v1/establishment_import_staging`, {
      method: "POST",
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify(chunk),
    });
    if (res.ok) {
      inserted += chunk.length;
      console.log(`  Lot ${i}-${i + chunk.length}: OK (${chunk.length} ligne(s))`);
    } else {
      failed += chunk.length;
      console.error(`  Lot ${i}-${i + chunk.length}: ÉCHEC HTTP ${res.status} — ${(await res.text()).slice(0, 300)}`);
    }
  }

  console.log(`\nTerminé — ${inserted} ligne(s) insérée(s), ${failed} échouée(s), ${skippedAlreadyStaged} ignorée(s) (idempotence), ${skippedRejected} rejetée(s).`);

  const liveAfter = await fetchAllEstablishments();
  console.log(`\nVérification post-écriture — establishments avant: ${liveBefore.length}, après: ${liveAfter.length} (attendu : identique).`);
  if (liveAfter.length !== liveBefore.length) {
    console.error("ALERTE — establishments a changé pendant un run censé n'écrire QUE dans staging. Investiguer immédiatement.");
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("Échec de l'import Batch Q :", error);
  process.exit(1);
});
