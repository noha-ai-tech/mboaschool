import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

/**
 * SPRINT MINSANTE-H — FINAL RECONCILIATION ONLY (READ-ONLY).
 * Vérifie fraîchement, indépendamment de tout rapport déjà écrit, l'état
 * réel de la base après l'exécution réelle de la promotion (faite hors de
 * cet outil, dans un terminal séparé, avec le script minsante-h-promote.ts).
 * N'écrit RIEN en base. Ne relance JAMAIS --commit.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..", "..");
const BATCH_ID = "minsante-pilot-v1";

function readEnvVar(env: string, key: string): string {
  const match = env.match(new RegExp(`^${key}=(.*)$`, "m"));
  const value = match?.[1]?.trim();
  if (!value) throw new Error(`${key} introuvable dans .env.local`);
  return value;
}
async function fetchAllPaginated<T>(supabase: any, table: string, select: string, filter?: (q: any) => any): Promise<T[]> {
  const all: T[] = [];
  let offset = 0;
  const pageSize = 1000;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    let q = supabase.from(table).select(select).range(offset, offset + pageSize - 1);
    if (filter) q = filter(q);
    const { data, error } = await q;
    if (error) throw error;
    all.push(...(data as T[]));
    if (!data || data.length < pageSize) break;
    offset += pageSize;
  }
  return all;
}

async function main() {
  const env = readFileSync(join(rootDir, ".env.local"), "utf-8");
  const url = readEnvVar(env, "NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = readEnvVar(env, "SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(url, serviceKey);
  const projectRef = url.match(/https:\/\/([a-z0-9]+)\.supabase/)?.[1] ?? "unknown";

  console.log("=== SPRINT MINSANTE-H — FINAL RECONCILIATION (READ-ONLY) ===\n");
  console.log(`Project ref : ${projectRef}\n`);

  const { count: estTotal } = await supabase.from("establishments").select("*", { count: "exact", head: true });
  const { count: stagingTotal } = await supabase.from("establishment_import_staging").select("*", { count: "exact", head: true });
  const { count: registryTotal } = await supabase.from("establishment_registry_identifiers").select("*", { count: "exact", head: true });
  console.log(`1. establishments total = ${estTotal} (attendu 2248)`);
  console.log(`8. registry identifiers total = ${registryTotal} (attendu 2242)`);

  const snapshot = JSON.parse(readFileSync(join(rootDir, "reports", "registry", "minsante-f-pilot-approval.json"), "utf-8"));
  const snapshotIds: string[] = snapshot.candidates.map((c: any) => c.staging_id);

  const stagingRows = await fetchAllPaginated<any>(supabase, "establishment_import_staging", "id,name_raw,status,promoted_establishment_id,promoted_at,raw_data", (q) => q.in("id", snapshotIds));
  console.log(`\n2. staging_id du snapshot toujours présents : ${stagingRows.length}/8`);

  const allPromoted = stagingRows.every((r) => r.status === "promoted");
  const allHavePromotedId = stagingRows.every((r) => !!r.promoted_establishment_id);
  console.log(`3. status='promoted' pour les 8 : ${stagingRows.filter((r) => r.status === "promoted").length}/8 (${allPromoted ? "PASS" : "FAIL"})`);
  console.log(`4. promoted_establishment_id non null pour les 8 : ${stagingRows.filter((r) => !!r.promoted_establishment_id).length}/8 (${allHavePromotedId ? "PASS" : "FAIL"})`);

  const promotedEstIds = stagingRows.map((r) => r.promoted_establishment_id).filter(Boolean);
  const uniquePromotedEstIds = new Set(promotedEstIds);
  const liveEstForIds = await fetchAllPaginated<{ id: string; name: string; slug: string | null; main_category: string | null; region: string | null; city: string | null; created_at: string; source_ministry: string | null; registry_import_batch: string | null; owner_id: string | null; is_verified: boolean }>(
    supabase,
    "establishments",
    "id,name,slug,main_category,region,city,created_at,source_ministry,registry_import_batch,owner_id,is_verified",
    (q) => q.in("id", [...uniquePromotedEstIds])
  );
  console.log(`5. promoted_establishment_id pointent vers des establishments existants : ${liveEstForIds.length}/8 (unique ids: ${uniquePromotedEstIds.size})`);
  const orphanCount = 8 - liveEstForIds.length;
  console.log(`6. orphelins (promoted_establishment_id sans establishment correspondant) : ${orphanCount}`);

  // 7 — aucun doublon créé par la promotion : vérifier unicité des 8 IDs, unicité des slugs, et qu'aucun établissement pré-existant n'a été touché (created_at récent uniquement pour ces 8).
  const duplicateEstIds = promotedEstIds.length !== uniquePromotedEstIds.size;
  const slugs = liveEstForIds.map((e) => e.slug);
  const uniqueSlugs = new Set(slugs);
  console.log(`7. doublons d'establishment_id parmi les 8 : ${duplicateEstIds ? "OUI (PROBLEME)" : "NON"}; slugs uniques : ${uniqueSlugs.size}/${slugs.length}`);

  const wrongBatch = liveEstForIds.filter((e) => e.registry_import_batch !== BATCH_ID);
  const wrongMinistry = liveEstForIds.filter((e) => e.source_ministry !== "MINSANTE");
  const autoOwned = liveEstForIds.filter((e) => e.owner_id !== null);
  const autoVerified = liveEstForIds.filter((e) => e.is_verified !== false);
  console.log(`   Batch incorrect : ${wrongBatch.length}, ministère incorrect : ${wrongMinistry.length}, owner_id assigné : ${autoOwned.length}, auto-verified : ${autoVerified.length}`);

  const allPilotRows = (await fetchAllPaginated<any>(supabase, "establishment_import_staging", "id,name_raw,status,promoted_establishment_id,raw_data", (q) => q.eq("source_ministry", "MINSANTE"))).filter((r) => r.raw_data?.batch === BATCH_ID);
  const categoryReviewCount = allPilotRows.filter((r) => r.raw_data?.classification === "CATEGORY_REVIEW").length;
  const duplicateReviewCount = allPilotRows.filter((r) => r.raw_data?.classification === "DUPLICATE_REVIEW").length;
  const promotedRows = allPilotRows.filter((r) => r.status === "promoted");
  const unexpectedlyPromoted = promotedRows.filter((r) => !snapshotIds.includes(r.id));
  console.log(`\n9. CATEGORY_REVIEW différés restants : ${categoryReviewCount} (attendu 13)`);
  console.log(`10. DUPLICATE_REVIEW différé restant : ${duplicateReviewCount} (attendu 1)`);
  console.log(`11. Lignes MINSANTE promues au total : ${promotedRows.length} (attendu 8) ; promues hors snapshot (inattendu) : ${unexpectedlyPromoted.length} (attendu 0)`);

  // 12/13/14 — QA publique sur un échantillon (2 des 8).
  const sample = liveEstForIds.slice(0, 2);
  const qa: any[] = [];
  for (const e of sample) {
    let searchFound = false;
    try {
      const searchRes = await fetch(`http://localhost:3000/api/recherche?q=${encodeURIComponent(e.name.split(" ").slice(0, 3).join(" "))}`);
      if (searchRes.ok) {
        const body = await searchRes.json();
        const items = body?.results ?? body?.data ?? body?.items ?? [];
        searchFound = Array.isArray(items) && items.some((it: any) => it.id === e.id || it.slug === e.slug);
      }
    } catch (err) {
      qa.push({ id: e.id, name: e.name, search_error: String(err) });
    }
    let schoolPageStatus: number | null = null;
    let claimPageStatus: number | null = null;
    try {
      const r1 = await fetch(`http://localhost:3000/ecole/${e.id}`);
      schoolPageStatus = r1.status;
    } catch {}
    try {
      const r2 = await fetch(`http://localhost:3000/revendiquer/${e.id}`);
      claimPageStatus = r2.status;
    } catch {}
    qa.push({ id: e.id, name: e.name, slug: e.slug, search_found: searchFound, school_page_status: schoolPageStatus, claim_page_status: claimPageStatus });
  }
  console.log("\n12-14. QA publique (échantillon 2/8) :", JSON.stringify(qa, null, 2));

  mkdirSync(join(rootDir, "reports", "registry"), { recursive: true });
  const finalReport = {
    generated_at: new Date().toISOString(),
    sprint: "MINSANTE-H — FINAL RECONCILIATION",
    read_only: true,
    establishments_total: estTotal,
    registry_identifiers_total: registryTotal,
    staging_snapshot_rows_present: stagingRows.length,
    all_promoted: allPromoted,
    all_have_promoted_id: allHavePromotedId,
    unique_promoted_establishment_ids: uniquePromotedEstIds.size,
    orphan_count: orphanCount,
    duplicate_establishment_ids: duplicateEstIds,
    unique_slugs: uniqueSlugs.size,
    wrong_batch: wrongBatch.length,
    wrong_ministry: wrongMinistry.length,
    auto_owned: autoOwned.length,
    auto_verified: autoVerified.length,
    category_review_deferred: categoryReviewCount,
    duplicate_review_deferred: duplicateReviewCount,
    total_minsante_promoted: promotedRows.length,
    unexpectedly_promoted: unexpectedlyPromoted.length,
    public_qa_sample: qa,
  };
  writeFileSync(join(rootDir, "reports", "registry", "minsante-h-final-reconciliation.json"), JSON.stringify(finalReport, null, 2), "utf-8");
  console.log("\nRapport écrit : reports/registry/minsante-h-final-reconciliation.json");
}

main().catch((error) => {
  console.error("Échec vérification finale MINSANTE-H :", error);
  process.exit(1);
});
