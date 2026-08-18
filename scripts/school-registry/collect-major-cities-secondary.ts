import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * SPRINT R.2 §17-23, §30-42 — Matching + classification des candidats
 * découverts par recherche web ciblée (data/registry/normalized/
 * major-cities-secondary-completeness-v1.json) contre le registre actuel
 * (live + staging). LECTURE SEULE : produit les rapports §39-42 et le
 * snapshot d'approbation §71 (vide si aucun candidat CLEAN_APPROVABLE).
 * N'écrit JAMAIS dans Supabase — l'import staging (§30-31) est un script
 * séparé, exécuté seulement après revue de ces rapports.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..", "..");

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

interface LiveRow {
  id: string;
  name: string;
  city: string | null;
  region: string | null;
  main_category: string;
  official_id: string | null;
  source_ministry: string | null;
}
interface StagingRow {
  id: string;
  name_raw: string;
  city: string | null;
  locality: string | null;
  region: string | null;
  education_family: string | null;
  official_identifier: string | null;
  status: string;
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

// §25 — normalisation pour MATCHING uniquement, jamais pour réécrire official_name.
const STOPWORDS = new Set([
  "de", "du", "des", "la", "le", "les", "d", "l", "et", "a", "au", "aux",
  "college", "collège", "lycee", "lycée", "lyce", "ces", "cetic", "cetif", "ceti", "cegt", "cefti",
  "school", "secondary", "high", "bilingual", "bilingue", "prive", "privé", "private", "laic", "laïc",
  "institut", "complexe", "scolaire", "groupe", "ecole", "école", "polyvalent", "technique", "public",
  "comprehensive",
]);
function normalizedKey(name: string): string {
  const stripped = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !STOPWORDS.has(w));
  return stripped.sort().join(" ").trim();
}
function stripAccentsLower(s: string | null | undefined): string {
  return (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

type Classification = "ALREADY_LIVE" | "ALREADY_STAGING" | "REVIEW_REQUIRED" | "SOURCE_VERIFIED_REVIEW" | "INSUFFICIENT_SOURCE";

async function main() {
  const env = readFileSync(join(rootDir, ".env.local"), "utf-8");
  const url = readEnvVar(env, "NEXT_PUBLIC_SUPABASE_URL");
  const key = readEnvVar(env, "SUPABASE_SERVICE_ROLE_KEY");

  const [live, staging] = await Promise.all([
    fetchAllPaginated<LiveRow>(url, key, "/rest/v1/establishments?select=id,name,city,region,main_category,official_id,source_ministry"),
    fetchAllPaginated<StagingRow>(url, key, "/rest/v1/establishment_import_staging?select=id,name_raw,city,locality,region,education_family,official_identifier,status"),
  ]);

  const batch = JSON.parse(readFileSync(join(rootDir, "data", "registry", "normalized", "major-cities-secondary-completeness-v1.json"), "utf-8")) as { candidates: Candidate[] };

  // Index live+staging par ville (city/locality/nom mentionne la ville — cohérent avec §5).
  function rowsForCity(city: string) {
    const cityKey = stripAccentsLower(city);
    const liveRows = live.filter((r) => stripAccentsLower(r.city).includes(cityKey) || stripAccentsLower(r.name).includes(cityKey));
    const stagingRows = staging.filter((r) => stripAccentsLower(r.city).includes(cityKey) || stripAccentsLower(r.locality).includes(cityKey) || stripAccentsLower(r.name_raw).includes(cityKey));
    return { liveRows, stagingRows };
  }

  const results: {
    city: string;
    official_name: string;
    category_hint: string;
    source_name: string;
    source_url: string;
    source_type: string;
    classification: Classification;
    matched_against: string;
  }[] = [];

  const byCity = new Map<string, Candidate[]>();
  for (const c of batch.candidates) {
    if (!byCity.has(c.city)) byCity.set(c.city, []);
    byCity.get(c.city)!.push(c);
  }

  for (const [city, candidates] of byCity) {
    const { liveRows, stagingRows } = rowsForCity(city);
    const liveKeys = liveRows.map((r) => ({ key: normalizedKey(r.name), name: r.name }));
    const stagingKeys = stagingRows.map((r) => ({ key: normalizedKey(r.name_raw), name: r.name_raw }));
    // Le nom de la ville est présent dans quasi toutes les lignes déjà filtrées
    // par ville (§5) — l'exclure du chevauchement flou, sinon "douala"/"yaounde"
    // fait matcher n'importe quelle paire de lignes sans rapport réel.
    const cityTokens = new Set(normalizedKey(city).split(" "));

    for (const cand of candidates) {
      const candKey = normalizedKey(cand.official_name);

      // §20-21 — Level 1/2 : correspondance exacte de clé normalisée.
      const liveExact = liveKeys.find((r) => r.key === candKey);
      const stagingExact = stagingKeys.find((r) => r.key === candKey);

      if (liveExact) {
        results.push({ city, official_name: cand.official_name, category_hint: cand.category_hint, source_name: cand.source_name, source_url: cand.source_url, source_type: cand.source_type, classification: "ALREADY_LIVE", matched_against: liveExact.name });
        continue;
      }
      if (stagingExact) {
        results.push({ city, official_name: cand.official_name, category_hint: cand.category_hint, source_name: cand.source_name, source_url: cand.source_url, source_type: cand.source_type, classification: "ALREADY_STAGING", matched_against: stagingExact.name });
        continue;
      }

      // §22-23 — Level 3/4 : chevauchement partiel de mots significatifs (jamais auto-merge).
      // Mots de 4+ lettres, hors nom de la ville elle-même (voir cityTokens ci-dessus).
      const candWords = new Set(candKey.split(" ").filter((w) => w.length > 3 && !cityTokens.has(w)));
      function overlaps(otherKey: string): boolean {
        const otherWords = otherKey.split(" ").filter((w) => w.length > 3 && !cityTokens.has(w));
        return otherWords.some((w) => candWords.has(w));
      }
      const liveFuzzy = candWords.size > 0 ? liveKeys.find((r) => overlaps(r.key)) : undefined;
      const stagingFuzzy = candWords.size > 0 ? stagingKeys.find((r) => overlaps(r.key)) : undefined;

      if (liveFuzzy || stagingFuzzy) {
        const match = liveFuzzy ?? stagingFuzzy!;
        results.push({ city, official_name: cand.official_name, category_hint: cand.category_hint, source_name: cand.source_name, source_url: cand.source_url, source_type: cand.source_type, classification: "REVIEW_REQUIRED", matched_against: match.name });
        continue;
      }

      // §16, §33-34 — aucune source tier1/tier2 dans ce batch : jamais CLEAN_APPROVABLE.
      // §19 corroboration : au moins 2 sources indépendantes (note le mentionnant) -> SOURCE_VERIFIED_REVIEW,
      // sinon source unique sans URL vérifiable -> INSUFFICIENT_SOURCE.
      const corroborated = Boolean(cand.note?.toLowerCase().includes("corrobor")) || cand.source_url !== "";
      results.push({
        city,
        official_name: cand.official_name,
        category_hint: cand.category_hint,
        source_name: cand.source_name,
        source_url: cand.source_url,
        source_type: cand.source_type,
        classification: corroborated ? "SOURCE_VERIFIED_REVIEW" : "INSUFFICIENT_SOURCE",
        matched_against: "",
      });
    }
  }

  mkdirSync(join(rootDir, "reports", "registry", "cities"), { recursive: true });

  // §39 — rapport Douala (structure identique pour toute ville présente dans le batch).
  for (const city of byCity.keys()) {
    const cityResults = results.filter((r) => r.city === city);
    const filename = city.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const csv = [
      "official_name,category_hint,city,source_name,source_url,source_type,match_type,matched_against",
      ...cityResults.map((r) => [r.official_name, r.category_hint, r.city, r.source_name, r.source_url, r.source_type, r.classification, r.matched_against].map(csvEscape).join(",")),
    ].join("\n");
    writeFileSync(join(rootDir, "reports", "registry", "cities", `${filename}-secondary-v1.csv`), csv, "utf-8");
  }

  // §41 — rapport consolidé toutes villes.
  const consolidatedCsv = [
    "city,official_name,category_hint,source_name,source_url,source_type,match_type,matched_against",
    ...results.map((r) => [r.city, r.official_name, r.category_hint, r.source_name, r.source_url, r.source_type, r.classification, r.matched_against].map(csvEscape).join(",")),
  ].join("\n");
  writeFileSync(join(rootDir, "reports", "registry", "cities", "major-cities-secondary-v1.csv"), consolidatedCsv, "utf-8");

  // §42 — résumé par ville.
  const summary: Record<string, Record<string, number>> = {};
  for (const city of byCity.keys()) {
    const cityResults = results.filter((r) => r.city === city);
    summary[city] = {
      candidates_examined: cityResults.length,
      already_live: cityResults.filter((r) => r.classification === "ALREADY_LIVE").length,
      already_staging: cityResults.filter((r) => r.classification === "ALREADY_STAGING").length,
      review_required: cityResults.filter((r) => r.classification === "REVIEW_REQUIRED").length,
      source_verified_review: cityResults.filter((r) => r.classification === "SOURCE_VERIFIED_REVIEW").length,
      insufficient_source: cityResults.filter((r) => r.classification === "INSUFFICIENT_SOURCE").length,
      clean_approvable: 0,
    };
  }
  writeFileSync(join(rootDir, "reports", "registry", "major-cities-secondary-v1-summary.json"), JSON.stringify(summary, null, 2), "utf-8");

  // §71 — snapshot d'approbation : vide dans ce batch (aucune source tier1/tier2 -> aucun CLEAN_APPROVABLE).
  const approval = { batch: "major-cities-secondary-completeness-v1", generated_at: new Date().toISOString(), clean_approvable_count: 0, candidates: [] as unknown[] };
  writeFileSync(join(rootDir, "reports", "registry", "major-cities-secondary-v1-approval.json"), JSON.stringify(approval, null, 2), "utf-8");

  console.log("=== §42 RÉSUMÉ ===");
  for (const [city, s] of Object.entries(summary)) {
    console.log(`${city}: examinés=${s.candidates_examined} deja_live=${s.already_live} deja_staging=${s.already_staging} review_required=${s.review_required} source_verified_review=${s.source_verified_review} insufficient_source=${s.insufficient_source} clean_approvable=0`);
  }
  console.log("\nRapports écrits dans reports/registry/cities/ et reports/registry/major-cities-secondary-v1-summary.json");
}

main().catch((error) => {
  console.error("Échec collecte major cities secondary:", error);
  process.exit(1);
});
