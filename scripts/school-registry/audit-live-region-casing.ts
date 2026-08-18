import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeRegionCasing } from "../../src/lib/cameroonRegions";

/**
 * SPRINT R §8 — Audit lecture seule de la casse de `establishments.region`
 * pour les lignes MINESEC. N'écrit jamais Supabase. Produit
 * reports/registry/live-region-casing-audit.csv.
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
    const res = await fetch(`${url}${path}${path.includes("?") ? "&" : "?"}limit=${pageSize}&offset=${offset}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    if (!res.ok) throw new Error(`GET ${path} -> HTTP ${res.status}`);
    const page = (await res.json()) as T[];
    all.push(...page);
    if (page.length < pageSize) break;
    offset += pageSize;
  }
  return all;
}

interface Row {
  id: string;
  official_id: string | null;
  region: string | null;
  source_ministry: string | null;
}

async function main() {
  const env = readFileSync(join(rootDir, ".env.local"), "utf-8");
  const url = readEnvVar(env, "NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = readEnvVar(env, "SUPABASE_SERVICE_ROLE_KEY");

  const rows = await fetchAllPaginated<Row>(url, serviceKey, "/rest/v1/establishments?source_ministry=eq.MINESEC&select=id,official_id,region,source_ministry");

  const audit = rows.map((r) => {
    const canonical = normalizeRegionCasing(r.region);
    const isCanonicalAlready = r.region === canonical;
    const safeToFix = canonical !== null && !isCanonicalAlready;
    return {
      establishment_id: r.id,
      official_id: r.official_id,
      current_region: r.region,
      canonical_region: canonical,
      source_ministry: r.source_ministry,
      safe_to_fix: safeToFix ? "YES" : canonical === null ? "NO_AMBIGUOUS_NO_MATCH" : "NO_ALREADY_CANONICAL",
    };
  });

  const mismatches = audit.filter((a) => a.current_region !== a.canonical_region);
  const safe = mismatches.filter((a) => a.safe_to_fix === "YES");
  const ambiguous = mismatches.filter((a) => a.safe_to_fix === "NO_AMBIGUOUS_NO_MATCH");

  console.log(`MINESEC live total : ${rows.length}`);
  console.log(`Casse non canonique (mismatch) : ${mismatches.length}`);
  console.log(`  Sûrs à corriger (casse/accent seulement) : ${safe.length}`);
  console.log(`  Ambigus (aucune région canonique ne correspond) : ${ambiguous.length}`);
  if (ambiguous.length > 0) {
    console.log("Valeurs ambiguës rencontrées :", [...new Set(ambiguous.map((a) => a.current_region))]);
  }

  mkdirSync(join(rootDir, "reports", "registry"), { recursive: true });
  const header = "establishment_id,official_id,current_region,canonical_region,source_ministry,safe_to_fix";
  const csv = [header, ...audit.map((a) => [a.establishment_id, a.official_id, a.current_region, a.canonical_region, a.source_ministry, a.safe_to_fix].map(csvEscape).join(","))].join("\n");
  writeFileSync(join(rootDir, "reports", "registry", "live-region-casing-audit.csv"), csv, "utf-8");
  console.log(`\nRapport écrit : reports/registry/live-region-casing-audit.csv (${audit.length} lignes, ${mismatches.length} en écart)`);
}

main().catch((error) => {
  console.error("Échec audit casse région :", error);
  process.exit(1);
});
