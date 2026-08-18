import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { MAJOR_CITIES } from "./lib/majorCities";

/**
 * SPRINT R.2 §20-22 — Lecture seule. Analyse approfondie par zone
 * (arrondissement) pour les villes dont `zones` est seedé dans
 * majorCities.ts (Douala I-VI, Yaoundé I-VII — jamais inventé pour les
 * autres, voir §7). Croise establishments live + establishment_import_staging
 * via city/locality/nom, avec limite de mot (\b) pour ne jamais confondre
 * "Douala I" et "Douala II" (substring naïf les confondrait — §21).
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

function stripAccents(s: string | null | undefined): string {
  return (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/** §21 — Correspondance stricte par mot pour éviter "Douala I" ⊂ "Douala II". */
function rowMentionsZone(zone: string): (row: { city?: string | null; locality?: string | null; name?: string | null }) => boolean {
  const re = new RegExp(`\\b${stripAccents(zone).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
  return (row) => re.test(stripAccents(row.city)) || re.test(stripAccents(row.locality)) || re.test(stripAccents(row.name));
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

  const citiesWithZones = MAJOR_CITIES.filter((c) => c.zones && c.zones.length > 0);
  if (citiesWithZones.length === 0) {
    console.log("Aucune ville avec `zones` seedé dans majorCities.ts — rien à analyser (§7 : jamais inventé).");
    return;
  }

  const rows: {
    city: string;
    zone: string;
    live: number;
    staging: number;
    unique: number;
    withOfficialId: number;
    localityFilled: number;
  }[] = [];

  for (const c of citiesWithZones) {
    for (const zone of c.zones!) {
      const matcher = rowMentionsZone(zone);
      const liveHits = live.filter((r) => matcher({ city: r.city, name: r.name }));
      const stagingHits = staging.filter((r) => matcher({ city: r.city, locality: r.locality, name: r.name_raw }));

      const seen = new Set<string>();
      for (const r of liveHits) seen.add(r.official_id ? `id:${r.official_id.toUpperCase()}` : `name:${r.name.toLowerCase()}`);
      for (const r of stagingHits) seen.add(r.official_identifier ? `id:${r.official_identifier.toUpperCase()}` : `name:${r.name_raw.toLowerCase()}`);

      const withOfficialId = liveHits.filter((r) => r.official_id).length + stagingHits.filter((r) => r.official_identifier).length;
      const localityFilled = liveHits.filter((r) => r.city).length + stagingHits.filter((r) => r.locality).length;

      rows.push({
        city: c.name,
        zone,
        live: liveHits.length,
        staging: stagingHits.length,
        unique: seen.size,
        withOfficialId,
        localityFilled,
      });
    }
  }

  console.log("\n=== §20-22 COUVERTURE PAR ZONE (arrondissement mentionné dans city/locality/nom, mot entier) ===");
  for (const r of rows) {
    console.log(`${r.city} — ${r.zone} — live=${r.live} staging=${r.staging} unique=${r.unique} official_id=${r.withOfficialId} locality_filled=${r.localityFilled}`);
  }

  const totalZoned = rows.reduce((sum, r) => sum + r.unique, 0);
  for (const c of citiesWithZones) {
    const cityTotal = rows.filter((r) => r.city === c.name).reduce((sum, r) => sum + r.unique, 0);
    console.log(`\n${c.name} — total attribué à une zone : ${cityTotal} (somme des zones, peut compter en double si une fiche mentionne plusieurs zones)`);
  }
  console.log(`\nTotal toutes zones confondues (Douala + Yaoundé) : ${totalZoned}`);

  mkdirSync(join(rootDir, "reports", "registry"), { recursive: true });
  const csv = [
    "city,zone,count_live,count_staging,count_unique,count_with_official_id,count_locality_filled",
    ...rows.map((r) => [r.city, r.zone, r.live, r.staging, r.unique, r.withOfficialId, r.localityFilled].map(csvEscape).join(",")),
  ].join("\n");
  writeFileSync(join(rootDir, "reports", "registry", "major-cities-zones-coverage.csv"), csv, "utf-8");
  console.log(`\nRapport écrit : reports/registry/major-cities-zones-coverage.csv (${rows.length} lignes)`);
}

main().catch((error) => {
  console.error("Échec audit couverture zones :", error);
  process.exit(1);
});
