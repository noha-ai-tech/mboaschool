import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { matchCandidate } from "./lib/matching/engine";
import type { MatchTarget } from "./lib/matching/types";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..", "..");
function readEnvVar(env: string, key: string): string {
  const match = env.match(new RegExp(`^${key}=(.*)$`, "m"));
  return match![1].trim();
}
const env = readFileSync(join(rootDir, ".env.local"), "utf-8");
const url = readEnvVar(env, "NEXT_PUBLIC_SUPABASE_URL");
const key = readEnvVar(env, "SUPABASE_SERVICE_ROLE_KEY");
const supabase = createClient(url, key);

async function main() {
  const { data: higherEd } = await supabase.from("establishments").select("id,name,region,city,owner_id,is_verified").eq("main_category", "superieur").order("name");
  console.log(`Établissements superieur live : ${higherEd?.length}`);

  const targets: MatchTarget[] = (higherEd ?? []).map((e) => ({ id: e.id, name: e.name, region: e.region, city: e.city, category: "higher_education", identifiers: [] }));

  // Cas UCAC — revisiter.
  const uca = higherEd?.find((e) => e.name === "Université Catholique d'Afrique");
  const ucac = higherEd?.find((e) => e.name.includes("UCAC"));
  console.log("\nUCA:", uca);
  console.log("UCAC:", ucac);
  let ucacResult = null;
  if (uca && ucac) {
    const otherTargets = targets.filter((t) => t.id !== uca.id);
    const candidate = { name: uca.name, region: uca.region, city: uca.city, category: "higher_education", identifiers: [] };
    const result = matchCandidate(candidate, otherTargets);
    ucacResult = { level: result.level, target: result.target?.name, reason: result.reason };
    console.log("Matching UCA vs reste (incl. UCAC) :", ucacResult);
  }

  // Recherche large de nouveaux signaux de doublon parmi les établissements supérieurs eux-mêmes.
  const newSignals: Array<{ a: string; b: string; level: string; reason: string }> = [];
  for (let i = 0; i < (higherEd?.length ?? 0); i++) {
    const a = higherEd![i];
    const others = targets.filter((t) => t.id !== a.id);
    const result = matchCandidate({ name: a.name, region: a.region, city: a.city, category: "higher_education", identifiers: [] }, others);
    if (result.level === "STRONG_MATCH" || result.level === "PROBABLE_MATCH" || result.level === "AMBIGUOUS") {
      newSignals.push({ a: a.name, b: result.target?.name ?? "(multiple)", level: result.level, reason: result.reason });
    }
  }
  console.log(`\nSignaux de doublon parmi les ${higherEd?.length} établissements supérieurs live : ${newSignals.length}`);
  console.log(JSON.stringify(newSignals, null, 2));

  writeFileSync(join(rootDir, "reports", "registry", "minesup-e-existing-highered-audit.json"), JSON.stringify({
    generated_at: new Date().toISOString(),
    total_higher_ed_live: higherEd?.length,
    ucac_case: ucacResult,
    other_signals: newSignals,
    note: "Audit READ-ONLY, aucune modification production. UCAC/UCA reste PROBABLE_MATCH/AMBIGUOUS (revue humaine requise), jamais fusionné automatiquement.",
  }, null, 2), "utf-8");
  console.log("\nRapport écrit : minesup-e-existing-highered-audit.json");
}
main();
