import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

/**
 * SPRINT R.2 §30-31 — Import staging des candidats classés SOURCE_VERIFIED_REVIEW
 * par collect-major-cities-secondary.ts, batch "major-cities-secondary-completeness-v1".
 *
 * N'écrit JAMAIS dans `establishments` (§3). N'importe QUE les candidats :
 *   - classification = SOURCE_VERIFIED_REVIEW (jamais REVIEW_REQUIRED ni
 *     INSUFFICIENT_SOURCE — ceux-là restent dans le rapport, pas en base) ;
 *   - source_url non vide — le principe absolu de la migration 0006 est
 *     qu'aucune ligne de staging n'existe sans pouvoir remonter à sa source
 *     exacte ; un candidat "Recherche web générale" sans URL n'est pas staged.
 *
 * Idempotent (§31) : fingerprint déterministe `web-discovery:<ville>:<nom
 * normalisé>` ; toute ligne dont le fingerprint existe déjà en staging est
 * sautée, jamais réinsérée.
 *
 * Usage : tsx import-major-cities-to-staging.ts --dry-run (défaut) | --commit
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..", "..");
const COMMIT = process.argv.includes("--commit");

function readEnvVar(env: string, key: string): string {
  const match = env.match(new RegExp(`^${key}=(.*)$`, "m"));
  const value = match?.[1]?.trim();
  if (!value) throw new Error(`${key} introuvable dans .env.local`);
  return value;
}
async function fetchAllPaginated<T>(url: string, key: string, path: string): Promise<T[]> {
  const all: T[] = [];
  const pageSize = 1000;
  let offset = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const res = await fetch(`${url}${path}${path.includes("?") ? "&" : "?"}limit=${pageSize}&offset=${offset}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    if (!res.ok) throw new Error(`GET ${path} -> HTTP ${res.status}`);
    const page = (await res.json()) as T[];
    all.push(...page);
    if (page.length < pageSize) break;
    offset += pageSize;
  }
  return all;
}
function stripAccentsLower(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}
function fingerprintFor(city: string, name: string): string {
  const key = `web-discovery:${stripAccentsLower(city)}:${stripAccentsLower(name).replace(/\s+/g, " ")}`;
  return createHash("sha256").update(key).digest("hex");
}

interface Candidate {
  city: string;
  region: string;
  official_name: string;
  category_hint: string;
  source_name: string;
  source_url: string;
  source_type: "tier1" | "tier2" | "tier3";
  discovery_source: string;
  note?: string;
}

function inferEducationFamily(hint: string): string {
  if (hint.includes("technique") || hint.includes("cetic") || hint.includes("cetif") || hint.includes("cetig") || hint.includes("ceti")) return "secondary_technical";
  return "secondary_general";
}
function inferOwnership(hint: string): string {
  return hint.includes("public") ? "public" : "private";
}

async function main() {
  const env = readFileSync(join(rootDir, ".env.local"), "utf-8");
  const url = readEnvVar(env, "NEXT_PUBLIC_SUPABASE_URL");
  const key = readEnvVar(env, "SUPABASE_SERVICE_ROLE_KEY");
  const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };

  const batch = JSON.parse(readFileSync(join(rootDir, "data", "registry", "normalized", "major-cities-secondary-completeness-v1.json"), "utf-8")) as { candidates: Candidate[] };
  const live = await fetchAllPaginated<{ id: string; name: string; city: string | null }>(url, key, "/rest/v1/establishments?select=id,name,city");
  const staging = await fetchAllPaginated<{ id: string; name_raw: string; city: string | null; locality: string | null }>(url, key, "/rest/v1/establishment_import_staging?select=id,name_raw,city,locality");
  const existingFingerprints = new Set(
    (await fetchAllPaginated<{ fingerprint: string }>(url, key, "/rest/v1/establishment_import_staging?select=fingerprint")).map((r) => r.fingerprint)
  );

  // Recalcule la classification exacte comme collect-major-cities-secondary.ts
  // (normalisation identique) pour ne staged que SOURCE_VERIFIED_REVIEW.
  const STOPWORDS = new Set([
    "de", "du", "des", "la", "le", "les", "d", "l", "et", "a", "au", "aux",
    "college", "collège", "lycee", "lycée", "lyce", "ces", "cetic", "cetif", "ceti", "cegt", "cefti",
    "school", "secondary", "high", "bilingual", "bilingue", "prive", "privé", "private", "laic", "laïc",
    "institut", "complexe", "scolaire", "groupe", "ecole", "école", "polyvalent", "technique", "public", "comprehensive",
  ]);
  function normalizedKey(name: string): string {
    return name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w && !STOPWORDS.has(w)).sort().join(" ").trim();
  }

  function classify(cand: Candidate): "ALREADY_LIVE" | "ALREADY_STAGING" | "REVIEW_REQUIRED" | "SOURCE_VERIFIED_REVIEW" | "INSUFFICIENT_SOURCE" {
    const cityKey = stripAccentsLower(cand.city);
    const liveRows = live.filter((r) => stripAccentsLower(r.city ?? "").includes(cityKey) || stripAccentsLower(r.name).includes(cityKey));
    const stagingRows = staging.filter((r) => stripAccentsLower(r.city ?? "").includes(cityKey) || stripAccentsLower(r.locality ?? "").includes(cityKey) || stripAccentsLower(r.name_raw).includes(cityKey));
    const candKey = normalizedKey(cand.official_name);
    if (liveRows.some((r) => normalizedKey(r.name) === candKey)) return "ALREADY_LIVE";
    if (stagingRows.some((r) => normalizedKey(r.name_raw) === candKey)) return "ALREADY_STAGING";
    const cityTokens = new Set(normalizedKey(cand.city).split(" "));
    const candWords = new Set(candKey.split(" ").filter((w) => w.length > 3 && !cityTokens.has(w)));
    function overlaps(otherKey: string) {
      return otherKey.split(" ").filter((w) => w.length > 3 && !cityTokens.has(w)).some((w) => candWords.has(w));
    }
    if (candWords.size > 0 && (liveRows.some((r) => overlaps(normalizedKey(r.name))) || stagingRows.some((r) => overlaps(normalizedKey(r.name_raw))))) return "REVIEW_REQUIRED";
    const corroborated = Boolean(cand.note?.toLowerCase().includes("corrobor")) || cand.source_url !== "";
    return corroborated ? "SOURCE_VERIFIED_REVIEW" : "INSUFFICIENT_SOURCE";
  }

  const toStage = batch.candidates.filter((c) => classify(c) === "SOURCE_VERIFIED_REVIEW" && c.source_url !== "");
  const skippedNoUrl = batch.candidates.filter((c) => classify(c) === "SOURCE_VERIFIED_REVIEW" && c.source_url === "");

  console.log(`Candidats totaux : ${batch.candidates.length}`);
  console.log(`SOURCE_VERIFIED_REVIEW avec source_url : ${toStage.length} (stageable)`);
  console.log(`SOURCE_VERIFIED_REVIEW SANS source_url : ${skippedNoUrl.length} (jamais staged — principe absolu §19/migration 0006 : source traçable obligatoire)`);

  const rows = toStage.map((c) => ({
    fingerprint: fingerprintFor(c.city, c.official_name),
    city: c.city,
    region: c.region,
    official_name: c.official_name,
    source_ministry: "OTHER",
    source_url: c.source_url,
    education_family: inferEducationFamily(c.category_hint),
    ownership: inferOwnership(c.category_hint),
    raw_data: c,
  }));
  const newRows = rows.filter((r) => !existingFingerprints.has(r.fingerprint));
  const alreadyStagedByFingerprint = rows.length - newRows.length;

  console.log(`Déjà en staging (fingerprint identique, ré-exécution idempotente) : ${alreadyStagedByFingerprint}`);
  console.log(`À insérer : ${newRows.length}`);

  if (!COMMIT) {
    console.log("\n--dry-run (défaut). Relancer avec --commit pour écrire dans establishment_import_staging.");
    return;
  }
  if (newRows.length === 0) {
    console.log("\nRien à insérer.");
    return;
  }

  // Une ligne data_source par exécution --commit (§30 traçabilité du batch).
  const dsRes = await fetch(`${url}/rest/v1/establishment_data_sources`, {
    method: "POST",
    headers: { ...headers, Prefer: "return=representation" },
    body: JSON.stringify([{
      ministry: "OTHER",
      source_name: "major-cities-secondary-completeness-v1 — découverte web ciblée (Osidimbea, InovEdu, ecolesaucameroun.com, recherche générale)",
      source_url: "https://memoirelittoral0.jimdofree.com/ ; https://memoirecentre0.jimdofree.com/ ; https://www.inovedu.net/",
      source_year: 2026,
      records_fetched: newRows.length,
      notes: "SPRINT R.2 §17-19. Sources TIER 3 uniquement — discovery, jamais suffisant seul pour promotion. Voir docs/03_DATA_REGISTRY/MAJOR_CITIES_SECONDARY_V1.md.",
    }]),
  });
  if (!dsRes.ok) throw new Error(`POST establishment_data_sources -> HTTP ${dsRes.status}: ${await dsRes.text()}`);
  const [dataSource] = (await dsRes.json()) as { id: string }[];

  const insertRows = newRows.map((r) => ({
    data_source_id: dataSource.id,
    source_ministry: r.source_ministry,
    source_url: r.source_url,
    source_year: 2026,
    official_identifier: null,
    raw_data: r.raw_data,
    name_raw: r.official_name,
    name_normalized: stripAccentsLower(r.official_name),
    education_family: r.education_family,
    ownership: r.ownership,
    subsystem: "unknown",
    region: r.region,
    city: r.city,
    locality: null,
    fingerprint: r.fingerprint,
    status: "ready",
  }));

  const CHUNK = 200;
  let inserted = 0;
  for (let i = 0; i < insertRows.length; i += CHUNK) {
    const chunk = insertRows.slice(i, i + CHUNK);
    const res = await fetch(`${url}/rest/v1/establishment_import_staging`, { method: "POST", headers, body: JSON.stringify(chunk) });
    if (!res.ok) throw new Error(`POST establishment_import_staging -> HTTP ${res.status}: ${await res.text()}`);
    inserted += chunk.length;
    console.log(`  ${inserted}/${insertRows.length} insérées...`);
  }

  writeFileSync(
    join(rootDir, "reports", "registry", "major-cities-secondary-v1-staging-import.json"),
    JSON.stringify({ data_source_id: dataSource.id, inserted_at: new Date().toISOString(), rows_inserted: inserted, rows_skipped_already_staged: alreadyStagedByFingerprint, rows_skipped_no_source_url: skippedNoUrl.length }, null, 2),
  );
  console.log(`\n${inserted} lignes insérées dans establishment_import_staging (status='ready', source_ministry='OTHER'). establishments non touché.`);
}

main().catch((error) => {
  console.error("Échec import staging major cities:", error);
  process.exit(1);
});
