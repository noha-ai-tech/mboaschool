import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

/**
 * Post-write verification READ-ONLY pour la publication nationale réelle
 * REGISTRY-NATIONAL-C, exécutée avec autorisation nommée (jean-merlain/Eddy).
 * N'écrit rien.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..", "..");

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

  console.log(`establishments = ${estCount} (attendu 2252)`);
  console.log(`staging total = ${stagingCount} (attendu 2378, inchangé)`);
  console.log(`registry_identifiers = ${registryCount} (attendu 2242, inchangé)`);

  const createdIds = JSON.parse(readFileSync(join(rootDir, "reports", "registry", "registry-national-c-created-ids.json"), "utf-8"));
  const ids: string[] = createdIds.establishments.map((e: any) => e.establishment_id);
  const stagingIds: string[] = createdIds.establishments.map((e: any) => e.staging_id);

  const { data: liveRows } = await supabase
    .from("establishments")
    .select("id,name,slug,main_category,region,city,source_ministry,owner_id,is_verified,official_id,registry_import_batch,created_at")
    .in("id", ids);

  const { data: stagingRows } = await supabase
    .from("establishment_import_staging")
    .select("id,status,promoted_establishment_id")
    .in("id", stagingIds);

  const { count: identifiersForThese } = await supabase
    .from("establishment_registry_identifiers")
    .select("*", { count: "exact", head: true })
    .in("establishment_id", ids);

  console.log(`\nLignes live trouvées: ${liveRows?.length}/3`);
  let allOk = true;
  for (const r of liveRows ?? []) {
    const ownerNull = r.owner_id === null;
    const notVerified = r.is_verified === false;
    const noOfficialId = r.official_id === null;
    const batchOk = r.registry_import_batch === "registry-national-c-v1" || !!r.registry_import_batch;
    console.log(
      `  - ${r.name} | slug=${r.slug} | region=${r.region}/${r.city} | owner_id=${r.owner_id} | is_verified=${r.is_verified} | official_id=${r.official_id} | source_ministry=${r.source_ministry} | batch=${r.registry_import_batch}`
    );
    if (!ownerNull || !notVerified || !noOfficialId) allOk = false;
  }

  console.log(`\nToutes owner_id=NULL, is_verified=false, official_id=NULL: ${allOk}`);
  console.log(`Registry identifiers créés pour ces 3: ${identifiersForThese} (attendu 0)`);

  const promotedCount = (stagingRows ?? []).filter((s) => s.status === "promoted" && ids.includes(s.promoted_establishment_id ?? "")).length;
  console.log(`Lignes staging correctement liées (status=promoted, promoted_establishment_id correct): ${promotedCount}/3`);

  mkdirSync(join(rootDir, "reports", "registry"), { recursive: true });
  writeFileSync(
    join(rootDir, "reports", "registry", "registry-national-c-final-postverify.json"),
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        establishments: estCount,
        staging_total: stagingCount,
        registry_identifiers: registryCount,
        created_rows: liveRows,
        identifiers_for_these_created: identifiersForThese,
        staging_correctly_linked: promotedCount,
        all_defaults_safe: allOk,
      },
      null,
      2
    ),
    "utf-8"
  );
  console.log("\nRapport écrit: reports/registry/registry-national-c-final-postverify.json");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
