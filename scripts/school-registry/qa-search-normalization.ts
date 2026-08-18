import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeSearchText, matchesSearchQuery } from "../../src/lib/search/normalizeSearchText";

/** SPRINT R.1 §7-8 — QA lecture seule contre la production réelle, en
 * important le VRAI module utilisé par /recherche (pas une réimplémentation). */

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..", "..");

function readEnvVar(env: string, key: string): string {
  const match = env.match(new RegExp(`^${key}=(.*)$`, "m"));
  return match![1].trim();
}
async function fetchAllPaginated<T>(url: string, key: string, path: string): Promise<T[]> {
  const all: T[] = [];
  const pageSize = 1000;
  let offset = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const res = await fetch(`${url}${path}${path.includes("?") ? "&" : "?"}limit=${pageSize}&offset=${offset}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    const page = (await res.json()) as T[];
    all.push(...page);
    if (page.length < pageSize) break;
    offset += pageSize;
  }
  return all;
}

async function main() {
  const env = readFileSync(join(rootDir, ".env.local"), "utf-8");
  const url = readEnvVar(env, "NEXT_PUBLIC_SUPABASE_URL");
  const key = readEnvVar(env, "SUPABASE_SERVICE_ROLE_KEY");

  const rows = await fetchAllPaginated<{ name: string; city: string | null; region: string | null; main_category: string }>(
    url,
    key,
    "/rest/v1/establishments?select=name,city,region,main_category"
  );
  console.log(`Établissements chargés (paginé) : ${rows.length} (attendu 1942)\n`);

  const haystacks = rows.map((r) => normalizeSearchText(`${r.name} ${r.city ?? ""} ${r.region ?? ""} ${r.main_category}`));

  console.log("=== §7 — lycée / lyce, 6 villes ===");
  const cityPairs = ["bafoussam", "maroua", "ebolowa", "bertoua", "bamenda", "buea"];
  for (const city of cityPairs) {
    const accented = `lycée ${city}`;
    const truncated = `lyce ${city}`;
    const nA = haystacks.filter((h) => matchesSearchQuery(h, accented)).length;
    const nB = haystacks.filter((h) => matchesSearchQuery(h, truncated)).length;
    const coherent = nA === nB && nA > 0;
    console.log(`${coherent ? "OK" : "ÉCART"}  "${accented}" -> ${nA} | "${truncated}" -> ${nB}`);
  }

  console.log("\n=== §8 — accents généraux ===");
  const accentPairs: [string, string][] = [
    ["ecole", "école"],
    ["superieur", "supérieur"],
    ["prive", "privé"],
  ];
  for (const [a, b] of accentPairs) {
    const nA = haystacks.filter((h) => matchesSearchQuery(h, a)).length;
    const nB = haystacks.filter((h) => matchesSearchQuery(h, b)).length;
    console.log(`${nA === nB ? "OK" : "ÉCART"}  "${a}" -> ${nA} | "${b}" -> ${nB}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
