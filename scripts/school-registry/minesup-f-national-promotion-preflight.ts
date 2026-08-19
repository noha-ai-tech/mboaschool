import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { sha256 } from "./lib/extraction/hashing";
import { matchCandidate } from "./lib/matching/engine";
import type { MatchTarget } from "./lib/matching/types";
import { assertMinesupNationalPromotionAllowed, MinesupNationalPromotionRefused } from "./lib/minesupNationalPromotionGuard";
import { isEligibleForApprovedPopulation } from "./lib/approvedPopulationFilter";

function argFlag(name: string): string | undefined {
  const arg = process.argv.find((a) => a.startsWith(`--${name}=`));
  return arg ? arg.slice(name.length + 3) : undefined;
}
function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

/**
 * SPRINT MINESUP-F — PRE-FLIGHT strict, aucune écriture production. Revalide
 * intégralement les 60 candidats CLEAN_APPROVABLE du snapshot MINESUP-E
 * contre l'état ACTUEL de la base (jamais un résultat historique réutilisé
 * sans preuve fraîche).
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..", "..");
const OPERATOR = "jean-merlain";
const EXPECTED_CHECKSUM_FROM_PROMPT = "4b398dab3443d5d1d24030b2f7677f5eeacad5c572648c99bed37f306cb6a65b";

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
function slugify(name: string): string {
  return name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
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
function mainCategoryToEducationFamily(mainCategory: string | null): string | null {
  return mainCategory === "superieur" ? "higher_education" : mainCategory;
}

async function main() {
  const env = readFileSync(join(rootDir, ".env.local"), "utf-8");
  const url = readEnvVar(env, "NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = readEnvVar(env, "SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(url, serviceKey);
  const projectRef = url.match(/https:\/\/([a-z0-9]+)\.supabase/)?.[1] ?? "unknown";

  console.log("=== SPRINT MINESUP-F — NATIONAL CONTROLLED PROMOTION PRE-FLIGHT (READ-ONLY) ===\n");

  // ── 1. Baseline fraîche ───────────────────────────────────────────────
  const { count: estBefore } = await supabase.from("establishments").select("*", { count: "exact", head: true });
  const { count: stagingBefore } = await supabase.from("establishment_import_staging").select("*", { count: "exact", head: true });
  const { count: registryBefore } = await supabase.from("establishment_registry_identifiers").select("*", { count: "exact", head: true });
  console.log(`Baseline : establishments=${estBefore}, staging=${stagingBefore}, registry_identifiers=${registryBefore}`);
  console.log(`Project ref confirmé : ${projectRef} (attendu umcwwynrftidytxgqkwi)`);

  // ── 2. Population exacte du snapshot MINESUP-E — jamais réinventée ────
  const { data: pilotDataSources } = await supabase
    .from("establishment_data_sources")
    .select("id")
    .ilike("source_name", "Instituts Privés d'Enseignement Supérieur (IPES) — Région Nord-Ouest%");
  const pilotIds = new Set((pilotDataSources ?? []).map((d: any) => d.id));

  const allMinesupStaging = await fetchAllPaginated<any>(supabase, "establishment_import_staging", "id,name_raw,region,city,education_family,status,source_ministry,source_url,raw_data,fingerprint,promoted_establishment_id,data_source_id", (q) => q.eq("source_ministry", "MINESUP"));
  const nationalRows = allMinesupStaging.filter((r) => !r.data_source_id || !pilotIds.has(r.data_source_id));
  const approvedPopulation = nationalRows.filter((r) => isEligibleForApprovedPopulation(r.status)).sort((a, b) => (a.id < b.id ? -1 : 1));
  // §17 — défense en profondeur : même fonction pure testée isolément
  // (approvedPopulationFilter.test.ts) réappliquée ici comme assertion —
  // aucun DUPLICATE_REVIEW/SOURCE_REVIEW/INVALID ne peut structurellement
  // franchir cette frontière, quel que soit un futur refactor du filtre ci-dessus.
  const boundaryViolation = approvedPopulation.find((r) => !isEligibleForApprovedPopulation(r.status));
  if (boundaryViolation) {
    console.log(`\nVIOLATION DE FRONTIÈRE DE POPULATION — "${boundaryViolation.name_raw}" (status=${boundaryViolation.status}) ne devrait jamais être dans le lot approuvé. STOP.`);
    process.exit(1);
  }
  console.log(`\nPopulation approuvée (national, status=ready, hors pilote) : ${approvedPopulation.length} (attendu 60)`);

  // ── 3. Recalcul du checksum — MÊME algorithme que MINESUP-E ───────────
  const approvalCandidates = approvedPopulation.map((r) => {
    const raw = r.raw_data as any;
    return {
      staging_id: r.id, name: r.name_raw, region: r.region, city: r.city, category: r.education_family,
      authority: "MINESUP", registry: raw?.list_region_section === "Universités d'Etat (nav)" ? "MINESUP_STATE_UNIVERSITIES" : "MINESUP_IPES",
      source: r.source_url, decision: "CLEAN_APPROVABLE",
      identifiers: { creation_order: raw?.identifiers?.creation_order_raw ?? null, opening_authorization: raw?.identifiers?.opening_authorization_raw ?? null },
    };
  });
  const computedChecksum = sha256(JSON.stringify(approvalCandidates));
  const storedApproval = JSON.parse(readFileSync(join(rootDir, "reports", "registry", "minesup-e-approval.json"), "utf-8"));
  console.log(`\nChecksum attendu (prompt)     : ${EXPECTED_CHECKSUM_FROM_PROMPT}`);
  console.log(`Checksum stocké (approval.json) : ${storedApproval.checksum}`);
  console.log(`Checksum recalculé (état actuel) : ${computedChecksum}`);
  const checksumValid = computedChecksum === EXPECTED_CHECKSUM_FROM_PROMPT && computedChecksum === storedApproval.checksum;
  console.log(`Checksum valide (3 valeurs identiques) : ${checksumValid}`);
  if (!checksumValid) {
    console.log("\nCHECKSUM INVALIDE — STOP. La population approuvée a changé depuis MINESUP-E.");
    process.exit(1);
  }
  if (approvedPopulation.length !== 60) {
    console.log(`\nINCOHÉRENCE — population = ${approvedPopulation.length}, attendu 60. STOP.`);
    process.exit(1);
  }

  // ── 4/5/6. Revalidation live + PII + matching (jamais le batch contre lui-même) ──
  interface LiveEst { id: string; name: string; region: string | null; city: string | null; main_category: string | null; }
  interface RegistryIdRow { establishment_id: string; registry: string; identifier: string; identifier_type: string | null; }
  const liveEst = await fetchAllPaginated<LiveEst>(supabase, "establishments", "id,name,region,city,main_category");
  const registryIds = await fetchAllPaginated<RegistryIdRow>(supabase, "establishment_registry_identifiers", "establishment_id,registry,identifier,identifier_type");
  const allStaging = await fetchAllPaginated<{ id: string; name_raw: string; region: string | null; city: string | null; education_family: string | null; status: string }>(supabase, "establishment_import_staging", "id,name_raw,region,city,education_family,status");

  const idsByEstablishment = new Map<string, { registry: string; identifier: string; identifierType?: string | null }[]>();
  for (const r of registryIds) {
    if (!idsByEstablishment.has(r.establishment_id)) idsByEstablishment.set(r.establishment_id, []);
    idsByEstablishment.get(r.establishment_id)!.push({ registry: r.registry, identifier: r.identifier, identifierType: r.identifier_type });
  }
  const liveTargets: MatchTarget[] = liveEst.map((e) => ({ id: e.id, name: e.name, region: e.region, city: e.city, category: mainCategoryToEducationFamily(e.main_category), identifiers: idsByEstablishment.get(e.id) ?? [] }));
  const approvedIds = new Set(approvedPopulation.map((r) => r.id));
  // Cibles staging = tout SAUF les 60 candidats du batch approuvé eux-mêmes (jamais un faux conflit fraternel) ET SAUF les lignes déjà promues (ghost redondant).
  const stagingTargets: MatchTarget[] = allStaging.filter((s) => !approvedIds.has(s.id) && s.status !== "promoted").map((s) => ({ id: `staging:${s.id}`, name: s.name_raw, region: s.region, city: s.city, category: s.education_family, identifiers: [] }));
  const allTargets = [...liveTargets, ...stagingTargets];
  console.log(`\nCibles de matching : ${liveTargets.length} live + ${stagingTargets.length} staging (60 candidats approuvés + promus exclus)`);

  const existingIdentifierKeys = new Set(registryIds.map((r) => `${r.registry}|${r.identifier_type ?? ""}|${r.identifier.trim().toUpperCase()}`));
  const existingSlugs = new Set((await fetchAllPaginated<{ slug: string | null }>(supabase, "establishments", "slug")).map((r) => r.slug).filter((s): s is string => !!s));

  interface Reval {
    row: any; matchLevel: string; matchedTargetId: string | null; matchedTargetName: string | null; matchReason: string;
    decision: "ELIGIBLE" | "ALREADY_LIVE" | "CONFLICT" | "DUPLICATE_SIGNAL" | "SOURCE_ISSUE" | "PII_ISSUE" | "IDENTIFIER_COLLISION" | "INVALID";
    piiIssue: boolean; identifierCount: number; slug: string; slugConflict: boolean;
  }
  const revalResults: Reval[] = [];
  const seenIdentifierThisRun = new Map<string, string>();
  const usedSlugsThisRun = new Set<string>();
  let piiResidualTotal = 0;

  for (const r of approvedPopulation) {
    const raw = r.raw_data as any;

    // §5 — revalidation PII (staging fields, raw_data, source_url).
    const rawStr = JSON.stringify(raw);
    const piiInRaw = /nom du promoteur\s*:\s*[a-z]/i.test(rawStr) && !/REDACTED/i.test(rawStr);
    const piiInUrl = typeof r.source_url === "string" && /nom-du-promoteur|nom-du-representant/i.test(r.source_url);
    const piiIssue = piiInRaw || piiInUrl;
    if (piiIssue) piiResidualTotal++;

    // §4/§6 — provenance + statut + matching frais.
    const sourceIssue = r.status !== "ready" || !!r.promoted_establishment_id || r.source_ministry !== "MINESUP";
    const candidate = { name: r.name_raw, region: r.region, city: r.city, category: r.education_family, identifiers: [] };
    const match = matchCandidate(candidate, allTargets);

    // §12 — slug précalculé, désambiguïsation déterministe (même convention que promote-*.ts).
    const base = slugify(r.name_raw);
    let slug = base, n = 1;
    while (existingSlugs.has(slug) || usedSlugsThisRun.has(slug)) { slug = `${base}-${n}`; n++; }
    const slugConflict = slug !== base; // un suffixe a dû être ajouté -> collision détectée (documentée, résolue de façon déterministe)
    usedSlugsThisRun.add(slug);

    let decision: Reval["decision"];
    if (piiIssue) decision = "PII_ISSUE";
    else if (sourceIssue) decision = "SOURCE_ISSUE";
    else if (match.level === "EXACT_IDENTIFIER" || match.level === "EXACT_IDENTITY") decision = "ALREADY_LIVE";
    else if (match.level === "STRONG_MATCH" || match.level === "PROBABLE_MATCH" || match.level === "AMBIGUOUS") decision = "DUPLICATE_SIGNAL";
    else decision = "ELIGIBLE";

    let identifierCollision = false;
    const idCandidates: Array<{ type: string; value: string | null }> = [
      { type: "CREATION_ORDER", value: raw?.identifiers?.creation_order_raw ?? null },
      { type: "OPENING_AUTHORIZATION", value: raw?.identifiers?.opening_authorization_raw ?? null },
    ];
    if (decision === "ELIGIBLE") {
      for (const idc of idCandidates) {
        if (!idc.value) continue;
        const registry = raw?.list_region_section === "Universités d'Etat (nav)" ? "MINESUP_STATE_UNIVERSITIES" : "MINESUP_IPES";
        const key = `${registry}|${idc.type}|${idc.value.trim().toUpperCase()}`;
        if (existingIdentifierKeys.has(key)) { identifierCollision = true; }
        else if (seenIdentifierThisRun.has(key) && seenIdentifierThisRun.get(key) !== r.name_raw) { identifierCollision = true; }
        else seenIdentifierThisRun.set(key, r.name_raw);
      }
      if (identifierCollision) decision = "IDENTIFIER_COLLISION";
    }

    const identifierCount = idCandidates.filter((c) => c.value).length;
    revalResults.push({ row: r, matchLevel: match.level, matchedTargetId: match.target?.id ?? null, matchedTargetName: match.target?.name ?? null, matchReason: match.reason, decision, piiIssue, identifierCount, slug, slugConflict });
  }

  const revalTally = { eligible: 0, already_live: 0, conflict: 0, duplicate_signal: 0, source_issue: 0, pii_issue: 0, identifier_collision: 0, invalid: 0 };
  for (const r of revalResults) revalTally[r.decision.toLowerCase() as keyof typeof revalTally]++;
  console.log("\nRevalidation live :", revalTally);
  console.log(`Résidu PII total : ${piiResidualTotal} (attendu 0)`);

  // ── 9. Confirmer que Capitol/Shisong n'est pas dans le batch ──────────
  const capitolShisongInBatch = approvedPopulation.filter((r) => r.name_raw.includes("Capitol Higher Institute") || r.name_raw.includes("Catholic School of Health Sciences Shisong"));
  console.log(`\nCapitol/Shisong dans le batch national : ${capitolShisongInBatch.length} (attendu 0 — collision historique MINESUP-D, hors périmètre)`);

  // ── 10/12. Dry-run + audit slugs ───────────────────────────────────────
  const eligible = revalResults.filter((r) => r.decision === "ELIGIBLE");
  const identifierCollisions = revalResults.filter((r) => r.decision === "IDENTIFIER_COLLISION");
  const slugBatchConflicts = eligible.filter((r) => r.slugConflict);
  const existingSlugCollisions = eligible.filter((r) => existingSlugs.has(slugify(r.row.name_raw)));

  const wouldInsertEstablishments = eligible.length;
  const wouldLinkStaging = eligible.length;
  const wouldInsertIdentifiers = eligible.reduce((s, r) => s + r.identifierCount, 0);
  const expectedEstablishmentsAfter = (estBefore ?? 0) + wouldInsertEstablishments;
  const expectedRegistryIdentifiersAfter = (registryBefore ?? 0) + wouldInsertIdentifiers;

  console.log("\n=== MINESUP-F NATIONAL PROMOTION DRY RUN ===");
  console.log(`Would insert establishments: ${wouldInsertEstablishments}`);
  console.log(`Would link staging: ${wouldLinkStaging}`);
  console.log(`Would insert registry identifiers: ${wouldInsertIdentifiers}`);
  console.log(`Would update existing: 0`);
  console.log(`Would delete: 0`);
  console.log(`Expected establishments after: ${expectedEstablishmentsAfter}`);
  console.log(`Expected registry identifiers after: ${expectedRegistryIdentifiersAfter}`);

  const readyToCommit =
    checksumValid &&
    approvedPopulation.length === 60 &&
    eligible.length === approvedPopulation.length && // AUCUN candidat approuvé n'a été dégradé
    revalTally.pii_issue === 0 &&
    identifierCollisions.length === 0 &&
    existingSlugCollisions.length === 0 &&
    piiResidualTotal === 0 &&
    capitolShisongInBatch.length === 0;
  console.log(`\nREADY TO COMMIT : ${readyToCommit ? "YES" : "NO"}`);
  if (!readyToCommit) {
    console.log("Raison : au moins un candidat approuvé n'est plus ELIGIBLE en l'état actuel, ou une collision/PII/slug non résolue existe. Ne PAS dégrader localement — STOP et rapporter.");
  }

  // ── 21. Rapports ────────────────────────────────────────────────────
  mkdirSync(join(rootDir, "reports", "registry"), { recursive: true });

  const revalHeaders = ["staging_id", "name", "region", "city", "decision", "match_type", "matched_target_id", "identifier_count", "pii_issue", "slug", "slug_conflict"];
  const revalLines = [revalHeaders.join(",")];
  for (const r of revalResults) revalLines.push([csvEscape(r.row.id), csvEscape(r.row.name_raw), csvEscape(r.row.region), csvEscape(r.row.city), csvEscape(r.decision), csvEscape(r.matchLevel), csvEscape(r.matchedTargetId), csvEscape(r.identifierCount), csvEscape(r.piiIssue), csvEscape(r.slug), csvEscape(r.slugConflict)].join(","));
  writeFileSync(join(rootDir, "reports", "registry", "minesup-f-live-revalidation.csv"), revalLines.join("\n"), "utf-8");

  const idPlanHeaders = ["staging_id", "name", "registry", "identifier_type", "identifier", "source_url"];
  const idPlanLines = [idPlanHeaders.join(",")];
  let creationOrders = 0, openingAuths = 0, withIdentifiers = 0, withoutIdentifiers = 0, multipleIdentifiers = 0;
  for (const r of eligible) {
    const raw = r.row.raw_data as any;
    const registry = raw?.list_region_section === "Universités d'Etat (nav)" ? "MINESUP_STATE_UNIVERSITIES" : "MINESUP_IPES";
    let count = 0;
    if (raw?.identifiers?.creation_order_raw) { idPlanLines.push([csvEscape(r.row.id), csvEscape(r.row.name_raw), csvEscape(registry), csvEscape("CREATION_ORDER"), csvEscape(raw.identifiers.creation_order_raw), csvEscape(r.row.source_url)].join(",")); creationOrders++; count++; }
    if (raw?.identifiers?.opening_authorization_raw) { idPlanLines.push([csvEscape(r.row.id), csvEscape(r.row.name_raw), csvEscape(registry), csvEscape("OPENING_AUTHORIZATION"), csvEscape(raw.identifiers.opening_authorization_raw), csvEscape(r.row.source_url)].join(",")); openingAuths++; count++; }
    if (count > 0) withIdentifiers++; else withoutIdentifiers++;
    if (count > 1) multipleIdentifiers++;
  }
  writeFileSync(join(rootDir, "reports", "registry", "minesup-f-identifier-plan.csv"), idPlanLines.join("\n"), "utf-8");

  const collisionHeaders = ["staging_id", "name", "decision", "reason"];
  const collisionLines = [collisionHeaders.join(",")];
  for (const c of identifierCollisions) collisionLines.push([csvEscape(c.row.id), csvEscape(c.row.name_raw), csvEscape("IDENTIFIER_COLLISION"), csvEscape("Collision détectée contre l'existant ou intra-batch — jamais auto-mergée, jamais ignorée")].join(","));
  writeFileSync(join(rootDir, "reports", "registry", "minesup-f-identifier-collisions.csv"), collisionLines.join("\n"), "utf-8");

  const slugHeaders = ["staging_id", "name", "slug", "valid", "existing_collision", "batch_collision"];
  const slugLines = [slugHeaders.join(",")];
  for (const r of revalResults) slugLines.push([csvEscape(r.row.id), csvEscape(r.row.name_raw), csvEscape(r.slug), csvEscape(!!r.slug && r.slug.length > 0), csvEscape(existingSlugs.has(slugify(r.row.name_raw))), csvEscape(r.slugConflict)].join(","));
  writeFileSync(join(rootDir, "reports", "registry", "minesup-f-slug-audit.csv"), slugLines.join("\n"), "utf-8");

  const dryRun = {
    would_insert_establishments: wouldInsertEstablishments, would_link_staging: wouldLinkStaging, would_insert_registry_identifiers: wouldInsertIdentifiers,
    would_update_existing: 0, would_delete: 0, conflicts: identifierCollisions.length + slugBatchConflicts.length,
    expected_establishments_after: expectedEstablishmentsAfter, expected_registry_identifiers_after: expectedRegistryIdentifiersAfter,
  };
  writeFileSync(join(rootDir, "reports", "registry", "minesup-f-dry-run.json"), JSON.stringify(dryRun, null, 2), "utf-8");

  const summary = {
    sprint: "MINESUP-F", operator: OPERATOR, generated_at: new Date().toISOString(),
    database: { project_ref: projectRef, establishments: estBefore, staging: stagingBefore, registry_identifiers: registryBefore },
    approval: { snapshot_candidates: approvedPopulation.length, checksum_expected: EXPECTED_CHECKSUM_FROM_PROMPT, checksum_stored: storedApproval.checksum, checksum_recomputed: computedChecksum, checksum_valid: checksumValid },
    live_revalidation: revalTally,
    pii: { candidates_checked: approvedPopulation.length, residual: piiResidualTotal, safe: piiResidualTotal === 0 },
    identifiers: { with_identifiers: withIdentifiers, creation_orders: creationOrders, opening_authorizations: openingAuths, without_identifiers: withoutIdentifiers, multiple_identifiers: multipleIdentifiers, total_planned: wouldInsertIdentifiers, existing_collisions: identifierCollisions.length, batch_collisions: 0 },
    slug_audit: { candidates: revalResults.length, valid: revalResults.filter((r) => r.slug.length > 0).length, existing_collisions: existingSlugCollisions.length, batch_collisions: slugBatchConflicts.length, resolution_required: slugBatchConflicts.length > 0 || existingSlugCollisions.length > 0 },
    dry_run: dryRun,
    review_population_protection: { duplicate_review_excluded: true, source_review_excluded: true, invalid_excluded: true, note: "La population approuvée provient EXCLUSIVEMENT de establishment_import_staging filtré sur status='ready' — aucune ligne duplicate_review/source_review/invalid ne peut structurellement entrer dans ce set (elles ont un status différent : normalized/rejected/duplicate_exact/duplicate_review)." },
    capitol_shisong_check: { in_batch: capitolShisongInBatch.length, safe: capitolShisongInBatch.length === 0 },
    ready_to_commit: readyToCommit,
  };
  writeFileSync(join(rootDir, "reports", "registry", "minesup-f-preflight-summary.json"), JSON.stringify(summary, null, 2), "utf-8");

  console.log("\nRapports écrits dans reports/registry/minesup-f-*");

  // ── §10/§13 — chemin d'écriture GARDÉ, jamais invoqué avec des flags
  // valides dans ce sprint (PRE-FLIGHT uniquement, §23-24 : "DO NOT RUN
  // --commit" même si tout est vert). Présent pour que les tests de refus
  // (§13) portent sur le VRAI chemin de code, et pour qu'un futur sprint
  // d'exécution puisse réutiliser ce même script sans le réécrire.
  const commit = hasFlag("commit");
  if (commit) {
    try {
      assertMinesupNationalPromotionAllowed({
        commit,
        confirmPhrase: argFlag("confirm"),
        projectRef,
        operator: argFlag("operator"),
        approvedBy: argFlag("approved-by"),
        actualEligibleCount: eligible.length,
        expectedEligibleCount: argFlag("expected-count") ? Number(argFlag("expected-count")) : undefined,
        computedChecksum,
        approvalChecksum: argFlag("approval-checksum"),
        identifierConflicts: identifierCollisions.length,
        slugConflicts: slugBatchConflicts.length + existingSlugCollisions.length,
      });
    } catch (e) {
      if (e instanceof MinesupNationalPromotionRefused) {
        console.error(`\n${e.message}`);
        process.exitCode = 1;
        return;
      }
      throw e;
    }
    // Volontairement NON implémenté ce sprint : la boucle d'écriture réelle
    // (establishment -> staging link -> registry identifiers, séquentielle
    // fail-safe, cf. minesup-d-promote.ts pour le patron exact) sera ajoutée
    // au moment où une autorisation humaine explicite nommant l'approbateur
    // sera reçue pour CE batch précis — jamais anticipée ici. Si ce point du
    // code est atteint, c'est que TOUS les gardes ont été satisfaits avec
    // des flags réels et corrects, ce qui ne doit JAMAIS arriver pendant ce
    // sprint.
    console.log("\nGARDE FRANCHIE AVEC DES FLAGS VALIDES — ceci ne devrait jamais arriver pendant SPRINT MINESUP-F (pre-flight uniquement). Aucune écriture n'a été codée au-delà de ce point : arrêt volontaire.");
    process.exitCode = 1;
    return;
  }

  // ── Post-condition — PRE-FLIGHT ne doit RIEN écrire ────────────────────
  const { count: estAfter } = await supabase.from("establishments").select("*", { count: "exact", head: true });
  const { count: stagingAfter } = await supabase.from("establishment_import_staging").select("*", { count: "exact", head: true });
  const { count: registryAfter } = await supabase.from("establishment_registry_identifiers").select("*", { count: "exact", head: true });
  console.log(`\nPOST-CONDITION PRE-FLIGHT : establishments ${estBefore}->${estAfter} | staging ${stagingBefore}->${stagingAfter} | registry_identifiers ${registryBefore}->${registryAfter}`);
  if (estAfter !== estBefore || stagingAfter !== stagingBefore || registryAfter !== registryBefore) {
    console.log("VIOLATION — le pre-flight a écrit dans une table protégée. STOP.");
    process.exit(1);
  }

  console.log("\n\nSTOP — WAIT FOR EXPLICIT HUMAN APPROVAL.");
}

main().catch((error) => {
  console.error("Échec pre-flight MINESUP-F :", error);
  process.exit(1);
});
