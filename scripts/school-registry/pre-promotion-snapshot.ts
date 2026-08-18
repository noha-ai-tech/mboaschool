import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * SPRINT P.4 §2-3 — Snapshot pré-promotion en lecture seule.
 * Ne modifie aucune donnée. Écrit reports/registry/pre-promotion-v1-summary.json
 * (comptages uniquement, aucun secret).
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..", "..");

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

interface StagingRow {
  id: string;
  status: string;
  source_ministry: string | null;
  raw_data: {
    _review?: { review_action: string };
    _localityAudit?: { localityStatus: string };
    _matchAudit?: { matchType: string };
  } | null;
}

async function main() {
  const env = readFileSync(join(rootDir, ".env.local"), "utf-8");
  const url = readEnvVar(env, "NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = readEnvVar(env, "SUPABASE_SERVICE_ROLE_KEY");
  const projectRef = new URL(url).hostname.split(".")[0];

  const [staging, establishments] = await Promise.all([
    fetchAllPaginated<StagingRow>(
      url,
      serviceKey,
      "/rest/v1/establishment_import_staging?select=id,status,source_ministry,raw_data"
    ),
    fetchAllPaginated<{ id: string }>(url, serviceKey, "/rest/v1/establishments?select=id"),
  ]);

  const approvedCount = staging.filter((r) => r.raw_data?._review?.review_action === "approved_for_promotion").length;

  const doubtfulCount = staging.filter((r) => {
    const t = r.raw_data?._matchAudit?.matchType;
    return t === "EXISTING_PROBABLE" || t === "REVIEW_REQUIRED";
  }).length;

  const localityReviewCount = staging.filter((r) => {
    const s = r.raw_data?._localityAudit?.localityStatus;
    const isNewCandidate = !r.raw_data?._matchAudit?.matchType;
    return isNewCandidate && (s === "CLEARLY_INVALID" || s === "NEEDS_REVIEW");
  }).length;

  const reviewCount = doubtfulCount + localityReviewCount;

  const sources = new Set(staging.map((r) => r.source_ministry).filter(Boolean));

  const summary = {
    timestamp: new Date().toISOString(),
    project_ref: projectRef,
    establishments_count: establishments.length,
    staging_count: staging.length,
    approved_count: approvedCount,
    review_count: reviewCount,
    review_breakdown: { doubtful_matches: doubtfulCount, locality_flagged_new_candidates: localityReviewCount },
    data_sources_count: sources.size,
    data_sources: [...sources],
  };

  mkdirSync(join(rootDir, "reports", "registry"), { recursive: true });
  writeFileSync(join(rootDir, "reports", "registry", "pre-promotion-v1-summary.json"), JSON.stringify(summary, null, 2), "utf-8");

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error("Échec du snapshot pré-promotion :", error);
  process.exit(1);
});
