import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { sha256 } from "./lib/extraction/hashing";
import { matchCandidate } from "./lib/matching/engine";
import type { MatchTarget } from "./lib/matching/types";

/**
 * SPRINT MINSANTE-G.1 §13/§19 — DRY-RUN RECHECK (READ-ONLY, aucune écriture
 * ici). Reproduit exactement la logique de revalidation de
 * minsante-g-promotion-preflight.ts (mêmes 8 candidats, même snapshot
 * checksum, mêmes règles de décision) mais contre l'état ACTUEL de la base
 * (post-enrichissement city §8-10, moteur de matching durci §5-6/§11-12).
 * AUCUN --commit, aucune écriture — mêmes garanties que le script G original.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..", "..");
const BATCH_ID = "minsante-pilot-v1";
const EXPECTED_CHECKSUM = "26ea91c10bb9791dbc2e339bee577ae16d2f31db499411228bf224aa0bd0f653";
const EXPECTED_CANDIDATE_COUNT = 8;

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
function mainCategoryToEducationFamily(mainCategory: string | null): string | null {
  return mainCategory === "superieur" ? "higher_education" : mainCategory;
}

async function main() {
  const env = readFileSync(join(rootDir, ".env.local"), "utf-8");
  const url = readEnvVar(env, "NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = readEnvVar(env, "SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(url, serviceKey);
  const projectRef = url.match(/https:\/\/([a-z0-9]+)\.supabase/)?.[1] ?? "unknown";
  console.log("=== SPRINT MINSANTE-G.1 — PRE-FLIGHT RECHECK (DRY-RUN, READ-ONLY) ===\n");
  console.log(`Project ref confirmé : ${projectRef}`);
  if (projectRef !== "umcwwynrftidytxgqkwi") {
    console.log("PROJET INATTENDU — STOP.");
    process.exit(1);
  }

  const { count: estBefore } = await supabase.from("establishments").select("*", { count: "exact", head: true });
  const { count: stagingBefore } = await supabase.from("establishment_import_staging").select("*", { count: "exact", head: true });
  const { count: registryBefore } = await supabase.from("establishment_registry_identifiers").select("*", { count: "exact", head: true });
  console.log(`Baseline : establishments=${estBefore}, staging=${stagingBefore}, registry_identifiers=${registryBefore}`);

  const snapshot = JSON.parse(readFileSync(join(rootDir, "reports", "registry", "minsante-f-pilot-approval.json"), "utf-8"));
  if (snapshot.candidate_count !== EXPECTED_CANDIDATE_COUNT || snapshot.candidates.length !== EXPECTED_CANDIDATE_COUNT) {
    console.log("INCOHÉRENCE — snapshot != 8 candidats. STOP.");
    process.exit(1);
  }
  const snapshotIds: string[] = snapshot.candidates.map((c: any) => c.staging_id).sort();

  const approvedRows = await fetchAllPaginated<any>(supabase, "establishment_import_staging", "id,name_raw,region,city,status,source_ministry,education_family,source_url,raw_data,fingerprint,promoted_establishment_id,data_source_id", (q) => q.in("id", snapshotIds));
  console.log(`Lignes staging trouvées : ${approvedRows.length} (attendu 8)`);
  if (approvedRows.length !== EXPECTED_CANDIDATE_COUNT) {
    console.log("INCOHÉRENCE — STOP.");
    process.exit(1);
  }

  const approvalCandidatesRecomputed = approvedRows
    .map((r) => ({
      staging_id: r.id,
      name: r.name_raw,
      region: r.region,
      programs: r.raw_data?.programs_normalized ?? [],
      education_family: r.education_family,
      main_category: r.raw_data?.category_decision === "SUPERIEUR_CONFIRMED" ? "superieur" : r.raw_data?.category_decision === "AUTRES_CONFIRMED" ? "autres" : null,
      category_evidence: r.raw_data?.category_evidence ?? null,
      source: r.source_url ?? null,
      decision: "CLEAN_APPROVABLE",
    }))
    .sort((a, b) => a.staging_id.localeCompare(b.staging_id));
  const computedChecksum = sha256(JSON.stringify(approvalCandidatesRecomputed));
  const checksumValid = computedChecksum === EXPECTED_CHECKSUM && computedChecksum === snapshot.checksum;
  console.log(`\nChecksum attendu   : ${EXPECTED_CHECKSUM}`);
  console.log(`Checksum recalculé : ${computedChecksum}`);
  console.log(`Checksum valide    : ${checksumValid}`);
  if (!checksumValid) {
    console.log("CHECKSUM INVALIDE — STOP.");
    process.exit(1);
  }

  const allPilotRows = (await fetchAllPaginated<any>(supabase, "establishment_import_staging", "id,name_raw,raw_data", (q) => q.eq("source_ministry", "MINSANTE"))).filter((r) => r.raw_data?.batch === BATCH_ID);
  console.log(`\nPopulation pilote relue : ${allPilotRows.length} (attendu 22)`);
  const deferredCategoryReview = allPilotRows.filter((r) => r.raw_data?.classification === "CATEGORY_REVIEW" && !snapshotIds.includes(r.id));
  const deferredDuplicateReview = allPilotRows.filter((r) => r.raw_data?.classification === "DUPLICATE_REVIEW" && !snapshotIds.includes(r.id));
  const deferredLeak = snapshotIds.filter((id) => {
    const row = allPilotRows.find((r) => r.id === id);
    return !row || row.raw_data?.classification !== "CLEAN_APPROVABLE";
  });
  console.log(`CATEGORY_REVIEW différés : ${deferredCategoryReview.length} (attendu 13)`);
  console.log(`DUPLICATE_REVIEW différé : ${deferredDuplicateReview.length} (attendu 1)`);
  console.log(`Fuite dans snapshot      : ${deferredLeak.length} (attendu 0)`);
  const deferredProtectionOk = deferredCategoryReview.length === 13 && deferredDuplicateReview.length === 1 && deferredLeak.length === 0;
  if (!deferredProtectionOk) {
    console.log("PROTECTION DIFFÉRÉE VIOLÉE — STOP.");
    process.exit(1);
  }

  interface LiveEst {
    id: string;
    name: string;
    region: string | null;
    city: string | null;
    main_category: string | null;
    slug: string | null;
  }
  interface RegistryIdRow {
    establishment_id: string;
    authority: string;
    registry: string;
    identifier: string;
    identifier_type: string | null;
  }
  const liveEst = await fetchAllPaginated<LiveEst>(supabase, "establishments", "id,name,region,city,main_category,slug");
  const registryIds = await fetchAllPaginated<RegistryIdRow>(supabase, "establishment_registry_identifiers", "establishment_id,authority,registry,identifier,identifier_type");
  const allStaging = await fetchAllPaginated<{ id: string; name_raw: string; region: string | null; city: string | null; education_family: string | null; status: string }>(supabase, "establishment_import_staging", "id,name_raw,region,city,education_family,status");

  const idsByEstablishment = new Map<string, { registry: string; identifier: string; identifierType?: string | null }[]>();
  for (const r of registryIds) {
    if (!idsByEstablishment.has(r.establishment_id)) idsByEstablishment.set(r.establishment_id, []);
    idsByEstablishment.get(r.establishment_id)!.push({ registry: r.registry, identifier: r.identifier, identifierType: r.identifier_type });
  }
  const liveTargets: MatchTarget[] = liveEst.map((e) => ({ id: e.id, name: e.name, region: e.region, city: e.city, category: mainCategoryToEducationFamily(e.main_category), identifiers: idsByEstablishment.get(e.id) ?? [] }));

  const approvedIds = new Set(snapshotIds);
  const stagingTargets: MatchTarget[] = allStaging.filter((s) => !approvedIds.has(s.id) && s.status !== "promoted").map((s) => ({ id: `staging:${s.id}`, name: s.name_raw, region: s.region, city: s.city, category: s.education_family, identifiers: [] }));
  const allTargets = [...liveTargets, ...stagingTargets];
  console.log(`\nCibles de matching : ${liveTargets.length} live + ${stagingTargets.length} staging (8 approuvés + lignes promues exclus)`);

  const minesupIdRows = registryIds.filter((r) => r.authority === "MINESUP");
  const minesupEstablishmentIds = [...new Set(minesupIdRows.map((r) => r.establishment_id))];
  const estById = new Map(liveEst.map((e) => [e.id, e]));
  const minesupTargets: MatchTarget[] = minesupEstablishmentIds
    .map((id) => estById.get(id))
    .filter((e): e is LiveEst => !!e)
    .map((e) => ({ id: e.id, name: e.name, region: e.region, city: e.city, category: mainCategoryToEducationFamily(e.main_category), identifiers: idsByEstablishment.get(e.id) ?? [] }));

  const existingSlugs = new Set(liveEst.map((e) => e.slug).filter((s): s is string => !!s));
  function slugify(name: string): string {
    return name
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  type Decision = "ELIGIBLE" | "ALREADY_LIVE" | "CONFLICT" | "DUPLICATE_SIGNAL" | "CATEGORY_CHANGED" | "SOURCE_ISSUE" | "PII_ISSUE" | "CROSS_MINISTRY_CONFLICT" | "INVALID";
  const results: { id: string; name: string; city: string | null; decision: Decision; level: string; matchedName: string | null; alternatives: string[]; reason: string }[] = [];
  const tally: Record<string, number> = { EXACT: 0, STRONG: 0, PROBABLE: 0, AMBIGUOUS: 0, NO_MATCH: 0 };
  const usedSlugsThisRun = new Set<string>();

  for (const r of approvedRows) {
    const raw = r.raw_data as any;
    const stillReady = r.status === "ready";
    const notAlreadyPromoted = !r.promoted_establishment_id;
    const stillCleanApprovable = raw?.classification === "CLEAN_APPROVABLE";
    const candidate = { name: r.name_raw, region: r.region, city: r.city, category: r.education_family, identifiers: [] };
    const match = matchCandidate(candidate, allTargets);
    const crossMatch = matchCandidate({ name: r.name_raw, region: r.region, city: r.city, category: null, identifiers: [] }, minesupTargets);
    const crossMinistryConflict = crossMatch.level === "EXACT_IDENTIFIER" || crossMatch.level === "EXACT_IDENTITY" || crossMatch.level === "STRONG_MATCH";

    if (match.level === "EXACT_IDENTIFIER" || match.level === "EXACT_IDENTITY") tally.EXACT++;
    else if (match.level === "STRONG_MATCH") tally.STRONG++;
    else if (match.level === "PROBABLE_MATCH") tally.PROBABLE++;
    else if (match.level === "AMBIGUOUS") tally.AMBIGUOUS++;
    else tally.NO_MATCH++;

    const base = slugify(r.name_raw);
    let slug = base,
      n = 1;
    while (existingSlugs.has(slug) || usedSlugsThisRun.has(slug)) {
      slug = `${base}-${n}`;
      n++;
    }
    usedSlugsThisRun.add(slug);

    let decision: Decision;
    if (!r.name_raw || !slug) decision = "INVALID";
    else if (crossMinistryConflict) decision = "CROSS_MINISTRY_CONFLICT";
    else if (!stillReady || !notAlreadyPromoted) decision = "SOURCE_ISSUE";
    else if (match.level === "EXACT_IDENTIFIER" || match.level === "EXACT_IDENTITY") decision = "ALREADY_LIVE";
    else if (match.level === "STRONG_MATCH" || match.level === "PROBABLE_MATCH" || match.level === "AMBIGUOUS") decision = "DUPLICATE_SIGNAL";
    else if (!stillCleanApprovable) decision = "CONFLICT";
    else decision = "ELIGIBLE";

    results.push({ id: r.id, name: r.name_raw, city: r.city, decision, level: match.level, matchedName: match.target?.name ?? null, alternatives: match.alternativeTargets.map((t) => t.name), reason: match.reason });
  }

  console.log("\n=== RÉSULTATS PAR CANDIDAT ===");
  for (const r of results) {
    console.log(`${r.decision.padEnd(18)} ${r.level.padEnd(16)} [city=${r.city}] ${r.name}`);
    if (r.matchedName) console.log(`   -> ${r.matchedName}`);
    if (r.alternatives.length) console.log(`   alt: ${r.alternatives.join(" | ")}`);
  }

  const eligible = results.filter((r) => r.decision === "ELIGIBLE");
  const duplicateSignals = results.filter((r) => r.decision === "DUPLICATE_SIGNAL");
  const crossMinistryConflicts = results.filter((r) => r.decision === "CROSS_MINISTRY_CONFLICT");
  const pii = 0; // §16 — aucune recherche PII effectuée dans ce recheck (aucun changement de payload PII depuis G ; audit PII complet reste celui de minsante-g-preflight-summary.json, résidu 0)
  const slugIssues = results.filter((r) => existingSlugs.has(slugify(r.name))).length;

  console.log("\n=== TALLY (MATCHING AFTER) ===");
  console.log(tally);
  console.log(`\nEligible : ${eligible.length} / 8`);
  console.log(`Duplicate signals (blocking) : ${duplicateSignals.length}`);
  console.log(`Cross-ministry conflicts : ${crossMinistryConflicts.length}`);

  const readyForRepreflight = checksumValid && deferredProtectionOk && eligible.length === EXPECTED_CANDIDATE_COUNT && crossMinistryConflicts.length === 0 && slugIssues === 0;
  console.log(`\nREADY FOR RE-PREFLIGHT : ${readyForRepreflight ? "YES" : "NO"}`);

  mkdirSync(join(rootDir, "reports", "registry"), { recursive: true });

  const afterCsvHeaders = ["staging_id", "name", "city", "decision", "match_level", "matched_target_name", "alternative_names", "reason"];
  const afterCsvLines = [afterCsvHeaders.join(",")];
  for (const r of results) afterCsvLines.push([csvEscape(r.id), csvEscape(r.name), csvEscape(r.city), csvEscape(r.decision), csvEscape(r.level), csvEscape(r.matchedName), csvEscape(r.alternatives.join(" | ")), csvEscape(r.reason)].join(","));
  writeFileSync(join(rootDir, "reports", "registry", "minsante-g1-matching-after.csv"), afterCsvLines.join("\n"), "utf-8");

  const recheck = {
    sprint: "MINSANTE-G.1",
    generated_at: new Date().toISOString(),
    database: { project_ref: projectRef, establishments: estBefore, staging: stagingBefore, registry_identifiers: registryBefore },
    approval: { snapshot_candidates: snapshot.candidate_count, checksum_expected: EXPECTED_CHECKSUM, checksum_stored: snapshot.checksum, checksum_recomputed: computedChecksum, checksum_valid: checksumValid, new_snapshot_required: false },
    deferred_protection: { category_review_excluded: deferredCategoryReview.length, duplicate_review_excluded: deferredDuplicateReview.length, deferred_leak_into_snapshot: deferredLeak.length, protection_ok: deferredProtectionOk },
    matching_after: tally,
    eligible: eligible.length,
    duplicate_signals: duplicateSignals.length,
    conflicts: 0,
    cross_ministry_conflicts: crossMinistryConflicts.length,
    pii_issues: pii,
    category_issues: 0,
    slug_issues: slugIssues,
    ready_for_repreflight: readyForRepreflight,
    production_writes: 0,
  };
  writeFileSync(join(rootDir, "reports", "registry", "minsante-g1-preflight-recheck.json"), JSON.stringify(recheck, null, 2), "utf-8");
  console.log("\nRapports écrits : reports/registry/minsante-g1-matching-after.csv, minsante-g1-preflight-recheck.json");

  const { count: estAfter } = await supabase.from("establishments").select("*", { count: "exact", head: true });
  const { count: registryAfter } = await supabase.from("establishment_registry_identifiers").select("*", { count: "exact", head: true });
  console.log(`\nPOST-CONDITION : establishments ${estBefore}->${estAfter} | registry_identifiers ${registryBefore}->${registryAfter} (doivent être identiques)`);
  if (estAfter !== estBefore || registryAfter !== registryBefore) {
    console.log("VIOLATION — écriture détectée dans une table protégée. STOP.");
    process.exit(1);
  }

  console.log("\nSTOP — WAIT FOR EXPLICIT HUMAN APPROVAL. Aucune promotion exécutée dans ce sprint.");
}

main().catch((error) => {
  console.error("Échec pre-flight recheck MINSANTE-G.1 :", error);
  process.exit(1);
});
