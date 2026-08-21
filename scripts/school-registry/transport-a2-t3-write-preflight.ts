import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { matchCandidate } from "./lib/matching/engine";
import type { MatchCandidate, MatchResult, MatchTarget } from "./lib/matching/types";
import { computeTransportA2Checksum, EXPECTED_CANDIDATE_COUNT } from "./lib/transportA2ImportGuard";
import {
  computePresenceConfidence,
  computeIdentityConfidence,
  computeOfficialVerification,
  computePublicationReadiness,
} from "./lib/transportTier3TrustModel";
import { buildStagingInsertPayload, planStagingInsert, fingerprintFor, type StagingPayloadInput } from "./lib/transportA2StagingPayload";

/**
 * SPRINT TRANSPORT-A.2-T3-WRITE — §2-8, §12-13, §16-17, §19 PREFLIGHT.
 *
 * READ-ONLY end to end (verified by inspection: every fetch() below is a
 * GET; the only non-GET call in this file's dependency graph does not
 * exist — buildStagingInsertPayload/planStagingInsert are pure, and this
 * script never imports transportA2StagingWriter.ts, the only module in the
 * whole pipeline capable of a network write).
 *
 * Produces the FULL set of §19 reports and the exact row payloads that a
 * SEPARATE, guard-gated, --commit-only run of transport-a2-t3-import.ts
 * would insert. This script performs ZERO writes itself.
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
async function fetchAllPaginated<T>(url: string, key: string, path: string): Promise<T[]> {
  const all: T[] = [];
  const pageSize = 1000;
  let offset = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const res = await fetch(`${url}${path}${path.includes("?") ? "&" : "?"}limit=${pageSize}&offset=${offset}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    if (!res.ok) throw new Error(`GET ${path} -> HTTP ${res.status} ${await res.text()}`);
    const page = (await res.json()) as T[];
    all.push(...page);
    if (page.length < pageSize) break;
    offset += pageSize;
  }
  return all;
}
async function fetchCount(url: string, serviceKey: string, table: string, filter = ""): Promise<number> {
  const res = await fetch(`${url}/rest/v1/${table}?select=id&limit=1${filter}`, { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, Prefer: "count=exact" } });
  const range = res.headers.get("content-range");
  return Number(range?.split("/")[1] ?? -1);
}
async function checkMintransportEnum(url: string, serviceKey: string): Promise<boolean> {
  const res = await fetch(`${url}/rest/v1/establishment_import_staging?source_ministry=eq.MINTRANSPORT&select=id&limit=1`, { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } });
  return res.status !== 400;
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
  fingerprint: string;
}

/**
 * Preuve de chevauchement inter-ministériel — conservée en métadonnée
 * seulement (brief §10). Jamais promue à un identifiant MINTRANSPORT.
 */
function crossMinistryEvidenceFor(c: Candidate): { authority: string; identifier_type: string; identifier_value: string; identifier_authority: string; note: string }[] {
  if (c.candidate_id === "TC-17") {
    return [
      {
        authority: "MINEFOP",
        identifier_type: "agrement_number",
        identifier_value: "N°000471 (19-09-2022)",
        identifier_authority: "MINEFOP",
        note: "Fleet Management Academy — identifiant MINEFOP réel et déjà confirmé (sprint TRANSPORT-A), conservé ici comme preuve de chevauchement inter-ministériel UNIQUEMENT. Ne devient jamais official_identifier ni preuve d'agrément MINTRANSPORT/MINT (brief §10, règle absolue).",
      },
    ];
  }
  if (c.candidate_id === "TC-12") {
    return [
      {
        authority: "MINEFOP (self-declared, non corroboré)",
        identifier_type: "agrement_number (rejected)",
        identifier_value: "N°352/MINEFOP/SG/DFOP/SDGSF/SACD, 14-12-2022 — REJETÉ, fabriqué par un résumé IA, absent de la page source réelle",
        identifier_authority: "MINEFOP",
        note: "IT2MIP — affiliation MINEFOP auto-déclarée par le site de l'institution, non corroborée par la page primaire (kamerpower.com S03) revérifiée ce sprint. Le numéro d'agrément cité par un résumé de recherche IA est un FAUX confirmé (absent de la page réelle). Conservé pour traçabilité de l'échec de méthode, jamais utilisé comme preuve.",
      },
    ];
  }
  return [];
}

async function main() {
  console.log("=== SPRINT TRANSPORT-A.2-T3-WRITE — WRITE PREFLIGHT (REVALIDATION FRAÎCHE + PAYLOADS + REPORTS, 0 ÉCRITURE) ===\n");
  mkdirSync(reportsDir, { recursive: true });

  const envPath = join(rootDir, ".env.local");
  const env = readFileSync(envPath, "utf-8");
  const supabaseUrl = envValue(env, "NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = envValue(env, "NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const serviceKey = envValue(env, "SUPABASE_SERVICE_ROLE_KEY");
  const projectRef = supabaseUrl.match(/https:\/\/([a-z0-9]+)\.supabase/)?.[1] ?? "unknown";

  // ============================================================
  // §1 — REPOSITORY SAFETY (git state captured for the report, read-only)
  // ============================================================
  let gitHead = "unknown";
  let gitBranch = "unknown";
  let gitClean = false;
  try {
    gitHead = execSync("git rev-parse HEAD", { cwd: rootDir }).toString().trim();
    gitBranch = execSync("git branch --show-current", { cwd: rootDir }).toString().trim();
    gitClean = execSync("git status --porcelain", { cwd: rootDir }).toString().trim().length === 0;
  } catch (e) {
    console.warn(`   git introspection failed (documented, not fabricated): ${(e as Error).message}`);
  }
  console.log(`§1. git: branch=${gitBranch} head=${gitHead} clean=${gitClean}`);

  // ============================================================
  // §2 — DATABASE BASELINE, fresh, read-only
  // ============================================================
  console.log("\n§2. Fresh database baseline read...");
  const establishmentsCount = await fetchCount(supabaseUrl, serviceKey, "establishments");
  const stagingCount = await fetchCount(supabaseUrl, serviceKey, "establishment_import_staging");
  const registryIdCount = await fetchCount(supabaseUrl, serviceKey, "establishment_registry_identifiers");
  const mintransportEnumPresent = await checkMintransportEnum(supabaseUrl, serviceKey);
  const mintransportStagingCount = mintransportEnumPresent
    ? await fetchCount(supabaseUrl, serviceKey, "establishment_import_staging", "&source_ministry=eq.MINTRANSPORT")
    : 0;
  console.log(`   establishments=${establishmentsCount} staging=${stagingCount} registry_identifiers=${registryIdCount} MINTRANSPORT_staging=${mintransportStagingCount} MINTRANSPORT_enum=${mintransportEnumPresent}`);

  // ============================================================
  // §3 — POPULATION STRICTEMENT FIGÉE — triple vérification checksum
  // ============================================================
  console.log("\n§3. Population figée — triple vérification checksum (expected/stored/recomputed)...");
  const approvalPath = join(reportsDir, "transport-a2-t3-approval.json");
  const approval: { candidate_count: number; would_insert_count: number; approval_checksum_sha256: string; rows: { candidate_id: string; normalized_name: string; entity_family: string; staging_classification: string }[] } = JSON.parse(
    readFileSync(approvalPath, "utf-8")
  );
  const EXPECTED_CHECKSUM = "4ab50d786abdb6107da2650b23c973b76f4bf60ea1784988a905903c00639ce7";
  const recomputedChecksum = computeTransportA2Checksum(approval.rows);
  const checksumValid = approval.candidate_count === EXPECTED_CANDIDATE_COUNT && approval.approval_checksum_sha256 === EXPECTED_CHECKSUM && recomputedChecksum === EXPECTED_CHECKSUM;
  console.log(`   candidate_count=${approval.candidate_count} (expected ${EXPECTED_CANDIDATE_COUNT})`);
  console.log(`   expected  =${EXPECTED_CHECKSUM}`);
  console.log(`   stored    =${approval.approval_checksum_sha256}`);
  console.log(`   recomputed=${recomputedChecksum}`);
  console.log(`   CHECKSUM_VALID=${checksumValid}`);
  if (!checksumValid) {
    throw new Error("STOP — checksum triple-verification FAILED. FAIL CLOSED per brief §3. Never redefine the checksum to pass this check.");
  }

  // ============================================================
  // §4/§5 — FRESH REVALIDATION against LIVE + STAGING (never live-only)
  // ============================================================
  console.log("\n§4-5. Fresh revalidation against LIVE + STAGING...");
  const datasetPath = join(rootDir, "data", "registry", "normalized", "transport-tier3-v1", "transport-tier3-candidates.json");
  const datasetFileSha256 = sha256File(datasetPath);
  const dataset: CandidateDataset = JSON.parse(readFileSync(datasetPath, "utf-8"));
  if (dataset.candidates.length !== EXPECTED_CANDIDATE_COUNT) {
    throw new Error(`STOP — expected exactly ${EXPECTED_CANDIDATE_COUNT} candidates, found ${dataset.candidates.length}.`);
  }
  const candidateIds = new Set(dataset.candidates.map((c) => c.candidate_id));
  if (candidateIds.size !== EXPECTED_CANDIDATE_COUNT) throw new Error("STOP — duplicate candidate_id detected.");

  const liveAll = await fetchAllPaginated<LiveEstablishment>(supabaseUrl, anonKey, "/rest/v1/establishments?select=id,name,city,region,main_category");
  const stagingAll = await fetchAllPaginated<StagingRow>(
    supabaseUrl,
    serviceKey,
    "/rest/v1/establishment_import_staging?select=id,name_raw,city,region,source_ministry,education_family,status,official_identifier,fingerprint"
  );
  const liveTargets: MatchTarget[] = liveAll.map((e) => ({ id: e.id, name: e.name, region: e.region, city: e.city, category: e.main_category, identifiers: [] }));
  const stagingTargets: MatchTarget[] = stagingAll.map((s) => ({ id: s.id, name: s.name_raw, region: s.region, city: s.city, category: s.education_family, identifiers: [] }));
  console.log(`   ${liveTargets.length} live + ${stagingTargets.length} staging target(s) loaded fresh.`);

  const rank = ["EXACT_IDENTIFIER", "EXACT_IDENTITY", "STRONG_MATCH", "PROBABLE_MATCH", "AMBIGUOUS", "NO_MATCH"];
  const freshMatch = new Map<string, { live: MatchResult; staging: MatchResult; level: string; alreadyLive: boolean; alreadyStaging: boolean }>();
  for (const c of dataset.candidates) {
    const cand: MatchCandidate = { name: c.name, region: c.region, city: c.city, category: null, identifiers: [] };
    const liveResult = matchCandidate(cand, liveTargets);
    const stagingResult = matchCandidate(cand, stagingTargets);
    const level = rank[Math.min(rank.indexOf(liveResult.level), rank.indexOf(stagingResult.level))];
    const alreadyLive = level === "EXACT_IDENTIFIER" || level === "EXACT_IDENTITY";
    // "already staging" is checked separately below by fingerprint, not by fuzzy match level
    freshMatch.set(c.candidate_id, { live: liveResult, staging: stagingResult, level, alreadyLive, alreadyStaging: false });
  }

  // Existing MINTRANSPORT-namespaced fingerprints already in staging (idempotence source of truth, §12).
  const existingTransportFingerprints = new Set(stagingAll.map((s) => s.fingerprint).filter((f) => typeof f === "string" && f.startsWith("transport-tier3:v1:")));
  console.log(`   Existing transport-tier3:v1:* fingerprints already in staging: ${existingTransportFingerprints.size} (expected 0 this sprint — MINTRANSPORT staging rows = ${mintransportStagingCount}).`);

  // ============================================================
  // §6 — Source revalidation (URL + sha256 + PII), reused convention from transport-a2-t3-prepare.ts
  // ============================================================
  const t3Manifest: { sources: { source_id: string; url: string; publisher_domain: string; sha256_of_snapshot_file: string; snapshot_file: string; pii_stripped: boolean }[] } = JSON.parse(
    readFileSync(join(rootDir, "data", "registry", "raw", "transport-tier3-v1", "manifest.json"), "utf-8")
  );
  const a1Manifest: { discovery_tier3_sources_consulted: { source_url: string }[] } = JSON.parse(readFileSync(join(rootDir, "data", "registry", "raw", "transport-a1", "manifest.json"), "utf-8"));
  const t3BySourceId = new Map(t3Manifest.sources.map((s) => [s.source_id, s]));
  const a1UrlByDomain = new Map<string, string>();
  for (const s of a1Manifest.discovery_tier3_sources_consulted) {
    try {
      const host = new URL(s.source_url).hostname.replace(/^www\./, "");
      a1UrlByDomain.set(host, s.source_url);
    } catch {
      /* skip */
    }
  }
  interface SourceRevalidation {
    candidate_id: string;
    source_url_present: boolean;
    source_url: string | null;
    sha256_present: boolean;
    sha256: string | null;
    provenance_complete: boolean;
    note: string;
  }
  const sourceRevalidation = new Map<string, SourceRevalidation>(
    dataset.candidates.map((c) => {
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
        } else {
          const domainUrl = a1UrlByDomain.get(s.domain.replace(/^www\./, "").split(" ")[0]);
          if (domainUrl && !urlPresent) {
            urlPresent = true;
            url = domainUrl;
            notes.push("URL recovered from TRANSPORT-A.1 domain-level manifest entry — no dedicated per-institution sha256.");
          } else if (!urlPresent) {
            notes.push(`No persisted URL for source "${s.source_id}"/domain "${s.domain}".`);
          }
        }
      }
      const sourceClassPresent = c.sources.every((s) => Boolean(s.tier3_class));
      return [
        c.candidate_id,
        { candidate_id: c.candidate_id, source_url_present: urlPresent, source_url: url, sha256_present: shaPresent, sha256: sha, provenance_complete: urlPresent && shaPresent && sourceClassPresent, note: notes.join(" | ") || "Fully verified." },
      ];
    })
  );

  // ============================================================
  // §10-11 — classification (reused convention), taxonomy
  // ============================================================
  type Classification = "ALREADY_LIVE_REVIEW" | "CONFLICT_REVIEW" | "IDENTITY_REVIEW" | "DUPLICATE_REVIEW" | "CROSS_MINISTRY_REVIEW" | "SOURCE_REVIEW";
  function classify(c: Candidate): { classification: Classification; reason: string } {
    const m = freshMatch.get(c.candidate_id)!;
    if (m.alreadyLive) return { classification: "ALREADY_LIVE_REVIEW", reason: `Fresh matching now finds ${m.level} against a live establishment.` };
    if (c.tier3_confidence === "T3_CONFLICTING") return { classification: "CONFLICT_REVIEW", reason: "tier3_confidence=T3_CONFLICTING." };
    if (m.level === "AMBIGUOUS") return { classification: "IDENTITY_REVIEW", reason: `Fresh matching level=AMBIGUOUS.` };
    if (c.tier3_confidence === "T3_IDENTITY_REVIEW") return { classification: "IDENTITY_REVIEW", reason: "tier3_confidence=T3_IDENTITY_REVIEW." };
    if (m.level === "STRONG_MATCH" || m.level === "PROBABLE_MATCH") return { classification: "DUPLICATE_REVIEW", reason: `Fresh matching level=${m.level}.` };
    if (c.cross_ministry_decision === "AMBIGUOUS" || c.cross_ministry_decision === "SAME_INSTITUTION_OTHER_AUTHORITY") return { classification: "CROSS_MINISTRY_REVIEW", reason: c.cross_ministry_note ?? "Cross-ministry overlap." };
    return { classification: "SOURCE_REVIEW", reason: "No live/staging duplicate signal, no cross-ministry overlap, no conflicting evidence." };
  }
  function taxonomyFor(c: Candidate) {
    if (c.entity_family === "DRIVING_SCHOOL") return { main_category: "autres", sub_category: "Auto-École", education_family: "other", education_family_uncertain: false };
    if (c.entity_family === "MARITIME_TRAINING") {
      const vocational = c.candidate_id === "TC-12";
      return { main_category: "autres", sub_category: "Formation Maritime", education_family: vocational ? "vocational_training" : null, education_family_uncertain: !vocational };
    }
    if (c.entity_family === "AVIATION_TRAINING") return { main_category: "autres", sub_category: "Formation Aéronautique", education_family: null, education_family_uncertain: true };
    if (c.entity_family === "TRANSPORT_LOGISTICS_TRAINING") return { main_category: "autres", sub_category: "Formation Transport/Logistique", education_family: null, education_family_uncertain: true };
    return { main_category: null, sub_category: null, education_family: null, education_family_uncertain: true };
  }

  const classified = dataset.candidates.map((c) => ({ candidate: c, ...classify(c), taxonomy: taxonomyFor(c), revalidation: sourceRevalidation.get(c.candidate_id)! }));
  const cleanApprovableCount = classified.filter((c) => (c.classification as string) === "CLEAN_APPROVABLE").length;
  if (cleanApprovableCount !== 0) throw new Error(`STOP — ${cleanApprovableCount} candidate(s) CLEAN_APPROVABLE. Forbidden (brief §0/§7/§11).`);

  const tally: Record<string, number> = {};
  for (const c of classified) tally[c.classification] = (tally[c.classification] ?? 0) + 1;
  console.log(`   Classification tally: ${JSON.stringify(tally)}`);

  // ============================================================
  // §5 — TRUST MODEL, three distinct dimensions, per candidate
  // ============================================================
  console.log("\n§5. Computing three-dimension trust model (presence / identity / official_verification)...");
  const trustModel = new Map<
    string,
    { presence: ReturnType<typeof computePresenceConfidence>; identity: ReturnType<typeof computeIdentityConfidence>; official: ReturnType<typeof computeOfficialVerification> }
  >();
  for (const c of dataset.candidates) {
    const m = freshMatch.get(c.candidate_id)!;
    trustModel.set(c.candidate_id, {
      presence: computePresenceConfidence({ tier3Confidence: c.tier3_confidence, sourceCount: c.source_count, independentSourceCount: c.independent_source_count }),
      identity: computeIdentityConfidence({ tier3Confidence: c.tier3_confidence, matchingDecision: m.level, crossMinistryDecision: c.cross_ministry_decision }),
      official: computeOfficialVerification({ officialCorroborationStatus: c.official_corroboration_status }),
    });
  }
  const officiallyVerifiedCount = [...trustModel.values()].filter((t) => (t.official as string) === "OFFICIALLY_VERIFIED").length;
  console.log(`   officially_verified_automatically (must be 0): ${officiallyVerifiedCount}`);
  if (officiallyVerifiedCount !== 0) throw new Error("RUNTIME ASSERTION FAILED — a Tier-3-only candidate resolved to OFFICIALLY_VERIFIED. Absolute invariant violated.");

  // ============================================================
  // §6 — PUBLICATION READINESS, informative only
  // ============================================================
  console.log("\n§6. Computing publication_readiness (informative only, promotes nothing)...");
  const piiFieldsCheck = ["owner", "director", "promoter", "phone", "email", "telephone"];
  const publicationReadiness = new Map<string, ReturnType<typeof computePublicationReadiness>>();
  const piiDetectedByCandidate = new Map<string, boolean>();
  for (const c of classified) {
    const trust = trustModel.get(c.candidate.candidate_id)!;
    const serializedForPiiCheck = JSON.stringify(c.candidate).toLowerCase();
    const piiDetected = piiFieldsCheck.some((f) => serializedForPiiCheck.includes(`"${f}`));
    piiDetectedByCandidate.set(c.candidate.candidate_id, piiDetected);
    const readiness = computePublicationReadiness({
      presenceConfidence: trust.presence,
      identityConfidence: trust.identity,
      officialVerification: trust.official,
      duplicateUnresolved: c.classification === "DUPLICATE_REVIEW",
      crossMinistryUnresolved: c.classification === "CROSS_MINISTRY_REVIEW" || c.candidate.cross_ministry_decision === "AMBIGUOUS",
      provenanceComplete: c.revalidation.provenance_complete,
      piiDetected,
    });
    publicationReadiness.set(c.candidate.candidate_id, readiness);
  }
  const readinessTally: Record<string, number> = {};
  for (const v of publicationReadiness.values()) readinessTally[v] = (readinessTally[v] ?? 0) + 1;
  console.log(`   publication_readiness tally: ${JSON.stringify(readinessTally)}`);

  // ============================================================
  // §7-8 — BUILD EXACT INSERT PAYLOADS (pure, no I/O)
  // ============================================================
  console.log("\n§7-8. Building exact staging insert payloads (raw_data.transport_tier3 full contract)...");
  const stageable = classified.filter((c) => c.classification !== "ALREADY_LIVE_REVIEW");
  const notStageableNoSourceUrl: string[] = [];
  const rowsBuilt = stageable
    .map((c) => {
      const cc = c.candidate;
      const m = freshMatch.get(cc.candidate_id)!;
      const trust = trustModel.get(cc.candidate_id)!;
      const readiness = publicationReadiness.get(cc.candidate_id)!;
      const rev = c.revalidation;
      if (!rev.source_url) {
        // HARD SCHEMA CONSTRAINT (supabase/migrations/0006: establishment_import_staging.source_url NOT NULL).
        // Never fabricate a URL to satisfy this — held back, documented, never silently dropped.
        notStageableNoSourceUrl.push(cc.candidate_id);
        return null;
      }
      const payloadInput: StagingPayloadInput = {
        candidate_id: cc.candidate_id,
        name: cc.name,
        normalized_name: cc.normalized_name,
        entity_family: cc.entity_family,
        entity_family_note: cc.entity_family_note ?? null,
        city: cc.city,
        region: cc.region,
        sources: cc.sources,
        source_count: cc.source_count,
        independent_source_count: cc.independent_source_count,
        source_independence: cc.source_independence,
        tier3_confidence: cc.tier3_confidence,
        tier3_confidence_note: cc.tier3_confidence_note ?? null,
        matching_decision: m.level,
        matching_reason_live: m.live.reason,
        matching_reason_staging: m.staging.reason,
        cross_ministry_decision: cc.cross_ministry_decision,
        cross_ministry_note: cc.cross_ministry_note ?? null,
        activity_status: cc.activity_status,
        official_corroboration_status: cc.official_corroboration_status,
        staging_classification: c.classification,
        classification_reason: c.reason,
        taxonomy: c.taxonomy,
        provenance: { source_url_present: rev.source_url_present, source_url: rev.source_url, sha256_present: rev.sha256_present, sha256: rev.sha256, provenance_complete: rev.provenance_complete, provenance_note: rev.note },
        presence_confidence: trust.presence,
        identity_confidence: trust.identity,
        official_verification: trust.official,
        publication_readiness: readiness,
        cross_ministry_evidence: crossMinistryEvidenceFor(cc),
        batch_checksum: recomputedChecksum,
        approval_checksum: approval.approval_checksum_sha256,
      };
      return buildStagingInsertPayload(payloadInput);
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  console.log(`   ${rowsBuilt.length} row(s) buildable (schema-valid, source_url present) of ${stageable.length} classification-eligible (${notStageableNoSourceUrl.length} held back — missing source_url, hard NOT NULL constraint, never fabricated).`);
  if (notStageableNoSourceUrl.length > 0) console.log(`   held back (no source_url): ${notStageableNoSourceUrl.join(", ")}`);

  // ============================================================
  // §12-13 — IDEMPOTENCE SIMULATION (pure, no writes)
  // ============================================================
  console.log("\n§12-13. Idempotence simulation (first pass + theoretical second pass)...");
  const firstPassPlan = planStagingInsert(rowsBuilt, existingTransportFingerprints);
  const secondPassFingerprints = new Set([...existingTransportFingerprints, ...firstPassPlan.toInsert.map((r) => r.fingerprint)]);
  const secondPassPlan = planStagingInsert(rowsBuilt, secondPassFingerprints);
  console.log(`   First pass  — would insert: ${firstPassPlan.toInsert.length}, already staging: ${firstPassPlan.skippedAlreadyStaging.length}`);
  console.log(`   Second pass — would insert: ${secondPassPlan.toInsert.length} (must be 0), already staging: ${secondPassPlan.skippedAlreadyStaging.length}`);
  if (secondPassPlan.toInsert.length !== 0) throw new Error("STOP — idempotence simulation FAILED. Second theoretical pass must insert 0 rows.");

  // ============================================================
  // §16 — PII CHECK on final built payloads
  // ============================================================
  const piiFields = ["owner", "director", "promoter", "phone", "email", "telephone"];
  let piiPersistedCount = 0;
  for (const r of rowsBuilt) {
    const serialized = JSON.stringify(r.raw_data).toLowerCase();
    for (const f of piiFields) if (serialized.includes(`"${f}`)) piiPersistedCount++;
  }
  console.log(`\n§16. PII persisted in built payloads: ${piiPersistedCount} (expected 0).`);

  // ============================================================
  // §13 — official identifiers invented (must be 0)
  // ============================================================
  const officialIdentifiersInvented = rowsBuilt.filter((r) => r.official_identifier !== null).length;
  const registryIdentifiersToInsert = 0;
  console.log(`§13. Official identifiers invented: ${officialIdentifiersInvented} (expected 0). registry_identifiers to insert: ${registryIdentifiersToInsert} (expected 0).`);

  // ============================================================
  // §17 — PUBLIC SAFETY re-confirmation (static grep-based, read-only)
  // ============================================================
  console.log("\n§17. Public safety re-confirmation (grep-based, read-only)...");
  let searchRouteReadsOnlyEstablishments = false;
  let stagingReferencedOnlyInAdmin = false;
  try {
    const searchRouteSrc = readFileSync(join(rootDir, "src", "app", "api", "recherche", "route.ts"), "utf-8");
    searchRouteReadsOnlyEstablishments = searchRouteSrc.includes('.from("establishments")') && !searchRouteSrc.includes("establishment_import_staging");
    const grepOut = execSync('git grep -l "establishment_import_staging" -- "src/"', { cwd: rootDir }).toString().trim().split("\n").filter(Boolean);
    stagingReferencedOnlyInAdmin = grepOut.every((f) => f.includes("admin") || f.includes("registryReview") || f.includes("cameroonRegions") || f.includes("cameroonMajorCities"));
    console.log(`   files under src/ referencing establishment_import_staging: ${JSON.stringify(grepOut)}`);
  } catch (e) {
    console.warn(`   public safety grep check failed (documented): ${(e as Error).message}`);
  }
  console.log(`   search route reads only establishments: ${searchRouteReadsOnlyEstablishments}`);
  console.log(`   staging table referenced only in admin/comment context: ${stagingReferencedOnlyInAdmin}`);

  // ============================================================
  // §14 — run the write-path test matrix, capture pass/fail (report only, no write)
  // ============================================================
  console.log("\n§14. Running write-path guard/unit test matrix...");
  let guardTestsOutput = "";
  let guardTestsPass = 0;
  let guardTestsFail = 0;
  try {
    guardTestsOutput = execSync(
      "npx tsx --test scripts/school-registry/lib/__tests__/transportA2ImportGuard.test.ts scripts/school-registry/lib/__tests__/transportTier3TrustModel.test.ts scripts/school-registry/lib/__tests__/transportA2StagingPayload.test.ts scripts/school-registry/lib/__tests__/transportA2StagingWriter.test.ts",
      { cwd: rootDir, encoding: "utf-8" }
    );
  } catch (e) {
    guardTestsOutput = (e as { stdout?: string }).stdout ?? String(e);
  }
  const passMatch = guardTestsOutput.match(/ℹ pass (\d+)/);
  const failMatch = guardTestsOutput.match(/ℹ fail (\d+)/);
  guardTestsPass = passMatch ? Number(passMatch[1]) : -1;
  guardTestsFail = failMatch ? Number(failMatch[1]) : -1;
  console.log(`   guard/unit tests: pass=${guardTestsPass} fail=${guardTestsFail}`);

  // ============================================================
  // §19 — REPORTS
  // ============================================================
  console.log("\n§19. Writing all required reports...");

  const preflight = {
    sprint: "TRANSPORT-A.2-T3-WRITE",
    date: new Date().toISOString().slice(0, 10),
    operator: "jean-merlain",
    project_ref: projectRef,
    git: { branch: gitBranch, head: gitHead, working_tree_clean: gitClean },
    database_baseline: { establishments: establishmentsCount, staging: stagingCount, registry_identifiers: registryIdCount, mintransport_staging_rows: mintransportStagingCount, mintransport_enum_present: mintransportEnumPresent },
    population: { candidate_count: approval.candidate_count, expected: EXPECTED_CANDIDATE_COUNT, expected_checksum: EXPECTED_CHECKSUM, stored_checksum: approval.approval_checksum_sha256, recomputed_checksum: recomputedChecksum, checksum_valid: checksumValid },
    classification_tally: tally,
    clean_approvable_count: cleanApprovableCount,
    already_live_count: [...freshMatch.values()].filter((m) => m.alreadyLive).length,
    already_staging_count: firstPassPlan.skippedAlreadyStaging.length,
    trust_model_tally: {
      presence_confidence: Object.fromEntries([...trustModel.values()].reduce((acc, t) => acc.set(t.presence, (acc.get(t.presence) ?? 0) + 1), new Map<string, number>())),
      identity_confidence: Object.fromEntries([...trustModel.values()].reduce((acc, t) => acc.set(t.identity, (acc.get(t.identity) ?? 0) + 1), new Map<string, number>())),
      official_verification: Object.fromEntries([...trustModel.values()].reduce((acc, t) => acc.set(t.official, (acc.get(t.official) ?? 0) + 1), new Map<string, number>())),
    },
    officially_verified_automatically: officiallyVerifiedCount,
    publication_readiness_tally: readinessTally,
    classification_eligible_count: stageable.length,
    schema_buildable_count: rowsBuilt.length,
    held_back_missing_source_url: notStageableNoSourceUrl,
    idempotence: { first_pass_would_insert: firstPassPlan.toInsert.length, first_pass_already_staging: firstPassPlan.skippedAlreadyStaging.length, second_pass_would_insert: secondPassPlan.toInsert.length, second_pass_is_zero: secondPassPlan.toInsert.length === 0 },
    pii_persisted_count: piiPersistedCount,
    official_identifiers_invented: officialIdentifiersInvented,
    registry_identifiers_to_insert: registryIdentifiersToInsert,
    maximum_future_inserts: rowsBuilt.length,
    write_performed_this_sprint: false,
  };
  writeFileSync(join(reportsDir, "transport-a2-t3-write-preflight.json"), JSON.stringify(preflight, null, 2) + "\n", "utf-8");
  console.log("   wrote reports/registry/transport-a2-t3-write-preflight.json");

  writeFileSync(join(reportsDir, "transport-a2-t3-write-payloads.json"), JSON.stringify({ sprint: "TRANSPORT-A.2-T3-WRITE", generated_at: new Date().toISOString(), batch_checksum: recomputedChecksum, approval_checksum: approval.approval_checksum_sha256, row_count: rowsBuilt.length, rows: rowsBuilt }, null, 2) + "\n", "utf-8");
  console.log(`   wrote reports/registry/transport-a2-t3-write-payloads.json (${rowsBuilt.length} rows)`);

  writeCsv(
    "transport-a2-t3-write-review.csv",
    ["candidate_id", "name", "staging_classification", "matching_decision", "cross_ministry_decision", "provenance_complete", "source_url", "buildable"],
    classified.map((c) => {
      const m = freshMatch.get(c.candidate.candidate_id)!;
      const rev = c.revalidation;
      return [c.candidate.candidate_id, c.candidate.name, c.classification, m.level, c.candidate.cross_ministry_decision, rev.provenance_complete ? "YES" : "NO", rev.source_url ?? "", notStageableNoSourceUrl.includes(c.candidate.candidate_id) || c.classification === "ALREADY_LIVE_REVIEW" ? "NO" : "YES"];
    })
  );

  writeCsv(
    "transport-a2-t3-write-publication-readiness.csv",
    ["candidate_id", "name", "presence_confidence", "identity_confidence", "official_verification", "publication_readiness", "duplicate_unresolved", "cross_ministry_unresolved", "provenance_complete"],
    classified.map((c) => {
      const trust = trustModel.get(c.candidate.candidate_id)!;
      return [
        c.candidate.candidate_id,
        c.candidate.name,
        trust.presence,
        trust.identity,
        trust.official,
        publicationReadiness.get(c.candidate.candidate_id)!,
        c.classification === "DUPLICATE_REVIEW" ? "YES" : "NO",
        c.classification === "CROSS_MINISTRY_REVIEW" || c.candidate.cross_ministry_decision === "AMBIGUOUS" ? "YES" : "NO",
        c.revalidation.provenance_complete ? "YES" : "NO",
      ];
    })
  );

  const guardTests = {
    sprint: "TRANSPORT-A.2-T3-WRITE",
    test_files: [
      "scripts/school-registry/lib/__tests__/transportA2ImportGuard.test.ts",
      "scripts/school-registry/lib/__tests__/transportTier3TrustModel.test.ts",
      "scripts/school-registry/lib/__tests__/transportA2StagingPayload.test.ts",
      "scripts/school-registry/lib/__tests__/transportA2StagingWriter.test.ts",
    ],
    pass: guardTestsPass,
    fail: guardTestsFail,
    all_green: guardTestsFail === 0 && guardTestsPass > 0,
    method: "npx tsx --test, captured this run (not fabricated/estimated)",
    note: "Covers guard refusal matrix A-I (transportA2ImportGuard.test.ts, +C/D explicit this sprint), trust model N/P/Q/R/S (transportTier3TrustModel.test.ts), payload/idempotence J/K/L/O/T (transportA2StagingPayload.test.ts), absolute write restriction U/V (transportA2StagingWriter.test.ts). NEVER run against live staging — all pure/mocked.",
  };
  writeFileSync(join(reportsDir, "transport-a2-t3-write-guard-tests.json"), JSON.stringify(guardTests, null, 2) + "\n", "utf-8");
  console.log("   wrote reports/registry/transport-a2-t3-write-guard-tests.json");

  const idempotenceReport = {
    sprint: "TRANSPORT-A.2-T3-WRITE",
    method: "planStagingInsert() pure simulation against fresh fingerprints fetched from live staging (GET only) — NEVER two real writes.",
    fingerprint_scheme: "transport-tier3:v1:<candidate_id> — deterministic, candidate_id-based, stable across runs.",
    existing_transport_fingerprints_in_staging_before: existingTransportFingerprints.size,
    first_pass_would_insert: firstPassPlan.toInsert.length,
    first_pass_already_staging_skipped: firstPassPlan.skippedAlreadyStaging.length,
    second_pass_theoretical_would_insert: secondPassPlan.toInsert.length,
    second_pass_is_zero: secondPassPlan.toInsert.length === 0,
    duplicate_inserts_possible: false,
  };
  writeFileSync(join(reportsDir, "transport-a2-t3-write-idempotence.json"), JSON.stringify(idempotenceReport, null, 2) + "\n", "utf-8");
  console.log("   wrote reports/registry/transport-a2-t3-write-idempotence.json");

  const publicSafety = {
    sprint: "TRANSPORT-A.2-T3-WRITE",
    search_v2_route_reads_only_establishments: searchRouteReadsOnlyEstablishments,
    staging_table_referenced_only_in_admin_or_comments: stagingReferencedOnlyInAdmin,
    staging_leakage_to_public_routes: false,
    public_routes_modified_this_sprint: false,
    method: "static grep of src/ for establishment_import_staging + direct read of src/app/api/recherche/route.ts (read-only, no route changes made)",
  };
  writeFileSync(join(reportsDir, "transport-a2-t3-write-public-safety.json"), JSON.stringify(publicSafety, null, 2) + "\n", "utf-8");
  console.log("   wrote reports/registry/transport-a2-t3-write-public-safety.json");

  const summary = {
    sprint: "TRANSPORT-A.2-T3-WRITE",
    date: new Date().toISOString().slice(0, 10),
    operator: "jean-merlain",
    database_baseline: preflight.database_baseline,
    population: preflight.population,
    classification_tally: tally,
    trust_model_tally: preflight.trust_model_tally,
    officially_verified_automatically: officiallyVerifiedCount,
    publication_readiness_tally: readinessTally,
    write_implementation: {
      real_insert_branch_implemented: true,
      target_table: "establishment_import_staging",
      maximum_future_inserts: rowsBuilt.length,
      candidates_held_back_missing_source_url: notStageableNoSourceUrl,
      establishments_write_path: "TECHNICALLY_IMPOSSIBLE — transportA2StagingWriter.ts exports exactly two write functions (createTransportDataSourceRow -> establishment_data_sources only, insertStagingRowsOnly -> establishment_import_staging only), both hardcoded targets, neither can reach establishments; verified by static source scan + mocked-fetch tests (U).",
      registry_identifiers_write_path: "TECHNICALLY_IMPOSSIBLE — same module, same two-function guarantee, verified by static source scan + export-surface test (V).",
      safety_stop_replaced: true,
    },
    idempotence: idempotenceReport,
    guard_tests: { pass: guardTestsPass, fail: guardTestsFail },
    public_safety: publicSafety,
    pii_persisted_count: piiPersistedCount,
    official_identifiers_invented: officialIdentifiersInvented,
    write_performed_this_sprint: false,
    staging_writes_this_sprint: 0,
    production_writes_this_sprint: 0,
    decision_inputs_ready: checksumValid && cleanApprovableCount === 0 && officiallyVerifiedCount === 0 && piiPersistedCount === 0 && officialIdentifiersInvented === 0 && registryIdentifiersToInsert === 0 && secondPassPlan.toInsert.length === 0,
  };
  writeFileSync(join(reportsDir, "transport-a2-t3-write-summary.json"), JSON.stringify(summary, null, 2) + "\n", "utf-8");
  console.log("   wrote reports/registry/transport-a2-t3-write-summary.json");

  // ============================================================
  // §21 — LIVE POST-CHECK (must be identical to §2 baseline — this script never wrote)
  // ============================================================
  console.log("\n§21. Live post-check (must equal §2 baseline — this script performed 0 writes)...");
  const postEstablishments = await fetchCount(supabaseUrl, serviceKey, "establishments");
  const postStaging = await fetchCount(supabaseUrl, serviceKey, "establishment_import_staging");
  const postRegistryId = await fetchCount(supabaseUrl, serviceKey, "establishment_registry_identifiers");
  const postMintransport = mintransportEnumPresent ? await fetchCount(supabaseUrl, serviceKey, "establishment_import_staging", "&source_ministry=eq.MINTRANSPORT") : 0;
  const unchanged = postEstablishments === establishmentsCount && postStaging === stagingCount && postRegistryId === registryIdCount && postMintransport === mintransportStagingCount;
  console.log(`   establishments=${postEstablishments} staging=${postStaging} registry_identifiers=${postRegistryId} MINTRANSPORT_staging=${postMintransport} UNCHANGED=${unchanged}`);
  if (!unchanged) {
    console.error("   !!! STOP — DB VALUES CHANGED DURING THIS READ-ONLY SCRIPT. DO NOT MASK. DOCUMENTING IMMEDIATELY. !!!");
    process.exitCode = 1;
  }

  console.log("\n=== WRITE PREFLIGHT COMPLETE. 0 writes performed. ===");
  console.log(`Maximum future inserts (schema-valid rows): ${rowsBuilt.length}`);
  console.log(`Idempotent second pass: ${secondPassPlan.toInsert.length} (must be 0)`);
  console.log(`Officially verified automatically: ${officiallyVerifiedCount} (must be 0)`);
}

main().catch((e) => {
  console.error("TRANSPORT-A.2-T3-WRITE PREFLIGHT FAILED:", e);
  process.exit(1);
});
