import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * SPRINT P.5 — Pipeline canonique du registre national :
 *
 *   COLLECT -> NORMALIZE -> STAGING -> MATCH -> REVIEW -> APPROVE -> PROMOTE
 *   -> WRITE promoted_establishment_id -> AUDIT REPORT
 *
 * Une promotion n'est considérée terminée que si les trois existent :
 * la ligne live, le lien staging, et le rapport d'audit.
 *
 * Ce script répare UNIQUEMENT l'avant-dernière étape pour le batch
 * "minesec-master-v1-promotion-p3", exécuté hors de tout script traçé
 * (556 établissements déjà en production, staging marqué "promoted", mais
 * promoted_establishment_id resté vide et aucun rapport écrit).
 *
 * INTERDIT dans ce script : toute écriture vers `establishments`. Lecture
 * seule sur cette table ; la seule table modifiée est
 * `establishment_import_staging` (colonnes promoted_establishment_id /
 * promoted_at exclusivement).
 *
 * Rapprochement STRICT uniquement par
 * staging.official_identifier == establishments.official_id
 * (+ source_ministry = MINESEC). Aucun fuzzy matching, aucun matching nom.
 *
 * Usage :
 *   tsx reconcile-promotion-p3.ts --dry-run   (défaut)
 *   tsx reconcile-promotion-p3.ts --commit
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..", "..");

const EXPECTED_PROJECT_REF = "umcwwynrftidytxgqkwi";
const BATCH = "minesec-master-v1-promotion-p3";

function readEnvVar(env: string, key: string): string {
  const match = env.match(new RegExp(`^${key}=(.*)$`, "m"));
  const value = match?.[1]?.trim();
  if (!value) throw new Error(`${key} introuvable dans .env.local`);
  return value;
}

function norm(v: string | null | undefined): string {
  return (v ?? "").trim().toUpperCase();
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

interface LiveEstablishment {
  id: string;
  official_id: string | null;
  source_ministry: string | null;
  registry_import_batch: string | null;
  created_at: string;
  owner_id: string | null;
  is_verified: boolean;
  subscription_plan: string | null;
  forfait: string | null;
}

interface StagingRow {
  id: string;
  official_identifier: string | null;
  fingerprint: string;
  status: string;
  promoted_establishment_id: string | null;
  promoted_at: string | null;
}

async function productionSnapshot(url: string, key: string) {
  const [establishments, admissions] = await Promise.all([
    fetchAllPaginated<{ owner_id: string | null; is_verified: boolean; subscription_plan: string | null; forfait: string | null }>(
      url,
      key,
      "/rest/v1/establishments?select=owner_id,is_verified,subscription_plan,forfait"
    ),
    fetchAllPaginated<{ id: string }>(url, key, "/rest/v1/admissions_history?select=id"),
  ]);
  const planDist: Record<string, number> = {};
  const forfaitDist: Record<string, number> = {};
  for (const e of establishments) {
    const p = e.subscription_plan ?? "(null)";
    const f = e.forfait ?? "(null)";
    planDist[p] = (planDist[p] ?? 0) + 1;
    forfaitDist[f] = (forfaitDist[f] ?? 0) + 1;
  }
  return {
    total: establishments.length,
    ownerAssigned: establishments.filter((e) => e.owner_id).length,
    verified: establishments.filter((e) => e.is_verified).length,
    subscriptionPlanDist: planDist,
    forfaitDist,
    admissionsCount: admissions.length,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const commit = args.includes("--commit");

  const env = readFileSync(join(rootDir, ".env.local"), "utf-8");
  const url = readEnvVar(env, "NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = readEnvVar(env, "SUPABASE_SERVICE_ROLE_KEY");
  const projectRef = new URL(url).hostname.split(".")[0];

  console.log(`Project ref détecté : ${projectRef}`);
  if (projectRef !== EXPECTED_PROJECT_REF) {
    throw new Error(`STOP — project ref inattendu (${projectRef} != ${EXPECTED_PROJECT_REF}). Aucune action.`);
  }
  if (commit) {
    console.log("Mode : --commit (écriture staging.promoted_establishment_id / promoted_at UNIQUEMENT)");
  } else {
    console.log("Mode : --dry-run (par défaut, aucune écriture)");
  }

  // ── §3 snapshot ──────────────────────────────────────────────────────────
  const [allStaging, liveBatch, prodBefore] = await Promise.all([
    fetchAllPaginated<{ status: string }>(url, serviceKey, "/rest/v1/establishment_import_staging?select=status"),
    fetchAllPaginated<LiveEstablishment>(
      url,
      serviceKey,
      `/rest/v1/establishments?registry_import_batch=eq.${BATCH}&select=id,official_id,source_ministry,registry_import_batch,created_at,owner_id,is_verified,subscription_plan,forfait`
    ),
    productionSnapshot(url, serviceKey),
  ]);

  const stagingByStatus: Record<string, number> = {};
  for (const r of allStaging) stagingByStatus[r.status] = (stagingByStatus[r.status] ?? 0) + 1;

  console.log("\n=== §3 SNAPSHOT AVANT RÉPARATION ===");
  console.log(`establishments total: ${prodBefore.total} (attendu 1277)`);
  console.log(`staging total: ${allStaging.length} (attendu 1251)`);
  console.log(`staging par statut:`, stagingByStatus, "(attendu promoted=556, duplicate_exact=673, duplicate_review=6, ready=16)");

  if (prodBefore.total !== 1277 || allStaging.length !== 1251 || stagingByStatus.promoted !== 556) {
    throw new Error("STOP — divergence sur le snapshot §3 par rapport à l'attendu. Aucune action.");
  }

  // ── §4-5 : les deux ensembles de 556 ─────────────────────────────────────
  const stagingPromoted = await fetchAllPaginated<StagingRow>(
    url,
    serviceKey,
    "/rest/v1/establishment_import_staging?status=eq.promoted&select=id,official_identifier,fingerprint,status,promoted_establishment_id,promoted_at"
  );

  console.log(`\n=== §4-5 ENSEMBLES ===`);
  console.log(`staging promoted: ${stagingPromoted.length} (attendu 556)`);
  console.log(`establishments batch ${BATCH}: ${liveBatch.length} (attendu 556)`);

  // ── §6-7 : match strict + garde-fous ─────────────────────────────────────
  const liveByOfficialId = new Map<string, LiveEstablishment[]>();
  for (const e of liveBatch) {
    if (e.source_ministry !== "MINESEC") continue;
    const k = norm(e.official_id);
    if (!k) continue;
    if (!liveByOfficialId.has(k)) liveByOfficialId.set(k, []);
    liveByOfficialId.get(k)!.push(e);
  }
  const stagingByOfficialId = new Map<string, StagingRow[]>();
  for (const s of stagingPromoted) {
    const k = norm(s.official_identifier);
    if (!stagingByOfficialId.has(k)) stagingByOfficialId.set(k, []);
    stagingByOfficialId.get(k)!.push(s);
  }

  const stagingUniqueIds = stagingByOfficialId.size;
  const liveUniqueIds = liveByOfficialId.size;
  const multipleOnLiveSide = [...liveByOfficialId.values()].filter((v) => v.length > 1).length;
  const multipleOnStagingSide = [...stagingByOfficialId.values()].filter((v) => v.length > 1).length;

  let exactMatches = 0;
  let missing = 0;
  let alreadyLinked = 0;
  let wouldLink = 0;
  const toLink: { stagingId: string; establishmentId: string; existingPromotedAt: string | null; liveCreatedAt: string }[] = [];
  const unexpected: string[] = [];

  for (const s of stagingPromoted) {
    const k = norm(s.official_identifier);
    const liveMatches = liveByOfficialId.get(k) ?? [];
    if (liveMatches.length === 1) {
      exactMatches++;
      const live = liveMatches[0];
      if (s.promoted_establishment_id) {
        if (s.promoted_establishment_id === live.id) {
          alreadyLinked++;
        } else {
          unexpected.push(`${s.id} déjà lié à ${s.promoted_establishment_id}, ne correspond pas au match strict ${live.id}`);
        }
      } else {
        wouldLink++;
        toLink.push({ stagingId: s.id, establishmentId: live.id, existingPromotedAt: s.promoted_at, liveCreatedAt: live.created_at });
      }
    } else if (liveMatches.length === 0) {
      missing++;
    } else {
      unexpected.push(`${s.id} (official_id=${s.official_identifier}) correspond à ${liveMatches.length} établissements`);
    }
  }

  console.log("\n=== §6-8 RECONCILIATION DRY RUN ===");
  console.log(`Staging promoted: ${stagingPromoted.length}`);
  console.log(`Live P3: ${liveBatch.length}`);
  console.log(`Exact official-id matches: ${exactMatches}`);
  console.log(`Already linked: ${alreadyLinked}`);
  console.log(`Would link: ${wouldLink}`);
  console.log(`Missing live: ${missing}`);
  console.log(`Multiple matches (live side): ${multipleOnLiveSide}`);
  console.log(`Multiple matches (staging side): ${multipleOnStagingSide}`);
  console.log(`Unexpected: ${unexpected.length}`);
  if (unexpected.length) console.log(unexpected.join("\n"));
  console.log(`\nUnique official_ids — staging: ${stagingUniqueIds}, live: ${liveUniqueIds}`);

  const guardrailsOk =
    stagingPromoted.length === 556 &&
    liveBatch.length === 556 &&
    stagingUniqueIds === 556 &&
    liveUniqueIds === 556 &&
    exactMatches === 556 &&
    missing === 0 &&
    multipleOnLiveSide === 0 &&
    multipleOnStagingSide === 0 &&
    unexpected.length === 0;

  if (!guardrailsOk) {
    throw new Error("STOP — au moins une anomalie de garde-fou §7. Aucune écriture. Voir détail ci-dessus.");
  }

  console.log("\n✅ Garde-fous §7 tous verts. 556 correspondances 1:1 confirmées.");

  if (!commit) {
    console.log("\nDry-run terminé. Relancer avec --commit pour écrire les liens (staging uniquement).");
    return;
  }

  // ── §9-10 : réparation — UPDATE staging uniquement, jamais establishments ─
  console.log(`\n=== §9 RÉPARATION (${toLink.length} lien(s) à écrire, ${alreadyLinked} déjà correct(s)) ===`);
  let done = 0;
  let failed = 0;
  for (const link of toLink) {
    const promotedAt = link.existingPromotedAt ?? link.liveCreatedAt;
    const res = await fetch(`${url}/rest/v1/establishment_import_staging?id=eq.${link.stagingId}`, {
      method: "PATCH",
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ promoted_establishment_id: link.establishmentId, promoted_at: promotedAt }),
    });
    if (res.ok) done++;
    else {
      failed++;
      console.error(`  ÉCHEC staging ${link.stagingId} -> HTTP ${res.status}`);
    }
    if ((done + failed) % 100 === 0) console.log(`  ... ${done + failed}/${toLink.length}`);
  }
  console.log(`Terminé — ${done}/${toLink.length} lien(s) écrit(s), ${failed} échec(s).`);
  if (failed > 0) throw new Error(`STOP post-repair — ${failed} PATCH staging ont échoué. Ne pas considérer la réparation comme complète.`);

  // ── §13 post-repair validation ────────────────────────────────────────────
  const stagingAfter = await fetchAllPaginated<StagingRow>(
    url,
    serviceKey,
    "/rest/v1/establishment_import_staging?status=eq.promoted&select=id,official_identifier,promoted_establishment_id,promoted_at"
  );
  const linkedAfter = stagingAfter.filter((r) => r.promoted_establishment_id).length;
  const linkedUniqueAfter = new Set(stagingAfter.map((r) => r.promoted_establishment_id).filter(Boolean)).size;
  const liveIds = new Set(liveBatch.map((e) => e.id));
  const allLinksPointToBatch = stagingAfter.every((r) => r.promoted_establishment_id && liveIds.has(r.promoted_establishment_id));

  console.log("\n=== §13 POST-REPAIR VALIDATION ===");
  console.log(`staging promoted: ${stagingAfter.length} (attendu 556)`);
  console.log(`promoted_establishment_id non null: ${linkedAfter} (attendu 556)`);
  console.log(`promoted_establishment_id unique: ${linkedUniqueAfter} (attendu 556)`);
  console.log(`tous les liens pointent vers le batch ${BATCH}: ${allLinksPointToBatch}`);

  if (stagingAfter.length !== 556 || linkedAfter !== 556 || linkedUniqueAfter !== 556 || !allLinksPointToBatch) {
    throw new Error("STOP — la validation post-réparation §13 a échoué.");
  }

  // ── §14 production safety — establishments inchangé ──────────────────────
  const prodAfter = await productionSnapshot(url, serviceKey);
  console.log("\n=== §14 PRODUCTION SAFETY ===");
  console.log(`establishments before: ${prodBefore.total} / after: ${prodAfter.total}`);
  console.log(`owner assigned before: ${prodBefore.ownerAssigned} / after: ${prodAfter.ownerAssigned}`);
  console.log(`verified before: ${prodBefore.verified} / after: ${prodAfter.verified}`);
  console.log(`subscription_plan before:`, prodBefore.subscriptionPlanDist, `/ after:`, prodAfter.subscriptionPlanDist);
  console.log(`forfait before:`, prodBefore.forfaitDist, `/ after:`, prodAfter.forfaitDist);
  console.log(`admissions_history before: ${prodBefore.admissionsCount} / after: ${prodAfter.admissionsCount}`);

  const productionUnchanged =
    prodBefore.total === prodAfter.total &&
    prodBefore.ownerAssigned === prodAfter.ownerAssigned &&
    prodBefore.verified === prodAfter.verified &&
    JSON.stringify(prodBefore.subscriptionPlanDist) === JSON.stringify(prodAfter.subscriptionPlanDist) &&
    JSON.stringify(prodBefore.forfaitDist) === JSON.stringify(prodAfter.forfaitDist) &&
    prodBefore.admissionsCount === prodAfter.admissionsCount;

  if (!productionUnchanged) {
    throw new Error("STOP — establishments a changé pendant la réparation staging. Ne devrait jamais arriver (ce script ne le touche jamais en écriture). Investiguer immédiatement.");
  }
  console.log("✅ establishments strictement inchangé.");

  // ── §15-16 rapports reconstruits ──────────────────────────────────────────
  mkdirSync(join(rootDir, "reports", "registry"), { recursive: true });
  const reconciliationDate = new Date().toISOString();

  const preSummaryPath = join(rootDir, "reports", "registry", "pre-promotion-v1-summary.json");
  let preSummary: Record<string, unknown> = {};
  try {
    preSummary = JSON.parse(readFileSync(preSummaryPath, "utf-8"));
  } catch {
    // absent, on repart d'un objet vide
  }
  writeFileSync(
    preSummaryPath,
    JSON.stringify({ ...preSummary, reconstructed_after_execution: true, reconciliation_date: reconciliationDate }, null, 2),
    "utf-8"
  );

  const createdIds = liveBatch
    .slice()
    .sort((a, b) => (a.official_id ?? "").localeCompare(b.official_id ?? ""))
    .map((e) => ({
      establishment_id: e.id,
      official_id: e.official_id,
      registry_import_batch: e.registry_import_batch,
      created_at: e.created_at,
    }));
  writeFileSync(
    join(rootDir, "reports", "registry", "promotion-master-v1-created-ids.json"),
    JSON.stringify(
      { reconstructed_after_execution: true, reconciliation_date: reconciliationDate, registry_import_batch: BATCH, count: createdIds.length, establishments: createdIds },
      null,
      2
    ),
    "utf-8"
  );

  const promotionSummary = {
    reconstructed_after_execution: true,
    reconciliation_date: reconciliationDate,
    project_ref: projectRef,
    registry_import_batch: BATCH,
    eligible: 556,
    inserted: liveBatch.length,
    skipped: 0,
    failed: 0,
    production_before: prodBefore.total - liveBatch.length,
    production_after: prodBefore.total,
    staging_promoted: stagingAfter.length,
    official_id_duplicates: 0,
    note:
      "La promotion elle-même (INSERT establishments) a été exécutée hors de tout script tracé dans ce repo, avant SPRINT P.5. Ce rapport est reconstruit a posteriori à partir de l'état réel de la base (établissements du batch + liens staging réparés par reconcile-promotion-p3.ts), pas d'un log d'exécution original.",
  };
  writeFileSync(
    join(rootDir, "reports", "registry", "promotion-master-v1-summary.json"),
    JSON.stringify(promotionSummary, null, 2),
    "utf-8"
  );

  console.log("\n=== §15-16 Rapports écrits ===");
  console.log("- reports/registry/pre-promotion-v1-summary.json (mis à jour, reconstructed_after_execution=true)");
  console.log("- reports/registry/promotion-master-v1-summary.json (reconstruit)");
  console.log("- reports/registry/promotion-master-v1-created-ids.json (reconstruit, 556 entrées)");
}

main().catch((error) => {
  console.error("\n❌", error instanceof Error ? error.message : error);
  process.exit(1);
});
