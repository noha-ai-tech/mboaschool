import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..", "..");
const REPORTS_DIR = join(rootDir, "reports", "registry");

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
  const supabase = createClient(url, serviceKey);

  const { count: estCount } = await supabase.from("establishments").select("*", { count: "exact", head: true });
  const { count: stagingCount } = await supabase.from("establishment_import_staging").select("*", { count: "exact", head: true });
  const { count: registryCount } = await supabase.from("establishment_registry_identifiers").select("*", { count: "exact", head: true });
  const { count: stagingPromoted } = await supabase
    .from("establishment_import_staging")
    .select("*", { count: "exact", head: true })
    .eq("status", "promoted");
  const { count: stagingUnpromoted } = await supabase
    .from("establishment_import_staging")
    .select("*", { count: "exact", head: true })
    .neq("status", "promoted");

  const ministries = ["MINESUP", "MINEFOP", "MINSANTE", "MINTRANSPORT"];
  const ministryBreakdown: Record<string, { staging: number | null; live: number | null }> = {};
  for (const m of ministries) {
    const { count: stagingM } = await supabase
      .from("establishment_import_staging")
      .select("*", { count: "exact", head: true })
      .eq("source_ministry", m);
    const { count: liveM } = await supabase
      .from("establishments")
      .select("*", { count: "exact", head: true })
      .eq("source_ministry", m);
    ministryBreakdown[m] = { staging: stagingM, live: liveM };
  }

  const createdIdsReport = JSON.parse(
    readFileSync(join(REPORTS_DIR, "registry-national-c-created-ids.json"), "utf-8")
  );
  const createdRows: any[] = createdIdsReport.establishments;
  const authorizedNames: string[] = createdRows.map((r: any) => r.name);
  const authorizedIds: string[] = createdRows.map((r: any) => r.establishment_id);

  const { data: authorizedRows, error: authErr } = await supabase
    .from("establishments")
    .select(
      "id, name, slug, source_ministry, is_verified, owner_id, official_id, registry_import_batch, created_at"
    )
    .in("id", authorizedIds);
  if (authErr) throw authErr;

  const { data: stagingLinks, error: stagingErr } = await supabase
    .from("establishment_import_staging")
    .select("id, status, promoted_establishment_id, source_ministry")
    .in("promoted_establishment_id", authorizedIds);
  if (stagingErr) throw stagingErr;

  let publicationState = "NONE_LIVE";
  const foundCount = authorizedRows?.length ?? 0;
  if (foundCount === 3) publicationState = "ALL_3_ALREADY_LIVE";
  else if (foundCount === 0) publicationState = "NONE_LIVE";
  else publicationState = "PARTIAL_LIVE";

  const registryIdsForAuthorized = await supabase
    .from("establishment_registry_identifiers")
    .select("id, establishment_id")
    .in("establishment_id", authorizedIds);

  const baseline = {
    generated_at: new Date().toISOString(),
    sprint: "REGISTRY-NATIONAL-D",
    establishments: estCount,
    staging_total: stagingCount,
    staging_promoted: stagingPromoted,
    staging_unpromoted: stagingUnpromoted,
    registry_identifiers: registryCount,
    ministry_breakdown: ministryBreakdown,
    historical_reference: { establishments: 2252, staging: 2378, registry_identifiers: 2242 },
  };

  const publicationAudit = {
    generated_at: new Date().toISOString(),
    sprint: "REGISTRY-NATIONAL-D",
    publication_state: publicationState,
    authorized_ids: authorizedIds,
    authorized_names: authorizedNames,
    found_live: authorizedRows,
    found_live_count: foundCount,
    staging_links: stagingLinks,
    staging_links_count: stagingLinks?.length ?? 0,
    registry_identifiers_for_authorized: registryIdsForAuthorized.data,
    registry_identifiers_for_authorized_count: registryIdsForAuthorized.data?.length ?? 0,
    checks: {
      all_is_verified_false: (authorizedRows ?? []).every((r: any) => r.is_verified === false),
      all_owner_null: (authorizedRows ?? []).every((r: any) => r.owner_id === null),
      all_official_id_null: (authorizedRows ?? []).every((r: any) => r.official_id === null),
      staging_links_count_matches: (stagingLinks?.length ?? 0) === 3,
      zero_registry_identifiers: (registryIdsForAuthorized.data?.length ?? 0) === 0,
    },
  };

  mkdirSync(REPORTS_DIR, { recursive: true });
  writeFileSync(join(REPORTS_DIR, "registry-national-d-live-baseline.json"), JSON.stringify(baseline, null, 2));
  writeFileSync(join(REPORTS_DIR, "registry-national-d-publication-audit.json"), JSON.stringify(publicationAudit, null, 2));

  console.log(JSON.stringify({ baseline, publicationAudit }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
