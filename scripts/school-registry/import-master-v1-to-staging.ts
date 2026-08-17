import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeName } from "./lib/normalize";
import type { NormalizedStagingRecord } from "./types";

/** Lignes de data/registry/master/minesec-master-v1-clean.json (SPRINT P.2A
 *  §16) — NormalizedStagingRecord + le statut de localité par ligne, qui
 *  n'existe pas comme colonne dédiée sur establishment_import_staging
 *  (migration 0006). Conservé dans raw_data (jsonb, déjà prévu pour capturer
 *  toute donnée source) plutôt que perdu — voir SPRINT P.2B §14. */
type CleanRecord = NormalizedStagingRecord & {
  rawLocality: string | null;
  normalizedLocality: string | null;
  localityStatus: "VALID" | "MISSING" | "CLEARLY_INVALID" | "POSSIBLE_REAL_LOCALITY" | "NEEDS_REVIEW";
};

/**
 * SPRINT P.2C — Import du dataset MINESEC Master V1 vers
 * `establishment_import_staging`, avec rapprochement complet contre la
 * production (matricules structurés Batch 002 + les 48 fiches antérieures
 * au registre).
 *
 * ÉCRIT dans establishment_data_sources / establishment_import_staging
 * (autorisé par SPRINT P.2C). N'ÉCRIT JAMAIS dans `establishments` — vérifié
 * statiquement (une seule requête `establishments`, en lecture, ligne ~140).
 *
 * Matching en 4 niveaux (jamais de fusion automatique, jamais de promotion) :
 *   LEVEL 1 — source_ministry='MINESEC' + official_id exact (contre les 673
 *             Batch 002 déjà structurés en production).
 *   LEVEL 2 — nom normalisé + région exacte, ET localité/ville corroborée
 *             des deux côtés -> LEGACY_EXACT_NAME_GEO (confiance haute).
 *   LEVEL 3 — nom normalisé + région exacte, SANS corroboration de localité
 *             (absente d'un côté ou des deux) -> LEGACY_PROBABLE. Le nom seul
 *             n'est jamais une preuve suffisante (voir §11 — cas Lycée
 *             Général Leclerc, traité par cette règle générale, pas par une
 *             exception câblée en dur).
 *   LEVEL 4 — candidat flou (sous-chaîne) + région exacte -> LEGACY_AMBIGUOUS.
 * Les niveaux 2-4 ne sont évalués QUE contre les 48 établissements antérieurs
 * au registre (source_ministry IS NULL) — jamais contre les 673 Batch 002,
 * dont le rapprochement passe exclusivement par le matricule (LEVEL 1).
 *
 * Classification par ligne Master (calculée, pas stockée comme nouvelle
 * colonne — réutilise le statut existant `registry_staging_status` de la
 * migration 0006, voir §12) :
 *   EXISTING_OFFICIAL_ID      -> status=duplicate_exact
 *   EXISTING_LEGACY_CONFIRMED -> status=duplicate_exact
 *   EXISTING_PROBABLE         -> status=duplicate_review
 *   REVIEW_REQUIRED (ambigu)  -> status=duplicate_review
 *   NEW_CANDIDATE             -> status=ready
 * `duplicate_of_establishment_id` est renseigné pour les 4 premiers cas —
 * cela signifie "correspond probablement/définitivement à cette fiche",
 * jamais "promu".
 *
 * Idempotence : fingerprint (déjà géré par normalize.ts) + vérification que
 * la source "MINESEC Master V1" n'est créée qu'une seule fois.
 *
 * Usage :
 *   tsx import-master-v1-to-staging.ts --dry-run   (défaut)
 *   tsx import-master-v1-to-staging.ts --commit     (écrit réellement)
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..", "..");

const SOURCE_NAME = "MINESEC Master V1 (consolidation Batch 001 + Batch 002)";
const SOURCE_URL = "https://www.minesec.gov.cm/web/index.php/fr/carte-scolaire/immatriculation-fr";

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

interface LiveEstablishment {
  id: string;
  name: string;
  region: string | null;
  city: string | null;
  main_category: string | null;
  official_id: string | null;
  source_ministry: string | null;
}

type MatchType =
  | "EXISTING_OFFICIAL_ID"
  | "EXISTING_LEGACY_CONFIRMED"
  | "EXISTING_PROBABLE"
  | "REVIEW_REQUIRED"
  | "NEW_CANDIDATE";

interface MatchResult {
  matchType: MatchType;
  duplicateOfId: string | null;
  duplicateOfName: string | null;
  matchReason: string;
  confidence: "high" | "medium" | "low" | "none";
}

function matchAgainstLegacy(r: CleanRecord, legacy: LiveEstablishment[]): MatchResult {
  const key = matchKey(r.nameNormalized);
  const rLocality = (r.locality ?? r.rawLocality ?? "").trim().toLowerCase();

  // LEVEL 2/3 — nom exact + région exacte, avec ou sans corroboration localité
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
      matchReason: `nom normalisé identique + région (${r.region}), mais localité non corroborable (Master: "${rLocality || "absente"}", production: "${cCity || "absente"}") — le nom seul n'est jamais une preuve suffisante`,
      confidence: "medium",
    };
  }

  // LEVEL 4 — candidat flou (sous-chaîne) dans la même région
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

  // SPRINT P.2B §14-15 / P.2C §5 : source = dataset "clean", snapshot maître jamais modifié.
  const master: CleanRecord[] = JSON.parse(
    readFileSync(join(rootDir, "data", "registry", "master", "minesec-master-v1-clean.json"), "utf-8")
  );

  // ── Lecture establishments (SEULES requêtes vers cette table — SELECT
  // uniquement, §14-15). Paginée par précaution : 721 lignes aujourd'hui,
  // sous le plafond PostgREST de 1000, mais silencieusement tronquée dès que
  // ce nombre est dépassé si on ne pagine pas (bug réel rencontré sur le
  // staging, voir plus bas) — mieux vaut la corriger ici avant qu'elle ne se
  // reproduise. ──
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
  const live = await fetchAllEstablishments();

  const batch002ByOfficialId = new Map<string, LiveEstablishment>();
  const legacyByRegion = new Map<string, LiveEstablishment[]>();
  for (const e of live) {
    if (e.source_ministry === "MINESEC" && e.official_id) {
      batch002ByOfficialId.set(e.official_id.trim().toUpperCase(), e);
    } else {
      const key = stripAccents(e.region ?? "");
      if (!legacyByRegion.has(key)) legacyByRegion.set(key, []);
      legacyByRegion.get(key)!.push(e);
    }
  }

  // ── Hard invariant §9 : les 673 Batch 002 doivent être retrouvables via official_id ──
  const batch002LiveCount = live.filter((e) => e.source_ministry === "MINESEC").length;
  const masterOfficialIds = new Set(master.map((r) => r.officialIdentifier?.trim().toUpperCase()).filter(Boolean));
  let batch002Matched = 0;
  for (const [id] of batch002ByOfficialId) if (masterOfficialIds.has(id)) batch002Matched++;
  if (batch002LiveCount !== 673 || batch002Matched !== 673) {
    console.error(`HARD INVARIANT FAILED — Batch 002 en prod: ${batch002LiveCount}, matchés contre Master: ${batch002Matched} (attendu 673/673).`);
    console.error("STOP — ne pas importer avant d'expliquer l'écart.");
    process.exit(1);
  }
  console.log(`✔ Hard invariant §9 : ${batch002Matched}/673 Batch 002 retrouvés via official_id.`);

  // ── Idempotence : fingerprints déjà en staging + source déjà créée ──────
  // PostgREST plafonne les réponses à 1000 lignes par défaut (db-max-rows) —
  // un fetch simple sur une table qui dépasse ce seuil (staging = 1251 après
  // le premier import) sous-compte silencieusement les fingerprints déjà
  // présents et casse l'idempotence (bug réel détecté par le second dry-run
  // de SPRINT P.2C §34 — corrigé ici par pagination explicite).
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

  const [existingFingerprints, existingSourceRes] = await Promise.all([
    fetchAllFingerprints(),
    fetch(`${url}/rest/v1/establishment_data_sources?select=id,source_name&source_name=eq.${encodeURIComponent(SOURCE_NAME)}`, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    }),
  ]);
  if (!existingSourceRes.ok) throw new Error(`Lecture establishment_data_sources -> HTTP ${existingSourceRes.status}`);
  const existingSources: { id: string; source_name: string }[] = await existingSourceRes.json();

  // ── Matching complet, ligne par ligne ────────────────────────────────────
  interface Classified {
    r: CleanRecord;
    match: MatchResult;
    reviewFlags: string[];
  }
  const classified: Classified[] = [];

  for (const r of master) {
    const officialId = r.officialIdentifier?.trim().toUpperCase() ?? "";
    const batch002Hit = officialId ? batch002ByOfficialId.get(officialId) : undefined;

    let match: MatchResult;
    if (batch002Hit) {
      match = {
        matchType: "EXISTING_OFFICIAL_ID",
        duplicateOfId: batch002Hit.id,
        duplicateOfName: batch002Hit.name,
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

  // ── §11 : Lycée Général Leclerc — vérification nommée explicitement ──────
  const leclercRow = classified.find((c) => matchKey(c.r.nameNormalized) === "general leclerc");
  if (leclercRow) {
    const verdict = leclercRow.match.matchType === "EXISTING_LEGACY_CONFIRMED" ? "CONFIRMED_LEGACY_MATCH" : "REVIEW_REQUIRED";
    console.log(`\n§11 Lycée Général Leclerc : ${verdict}`);
    console.log(`  Nom Master: "${leclercRow.r.nameRaw}" | région: ${leclercRow.r.region} | localité Master: "${leclercRow.r.locality ?? leclercRow.r.rawLocality ?? "absente"}"`);
    if (leclercRow.match.duplicateOfName) {
      console.log(`  Candidat production: "${leclercRow.match.duplicateOfName}" | raison: ${leclercRow.match.matchReason}`);
    }
    console.log(`  Justification : ${leclercRow.match.matchType === "EXISTING_LEGACY_CONFIRMED" ? "nom + région + localité tous corroborés" : "nom + région concordants, mais aucune localité Master disponible pour corroborer contre la fiche production — le nom seul n'étant jamais suffisant (§11), classé REVIEW_REQUIRED malgré la forte similarité de nom."}`);
  } else {
    console.log("\n§11 Lycée Général Leclerc : aucune ligne Master ne correspond à ce nom (matchKey 'general leclerc') — rien à examiner.");
  }

  // ── Consistency check §23 : la somme doit expliquer exactement 1251 ─────
  const counts = {
    EXISTING_OFFICIAL_ID: 0,
    EXISTING_LEGACY_CONFIRMED: 0,
    EXISTING_PROBABLE: 0,
    REVIEW_REQUIRED: 0,
    NEW_CANDIDATE: 0,
  };
  for (const c of classified) counts[c.match.matchType]++;
  const sum = Object.values(counts).reduce((a, b) => a + b, 0);
  if (sum !== master.length) {
    console.error(`CONSISTENCY CHECK FAILED — somme des classifications (${sum}) != lignes Master (${master.length}). STOP.`);
    process.exit(1);
  }

  // ── §36 : nouveaux candidats par région ──────────────────────────────────
  const newByRegion: Record<string, number> = {};
  for (const c of classified) {
    if (c.match.matchType !== "NEW_CANDIDATE") continue;
    const region = c.r.region ?? "(région inconnue)";
    newByRegion[region] = (newByRegion[region] ?? 0) + 1;
  }

  // ── §25 : CLEAN vs REVIEW_REQUIRED parmi les nouveaux candidats ──────────
  // Un candidat est CLEAN s'il a official_id + nom + région + catégorie +
  // source fiable + aucun match de doublon — l'absence de localité seule ne
  // le disqualifie pas. Seules les localités CLEARLY_INVALID/NEEDS_REVIEW
  // (un vrai signal de qualité de donnée, pas une simple absence) déclenchent
  // review_required parmi les nouveaux candidats.
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

  const newCandidates = classified.filter((c) => c.match.matchType === "NEW_CANDIDATE");
  const cleanNewCandidates = newCandidates.filter(isCleanNewCandidate).length;
  const reviewRequiredNewCandidates = newCandidates.length - cleanNewCandidates;

  // ── §37 : ventilation des flags de revue (non additifs, peuvent se recouper) ──
  const flagCounts = {
    probableExistingMatches: counts.EXISTING_PROBABLE,
    ambiguousExistingMatches: counts.REVIEW_REQUIRED,
    clearlyInvalidLocality: classified.filter((c) => c.r.localityStatus === "CLEARLY_INVALID").length,
    possibleRealLocality: classified.filter((c) => c.r.localityStatus === "POSSIBLE_REAL_LOCALITY").length,
    needsReviewLocality: classified.filter((c) => c.r.localityStatus === "NEEDS_REVIEW").length,
    missingLocality: classified.filter((c) => c.r.localityStatus === "MISSING").length,
  };

  console.log("\n=== DRY RUN — import-master-v1-to-staging.ts ===");
  console.log(`Master rows: ${master.length}`);
  console.log(`Official ID exact matches: ${counts.EXISTING_OFFICIAL_ID}`);
  console.log(`Legacy confirmed matches: ${counts.EXISTING_LEGACY_CONFIRMED}`);
  console.log(`Probable matches: ${counts.EXISTING_PROBABLE}`);
  console.log(`Ambiguous matches: ${counts.REVIEW_REQUIRED}`);
  console.log(`New candidates: ${counts.NEW_CANDIDATE} (clean: ${cleanNewCandidates}, review required: ${reviewRequiredNewCandidates})`);
  console.log(`Locality review flags: invalid=${flagCounts.clearlyInvalidLocality}, needs_review=${flagCounts.needsReviewLocality}, possible_real=${flagCounts.possibleRealLocality}, missing=${flagCounts.missingLocality}`);
  console.log(`Invalid rows (rejected at normalization): ${master.filter((r) => r.status === "rejected").length}`);
  console.log(`Sum check: ${sum} / ${master.length} — ${sum === master.length ? "OK" : "MISMATCH"}`);

  const wouldSkipIdempotent = master.filter((r) => existingFingerprints.has(r.fingerprint)).length;
  const wouldInsert = master.length - wouldSkipIdempotent - master.filter((r) => r.status === "rejected").length;
  console.log(`Would insert staging: ${wouldInsert}`);
  console.log(`Would update staging: 0 (ce script n'UPDATE jamais une ligne staging existante — nouvel insert ou skip uniquement)`);
  console.log(`Would touch establishments: 0`);

  const sourceExists = existingSources.length > 0;
  console.log(`Source déjà existante ("${SOURCE_NAME}") : ${sourceExists ? "OUI — aucune nouvelle source ne sera créée" : "NON — une source sera créée au commit"}`);

  // ── Rapports humains (§24) — toujours écrits, dry-run ou commit ─────────
  mkdirSync(join(rootDir, "reports", "registry"), { recursive: true });

  const probableReviewRows = classified.filter((c) =>
    c.match.matchType === "EXISTING_PROBABLE" || c.match.matchType === "REVIEW_REQUIRED"
  );
  const probableReviewCsv = [
    "official_id,official_name,region,locality,existing_id,existing_name,match_type,match_reason,confidence,review_status",
    ...probableReviewRows.map((c) =>
      [
        c.r.officialIdentifier,
        c.r.nameRaw,
        c.r.region,
        c.r.locality ?? c.r.rawLocality ?? "",
        c.match.duplicateOfId,
        c.match.duplicateOfName,
        c.match.matchType,
        c.match.matchReason,
        c.match.confidence,
        "pending_human_review",
      ]
        .map(csvEscape)
        .join(",")
    ),
  ].join("\n");
  writeFileSync(join(rootDir, "reports", "registry", "staging-existing-probable-review.csv"), probableReviewCsv, "utf-8");

  const newCandidatesCsv = [
    "official_id,official_name,region,locality,category,locality_status,review_required,source",
    ...newCandidates.map((c) =>
      [
        c.r.officialIdentifier,
        c.r.nameRaw,
        c.r.region,
        c.r.locality ?? c.r.rawLocality ?? "",
        c.r.educationFamily,
        c.r.localityStatus,
        isCleanNewCandidate(c) ? "NO" : "YES",
        c.r.sourceMinistry,
      ]
        .map(csvEscape)
        .join(",")
    ),
  ].join("\n");
  writeFileSync(join(rootDir, "reports", "registry", "staging-new-candidates.csv"), newCandidatesCsv, "utf-8");

  console.log(`\nRapports écrits : staging-existing-probable-review.csv (${probableReviewRows.length} lignes), staging-new-candidates.csv (${newCandidates.length} lignes)`);

  if (!commit) {
    console.log("\nAUCUNE écriture effectuée (dry-run). Relancer avec --commit pour écrire dans establishment_data_sources / establishment_import_staging.");
    return { classified, counts, newByRegion, flagCounts, cleanNewCandidates, reviewRequiredNewCandidates, wouldInsert, wouldSkipIdempotent, batch002Matched, sourceExists };
  }

  // ── §26-27 : écriture réelle ──────────────────────────────────────────────
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
          records_fetched: master.length,
          notes:
            "Consolidation Batch 001 (Centre, Littoral) + Batch 002 (Ouest, Adamaoua, Nord, Extrême-Nord). " +
            "673/757 du Batch 002 déjà promus directement dans establishments lors de SPRINT O (hors staging) — voir reports/registry/batch-002-promotion-summary.json. " +
            "SPRINT P.2C : import staging complet avec rapprochement 4 niveaux contre production.",
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
      c.match.matchType === "EXISTING_OFFICIAL_ID" || c.match.matchType === "EXISTING_LEGACY_CONFIRMED"
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
  const batchLog: { batch: number; attempted: number; inserted: number; failed: number }[] = [];

  for (let i = 0; i < rowsToInsert.length; i += CHUNK) {
    const chunk = rowsToInsert.slice(i, i + CHUNK);
    const res = await fetch(`${url}/rest/v1/establishment_import_staging`, {
      method: "POST",
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify(chunk),
    });
    if (res.ok) {
      inserted += chunk.length;
      batchLog.push({ batch: i / CHUNK, attempted: chunk.length, inserted: chunk.length, failed: 0 });
      console.log(`  Lot ${i}-${i + chunk.length}: OK (${chunk.length} ligne(s))`);
    } else {
      failed += chunk.length;
      batchLog.push({ batch: i / CHUNK, attempted: chunk.length, inserted: 0, failed: chunk.length });
      console.error(`  Lot ${i}-${i + chunk.length}: ÉCHEC HTTP ${res.status} — ${(await res.text()).slice(0, 300)}`);
    }
  }

  console.log(`\nTerminé — ${inserted} ligne(s) insérée(s), ${failed} échouée(s), ${skippedAlreadyStaged} ignorée(s) (idempotence), ${skippedRejected} rejetée(s).`);

  return {
    classified, counts, newByRegion, flagCounts, cleanNewCandidates, reviewRequiredNewCandidates,
    wouldInsert: rowsToInsert.length, wouldSkipIdempotent: skippedAlreadyStaged, batch002Matched, sourceExists,
    inserted, failed, batchLog, dataSourceId,
  };
}

main()
  .then((result) => {
    if (result && process.env.__STAGING_RESULT_FILE) {
      writeFileSync(process.env.__STAGING_RESULT_FILE, JSON.stringify(result, null, 2), "utf-8");
    }
  })
  .catch((error) => {
    console.error("Échec de l'import staging Master V1 :", error);
    process.exit(1);
  });
