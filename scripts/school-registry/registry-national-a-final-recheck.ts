/**
 * SPRINT REGISTRY-NATIONAL-A §28 — recompte final INDÉPENDANT du script de
 * build principal (fichier séparé, requêtes séparées, aucune dépendance sur
 * les valeurs déjà écrites par registry-national-a-build.ts). READ-ONLY.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

function readEnvVar(env: string, key: string): string {
  const match = env.match(new RegExp(`^${key}=(.*)$`, "m"));
  const value = match?.[1]?.trim();
  if (!value) throw new Error(`${key} introuvable dans .env.local`);
  return value;
}

async function main() {
  const env = readFileSync(".env.local", "utf-8");
  const url = readEnvVar(env, "NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = readEnvVar(env, "SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(url, serviceKey);

  const { count: establishments, error: e1 } = await supabase.from("establishments").select("*", { count: "exact", head: true });
  const { count: staging, error: e2 } = await supabase.from("establishment_import_staging").select("*", { count: "exact", head: true });
  const { count: registryIdentifiers, error: e3 } = await supabase.from("establishment_registry_identifiers").select("*", { count: "exact", head: true });
  const { count: mintransportStaging, error: e4 } = await supabase.from("establishment_import_staging").select("*", { count: "exact", head: true }).eq("source_ministry", "MINTRANSPORT");

  if (e1 || e2 || e3 || e4) throw new Error([e1, e2, e3, e4].filter(Boolean).map((e) => e!.message).join(" | "));

  const baseline = JSON.parse(readFileSync("reports/registry/registry-national-a-baseline.json", "utf-8"));
  const deltaEstablishments = (establishments ?? 0) - baseline.totals.establishments;
  const deltaStaging = (staging ?? 0) - baseline.totals.staging;
  const deltaRegistryIdentifiers = (registryIdentifiers ?? 0) - baseline.totals.registry_identifiers;
  const safetyOk = deltaEstablishments === 0 && deltaStaging === 0 && deltaRegistryIdentifiers === 0;

  const report = {
    sprint: "REGISTRY-NATIONAL-A",
    generated_at: new Date().toISOString(),
    note: "Recompte INDÉPENDANT (§28) — script séparé de registry-national-a-build.ts, requêtes fraîches, aucune valeur réutilisée du run précédent sauf le baseline.totals déjà écrit en §3 comme référence de comparaison.",
    baseline_reference: baseline.totals,
    recount_now: { establishments, staging, registry_identifiers: registryIdentifiers, mintransport_staging: mintransportStaging },
    deltas: { establishments: deltaEstablishments, staging: deltaStaging, registry_identifiers: deltaRegistryIdentifiers },
    safety_ok: safetyOk,
    decision_if_unsafe: "SAFETY_FAILURE",
  };
  writeFileSync("reports/registry/registry-national-a-final-write-verification.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (!safetyOk) {
    console.error("DELTA INEXPLIQUÉ DÉTECTÉ — DECISION = SAFETY_FAILURE");
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
