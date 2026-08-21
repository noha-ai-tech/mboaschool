import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { extractCityFromName } from "./g1-city-extract";

/**
 * SPRINT MINSANTE-G.1 §8-§10 — enrichissement `city` évidence-only pour les
 * 22 lignes staging du pilote MINSANTE (batch minsante-pilot-v1). Écrit
 * UNIQUEMENT :
 *   - `city` (actuellement NULL sur les 22 lignes) ;
 *   - `raw_data.minsante_g1_geo_enrichment` (objet additif, preuve/traçabilité).
 *
 * Ne touche JAMAIS `name_raw`, `raw_data.minsante_b_snapshot`,
 * `raw_data.minsante_c_snapshot` à `..._f_metadata`, ni aucune autre clé
 * existante de raw_data — fusion additive stricte (spread de l'existant +
 * nouvelle clé). AUCUNE ligne establishments/registry_identifiers touchée.
 *
 * Preuve utilisée : le nom officiel MINSANTE lui-même contient explicitement
 * "... DE <VILLE>" en suffixe (§9 : "the school name itself may be accepted
 * only when location is an explicit part of the official name"). Extraction
 * déterministe (dernière occurrence de " DE " dans le nom), jamais une
 * inférence par capitale régionale/popularité/acronyme/web.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..", "..");
const BATCH_ID = "minsante-pilot-v1";
const SPRINT = "MINSANTE-G.1";

function readEnvVar(env: string, key: string): string {
  const match = env.match(new RegExp(`^${key}=(.*)$`, "m"));
  const value = match?.[1]?.trim();
  if (!value) throw new Error(`${key} introuvable dans .env.local`);
  return value;
}
function csvEscape(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function main() {
  const env = readFileSync(join(rootDir, ".env.local"), "utf-8");
  const url = readEnvVar(env, "NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = readEnvVar(env, "SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(url, serviceKey);
  const projectRef = url.match(/https:\/\/([a-z0-9]+)\.supabase/)?.[1] ?? "unknown";
  console.log(`Project ref confirmé : ${projectRef} (attendu umcwwynrftidytxgqkwi)`);
  if (projectRef !== "umcwwynrftidytxgqkwi") {
    console.log("PROJET INATTENDU — STOP.");
    process.exit(1);
  }

  const { data: rows, error } = await supabase
    .from("establishment_import_staging")
    .select("id,name_raw,region,city,raw_data,source_url")
    .eq("source_ministry", "MINSANTE");
  if (error) throw error;
  const pilot = (rows as any[]).filter((r) => r.raw_data?.batch === BATCH_ID);
  console.log(`Lignes pilote MINSANTE relues : ${pilot.length} (attendu 22)`);
  if (pilot.length !== 22) {
    console.log("INCOHÉRENCE — population pilote != 22. STOP, ne pas enrichir.");
    process.exit(1);
  }
  const alreadyEnriched = pilot.filter((r) => r.city !== null);
  console.log(`Lignes déjà avec city non-NULL : ${alreadyEnriched.length} (attendu 0 — premier passage)`);

  const csvRows: string[] = ["staging_id,name,region,city_before,city_after,city_source,city_evidence,confidence,applied"];
  let applied = 0;
  let stillNull = 0;

  for (const row of pilot) {
    const { city, evidence } = extractCityFromName(row.name_raw as string);
    const isCompound = city !== null && city.trim().includes(" ");
    const confidence = city === null ? "NONE" : isCompound ? "MEDIUM" : "HIGH";
    const willApply = city !== null && row.city === null; // never overwrite a non-null value, never invent when extraction failed

    csvRows.push(
      [csvEscape(row.id), csvEscape(row.name_raw), csvEscape(row.region), csvEscape(row.city), csvEscape(willApply ? city : row.city), csvEscape(willApply ? "MINSANTE_OFFICIAL_NAME_SUFFIX" : null), csvEscape(evidence), csvEscape(confidence), csvEscape(willApply)].join(",")
    );

    if (!willApply) {
      stillNull++;
      continue;
    }

    const existingRawData = (row.raw_data as Record<string, unknown>) ?? {};
    const newRawData = {
      ...existingRawData,
      minsante_g1_geo_enrichment: {
        sprint: SPRINT,
        applied_at: new Date().toISOString(),
        previous_city: row.city,
        new_city: city,
        city_source: "MINSANTE_OFFICIAL_NAME_SUFFIX",
        city_evidence: evidence,
        confidence,
        rule: "dernière occurrence de ' DE ' dans le nom officiel MINSANTE (name_raw), texte capturé verbatim jusqu'à la fin du nom — jamais une inférence par capitale régionale/popularité/acronyme/web (§8-9 du brief MINSANTE-G.1).",
      },
    };

    const { error: updateError } = await supabase.from("establishment_import_staging").update({ city, raw_data: newRawData }).eq("id", row.id);
    if (updateError) {
      console.log(`ÉCHEC UPDATE ${row.id} : ${updateError.message}`);
      process.exit(1);
    }
    applied++;
  }

  console.log(`\nEnrichissement appliqué : ${applied} / 22`);
  console.log(`Toujours city=NULL après ce sprint : ${stillNull} / 22`);

  mkdirSync(join(rootDir, "reports", "registry"), { recursive: true });
  writeFileSync(join(rootDir, "reports", "registry", "minsante-g1-city-enrichment.csv"), csvRows.join("\n"), "utf-8");
  console.log("Rapport écrit : reports/registry/minsante-g1-city-enrichment.csv");

  // Post-condition — relire pour confirmer, jamais supposer que l'UPDATE a réussi silencieusement.
  const { data: verify, error: verifyError } = await supabase
    .from("establishment_import_staging")
    .select("id,city,raw_data")
    .eq("source_ministry", "MINSANTE")
    .in(
      "id",
      pilot.map((r) => r.id)
    );
  if (verifyError) throw verifyError;
  const verifyEnriched = (verify as any[]).filter((r) => r.city !== null).length;
  const verifyWithMarker = (verify as any[]).filter((r) => r.raw_data?.minsante_g1_geo_enrichment).length;
  console.log(`\nPOST-CONDITION : ${verifyEnriched}/22 city non-NULL, ${verifyWithMarker}/22 marqueur minsante_g1_geo_enrichment présent (doivent être égaux à 'applied').`);
}

main().catch((error) => {
  console.error("Échec enrichissement city MINSANTE-G.1 :", error);
  process.exit(1);
});
