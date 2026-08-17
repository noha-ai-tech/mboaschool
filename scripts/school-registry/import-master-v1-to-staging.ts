import { readFileSync } from "node:fs";
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
 * SPRINT P — Import du dataset MINESEC Master V1 vers
 * `establishment_import_staging`.
 *
 * ==========================================================================
 * PRÉPARÉ MAIS NON EXÉCUTÉ. Ne pas lancer sans validation explicite d'Eddy.
 * Voir rapport SPRINT P — "Do not write staging until explicit Eddy approval."
 * ==========================================================================
 *
 * Politique de priorité des données : MINESEC ne sert jamais à écraser une
 * donnée existante. Un enregistrement en correspondance exacte ou probable
 * avec un établissement déjà en production est inséré en staging à titre
 * d'audit (status duplicate_exact / duplicate_review, duplicate_of_establishment_id
 * renseigné) mais N'EST JAMAIS fusionné ni promu automatiquement — revue
 * humaine obligatoire dans les deux cas (voir DEDUPLICATION_RULES.md).
 *
 * Protection anti-doublon / idempotence : avant tout insert, les fingerprints
 * déjà présents dans `establishment_import_staging` sont chargés et exclus.
 * Relancer ce script plusieurs fois sur le même master dataset ne crée donc
 * jamais de doublon — les lignes déjà importées sont simplement ignorées.
 *
 * Protection des établissements existants : ce script n'écrit JAMAIS dans
 * `establishments` ni ne renseigne `promoted_establishment_id` — la
 * promotion reste un acte séparé, humain, hors périmètre de ce script.
 *
 * Usage (une fois approuvé) : node_modules/.bin/tsx import-master-v1-to-staging.ts
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..", "..");

const REGION_LABELS: Record<string, string> = {
  CENTRE: "Centre",
  LITTORAL: "Littoral",
  OUEST: "Ouest",
  ADAMAOUA: "Adamaoua",
  NORD: "Nord",
  "EXTREME-NORD": "Extrême-Nord",
};

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

async function main() {
  const env = readFileSync(join(rootDir, ".env.local"), "utf-8");
  const url = readEnvVar(env, "NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = readEnvVar(env, "SUPABASE_SERVICE_ROLE_KEY");

  // SPRINT P.2B §14-15 : source = dataset "clean" (statut de localité par
  // ligne), pas le snapshot maître original (jamais modifié, voir §15).
  const master: CleanRecord[] = JSON.parse(
    readFileSync(join(rootDir, "data", "registry", "master", "minesec-master-v1-clean.json"), "utf-8")
  );

  // ── Correspondance avec la base réelle (pour duplicate_of_establishment_id) ──
  const liveRes = await fetch(`${url}/rest/v1/establishments?select=id,name,region`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
  });
  if (!liveRes.ok) throw new Error(`Lecture establishments -> HTTP ${liveRes.status}`);
  const live: { id: string; name: string; region: string | null }[] = await liveRes.json();
  const liveByRegion = new Map<string, typeof live>();
  for (const e of live) {
    const key = stripAccents(e.region ?? "").toUpperCase();
    if (!liveByRegion.has(key)) liveByRegion.set(key, []);
    liveByRegion.get(key)!.push(e);
  }

  // ── Idempotence : fingerprints déjà en staging ──────────────────────────
  const existingRes = await fetch(`${url}/rest/v1/establishment_import_staging?select=fingerprint`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
  });
  if (!existingRes.ok) throw new Error(`Lecture establishment_import_staging -> HTTP ${existingRes.status}`);
  const existingFingerprints = new Set<string>((await existingRes.json()).map((r: { fingerprint: string }) => r.fingerprint));

  // ── Source d'import (une ligne par exécution, jamais par ministère) ─────
  const sourceRes = await fetch(`${url}/rest/v1/establishment_data_sources`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify([{
      ministry: "MINESEC",
      source_name: "Registre National des Établissements — carte scolaire numérique (ESG) — Master V1 (SPRINT N+O consolidé)",
      source_url: "https://www.minesec.gov.cm/web/index.php/fr/carte-scolaire/immatriculation-fr",
      records_fetched: master.length,
      notes: "Consolidation SPRINT P de Batch 001 (Centre, Littoral) et Batch 002 (Ouest, Adamaoua, Nord, Extrême-Nord). 673/757 du Batch 002 déjà promus directement dans establishments lors de SPRINT O (hors staging) — voir reports/registry/batch-002-promotion-summary.json.",
    }]),
  });
  if (!sourceRes.ok) throw new Error(`Création data_source -> HTTP ${sourceRes.status} — ${await sourceRes.text()}`);
  const [dataSource] = await sourceRes.json();

  // ── Construction des lignes de staging ──────────────────────────────────
  type StagingRow = Record<string, unknown>;
  const rows: StagingRow[] = [];
  let skippedAlreadyStaged = 0, skippedRejected = 0;

  for (const r of master) {
    if (r.status === "rejected") { skippedRejected++; continue; }
    if (existingFingerprints.has(r.fingerprint)) { skippedAlreadyStaged++; continue; }

    const regionLabel = REGION_LABELS[r.region ?? ""] ?? r.region;
    const regionKey = stripAccents(regionLabel ?? "").toUpperCase();
    const candidates = liveByRegion.get(regionKey) ?? [];
    const key = matchKey(r.nameNormalized);

    let duplicateOfId: string | null = null;
    let stagingStatus = "ready";
    for (const c of candidates) {
      if (matchKey(normalizeName(c.name)) === key && key.length > 0) {
        duplicateOfId = c.id;
        stagingStatus = "duplicate_exact";
        break;
      }
    }
    if (!duplicateOfId) {
      for (const c of candidates) {
        const cKey = matchKey(normalizeName(c.name));
        if (key.length >= 4 && (cKey.includes(key) || key.includes(cKey)) && cKey.length > 0) {
          duplicateOfId = c.id;
          stagingStatus = "duplicate_review";
          break;
        }
      }
    }

    rows.push({
      data_source_id: dataSource.id,
      source_ministry: r.sourceMinistry,
      source_url: r.sourceUrl,
      source_year: r.sourceYear,
      official_identifier: r.officialIdentifier,
      // raw_data reste la ligne source intacte (r.raw) + le statut de
      // localité calculé en P.2A, sous une clé séparée jamais confondue avec
      // les champs bruts MINESEC eux-mêmes (§14 : rien n'est perdu).
      raw_data: {
        ...r.raw,
        _localityAudit: {
          rawLocality: r.rawLocality,
          normalizedLocality: r.normalizedLocality,
          localityStatus: r.localityStatus,
        },
      },
      name_raw: r.nameRaw,
      name_normalized: r.nameNormalized,
      education_family: r.educationFamily,
      ownership: r.ownership,
      subsystem: r.subsystem,
      region: regionLabel,
      department: r.department,
      arrondissement: r.arrondissement,
      commune: r.commune,
      locality: r.locality,
      city: r.city,
      quarter: r.quarter,
      fingerprint: r.fingerprint,
      duplicate_of_establishment_id: duplicateOfId,
      status: stagingStatus,
    });
  }

  console.log(`${rows.length} ligne(s) à insérer — ${skippedAlreadyStaged} déjà présente(s) (idempotence), ${skippedRejected} rejetée(s) à la normalisation.`);

  const CHUNK = 200;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const res = await fetch(`${url}/rest/v1/establishment_import_staging`, {
      method: "POST",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(chunk),
    });
    if (!res.ok) throw new Error(`Insert staging lot ${i} -> HTTP ${res.status} — ${await res.text()}`);
    inserted += chunk.length;
    console.log(`  Lot ${i}-${i + chunk.length}: OK`);
  }

  console.log(`Terminé — ${inserted} ligne(s) insérée(s) dans establishment_import_staging.`);
}

main().catch((error) => {
  console.error("Échec de l'import staging Master V1 :", error);
  process.exit(1);
});
