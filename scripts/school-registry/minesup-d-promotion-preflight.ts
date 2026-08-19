import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { matchCandidate, findIdentifierCollisions } from "./lib/matching/engine";
import type { MatchTarget } from "./lib/matching/types";
import { generateMinesupPilotReports } from "./lib/minesupPilotReports";

/**
 * SPRINT MINESUP-D — PRE-FLIGHT read-only (aucune écriture establishments,
 * staging, ou establishment_registry_identifiers). Revalide intégralement
 * les 29 candidats CLEAN_APPROVABLE de MINESUP-C contre l'état ACTUEL de
 * la base — jamais un résultat historique réutilisé sans preuve fraîche.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..", "..");
const OPERATOR = "jean-merlain";
const BATCH_ID = "minesup-pilot-v1";
const EXPECTED_CHECKSUM_FROM_PROMPT = "f1f12668644215a36a1f5e162fab196de25be01d959033ac18547cd4d28f1fdd";

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
async function fetchAllPaginated<T>(supabase: any, table: string, select: string, filter?: (q: any) => any): Promise<T[]> {
  const all: T[] = [];
  let offset = 0; const pageSize = 1000;
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

  console.log("=== SPRINT MINESUP-D — CONTROLLED PROMOTION PRE-FLIGHT (READ-ONLY) ===\n");

  // ── 1. Baseline fraîche ───────────────────────────────────────────────
  const { count: estBefore } = await supabase.from("establishments").select("*", { count: "exact", head: true });
  const { count: stagingBefore } = await supabase.from("establishment_import_staging").select("*", { count: "exact", head: true });
  const { count: registryBefore } = await supabase.from("establishment_registry_identifiers").select("*", { count: "exact", head: true });
  console.log(`Baseline : establishments=${estBefore}, staging=${stagingBefore}, registry_identifiers=${registryBefore}`);

  // ── 2. Recharger la population pilote depuis la base (jamais depuis un souvenir) ──
  const pilotRows = await fetchAllPaginated<any>(supabase, "establishment_import_staging", "id,name_raw,region,city,raw_data,status,education_family,source_url,duplicate_of_establishment_id,created_at", (q) => q.eq("source_ministry", "MINESUP")).then((rows) =>
    rows.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
  );
  console.log(`\nPopulation pilote rechargée : ${pilotRows.length} (attendu 32)`);
  const byStatusFresh = new Map<string, number>();
  for (const r of pilotRows) byStatusFresh.set(r.status, (byStatusFresh.get(r.status) || 0) + 1);
  console.log("Répartition fraîche par statut :", Object.fromEntries(byStatusFresh));
  if (pilotRows.length !== 32) {
    console.log(`INCOHÉRENCE : population pilote = ${pilotRows.length}, attendu 32. STOP.`);
    process.exit(1);
  }

  // ── 3. Intégrité du snapshot d'approbation — recalcul déterministe ────
  const oldApprovalRaw = readFileSync(join(rootDir, "reports", "registry", "minesup-pilot-v1-approval.json"), "utf-8");
  const oldApproval = JSON.parse(oldApprovalRaw);
  const oldChecksum = oldApproval.checksum;
  console.log(`\nChecksum stocké dans minesup-pilot-v1-approval.json : ${oldChecksum}`);
  console.log(`Checksum attendu (fourni dans le prompt MINESUP-D) : ${EXPECTED_CHECKSUM_FROM_PROMPT}`);

  // Recalcul frais — MÊME méthode déterministe (generateMinesupPilotReports), contre l'état ACTUEL de la DB.
  const freshReportSummary = await generateMinesupPilotReports(supabase, rootDir, OPERATOR, BATCH_ID);
  const newApproval = JSON.parse(readFileSync(join(rootDir, "reports", "registry", "minesup-pilot-v1-approval.json"), "utf-8"));
  const freshChecksum = newApproval.checksum;
  console.log(`Checksum recalculé (état actuel DB, même méthode) : ${freshChecksum}`);

  const checksumValid = freshChecksum === oldChecksum && freshChecksum === EXPECTED_CHECKSUM_FROM_PROMPT;
  console.log(`Checksum valide (3 valeurs identiques) : ${checksumValid}`);
  if (!checksumValid) {
    console.log("\nCHECKSUM INVALIDE — STOP. Ne pas reconstruire silencieusement pour faire correspondre.");
    process.exit(1);
  }
  console.log(`\nSnapshot candidates: ${newApproval.candidate_count} (attendu 29)`);
  if (newApproval.candidate_count !== 29) {
    console.log("INCOHÉRENCE : candidate_count != 29. STOP.");
    process.exit(1);
  }

  // ── 4. Revalidation extraction safety par candidat ────────────────────
  let piiResidual = 0;
  const piiCheckDetail: Array<{ staging_id: string; name: string; pii_field_present: boolean; url_pii_flagged: boolean }> = [];
  for (const r of pilotRows) {
    const raw = r.raw_data as any;
    const piiFieldPresent = !!raw?.pii_field_present_but_not_collected;
    const sourceUrlRedacted = typeof r.source_url === "string" && r.source_url.startsWith("[REDACTED");
    // "Résidu PII" = une VALEUR de champ personnel effectivement stockée quelque part — jamais le cas ici par construction (seule la présence booléenne est conservée), vérifié explicitement :
    const rawDataStr = JSON.stringify(raw);
    const looksLikeLeakedName = /nom du promoteur\s*:\s*[a-z]/i.test(rawDataStr) && !/REDACTED/i.test(rawDataStr);
    if (looksLikeLeakedName) piiResidual++;
    piiCheckDetail.push({ staging_id: r.id, name: r.name_raw, pii_field_present: piiFieldPresent, url_pii_flagged: sourceUrlRedacted });
  }
  console.log(`\nRevalidation PII : ${pilotRows.length} candidats vérifiés, résidu PII = ${piiResidual} (attendu 0)`);
  if (piiResidual > 0) {
    console.log("FUITE PII DÉTECTÉE — STOP.");
    process.exit(1);
  }

  // ── 5. Rejouer le matching contre l'état ACTUEL (jamais le résultat historique) ──
  interface LiveEst { id: string; name: string; region: string | null; city: string | null; main_category: string | null; owner_id: string | null; is_verified: boolean; }
  interface RegistryIdRow { establishment_id: string; registry: string; identifier: string; identifier_type: string | null; }
  const liveEst = await fetchAllPaginated<LiveEst>(supabase, "establishments", "id,name,region,city,main_category,owner_id,is_verified");
  const registryIds = await fetchAllPaginated<RegistryIdRow>(supabase, "establishment_registry_identifiers", "establishment_id,registry,identifier,identifier_type");
  const allStaging = await fetchAllPaginated<{ id: string; name_raw: string; region: string | null; city: string | null; education_family: string | null }>(supabase, "establishment_import_staging", "id,name_raw,region,city,education_family");

  function mainCategoryToEducationFamily(mainCategory: string | null): string | null {
    if (mainCategory === "superieur") return "higher_education";
    return mainCategory;
  }
  const idsByEstablishment = new Map<string, { registry: string; identifier: string; identifierType?: string | null }[]>();
  for (const r of registryIds) {
    if (!idsByEstablishment.has(r.establishment_id)) idsByEstablishment.set(r.establishment_id, []);
    idsByEstablishment.get(r.establishment_id)!.push({ registry: r.registry, identifier: r.identifier, identifierType: r.identifier_type });
  }
  const liveTargets: MatchTarget[] = liveEst.map((e) => ({ id: e.id, name: e.name, region: e.region, city: e.city, category: mainCategoryToEducationFamily(e.main_category), identifiers: idsByEstablishment.get(e.id) ?? [] }));

  const eligibleCandidates = pilotRows.filter((r) => r.status === "ready");
  const sourceReviewCandidates = pilotRows.filter((r) => r.status !== "ready");
  console.log(`\nCandidats éligibles (status=ready) : ${eligibleCandidates.length} (attendu 29)`);
  console.log(`Candidats SOURCE_REVIEW exclus : ${sourceReviewCandidates.length} (attendu 3)`);
  if (eligibleCandidates.length !== 29 || sourceReviewCandidates.length !== 3) {
    console.log("INCOHÉRENCE de classification fraîche. STOP.");
    process.exit(1);
  }

  interface RevalResult {
    row: any; matchLevel: string; matchedTargetId: string | null; matchedTargetName: string | null; matchReason: string;
    decision: "ELIGIBLE" | "ALREADY_LIVE" | "DUPLICATE_REVIEW" | "IDENTIFIER_COLLISION" | "SOURCE_REVIEW" | "IDENTITY_REVIEW" | "INVALID";
    identifierCount: number; identifierCollision: boolean;
  }
  const revalResults: RevalResult[] = [];
  const tally = { exact_identifier: 0, exact_identity: 0, strong: 0, probable: 0, ambiguous: 0, new: 0 };

  const pilotBatchIds = new Set(pilotRows.map((p) => p.id));
  for (const r of pilotRows) {
    const isSourceReview = r.status !== "ready";
    // Cibles staging = tout SAUF le batch pilote lui-même. Les 32 candidats sont des
    // FRÈRES co-promus, pas des "données existantes" à dédupliquer entre eux — un
    // candidat ne doit jamais être comparé à son propre lot (bug réel trouvé ici :
    // "BUIST" (Bamenda) matchait "CUIST" (Kumbo), deux instituts DIFFÉRENTS du même
    // batch, via un chevauchement générique "university/institute/science/technology"
    // avec géographie CONTRADICTOIRE — jamais un vrai signal de doublon).
    const stagingTargets: MatchTarget[] = allStaging.filter((s) => !pilotBatchIds.has(s.id)).map((s) => ({ id: `staging:${s.id}`, name: s.name_raw, region: s.region, city: s.city, category: s.education_family, identifiers: [] }));
    const allTargets = [...liveTargets, ...stagingTargets];
    const raw = r.raw_data as any;
    const candidate = { name: r.name_raw, region: r.region, city: r.city, category: r.education_family, identifiers: [] };
    const match = matchCandidate(candidate, allTargets);

    if (match.level === "EXACT_IDENTIFIER") tally.exact_identifier++;
    else if (match.level === "EXACT_IDENTITY") tally.exact_identity++;
    else if (match.level === "STRONG_MATCH") tally.strong++;
    else if (match.level === "PROBABLE_MATCH") tally.probable++;
    else if (match.level === "AMBIGUOUS") tally.ambiguous++;
    else tally.new++;

    const identifierCount = (raw?.identifiers?.creation_order_raw ? 1 : 0) + (raw?.identifiers?.opening_authorization_raw ? 1 : 0);

    let decision: RevalResult["decision"];
    if (isSourceReview) {
      decision = "SOURCE_REVIEW";
    } else if (match.level === "EXACT_IDENTIFIER" || match.level === "EXACT_IDENTITY") {
      decision = "ALREADY_LIVE";
    } else if (match.level === "STRONG_MATCH" || match.level === "PROBABLE_MATCH" || match.level === "AMBIGUOUS") {
      decision = "DUPLICATE_REVIEW";
    } else {
      decision = "ELIGIBLE";
    }

    revalResults.push({ row: r, matchLevel: match.level, matchedTargetId: match.target?.id ?? null, matchedTargetName: match.target?.name ?? null, matchReason: match.reason, decision, identifierCount, identifierCollision: false });
  }

  console.log("\nMatching revalidé (état actuel) :", tally);

  // ── 6. Protection des établissements existants — aucune écriture, juste classification ──
  const alreadyLive = revalResults.filter((r) => r.decision === "ALREADY_LIVE");
  const duplicateReview = revalResults.filter((r) => r.decision === "DUPLICATE_REVIEW");
  console.log(`Already live : ${alreadyLive.length} (attendu 0) | Duplicate review : ${duplicateReview.length} (attendu 0)`);

  // ── 7/8. Préflight de collision d'identifiants — contre establishment_registry_identifiers réel ──
  const existingIdentifierKeys = new Set(registryIds.map((r) => `${r.registry}|${r.identifier_type ?? ""}|${r.identifier.trim().toUpperCase()}`));
  let exactExistingIdentifier = 0, crossEstablishmentCollision = 0, safeNewIdentifiers = 0;
  const identifierPlanRows: Array<{ staging_id: string; name: string; identifier_type: string; identifier: string; status: string }> = [];

  for (const r of revalResults) {
    if (r.decision !== "ELIGIBLE") continue;
    const raw = r.row.raw_data as any;
    const candidates: Array<{ type: string; value: string | null }> = [
      { type: "CREATION_ORDER", value: raw?.identifiers?.creation_order_raw ?? null },
      { type: "OPENING_AUTHORIZATION", value: raw?.identifiers?.opening_authorization_raw ?? null },
    ];
    for (const c of candidates) {
      if (!c.value) continue;
      const key = `MINESUP_IPES|${c.type}|${c.value.trim().toUpperCase()}`;
      const status = existingIdentifierKeys.has(key) ? "EXACT_EXISTING_IDENTIFIER (établissement inconnu tant que non promu — collision potentielle à traiter comme critique)" : "SAFE_NEW";
      if (status.startsWith("EXACT_EXISTING")) {
        exactExistingIdentifier++;
        crossEstablishmentCollision++; // aucun de ces 29 candidats n'a encore d'establishment_id -> toute correspondance existante EST une collision potentielle par définition
        r.identifierCollision = true;
      } else {
        safeNewIdentifiers++;
      }
      identifierPlanRows.push({ staging_id: r.row.id, name: r.row.name_raw, identifier_type: c.type, identifier: c.value, status });
    }
  }
  console.log(`\nIdentifier collision preflight : exact_existing=${exactExistingIdentifier}, cross_establishment_collision=${crossEstablishmentCollision}, safe_new=${safeNewIdentifiers}`);
  if (crossEstablishmentCollision > 0) {
    console.log(`ATTENTION : ${crossEstablishmentCollision} collision(s) d'identifiant détectée(s) — candidats concernés exclus de READY TO COMMIT.`);
  }

  // Reclasser en IDENTIFIER_COLLISION les candidats concernés.
  for (const r of revalResults) {
    if (r.decision === "ELIGIBLE" && r.identifierCollision) r.decision = "IDENTIFIER_COLLISION";
  }
  const finalEligible = revalResults.filter((r) => r.decision === "ELIGIBLE");
  const identifierCollisionCandidates = revalResults.filter((r) => r.decision === "IDENTIFIER_COLLISION");
  console.log(`\nÉligibles FINAUX (après exclusion collisions) : ${finalEligible.length}`);

  // ── 10. Classification récapitulative ──────────────────────────────────
  const classification = {
    eligible: finalEligible.length,
    already_live: alreadyLive.length,
    duplicate_review: duplicateReview.length,
    identifier_collision: identifierCollisionCandidates.length,
    source_review: sourceReviewCandidates.length,
    identity_review: 0,
    invalid: 0,
  };
  console.log("\nClassification finale :", classification);

  // ── 11/12. DRY RUN + invariants ────────────────────────────────────────
  const wouldInsertEstablishments = finalEligible.length;
  const wouldLinkStaging = finalEligible.length;
  const wouldInsertIdentifiers = safeNewIdentifiers;
  const wouldUpdateEstablishments = 0;
  const wouldDeleteEstablishments = 0;
  const expectedEstablishmentsAfter = (estBefore ?? 0) + wouldInsertEstablishments;

  console.log("\n=== MINESUP-D CONTROLLED PROMOTION DRY RUN ===");
  console.log(`Snapshot candidates: ${newApproval.candidate_count}`);
  console.log(`Checksum: ${freshChecksum}`);
  console.log(`Live eligible: ${finalEligible.length}`);
  console.log(`Already live: ${alreadyLive.length}`);
  console.log(`Duplicate review: ${duplicateReview.length}`);
  console.log(`Identifier conflicts: ${identifierCollisionCandidates.length}`);
  console.log(`Source review excluded: ${sourceReviewCandidates.length}`);
  console.log(`Would insert establishments: ${wouldInsertEstablishments}`);
  console.log(`Would update establishments: ${wouldUpdateEstablishments}`);
  console.log(`Would delete establishments: ${wouldDeleteEstablishments}`);
  console.log(`Would link staging: ${wouldLinkStaging}`);
  console.log(`Would insert registry identifiers: ${wouldInsertIdentifiers}`);
  console.log(`Expected establishments after: ${expectedEstablishmentsAfter}`);

  const readyToCommit =
    wouldInsertEstablishments === wouldLinkStaging &&
    wouldUpdateEstablishments === 0 &&
    wouldDeleteEstablishments === 0 &&
    identifierCollisionCandidates.length === 0 &&
    piiResidual === 0;
  console.log(`\nREADY TO COMMIT : ${readyToCommit ? "YES" : "NO"}`);

  // ── 18. Rapports ───────────────────────────────────────────────────────
  mkdirSync(join(rootDir, "reports", "registry"), { recursive: true });

  const preflightReport = {
    sprint: "MINESUP-D", operator: OPERATOR, generated_at: new Date().toISOString(),
    database: { establishments_before: estBefore, staging_before: stagingBefore, registry_identifiers_before: registryBefore },
    pilot_revalidation: { snapshot_candidates: newApproval.candidate_count, live_eligible_before_collision_check: 29, source_review_excluded: sourceReviewCandidates.length },
    approval: { checksum_expected_prompt: EXPECTED_CHECKSUM_FROM_PROMPT, checksum_stored: oldChecksum, checksum_recomputed: freshChecksum, valid: checksumValid },
    pii: { candidates_checked: pilotRows.length, residual: piiResidual, safe: piiResidual === 0 },
    matching: tally,
    identifiers: { exact_existing: exactExistingIdentifier, cross_establishment_collision: crossEstablishmentCollision, safe_new: safeNewIdentifiers },
    classification,
    dry_run: { would_insert_establishments: wouldInsertEstablishments, would_update_establishments: wouldUpdateEstablishments, would_delete_establishments: wouldDeleteEstablishments, would_link_staging: wouldLinkStaging, would_insert_registry_identifiers: wouldInsertIdentifiers, expected_establishments_after: expectedEstablishmentsAfter },
    ready_to_commit: readyToCommit,
  };
  writeFileSync(join(rootDir, "reports", "registry", "minesup-d-promotion-preflight.json"), JSON.stringify(preflightReport, null, 2), "utf-8");

  const revalHeaders = ["staging_id", "name", "region", "city", "decision", "matched_establishment_id", "match_type", "source_status", "pii_safe", "identifier_count", "identifier_collision", "reason"];
  const revalLines = [revalHeaders.join(",")];
  for (const r of revalResults) {
    revalLines.push([
      csvEscape(r.row.id), csvEscape(r.row.name_raw), csvEscape(r.row.region), csvEscape(r.row.city),
      csvEscape(r.decision), csvEscape(r.matchedTargetId), csvEscape(r.matchLevel), csvEscape(r.row.status),
      csvEscape(true), csvEscape(r.identifierCount), csvEscape(r.identifierCollision), csvEscape(r.matchReason),
    ].join(","));
  }
  writeFileSync(join(rootDir, "reports", "registry", "minesup-d-candidate-revalidation.csv"), revalLines.join("\n"), "utf-8");

  const idPlanHeaders = ["staging_id", "name", "identifier_type", "identifier", "status"];
  const idPlanLines = [idPlanHeaders.join(",")];
  for (const p of identifierPlanRows) idPlanLines.push([csvEscape(p.staging_id), csvEscape(p.name), csvEscape(p.identifier_type), csvEscape(p.identifier), csvEscape(p.status)].join(","));
  writeFileSync(join(rootDir, "reports", "registry", "minesup-d-identifier-plan.csv"), idPlanLines.join("\n"), "utf-8");

  console.log("\nRapports écrits :");
  console.log("  reports/registry/minesup-d-promotion-preflight.json");
  console.log("  reports/registry/minesup-d-candidate-revalidation.csv");
  console.log("  reports/registry/minesup-d-identifier-plan.csv");

  // ── Post-condition — PRE-FLIGHT ne doit RIEN écrire dans establishments/staging/registry_identifiers ──
  const { count: estAfter } = await supabase.from("establishments").select("*", { count: "exact", head: true });
  const { count: stagingAfter } = await supabase.from("establishment_import_staging").select("*", { count: "exact", head: true });
  const { count: registryAfter } = await supabase.from("establishment_registry_identifiers").select("*", { count: "exact", head: true });
  console.log(`\nPOST-CONDITION PRE-FLIGHT : establishments ${estBefore}->${estAfter} | staging ${stagingBefore}->${stagingAfter} | registry_identifiers ${registryBefore}->${registryAfter}`);
  if (estAfter !== estBefore || registryAfter !== registryBefore) {
    console.log("VIOLATION — le pre-flight a écrit dans une table protégée. STOP.");
    process.exit(1);
  }

  console.log("\n\nSTOP — WAIT FOR EXPLICIT HUMAN APPROVAL.");
}

main().catch((error) => {
  console.error("Échec pre-flight MINESUP-D :", error);
  process.exit(1);
});
