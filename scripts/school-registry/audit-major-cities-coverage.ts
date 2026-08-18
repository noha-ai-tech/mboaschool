import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { MAJOR_CITIES, rowMentionsCity } from "./lib/majorCities";

/**
 * SPRINT R.2 §5 — Lecture seule. Mesure la couverture RÉELLE (pas un
 * chiffre supposé) de chaque ville prioritaire, en croisant establishments
 * live + establishment_import_staging, via city/locality/nom (§6 — city
 * seul sous-compterait massivement, presque toujours NULL pour MINESEC).
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..", "..");

function readEnvVar(env: string, key: string): string {
  const match = env.match(new RegExp(`^${key}=(.*)$`, "m"));
  return match![1].trim();
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

async function main() {
  const env = readFileSync(join(rootDir, ".env.local"), "utf-8");
  const url = readEnvVar(env, "NEXT_PUBLIC_SUPABASE_URL");
  const key = readEnvVar(env, "SUPABASE_SERVICE_ROLE_KEY");

  const [live, staging] = await Promise.all([
    fetchAllPaginated<LiveRow>(url, key, "/rest/v1/establishments?select=id,name,city,region,main_category,official_id,source_ministry"),
    fetchAllPaginated<StagingRow>(url, key, "/rest/v1/establishment_import_staging?select=id,name_raw,city,locality,region,education_family,official_identifier,status"),
  ]);

  console.log(`Live: ${live.length} | Staging: ${staging.length}`);

  const rows: {
    city: string;
    priority: number;
    region: string;
    live: number;
    staging: number;
    unique: number;
    withOfficialId: number;
    withoutCity: number;
    localityMatchesCity: number;
    secondaryGeneral: number;
    secondaryTechnical: number;
  }[] = [];

  for (const c of MAJOR_CITIES) {
    const matcher = rowMentionsCity(c.name, c.variants);
    const liveHits = live.filter((r) => matcher({ city: r.city, name: r.name }));
    const stagingHits = staging.filter((r) => matcher({ city: r.city, locality: r.locality, name: r.name_raw }));

    // "unique" — fingerprint minimal par official_id sinon nom normalisé, live+staging combinés.
    const seen = new Set<string>();
    for (const r of liveHits) seen.add(r.official_id ? `id:${r.official_id.toUpperCase()}` : `name:${r.name.toLowerCase()}`);
    for (const r of stagingHits) seen.add(r.official_identifier ? `id:${r.official_identifier.toUpperCase()}` : `name:${r.name_raw.toLowerCase()}`);

    const withOfficialId = liveHits.filter((r) => r.official_id).length + stagingHits.filter((r) => r.official_identifier).length;
    const withoutCity = liveHits.filter((r) => !r.city).length + stagingHits.filter((r) => !r.city).length;
    const localityMatchesCity = stagingHits.filter((r) => r.locality && r.locality.toLowerCase().includes(c.name.toLowerCase())).length;
    const secondaryGeneral = liveHits.filter((r) => r.main_category === "secondaire").length + stagingHits.filter((r) => r.education_family === "secondary_general").length;
    const secondaryTechnical = stagingHits.filter((r) => r.education_family === "secondary_technical").length;

    rows.push({
      city: c.name,
      priority: c.priority,
      region: c.region,
      live: liveHits.length,
      staging: stagingHits.length,
      unique: seen.size,
      withOfficialId,
      withoutCity,
      localityMatchesCity,
      secondaryGeneral,
      secondaryTechnical,
    });
  }

  console.log("\n=== §5 COUVERTURE PAR VILLE (méthode : city OU locality OU nom mentionne la ville) ===");
  for (const r of rows) {
    console.log(`${r.city} (P${r.priority}, ${r.region}) — live=${r.live} staging=${r.staging} unique=${r.unique} official_id=${r.withOfficialId} city_null=${r.withoutCity} locality_match=${r.localityMatchesCity} secGen=${r.secondaryGeneral} secTech=${r.secondaryTechnical}`);
  }

  mkdirSync(join(rootDir, "reports", "registry"), { recursive: true });
  const csv = [
    "city,priority,region,count_live,count_staging,count_unique,count_with_official_id,count_without_city,count_locality_matching_city,count_secondary_general,count_secondary_technical",
    ...rows.map((r) =>
      [r.city, r.priority, r.region, r.live, r.staging, r.unique, r.withOfficialId, r.withoutCity, r.localityMatchesCity, r.secondaryGeneral, r.secondaryTechnical].map(csvEscape).join(",")
    ),
  ].join("\n");
  writeFileSync(join(rootDir, "reports", "registry", "major-cities-current-coverage.csv"), csv, "utf-8");
  console.log(`\nRapport écrit : reports/registry/major-cities-current-coverage.csv (${rows.length} villes)`);
}

main().catch((error) => {
  console.error("Échec audit couverture villes :", error);
  process.exit(1);
});
