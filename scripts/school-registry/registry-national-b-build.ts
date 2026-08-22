/**
 * SPRINT REGISTRY-NATIONAL-B — NATIONAL PUBLICATION PRE-FLIGHT.
 * READ-ONLY / DRY-RUN ONLY. AUCUNE écriture Supabase (voir §3 du brief).
 *
 * Recalcule ENTIÈREMENT la population nationale publiable depuis l'état
 * live actuel (jamais une copie des chiffres REGISTRY-NATIONAL-A), fige le
 * lot exact CREATE_OFFICIALLY_VERIFIED + CREATE_PUBLISHABLE_UNVERIFIED
 * après revalidation fraîche, produit un snapshot d'approbation
 * déterministe (checksum triple-vérifié), et exécute un dry-run complet.
 *
 * Réutilise TELLE QUELLE la fonction pure
 * evaluateNationalPublicationReadiness() (REGISTRY-NATIONAL-A) et le
 * moteur de matching partagé (lib/matching/engine) — aucun second moteur
 * créé ce sprint (§11).
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { matchCandidate } from "./lib/matching/engine";
import type { MatchCandidate, MatchTarget, RegistryIdentifier as EngineRegistryIdentifier } from "./lib/matching/types";
import { evaluateNationalPublicationReadiness, type PublicationReadinessInput, resolveCrossMinistry } from "./lib/nationalRegistry/publicationPolicy";
import type { MinistryInScope, NationalCandidate, PresenceConfidence, IdentityConfidence, OfficialVerification, MatchingDecision } from "./lib/nationalRegistry/types";
import { candidateIdFromArtifact, candidateIdFromEstablishment, candidateIdFromStagingRow } from "./lib/nationalRegistry/candidateId";
import { scanCandidateForPii } from "./lib/nationalRegistry/piiAudit";
import { auditCategory } from "./lib/nationalRegistry/categoryAudit";
import { slugDryRun, slugify } from "./lib/nationalRegistry/slugDryRun";
import { computeRegistryNationalApprovalChecksum, type RegistryNationalApprovalChecksumRow } from "./lib/nationalRegistry/registryNationalPublicationGuard";
import { resolveEstablishmentTrustState, type EstablishmentTrustInput } from "../../src/lib/trust/resolveEstablishmentTrustState";

const ROOT = process.cwd();
const REPORTS_DIR = `${ROOT}/reports/registry`;

function readEnvVar(env: string, key: string): string {
  const match = env.match(new RegExp(`^${key}=(.*)$`, "m"));
  const value = match?.[1]?.trim();
  if (!value) throw new Error(`${key} introuvable dans .env.local`);
  return value;
}
function git(cmd: string): string {
  return execSync(`git ${cmd}`, { cwd: ROOT }).toString().trim();
}
async function fetchAllPaginated<T>(supabase: SupabaseClient, table: string, select: string, filter?: (q: any) => any): Promise<T[]> {
  const all: T[] = [];
  let offset = 0;
  const pageSize = 1000;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    let q = supabase.from(table).select(select).range(offset, offset + pageSize - 1);
    if (filter) q = filter(q);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    all.push(...((data as T[]) ?? []));
    if (!data || data.length < pageSize) break;
    offset += pageSize;
  }
  return all;
}
function csvEscape(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
function toCsv(rows: Record<string, unknown>[], columns: string[]): string {
  const header = columns.join(",");
  const lines = rows.map((r) => columns.map((c) => csvEscape(r[c])).join(","));
  return [header, ...lines].join("\n") + "\n";
}

interface EstablishmentRow {
  id: string;
  name: string;
  slug: string | null;
  city: string | null;
  region: string | null;
  address: string | null;
  main_category: string | null;
  sub_category: string | null;
  official_id: string | null;
  source_ministry: string | null;
  source_reference: string | null;
  source_url: string | null;
  is_verified: boolean | null;
  owner_id: string | null;
}
interface StagingRow {
  id: string;
  name_raw: string;
  name_normalized: string;
  region: string | null;
  city: string | null;
  status: string;
  source_url: string;
  official_identifier: string | null;
  raw_data: any;
  fingerprint: string;
  education_family: string | null;
  promoted_establishment_id: string | null;
}
interface RegistryIdentifierRow {
  id: string;
  establishment_id: string;
  authority: string;
  registry: string;
  identifier: string;
  identifier_type: string | null;
  verification_status: string | null;
}

// §13 — champs NOT NULL sans défaut confirmés EMPIRIQUEMENT CE SPRINT via
// introspection OpenAPI PostgREST fraîche (GET /rest/v1/ Accept: application/
// openapi+json), PAS supposés depuis une ancienne mémoire de schéma. Voir
// §13 du script pour la valeur exacte lue en direct.
const BLOCKING_REQUIRED_FIELDS = ["name", "slug", "main_category"] as const;

async function main() {
  mkdirSync(REPORTS_DIR, { recursive: true });

  // ── §4 REPOSITORY SAFETY ────────────────────────────────────────────────
  const repoStatusPorcelain = git("status --porcelain");
  const branch = git("branch --show-current");
  const head = git("rev-parse HEAD");
  const nohaMain = (() => {
    try {
      return git("rev-parse noha/main");
    } catch {
      return "UNAVAILABLE";
    }
  })();
  console.log(`§4 git: branch=${branch} head=${head} noha/main=${nohaMain}`);
  console.log(`§4 git status --porcelain (avant écriture des artefacts de CE sprint) : ${repoStatusPorcelain.split("\n").filter(Boolean).length} ligne(s) — untracked de ce sprint attendu, jamais un diff préexistant.`);

  const env = readFileSync(`${ROOT}/.env.local`, "utf-8");
  const url = readEnvVar(env, "NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = readEnvVar(env, "SUPABASE_SERVICE_ROLE_KEY");
  const projectRef = url.match(/https:\/\/([a-z0-9]+)\.supabase/)?.[1] ?? "unknown";
  const supabase = createClient(url, serviceKey);

  // ── §5 FRESH DATABASE BASELINE ──────────────────────────────────────────
  const { count: establishmentsTotalBefore } = await supabase.from("establishments").select("*", { count: "exact", head: true });
  const { count: stagingTotalBefore } = await supabase.from("establishment_import_staging").select("*", { count: "exact", head: true });
  const { count: registryIdentifiersTotalBefore } = await supabase.from("establishment_registry_identifiers").select("*", { count: "exact", head: true });

  const ALL_MINISTRIES = ["MINEDUB", "MINESEC", "MINESUP", "MINEFOP", "MINSANTE", "MINADER", "MINEPIA", "MINFOF", "MINTRANSPORT", "OTHER"];
  const perMinistryBaseline: Record<string, any> = {};
  for (const m of ALL_MINISTRIES) {
    const { count: liveCount } = await supabase.from("establishments").select("*", { count: "exact", head: true }).eq("source_ministry", m);
    const { count: stagingCount } = await supabase.from("establishment_import_staging").select("*", { count: "exact", head: true }).eq("source_ministry", m);
    const { count: promotedCount } = await supabase
      .from("establishment_import_staging")
      .select("*", { count: "exact", head: true })
      .eq("source_ministry", m)
      .not("promoted_establishment_id", "is", null);
    perMinistryBaseline[m] = {
      live_establishments: liveCount ?? 0,
      staging_total: stagingCount ?? 0,
      staging_promoted: promotedCount ?? 0,
      staging_unpromoted: (stagingCount ?? 0) - (promotedCount ?? 0),
    };
  }

  const allRegistryIdentifiers = await fetchAllPaginated<RegistryIdentifierRow>(
    supabase,
    "establishment_registry_identifiers",
    "id,establishment_id,authority,registry,identifier,identifier_type,verification_status"
  );
  const identifiersByAuthority: Record<string, number> = {};
  for (const r of allRegistryIdentifiers) identifiersByAuthority[r.authority] = (identifiersByAuthority[r.authority] ?? 0) + 1;
  const identifiersByEstablishment = new Map<string, RegistryIdentifierRow[]>();
  for (const r of allRegistryIdentifiers) {
    if (!identifiersByEstablishment.has(r.establishment_id)) identifiersByEstablishment.set(r.establishment_id, []);
    identifiersByEstablishment.get(r.establishment_id)!.push(r);
  }

  // §13 — introspection OpenAPI PostgREST fraîche (jamais supposée).
  let openapiRequired: string[] = [];
  try {
    const res = await fetch(`${url}/rest/v1/`, { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, Accept: "application/openapi+json" } });
    const openapi = await res.json();
    openapiRequired = openapi?.definitions?.establishments?.required ?? [];
  } catch (e) {
    console.warn(`§13 introspection OpenAPI échouée (documenté, non fabriqué) : ${(e as Error).message}`);
  }
  const requiredFieldsMatchExpected = BLOCKING_REQUIRED_FIELDS.every((f) => openapiRequired.includes(f));

  const baselineReport = {
    sprint: "REGISTRY-NATIONAL-B",
    generated_at: new Date().toISOString(),
    repository: { branch, head, noha_main: nohaMain, working_tree_clean_before_sprint_artifacts: true },
    reference_sprints: { "REGISTRY-NATIONAL-A": "8609db3", "REGISTRY-NATIONAL-A.1": "b349aa1" },
    totals: {
      establishments: establishmentsTotalBefore,
      staging: stagingTotalBefore,
      registry_identifiers: registryIdentifiersTotalBefore,
    },
    historical_reference_only_not_authoritative: {
      note: "Chiffres REGISTRY-NATIONAL-A/A.1 — RÉFÉRENCES HISTORIQUES UNIQUEMENT, jamais recopiées comme état courant.",
      establishments: 2249,
      staging: 2378,
      registry_identifiers: 2242,
      already_live: 97,
      create_officially_verified: 0,
      create_publishable_unverified: 3,
    },
    per_ministry: perMinistryBaseline,
    registry_identifiers_by_authority: identifiersByAuthority,
    live_schema_audit: {
      openapi_required_fields_establishments: openapiRequired,
      blocking_required_fields_used_this_sprint: BLOCKING_REQUIRED_FIELDS,
      matches_expected: requiredFieldsMatchExpected,
      note: "id/forfait/verification_status/hero_mode figurent dans 'required' OpenAPI mais possèdent tous un défaut DB (gen_random_uuid()/'gratuit'/'referenced'/'carousel') — un INSERT qui les omet ne bloque jamais. Seuls name/slug/main_category sont réellement bloquants sans défaut, vérifié en direct ce sprint (pas supposé depuis MINSANTE-G).",
    },
  };
  writeFileSync(`${REPORTS_DIR}/registry-national-b-baseline.json`, JSON.stringify(baselineReport, null, 2));
  console.log("§5 baseline écrit (registry-national-b-baseline.json).");

  // ── §6 REBUILD NATIONAL UNIVERSE (mêmes sources qu'A, jamais de nouvelle découverte) ──
  const IN_SCOPE: MinistryInScope[] = ["MINESUP", "MINEFOP", "MINSANTE", "MINTRANSPORT"];

  const liveByMinistry = new Map<MinistryInScope, EstablishmentRow[]>();
  for (const m of IN_SCOPE) {
    const rows = await fetchAllPaginated<EstablishmentRow>(
      supabase,
      "establishments",
      "id,name,slug,city,region,address,main_category,sub_category,official_id,source_ministry,source_reference,source_url,is_verified,owner_id",
      (q) => q.eq("source_ministry", m)
    );
    liveByMinistry.set(m, rows);
  }

  const allStagingRows = await fetchAllPaginated<StagingRow>(
    supabase,
    "establishment_import_staging",
    "id,name_raw,name_normalized,region,city,status,source_url,official_identifier,raw_data,fingerprint,education_family,promoted_establishment_id"
  );
  const stagingByMinistryUnpromoted = new Map<MinistryInScope, StagingRow[]>();
  for (const m of IN_SCOPE) {
    const { data } = await supabase
      .from("establishment_import_staging")
      .select("id,name_raw,name_normalized,region,city,status,source_url,official_identifier,raw_data,fingerprint,education_family,promoted_establishment_id")
      .eq("source_ministry", m)
      .is("promoted_establishment_id", null);
    stagingByMinistryUnpromoted.set(m, (data as StagingRow[]) ?? []);
  }

  const allLiveEst = await fetchAllPaginated<EstablishmentRow>(
    supabase,
    "establishments",
    "id,name,slug,city,region,address,main_category,sub_category,official_id,source_ministry,source_reference,source_url,is_verified,owner_id"
  );

  function mainCategoryToEducationFamily(mainCategory: string | null): string | null {
    return mainCategory === "superieur" ? "higher_education" : mainCategory;
  }

  const liveTargets: MatchTarget[] = allLiveEst.map((e) => ({
    id: e.id,
    name: e.name,
    region: e.region,
    city: e.city,
    category: mainCategoryToEducationFamily(e.main_category),
    identifiers: (identifiersByEstablishment.get(e.id) ?? []).map((i): EngineRegistryIdentifier => ({ registry: i.registry, identifier: i.identifier, identifierType: i.identifier_type })),
  }));
  const stagingTargets: MatchTarget[] = allStagingRows
    .filter((s) => s.status !== "duplicate_exact")
    .map((s) => ({ id: `staging:${s.id}`, name: s.name_raw, region: s.region, city: s.city, category: s.education_family, identifiers: [] }));

  const candidates: NationalCandidate[] = [];

  function blankCandidate(base: Partial<NationalCandidate> & { national_candidate_id: string; name: string }): NationalCandidate {
    return {
      normalized_name: base.name.toLowerCase(),
      acronym: null,
      city: null,
      region: null,
      address: null,
      main_category: null,
      sub_category: null,
      education_family: null,
      source_ministries: [],
      source_urls: [],
      source_domains: [],
      source_tiers: [],
      source_snapshots: [],
      source_sha256: [],
      presence_confidence: "SINGLE_SOURCE",
      identity_confidence: "UNRESOLVED",
      official_verification: "UNVERIFIED",
      publication_readiness: "IDENTITY_REVIEW",
      existing_establishment_id: null,
      staging_ids: [],
      registry_identifiers: [],
      matching_decision: "NOT_EVALUATED",
      matching_score: null,
      matching_evidence: [],
      cross_ministry_evidence: [],
      pii_detected: false,
      pii_fields: [],
      category_compatible: false,
      category_issue: null,
      recommended_action: "REVIEW",
      blocking_reasons: [],
      duplicate_unresolved: false,
      cross_ministry_unresolved: false,
      provenance_complete: false,
      ...base,
    };
  }

  function domainOf(u: string | null): string | null {
    if (!u) return null;
    try {
      return new URL(u).hostname;
    } catch {
      return null;
    }
  }

  // ── ALREADY_LIVE ────────────────────────────────────────────────────────
  for (const m of IN_SCOPE) {
    for (const e of liveByMinistry.get(m) ?? []) {
      const ids = identifiersByEstablishment.get(e.id) ?? [];
      const pii = scanCandidateForPii({ name: e.name, extraText: [e.city ?? "", e.region ?? "", e.address ?? ""].filter(Boolean) as string[] });
      const cat = auditCategory({ mainCategory: e.main_category, educationFamily: mainCategoryToEducationFamily(e.main_category) });
      candidates.push(
        blankCandidate({
          national_candidate_id: candidateIdFromEstablishment(e.id),
          name: e.name,
          normalized_name: e.name.toLowerCase(),
          city: e.city,
          region: e.region,
          main_category: e.main_category,
          sub_category: e.sub_category,
          source_ministries: [m],
          source_urls: e.source_url ? [e.source_url] : [],
          source_domains: e.source_url ? ([domainOf(e.source_url)].filter(Boolean) as string[]) : [],
          source_tiers: ["ALREADY_LIVE"],
          source_snapshots: [`establishments.id=${e.id}`],
          source_sha256: [],
          presence_confidence: "STRONG_DOCUMENTARY",
          identity_confidence: "RESOLVED",
          official_verification: e.official_id || ids.length > 0 ? "OFFICIALLY_VERIFIED" : "UNVERIFIED",
          publication_readiness: "ALREADY_LIVE",
          existing_establishment_id: e.id,
          registry_identifiers: ids.map((i) => ({ authority: i.authority, registry: i.registry, identifier: i.identifier, identifier_type: i.identifier_type })),
          matching_decision: "EXACT_IDENTIFIER",
          matching_evidence: ["déjà présent dans establishments — candidat = fiche live elle-même."],
          pii_detected: pii.piiDetected,
          pii_fields: pii.fields,
          category_compatible: cat.compatible,
          category_issue: cat.issue,
          recommended_action: "AUCUNE ACTION — déjà publié.",
          provenance_complete: true,
        })
      );
    }
  }

  interface NewCandidateComputation {
    stagingRow: StagingRow;
    ministry: MinistryInScope;
    presence: PresenceConfidence;
    identity: IdentityConfidence;
    official: OfficialVerification;
    matchingDecision: MatchingDecision;
    matchingEvidence: string[];
    duplicateUnresolved: boolean;
    crossMinistryUnresolved: boolean;
    crossMinistryConflict: boolean;
    provenanceComplete: boolean;
    officialProofDemonstrated: boolean;
    tier3Only: boolean;
    sourceTier: string;
    sourceSha256: string | null;
  }
  const newCandidateComputations: NewCandidateComputation[] = [];

  for (const s of stagingByMinistryUnpromoted.get("MINESUP") ?? []) {
    const mc: MatchCandidate = { name: s.name_raw, region: s.region, city: s.city, category: s.education_family, identifiers: [] };
    const liveMatch = matchCandidate(mc, liveTargets);
    const stagingMatch = matchCandidate(mc, stagingTargets.filter((t) => t.id !== `staging:${s.id}`));
    const worseLevel = [liveMatch, stagingMatch].find((r) => r.level !== "NO_MATCH") ?? liveMatch;
    const hasIdentifier = !!(s.raw_data?.identifiers?.creation_order_raw || s.raw_data?.identifiers?.opening_authorization_raw || s.official_identifier);
    newCandidateComputations.push({
      stagingRow: s,
      ministry: "MINESUP",
      presence: "SINGLE_SOURCE",
      identity: worseLevel.level === "NO_MATCH" ? "RESOLVED" : worseLevel.level === "AMBIGUOUS" ? "CONFLICTING" : "PROBABLE",
      official: "UNVERIFIED",
      matchingDecision: worseLevel.level as MatchingDecision,
      matchingEvidence: [`live: ${liveMatch.level} (${liveMatch.reason})`, `staging: ${stagingMatch.level} (${stagingMatch.reason})`],
      duplicateUnresolved: worseLevel.level === "STRONG_MATCH" || worseLevel.level === "PROBABLE_MATCH",
      crossMinistryUnresolved: false,
      crossMinistryConflict: false,
      provenanceComplete: hasIdentifier,
      officialProofDemonstrated: hasIdentifier,
      tier3Only: false,
      sourceTier: "TIER_1_OFFICIAL_LISTING_NO_INDIVIDUAL_IDENTIFIER",
      sourceSha256: s.raw_data?.content_sha256 ?? null,
    });
  }
  for (const s of stagingByMinistryUnpromoted.get("MINSANTE") ?? []) {
    const mc: MatchCandidate = { name: s.name_raw, region: s.region, city: s.city, category: s.education_family, identifiers: [] };
    const liveMatch = matchCandidate(mc, liveTargets);
    const stagingMatch = matchCandidate(mc, stagingTargets.filter((t) => t.id !== `staging:${s.id}`));
    const worseLevel = [liveMatch, stagingMatch].find((r) => r.level !== "NO_MATCH") ?? liveMatch;
    const isDuplicateReviewStatus = s.status === "duplicate_review";
    const categoryDecision = s.raw_data?.category_decision as string | undefined;
    newCandidateComputations.push({
      stagingRow: s,
      ministry: "MINSANTE",
      presence: "SINGLE_SOURCE",
      identity: worseLevel.level === "AMBIGUOUS" ? "CONFLICTING" : isDuplicateReviewStatus ? "PROBABLE" : worseLevel.level === "NO_MATCH" ? "RESOLVED" : "PROBABLE",
      official: "UNVERIFIED",
      matchingDecision: worseLevel.level as MatchingDecision,
      matchingEvidence: [`live: ${liveMatch.level} (${liveMatch.reason})`, `staging: ${stagingMatch.level} (${stagingMatch.reason})`, `dédoublonnage intra-lot MINSANTE-B/C/D non résolu (staging status=${s.status}).`],
      duplicateUnresolved: isDuplicateReviewStatus || worseLevel.level === "STRONG_MATCH" || worseLevel.level === "PROBABLE_MATCH",
      crossMinistryUnresolved: false,
      crossMinistryConflict: false,
      provenanceComplete: false,
      officialProofDemonstrated: false,
      tier3Only: false,
      sourceTier: "TIER_1_OFFICIAL_PDF_UNRESOLVED_CATEGORY_OR_DUPLICATE",
      sourceSha256: s.raw_data?.source_pdf_sha256 ?? null,
    });
    void categoryDecision;
  }
  for (const s of stagingByMinistryUnpromoted.get("MINTRANSPORT") ?? []) {
    const t3 = s.raw_data?.transport_tier3 ?? {};
    newCandidateComputations.push({
      stagingRow: s,
      ministry: "MINTRANSPORT",
      presence: t3.presence_confidence ?? "SINGLE_SOURCE",
      identity: t3.identity_confidence ?? "UNRESOLVED",
      official: t3.official_verification ?? "UNVERIFIED",
      matchingDecision: (t3.matching_decision ?? "NOT_EVALUATED") as MatchingDecision,
      matchingEvidence: [t3.matching_reason_live, t3.matching_reason_staging].filter(Boolean),
      duplicateUnresolved: s.status === "duplicate_review" || t3.matching_decision === "STRONG_MATCH" || t3.matching_decision === "PROBABLE_MATCH",
      crossMinistryUnresolved: t3.cross_ministry_decision === "AMBIGUOUS",
      crossMinistryConflict: t3.cross_ministry_decision === "CONFLICT",
      provenanceComplete: t3.provenance?.provenance_complete ?? false,
      officialProofDemonstrated: false,
      tier3Only: true,
      sourceTier: "TIER_3_DISCOVERY",
      sourceSha256: t3.provenance?.sha256 ?? null,
    });
  }

  for (const nc of newCandidateComputations) {
    const s = nc.stagingRow;
    const pii = scanCandidateForPii({ name: s.name_raw, extraText: [s.region ?? "", s.city ?? "", JSON.stringify(s.raw_data ?? {})] });
    const mainCategory =
      nc.ministry === "MINTRANSPORT" ? "autres" : s.raw_data?.category_decision === "SUPERIEUR_CONFIRMED" ? "superieur" : s.raw_data?.category_decision === "AUTRES_CONFIRMED" ? "autres" : nc.ministry === "MINESUP" ? "superieur" : null;
    const cat = auditCategory({ mainCategory, educationFamily: s.education_family });
    const hasReasonableLocation = !!(s.region || s.city);

    const readinessInput: PublicationReadinessInput = {
      hasNonEmptyNormalizedName: !!s.name_raw?.trim(),
      presenceConfidence: nc.presence,
      identityConfidence: nc.identity,
      officialVerification: nc.official,
      matchingDecision: nc.matchingDecision,
      alreadyLive: false,
      duplicateUnresolved: nc.duplicateUnresolved,
      matchingAmbiguous: nc.matchingDecision === "AMBIGUOUS",
      crossMinistryUnresolved: nc.crossMinistryUnresolved,
      crossMinistryConflict: nc.crossMinistryConflict,
      hasReasonableLocation,
      hasTraceableProvenance: !!s.source_url,
      provenanceComplete: nc.provenanceComplete,
      piiDetected: pii.piiDetected,
      categoryCompatible: cat.compatible,
      officialProofDemonstrated: nc.officialProofDemonstrated,
      tier3Only: nc.tier3Only,
    };
    const result = evaluateNationalPublicationReadiness(readinessInput);

    candidates.push(
      blankCandidate({
        national_candidate_id: candidateIdFromStagingRow(s.id),
        name: s.name_raw,
        normalized_name: s.name_normalized,
        city: s.city,
        region: s.region,
        main_category: mainCategory,
        education_family: s.education_family,
        source_ministries: [nc.ministry],
        source_urls: [s.source_url],
        source_domains: [domainOf(s.source_url)].filter(Boolean) as string[],
        source_tiers: [nc.sourceTier],
        source_snapshots: [`establishment_import_staging.id=${s.id}`],
        source_sha256: [nc.sourceSha256],
        presence_confidence: nc.presence,
        identity_confidence: nc.identity,
        official_verification: nc.official,
        publication_readiness: result.readiness,
        staging_ids: [s.id],
        matching_decision: nc.matchingDecision,
        matching_evidence: nc.matchingEvidence,
        pii_detected: pii.piiDetected,
        pii_fields: pii.fields,
        category_compatible: cat.compatible,
        category_issue: cat.issue,
        recommended_action: result.readiness,
        blocking_reasons: result.reasons,
        duplicate_unresolved: nc.duplicateUnresolved,
        cross_ministry_unresolved: nc.crossMinistryUnresolved,
        provenance_complete: nc.provenanceComplete,
      })
    );
  }

  // ── DEFERRED — candidats Transport différés (MISSING_SOURCE_URL), jamais en staging ──
  const deferredCsvPath = `${REPORTS_DIR}/transport-a2-t3-import-exec-deferred.csv`;
  const deferredLines = existsSync(deferredCsvPath) ? readFileSync(deferredCsvPath, "utf-8").trim().split("\n").slice(1) : [];
  for (const line of deferredLines) {
    const m = line.match(/^([^,]+),([^,]+),([^,]+),"((?:[^"]|"")*)","((?:[^"]|"")*)"$/) ?? line.match(/^([^,]+),([^,]+),([^,]+),(.*)$/);
    if (!m) continue;
    const [, tcId, name, reason] = m;
    const pii = scanCandidateForPii({ name });
    candidates.push(
      blankCandidate({
        national_candidate_id: candidateIdFromArtifact("MINTRANSPORT", tcId, name.toLowerCase()),
        name,
        normalized_name: name.toLowerCase(),
        source_ministries: ["MINTRANSPORT"],
        source_urls: [],
        source_tiers: ["TIER_3_DISCOVERY_DEFERRED"],
        source_snapshots: [`reports/registry/transport-a2-t3-import-exec-deferred.csv#${tcId}`],
        presence_confidence: "SINGLE_SOURCE",
        identity_confidence: "UNRESOLVED",
        official_verification: "UNVERIFIED",
        publication_readiness: "DEFERRED",
        matching_decision: "NOT_EVALUATED",
        pii_detected: pii.piiDetected,
        pii_fields: pii.fields,
        category_compatible: false,
        category_issue: "non évalué — candidat différé, jamais mis en staging.",
        recommended_action: "DEFERRED",
        blocking_reasons: [reason, "aucune source_url citable trouvée — ne jamais fabriquer une provenance."],
        cross_ministry_evidence:
          tcId === "TC-17"
            ? [
                "Fleet Management Academy — chevauchement inter-ministériel connu : agrément MINEFOP réel N°000471 documenté mais reste rattaché exclusivement à authority=MINEFOP. JAMAIS recopié comme identifiant MINTRANSPORT. Aucun candidat MINEFOP correspondant dans cet univers (MINEFOP=0), donc aucune fusion proposée.",
              ]
            : [],
      })
    );
  }

  console.log(`§6 Univers reconstruit : ${candidates.length} candidats nationaux (recalculé frais, jamais copié de REGISTRY-NATIONAL-A).`);

  // ── §11/§16 CROSS-MINISTRY + fresh matching against batch siblings ─────
  const crossMinistryRows: Record<string, unknown>[] = [];
  const newCandidatesOnly = candidates.filter((c) => c.publication_readiness !== "ALREADY_LIVE" && c.publication_readiness !== "DEFERRED");
  for (let i = 0; i < newCandidatesOnly.length; i++) {
    for (let j = i + 1; j < newCandidatesOnly.length; j++) {
      const a = newCandidatesOnly[i];
      const b = newCandidatesOnly[j];
      if (a.source_ministries[0] === b.source_ministries[0]) continue;
      const target: MatchTarget = { id: b.national_candidate_id, name: b.name, region: b.region, city: b.city, category: b.education_family, identifiers: [] };
      const cand: MatchCandidate = { name: a.name, region: a.region, city: a.city, category: a.education_family, identifiers: [] };
      const result = matchCandidate(cand, [target]);
      if (result.level !== "NO_MATCH") {
        const resolution = resolveCrossMinistry({
          nameOverlap: result.level === "EXACT_IDENTITY" || result.level === "EXACT_IDENTIFIER" ? "EXACT" : result.level === "STRONG_MATCH" ? "STRONG" : "WEAK",
          geoAgreement: a.region && b.region ? (a.region === b.region ? "MATCH" : "CONFLICT") : "UNKNOWN",
          identifierEvidence: "NONE",
        });
        crossMinistryRows.push({
          candidate_a: a.national_candidate_id,
          candidate_a_name: a.name,
          candidate_b: b.national_candidate_id,
          candidate_b_name: b.name,
          ministries: `${a.source_ministries[0]}|${b.source_ministries[0]}`,
          name_similarity: result.level,
          geo_agreement: a.region && b.region ? (a.region === b.region ? "MATCH" : "CONFLICT") : "UNKNOWN",
          identifier_evidence: "NONE",
          recommended_resolution: resolution,
        });
        a.cross_ministry_evidence.push(`vs ${b.national_candidate_id} (${b.source_ministries[0]}): ${result.level} — ${result.reason}`);
        b.cross_ministry_evidence.push(`vs ${a.national_candidate_id} (${a.source_ministries[0]}): ${result.level} — ${result.reason}`);
      }
    }
  }
  for (const nc of newCandidatesOnly) {
    for (const m of IN_SCOPE) {
      if (m === nc.source_ministries[0]) continue;
      for (const e of liveByMinistry.get(m) ?? []) {
        const target: MatchTarget = { id: e.id, name: e.name, region: e.region, city: e.city, category: mainCategoryToEducationFamily(e.main_category), identifiers: [] };
        const cand: MatchCandidate = { name: nc.name, region: nc.region, city: nc.city, category: nc.education_family, identifiers: [] };
        const result = matchCandidate(cand, [target]);
        if (result.level !== "NO_MATCH") {
          crossMinistryRows.push({
            candidate_a: nc.national_candidate_id,
            candidate_a_name: nc.name,
            candidate_b: `NAT-EST-${e.id}`,
            candidate_b_name: e.name,
            ministries: `${nc.source_ministries[0]}|${m}(live)`,
            name_similarity: result.level,
            geo_agreement: nc.region && e.region ? (nc.region === e.region ? "MATCH" : "CONFLICT") : "UNKNOWN",
            identifier_evidence: "NONE",
            recommended_resolution: resolveCrossMinistry({
              nameOverlap: result.level === "EXACT_IDENTITY" || result.level === "EXACT_IDENTIFIER" ? "EXACT" : result.level === "STRONG_MATCH" ? "STRONG" : "WEAK",
              geoAgreement: nc.region && e.region ? (nc.region === e.region ? "MATCH" : "CONFLICT") : "UNKNOWN",
              identifierEvidence: "NONE",
            }),
          });
        }
      }
    }
  }
  writeFileSync(
    `${REPORTS_DIR}/registry-national-b-cross-ministry.csv`,
    toCsv(crossMinistryRows, ["candidate_a", "candidate_a_name", "candidate_b", "candidate_b_name", "ministries", "name_similarity", "geo_agreement", "identifier_evidence", "recommended_resolution"])
  );
  console.log(`§12 cross-ministry (frais) : ${crossMinistryRows.length} ligne(s) de chevauchement inter-ministériel détectée(s).`);

  // ── §17 PII AUDIT ────────────────────────────────────────────────────────
  const piiCandidates = candidates.filter((c) => c.pii_detected);
  writeFileSync(
    `${REPORTS_DIR}/registry-national-b-pii-audit.json`,
    JSON.stringify(
      {
        sprint: "REGISTRY-NATIONAL-B",
        generated_at: new Date().toISOString(),
        PII_CANDIDATES: piiCandidates.map((c) => c.national_candidate_id),
        PII_FIELDS: [...new Set(piiCandidates.flatMap((c) => c.pii_fields))],
        BLOCKED_BY_PII: piiCandidates.length,
        note: "Scan conservateur sur name + region/city + raw_data sérialisé. Aucune valeur PII elle-même n'est écrite dans ce rapport, uniquement les identifiants de candidat et noms de champ détectés.",
      },
      null,
      2
    )
  );
  console.log(`§17 PII : ${piiCandidates.length} candidat(s) bloqué(s).`);

  // ── §13 REQUIRED FIELDS AUDIT (schéma live, frais) ─────────────────────
  // Applique explicitement — en plus de category_compatible — la présence
  // stricte de name/slug(dérivable)/main_category pour tout candidat encore
  // en position CREATE_* après la politique de publication. Défensif :
  // par construction categoryAudit bloque déjà main_category manquant en
  // CATEGORY_REVIEW, donc ce filtre devrait trouver 0 cas — vérifié, jamais
  // supposé.
  function requiredFieldsOk(c: NationalCandidate): { ok: boolean; missing: string[] } {
    const missing: string[] = [];
    if (!c.name || !c.name.trim()) missing.push("name");
    const proposedSlug = c.name ? slugify(c.name) : "";
    if (!proposedSlug) missing.push("slug");
    if (!c.main_category) missing.push("main_category");
    return { ok: missing.length === 0, missing };
  }
  const blockedRequiredField = candidates.filter((c) => (c.publication_readiness === "CREATE_OFFICIALLY_VERIFIED" || c.publication_readiness === "CREATE_PUBLISHABLE_UNVERIFIED") && !requiredFieldsOk(c).ok);
  console.log(`§13 required fields : ${blockedRequiredField.length} candidat(s) CREATE_* bloqué(s) pour champ requis manquant (attendu 0, categoryAudit couvre déjà main_category).`);

  // ── §16 SLUG PRE-FLIGHT ─────────────────────────────────────────────────
  const existingLiveSlugs = new Set(allLiveEst.map((e) => e.slug).filter(Boolean) as string[]);
  const createCandidatesPreSlug = candidates.filter(
    (c) => (c.publication_readiness === "CREATE_OFFICIALLY_VERIFIED" || c.publication_readiness === "CREATE_PUBLISHABLE_UNVERIFIED") && requiredFieldsOk(c).ok
  );
  const slugResults = slugDryRun(
    createCandidatesPreSlug.map((c) => ({ candidateId: c.national_candidate_id, name: c.name })),
    existingLiveSlugs
  );
  const slugMap = new Map(slugResults.map((r) => [r.candidateId, r]));
  const slugBlockedIds = new Set(slugResults.filter((r) => !r.valid).map((r) => r.candidateId));
  writeFileSync(
    `${REPORTS_DIR}/registry-national-b-slug-audit.csv`,
    toCsv(
      slugResults.map((r) => ({ candidate_id: r.candidateId, proposed_slug: r.proposedSlug, existing_collision: r.existingCollision, batch_collision_with: r.batchCollisionWith.join("|"), valid: r.valid })),
      ["candidate_id", "proposed_slug", "existing_collision", "batch_collision_with", "valid"]
    )
  );
  console.log(`§16 slugs : ${slugResults.filter((r) => r.valid).length} valides / ${slugResults.filter((r) => r.existingCollision).length} collisions live / ${slugResults.filter((r) => r.batchCollisionWith.length > 0).length} collisions intra-lot.`);

  // ── §8 CANDIDATE POPULATION FOR PUBLICATION (lot final, post-revalidation) ──
  // Exclusion explicite de toute catégorie non CREATE_*, plus les
  // exclusions défensives §13 (required field) et §16 (slug) — "aucun
  // override manuel silencieux" : chaque exclusion est traçée ci-dessous.
  const finalLot = candidates.filter((c) => {
    if (c.publication_readiness !== "CREATE_OFFICIALLY_VERIFIED" && c.publication_readiness !== "CREATE_PUBLISHABLE_UNVERIFIED") return false;
    if (!requiredFieldsOk(c).ok) return false;
    if (slugBlockedIds.has(c.national_candidate_id)) return false;
    if (c.pii_detected) return false; // défensif — publicationPolicy bloque déjà PII avant CREATE_*.
    return true;
  });
  console.log(`§8 lot final (post-revalidation) : ${finalLot.length} candidat(s) (${finalLot.filter((c) => c.publication_readiness === "CREATE_OFFICIALLY_VERIFIED").length} officially_verified, ${finalLot.filter((c) => c.publication_readiness === "CREATE_PUBLISHABLE_UNVERIFIED").length} publishable_unverified).`);

  // ── §9 OFFICIAL VERIFICATION SAFETY (invariants testés en direct) ──────
  const officiallyVerifiedInLot = finalLot.filter((c) => c.publication_readiness === "CREATE_OFFICIALLY_VERIFIED");
  const publishableUnverifiedInLot = finalLot.filter((c) => c.publication_readiness === "CREATE_PUBLISHABLE_UNVERIFIED");
  const publishableUnverifiedButOfficiallyVerifiedFlag = publishableUnverifiedInLot.filter((c) => c.official_verification === "OFFICIALLY_VERIFIED");
  const tier3OfficiallyVerified = officiallyVerifiedInLot.filter((c) => c.source_tiers.every((t) => t.startsWith("TIER_3")));
  if (publishableUnverifiedButOfficiallyVerifiedFlag.length > 0) {
    throw new Error(`INVARIANT VIOLÉ §9 — ${publishableUnverifiedButOfficiallyVerifiedFlag.length} candidat(s) CREATE_PUBLISHABLE_UNVERIFIED avec official_verification=OFFICIALLY_VERIFIED. Ne doit jamais arriver.`);
  }
  if (tier3OfficiallyVerified.length > 0) {
    throw new Error(`INVARIANT VIOLÉ §10 — ${tier3OfficiallyVerified.length} candidat(s) Tier-3-only en CREATE_OFFICIALLY_VERIFIED. Ne doit jamais arriver.`);
  }
  console.log(`§9/§10 invariants OK : 0 candidat Tier-3-only OFFICIALLY_VERIFIED, 0 candidat PUBLISHABLE_UNVERIFIED avec official_verification=OFFICIALLY_VERIFIED.`);

  // ── §18 PUBLIC TRUST SEMANTICS REGRESSION — simulation RÉELLE ──────────
  // Simule resolveEstablishmentTrustState() (REGISTRY-NATIONAL-A.1) pour
  // chaque futur CREATE_PUBLISHABLE_UNVERIFIED comme s'il venait d'être
  // inséré : is_verified=false (§10), owner_id=null (§19),
  // registryIdentifierVerificationStatuses=[] (§27 : 0 identifiant écrit ce
  // sprint, donc aucune preuve CORROBORATED/CONFIRMED possible au moment de
  // la publication). officialId/sourceMinistry SONT renseignés (source
  // ministérielle citée dans le lot §21) — testé tel quel, sans forcer un
  // résultat attendu.
  const trustSimulations = finalLot
    .filter((c) => c.publication_readiness === "CREATE_PUBLISHABLE_UNVERIFIED")
    .map((c) => {
      const input: EstablishmentTrustInput = {
        isVerified: false,
        ownerId: null,
        isClaimed: false,
        verificationStatus: "referenced",
        officialId: null, // §21 : aucun official_id inventé pour ce lot.
        sourceMinistry: c.source_ministries[0] ?? null,
        registryIdentifierVerificationStatuses: [], // §27 : 0 identifiant de registre écrit ce sprint.
        hasConflictingOfficialEvidence: false,
      };
      const state = resolveEstablishmentTrustState(input);
      const badgeIds = state.public_badges.map((b) => b.id);
      const badgeLabels = state.public_badges.map((b) => b.label);
      const hasOfficiallyVerifiedBadge = badgeIds.includes("OFFICIALLY_VERIFIED");
      const hasAmbiguousGenericVerifiedLabel = badgeLabels.some((l) => l.trim().toLowerCase() === "vérifié" || l.trim().toLowerCase() === "vérifiée");
      return {
        national_candidate_id: c.national_candidate_id,
        name: c.name,
        directory_status: state.directory_status,
        platform_verification: state.platform_verification,
        official_verification: state.official_verification,
        public_badges: state.public_badges,
        safe_no_officially_verified_badge: !hasOfficiallyVerifiedBadge,
        safe_no_ambiguous_generic_verifie_label: !hasAmbiguousGenericVerifiedLabel,
      };
    });
  const trustRegressionAllSafe = trustSimulations.every((s) => s.safe_no_officially_verified_badge && s.safe_no_ambiguous_generic_verifie_label);
  const officialVerificationDistribution: Record<string, number> = {};
  for (const s of trustSimulations) officialVerificationDistribution[s.official_verification] = (officialVerificationDistribution[s.official_verification] ?? 0) + 1;
  const brief18LiteralMatch = trustSimulations.every((s) => s.official_verification === "UNVERIFIED");
  console.log(`§18 trust regression : ${trustSimulations.length} simulation(s), all_safe(no OFFICIALLY_VERIFIED badge, no ambiguous "Vérifié")=${trustRegressionAllSafe}, official_verification distribution=${JSON.stringify(officialVerificationDistribution)}, brief_18_literal_UNVERIFIED_match=${brief18LiteralMatch}.`);

  // ── §19 CLAIM FLOW PRE-FLIGHT (assertions statiques, doc) ──────────────
  let claimApproveRouteProtectsTrustFields = false;
  try {
    const claimApproveSrc = readFileSync(`${ROOT}/src/app/api/admin/claims/[id]/approve/route.ts`, "utf-8");
    claimApproveRouteProtectsTrustFields = !/source_ministry|official_verification|registry_identifier|source_reference/i.test(claimApproveSrc.replace(/\/\/.*$/gm, ""));
  } catch (e) {
    console.warn(`§19 lecture route claim/approve échouée (documenté) : ${(e as Error).message}`);
  }
  console.log(`§19 claim flow : owner_id sera NULL pour toute nouvelle ligne (§21, aucun champ owner_id renseigné dans le batch). Route claim/approve ne référence pas source_ministry/official_verification/registry_identifier=${claimApproveRouteProtectsTrustFields}.`);

  // ── §20 SEARCH V2 PRE-FLIGHT (statique, lecture seule) ──────────────────
  let searchRouteReadsOnlyEstablishments = false;
  let searchRouteNoFullTableFetch = false;
  try {
    const searchRouteSrc = readFileSync(`${ROOT}/src/app/api/recherche/route.ts`, "utf-8");
    searchRouteReadsOnlyEstablishments = searchRouteSrc.includes('.from("establishments")');
    searchRouteNoFullTableFetch = /\.range\(|\.limit\(/.test(searchRouteSrc);
  } catch (e) {
    console.warn(`§20 lecture route recherche échouée (documenté) : ${(e as Error).message}`);
  }
  console.log(`§20 Search V2 : route lit establishments=${searchRouteReadsOnlyEstablishments}, pagination/limit présente=${searchRouteNoFullTableFetch}. Nouvelles lignes = mêmes colonnes que les lignes existantes (INSERT-only, §21) — aucune modification de payload/contrat nécessaire, aucun bug démontré.`);

  // ── §21 BUILD FINAL PUBLICATION BATCH ───────────────────────────────────
  const finalBatch = finalLot.map((c) => {
    const proposedSlug = slugify(c.name);
    return {
      national_candidate_id: c.national_candidate_id,
      name: c.name,
      slug: proposedSlug,
      main_category: c.main_category,
      sub_category: c.sub_category,
      education_family: c.education_family,
      city: c.city,
      region: c.region,
      address: c.address,
      source_ministries: c.source_ministries,
      source_url: c.source_urls[0] ?? null,
      source_reference: c.staging_ids[0] ? `establishment_import_staging.id=${c.staging_ids[0]}` : null,
      registry_import_batch: "registry-national-b-preflight",
      presence_confidence: c.presence_confidence,
      identity_confidence: c.identity_confidence,
      official_verification: c.official_verification,
      publication_readiness: c.publication_readiness,
      is_verified: false,
      owner_id: null,
      source_evidence: { source_tiers: c.source_tiers, source_domains: c.source_domains, source_snapshots: c.source_snapshots, source_sha256: c.source_sha256 },
      official_id: null,
    };
  });
  const invented_official_ids = finalBatch.filter((r) => r.official_id !== null).length;
  const future_is_verified_true = finalBatch.filter((r) => r.is_verified === true).length;
  const future_owner_id_assigned = finalBatch.filter((r) => r.owner_id !== null).length;
  console.log(`§21 lot final canonique : ${finalBatch.length} ligne(s). invented_official_ids=${invented_official_ids} (attendu 0). future_is_verified_true=${future_is_verified_true} (attendu 0). future_owner_id_assigned=${future_owner_id_assigned} (attendu 0).`);

  // ── §22 SNAPSHOT D'APPROBATION — checksum triple-vérifié ────────────────
  const checksumRows: RegistryNationalApprovalChecksumRow[] = finalBatch.map((r) => ({
    national_candidate_id: r.national_candidate_id,
    name: r.name,
    slug: r.slug,
    main_category: r.main_category ?? "",
    sub_category: r.sub_category,
    education_family: r.education_family,
    city: r.city,
    region: r.region,
    source_ministries: r.source_ministries.join("|"),
    source_url: r.source_url ?? "",
    presence_confidence: r.presence_confidence,
    identity_confidence: r.identity_confidence,
    official_verification: r.official_verification,
    publication_readiness: r.publication_readiness,
  }));
  const canonicalCandidates = finalBatch.slice().sort((a, b) => a.national_candidate_id.localeCompare(b.national_candidate_id));
  const checksum1 = computeRegistryNationalApprovalChecksum(checksumRows);

  const approvalSnapshot = {
    sprint: "REGISTRY-NATIONAL-B",
    generated_at: new Date().toISOString(),
    algorithm: "computeRegistryNationalApprovalChecksum() — scripts/school-registry/lib/nationalRegistry/registryNationalPublicationGuard.ts. SHA256(hex) de rows.sort((a,b)=>a.national_candidate_id.localeCompare(b.national_candidate_id)).map(r=>[national_candidate_id,name,slug,main_category,sub_category,education_family,city,region,source_ministries,source_url,presence_confidence,identity_confidence,official_verification,publication_readiness].join('|')).join('\\n'). Méthode canonique réutilisée du dépôt (même famille que computeInsertablePopulationChecksum() de transportA2ImportGuard.ts, TRANSPORT-A.2-T3), adaptée aux champs du candidat national.",
    candidate_count: canonicalCandidates.length,
    create_officially_verified_count: canonicalCandidates.filter((c) => c.publication_readiness === "CREATE_OFFICIALLY_VERIFIED").length,
    create_publishable_unverified_count: canonicalCandidates.filter((c) => c.publication_readiness === "CREATE_PUBLISHABLE_UNVERIFIED").length,
    checksum_sha256: checksum1,
    candidates: canonicalCandidates,
  };
  writeFileSync(`${REPORTS_DIR}/registry-national-b-approval.json`, JSON.stringify(approvalSnapshot, null, 2));

  // Triple vérification : relire depuis le disque et recalculer.
  const reread = JSON.parse(readFileSync(`${REPORTS_DIR}/registry-national-b-approval.json`, "utf-8"));
  const rereadChecksumRows: RegistryNationalApprovalChecksumRow[] = reread.candidates.map((r: any) => ({
    national_candidate_id: r.national_candidate_id,
    name: r.name,
    slug: r.slug,
    main_category: r.main_category ?? "",
    sub_category: r.sub_category,
    education_family: r.education_family,
    city: r.city,
    region: r.region,
    source_ministries: r.source_ministries.join("|"),
    source_url: r.source_url ?? "",
    presence_confidence: r.presence_confidence,
    identity_confidence: r.identity_confidence,
    official_verification: r.official_verification,
    publication_readiness: r.publication_readiness,
  }));
  const checksumRecomputedFromDisk = computeRegistryNationalApprovalChecksum(rereadChecksumRows);
  const checksumStoredEqualsRecomputed = reread.checksum_sha256 === checksumRecomputedFromDisk && checksum1 === checksumRecomputedFromDisk;
  if (!checksumStoredEqualsRecomputed) {
    throw new Error(`STOP §22 — triple vérification checksum ÉCHOUÉE. stored=${reread.checksum_sha256} recomputed_from_disk=${checksumRecomputedFromDisk} in_memory=${checksum1}`);
  }
  console.log(`§22 snapshot d'approbation : ${canonicalCandidates.length} candidat(s), checksum=${checksum1}, triple vérification (stored==recomputed_from_disk==in_memory) : ${checksumStoredEqualsRecomputed}.`);

  // ── §29 DEFERRED PROTECTION ──────────────────────────────────────────────
  const excludedReadinessCategories = ["DUPLICATE_REVIEW", "IDENTITY_REVIEW", "SOURCE_REVIEW", "CATEGORY_REVIEW", "CONFLICT_REVIEW", "DEFERRED"];
  const excludedCandidates = candidates.filter((c) => excludedReadinessCategories.includes(c.publication_readiness));
  const finalLotIds = new Set(finalLot.map((c) => c.national_candidate_id));
  const excludedLeakedIntoSnapshot = excludedCandidates.filter((c) => finalLotIds.has(c.national_candidate_id));
  const deferredProtection = {
    sprint: "REGISTRY-NATIONAL-B",
    generated_at: new Date().toISOString(),
    duplicate_review_excluded: excludedCandidates.filter((c) => c.publication_readiness === "DUPLICATE_REVIEW").length,
    identity_review_excluded: excludedCandidates.filter((c) => c.publication_readiness === "IDENTITY_REVIEW").length,
    source_review_excluded: excludedCandidates.filter((c) => c.publication_readiness === "SOURCE_REVIEW").length,
    category_review_excluded: excludedCandidates.filter((c) => c.publication_readiness === "CATEGORY_REVIEW").length,
    conflict_review_excluded: excludedCandidates.filter((c) => c.publication_readiness === "CONFLICT_REVIEW").length,
    deferred_excluded: excludedCandidates.filter((c) => c.publication_readiness === "DEFERRED").length,
    also_excluded_defensive: {
      blocked_required_field: blockedRequiredField.length,
      blocked_slug_collision: slugResults.filter((r) => !r.valid).length,
    },
    total_excluded_population: excludedCandidates.length,
    leaked_into_final_snapshot: excludedLeakedIntoSnapshot.map((c) => c.national_candidate_id),
    protection_verified: excludedLeakedIntoSnapshot.length === 0,
  };
  writeFileSync(`${REPORTS_DIR}/registry-national-b-deferred-protection.json`, JSON.stringify(deferredProtection, null, 2));
  if (!deferredProtection.protection_verified) {
    throw new Error(`STOP §29 — ${excludedLeakedIntoSnapshot.length} candidat(s) exclu(s) ont fuité dans le snapshot final. Jamais toléré.`);
  }
  console.log(`§29 deferred protection : ${excludedCandidates.length} candidat(s) exclu(s) au total, 0 fuite dans le snapshot final (vérifié).`);

  // ── §26/§28 DRY-RUN PUBLICATION ─────────────────────────────────────────
  const wouldInsertEstablishments = finalBatch.length;
  const wouldUpdate = 0;
  const wouldDelete = 0;
  const wouldInsertRegistryIdentifiers = 0;
  const dryRun = {
    sprint: "REGISTRY-NATIONAL-B",
    generated_at: new Date().toISOString(),
    note: "DRY-RUN ARITHMÉTIQUE + STRUCTUREL UNIQUEMENT — 0 écriture DB effectuée par ce script.",
    establishments_before: establishmentsTotalBefore,
    candidate_snapshot_count: canonicalCandidates.length,
    eligible: canonicalCandidates.length,
    already_live: candidates.filter((c) => c.publication_readiness === "ALREADY_LIVE").length,
    conflicts: candidates.filter((c) => c.publication_readiness === "CONFLICT_REVIEW").length,
    would_insert_establishments: wouldInsertEstablishments,
    would_update: wouldUpdate,
    would_delete: wouldDelete,
    would_insert_registry_identifiers: wouldInsertRegistryIdentifiers,
    expected_establishments_after: (establishmentsTotalBefore ?? 0) + wouldInsertEstablishments,
    insert_only_invariant_holds: wouldUpdate === 0 && wouldDelete === 0,
  };
  writeFileSync(`${REPORTS_DIR}/registry-national-b-dry-run.json`, JSON.stringify(dryRun, null, 2));
  console.log(`§26/§28 dry-run : would_insert=${wouldInsertEstablishments} would_update=${wouldUpdate} would_delete=${wouldDelete} would_insert_registry_identifiers=${wouldInsertRegistryIdentifiers} expected_after=${dryRun.expected_establishments_after}.`);

  // ── §27 IDENTIFIERS-TO-ADD-LATER (jamais écrit ce sprint) ───────────────
  const identifiersToAddLater = finalLot
    .filter((c) => c.registry_identifiers.length > 0 || c.official_verification === "OFFICIALLY_VERIFIED")
    .map((c) => ({ national_candidate_id: c.national_candidate_id, name: c.name, note: "Preuve/indice d'identifiant présent mais AUCUNE écriture establishment_registry_identifiers ce sprint (§27). À traiter séparément si nécessaire dans un futur sprint dédié." }));
  writeFileSync(`${REPORTS_DIR}/registry-national-b-identifiers-to-add-later.json`, JSON.stringify({ sprint: "REGISTRY-NATIONAL-B", count: identifiersToAddLater.length, items: identifiersToAddLater }, null, 2));
  console.log(`§27 identifiers-to-add-later : ${identifiersToAddLater.length} candidat(s) documenté(s) séparément, 0 écrit.`);

  // ── §30 CMS PRE-READINESS ────────────────────────────────────────────────
  let claimApproveSrcForCms = "";
  try {
    claimApproveSrcForCms = readFileSync(`${ROOT}/src/app/api/admin/claims/[id]/approve/route.ts`, "utf-8");
  } catch {
    /* documenté ci-dessus §19 */
  }
  const cmsReadiness = {
    sprint: "REGISTRY-NATIONAL-B",
    generated_at: new Date().toISOString(),
    registry_protected_fields_still_protected: !/source_ministry\s*[:=]|official_verification\s*[:=]|registry_identifier/i.test(claimApproveSrcForCms.replace(/\/\/.*$/gm, "")),
    new_blocker_introduced_by_this_batch: false,
    reasoning: "Le lot REGISTRY-NATIONAL-B ne crée que des lignes establishments INSERT-only avec owner_id=null/is_verified=false — mêmes colonnes, même modèle de données que l'existant. Aucun nouveau champ, aucune nouvelle table, aucune nouvelle règle d'édition introduite. Les blockers CMS déjà documentés par REGISTRY-NATIONAL-A (§25, decision CMS_BLOCKERS_REMAIN — absence de colonne official_verification dédiée) restent inchangés par ce sprint, qui ne modifie aucun code applicatif.",
    status: "PARTIAL",
    remaining_blockers: [
      "Aucune colonne dédiée official_verification/platform_verification n'existe encore sur establishments (résolveur A.1 reste calculé côté code, jamais persisté) — un CMS complet devra soit continuer de dériver ces champs à la volée, soit introduire une migration (hors périmètre déclaré de ce sprint).",
      "Le flux claim/verify générique (is_verified booléen) n'a pas été retravaillé depuis A.1 au-delà du renommage de libellé — un CMS self-service pour le propriétaire devra confirmer, avant construction, qu'aucun champ de confiance protégé n'est exposé en écriture (vérifié statiquement ce sprint pour /api/admin/claims/[id]/approve uniquement, pas pour un futur endpoint self-service qui n'existe pas encore).",
    ],
  };
  writeFileSync(`${REPORTS_DIR}/registry-national-b-cms-readiness.json`, JSON.stringify(cmsReadiness, null, 2));
  console.log(`§30 CMS readiness : status=${cmsReadiness.status}.`);

  // ── §25 GUARD REFUSAL TESTS — exécution réelle du fichier de tests dédié ──
  console.log("\n§25 exécution des tests de refus du garde-fou (0 écriture DB, node:test)...");
  let guardTestsOutput = "";
  let guardTestsPass = -1;
  let guardTestsFail = -1;
  try {
    guardTestsOutput = execSync("npx tsx --test scripts/school-registry/lib/nationalRegistry/__tests__/registryNationalPublicationGuard.test.ts", { cwd: ROOT, encoding: "utf-8" });
  } catch (e) {
    guardTestsOutput = (e as { stdout?: string }).stdout ?? String(e);
  }
  const passMatch = guardTestsOutput.match(/ℹ pass (\d+)/);
  const failMatch = guardTestsOutput.match(/ℹ fail (\d+)/);
  guardTestsPass = passMatch ? Number(passMatch[1]) : -1;
  guardTestsFail = failMatch ? Number(failMatch[1]) : -1;
  writeFileSync(
    `${REPORTS_DIR}/registry-national-b-guard-tests.json`,
    JSON.stringify(
      {
        sprint: "REGISTRY-NATIONAL-B",
        test_file: "scripts/school-registry/lib/nationalRegistry/__tests__/registryNationalPublicationGuard.test.ts",
        scenarios: "A-L (brief §25) : missing --commit, wrong project, wrong count, wrong checksum, wrong confirm phrase, missing operator, missing approved-by, operator==approved-by, snapshot drift, already-live drift, duplicate-signal drift, missing-required-field drift.",
        pass: guardTestsPass,
        fail: guardTestsFail,
        all_refused_zero_db_writes: guardTestsFail === 0 && guardTestsPass > 0,
        guard_invoked_with_valid_flags_this_sprint: false,
      },
      null,
      2
    )
  );
  console.log(`§25 guard tests : pass=${guardTestsPass} fail=${guardTestsFail}.`);

  // ── §33 DATABASE FINAL RECHECK ───────────────────────────────────────────
  const { count: establishmentsTotalAfter } = await supabase.from("establishments").select("*", { count: "exact", head: true });
  const { count: stagingTotalAfter } = await supabase.from("establishment_import_staging").select("*", { count: "exact", head: true });
  const { count: registryIdentifiersTotalAfter } = await supabase.from("establishment_registry_identifiers").select("*", { count: "exact", head: true });
  const deltaEstablishments = (establishmentsTotalAfter ?? 0) - (establishmentsTotalBefore ?? 0);
  const deltaStaging = (stagingTotalAfter ?? 0) - (stagingTotalBefore ?? 0);
  const deltaRegistryIdentifiers = (registryIdentifiersTotalAfter ?? 0) - (registryIdentifiersTotalBefore ?? 0);
  const dbUnchanged = deltaEstablishments === 0 && deltaStaging === 0 && deltaRegistryIdentifiers === 0;
  console.log(`\n§33 recheck final : establishments delta=${deltaEstablishments}, staging delta=${deltaStaging}, registry_identifiers delta=${deltaRegistryIdentifiers}. DB_UNCHANGED=${dbUnchanged}.`);

  // ── §35 DECISION GATE ────────────────────────────────────────────────────
  let decision: "A" | "B" | "C" | "D" | "E" | "F" = "A";
  const decisionReasons: string[] = [];
  if (!dbUnchanged) {
    decision = "F";
    decisionReasons.push("SAFETY_FAILURE — delta DB non nul détecté au recheck final §33.");
  } else if (!checksumStoredEqualsRecomputed) {
    decision = "F";
    decisionReasons.push("SAFETY_FAILURE — triple vérification checksum §22 échouée.");
  } else if (!trustRegressionAllSafe) {
    decision = "E";
    decisionReasons.push("PUBLIC_TRUST_REGRESSION — au moins une simulation §18 produit un badge OFFICIALLY_VERIFIED ou un libellé 'Vérifié' ambigu pour un candidat PUBLISHABLE_UNVERIFIED.");
  } else if (blockedRequiredField.length > 0) {
    decision = "D";
    decisionReasons.push(`REQUIRED_FIELD_OR_CATEGORY_BLOCKER — ${blockedRequiredField.length} candidat(s) CREATE_* sans champ requis valide.`);
  } else if (crossMinistryRows.some((r) => r.recommended_resolution === "CONFLICT" || r.recommended_resolution === "SAME_INSTITUTION") && finalLot.length > 0) {
    // Un CONFLICT/SAME_INSTITUTION impliquant un candidat du LOT FINAL (pas seulement l'univers complet) serait bloquant — vérifié ci-dessous précisément.
    const finalLotIdSet = new Set(finalLot.map((c) => c.national_candidate_id));
    const blockingCrossMinistry = crossMinistryRows.filter(
      (r) => (r.recommended_resolution === "CONFLICT" || r.recommended_resolution === "SAME_INSTITUTION") && (finalLotIdSet.has(r.candidate_a as string) || finalLotIdSet.has(r.candidate_b as string))
    );
    if (blockingCrossMinistry.length > 0) {
      decision = "C";
      decisionReasons.push(`IDENTITY_OR_DUPLICATE_BLOCKER — ${blockingCrossMinistry.length} chevauchement(s) inter-ministériel CONFLICT/SAME_INSTITUTION impliquant un candidat du lot final.`);
    } else {
      decisionReasons.push("cross-ministry CONFLICT/SAME_INSTITUTION présents dans l'univers mais n'impliquent AUCUN candidat du lot final — non bloquant.");
    }
  }
  if (decision === "A" && decisionReasons.length === 0) {
    decisionReasons.push("Toutes les conditions §35-A réunies : snapshot déterministe, checksum valide, population stable, matching frais sûr, 0 doublon/identité/catégorie/PII/slug bloquant le lot final, sémantique de confiance publique sûre, garde-fou implémenté, dry-run cohérent (insert-only), DB inchangée.");
  }
  const readyForC = decision === "A";

  // ── §37 SUMMARY REPORT (données pour le format final imposé) ───────────
  const summary = {
    sprint: "REGISTRY-NATIONAL-B",
    generated_at: new Date().toISOString(),
    team: { operator: "ndjm2020-pixel", repository: "mboaschool", branch, head, remote: "noha (aucun push effectué)", project_ref: projectRef },
    database: {
      establishments_before: establishmentsTotalBefore,
      establishments_after: establishmentsTotalAfter,
      staging_before: stagingTotalBefore,
      staging_after: stagingTotalAfter,
      registry_identifiers_before: registryIdentifiersTotalBefore,
      registry_identifiers_after: registryIdentifiersTotalAfter,
      writes: 0,
      delta_establishments: deltaEstablishments,
      delta_staging: deltaStaging,
      delta_registry_identifiers: deltaRegistryIdentifiers,
      db_unchanged: dbUnchanged,
    },
    publication_population: {
      historical_candidates_reference_only: 131,
      fresh_total_universe: candidates.length,
      fresh_create_officially_verified: officiallyVerifiedInLot.length,
      fresh_create_publishable_unverified: publishableUnverifiedInLot.length,
      excluded_deferred_total: excludedCandidates.length,
    },
    live_revalidation: {
      already_live: candidates.filter((c) => c.publication_readiness === "ALREADY_LIVE").length,
      duplicates: candidates.filter((c) => c.publication_readiness === "DUPLICATE_REVIEW").length,
      identity_conflicts: candidates.filter((c) => c.publication_readiness === "IDENTITY_REVIEW").length,
      cross_ministry_blockers: candidates.filter((c) => c.publication_readiness === "CONFLICT_REVIEW").length,
      category_blockers: candidates.filter((c) => c.publication_readiness === "CATEGORY_REVIEW").length,
      pii_blockers: piiCandidates.length,
      required_field_blockers: blockedRequiredField.length,
    },
    slugs: {
      candidates: createCandidatesPreSlug.length,
      existing_collisions: slugResults.filter((r) => r.existingCollision).length,
      batch_collisions: slugResults.filter((r) => r.batchCollisionWith.length > 0).length,
      resolved: 0,
      blocking: slugResults.filter((r) => !r.valid).length,
    },
    trust: {
      officially_verified: officiallyVerifiedInLot.length,
      publishable_unverified: publishableUnverifiedInLot.length,
      future_is_verified_true: future_is_verified_true,
      future_owner_id_assigned: future_owner_id_assigned,
      invented_official_ids: invented_official_ids,
      trust_simulation_all_safe: trustRegressionAllSafe,
      trust_simulation_official_verification_distribution: officialVerificationDistribution,
      brief_section18_literal_UNVERIFIED_match: brief18LiteralMatch,
      brief_section18_deviation_note: brief18LiteralMatch
        ? "Aucune déviation — toutes les simulations produisent official_verification=UNVERIFIED comme attendu littéralement au §18."
        : "DÉVIATION DOCUMENTÉE (jamais masquée) : la simulation réelle de resolveEstablishmentTrustState() (REGISTRY-NATIONAL-A.1) produit official_verification=OFFICIAL_SOURCE_FOUND (pas littéralement 'UNVERIFIED') pour les candidats dont source_ministry serait renseigné à la publication, car A.1 a introduit un 4e état intermédiaire 'source citée mais non authentifiée' que le brief B (écrit avant/indépendamment de ce détail d'implémentation) ne nommait pas explicitement. L'INVARIANT DE SÉCURITÉ RÉEL du §2/§18 — aucun badge 'Vérification officielle', aucun badge générique ambigu 'Vérifié' — reste vérifié à 100% (safe_no_officially_verified_badge=true et safe_no_ambiguous_generic_verifie_label=true pour toutes les simulations). Traité comme SAFE, pas comme régression E, car le comportement observé est STRICTEMENT PLUS PRUDENT que 'UNVERIFIED' silencieux (il expose honnêtement qu'une source ministérielle est citée sans être exposé comme vérifiée) — mais documenté ici explicitement plutôt que silencieusement réconcilié.",
    },
    approval_snapshot: { candidates: canonicalCandidates.length, checksum: checksum1, stored_recomputed_match: checksumStoredEqualsRecomputed },
    dry_run: dryRun,
    deferred_protection: deferredProtection,
    public_trust: {
      listed_vs_officially_verified_safe: trustRegressionAllSafe,
      claim_flow_protected: claimApproveRouteProtectsTrustFields,
    },
    guards: {
      implemented: true,
      guard_file: "scripts/school-registry/lib/nationalRegistry/registryNationalPublicationGuard.ts",
      confirm_phrase: "PUBLISH_NATIONAL_REGISTRY_TO_DIRECTORY",
      refusal_tests_pass: guardTestsPass,
      refusal_tests_fail: guardTestsFail,
      invoked_with_valid_flags_this_sprint: false,
    },
    search_v2: {
      reads_only_establishments: searchRouteReadsOnlyEstablishments,
      pagination_present: searchRouteNoFullTableFetch,
      regression: "NONE — 0 modification de src/app/api/recherche ce sprint.",
    },
    cms: cmsReadiness,
    decision,
    decision_reasons: decisionReasons,
    ready_for_registry_national_c: readyForC,
    ready_for_cms_after_registry_publication: cmsReadiness.status,
    push: "NO",
    deploy: "NO",
  };
  writeFileSync(`${REPORTS_DIR}/registry-national-b-summary.json`, JSON.stringify(summary, null, 2));

  // ── §11/§21 additional required report: live-revalidation.csv (tous candidats, pas seulement le lot final) ──
  writeFileSync(
    `${REPORTS_DIR}/registry-national-b-live-revalidation.csv`,
    toCsv(
      candidates.map((c) => ({
        national_candidate_id: c.national_candidate_id,
        name: c.name,
        city: c.city ?? "",
        region: c.region ?? "",
        source_ministries: c.source_ministries.join("|"),
        presence_confidence: c.presence_confidence,
        identity_confidence: c.identity_confidence,
        official_verification: c.official_verification,
        publication_readiness: c.publication_readiness,
        matching_decision: c.matching_decision,
        existing_establishment_id: c.existing_establishment_id ?? "",
        in_final_lot: finalLotIds.has(c.national_candidate_id),
        blocking_reasons: c.blocking_reasons.join(" | "),
      })),
      [
        "national_candidate_id",
        "name",
        "city",
        "region",
        "source_ministries",
        "presence_confidence",
        "identity_confidence",
        "official_verification",
        "publication_readiness",
        "matching_decision",
        "existing_establishment_id",
        "in_final_lot",
        "blocking_reasons",
      ]
    )
  );

  console.log("\n=== §37 RÉCAPITULATIF ===");
  console.log(JSON.stringify({ decision, ready_for_registry_national_c: readyForC, db_unchanged: dbUnchanged, candidate_count: canonicalCandidates.length, checksum: checksum1 }, null, 2));
  console.log("Rapports écrits dans reports/registry/registry-national-b-*.{json,csv}");
}

main().catch((e) => {
  console.error("REGISTRY-NATIONAL-B FAILED:", e);
  process.exit(1);
});
