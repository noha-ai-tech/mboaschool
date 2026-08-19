import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { sha256 } from "./lib/extraction/hashing";

/**
 * SPRINT MINESUP-E — régénère le résumé final et le snapshot d'approbation
 * depuis l'ÉTAT RÉEL de la base (source de vérité), pas depuis la mémoire
 * du DERNIER passage du collecteur (qui, étant idempotent, rapporte à tort
 * "0 inséré" pour un run qui ne trouve rien de neuf — même défaut trouvé
 * et corrigé pour le pilote MINESUP-C). Read-only, aucune écriture.
 */

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
  // Batch(es) pilote MINESUP-C, à exclure du décompte "national".
  const { data: pilotDataSources } = await supabase
    .from("establishment_data_sources")
    .select("id")
    .ilike("source_name", "Instituts Privés d'Enseignement Supérieur (IPES) — Région Nord-Ouest%");
  const pilotIds = new Set((pilotDataSources ?? []).map((d) => d.id));

  const { data: allMinesup } = await supabase
    .from("establishment_import_staging")
    .select("id,name_raw,region,city,status,raw_data,data_source_id,education_family,source_url")
    .eq("source_ministry", "MINESUP")
    .order("id", { ascending: true });

  const nationalRows = (allMinesup ?? []).filter((r) => !r.data_source_id || !pilotIds.has(r.data_source_id));
  console.log(`Lignes staging MINESUP hors pilote (= collecte nationale) : ${nationalRows.length}`);
  const byStatus = new Map<string, number>();
  for (const r of nationalRows) byStatus.set(r.status, (byStatus.get(r.status) || 0) + 1);
  console.log("Répartition par statut :", Object.fromEntries(byStatus));

  const cleanApprovable = nationalRows.filter((r) => r.status === "ready");
  const approvalCandidates = cleanApprovable.map((r) => {
    const raw = r.raw_data as any;
    return {
      staging_id: r.id, name: r.name_raw, region: r.region, city: r.city, category: r.education_family,
      authority: "MINESUP", registry: raw?.list_region_section === "Universités d'Etat (nav)" ? "MINESUP_STATE_UNIVERSITIES" : "MINESUP_IPES",
      source: r.source_url, decision: "CLEAN_APPROVABLE",
      identifiers: { creation_order: raw?.identifiers?.creation_order_raw ?? null, opening_authorization: raw?.identifiers?.opening_authorization_raw ?? null },
    };
  });
  const checksum = sha256(JSON.stringify(approvalCandidates));
  writeFileSync(join(rootDir, "reports", "registry", "minesup-e-approval.json"), JSON.stringify({
    generated_at: new Date().toISOString(), operator: "jean-merlain", sprint: "MINESUP-E", batch: "minesup-national-v1",
    checksum_method: "sha256(JSON.stringify(candidates)) — candidats triés par staging_id (UUID) ascendant, ordre canonique reproductible en relisant establishment_import_staging (source_ministry=MINESUP, hors data_source_id du pilote MINESUP-C, status='ready') trié par id.",
    candidate_count: approvalCandidates.length, candidates: approvalCandidates, checksum,
  }, null, 2), "utf-8");
  console.log(`\napproval.json régénéré : ${approvalCandidates.length} candidats, checksum ${checksum}`);

  // Corrige le résumé final avec les totaux CUMULATIFS réels (pas la vue du dernier passage seul).
  const summaryPath = join(rootDir, "reports", "registry", "minesup-e-national-summary.json");
  const summary = JSON.parse(readFileSync(summaryPath, "utf-8"));
  summary.run_history_note = "Le collecteur a été exécuté 4 fois : (1) premier passage — bug de matching découvert (staging-ghost dupliqué + vocabulaire supérieur manquant des stopwords flous), 9 candidats insérés avant correctif ; (2) second passage après correctif partiel — 0 nouveau (déjà présents) ; (3) troisième passage après correctif complet — 51 nouveaux candidats insérés (total cumulé 60) ; (4) quatrième passage — idempotence prouvée (0 nouveau, tout déjà reconnu ALREADY_STAGING). Ce résumé reflète les totaux CUMULATIFS réels lus depuis la base, pas la vue partielle du seul dernier passage.";
  summary.staging_cumulative = { total_national_staging_rows: nationalRows.length, by_status: Object.fromEntries(byStatus), clean_approvable_total: approvalCandidates.length };
  summary.approval = { candidates: approvalCandidates.length, checksum };
  writeFileSync(summaryPath, JSON.stringify(summary, null, 2), "utf-8");
  console.log("national-summary.json corrigé avec les totaux cumulatifs réels.");

  // by-region.csv — la colonne "new_clean_approvable" du 4e passage (idempotent)
  // vaut 0 partout (rien de NOUVEAU à insérer, exact mais trompeur pour un
  // rapport final). Ajoute une colonne cumulative réelle : combien de
  // candidats CLEAN_APPROVABLE ont effectivement fini en staging, par région,
  // toutes exécutions confondues.
  const cumulativeByRegion = new Map<string, number>();
  for (const c of cleanApprovable) {
    const region = (c.raw_data as any)?.list_region_section ?? "inconnue";
    cumulativeByRegion.set(region, (cumulativeByRegion.get(region) || 0) + 1);
  }
  const byRegionPath = join(rootDir, "reports", "registry", "minesup-e-by-region.csv");
  const lines = readFileSync(byRegionPath, "utf-8").split("\n");
  const header = lines[0] + ",clean_approvable_cumulative_staged";
  const newLines = [header];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const region = lines[i].split(",")[0];
    newLines.push(lines[i] + "," + (cumulativeByRegion.get(region) ?? 0));
  }
  writeFileSync(byRegionPath, newLines.join("\n"), "utf-8");
  console.log("by-region.csv corrigé avec la colonne clean_approvable_cumulative_staged.");
}
main();
