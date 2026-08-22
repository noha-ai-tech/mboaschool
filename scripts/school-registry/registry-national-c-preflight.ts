/**
 * SPRINT REGISTRY-NATIONAL-C — CONTROLLED NATIONAL PUBLICATION EXECUTION.
 * PREFLIGHT / DRY-RUN ONLY — CE SCRIPT N'EFFECTUE AUCUNE ÉCRITURE SUPABASE.
 *
 * Modélisé directement sur registry-national-b-build.ts (REGISTRY-NATIONAL-B,
 * commit c5ee2c8) : RECALCULE ENTIÈREMENT l'univers national publiable
 * depuis l'état live ACTUEL (jamais une copie de B), puis compare le
 * résultat frais au snapshot d'approbation déjà figé et triple-vérifié par
 * B (reports/registry/registry-national-b-approval.json). Ce script
 * n'écrit JAMAIS un nouveau snapshot d'approbation — B reste la seule
 * source de vérité du lot approuvé (§6 du brief C : "STOP. Do not
 * regenerate a new snapshot and continue in the same execution sprint.").
 *
 * Sections du brief REGISTRY-NATIONAL-C couvertes ici : §2 (opérateur),
 * §4 (repo safety), §5 (baseline live fraîche), §6 (triple vérification du
 * snapshot), §7 (reconstruction indépendante de la population éligible —
 * ne force jamais 3), §8 (revalidation de confiance), §9 (défauts de
 * sécurité des futures lignes), §10 (matching frais live+staging+lot),
 * §11 (revalidation inter-ministérielle), §12 (audit des champs requis
 * contre le schéma LIVE), §13 (audit slug), §14 (audit PII), §15 (dry-run
 * final), §16 (protection de la population différée), §17 (garde-fou —
 * tests de refus en conditions réelles). §18 (porte d'approbation humaine)
 * et au-delà (§19-§30, exécution réelle) sont HORS PÉRIMÈTRE de ce script
 * — voir registry-national-c-publish.ts (jamais invoqué avec --commit ce
 * sprint).
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
import {
  computeRegistryNationalApprovalChecksum,
  assertRegistryNationalPublicationAllowed,
  RegistryNationalPublicationRefused,
  REGISTRY_NATIONAL_B_CONFIRM_PHRASE,
  EXPECTED_PROJECT_REF,
  type RegistryNationalApprovalChecksumRow,
} from "./lib/nationalRegistry/registryNationalPublicationGuard";
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

const BLOCKING_REQUIRED_FIELDS = ["name", "slug", "main_category"] as const;

async function main() {
  mkdirSync(REPORTS_DIR, { recursive: true });

  // ── §2 OPERATOR IDENTITY ─────────────────────────────────────────────────
  // Le username git ("ndjm2020-pixel") est une identité GIT/GITHUB, jamais
  // reprise silencieusement comme identité opérationnelle humaine (erreur
  // constatée dans registry-national-b-summary.json §2 du brief C). Le
  // dépôt documente de façon quasi-unanime (>60 rapports reports/registry/
  // *.json, tous sprints MINSANTE/MINESUP/MINEFOP/Transport/REGISTRY-
  // NATIONAL-A confondus) l'opérateur humain du projet comme "jean-merlain"
  // — seule REGISTRY-NATIONAL-B a dérivé, et REGISTRY-NATIONAL-A.1 a
  // documenté "Claude Code (agent SDK)" pour un run explicitement autonome
  // sans opérateur humain nommé. Ce sprint applique la convention majoritaire
  // documentée plutôt qu'un raccourci git.
  const gitUserName = (() => {
    try {
      return git("config user.name");
    } catch {
      return "UNAVAILABLE";
    }
  })();
  const OPERATOR = "jean-merlain";
  console.log(`§2 opérateur : git config user.name="${gitUserName}" (identité GIT — jamais réutilisée comme opérateur). Opérateur retenu ce sprint (convention majoritaire du dépôt, §2 du brief) : "${OPERATOR}".`);

  // ── §4 REPOSITORY SAFETY ─────────────────────────────────────────────────
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

  // ── §5 FRESH LIVE DATABASE BASELINE ─────────────────────────────────────
  const { count: establishmentsTotalBefore } = await supabase.from("establishments").select("*", { count: "exact", head: true });
  const { count: stagingTotalBefore } = await supabase.from("establishment_import_staging").select("*", { count: "exact", head: true });
  const { count: registryIdentifiersTotalBefore } = await supabase.from("establishment_registry_identifiers").select("*", { count: "exact", head: true });
  console.log(`§5 baseline live fraîche : establishments=${establishmentsTotalBefore} staging=${stagingTotalBefore} registry_identifiers=${registryIdentifiersTotalBefore} (historique B pour référence uniquement : 2249/2378/2242 — jamais forcé).`);

  // ── §6 LOAD + TRIPLE-VERIFY APPROVAL SNAPSHOT (B reste la seule source) ──
  const approvalPath = `${REPORTS_DIR}/registry-national-b-approval.json`;
  const approvalSnapshot = JSON.parse(readFileSync(approvalPath, "utf-8"));
  const EXPECTED_HISTORICAL_COUNT = 3;
  const EXPECTED_HISTORICAL_CHECKSUM = "c22e1b88e1cb1026f0115d7d118abcccc4a832bb3375e9fd62e7ed754f7849ce";
  const snapshotChecksumRows: RegistryNationalApprovalChecksumRow[] = approvalSnapshot.candidates.map((r: any) => ({
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
  const recomputedSnapshotChecksum = computeRegistryNationalApprovalChecksum(snapshotChecksumRows);
  const checksumTripleVerified =
    approvalSnapshot.checksum_sha256 === EXPECTED_HISTORICAL_CHECKSUM &&
    recomputedSnapshotChecksum === EXPECTED_HISTORICAL_CHECKSUM &&
    approvalSnapshot.checksum_sha256 === recomputedSnapshotChecksum &&
    approvalSnapshot.candidate_count === EXPECTED_HISTORICAL_COUNT;
  console.log(
    `§6 triple vérification snapshot B : expected=${EXPECTED_HISTORICAL_CHECKSUM.slice(0, 12)}… stored=${approvalSnapshot.checksum_sha256.slice(0, 12)}… recomputed=${recomputedSnapshotChecksum.slice(0, 12)}… candidate_count=${approvalSnapshot.candidate_count} — MATCH=${checksumTripleVerified}.`
  );
  if (!checksumTripleVerified) {
    const failReport = {
      sprint: "REGISTRY-NATIONAL-C",
      generated_at: new Date().toISOString(),
      stage: "§6 SNAPSHOT TRIPLE VERIFICATION",
      decision: "C",
      decision_label: "SNAPSHOT_OR_ELIGIBILITY_DRIFT",
      expected_checksum: EXPECTED_HISTORICAL_CHECKSUM,
      stored_checksum: approvalSnapshot.checksum_sha256,
      recomputed_checksum: recomputedSnapshotChecksum,
      note: "STOP §6 — divergence détectée entre expected/stored/recomputed. Aucun nouveau snapshot régénéré dans ce run (interdiction explicite §6 du brief C).",
    };
    writeFileSync(`${REPORTS_DIR}/registry-national-c-preflight.json`, JSON.stringify(failReport, null, 2));
    console.error("STOP §6 — SNAPSHOT_OR_ELIGIBILITY_DRIFT. Voir registry-national-c-preflight.json.");
    process.exit(1);
  }

  // ── §7 REBUILD — recalcule ENTIÈREMENT (jamais copié) l'univers national ─
  // Même méthode canonique que REGISTRY-NATIONAL-A/B (§11 du brief C :
  // "aucun second moteur créé"). Reconstruit tout l'univers, jamais
  // seulement les 3 candidats snapshot, pour pouvoir détecter un nouveau
  // candidat CREATE_* apparu depuis B (qui romprait aussi l'égalité "lot
  // final == snapshot" ci-dessous).
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

  const allRegistryIdentifiers = await fetchAllPaginated<RegistryIdentifierRow>(
    supabase,
    "establishment_registry_identifiers",
    "id,establishment_id,authority,registry,identifier,identifier_type,verification_status"
  );
  const identifiersByEstablishment = new Map<string, RegistryIdentifierRow[]>();
  for (const r of allRegistryIdentifiers) {
    if (!identifiersByEstablishment.has(r.establishment_id)) identifiersByEstablishment.set(r.establishment_id, []);
    identifiersByEstablishment.get(r.establishment_id)!.push(r);
  }

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

  console.log(`§7 Univers reconstruit FRAIS (jamais copié de B) : ${candidates.length} candidats nationaux.`);

  // ── §11 CROSS-MINISTRY RECHECK ──────────────────────────────────────────
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
    `${REPORTS_DIR}/registry-national-c-cross-ministry.csv`,
    toCsv(crossMinistryRows, ["candidate_a", "candidate_a_name", "candidate_b", "candidate_b_name", "ministries", "name_similarity", "geo_agreement", "identifier_evidence", "recommended_resolution"])
  );
  console.log(`§11 cross-ministry (frais) : ${crossMinistryRows.length} ligne(s) de chevauchement inter-ministériel détectée(s).`);

  // ── §14 PII AUDIT ────────────────────────────────────────────────────────
  const piiCandidates = candidates.filter((c) => c.pii_detected);
  writeFileSync(
    `${REPORTS_DIR}/registry-national-c-pii-audit.json`,
    JSON.stringify({ sprint: "REGISTRY-NATIONAL-C", generated_at: new Date().toISOString(), PII_CANDIDATES: piiCandidates.map((c) => c.national_candidate_id), PII_FIELDS: [...new Set(piiCandidates.flatMap((c) => c.pii_fields))], BLOCKED_BY_PII: piiCandidates.length }, null, 2)
  );
  console.log(`§14 PII : ${piiCandidates.length} candidat(s) bloqué(s).`);

  // ── §12 REQUIRED FIELD AUDIT (schéma live, introspection OpenAPI fraîche) ─
  let openapiRequired: string[] = [];
  try {
    const res = await fetch(`${url}/rest/v1/`, { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, Accept: "application/openapi+json" } });
    const openapi = await res.json();
    openapiRequired = openapi?.definitions?.establishments?.required ?? [];
  } catch (e) {
    console.warn(`§12 introspection OpenAPI échouée (documenté, non fabriqué) : ${(e as Error).message}`);
  }
  const requiredFieldsMatchExpected = BLOCKING_REQUIRED_FIELDS.every((f) => openapiRequired.includes(f));
  function requiredFieldsOk(c: NationalCandidate): { ok: boolean; missing: string[] } {
    const missing: string[] = [];
    if (!c.name || !c.name.trim()) missing.push("name");
    const proposedSlug = c.name ? slugify(c.name) : "";
    if (!proposedSlug) missing.push("slug");
    if (!c.main_category) missing.push("main_category");
    return { ok: missing.length === 0, missing };
  }
  const blockedRequiredField = candidates.filter((c) => (c.publication_readiness === "CREATE_OFFICIALLY_VERIFIED" || c.publication_readiness === "CREATE_PUBLISHABLE_UNVERIFIED") && !requiredFieldsOk(c).ok);
  console.log(`§12 required fields (live OpenAPI) : requis=${JSON.stringify(openapiRequired)} matches_expected=${requiredFieldsMatchExpected}. ${blockedRequiredField.length} candidat(s) CREATE_* bloqué(s) (attendu 0).`);

  // ── §13 SLUG AUDIT ───────────────────────────────────────────────────────
  const existingLiveSlugs = new Set(allLiveEst.map((e) => e.slug).filter(Boolean) as string[]);
  const createCandidatesPreSlug = candidates.filter(
    (c) => (c.publication_readiness === "CREATE_OFFICIALLY_VERIFIED" || c.publication_readiness === "CREATE_PUBLISHABLE_UNVERIFIED") && requiredFieldsOk(c).ok
  );
  const slugResults = slugDryRun(
    createCandidatesPreSlug.map((c) => ({ candidateId: c.national_candidate_id, name: c.name })),
    existingLiveSlugs
  );
  const slugBlockedIds = new Set(slugResults.filter((r) => !r.valid).map((r) => r.candidateId));
  writeFileSync(
    `${REPORTS_DIR}/registry-national-c-slug-audit.csv`,
    toCsv(
      slugResults.map((r) => ({ candidate_id: r.candidateId, proposed_slug: r.proposedSlug, existing_collision: r.existingCollision, batch_collision_with: r.batchCollisionWith.join("|"), valid: r.valid })),
      ["candidate_id", "proposed_slug", "existing_collision", "batch_collision_with", "valid"]
    )
  );
  console.log(`§13 slugs : ${slugResults.filter((r) => r.valid).length} valides / ${slugResults.filter((r) => r.existingCollision).length} collisions live / ${slugResults.filter((r) => r.batchCollisionWith.length > 0).length} collisions intra-lot (attendu historique : 0/0).`);

  // ── §7 (suite) LOT FINAL FRAIS ──────────────────────────────────────────
  const finalLot = candidates.filter((c) => {
    if (c.publication_readiness !== "CREATE_OFFICIALLY_VERIFIED" && c.publication_readiness !== "CREATE_PUBLISHABLE_UNVERIFIED") return false;
    if (!requiredFieldsOk(c).ok) return false;
    if (slugBlockedIds.has(c.national_candidate_id)) return false;
    if (c.pii_detected) return false;
    return true;
  });
  const freshEligibleCount = finalLot.length;
  console.log(`§7 lot final FRAIS (post-revalidation, jamais forcé à 3) : ${freshEligibleCount} candidat(s).`);

  // ── §7 COMPARAISON AU SNAPSHOT APPROUVÉ (identité de lot, pas seulement compte) ──
  const freshIds = new Set<string>(finalLot.map((c) => c.national_candidate_id));
  const snapshotIds = new Set<string>(approvalSnapshot.candidates.map((c: any) => c.national_candidate_id as string));
  const missingFromFresh = [...snapshotIds].filter((id) => !freshIds.has(id)); // approuvé mais plus éligible maintenant
  const newSinceSnapshot = [...freshIds].filter((id) => !snapshotIds.has(id)); // éligible maintenant mais pas dans le snapshot approuvé
  const eligibilityPopulationStable = freshEligibleCount === EXPECTED_HISTORICAL_COUNT && missingFromFresh.length === 0 && newSinceSnapshot.length === 0;
  console.log(`§7 comparaison au snapshot : fresh=${freshEligibleCount} snapshot=${EXPECTED_HISTORICAL_COUNT} missing_from_fresh=${JSON.stringify(missingFromFresh)} new_since_snapshot=${JSON.stringify(newSinceSnapshot)} STABLE=${eligibilityPopulationStable}.`);

  if (!eligibilityPopulationStable) {
    const driftReport = {
      sprint: "REGISTRY-NATIONAL-C",
      generated_at: new Date().toISOString(),
      stage: "§7 FRESH ELIGIBLE POPULATION REBUILD",
      decision: "C",
      decision_label: "SNAPSHOT_OR_ELIGIBILITY_DRIFT",
      fresh_eligible_count: freshEligibleCount,
      snapshot_count: EXPECTED_HISTORICAL_COUNT,
      missing_from_fresh: missingFromFresh,
      new_since_snapshot: newSinceSnapshot,
      note: "STOP §7 — la population éligible fraîche diverge du snapshot approuvé REGISTRY-NATIONAL-B. Le compte attendu n'a JAMAIS été ajusté pour faire correspondre ce résultat (interdiction explicite §7 du brief C) — NEW_REVIEW_REQUIRED.",
    };
    writeFileSync(`${REPORTS_DIR}/registry-national-c-preflight.json`, JSON.stringify(driftReport, null, 2));
    console.error("STOP §7 — SNAPSHOT_OR_ELIGIBILITY_DRIFT (NEW_REVIEW_REQUIRED). Voir registry-national-c-preflight.json.");
    process.exit(1);
  }

  // ── §8 TRUST REVALIDATION invariants ────────────────────────────────────
  const officiallyVerifiedInLot = finalLot.filter((c) => c.publication_readiness === "CREATE_OFFICIALLY_VERIFIED");
  const publishableUnverifiedInLot = finalLot.filter((c) => c.publication_readiness === "CREATE_PUBLISHABLE_UNVERIFIED");
  const publishableUnverifiedButOfficiallyVerifiedFlag = publishableUnverifiedInLot.filter((c) => c.official_verification === "OFFICIALLY_VERIFIED");
  const tier3OfficiallyVerified = officiallyVerifiedInLot.filter((c) => c.source_tiers.every((t) => t.startsWith("TIER_3")));
  if (publishableUnverifiedButOfficiallyVerifiedFlag.length > 0) throw new Error(`INVARIANT VIOLÉ §8 — ${publishableUnverifiedButOfficiallyVerifiedFlag.length} candidat(s) CREATE_PUBLISHABLE_UNVERIFIED avec official_verification=OFFICIALLY_VERIFIED.`);
  if (tier3OfficiallyVerified.length > 0) throw new Error(`INVARIANT VIOLÉ §8 — ${tier3OfficiallyVerified.length} candidat(s) Tier-3-only en CREATE_OFFICIALLY_VERIFIED.`);
  console.log(`§8 invariants OK : 0 candidat Tier-3-only OFFICIALLY_VERIFIED, 0 candidat PUBLISHABLE_UNVERIFIED avec official_verification=OFFICIALLY_VERIFIED. Lot=${officiallyVerifiedInLot.length} officially_verified / ${publishableUnverifiedInLot.length} publishable_unverified (attendu historique : 0/3).`);

  // ── §8 (suite) SIMULATION RÉELLE resolveEstablishmentTrustState() ──────
  const trustSimulations = finalLot
    .filter((c) => c.publication_readiness === "CREATE_PUBLISHABLE_UNVERIFIED")
    .map((c) => {
      const input: EstablishmentTrustInput = {
        isVerified: false,
        ownerId: null,
        isClaimed: false,
        verificationStatus: "referenced",
        officialId: null,
        sourceMinistry: c.source_ministries[0] ?? null,
        registryIdentifierVerificationStatuses: [],
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
  console.log(`§8 trust regression : ${trustSimulations.length} simulation(s), all_safe=${trustRegressionAllSafe}, distribution=${JSON.stringify(officialVerificationDistribution)} (OFFICIAL_SOURCE_FOUND toléré comme état prudent documenté, JAMAIS OFFICIALLY_VERIFIED).`);
  const noOfficiallyVerifiedLeak = trustSimulations.every((s) => s.official_verification !== "OFFICIALLY_VERIFIED");

  // ── §16 DEFERRED POPULATION PROTECTION ──────────────────────────────────
  const excludedReadinessCategories = ["DUPLICATE_REVIEW", "IDENTITY_REVIEW", "SOURCE_REVIEW", "CATEGORY_REVIEW", "CONFLICT_REVIEW", "DEFERRED"];
  const excludedCandidates = candidates.filter((c) => excludedReadinessCategories.includes(c.publication_readiness));
  const finalLotIds = new Set(finalLot.map((c) => c.national_candidate_id));
  const excludedLeakedIntoSnapshot = excludedCandidates.filter((c) => finalLotIds.has(c.national_candidate_id));
  const excludedLeakedIntoApprovedSnapshot = excludedCandidates.filter((c) => snapshotIds.has(c.national_candidate_id));
  const deferredProtection = {
    sprint: "REGISTRY-NATIONAL-C",
    generated_at: new Date().toISOString(),
    duplicate_review_excluded: excludedCandidates.filter((c) => c.publication_readiness === "DUPLICATE_REVIEW").length,
    identity_review_excluded: excludedCandidates.filter((c) => c.publication_readiness === "IDENTITY_REVIEW").length,
    source_review_excluded: excludedCandidates.filter((c) => c.publication_readiness === "SOURCE_REVIEW").length,
    category_review_excluded: excludedCandidates.filter((c) => c.publication_readiness === "CATEGORY_REVIEW").length,
    conflict_review_excluded: excludedCandidates.filter((c) => c.publication_readiness === "CONFLICT_REVIEW").length,
    deferred_excluded: excludedCandidates.filter((c) => c.publication_readiness === "DEFERRED").length,
    also_excluded_defensive: { blocked_required_field: blockedRequiredField.length, blocked_slug_collision: slugResults.filter((r) => !r.valid).length },
    total_excluded_population: excludedCandidates.length,
    historical_reference_only_b: { duplicate_review: 8, identity_review: 2, source_review: 6, category_review: 10, deferred: 5, note: "Référence historique B UNIQUEMENT — jamais supposée inchangée, comptée fraîche ci-dessus." },
    leaked_into_fresh_final_lot: excludedLeakedIntoSnapshot.map((c) => c.national_candidate_id),
    leaked_into_approved_snapshot: excludedLeakedIntoApprovedSnapshot.map((c) => c.national_candidate_id),
    protection_verified: excludedLeakedIntoSnapshot.length === 0 && excludedLeakedIntoApprovedSnapshot.length === 0,
  };
  writeFileSync(`${REPORTS_DIR}/registry-national-c-deferred-protection.json`, JSON.stringify(deferredProtection, null, 2));
  if (!deferredProtection.protection_verified) {
    console.error(`STOP §16 — fuite détectée (candidat exclu apparu dans le lot final frais et/ou le snapshot approuvé).`);
  }
  console.log(`§16 deferred protection : ${excludedCandidates.length} candidat(s) exclu(s) au total (frais), 0 fuite=${deferredProtection.protection_verified}.`);

  // ── §15 FINAL DRY RUN ────────────────────────────────────────────────────
  const wouldInsertEstablishments = finalLot.length;
  const dryRun = {
    sprint: "REGISTRY-NATIONAL-C",
    generated_at: new Date().toISOString(),
    note: "DRY-RUN ARITHMÉTIQUE + STRUCTUREL UNIQUEMENT — 0 écriture DB effectuée par ce script (preflight/dry-run only, no commit).",
    establishments_before: establishmentsTotalBefore,
    snapshot_candidate_count: approvalSnapshot.candidate_count,
    fresh_eligible_count: freshEligibleCount,
    already_live: candidates.filter((c) => c.publication_readiness === "ALREADY_LIVE").length,
    conflicts: candidates.filter((c) => c.publication_readiness === "CONFLICT_REVIEW").length,
    would_insert_establishments: wouldInsertEstablishments,
    would_update: 0,
    would_delete: 0,
    would_insert_registry_identifiers: 0,
    would_assign_owners: 0,
    would_set_verified_true: 0,
    expected_establishments_after: (establishmentsTotalBefore ?? 0) + wouldInsertEstablishments,
    insert_only_invariant_holds: true,
  };
  writeFileSync(`${REPORTS_DIR}/registry-national-c-dry-run.json`, JSON.stringify(dryRun, null, 2));
  console.log(`§15 dry-run FINAL : would_insert=${wouldInsertEstablishments} expected_after=${dryRun.expected_establishments_after}.`);

  // ── §17 GUARD REFUSAL TESTS — fichier de tests dédié (réutilisé tel quel) ──
  console.log("\n§17 exécution des tests de refus du garde-fou dédié (0 écriture DB, node:test)...");
  let guardTestsOutput = "";
  try {
    guardTestsOutput = execSync("npx tsx --test scripts/school-registry/lib/nationalRegistry/__tests__/registryNationalPublicationGuard.test.ts", { cwd: ROOT, encoding: "utf-8" });
  } catch (e) {
    guardTestsOutput = (e as { stdout?: string }).stdout ?? String(e);
  }
  const passMatch = guardTestsOutput.match(/ℹ pass (\d+)/);
  const failMatch = guardTestsOutput.match(/ℹ fail (\d+)/);
  const guardTestsPass = passMatch ? Number(passMatch[1]) : -1;
  const guardTestsFail = failMatch ? Number(failMatch[1]) : -1;

  // ── §17 (suite) — refus EN CONDITIONS RÉELLES : appel direct du garde-fou
  // avec les valeurs FRAÎCHEMENT CALCULÉES ce sprint (pas des fixtures), et
  // avec les flags exacts que recevrait une VRAIE tentative d'exécution.
  const realFreshRequestBase = {
    projectRef,
    operator: OPERATOR,
    expectedCandidateCount: approvalSnapshot.candidate_count,
    actualCandidateCount: freshEligibleCount,
    approvalChecksum: approvalSnapshot.checksum_sha256,
    recomputedChecksum: recomputedSnapshotChecksum,
    storedSnapshotChecksum: approvalSnapshot.checksum_sha256,
    freshAlreadyLiveCount: 0,
    freshDuplicateSignalCount: crossMinistryRows.filter((r) => (r.recommended_resolution === "CONFLICT" || r.recommended_resolution === "SAME_INSTITUTION") && (finalLotIds.has(r.candidate_a as string) || finalLotIds.has(r.candidate_b as string))).length,
    freshMissingRequiredFieldCount: 0,
    freshTier3OfficiallyVerifiedCount: tier3OfficiallyVerified.length,
    freshPiiDetectedCount: finalLot.filter((c) => c.pii_detected).length,
    registryIdentifiersToInsert: 0,
  };
  interface RealConditionScenario {
    label: string;
    letter: string;
    overrides: Record<string, unknown>;
  }
  const realConditionScenarios: RealConditionScenario[] = [
    { label: "sans --commit (état réel de ce sprint — aucune approbation humaine distincte fournie)", letter: "A", overrides: { commit: false, confirmPhrase: REGISTRY_NATIONAL_B_CONFIRM_PHRASE, approvedBy: "Eddy" } },
    { label: "wrong project ref", letter: "B", overrides: { commit: true, confirmPhrase: REGISTRY_NATIONAL_B_CONFIRM_PHRASE, projectRef: "wrong-project-ref", approvedBy: "Eddy" } },
    { label: "wrong candidate count (dérive simulée)", letter: "C", overrides: { commit: true, confirmPhrase: REGISTRY_NATIONAL_B_CONFIRM_PHRASE, actualCandidateCount: freshEligibleCount + 1, approvedBy: "Eddy" } },
    { label: "wrong checksum", letter: "D", overrides: { commit: true, confirmPhrase: REGISTRY_NATIONAL_B_CONFIRM_PHRASE, approvalChecksum: "deadbeef".repeat(8), approvedBy: "Eddy" } },
    { label: "wrong confirm phrase", letter: "E", overrides: { commit: true, confirmPhrase: "PROMOTE_REGISTRY_TO_PRODUCTION", approvedBy: "Eddy" } },
    { label: "missing operator", letter: "F", overrides: { commit: true, confirmPhrase: REGISTRY_NATIONAL_B_CONFIRM_PHRASE, operator: undefined, approvedBy: "Eddy" } },
    { label: "missing approved-by (état réel de ce sprint — aucune approbation nommée distincte reçue)", letter: "G", overrides: { commit: true, confirmPhrase: REGISTRY_NATIONAL_B_CONFIRM_PHRASE, approvedBy: undefined } },
    { label: "self-approval (operator === approved-by)", letter: "H", overrides: { commit: true, confirmPhrase: REGISTRY_NATIONAL_B_CONFIRM_PHRASE, approvedBy: OPERATOR } },
  ];
  const realConditionResults = realConditionScenarios.map((sc) => {
    const req = { ...realFreshRequestBase, commit: true, confirmPhrase: REGISTRY_NATIONAL_B_CONFIRM_PHRASE, approvedBy: undefined, ...sc.overrides } as Parameters<typeof assertRegistryNationalPublicationAllowed>[0];
    try {
      assertRegistryNationalPublicationAllowed(req);
      return { letter: sc.letter, label: sc.label, refused: false, message: "AUCUN REFUS — ANOMALIE" };
    } catch (e) {
      const refused = e instanceof RegistryNationalPublicationRefused;
      return { letter: sc.letter, label: sc.label, refused, message: (e as Error).message };
    }
  });
  const allRealConditionScenariosRefused = realConditionResults.every((r) => r.refused);
  writeFileSync(
    `${REPORTS_DIR}/registry-national-c-guard-tests.json`,
    JSON.stringify(
      {
        sprint: "REGISTRY-NATIONAL-C",
        generated_at: new Date().toISOString(),
        fixture_test_file: "scripts/school-registry/lib/nationalRegistry/__tests__/registryNationalPublicationGuard.test.ts (réutilisé tel quel, même garde-fou §17 du brief C)",
        fixture_tests_pass: guardTestsPass,
        fixture_tests_fail: guardTestsFail,
        real_condition_scenarios_note: "Refus testés EN CONDITIONS RÉELLES (valeurs calculées fraîches ce sprint : projectRef live, operator='jean-merlain', checksum recalculé, actualCandidateCount frais, etc.) — pas seulement des fixtures génériques.",
        real_condition_scenarios: realConditionResults,
        all_real_condition_scenarios_refused: allRealConditionScenariosRefused,
        guard_invoked_with_fully_valid_flags_and_commit_this_sprint: false,
      },
      null,
      2
    )
  );
  console.log(`§17 guard tests : fixtures pass=${guardTestsPass} fail=${guardTestsFail}. Scénarios conditions réelles : ${realConditionResults.length}, tous refusés=${allRealConditionScenariosRefused}.`);

  // ── §30 CMS READINESS RECHECK ────────────────────────────────────────────
  let claimApproveSrcForCms = "";
  try {
    claimApproveSrcForCms = readFileSync(`${ROOT}/src/app/api/admin/claims/[id]/approve/route.ts`, "utf-8");
  } catch {
    /* documenté */
  }
  const cmsReadiness = {
    sprint: "REGISTRY-NATIONAL-C",
    generated_at: new Date().toISOString(),
    registry_protected_fields_still_protected: !/source_ministry\s*[:=]|official_verification\s*[:=]|registry_identifier/i.test(claimApproveSrcForCms.replace(/\/\/.*$/gm, "")),
    new_blocker_introduced_by_this_sprint: false,
    status: "PARTIAL",
    remaining_blockers: [
      "Aucune colonne dédiée official_verification/platform_verification n'existe encore sur establishments — un CMS complet devra continuer de dériver ces champs à la volée ou introduire une migration (hors périmètre de ce sprint).",
      "Le flux claim/verify générique n'a pas été retravaillé au-delà de A.1 — un CMS self-service pour le propriétaire devra confirmer, avant construction, qu'aucun champ de confiance protégé n'est exposé en écriture.",
      "Ce sprint (REGISTRY-NATIONAL-C) n'a effectué AUCUNE écriture (decision B/C/D/E/F, jamais A) — aucun nouvel établissement réel n'existe encore à administrer via un CMS.",
    ],
  };
  writeFileSync(`${REPORTS_DIR}/registry-national-c-cms-readiness.json`, JSON.stringify(cmsReadiness, null, 2));

  // ── LIVE REVALIDATION CSV (tous candidats) ──────────────────────────────
  writeFileSync(
    `${REPORTS_DIR}/registry-national-c-live-revalidation.csv`,
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
        in_fresh_final_lot: finalLotIds.has(c.national_candidate_id),
        in_approved_snapshot: snapshotIds.has(c.national_candidate_id),
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
        "in_fresh_final_lot",
        "in_approved_snapshot",
        "blocking_reasons",
      ]
    )
  );

  // ── §33 DATABASE FINAL RECHECK (0 écriture attendue) ────────────────────
  const { count: establishmentsTotalAfter } = await supabase.from("establishments").select("*", { count: "exact", head: true });
  const { count: stagingTotalAfter } = await supabase.from("establishment_import_staging").select("*", { count: "exact", head: true });
  const { count: registryIdentifiersTotalAfter } = await supabase.from("establishment_registry_identifiers").select("*", { count: "exact", head: true });
  const deltaEstablishments = (establishmentsTotalAfter ?? 0) - (establishmentsTotalBefore ?? 0);
  const deltaStaging = (stagingTotalAfter ?? 0) - (stagingTotalBefore ?? 0);
  const deltaRegistryIdentifiers = (registryIdentifiersTotalAfter ?? 0) - (registryIdentifiersTotalBefore ?? 0);
  const dbUnchanged = deltaEstablishments === 0 && deltaStaging === 0 && deltaRegistryIdentifiers === 0;
  console.log(`\n§33 recheck final : delta establishments=${deltaEstablishments} staging=${deltaStaging} registry_identifiers=${deltaRegistryIdentifiers}. DB_UNCHANGED=${dbUnchanged}.`);

  // ── §18/§33 DECISION GATE ────────────────────────────────────────────────
  // L'AUTORISATION HUMAINE EXPLICITE (§18 du brief C) N'A PAS ÉTÉ FOURNIE
  // dans ce sprint : le brief lui-même n'est PAS une approbation (§18,
  // littéral), et aucun message séparé et distinct au format "Je, <nom>,
  // autorise explicitement la publication..." référençant REGISTRY-
  // NATIONAL-C + le compte exact + le checksum exact + l'opérateur + un
  // approbateur distinct n'a été reçu. Codé en dur à false, jamais déduit.
  const explicitDistinctHumanApprovalReceivedThisSprint = false;

  let decision: "A" | "B" | "C" | "D" | "E" | "F" = "B";
  const decisionReasons: string[] = [];
  if (!dbUnchanged) {
    decision = "F";
    decisionReasons.push("SAFETY_FAILURE — delta DB non nul détecté au recheck final (ce script ne devrait jamais écrire).");
  } else if (!checksumTripleVerified) {
    decision = "C";
    decisionReasons.push("SNAPSHOT_OR_ELIGIBILITY_DRIFT — triple vérification checksum §6 échouée.");
  } else if (!eligibilityPopulationStable) {
    decision = "C";
    decisionReasons.push("SNAPSHOT_OR_ELIGIBILITY_DRIFT — population éligible fraîche §7 diverge du snapshot approuvé.");
  } else if (!deferredProtection.protection_verified) {
    decision = "F";
    decisionReasons.push("SAFETY_FAILURE — fuite de population différée détectée §16.");
  } else if (!trustRegressionAllSafe || !noOfficiallyVerifiedLeak) {
    decision = "E";
    decisionReasons.push("PUBLIC_TRUST_REGRESSION — au moins une simulation §8 produit un badge OFFICIALLY_VERIFIED ou un libellé 'Vérifié' ambigu, ou official_verification=OFFICIALLY_VERIFIED sans preuve indépendante.");
  } else if (blockedRequiredField.length > 0 || slugResults.some((r) => !r.valid)) {
    decision = "C";
    decisionReasons.push(`SNAPSHOT_OR_ELIGIBILITY_DRIFT — ${blockedRequiredField.length} champ(s) requis manquant(s) et/ou ${slugResults.filter((r) => !r.valid).length} collision(s) de slug détectée(s) depuis l'approbation.`);
  } else if (!allRealConditionScenariosRefused || guardTestsFail !== 0) {
    decision = "F";
    decisionReasons.push("SAFETY_FAILURE — au moins un scénario de refus du garde-fou n'a pas été refusé comme attendu, ou les tests de garde-fou fixtures échouent.");
  } else if (!explicitDistinctHumanApprovalReceivedThisSprint) {
    decision = "B";
    decisionReasons.push(
      "WAITING_FOR_HUMAN_APPROVAL — §18 du brief C : le brief lui-même n'est pas une approbation, et aucune approbation humaine explicite, nommée et distincte (référençant REGISTRY-NATIONAL-C, le compte exact, le checksum exact, l'opérateur et un approbateur distinct) n'a été reçue dans ce sprint. Toutes les autres conditions de sécurité (§6/§7/§8/§11/§12/§13/§14/§16/§17) sont satisfaites."
    );
  } else {
    decision = "A";
    decisionReasons.push("Toutes les conditions réunies : snapshot triple-vérifié, population éligible stable, matching frais sûr, 0 doublon/identité/catégorie/PII/slug bloquant, sémantique de confiance publique sûre, garde-fou testé en conditions réelles, dry-run cohérent, DB inchangée, approbation humaine explicite distincte reçue.");
  }
  const readyForExecution = decision === "A";

  const preflight = {
    sprint: "REGISTRY-NATIONAL-C",
    generated_at: new Date().toISOString(),
    scope: "PREFLIGHT/DRY-RUN ONLY — NO COMMIT. Sections 4-17 du brief exécutées intégralement ; §18+ (approbation, exécution réelle) hors périmètre de ce script.",
    team: { operator: OPERATOR, git_user_name_not_used_as_operator: gitUserName, repository: "mboaschool", branch, head, noha_main: nohaMain, project_ref: projectRef },
    database_baseline: { establishments: establishmentsTotalBefore, staging: stagingTotalBefore, registry_identifiers: registryIdentifiersTotalBefore },
    snapshot_triple_verification: {
      source: "reports/registry/registry-national-b-approval.json",
      expected_checksum: EXPECTED_HISTORICAL_CHECKSUM,
      stored_checksum: approvalSnapshot.checksum_sha256,
      recomputed_checksum: recomputedSnapshotChecksum,
      candidate_count: approvalSnapshot.candidate_count,
      valid: checksumTripleVerified,
    },
    fresh_eligibility_rebuild: {
      fresh_total_universe: candidates.length,
      fresh_eligible_count: freshEligibleCount,
      snapshot_count: EXPECTED_HISTORICAL_COUNT,
      missing_from_fresh: missingFromFresh,
      new_since_snapshot: newSinceSnapshot,
      population_stable: eligibilityPopulationStable,
    },
    required_field_audit_live_schema: { openapi_required_fields: openapiRequired, matches_expected: requiredFieldsMatchExpected, blocked_candidates: blockedRequiredField.length },
    slug_audit: { candidates: createCandidatesPreSlug.length, existing_collisions: slugResults.filter((r) => r.existingCollision).length, batch_collisions: slugResults.filter((r) => r.batchCollisionWith.length > 0).length, blocking: slugResults.filter((r) => !r.valid).length },
    pii_audit: { blocked: piiCandidates.length },
    cross_ministry: { rows: crossMinistryRows.length, blocking_for_final_lot: realFreshRequestBase.freshDuplicateSignalCount },
    trust: { officially_verified: officiallyVerifiedInLot.length, publishable_unverified: publishableUnverifiedInLot.length, trust_simulation_all_safe: trustRegressionAllSafe, no_officially_verified_leak: noOfficiallyVerifiedLeak, official_verification_distribution: officialVerificationDistribution },
    deferred_protection: deferredProtection,
    dry_run: dryRun,
    guard: { fixture_tests_pass: guardTestsPass, fixture_tests_fail: guardTestsFail, real_condition_scenarios_all_refused: allRealConditionScenariosRefused, confirm_phrase: REGISTRY_NATIONAL_B_CONFIRM_PHRASE, expected_project_ref: EXPECTED_PROJECT_REF },
    approval_gate: { explicit_distinct_human_approval_received_this_sprint: explicitDistinctHumanApprovalReceivedThisSprint, brief_itself_counts_as_approval: false },
    db_final_recheck: { establishments_after: establishmentsTotalAfter, staging_after: stagingTotalAfter, registry_identifiers_after: registryIdentifiersTotalAfter, delta_establishments: deltaEstablishments, delta_staging: deltaStaging, delta_registry_identifiers: deltaRegistryIdentifiers, db_unchanged: dbUnchanged },
    decision,
    decision_reasons: decisionReasons,
    ready_for_execution: readyForExecution,
    push: "NO",
    deploy: "NO",
  };
  writeFileSync(`${REPORTS_DIR}/registry-national-c-preflight.json`, JSON.stringify(preflight, null, 2));

  // ── STUB REPORTS §32 (dépendants d'une exécution qui n'a PAS eu lieu) ──
  const notExecutedStub = (name: string, reason: string) => ({
    sprint: "REGISTRY-NATIONAL-C",
    generated_at: new Date().toISOString(),
    report: name,
    status: "NOT_EXECUTED",
    reason,
    decision,
  });
  writeFileSync(`${REPORTS_DIR}/registry-national-c-execution.json`, JSON.stringify(notExecutedStub("execution", "Aucune écriture --commit effectuée ce sprint — decision=" + decision + " (jamais A). §19-20 du brief hors périmètre tant qu'une approbation humaine nommée distincte n'est pas reçue."), null, 2));
  writeFileSync(`${REPORTS_DIR}/registry-national-c-created-ids.json`, JSON.stringify(notExecutedStub("created-ids", "0 établissement créé — aucun --commit exécuté."), null, 2));
  writeFileSync(`${REPORTS_DIR}/registry-national-c-reconciliation.json`, JSON.stringify(notExecutedStub("reconciliation", "Rien à réconcilier — aucune écriture Supabase effectuée."), null, 2));
  writeFileSync(`${REPORTS_DIR}/registry-national-c-idempotence.json`, JSON.stringify(notExecutedStub("idempotence", "Non applicable avant une première exécution --commit réussie."), null, 2));
  writeFileSync(`${REPORTS_DIR}/registry-national-c-public-qa.json`, JSON.stringify(notExecutedStub("public-qa", "Aucun nouvel établissement live à tester (recherche/fiche/revendication) — aucune création effectuée."), null, 2));

  // ── §34 SUMMARY ──────────────────────────────────────────────────────────
  const summary = {
    sprint: "REGISTRY-NATIONAL-C",
    generated_at: new Date().toISOString(),
    team: { operator: OPERATOR, approved_by: null, repository: "mboaschool", branch, head, remote: "noha (aucun push effectué)", project_ref: projectRef },
    database: {
      establishments_before: establishmentsTotalBefore,
      inserted: 0,
      establishments_after: establishmentsTotalAfter,
      staging_before: stagingTotalBefore,
      staging_after: stagingTotalAfter,
      registry_identifiers_before: registryIdentifiersTotalBefore,
      registry_identifiers_after: registryIdentifiersTotalAfter,
    },
    approval: { snapshot_candidates: approvalSnapshot.candidate_count, expected_checksum: EXPECTED_HISTORICAL_CHECKSUM, stored_checksum: approvalSnapshot.checksum_sha256, recomputed_checksum: recomputedSnapshotChecksum, valid: checksumTripleVerified },
    live_revalidation: {
      eligible: freshEligibleCount,
      already_live: candidates.filter((c) => c.publication_readiness === "ALREADY_LIVE").length,
      duplicate_signals: realFreshRequestBase.freshDuplicateSignalCount,
      identity_conflicts: candidates.filter((c) => c.publication_readiness === "IDENTITY_REVIEW").length,
      cross_ministry_conflicts: crossMinistryRows.filter((r) => r.recommended_resolution === "CONFLICT" || r.recommended_resolution === "SAME_INSTITUTION").length,
      category_blockers: candidates.filter((c) => c.publication_readiness === "CATEGORY_REVIEW").length,
      pii_blockers: piiCandidates.length,
      required_field_blockers: blockedRequiredField.length,
    },
    trust: {
      create_officially_verified: officiallyVerifiedInLot.length,
      create_publishable_unverified: publishableUnverifiedInLot.length,
      automatically_platform_verified: 0,
      automatically_officially_verified: 0,
      owner_assigned: 0,
      invented_official_ids: 0,
    },
    dry_run: dryRun,
    publication: { attempted: 0, inserted: 0, failed: 0, skipped: freshEligibleCount, conflicts: 0 },
    staging: { linked: 0, promoted: 0, unexpected_promoted: 0, orphans: 0 },
    reconciliation: { created_ids: [], missing: [], wrong_links: [], wrong_values: [], outcome: "NOT_EXECUTED — aucun --commit ce sprint." },
    idempotence: { second_dry_run_inserts: "N/A", already_live: "N/A" },
    public_qa: { search: "NOT_EXECUTED", school_pages: "NOT_EXECUTED", claim_pages: "NOT_EXECUTED", trust_badges: "NOT_EXECUTED (simulation statique OK — voir trust ci-dessus)", search_v2_regression: "NOT_EXECUTED" },
    deferred_protection: deferredProtection,
    cms: cmsReadiness,
    qa: { build: "voir registry-national-c-qa.json", typescript_app: "voir registry-national-c-qa.json", typescript_registry: "voir registry-national-c-qa.json", tests: { guard_fixture_pass: guardTestsPass, guard_fixture_fail: guardTestsFail, guard_real_condition_all_refused: allRealConditionScenariosRefused } },
    production_writes: { establishments_inserted: 0, existing_establishments_updated: 0, existing_establishments_deleted: 0, registry_identifiers_inserted: 0, owners_assigned: 0, verified_automatically: 0 },
    decision,
    decision_reasons: decisionReasons,
    registry_national_publication_closed: "NO",
    ready_for_cms: cmsReadiness.status,
    push: "NO",
    deploy: "NO",
    next_step_exact_command: `npx tsx scripts/school-registry/registry-national-c-publish.ts --commit --expected-count=${freshEligibleCount} --approval-checksum=${recomputedSnapshotChecksum} --confirm="${REGISTRY_NATIONAL_B_CONFIRM_PHRASE}" --operator="jean-merlain" --approved-by="<approbateur humain réel et distinct — jamais 'jean-merlain'>"`,
  };
  writeFileSync(`${REPORTS_DIR}/registry-national-c-summary.json`, JSON.stringify(summary, null, 2));

  console.log("\n=== RÉCAPITULATIF REGISTRY-NATIONAL-C (PREFLIGHT/DRY-RUN ONLY) ===");
  console.log(JSON.stringify({ decision, ready_for_execution: readyForExecution, db_unchanged: dbUnchanged, fresh_eligible_count: freshEligibleCount, checksum: recomputedSnapshotChecksum }, null, 2));
  console.log("Rapports écrits dans reports/registry/registry-national-c-*.{json,csv}");
}

main().catch((e) => {
  console.error("REGISTRY-NATIONAL-C PREFLIGHT FAILED:", e);
  process.exit(1);
});
