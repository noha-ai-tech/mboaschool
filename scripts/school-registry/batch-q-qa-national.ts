import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * SPRINT Q §23-25 — Lecture seule. Complète reports/registry/batch-q-summary.json
 * avec le QA par ville, et écrit reports/registry/minesec-national-v1-progress.json
 * (cumul national sur les 10 régions). N'écrit jamais Supabase.
 *
 * Note méthodologique (constat direct, pas une supposition) : la table ESG
 * MINESEC n'a pas de colonne "ville" — `locality` contient un quartier/village
 * (ex. "TALLA" pour un lycée "de KRIBI"), la ville n'apparaît souvent que
 * dans le nom de l'établissement. Le QA par ville ci-dessous cherche donc le
 * nom de ville dans `locality` OU `nameRaw`, jamais dans une colonne dédiée
 * qui n'existe pas dans la source.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..", "..");

function readEnvVar(env: string, key: string): string {
  const match = env.match(new RegExp(`^${key}=(.*)$`, "m"));
  const value = match?.[1]?.trim();
  if (!value) throw new Error(`${key} introuvable dans .env.local`);
  return value;
}

function stripAccents(s: string | null | undefined): string {
  return (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim().replace(/-/g, " ");
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

interface QRecord {
  nameRaw: string;
  region: string | null;
  locality: string | null;
  officialIdentifier: string | null;
  educationFamily: string | null;
  status: string;
}

async function main() {
  const normalizedDir = join(rootDir, "data", "registry", "normalized");
  const file = readdirSync(normalizedDir).filter((f) => f.startsWith("minesec-sud-est-anglophone-")).sort().pop();
  if (!file) throw new Error("Fichier normalisé Batch Q introuvable.");
  const batch: QRecord[] = JSON.parse(readFileSync(join(normalizedDir, file), "utf-8"));

  const PRIORITY_CITIES: Record<string, string[]> = {
    Sud: ["Ebolowa", "Kribi", "Sangmelima", "Ambam"],
    Est: ["Bertoua", "Batouri", "Abong-Mbang", "Yokadouma"],
    "Nord-Ouest": ["Bamenda", "Kumbo", "Wum", "Ndop"],
    "Sud-Ouest": ["Buea", "Limbe", "Kumba", "Mamfe"],
  };

  const cityQa: Record<string, { count: number; official_id_coverage: string; categories: Record<string, number> }> = {};
  for (const cities of Object.values(PRIORITY_CITIES)) {
    for (const city of cities) {
      const cityKey = stripAccents(city);
      const matches = batch.filter((r) => {
        const loc = stripAccents(r.locality);
        const name = stripAccents(r.nameRaw);
        return loc.includes(cityKey) || name.includes(cityKey);
      });
      const withOfficialId = matches.filter((r) => r.officialIdentifier).length;
      const categories: Record<string, number> = {};
      for (const m of matches) categories[m.educationFamily ?? "(inconnue)"] = (categories[m.educationFamily ?? "(inconnue)"] ?? 0) + 1;
      cityQa[city] = { count: matches.length, official_id_coverage: `${withOfficialId}/${matches.length}`, categories };
    }
  }

  // ── Enrichit batch-q-summary.json déjà écrit par import-batch-q-to-staging.ts ──
  const summaryPath = join(rootDir, "reports", "registry", "batch-q-summary.json");
  const existingSummary = JSON.parse(readFileSync(summaryPath, "utf-8"));
  writeFileSync(
    summaryPath,
    JSON.stringify(
      {
        ...existingSummary,
        city_qa_methodology:
          "La table ESG MINESEC n'a pas de colonne ville : `locality` = quartier/village, la ville n'apparaît souvent que dans le nom de l'établissement. Recherche par sous-chaîne dans locality OU nameRaw, jamais une colonne dédiée qui n'existe pas.",
        city_qa: cityQa,
      },
      null,
      2
    ),
    "utf-8"
  );
  console.log(`batch-q-summary.json enrichi avec le QA par ville (${Object.keys(cityQa).length} villes).`);

  // ── §24-25 : cumul national ────────────────────────────────────────────
  const env = readFileSync(join(rootDir, ".env.local"), "utf-8");
  const url = readEnvVar(env, "NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = readEnvVar(env, "SUPABASE_SERVICE_ROLE_KEY");

  const [staging, establishments] = await Promise.all([
    fetchAllPaginated<{ status: string; region: string | null; official_identifier: string | null }>(
      url,
      serviceKey,
      "/rest/v1/establishment_import_staging?select=status,region,official_identifier"
    ),
    fetchAllPaginated<{ region: string | null; source_ministry: string | null; official_id: string | null }>(
      url,
      serviceKey,
      "/rest/v1/establishments?select=region,source_ministry,official_id"
    ),
  ]);

  const REGIONS = ["Centre", "Littoral", "Ouest", "Adamaoua", "Nord", "Extrême-Nord", "Sud", "Est", "Nord-Ouest", "Sud-Ouest"];

  const liveByRegion: Record<string, number> = {};
  for (const e of establishments) {
    if (e.source_ministry !== "MINESEC") continue;
    const canonical = REGIONS.find((r) => stripAccents(r) === stripAccents(e.region ?? "")) ?? e.region ?? "(inconnue)";
    liveByRegion[canonical] = (liveByRegion[canonical] ?? 0) + 1;
  }
  const liveRegionCaseNote =
    "ATTENTION — data quality pré-existante (non causée par SPRINT Q, non corrigée ici — modifier les 1277 établissements live est interdit ce sprint) : " +
    "certaines lignes establishments.region sont en casse brute (ex. \"CENTRE\") au lieu de la forme canonique (\"Centre\"). Agrégation ci-dessus faite en ignorant la casse pour un chiffre honnête ; la colonne elle-même reste incohérente en base.";

  const stagingByRegion: Record<string, number> = {};
  for (const s of staging) {
    const canonical = REGIONS.find((r) => stripAccents(r) === stripAccents(s.region ?? "")) ?? s.region ?? "(inconnue)";
    stagingByRegion[canonical] = (stagingByRegion[canonical] ?? 0) + 1;
  }

  const stagingByStatus: Record<string, number> = {};
  for (const s of staging) stagingByStatus[s.status] = (stagingByStatus[s.status] ?? 0) + 1;

  const officialIdCoverageStaging = staging.filter((s) => s.official_identifier).length;

  const national = {
    generated_at: new Date().toISOString(),
    operator: "jean-merlain",
    regions: REGIONS.map((r) => ({
      region: r,
      staging: stagingByRegion[r] ?? 0,
      live: liveByRegion[r] ?? 0,
    })),
    total_unique_minesec_staging: staging.length,
    live_minesec_total: establishments.filter((e) => e.source_ministry === "MINESEC").length,
    staging_total: staging.length,
    promoted: stagingByStatus.promoted ?? 0,
    ready: stagingByStatus.ready ?? 0,
    duplicate_exact: stagingByStatus.duplicate_exact ?? 0,
    duplicate_review: stagingByStatus.duplicate_review ?? 0,
    macro_zones: {
      grand_nord: { regions: ["Adamaoua", "Nord", "Extrême-Nord"], staging: ["Adamaoua", "Nord", "Extrême-Nord"].reduce((a, r) => a + (stagingByRegion[r] ?? 0), 0), live: ["Adamaoua", "Nord", "Extrême-Nord"].reduce((a, r) => a + (liveByRegion[r] ?? 0), 0) },
      zone_anglophone: { regions: ["Nord-Ouest", "Sud-Ouest"], staging: ["Nord-Ouest", "Sud-Ouest"].reduce((a, r) => a + (stagingByRegion[r] ?? 0), 0), live: ["Nord-Ouest", "Sud-Ouest"].reduce((a, r) => a + (liveByRegion[r] ?? 0), 0) },
    },
    quality: {
      official_id_coverage_staging: `${officialIdCoverageStaging}/${staging.length}`,
      region_coverage: `${REGIONS.filter((r) => (stagingByRegion[r] ?? 0) > 0).length}/10`,
    },
    known_data_quality_issue: liveRegionCaseNote,
  };

  writeFileSync(join(rootDir, "reports", "registry", "minesec-national-v1-progress.json"), JSON.stringify(national, null, 2), "utf-8");
  console.log("reports/registry/minesec-national-v1-progress.json écrit.");
  console.log(JSON.stringify(national, null, 2));
}

main().catch((error) => {
  console.error("Échec QA/national :", error);
  process.exit(1);
});
