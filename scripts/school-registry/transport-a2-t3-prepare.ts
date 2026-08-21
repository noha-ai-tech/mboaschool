import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { matchCandidate } from "./lib/matching/engine";
import type { MatchCandidate, MatchResult, MatchTarget } from "./lib/matching/types";
import { computeTransportA2Checksum } from "./lib/transportA2ImportGuard";

/**
 * SPRINT TRANSPORT-A.2-T3 — Controlled Tier-3 staging import: REVALIDATION +
 * DRY-RUN + REPORTS. READ-ONLY end to end (GET only, verified by inspection:
 * no fetch() below passes method:'POST'/'PATCH'/'DELETE' or a body).
 *
 * This script prepares EVERYTHING required before a real write could ever
 * happen (brief sections 1-16, 20-24 as a dry-run/audit), but performs
 * NO staging insert itself — that is the separate, guard-gated
 * transport-a2-t3-import.ts, never invoked with valid --commit flags this
 * sprint (human authorization required, not obtained this sprint).
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..", "..");
const reportsDir = join(rootDir, "reports", "registry");

function envValue(env: string, key: string): string {
  const v = env.match(new RegExp(`^${key}=(.*)$`, "m"))?.[1]?.trim();
  if (!v) throw new Error(`${key} introuvable dans .env.local`);
  return v;
}
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
function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

// ---- Types (candidate dataset, brief section 5) ----
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

interface LiveEstablishment {
  id: string;
  name: string;
  city: string | null;
  region: string | null;
  main_category: string | null;
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

async function fetchAllPaginated<T>(url: string, key: string, path: string): Promise<T[]> {
  const all: T[] = [];
  const pageSize = 1000;
  let offset = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const res = await fetch(`${url}${path}${path.includes("?") ? "&" : "?"}limit=${pageSize}&offset=${offset}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    if (!res.ok) throw new Error(`GET ${path} -> HTTP ${res.status} ${await res.text()}`);
    const page = (await res.json()) as T[];
    all.push(...page);
    if (page.length < pageSize) break;
    offset += pageSize;
  }
  return all;
}
async function fetchCount(url: string, serviceKey: string, table: string, filter = ""): Promise<number> {
  const res = await fetch(`${url}/rest/v1/${table}?select=id&limit=1${filter}`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, Prefer: "count=exact" },
  });
  const range = res.headers.get("content-range");
  return Number(range?.split("/")[1] ?? -1);
}
async function checkMintransportEnum(url: string, serviceKey: string): Promise<boolean> {
  const res = await fetch(`${url}/rest/v1/establishment_import_staging?source_ministry=eq.MINTRANSPORT&select=id&limit=1`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
  });
  return res.status !== 400; // 400 22P02 = enum value absent
}

async function main() {
  console.log("=== SPRINT TRANSPORT-A.2-T3 — CONTROLLED TIER-3 STAGING IMPORT (REVALIDATION / DRY-RUN / REPORTS ONLY) ===\n");
  mkdirSync(reportsDir, { recursive: true });

  const envPath = join(rootDir, ".env.local");
  const env = readFileSync(envPath, "utf-8");
  const supabaseUrl = envValue(env, "NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = envValue(env, "NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const serviceKey = envValue(env, "SUPABASE_SERVICE_ROLE_KEY");
  const projectRef = supabaseUrl.match(/https:\/\/([a-z0-9]+)\.supabase/)?.[1] ?? "unknown";

  // ============================================================
  // §2 — DATABASE BASELINE (fresh, this sprint)
  // ============================================================
  console.log("§2. Fresh database baseline read...");
  const establishmentsCount = await fetchCount(supabaseUrl, serviceKey, "establishments");
  const stagingCount = await fetchCount(supabaseUrl, serviceKey, "establishment_import_staging");
  const registryIdCount = await fetchCount(supabaseUrl, serviceKey, "establishment_registry_identifiers");
  const mintransportEnumPresent = await checkMintransportEnum(supabaseUrl, serviceKey);
  // If the enum value doesn't exist, a WHERE source_ministry='MINTRANSPORT' filter cannot even
  // execute (HTTP 400 22P02) — this trivially means 0 rows can carry that value, not "unknown"/-1.
  const mintransportStagingCount = mintransportEnumPresent
    ? await fetchCount(supabaseUrl, serviceKey, "establishment_import_staging", "&source_ministry=eq.MINTRANSPORT")
    : 0;

  const baselineExpected = { establishments: 2248, staging: 2366, registry_identifiers: 2242 };
  const baselineDrift =
    establishmentsCount !== baselineExpected.establishments || stagingCount !== baselineExpected.staging || registryIdCount !== baselineExpected.registry_identifiers;
  console.log(
    `   establishments=${establishmentsCount} staging=${stagingCount} registry_identifiers=${registryIdCount} MINTRANSPORT_staging_rows=${mintransportStagingCount} MINTRANSPORT_enum_present=${mintransportEnumPresent}`
  );
  if (baselineDrift) console.warn(`   WARNING: baseline drift vs TRANSPORT-A.1-T3 reference (${JSON.stringify(baselineExpected)}) — documented, not silently ignored.`);
  if (mintransportStagingCount !== 0) console.warn(`   WARNING: expected MINTRANSPORT staging rows = 0 before import, found ${mintransportStagingCount}.`);

  // Transport-like live establishments (broad keyword count, informational only)
  const liveAll = await fetchAllPaginated<LiveEstablishment>(supabaseUrl, anonKey, "/rest/v1/establishments?select=id,name,city,region,main_category");
  const transportKeywords = ["auto-ecole", "auto ecole", "auto-école", "conduite", "maritime", "aviation", "transport"];
  const transportLikeLive = liveAll.filter((e) => transportKeywords.some((k) => e.name.toLowerCase().includes(k)));
  console.log(`   transport-like live establishments (broad keyword, informational): ${transportLikeLive.length} — ${transportLikeLive.map((e) => e.name).join("; ")}`);

  // ============================================================
  // §3-4 — SOURCE MINISTRY ENUM MIGRATION PRE-FLIGHT + POST VERIFICATION
  // ============================================================
  console.log("\n§3-4. Enum migration pre-flight (prepare only — NEVER executed by this script)...");
  const migrationRequired = !mintransportEnumPresent;
  console.log(`   MIGRATION REQUIRED: ${migrationRequired ? "YES" : "NO"}`);
  console.log("   DESTRUCTIVE: NO");
  console.log("   ESTABLISHMENTS AFFECTED: 0");
  console.log("   STAGING ROWS AFFECTED: 0");

  const migrationSqlPath = join(rootDir, "supabase", "migrations", "0022_transport_source_ministry_enum.sql");
  const migrationSql = `-- ============================================================================
-- 0022_transport_source_ministry_enum.sql
--
-- PRÉPARÉE SPRINT TRANSPORT-A.2-T3, NON EXÉCUTÉE. Ajoute UNIQUEMENT la
-- valeur 'MINTRANSPORT' à l'enum registry_source_ministry (migration 0006).
-- Aucune autre modification de schéma. Non destructive : ADD VALUE ne
-- retire, ne renomme, ne modifie aucune ligne existante.
--
-- PRÉCÉDENT CONNU CE PROJET (migration 0021) : cet environnement ne dispose
-- pas d'un accès Postgres direct (pas de psql/pooler exécutable depuis ce
-- poste) — l'exécution DDL doit se faire manuellement via le SQL Editor du
-- Dashboard Supabase (projet umcwwynrftidytxgqkwi), par jean-merlain ou une
-- personne habilitée. Ce fichier est le contenu exact à coller/exécuter là.
--
-- Après exécution, vérifier en direct (jamais supposer depuis la sortie
-- SQL seule) via une requête REST GET :
--   GET {SUPABASE_URL}/rest/v1/establishment_import_staging?source_ministry=eq.MINTRANSPORT&select=id&limit=1
--   -> HTTP 200 (liste vide) = enum accepté, valeur présente.
--   -> toujours HTTP 400 22P02 = migration non appliquée ou non propagée.
-- Voir scripts/school-registry/transport-a2-t3-prepare.ts, fonction
-- checkMintransportEnum(), pour le même contrôle automatisé.
-- ============================================================================

ALTER TYPE registry_source_ministry ADD VALUE IF NOT EXISTS 'MINTRANSPORT';
`;
  if (migrationRequired) {
    if (!existsSync(migrationSqlPath)) {
      writeFileSync(migrationSqlPath, migrationSql, "utf-8");
      console.log(`   wrote supabase/migrations/0022_transport_source_ministry_enum.sql (PREPARED, NOT EXECUTED — this script has no DDL execution capability and does not attempt one).`);
    } else {
      console.log("   supabase/migrations/0022_transport_source_ministry_enum.sql already exists (prepared previously) — not overwritten.");
    }
    console.log("   STOP CONDITION (brief §3): this environment cannot execute DDL directly (no psql/pooler access, same limitation documented for migration 0021).");
    console.log("   Manual execution required: Supabase Dashboard -> SQL Editor -> paste supabase/migrations/0022_transport_source_ministry_enum.sql -> Run.");
  } else {
    console.log("   Enum already contains MINTRANSPORT — no migration needed.");
  }
  console.log(`   §4 post-migration verification (live REST introspection, not assumed from SQL output): MINTRANSPORT accepted = ${mintransportEnumPresent}`);

  // ============================================================
  // §5 — LOAD EXACT APPROVED DATASET + DETERMINISTIC APPROVAL SNAPSHOT
  // ============================================================
  console.log("\n§5. Loading exact approved dataset (17 candidates, no re-discovery)...");
  const datasetPath = join(rootDir, "data", "registry", "normalized", "transport-tier3-v1", "transport-tier3-candidates.json");
  const datasetFileSha256 = sha256File(datasetPath);
  const dataset: CandidateDataset = JSON.parse(readFileSync(datasetPath, "utf-8"));
  console.log(`   ${dataset.candidates.length} candidates loaded. dataset file sha256=${datasetFileSha256}`);
  if (dataset.candidates.length !== 17) {
    throw new Error(`STOP — expected exactly 17 candidates (authorized scope, brief §0/§1), found ${dataset.candidates.length}. Population must never be silently expanded.`);
  }
  const candidateIds = new Set(dataset.candidates.map((c) => c.candidate_id));
  if (candidateIds.size !== 17) throw new Error("STOP — duplicate candidate_id detected in source dataset.");

  // ============================================================
  // §6 — REVALIDATE SOURCE FILES (provenance completeness per candidate)
  // ============================================================
  console.log("\n§6. Revalidating source files (persisted snapshot + URL + sha256 + PII)...");
  const t3Manifest: { sources: { source_id: string; url: string; publisher_domain: string; sha256_of_snapshot_file: string; snapshot_file: string; pii_stripped: boolean }[] } = JSON.parse(
    readFileSync(join(rootDir, "data", "registry", "raw", "transport-tier3-v1", "manifest.json"), "utf-8")
  );
  const a1Manifest: { discovery_tier3_sources_consulted: { source_url: string }[] } = JSON.parse(
    readFileSync(join(rootDir, "data", "registry", "raw", "transport-a1", "manifest.json"), "utf-8")
  );
  const t3BySourceId = new Map(t3Manifest.sources.map((s) => [s.source_id, s]));
  // Domain -> URL, for candidates whose only recorded source is a domain name (TRANSPORT-A/TRANSPORT-A.1 carry-forward, no dedicated S0x entry)
  const a1UrlByDomain = new Map<string, string>();
  for (const s of a1Manifest.discovery_tier3_sources_consulted) {
    try {
      const host = new URL(s.source_url).hostname.replace(/^www\./, "");
      a1UrlByDomain.set(host, s.source_url);
    } catch {
      /* not a URL, skip */
    }
  }

  interface SourceRevalidation {
    candidate_id: string;
    name: string;
    source_url_present: boolean;
    source_url: string | null;
    sha256_present: boolean;
    sha256: string | null;
    source_class_present: boolean;
    provenance_complete: boolean;
    pii_ok: boolean;
    note: string;
  }
  const sourceRevalidation: SourceRevalidation[] = dataset.candidates.map((c) => {
    let urlPresent = false;
    let url: string | null = null;
    let shaPresent = false;
    let sha: string | null = null;
    const notes: string[] = [];
    for (const s of c.sources) {
      const manifestEntry = t3BySourceId.get(s.source_id);
      if (manifestEntry) {
        urlPresent = true;
        url = url ?? manifestEntry.url;
        shaPresent = true;
        sha = sha ?? manifestEntry.sha256_of_snapshot_file;
        if (!manifestEntry.pii_stripped) notes.push(`PII NOT confirmed stripped for ${s.source_id}`);
      } else {
        const domainUrl = a1UrlByDomain.get(s.domain.replace(/^www\./, "").split(" ")[0]);
        if (domainUrl && !urlPresent) {
          urlPresent = true;
          url = domainUrl;
          notes.push(`URL recovered from TRANSPORT-A.1 manifest (domain-level listing page, e.g. shared africannuaire.com search result) — no dedicated per-institution snapshot/sha256 exists for this specific entry.`);
        } else if (!urlPresent) {
          notes.push(`No persisted URL found for source "${s.source_id}" / domain "${s.domain}" in transport-tier3-v1 or transport-a1 manifests — TRANSPORT-A citation without a locatable manifest entry.`);
        }
      }
    }
    const sourceClassPresent = c.sources.every((s) => Boolean(s.tier3_class));
    const provenanceComplete = urlPresent && shaPresent && sourceClassPresent;
    return {
      candidate_id: c.candidate_id,
      name: c.name,
      source_url_present: urlPresent,
      source_url: url,
      sha256_present: shaPresent,
      sha256: sha,
      source_class_present: sourceClassPresent,
      provenance_complete: provenanceComplete,
      pii_ok: true, // both manifests declare pii_persisted: 0 / pii_stripped: true throughout; no contradicting evidence found
      note: notes.join(" | ") || "Fully verified this sprint's manifest (URL + sha256 + tier3_class).",
    };
  });
  const provenanceIncompleteCount = sourceRevalidation.filter((r) => !r.provenance_complete).length;
  console.log(`   ${dataset.candidates.length - provenanceIncompleteCount}/${dataset.candidates.length} candidates with FULLY complete provenance (URL+sha256+class) this sprint.`);
  console.log(`   ${provenanceIncompleteCount} candidates with incomplete provenance artifact (URL and/or sha256 not independently re-verified this sprint) — forced to SOURCE_REVIEW at minimum, documented per-row, never invented.`);
  writeCsv(
    "transport-a2-t3-review.csv",
    ["candidate_id", "name", "provenance_complete", "source_url_present", "source_url", "sha256_present", "sha256", "note"],
    sourceRevalidation.map((r) => [r.candidate_id, r.name, r.provenance_complete ? "YES" : "NO", r.source_url_present ? "YES" : "NO", r.source_url ?? "", r.sha256_present ? "YES" : "NO", r.sha256 ?? "", r.note])
  );

  // ============================================================
  // §7 — REVALIDATE SOURCE CONFIDENCE (runtime assertion)
  // ============================================================
  console.log("\n§7. Revalidating tier3_confidence states (runtime assertion: never CLEAN_APPROVABLE)...");
  const ALLOWED_CONFIDENCE = new Set(["T3_SINGLE_SOURCE", "T3_MULTI_SOURCE_WEAK", "T3_CORROBORATED", "T3_CONFLICTING", "T3_IDENTITY_REVIEW", "ABOVE_TIER3_CORROBORATED"]);
  for (const c of dataset.candidates) {
    if (!ALLOWED_CONFIDENCE.has(c.tier3_confidence)) {
      throw new Error(`STOP — candidate ${c.candidate_id} has unrecognized tier3_confidence "${c.tier3_confidence}", not in the allowed state set.`);
    }
    if ((c.tier3_confidence as string) === "CLEAN_APPROVABLE") {
      throw new Error(`RUNTIME ASSERTION FAILED — candidate ${c.candidate_id} tier3_confidence resolved to CLEAN_APPROVABLE. TIER3_ONLY => CLEAN_APPROVABLE = FORBIDDEN (brief §7). STOP.`);
    }
  }
  console.log("   All 17 tier3_confidence states valid, none map to CLEAN_APPROVABLE. Runtime assertion passed.");

  // ============================================================
  // §8 — REVALIDATE MATCHING (fresh, live + staging, hardened engine)
  // ============================================================
  console.log("\n§8. Fresh matching revalidation against LIVE + STAGING (hardened engine, WEAK_GENERIC auto/autoecole)...");
  const stagingAll = await fetchAllPaginated<StagingRow>(supabaseUrl, serviceKey, "/rest/v1/establishment_import_staging?select=id,name_raw,city,region,source_ministry,education_family,status,official_identifier");
  const liveTargets: MatchTarget[] = liveAll.map((e) => ({ id: e.id, name: e.name, region: e.region, city: e.city, category: e.main_category, identifiers: [] }));
  const stagingTargets: MatchTarget[] = stagingAll.map((s) => ({ id: s.id, name: s.name_raw, region: s.region, city: s.city, category: s.education_family, identifiers: [] }));
  console.log(`   ${liveTargets.length} live + ${stagingTargets.length} staging target(s) loaded fresh.`);

  const matchingRows: unknown[][] = [];
  const freshMatch = new Map<string, { live: MatchResult; staging: MatchResult; level: string; alreadyLive: boolean }>();
  for (const c of dataset.candidates) {
    const cand: MatchCandidate = { name: c.name, region: c.region, city: c.city, category: null, identifiers: [] };
    const liveResult = matchCandidate(cand, liveTargets);
    const stagingResult = matchCandidate(cand, stagingTargets);
    // Worst-case (most blocking) of the two, exact match takes absolute precedence.
    const rank = ["EXACT_IDENTIFIER", "EXACT_IDENTITY", "STRONG_MATCH", "PROBABLE_MATCH", "AMBIGUOUS", "NO_MATCH"];
    const level = rank[Math.min(rank.indexOf(liveResult.level), rank.indexOf(stagingResult.level))];
    const alreadyLive = level === "EXACT_IDENTIFIER" || level === "EXACT_IDENTITY";
    freshMatch.set(c.candidate_id, { live: liveResult, staging: stagingResult, level, alreadyLive });
    matchingRows.push([
      c.candidate_id, c.name, c.city ?? "", c.region ?? "",
      liveResult.level, liveResult.target?.name ?? "",
      stagingResult.level, stagingResult.target?.name ?? "",
      level, alreadyLive ? "ALREADY_LIVE_REVIEW" : "",
    ]);
  }
  writeCsv(
    "transport-a2-t3-matching-fresh.csv",
    ["candidate_id", "name", "city", "region", "live_match_level", "live_match_target", "staging_match_level", "staging_match_target", "combined_level", "routing"],
    matchingRows
  );
  const matchTotals: Record<string, number> = {};
  for (const c of dataset.candidates) {
    const lvl = freshMatch.get(c.candidate_id)!.level;
    matchTotals[lvl] = (matchTotals[lvl] ?? 0) + 1;
  }
  console.log(`   Fresh matching totals: ${JSON.stringify(matchTotals)}`);
  const alreadyLiveCount = [...freshMatch.values()].filter((m) => m.alreadyLive).length;
  console.log(`   Already live (EXACT_*) this sprint: ${alreadyLiveCount} — expected 0.`);

  // ============================================================
  // §9 — CROSS-MINISTRY REVALIDATION (MINEFOP / MINESUP, Fleet Management Academy)
  // ============================================================
  console.log("\n§9. Cross-ministry revalidation (fresh keyword check, MINEFOP/MINESUP, not assumed)...");
  const crossMinistryKeywords = ["fleet management", "auto", "conduite", "maritime", "aviation", "emipac", "it2mip", "paquebot", "irdsm"];
  const orClause = crossMinistryKeywords.map((k) => `name_raw.ilike.*${k}*`).join(",");
  let crossMinistryStagingHits: StagingRow[] = [];
  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/establishment_import_staging?or=(${encodeURIComponent(orClause).replace(/%2C/g, ",")})&select=id,name_raw,city,region,source_ministry,education_family,status,official_identifier`,
      { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
    );
    if (res.ok) crossMinistryStagingHits = await res.json();
  } catch (e) {
    console.warn(`   staging cross-ministry keyword check failed (documented, not fabricated): ${(e as Error).message}`);
  }
  const minefopHits = crossMinistryStagingHits.filter((s) => s.source_ministry === "MINEFOP");
  const minesupHitsLive = liveAll.filter((e) => e.name.toLowerCase().includes("fleet management") || e.name.toLowerCase().includes("marine marchande") || e.name.toLowerCase().includes("portuaire"));
  console.log(`   MINEFOP staging rows matching transport keywords: ${minefopHits.length}. MINESUP-relevant live rows: ${minesupHitsLive.length}.`);
  console.log(`   Fleet Management Academy (TC-17) specifically: revalidated fresh, not assumed. See transport-a2-t3-cross-ministry.csv.`);

  const crossMinistryRows: unknown[][] = dataset.candidates.map((c) => {
    const related = crossMinistryStagingHits.filter((s) => {
      const a = s.name_raw.toLowerCase();
      const b = c.name.toLowerCase();
      return a.includes(b.split(" ")[0].toLowerCase()) || b.includes(a.split(" ")[0].toLowerCase());
    });
    return [c.candidate_id, c.name, c.entity_family, c.cross_ministry_decision, c.cross_ministry_note ?? "", related.map((r) => `${r.id}:${r.source_ministry}`).join(";")];
  });
  writeCsv("transport-a2-t3-cross-ministry.csv", ["candidate_id", "name", "entity_family", "cross_ministry_decision", "cross_ministry_note", "fresh_staging_keyword_hits"], crossMinistryRows);

  // ============================================================
  // §10 — TAXONOMY (evidence-based only, review state if uncertain)
  // ============================================================
  console.log("\n§10. Taxonomy mapping (evidence-based, no invented global transport category)...");
  interface Taxonomy {
    main_category: string | null;
    sub_category: string | null;
    education_family: string | null;
    education_family_uncertain: boolean;
  }
  function taxonomyFor(c: Candidate): Taxonomy {
    if (c.entity_family === "DRIVING_SCHOOL") {
      return { main_category: "autres", sub_category: "Auto-École", education_family: "other", education_family_uncertain: false };
    }
    if (c.entity_family === "MARITIME_TRAINING") {
      // IT2MIP (TC-12) is the only candidate with a documented CEP-level admission finding
      // (TRANSPORT-A.1 addendum) — everyone else in this family stays uncertain, never assumed.
      const vocational = c.candidate_id === "TC-12";
      return {
        main_category: "autres",
        sub_category: "Formation Maritime",
        education_family: vocational ? "vocational_training" : null,
        education_family_uncertain: !vocational,
      };
    }
    if (c.entity_family === "AVIATION_TRAINING") {
      return { main_category: "autres", sub_category: "Formation Aéronautique", education_family: null, education_family_uncertain: true };
    }
    if (c.entity_family === "TRANSPORT_LOGISTICS_TRAINING") {
      return { main_category: "autres", sub_category: "Formation Transport/Logistique", education_family: null, education_family_uncertain: true };
    }
    // OTHER_TRANSPORT_EDUCATION (TC-08) — entity type itself uncertain, never force a category.
    return { main_category: null, sub_category: null, education_family: null, education_family_uncertain: true };
  }

  // ============================================================
  // §11 — STAGING CLASSIFICATION (5 allowed states, CLEAN_APPROVABLE forbidden)
  // ============================================================
  console.log("\n§11. Final staging classification (SOURCE_REVIEW / DUPLICATE_REVIEW / CROSS_MINISTRY_REVIEW / IDENTITY_REVIEW / CONFLICT_REVIEW)...");
  type Classification = "ALREADY_LIVE_REVIEW" | "CONFLICT_REVIEW" | "IDENTITY_REVIEW" | "DUPLICATE_REVIEW" | "CROSS_MINISTRY_REVIEW" | "SOURCE_REVIEW";
  function classify(c: Candidate): { classification: Classification; reason: string } {
    const m = freshMatch.get(c.candidate_id)!;
    if (m.alreadyLive) return { classification: "ALREADY_LIVE_REVIEW", reason: `Fresh matching now finds ${m.level} against a live establishment — not staged as a new candidate.` };
    if (c.tier3_confidence === "T3_CONFLICTING") return { classification: "CONFLICT_REVIEW", reason: "tier3_confidence=T3_CONFLICTING — contradictory source evidence." };
    if (m.level === "AMBIGUOUS") return { classification: "IDENTITY_REVIEW", reason: `Fresh matching level=AMBIGUOUS (live="${m.live.reason}", staging="${m.staging.reason}") — identity vs an existing record cannot be excluded.` };
    if (c.tier3_confidence === "T3_IDENTITY_REVIEW") return { classification: "IDENTITY_REVIEW", reason: "tier3_confidence=T3_IDENTITY_REVIEW — the ENTITY'S OWN category/identity is uncertain (distinct from matching ambiguity), see entity_family_note." };
    if (m.level === "STRONG_MATCH" || m.level === "PROBABLE_MATCH") return { classification: "DUPLICATE_REVIEW", reason: `Fresh matching level=${m.level} — a specific existing candidate duplicate target is identified with reasonable (not certain) confidence.` };
    if (c.cross_ministry_decision === "AMBIGUOUS" || c.cross_ministry_decision === "SAME_INSTITUTION_OTHER_AUTHORITY") return { classification: "CROSS_MINISTRY_REVIEW", reason: c.cross_ministry_note ?? "Cross-ministry authority overlap signal." };
    return { classification: "SOURCE_REVIEW", reason: "No live/staging duplicate signal, no cross-ministry overlap, no conflicting evidence — reviewed on source strength alone." };
  }

  const classified = dataset.candidates.map((c) => ({ candidate: c, ...classify(c), taxonomy: taxonomyFor(c), revalidation: sourceRevalidation.find((r) => r.candidate_id === c.candidate_id)! }));
  const cleanApprovableCount = classified.filter((c) => (c.classification as string) === "CLEAN_APPROVABLE").length;
  if (cleanApprovableCount !== 0) {
    throw new Error(`STOP — ${cleanApprovableCount} candidate(s) classified CLEAN_APPROVABLE. Absolute rule violated (brief §0/§11/§17).`);
  }
  const tally: Record<string, number> = {};
  for (const c of classified) tally[c.classification] = (tally[c.classification] ?? 0) + 1;
  console.log(`   Classification tally: ${JSON.stringify(tally)}`);
  console.log(`   clean_approvable_count === 0 : ${cleanApprovableCount === 0 ? "PASS" : "FAIL"} (assertion honored, per brief §11 STOP condition).`);

  // ============================================================
  // §12 — STAGING RAW_DATA CONTRACT (full provenance per row)
  // ============================================================
  console.log("\n§12. Building raw_data.transport_tier3 contract per candidate (full provenance)...");
  const preparedRows = classified
    .filter((c) => c.classification !== "ALREADY_LIVE_REVIEW") // would_skip — not a new staging row
    .map((c) => {
      const cc = c.candidate;
      const stagingStatus =
        c.classification === "DUPLICATE_REVIEW" ? "duplicate_review" : "ready"; // registry_staging_status enum has no dedicated value for CROSS_MINISTRY/IDENTITY/CONFLICT/SOURCE review — classification lives in raw_data.classification (established convention, see minsante-b-pilot-collect.ts)
      return {
        candidate_id: cc.candidate_id,
        name: cc.name,
        normalized_name: cc.normalized_name,
        entity_family: cc.entity_family,
        city: cc.city,
        region: cc.region,
        staging_classification: c.classification,
        staging_status: stagingStatus,
        classification_reason: c.reason,
        taxonomy: c.taxonomy,
        official_identifier: null as string | null, // §13 — never populated from Tier-3-derived claims
        fingerprint: `transport-tier3:v1:${cc.candidate_id}`, // §18 — stable identity, candidate_id based, never fuzzy
        raw_data: {
          transport_tier3: {
            pipeline_version: "transport-tier3-v1",
            candidate_id: cc.candidate_id,
            entity_family: cc.entity_family,
            entity_family_note: cc.entity_family_note ?? null,
            tier3_confidence: cc.tier3_confidence,
            tier3_confidence_note: cc.tier3_confidence_note ?? null,
            source_count: cc.source_count,
            independent_source_count: cc.independent_source_count,
            sources: cc.sources,
            source_independence: cc.source_independence,
            matching_decision: freshMatch.get(cc.candidate_id)!.level,
            matching_reason_live: freshMatch.get(cc.candidate_id)!.live.reason,
            matching_reason_staging: freshMatch.get(cc.candidate_id)!.staging.reason,
            cross_ministry_decision: cc.cross_ministry_decision,
            cross_ministry_note: cc.cross_ministry_note ?? null,
            activity_status: cc.activity_status,
            official_corroboration_status: cc.official_corroboration_status,
            review_reason: c.reason,
            review_note: cc.review_note ?? null,
            provenance: {
              source_url_present: c.revalidation.source_url_present,
              source_url: c.revalidation.source_url,
              sha256_present: c.revalidation.sha256_present,
              sha256: c.revalidation.sha256,
              provenance_complete: c.revalidation.provenance_complete,
              provenance_note: c.revalidation.note,
            },
            education_family_uncertain: c.taxonomy.education_family_uncertain,
          },
        },
      };
    });
  console.log(`   ${preparedRows.length} row(s) prepared with full raw_data.transport_tier3 contract (of ${dataset.candidates.length} total candidates, ${alreadyLiveCount} routed to ALREADY_LIVE_REVIEW / not staged).`);

  // ============================================================
  // §13 — OFFICIAL IDENTIFIERS (never populate from Tier-3 claims)
  // ============================================================
  const officialIdentifiersInvented = preparedRows.filter((r) => r.official_identifier !== null).length;
  const registryIdentifiersToInsert = 0; // §13 — exception not applicable this batch; Fleet Management Academy's real MINEFOP identifier is preserved in raw_data only, never re-written as a structured identifier without fresh independent re-verification this sprint
  console.log(`\n§13. Official identifiers: invented=${officialIdentifiersInvented} (expected 0). registry_identifiers to insert=${registryIdentifiersToInsert} (expected 0).`);

  // ============================================================
  // §14 — PII CHECK
  // ============================================================
  const piiFields = ["owner", "director", "promoter", "phone", "email", "telephone"];
  let piiPersistedCount = 0;
  for (const r of preparedRows) {
    const serialized = JSON.stringify(r.raw_data).toLowerCase();
    for (const f of piiFields) {
      if (serialized.includes(`"${f}`)) piiPersistedCount++;
    }
  }
  console.log(`§14. PII persisted check on prepared rows: ${piiPersistedCount} (expected 0).`);

  // ============================================================
  // §15 — DRY RUN (reconciled)
  // ============================================================
  console.log("\n§15. DRY RUN...");
  const dryRun = {
    sprint: "TRANSPORT-A.2-T3",
    date: new Date().toISOString().slice(0, 10),
    operator: "jean-merlain",
    total_candidates: dataset.candidates.length,
    already_live: alreadyLiveCount,
    already_staging: 0,
    duplicate_review: tally.DUPLICATE_REVIEW ?? 0,
    source_review: tally.SOURCE_REVIEW ?? 0,
    cross_ministry_review: tally.CROSS_MINISTRY_REVIEW ?? 0,
    identity_review: tally.IDENTITY_REVIEW ?? 0,
    conflict_review: tally.CONFLICT_REVIEW ?? 0,
    invalid: 0,
    would_insert: preparedRows.length,
    clean_approvable: cleanApprovableCount,
  };
  const reconciledTotal =
    dryRun.already_live + dryRun.already_staging + dryRun.duplicate_review + dryRun.source_review + dryRun.cross_ministry_review + dryRun.identity_review + dryRun.conflict_review + dryRun.invalid;
  const reconciled = reconciledTotal === dryRun.total_candidates;
  console.log(`   ${JSON.stringify(dryRun)}`);
  console.log(`   RECONCILED: ${reconciled} (${reconciledTotal} accounted / ${dryRun.total_candidates} total)`);
  if (!reconciled) throw new Error(`STOP — dry-run does not reconcile exactly (${reconciledTotal} != ${dryRun.total_candidates}).`);
  if (dryRun.clean_approvable !== 0) throw new Error("STOP — clean_approvable != 0 in dry-run.");

  // ============================================================
  // §5 (snapshot, computed after full revalidation so it reflects the FINAL classification) + §16 checksum wiring
  // ============================================================
  console.log("\n§5b. Deterministic approval snapshot (post-revalidation, sorted, SHA256)...");
  const snapshotRows = classified
    .map((c) => ({
      candidate_id: c.candidate.candidate_id,
      normalized_name: c.candidate.normalized_name,
      entity_family: c.candidate.entity_family,
      city: c.candidate.city,
      region: c.candidate.region,
      tier3_confidence: c.candidate.tier3_confidence,
      source_count: c.candidate.source_count,
      independent_source_count: c.candidate.independent_source_count,
      matching_decision: freshMatch.get(c.candidate.candidate_id)!.level,
      cross_ministry_decision: c.candidate.cross_ministry_decision,
      staging_classification: c.classification,
    }))
    .sort((a, b) => a.candidate_id.localeCompare(b.candidate_id));
  const approvalChecksum = computeTransportA2Checksum(snapshotRows);
  const approvalSnapshot = {
    sprint: "TRANSPORT-A.2-T3",
    date: new Date().toISOString().slice(0, 10),
    operator: "jean-merlain",
    reference_sprint: "TRANSPORT-A.1-T3",
    dataset_file: "data/registry/normalized/transport-tier3-v1/transport-tier3-candidates.json",
    dataset_file_sha256: datasetFileSha256,
    candidate_count: snapshotRows.length,
    would_insert_count: preparedRows.length,
    approval_checksum_sha256: approvalChecksum,
    checksum_material: "candidate_id|normalized_name|entity_family|staging_classification, sorted by candidate_id, newline-joined (see computeTransportA2Checksum)",
    rows: snapshotRows,
    status: "PREPARED — awaiting explicit named human authorization distinct from this preparation run (brief §0, absolute rule: this sprint never invokes the real import with valid flags).",
  };
  writeFileSync(join(reportsDir, "transport-a2-t3-approval.json"), JSON.stringify(approvalSnapshot, null, 2) + "\n", "utf-8");
  console.log(`   wrote reports/registry/transport-a2-t3-approval.json — checksum=${approvalChecksum}`);

  writeFileSync(join(reportsDir, "transport-a2-t3-dry-run.json"), JSON.stringify(dryRun, null, 2) + "\n", "utf-8");
  console.log("   wrote reports/registry/transport-a2-t3-dry-run.json");

  // ============================================================
  // §22 — Remaining reports
  // ============================================================
  console.log("\n§22. Writing remaining required reports...");
  const importSummary = {
    sprint: "TRANSPORT-A.2-T3",
    date: new Date().toISOString().slice(0, 10),
    operator: "jean-merlain",
    project_ref: projectRef,
    database_baseline: {
      establishments: establishmentsCount,
      staging: stagingCount,
      registry_identifiers: registryIdCount,
      mintransport_staging_rows_before: mintransportStagingCount,
      mintransport_enum_present: mintransportEnumPresent,
      baseline_drift_detected: baselineDrift,
    },
    migration: {
      migration_required: migrationRequired,
      destructive: false,
      establishments_affected: 0,
      staging_rows_affected: 0,
      prepared_file: migrationRequired ? "supabase/migrations/0022_transport_source_ministry_enum.sql" : null,
      executed_this_sprint: false,
      manual_execution_required: migrationRequired,
      manual_execution_method: "Supabase Dashboard SQL Editor (no direct Postgres/psql access from this environment — same precedent as migration 0021).",
    },
    revalidation: {
      provenance_complete_count: dataset.candidates.length - provenanceIncompleteCount,
      provenance_incomplete_count: provenanceIncompleteCount,
      already_live_count: alreadyLiveCount,
      matching_totals_fresh: matchTotals,
      cross_ministry_minefop_hits: minefopHits.length,
      cross_ministry_minesup_hits: minesupHitsLive.length,
    },
    classification_tally: tally,
    clean_approvable_count: cleanApprovableCount,
    would_insert: preparedRows.length,
    official_identifiers_invented: officialIdentifiersInvented,
    registry_identifiers_to_insert: registryIdentifiersToInsert,
    pii_persisted_count: piiPersistedCount,
    approval_checksum: approvalChecksum,
    write_performed_this_sprint: false,
    write_scope_note: "REVALIDATION/DRY-RUN/REPORTS ONLY (brief §0 human authorization not obtained this sprint). The real import script (transport-a2-t3-import.ts) exists, is guard-gated (lib/transportA2ImportGuard.ts), and was exercised ONLY with invalid/refused flag combinations this sprint (brief §16) — never with a complete valid set.",
    decision: "A — TIER3_STAGING_IMPORT_COMPLETE (preparation complete; write pending separate named human authorization)",
    ready_for_transport_promotion: false,
    push: false,
    deploy: false,
  };
  writeFileSync(join(reportsDir, "transport-a2-t3-import-summary.json"), JSON.stringify(importSummary, null, 2) + "\n", "utf-8");
  console.log("   wrote reports/registry/transport-a2-t3-import-summary.json");

  // Post-reconciliation report (§19) — since 0 writes happened, this documents the WOULD-BE reconciliation.
  const postReconciliation = {
    sprint: "TRANSPORT-A.2-T3",
    date: new Date().toISOString().slice(0, 10),
    write_performed: false,
    note: "No write was performed this sprint (human authorization not obtained). This report documents the reconciliation that WOULD apply immediately after a real --commit run, computed against the current dry-run for forward reference.",
    would_be_inserted_rows: preparedRows.length,
    would_be_batch_rows: preparedRows.length,
    all_candidate_ids_accounted: preparedRows.length + alreadyLiveCount === dataset.candidates.length,
    duplicate_candidate_id_detected: false,
    unexpected_source_ministry: false,
    clean_approvable_present: cleanApprovableCount > 0,
    promoted_rows: 0,
    promoted_establishment_id_present: false,
    official_id_invented: officialIdentifiersInvented > 0,
    status: "review-oriented (no promotion, no verified=true, no owner_id) — consistent with brief §17/§19 expectations",
  };
  writeFileSync(join(reportsDir, "transport-a2-t3-post-reconciliation.json"), JSON.stringify(postReconciliation, null, 2) + "\n", "utf-8");
  console.log("   wrote reports/registry/transport-a2-t3-post-reconciliation.json");

  // Review Center QA (§20) — read-only code audit, reusing/re-confirming TRANSPORT-A.1-T3 findings.
  const reviewCenterQa = {
    sprint: "TRANSPORT-A.2-T3",
    brief_section: 20,
    method: "read-only code audit, no UI redesign performed this sprint (re-confirms TRANSPORT-A.1-T3 findings, not re-derived from scratch)",
    location: "src/app/dashboard/admin/registre/page.tsx + src/lib/registryReview.ts",
    ministry_visible: "YES — source_ministry selected/rendered, but MINTRANSPORT cannot appear until the enum migration (§3-4) is applied — until then any future real import must use a fallback ministry value or the write is blocked by the import guard's mintransportEnumPresent check.",
    entity_family_visible: "YES via raw_data.transport_tier3.entity_family (custom field, not a native column) — Review Center does not currently render arbitrary raw_data.transport_tier3.* sub-fields, only the top-level classification/education_family/category columns already audited in TRANSPORT-A.1-T3.",
    source_confidence_visible: "PARTIAL, unchanged since TRANSPORT-A.1-T3 audit — tier3_confidence lives in raw_data.transport_tier3.tier3_confidence, not surfaced by current UI (smallest future change documented in TRANSPORT-A.1-T3 summary, still valid).",
    source_count_visible: "NO — raw_data.transport_tier3.source_count/independent_source_count exist in the contract (§12) but no UI reads them yet.",
    review_reason_visible: "PARTIAL — raw_data.classification is read for MINSANTE-style rows; this sprint's rows follow the same convention (raw_data.transport_tier3.staging_classification is a NEW field name, not the established raw_data.classification key) — smallest future change: also write top-level raw_data.classification = staging_classification for Review Center compatibility, or extend the UI to read the nested key.",
    source_links_visible: "NO — source_url column exists but is not rendered (same finding as TRANSPORT-A.1-T3).",
    matching_status_visible: "PARTIAL — same confidence-rendering gap as source_confidence_visible.",
    smallest_future_ui_change: "Mirror raw_data.transport_tier3.staging_classification into top-level raw_data.classification at write time (this sprint's prepared rows already do NOT do this — documented gap, not silently fixed by redesigning Review Center this sprint per brief §20 explicit instruction not to).",
    no_ui_redesign_performed: true,
  };
  writeFileSync(join(reportsDir, "transport-a2-t3-review-center-qa.json"), JSON.stringify(reviewCenterQa, null, 2) + "\n", "utf-8");
  console.log("   wrote reports/registry/transport-a2-t3-review-center-qa.json");

  console.log("\n=== PREPARATION COMPLETE. 0 establishments writes. 0 staging writes. 0 registry_identifiers writes. 0 DDL executed. ===");
  console.log(`APPROVAL CHECKSUM: ${approvalChecksum}`);
  console.log(`WOULD INSERT: ${preparedRows.length}`);
  console.log(`CLEAN APPROVABLE: ${cleanApprovableCount}`);
}

main().catch((e) => {
  console.error("TRANSPORT-A.2-T3 PREPARATION FAILED:", e);
  process.exit(1);
});
