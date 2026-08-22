import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

/**
 * Post-write verification READ-ONLY pour l'import réel Transport Tier-3
 * exécuté avec autorisation nommée (jean-merlain/Eddy). N'écrit rien.
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
  const { count: mintransportCount } = await supabase.from("establishment_import_staging").select("*", { count: "exact", head: true }).eq("source_ministry", "MINTRANSPORT");

  console.log(`establishments = ${estCount} (attendu 2249, inchangé)`);
  console.log(`staging total = ${stagingCount} (attendu 2378 = 2366+12)`);
  console.log(`registry_identifiers = ${registryCount} (attendu 2242, inchangé)`);
  console.log(`MINTRANSPORT staging rows = ${mintransportCount} (attendu 12)`);

  const rows = await supabase
    .from("establishment_import_staging")
    .select("id,name_raw,source_ministry,source_url,raw_data,promoted_establishment_id,status,created_at")
    .eq("source_ministry", "MINTRANSPORT");

  const inserted = rows.data ?? [];
  console.log(`\nLignes MINTRANSPORT trouvées: ${inserted.length}`);

  let allSourceUrlPresent = true;
  let allNoPromoted = true;
  let allUnverified = true;
  let piiFound = 0;
  const piiPattern = /nom\s+du\s+(promoteur|repr[eé]sentant\s+l[eé]gal)|matricule|t[eé]l[eé]phone\s+personnel/i;

  for (const r of inserted) {
    if (!r.source_url) allSourceUrlPresent = false;
    if (r.promoted_establishment_id) allNoPromoted = false;
    const raw = r.raw_data as any;
    const tier3 = raw?.transport_tier3;
    if (tier3?.official_verification !== "UNVERIFIED") allUnverified = false;
    const rawStr = JSON.stringify(raw);
    if (piiPattern.test(rawStr)) piiFound++;
  }

  console.log(`Toutes ont source_url: ${allSourceUrlPresent}`);
  console.log(`Aucune promue (promoted_establishment_id null): ${allNoPromoted}`);
  console.log(`Toutes official_verification=UNVERIFIED: ${allUnverified}`);
  console.log(`PII détectée: ${piiFound}`);

  const names = inserted.map((r) => r.name_raw);
  console.log(`\nNoms insérés:\n${names.map((n) => `  - ${n}`).join("\n")}`);

  mkdirSync(join(rootDir, "reports", "registry"), { recursive: true });
  writeFileSync(
    join(rootDir, "reports", "registry", "transport-a2-t3-import-final-postverify.json"),
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        establishments: estCount,
        staging_total: stagingCount,
        registry_identifiers: registryCount,
        mintransport_staging_rows: mintransportCount,
        inserted_count: inserted.length,
        all_have_source_url: allSourceUrlPresent,
        all_promoted_establishment_id_null: allNoPromoted,
        all_official_verification_unverified: allUnverified,
        pii_detected: piiFound,
        inserted_names: names,
      },
      null,
      2
    ),
    "utf-8"
  );
  console.log("\nRapport écrit: reports/registry/transport-a2-t3-import-final-postverify.json");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
