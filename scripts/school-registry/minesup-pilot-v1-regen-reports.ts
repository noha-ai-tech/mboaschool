import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { generateMinesupPilotReports } from "./lib/minesupPilotReports";

/**
 * SPRINT MINESUP-C — régénère review.csv / approval.json /
 * link-proposals.csv depuis l'état réel de establishment_import_staging
 * (source de vérité) — utile pour rafraîchir les rapports sans relancer
 * toute la collecte/extraction. Read-only sur establishment_import_staging
 * (aucune écriture, uniquement des fichiers de rapport).
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..", "..");

function readEnvVar(env: string, key: string): string {
  const match = env.match(new RegExp(`^${key}=(.*)$`, "m"));
  return match![1].trim();
}

async function main() {
  const env = readFileSync(join(rootDir, ".env.local"), "utf-8");
  const url = readEnvVar(env, "NEXT_PUBLIC_SUPABASE_URL");
  const key = readEnvVar(env, "SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(url, key);

  const summary = await generateMinesupPilotReports(supabase, rootDir, "jean-merlain", "minesup-pilot-v1");
  console.log(JSON.stringify(summary, null, 2));
}
main();
