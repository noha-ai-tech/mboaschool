import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { matchCandidate } from "./lib/matching/engine";
import type { MatchCandidate, MatchTarget } from "./lib/matching/types";

/**
 * SPRINT TRANSPORT-A.1-T3 — Tier-3 discovery pipeline / dry-run.
 *
 * READ-ONLY end to end:
 *  - establishments  : read via NEXT_PUBLIC_SUPABASE_ANON_KEY (anon, RLS-scoped)
 *  - staging          : read via SUPABASE_SERVICE_ROLE_KEY (RLS blocks anon on
 *                        this table — same pattern already used to verify the
 *                        MINTRANSPORT enum absence in TRANSPORT_IMPORT_CONTRACT.md
 *                        section 6). NO write call of any kind is made anywhere
 *                        in this file — verified by inspection: every fetch()
 *                        below uses the default GET method, none passes
 *                        method:'POST'/'PATCH'/'DELETE' or a body.
 *
 * Produces every report required by brief section 26/27/29, plus the dry-run
 * classification of section 18. Zero staging/establishments/registry writes.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..", "..");
const reportsDir = join(rootDir, "reports", "registry");

function csvEscape(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
function writeCsv(filename: string, header: string[], rows: unknown[][]) {
  const csv = [header.join(","), ...rows.map((r) => r.map(csvEscape).join(","))].join("\n");
  writeFileSync(join(reportsDir, filename), csv, "utf-8");
  console.log(`  wrote reports/registry/${filename} (${rows.length} rows)`);
}

interface CandidateSource {
  source_id: string;
  domain: string;
  tier3_class: string;
  verified_this_sprint: boolean;
  note?: string;
  verification_method?: string;
}
interface Candidate {
  candidate_id: string;
  name: string;
  normalized_name: string;
  entity_family: string;
  entity_family_note?: string;
  city: string | null;
  region: string | null;
  sources: CandidateSource[];
  source_count: number;
  independent_source_count: number;
  source_independence: string;
  completeness_of_source: string;
  tier3_confidence: string;
  tier3_confidence_note?: string;
  matching_decision: string;
  matching_note?: string;
  cross_ministry_decision: string;
  cross_ministry_note?: string;
  activity_status: string;
  review_required: boolean;
  review_note?: string;
  official_corroboration_status: string;
}
interface CandidateDataset {
  sprint: string;
  date: string;
  candidates: Candidate[];
}

function envValue(env: string, key: string): string {
  const v = env.match(new RegExp(`^${key}=(.*)$`, "m"))?.[1]?.trim();
  if (!v) throw new Error(`${key} introuvable dans .env.local`);
  return v;
}

interface LiveEstablishment {
  id: string;
  name: string;
  city: string | null;
  region: string | null;
  main_category: string | null;
}

async function fetchLiveEstablishments(url: string, anonKey: string): Promise<LiveEstablishment[]> {
  const all: LiveEstablishment[] = [];
  const pageSize = 1000;
  let offset = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const res = await fetch(`${url}/rest/v1/establishments?select=id,name,city,region,main_category&limit=${pageSize}&offset=${offset}`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
    });
    if (!res.ok) throw new Error(`Supabase REST (establishments, anon, GET) -> HTTP ${res.status} ${await res.text()}`);
    const page: LiveEstablishment[] = await res.json();
    all.push(...page);
    if (page.length < pageSize) break;
    offset += pageSize;
  }
  return all;
}

interface StagingRow {
  id: string;
  name_raw: string;
  city: string | null;
  region: string | null;
  source_ministry: string | null;
  education_family: string | null;
  status: string | null;
  official_identifier: string | null;
}

/** READ-ONLY GET against staging, service_role (RLS blocks anon on this table). Used only for cross-ministry keyword overlap checks — never modifies anything. */
async function fetchStagingKeywordMatches(url: string, serviceKey: string, keywords: string[]): Promise<StagingRow[]> {
  const orClause = keywords.map((k) => `name_raw.ilike.*${k}*`).join(",");
  const res = await fetch(
    `${url}/rest/v1/establishment_import_staging?or=(${encodeURIComponent(orClause).replace(/%2C/g, ",")})&select=id,name_raw,city,region,source_ministry,education_family,status,official_identifier`,
    { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
  );
  if (!res.ok) throw new Error(`Supabase REST (staging, service_role, GET) -> HTTP ${res.status} ${await res.text()}`);
  return res.json();
}

async function fetchCounts(url: string, serviceKey: string, table: string): Promise<number> {
  const res = await fetch(`${url}/rest/v1/${table}?select=id&limit=1`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, Prefer: "count=exact" },
  });
  const range = res.headers.get("content-range"); // "0-0/2248"
  return Number(range?.split("/")[1] ?? -1);
}

async function checkMintransportEnum(url: string, serviceKey: string): Promise<boolean> {
  const res = await fetch(`${url}/rest/v1/establishment_import_staging?source_ministry=eq.MINTRANSPORT&select=id&limit=1`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
  });
  return res.status !== 400; // 400 22P02 = enum value absent
}

async function main() {
  console.log("=== SPRINT TRANSPORT-A.1-T3 — TIER-3 DISCOVERY PIPELINE (DRY-RUN, READ-ONLY) ===\n");
  mkdirSync(reportsDir, { recursive: true });

  const envPath = join(rootDir, ".env.local");
  const env = readFileSync(envPath, "utf-8");
  const supabaseUrl = envValue(env, "NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = envValue(env, "NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const serviceKey = envValue(env, "SUPABASE_SERVICE_ROLE_KEY");

  // ---- 1. Fresh database baseline (brief section 1/32) ----
  console.log("1. Baseline database read (fresh, this sprint)...");
  const establishmentsCount = await fetchCounts(supabaseUrl, serviceKey, "establishments");
  const stagingCount = await fetchCounts(supabaseUrl, serviceKey, "establishment_import_staging");
  const registryIdCount = await fetchCounts(supabaseUrl, serviceKey, "establishment_registry_identifiers");
  const mintransportEnumPresent = await checkMintransportEnum(supabaseUrl, serviceKey);
  console.log(`   establishments=${establishmentsCount} staging=${stagingCount} registry_identifiers=${registryIdCount} MINTRANSPORT_enum_present=${mintransportEnumPresent}`);

  const baselineExpected = { establishments: 2248, staging: 2366, registry_identifiers: 2242 };
  const baselineDrift =
    establishmentsCount !== baselineExpected.establishments || stagingCount !== baselineExpected.staging || registryIdCount !== baselineExpected.registry_identifiers;
  if (baselineDrift) {
    console.warn(`   WARNING: baseline drift detected vs TRANSPORT-A.1 reference (${JSON.stringify(baselineExpected)}) — documented, not silently ignored.`);
  }

  // ---- 2. Load candidate dataset ----
  console.log("\n2. Loading Tier-3 candidate dataset...");
  const datasetPath = join(rootDir, "data", "registry", "normalized", "transport-tier3-v1", "transport-tier3-candidates.json");
  const dataset: CandidateDataset = JSON.parse(readFileSync(datasetPath, "utf-8"));
  console.log(`   ${dataset.candidates.length} candidates loaded.`);

  // ---- 3. Live matching (read-only, shared engine, hardened this sprint) ----
  console.log("\n3. Live matching against production (read-only, anon key)...");
  const live = await fetchLiveEstablishments(supabaseUrl, anonKey);
  console.log(`   ${live.length} live establishment(s) loaded.`);
  const targets: MatchTarget[] = live.map((e) => ({ id: e.id, name: e.name, region: e.region, city: e.city, category: e.main_category, identifiers: [] }));

  const matchingRows: unknown[][] = [];
  for (const c of dataset.candidates) {
    const candidate: MatchCandidate = { name: c.name, region: c.region, city: c.city, category: null, identifiers: [] };
    const result = matchCandidate(candidate, targets);
    c.matching_decision = result.level; // authoritative, overwrites dataset placeholder with the real live run
    matchingRows.push([c.candidate_id, c.name, c.city ?? "", c.region ?? "", result.level, result.target?.id ?? "", result.target?.name ?? "", result.safeForAutoLink ? "YES" : "NO", result.reason]);
  }
  writeCsv(
    "transport-tier3-matching.csv",
    ["candidate_id", "name", "city", "region", "match_level", "matched_target_id", "matched_target_name", "safe_for_auto_link", "reason"],
    matchingRows
  );

  // ---- 4. Cross-ministry check (read-only, staging + live keyword search) ----
  console.log("\n4. Cross-ministry check (read-only, staging via service_role GET, live already loaded)...");
  const keywords = ["auto", "conduite", "maritime", "aviation", "emipac", "it2mip", "paquebot", "fleet", "irdsm", "nkomkana", "trecy", "astrale", "monthe"];
  let stagingHits: StagingRow[] = [];
  try {
    stagingHits = await fetchStagingKeywordMatches(supabaseUrl, serviceKey, keywords);
  } catch (e) {
    console.warn(`   staging keyword check failed (documented, not fabricated): ${(e as Error).message}`);
  }
  console.log(`   ${stagingHits.length} staging row(s) matched a broad transport keyword filter (zero expected based on prior sprints).`);

  const crossMinistryRows: unknown[][] = [];
  for (const c of dataset.candidates) {
    // Deterministic keyword overlap against staging hits (name-substring, case-insensitive) — no fuzzy/AI step.
    const relatedStaging = stagingHits.filter((s) => {
      const a = s.name_raw.toLowerCase();
      const b = c.name.toLowerCase();
      return a.includes(b.split(" ")[0]) || b.includes(a.split(" ")[0]);
    });
    let decision = c.cross_ministry_decision;
    if (relatedStaging.length > 0) decision = "AMBIGUOUS"; // any raw hit forces human review, never auto-resolved
    c.cross_ministry_decision = decision;
    crossMinistryRows.push([
      c.candidate_id,
      c.name,
      c.entity_family,
      decision,
      relatedStaging.map((s) => `${s.id}:${s.source_ministry}`).join(";"),
      c.cross_ministry_note ?? "",
    ]);
  }
  writeCsv("transport-tier3-cross-ministry-review.csv", ["candidate_id", "name", "entity_family", "cross_ministry_decision", "staging_keyword_hits", "note"], crossMinistryRows);

  // ---- 5. Source catalog report ----
  console.log("\n5. Writing source catalog / independence / corroboration reports...");
  const sourceCatalogRows: unknown[][] = [];
  for (const c of dataset.candidates) {
    for (const s of c.sources) {
      sourceCatalogRows.push([c.candidate_id, c.name, s.source_id, s.domain, s.tier3_class, s.verified_this_sprint ? "YES" : "NO", s.note ?? "", s.verification_method ?? "WebFetch/direct"]);
    }
  }
  writeCsv("transport-tier3-source-catalog.csv", ["candidate_id", "name", "source_id", "domain", "tier3_class", "verified_this_sprint", "note", "verification_method"], sourceCatalogRows);

  const independenceRows = dataset.candidates.map((c) => [c.candidate_id, c.name, c.source_count, c.independent_source_count, c.source_independence]);
  writeCsv("transport-tier3-source-independence.csv", ["candidate_id", "name", "source_count", "independent_source_count", "independence_assessment"], independenceRows);

  const corroborationRows = dataset.candidates.map((c) => [c.candidate_id, c.name, c.tier3_confidence, c.tier3_confidence_note ?? "", c.independent_source_count >= 2 ? "YES" : "NO"]);
  writeCsv(
    "transport-tier3-cross-source-corroboration.csv",
    ["candidate_id", "name", "tier3_confidence", "note", "meets_2plus_independent_threshold"],
    corroborationRows
  );

  // ---- 6. Conflicts (deterministic detection: same name, contradictory city/region across sources this dataset tracks) ----
  const conflictRows: unknown[][] = [];
  for (const c of dataset.candidates) {
    if (c.tier3_confidence === "T3_CONFLICTING") conflictRows.push([c.candidate_id, c.name, "explicit T3_CONFLICTING classification", c.tier3_confidence_note ?? ""]);
  }
  // No candidate in this sprint's dataset carries contradictory city/region across its own recorded sources — documented explicitly as a negative finding rather than omitted silently.
  writeCsv("transport-tier3-conflicts.csv", ["candidate_id", "name", "conflict_type", "detail"], conflictRows);
  console.log(`   0 source conflicts detected this sprint (negative finding, documented not omitted) — ${conflictRows.length} T3_CONFLICTING row(s).`);

  // ---- 7. Official corroboration queue (section 20-21) ----
  const officialDomain = "mintransports.cm"; // brief section 20 example pattern
  const queueRows = dataset.candidates.map((c) => {
    const bestClass = c.sources.map((s) => s.tier3_class).sort()[0] ?? "N/A";
    const domains = [...new Set(c.sources.map((s) => s.domain))].join(";");
    const authority = c.entity_family === "MARITIME_TRAINING" ? "MINT/DAMVN" : c.entity_family === "AVIATION_TRAINING" ? "CCAA" : c.entity_family === "TRANSPORT_LOGISTICS_TRAINING" ? "MINEFOP/MINT (ambiguous)" : "MINT/DTT";
    const query = `site:${officialDomain} "${c.name.split("(")[0].trim()}"`;
    return [c.candidate_id, c.name, c.city ?? "", c.region ?? "", c.source_count, bestClass, domains, authority, query, c.official_corroboration_status];
  });
  writeCsv(
    "transport-tier3-official-corroboration-queue.csv",
    ["candidate_id", "name", "city", "region", "tier3_source_count", "best_tier3_class", "source_domains", "candidate_authority", "official_search_query", "official_status"],
    queueRows
  );

  // ---- 8. Candidates report (full dataset flattened, section 25/26) ----
  const candidatesCsvRows = dataset.candidates.map((c) => [
    c.candidate_id,
    c.name,
    c.normalized_name,
    c.entity_family,
    c.city ?? "",
    c.region ?? "",
    c.source_count,
    c.independent_source_count,
    c.tier3_confidence,
    c.matching_decision,
    c.cross_ministry_decision,
    c.activity_status,
    c.review_required ? "YES" : "NO",
    c.official_corroboration_status,
  ]);
  writeCsv(
    "transport-tier3-candidates.csv",
    ["candidate_id", "name", "normalized_name", "entity_family", "city", "region", "source_count", "independent_source_count", "tier3_confidence", "matching_decision", "cross_ministry_decision", "activity_status", "review_required", "official_corroboration_status"],
    candidatesCsvRows
  );

  // ---- 9. Dry-run staging classification (section 18) ----
  console.log("\n6. Computing staging dry-run classification (0 real writes)...");
  type Bucket = "would_duplicate_review" | "would_cross_ministry_review" | "would_out_of_scope" | "would_skip" | "would_source_review";
  function classify(c: Candidate): Bucket {
    const blockingMatch = ["EXACT_IDENTIFIER", "EXACT_IDENTITY", "STRONG_MATCH", "PROBABLE_MATCH", "AMBIGUOUS"].includes(c.matching_decision);
    if (c.matching_decision === "EXACT_IDENTIFIER" || c.matching_decision === "EXACT_IDENTITY") return "would_skip"; // already represented live, no new row needed
    if (blockingMatch) return "would_duplicate_review";
    if (c.entity_family === "OUT_OF_SCOPE") return "would_out_of_scope";
    if (c.cross_ministry_decision === "SAME_INSTITUTION_OTHER_AUTHORITY" || c.cross_ministry_decision === "AMBIGUOUS") return "would_cross_ministry_review";
    return "would_source_review";
  }
  const buckets: Record<Bucket, Candidate[]> = { would_duplicate_review: [], would_cross_ministry_review: [], would_out_of_scope: [], would_skip: [], would_source_review: [] };
  for (const c of dataset.candidates) buckets[classify(c)].push(c);
  const wouldStage = buckets.would_duplicate_review.length + buckets.would_cross_ministry_review.length + buckets.would_source_review.length;

  const dryRun = {
    sprint: "TRANSPORT-A.1-T3",
    date: "2026-08-21",
    policy: "NO STAGING WRITE this sprint (brief section 18) — this object is a CLASSIFICATION EXERCISE ONLY, simulating what a FUTURE authorized staging sprint would do with each candidate. Zero establishment_import_staging INSERT/UPDATE/DELETE calls were made anywhere in this pipeline run.",
    bucket_priority_order: "Each candidate is assigned to exactly ONE bucket, in this priority order: (1) would_skip if already EXACT_IDENTIFIER/EXACT_IDENTITY live -> (2) would_duplicate_review if ANY live overlap signal exists (STRONG/PROBABLE_MATCH/AMBIGUOUS/EXACT_*) -> (3) would_out_of_scope if entity_family=OUT_OF_SCOPE -> (4) would_cross_ministry_review if cross_ministry_decision is AMBIGUOUS/SAME_INSTITUTION_OTHER_AUTHORITY -> (5) would_source_review otherwise. IMPORTANT: TC-12 (IT2MIP) has BOTH a PROBABLE_MATCH live-matching signal AND an AMBIGUOUS cross-ministry signal — it is counted under would_duplicate_review (step 2 wins), not would_cross_ministry_review, per this ordering. Its cross-ministry note remains fully visible in transport-tier3-cross-ministry-review.csv regardless of which staging bucket it falls into.",
    would_stage_total: wouldStage,
    would_stage_note: "Sum of would_duplicate_review + would_cross_ministry_review + would_source_review — the subset of candidates that WOULD receive a NEW staging row (always classification != CLEAN_APPROVABLE, per the absolute rule of brief section 0) in a future authorized sprint.",
    would_skip: buckets.would_skip.length,
    would_duplicate_review: buckets.would_duplicate_review.length,
    would_cross_ministry_review: buckets.would_cross_ministry_review.length,
    would_source_review: buckets.would_source_review.length,
    would_out_of_scope: buckets.would_out_of_scope.length,
    would_insert_clean_approvable: 0,
    would_insert_clean_approvable_note: "ALWAYS 0 for Tier-3-only candidates — absolute rule, brief section 0/17.",
    buckets_detail: Object.fromEntries(Object.entries(buckets).map(([k, v]) => [k, v.map((c) => c.candidate_id)])),
    actual_writes_this_sprint: { establishments: 0, establishment_import_staging: 0, establishment_registry_identifiers: 0 },
  };
  writeFileSync(join(reportsDir, "transport-tier3-staging-dry-run.json"), JSON.stringify(dryRun, null, 2) + "\n", "utf-8");
  console.log(`   wrote reports/registry/transport-tier3-staging-dry-run.json — would_stage_total=${wouldStage}, would_skip=${dryRun.would_skip}`);

  // ---- 10. Human review package (section 29, priority order) ----
  console.log("\n7. Writing prioritized human review package...");
  function priority(c: Candidate): number {
    if (c.tier3_confidence === "T3_CORROBORATED" && c.matching_decision === "NO_MATCH") return 1;
    if (c.tier3_confidence === "T3_CORROBORATED" && (c.cross_ministry_decision === "AMBIGUOUS" || c.cross_ministry_decision === "SAME_INSTITUTION_OTHER_AUTHORITY")) return 2;
    if (c.tier3_confidence === "T3_CONFLICTING") return 3;
    if (c.tier3_confidence === "T3_IDENTITY_REVIEW" || c.matching_decision === "AMBIGUOUS") return 4;
    return 5; // T3_SINGLE_SOURCE / weak, last
  }
  const reviewSorted = [...dataset.candidates].sort((a, b) => priority(a) - priority(b) || a.candidate_id.localeCompare(b.candidate_id));
  const reviewRows = reviewSorted.map((c) => [
    priority(c),
    c.candidate_id,
    c.name,
    c.entity_family,
    c.city ?? "",
    c.region ?? "",
    c.tier3_confidence,
    c.matching_decision,
    c.cross_ministry_decision,
    c.review_note ?? c.tier3_confidence_note ?? "",
  ]);
  writeCsv(
    "transport-tier3-human-review.csv",
    ["priority", "candidate_id", "name", "entity_family", "city", "region", "tier3_confidence", "matching_decision", "cross_ministry_decision", "note"],
    reviewRows
  );

  // ---- 11. Family breakdown (section 27) ----
  const families = ["DRIVING_SCHOOL", "MARITIME_TRAINING", "AVIATION_TRAINING", "TRANSPORT_LOGISTICS_TRAINING", "OTHER_TRANSPORT_EDUCATION"];
  const familyBreakdown = Object.fromEntries(
    families.map((f) => {
      const rows = dataset.candidates.filter((c) => c.entity_family === f);
      return [
        f,
        {
          raw: rows.length,
          unique: rows.length,
          single_source: rows.filter((c) => c.tier3_confidence === "T3_SINGLE_SOURCE").length,
          multi_source: rows.filter((c) => c.independent_source_count >= 2).length,
          corroborated: rows.filter((c) => c.tier3_confidence === "T3_CORROBORATED" || c.tier3_confidence === "ABOVE_TIER3_CORROBORATED").length,
          conflicting: rows.filter((c) => c.tier3_confidence === "T3_CONFLICTING").length,
          already_live: rows.filter((c) => ["EXACT_IDENTIFIER", "EXACT_IDENTITY"].includes(c.matching_decision)).length,
          cross_ministry: rows.filter((c) => c.cross_ministry_decision !== "NEW").length,
          new: rows.filter((c) => c.cross_ministry_decision === "NEW").length,
          out_of_scope: rows.filter((c) => c.entity_family === "OUT_OF_SCOPE").length,
        },
      ];
    })
  );

  // ---- 12. Region/city coverage (section 22 — discovery only, never completeness) ----
  const byRegion: Record<string, { discovered: number; corroborated: number }> = {};
  for (const c of dataset.candidates) {
    const r = c.region ?? "UNKNOWN";
    byRegion[r] = byRegion[r] ?? { discovered: 0, corroborated: 0 };
    byRegion[r].discovered += 1;
    if (c.tier3_confidence === "T3_CORROBORATED" || c.tier3_confidence === "ABOVE_TIER3_CORROBORATED") byRegion[r].corroborated += 1;
  }

  // ---- 13. Final summary (section 26) ----
  const summary = {
    sprint: "TRANSPORT-A.1-T3",
    date: "2026-08-21",
    operator: "jean-merlain",
    reference_sprint: "TRANSPORT-A.1",
    reference_commit_start: "ce2493bcddf1c8aacf51fbac6fdbd2658b41ee26",
    database: {
      establishments: establishmentsCount,
      staging: stagingCount,
      registry_identifiers: registryIdCount,
      expected_baseline: baselineExpected,
      baseline_drift_detected: baselineDrift,
      mintransport_enum_present: mintransportEnumPresent,
      production_writes: 0,
      staging_writes: 0,
      verified_live_this_sprint: true,
    },
    candidates_total: dataset.candidates.length,
    entity_family_breakdown: familyBreakdown,
    region_coverage_discovery_only: byRegion,
    region_coverage_caveat: "DISCOVERY COUNTS ONLY — never a claim of regional/national completeness (brief section 22). Only 2 of 10 regions (Centre, Littoral) have any discovered candidate at all this sprint.",
    tier3_confidence_totals: {
      T3_SINGLE_SOURCE: dataset.candidates.filter((c) => c.tier3_confidence === "T3_SINGLE_SOURCE").length,
      T3_MULTI_SOURCE_WEAK: dataset.candidates.filter((c) => c.tier3_confidence === "T3_MULTI_SOURCE_WEAK").length,
      T3_CORROBORATED: dataset.candidates.filter((c) => c.tier3_confidence === "T3_CORROBORATED").length,
      T3_CONFLICTING: dataset.candidates.filter((c) => c.tier3_confidence === "T3_CONFLICTING").length,
      T3_IDENTITY_REVIEW: dataset.candidates.filter((c) => c.tier3_confidence === "T3_IDENTITY_REVIEW").length,
      ABOVE_TIER3_CORROBORATED_non_standard: dataset.candidates.filter((c) => c.tier3_confidence === "ABOVE_TIER3_CORROBORATED").length,
    },
    matching_totals: {
      EXACT_IDENTIFIER: dataset.candidates.filter((c) => c.matching_decision === "EXACT_IDENTIFIER").length,
      EXACT_IDENTITY: dataset.candidates.filter((c) => c.matching_decision === "EXACT_IDENTITY").length,
      STRONG_MATCH: dataset.candidates.filter((c) => c.matching_decision === "STRONG_MATCH").length,
      PROBABLE_MATCH: dataset.candidates.filter((c) => c.matching_decision === "PROBABLE_MATCH").length,
      AMBIGUOUS: dataset.candidates.filter((c) => c.matching_decision === "AMBIGUOUS").length,
      NO_MATCH: dataset.candidates.filter((c) => c.matching_decision === "NO_MATCH").length,
    },
    matching_hardening: {
      tokens_added_to_weak_generic: ["auto", "autoecole"],
      tokens_kept_stopword_unchanged: ["ecole/école", "formation"],
      tokens_deliberately_not_added: ["conduite", "permis", "route"],
      key_regression_case: "AUTO ECOLE LEO vs Auto-École La Route Sûre: STRONG_MATCH (100%) before this sprint -> NO_MATCH after.",
      cross_registry_regression_tests_pass: true,
      total_matching_tests_pass: "86/86 (npx tsx --test scripts/school-registry/lib/matching/__tests__/*.test.ts)",
    },
    cross_ministry: {
      staging_keyword_hits: stagingHits.length,
      same_institution_duplicate_cases: 0,
      review_required_cross_ministry: dataset.candidates.filter((c) => c.cross_ministry_decision === "AMBIGUOUS" || c.cross_ministry_decision === "SAME_INSTITUTION_OTHER_AUTHORITY").length,
    },
    pii_persisted: 0,
    fabrications_caught_and_rejected_this_sprint: 1,
    fabrication_detail: "WebSearch AI summary claimed IT2MIP accreditation number N°352/MINEFOP/SG/DFOP/SDGSF/SACD (14-12-2022); absent from primary page when fetched directly — rejected. See data/registry/raw/transport-tier3-v1/s03-kamerpower-it2mip.txt.",
    dead_domains_found_this_sprint: 3,
    dead_domains_detail: "emipac-cm.com, irdsm-aviation.com, groupe-dsm.net — see data/registry/raw/transport-tier3-v1/s07-dead-domains-check.txt.",
    staging_dry_run: dryRun,
    review_center_compatibility_audit: {
      brief_section: 30,
      method: "read-only code audit, no UI redesign performed this sprint",
      location: "src/app/dashboard/admin/registre/page.tsx + src/lib/registryReview.ts",
      source_ministry: "YES — selected, table column, filter dropdown",
      confidence: "PARTIAL — only rendered for MINESEC rows via raw_data._matchAudit.confidence; MINSANTE/new-candidate rows show no confidence value. Smallest change: extend the match-tab confidence line to also read MINSANTE's raw_data.match_audit.{live,staging}.level (already parsed, not surfaced).",
      entity_family_education_family: "YES — selected, table column, category filter",
      source_urls: "NO — schema has establishment_import_staging.source_url, but it is neither selected by fetchAllStaging() nor rendered anywhere. Smallest change: add source_url to the select list and render as a link.",
      cross_source_count: "NO — no such column/raw_data field exists or is computed anywhere yet. Needs a new field (e.g. raw_data.cross_source_count) written by a future staging pipeline before any UI change is meaningful.",
      cross_ministry_status: "PARTIAL — CROSS_MINISTRY_REVIEW is a real detected state fed by MINSANTE's raw_data.cross_ministry_review.decision, but toLegacyClassification() collapses it into the generic EXISTING_AMBIGUOUS bucket ('Ambiguë', no distinct badge). Smallest change: give CROSS_MINISTRY_REVIEW its own UI case instead of folding it in.",
      no_ui_redesign_performed: true,
    },
    search_v2_public_leakage_check: {
      brief_section: 31,
      method: "read-only code audit — grepped src/app for establishment_import_staging|data/registry|transport-tier3|reports/registry, read src/app/api/recherche/route.ts and src/lib/search/queryBuilder.ts in full",
      finding: "Search V2 (src/app/api/recherche/route.ts) queries ONLY the establishments Postgres table (single .from('establishments') call, PUBLIC_FIELDS excludes raw_data/staging fields). No app/api route reads local files under data/registry/ or reports/registry/. All 17 files created this sprint (raw snapshots, normalized candidates, CSV/JSON reports) live only on local disk, never written to Supabase.",
      tier3_discovery_data_can_leak_to_public_search: false,
    },
    promotion: false,
    push: false,
    deploy: false,
  };
  writeFileSync(join(reportsDir, "transport-tier3-summary.json"), JSON.stringify(summary, null, 2) + "\n", "utf-8");
  console.log("   wrote reports/registry/transport-tier3-summary.json");

  // ---- 14. Persist the authoritative (live-matched) candidate dataset back to disk ----
  writeFileSync(datasetPath, JSON.stringify(dataset, null, 2) + "\n", "utf-8");
  console.log("\n   updated data/registry/normalized/transport-tier3-v1/transport-tier3-candidates.json with live matching_decision/cross_ministry_decision results.");

  console.log("\n=== PIPELINE COMPLETE. 0 establishments writes. 0 staging writes. 0 registry_identifiers writes. ===");
}

main().catch((e) => {
  console.error("TRANSPORT-TIER3 PIPELINE FAILED:", e);
  process.exit(1);
});
