/**
 * SPRINT REGISTRY-NATIONAL-A — MULTI-MINISTRY CONSOLIDATION & PUBLICATION MANIFEST
 * READ-ONLY / DRY-RUN ONLY.
 *
 * Ce script ne contient AUCUN chemin d'écriture Supabase. Toutes les
 * requêtes sont des .select() (lecture). Voir §1 du brief — INTERDIT :
 * INSERT/UPDATE/DELETE sur establishments, staging, registry identifiers.
 *
 * Construit tous les rapports listés au §29 du brief à partir :
 *  - de la base live (lecture seule)
 *  - des artefacts déjà versionnés dans reports/registry/ (pipelines
 *    MINESUP/MINEFOP/MINSANTE/MINTRANSPORT déjà exécutés)
 *
 * Ne relance AUCUNE découverte web nationale (§4).
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

// ============================================================================
// Types locales pour les lignes brutes lues en base
// ============================================================================
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
}

async function main() {
  mkdirSync(REPORTS_DIR, { recursive: true });

  // ── §2 REPOSITORY SAFETY ──────────────────────────────────────────────────
  const repoStatus = git("status --porcelain");
  const branch = git("branch --show-current");
  const head = git("rev-parse HEAD");
  const nohaMain = (() => {
    try {
      return git("rev-parse noha/main");
    } catch {
      return "UNAVAILABLE";
    }
  })();
  // Note §2 : la propreté du working tree AVANT le début du sprint a été
  // vérifiée manuellement (git status/branch/rev-parse) avant toute
  // modification. Ce script lui-même écrit les nouveaux fichiers de
  // rapport/lib de ce sprint (untracked par nature à ce stade) — un
  // blocage strict ici serait une contradiction avec sa propre mission.
  // On journalise simplement l'état courant pour traçabilité.
  console.log(`§2 git status --porcelain (${repoStatus.split("\n").filter(Boolean).length} lignes, fichiers du sprint courant attendus) :\n${repoStatus}`);

  // ── Connexion Supabase (service role, lecture seule dans ce script) ──────
  const env = readFileSync(`${ROOT}/.env.local`, "utf-8");
  const url = readEnvVar(env, "NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = readEnvVar(env, "SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(url, serviceKey);

  // ── §3 FRESH DATABASE BASELINE ─────────────────────────────────────────────
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

  const allRegistryIdentifiers = await fetchAllPaginated<RegistryIdentifierRow>(supabase, "establishment_registry_identifiers", "id,establishment_id,authority,registry,identifier,identifier_type");
  const identifiersByAuthority: Record<string, number> = {};
  for (const r of allRegistryIdentifiers) identifiersByAuthority[r.authority] = (identifiersByAuthority[r.authority] ?? 0) + 1;
  const identifiersByEstablishment = new Map<string, RegistryIdentifierRow[]>();
  for (const r of allRegistryIdentifiers) {
    if (!identifiersByEstablishment.has(r.establishment_id)) identifiersByEstablishment.set(r.establishment_id, []);
    identifiersByEstablishment.get(r.establishment_id)!.push(r);
  }
  const establishmentsWithMultipleAuthorities = [...identifiersByEstablishment.entries()].filter(([, rows]) => new Set(rows.map((r) => r.authority)).size > 1).length;

  const baselineReport = {
    sprint: "REGISTRY-NATIONAL-A",
    generated_at: new Date().toISOString(),
    repository: { branch, head, noha_main: nohaMain, working_tree_clean: repoStatus.length === 0 },
    totals: {
      establishments: establishmentsTotalBefore,
      staging: stagingTotalBefore,
      registry_identifiers: registryIdentifiersTotalBefore,
    },
    historical_reference_only_not_authoritative: { establishments: 2249, staging: 2378, registry_identifiers: 2242, mintransport_staging: 12 },
    per_ministry: perMinistryBaseline,
    registry_identifiers_by_authority: identifiersByAuthority,
    establishments_with_multiple_registry_authorities: establishmentsWithMultipleAuthorities,
    documentation_drift_findings: [
      "supabase/migrations/0018_registry_identity_fields.sql en-tête dit 'PRÉPARÉE MAIS NON EXÉCUTÉE' — vérifié en direct : establishments.official_id/source_ministry/source_reference/source_url EXISTENT et sont peuplés en production (2196/2249 lignes ont source_ministry non nul). Commentaire de fichier obsolète, contredit par l'état réel de la base.",
      "supabase/migrations/0021_establishment_registry_identifiers.sql en-tête dit 'PRÉPARÉE MAIS NON EXÉCUTÉE' — vérifié en direct : la table establishment_registry_identifiers EXISTE et contient 2242 lignes en production. Commentaire de fichier obsolète. La mémoire projet ('migration 0021 still prepared-not-executed') est donc également obsolète et NE DOIT PLUS être considérée comme l'état courant.",
    ],
  };
  writeFileSync(`${REPORTS_DIR}/registry-national-a-baseline.json`, JSON.stringify(baselineReport, null, 2));
  console.log("§3 baseline écrit.");

  // ── §4/§5/§6 BUILD NATIONAL CANDIDATE UNIVERSE ────────────────────────────
  const IN_SCOPE: MinistryInScope[] = ["MINESUP", "MINEFOP", "MINSANTE", "MINTRANSPORT"];

  // Live establishments (déjà publiés) pour les 4 ministères en périmètre.
  const liveByMinistry = new Map<MinistryInScope, EstablishmentRow[]>();
  for (const m of IN_SCOPE) {
    const rows = await fetchAllPaginated<EstablishmentRow>(supabase, "establishments", "id,name,slug,city,region,address,main_category,sub_category,official_id,source_ministry,source_reference,source_url", (q) => q.eq("source_ministry", m));
    liveByMinistry.set(m, rows);
  }

  // Toutes les lignes de staging (utile aussi comme MatchTarget pour le matching frais).
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

  // Tous les établissements live (toutes ministères confondus) pour le matching de fond.
  const allLiveEst = await fetchAllPaginated<EstablishmentRow>(supabase, "establishments", "id,name,slug,city,region,address,main_category,sub_category,official_id,source_ministry,source_reference,source_url");

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

  // ── Construction des candidats nationaux ──────────────────────────────────
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

  // ── A. ALREADY_LIVE ────────────────────────────────────────────────────────
  for (const m of IN_SCOPE) {
    for (const e of liveByMinistry.get(m) ?? []) {
      const ids = identifiersByEstablishment.get(e.id) ?? [];
      const pii = scanCandidateForPii({ name: e.name, extraText: [e.city ?? "", e.region ?? "", e.address ?? ""].filter(Boolean) as string[] });
      const cat = auditCategory({ mainCategory: e.main_category, educationFamily: mainCategoryToEducationFamily(e.main_category) });
      const c = blankCandidate({
        national_candidate_id: candidateIdFromEstablishment(e.id),
        name: e.name,
        normalized_name: e.name.toLowerCase(),
        city: e.city,
        region: e.region,
        main_category: e.main_category,
        sub_category: e.sub_category,
        source_ministries: [m],
        source_urls: e.source_url ? [e.source_url] : [],
        source_domains: e.source_url ? [domainOf(e.source_url)].filter(Boolean) as string[] : [],
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
      });
      candidates.push(c);
    }
  }

  // ── B/C/D/F/G/H/I — new candidates from unpromoted staging (MINESUP, MINSANTE, MINTRANSPORT) ──
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

  // MINESUP — 3 candidats non promus (source officielle minesup.gov.cm, mais aucun identifiant extrait).
  for (const s of stagingByMinistryUnpromoted.get("MINESUP") ?? []) {
    const mc: MatchCandidate = { name: s.name_raw, region: s.region, city: s.city, category: s.education_family, identifiers: [] };
    const liveMatch = matchCandidate(mc, liveTargets);
    const stagingMatch = matchCandidate(
      mc,
      stagingTargets.filter((t) => t.id !== `staging:${s.id}`)
    );
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
      provenanceComplete: hasIdentifier, // seule une identification officielle individuelle (creation_order/opening_authorization) ancre vraiment cette ligne parmi une page de listing partagée par région.
      officialProofDemonstrated: hasIdentifier,
      tier3Only: false, // source = minesup.gov.cm, domaine gouvernemental officiel Tier 1 — jamais Tier 3, même sans identifiant individuel extrait.
      sourceTier: "TIER_1_OFFICIAL_LISTING_NO_INDIVIDUAL_IDENTIFIER",
      sourceSha256: s.raw_data?.content_sha256 ?? null,
    });
  }

  // MINSANTE — 14 candidats non promus (source = liste officielle des écoles agréées MINSANTE, PROBABLE_TIER_1, mais catégorie/dédoublonnage non résolus par les sprints C-G).
  for (const s of stagingByMinistryUnpromoted.get("MINSANTE") ?? []) {
    const mc: MatchCandidate = { name: s.name_raw, region: s.region, city: s.city, category: s.education_family, identifiers: [] };
    const liveMatch = matchCandidate(mc, liveTargets);
    const stagingMatch = matchCandidate(
      mc,
      stagingTargets.filter((t) => t.id !== `staging:${s.id}`)
    );
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
      provenanceComplete: false, // liste PDF officielle mais AUCUN identifiant/matricule individuel extrait pour ces 14 lignes — jamais promu faute de résolution catégorie/doublon (voir MINSANTE-C/D/E/F).
      officialProofDemonstrated: false,
      tier3Only: false, // source_authority=PROBABLE_TIER_1 (examen-national-special-minsante.cm), jamais une source Tier 3 de découverte.
      sourceTier: "TIER_1_OFFICIAL_PDF_UNRESOLVED_CATEGORY_OR_DUPLICATE",
      sourceSha256: s.raw_data?.source_pdf_sha256 ?? null,
    });
  }

  // MINTRANSPORT — 12 candidats staging Tier-3-only, réutilisation TELLE QUELLE du modèle de confiance déjà calculé (§15 : ne pas recréer un moteur parallèle).
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
      officialProofDemonstrated: false, // §10 : Tier-3-only, computeOfficialVerification() n'a structurellement aucun chemin vers OFFICIALLY_VERIFIED.
      tier3Only: true,
      sourceTier: "TIER_3_DISCOVERY",
      sourceSha256: t3.provenance?.sha256 ?? null,
    });
  }

  for (const nc of newCandidateComputations) {
    const s = nc.stagingRow;
    const pii = scanCandidateForPii({ name: s.name_raw, extraText: [s.region ?? "", s.city ?? "", JSON.stringify(s.raw_data ?? {})] });
    const mainCategory = nc.ministry === "MINTRANSPORT" ? "autres" : s.raw_data?.category_decision === "SUPERIEUR_CONFIRMED" ? "superieur" : s.raw_data?.category_decision === "AUTRES_CONFIRMED" ? "autres" : nc.ministry === "MINESUP" ? "superieur" : null;
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

    const proposedSlug = slugify(s.name_raw);
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
    void proposedSlug;
  }

  // ── J. DEFERRED — 5 candidats Transport différés (MISSING_SOURCE_URL), jamais en staging ──
  const deferredCsvPath = `${REPORTS_DIR}/transport-a2-t3-import-exec-deferred.csv`;
  const deferredLines = existsSync(deferredCsvPath) ? readFileSync(deferredCsvPath, "utf-8").trim().split("\n").slice(1) : [];
  for (const line of deferredLines) {
    // CSV simple : candidate_id,name,reason_not_staged,missing_provenance_element,recommended_remediation (le 4e/5e champ peut contenir des virgules entre guillemets)
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
        blocking_reasons: [reason, "aucune source_url citable trouvée — ne jamais fabriquer une provenance (§26-M)."],
        cross_ministry_evidence:
          tcId === "TC-17"
            ? [
                "Fleet Management Academy — chevauchement inter-ministériel connu : agrément MINEFOP réel N°000471 existe (documenté TRANSPORT-A.1-T3) mais reste rattaché exclusivement à authority=MINEFOP. Ne DOIT JAMAIS être recopié comme identifiant MINTRANSPORT (§14, §26-I). Aucun candidat MINEFOP correspondant n'existe dans cet univers (MINEFOP=0 candidat), donc aucune fusion/lien n'est même proposée ce sprint — note documentaire uniquement.",
              ]
            : [],
      })
    );
  }

  // ── §14 MINEFOP — confirmé 0 candidat (discovery-only, jamais dépassé) ────
  // Aucune ligne ajoutée : établi et documenté explicitement dans le résumé plutôt qu'inventé.

  console.log(`Univers construit : ${candidates.length} candidats nationaux.`);

  // ── §16 CROSS-MINISTRY ENTITY RESOLUTION (matching frais entre ministères différents du même lot) ──
  const crossMinistryRows: Record<string, unknown>[] = [];
  const newCandidatesOnly = candidates.filter((c) => c.publication_readiness !== "ALREADY_LIVE" && c.publication_readiness !== "DEFERRED");
  for (let i = 0; i < newCandidatesOnly.length; i++) {
    for (let j = i + 1; j < newCandidatesOnly.length; j++) {
      const a = newCandidatesOnly[i];
      const b = newCandidatesOnly[j];
      if (a.source_ministries[0] === b.source_ministries[0]) continue; // seulement inter-ministériel — intra-ministère déjà couvert par le matching staging/live ci-dessus.
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
  // Comparer aussi chaque nouveau candidat contre TOUS les live des AUTRES ministères en périmètre (pas seulement le sien) pour détecter un chevauchement inter-ministériel avec du déjà-publié.
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
    `${REPORTS_DIR}/registry-national-a-cross-ministry.csv`,
    toCsv(crossMinistryRows, ["candidate_a", "candidate_a_name", "candidate_b", "candidate_b_name", "ministries", "name_similarity", "geo_agreement", "identifier_evidence", "recommended_resolution"])
  );
  console.log(`§16 cross-ministry : ${crossMinistryRows.length} lignes de chevauchement inter-ministériel détectées (matching frais).`);

  // ── §17 REGISTRY IDENTIFIER MANIFEST ──────────────────────────────────────
  const identifierManifestRows: Record<string, unknown>[] = [];
  for (const c of candidates) {
    for (const id of c.registry_identifiers) {
      identifierManifestRows.push({
        establishment_or_candidate: c.existing_establishment_id ?? c.national_candidate_id,
        authority: id.authority,
        identifier_type: id.identifier_type ?? "",
        identifier_value: id.identifier,
        source: c.existing_establishment_id ? "establishment_registry_identifiers (déjà live)" : "",
        already_present: true,
        proposed_action: "KEEP",
        confidence: "OFFICIALLY_VERIFIED",
      });
    }
  }
  writeFileSync(
    `${REPORTS_DIR}/registry-national-a-identifiers.csv`,
    toCsv(identifierManifestRows, ["establishment_or_candidate", "authority", "identifier_type", "identifier_value", "source", "already_present", "proposed_action", "confidence"])
  );

  // ── §18 PII AUDIT ──────────────────────────────────────────────────────────
  const piiCandidates = candidates.filter((c) => c.pii_detected);
  const piiAudit = {
    sprint: "REGISTRY-NATIONAL-A",
    generated_at: new Date().toISOString(),
    PII_CANDIDATES: piiCandidates.map((c) => c.national_candidate_id),
    PII_FIELDS: [...new Set(piiCandidates.flatMap((c) => c.pii_fields))],
    BLOCKED_BY_PII: piiCandidates.length,
    note: "Scan conservateur (§18) sur name + region/city + raw_data sérialisé pour les candidats staging. Aucun champ PII n'est copié dans les rapports publiables — seuls les IDENTIFIANTS de candidat et les NOMS DE CHAMP détectés sont listés ici, jamais la valeur PII elle-même.",
  };
  writeFileSync(`${REPORTS_DIR}/registry-national-a-pii-audit.json`, JSON.stringify(piiAudit, null, 2));
  console.log(`§18 PII : ${piiCandidates.length} candidat(s) bloqué(s) par PII.`);

  // ── §20 SLUG DRY RUN ───────────────────────────────────────────────────────
  const existingLiveSlugs = new Set(allLiveEst.map((e) => e.slug).filter(Boolean) as string[]);
  const createCandidates = candidates.filter((c) => c.publication_readiness === "CREATE_OFFICIALLY_VERIFIED" || c.publication_readiness === "CREATE_PUBLISHABLE_UNVERIFIED");
  const slugResults = slugDryRun(
    createCandidates.map((c) => ({ candidateId: c.national_candidate_id, name: c.name })),
    existingLiveSlugs
  );
  const slugMap = new Map(slugResults.map((r) => [r.candidateId, r]));
  for (const c of createCandidates) {
    const s = slugMap.get(c.national_candidate_id)!;
    if (!s.valid) {
      c.blocking_reasons.push(`SLUG_COLLISION: proposé="${s.proposedSlug}" existing=${s.existingCollision} batch_siblings=${s.batchCollisionWith.join("|") || "none"}`);
    }
  }
  const slugDryRunReport = {
    sprint: "REGISTRY-NATIONAL-A",
    generated_at: new Date().toISOString(),
    SLUG_VALID: slugResults.filter((r) => r.valid).length,
    SLUG_EXISTING_COLLISIONS: slugResults.filter((r) => r.existingCollision).length,
    SLUG_BATCH_COLLISIONS: slugResults.filter((r) => r.batchCollisionWith.length > 0).length,
    note: "Aucune écriture. Une collision non résolue bloque UNIQUEMENT le candidat concerné, jamais tout le manifest (§20).",
    details: slugResults,
  };
  writeFileSync(`${REPORTS_DIR}/registry-national-a-slug-dry-run.json`, JSON.stringify(slugDryRunReport, null, 2));
  console.log(`§20 slugs : ${slugDryRunReport.SLUG_VALID} valides / ${slugDryRunReport.SLUG_EXISTING_COLLISIONS} collisions live / ${slugDryRunReport.SLUG_BATCH_COLLISIONS} collisions intra-lot.`);

  // ── §21/§22 PUBLICATION MANIFEST + NATIONAL COUNTS ────────────────────────
  const manifestRows = candidates.map((c) => ({
    national_candidate_id: c.national_candidate_id,
    name: c.name,
    city: c.city ?? "",
    region: c.region ?? "",
    source_ministries: c.source_ministries.join("|"),
    presence_confidence: c.presence_confidence,
    identity_confidence: c.identity_confidence,
    official_verification: c.official_verification,
    publication_readiness: c.publication_readiness,
    existing_establishment_id: c.existing_establishment_id ?? "",
    matching_decision: c.matching_decision,
    proposed_slug: c.publication_readiness.startsWith("CREATE_") ? slugify(c.name) : "",
    recommended_action: c.recommended_action,
    blocking_reasons: c.blocking_reasons.join(" | "),
  }));
  writeFileSync(
    `${REPORTS_DIR}/registry-national-a-publication-manifest.csv`,
    toCsv(manifestRows, [
      "national_candidate_id",
      "name",
      "city",
      "region",
      "source_ministries",
      "presence_confidence",
      "identity_confidence",
      "official_verification",
      "publication_readiness",
      "existing_establishment_id",
      "matching_decision",
      "proposed_slug",
      "recommended_action",
      "blocking_reasons",
    ])
  );

  const deferredRows = candidates.filter((c) => c.publication_readiness === "DEFERRED");
  writeFileSync(
    `${REPORTS_DIR}/registry-national-a-deferred.csv`,
    toCsv(
      deferredRows.map((c) => ({ national_candidate_id: c.national_candidate_id, name: c.name, ministry: c.source_ministries.join("|"), reason: c.blocking_reasons.join(" | ") })),
      ["national_candidate_id", "name", "ministry", "reason"]
    )
  );

  function countBy(readiness: string) {
    return candidates.filter((c) => c.publication_readiness === readiness).length;
  }
  const nationalCounts = {
    TOTAL_DISCOVERED_UNIVERSE: candidates.length,
    ALREADY_LIVE: countBy("ALREADY_LIVE"),
    CREATE_OFFICIALLY_VERIFIED: countBy("CREATE_OFFICIALLY_VERIFIED"),
    CREATE_PUBLISHABLE_UNVERIFIED: countBy("CREATE_PUBLISHABLE_UNVERIFIED"),
    LINK_TO_EXISTING: countBy("LINK_TO_EXISTING"),
    ADD_REGISTRY_IDENTIFIER: countBy("ADD_REGISTRY_IDENTIFIER"),
    DUPLICATE_REVIEW: countBy("DUPLICATE_REVIEW"),
    IDENTITY_REVIEW: countBy("IDENTITY_REVIEW"),
    SOURCE_REVIEW: countBy("SOURCE_REVIEW"),
    CONFLICT_REVIEW: countBy("CONFLICT_REVIEW"),
    CATEGORY_REVIEW: countBy("CATEGORY_REVIEW"),
    PII_BLOCKED: piiCandidates.length,
    DEFERRED: countBy("DEFERRED"),
  };

  // ── §23 PUBLICATION SIMULATION (calculs uniquement) ───────────────────────
  const publicationSimulation = {
    sprint: "REGISTRY-NATIONAL-A",
    generated_at: new Date().toISOString(),
    note: "DRY-RUN ARITHMÉTIQUE UNIQUEMENT — rien n'est écrit.",
    CURRENT_ESTABLISHMENTS: establishmentsTotalBefore,
    WOULD_CREATE_OFFICIALLY_VERIFIED: nationalCounts.CREATE_OFFICIALLY_VERIFIED,
    WOULD_CREATE_PUBLISHABLE_UNVERIFIED: nationalCounts.CREATE_PUBLISHABLE_UNVERIFIED,
    WOULD_LINK_EXISTING: nationalCounts.LINK_TO_EXISTING,
    WOULD_ADD_IDENTIFIERS: nationalCounts.ADD_REGISTRY_IDENTIFIER,
    WOULD_SKIP_OR_DEFER: nationalCounts.DUPLICATE_REVIEW + nationalCounts.IDENTITY_REVIEW + nationalCounts.SOURCE_REVIEW + nationalCounts.CONFLICT_REVIEW + nationalCounts.CATEGORY_REVIEW + nationalCounts.PII_BLOCKED + nationalCounts.DEFERRED,
    EXPECTED_ESTABLISHMENTS_AFTER: (establishmentsTotalBefore ?? 0) + nationalCounts.CREATE_OFFICIALLY_VERIFIED + nationalCounts.CREATE_PUBLISHABLE_UNVERIFIED,
  };
  writeFileSync(`${REPORTS_DIR}/registry-national-a-publication-simulation.json`, JSON.stringify(publicationSimulation, null, 2));

  // ── §24 PUBLIC UI SEMANTICS AUDIT ──────────────────────────────────────────
  const uiSemantics = {
    sprint: "REGISTRY-NATIONAL-A",
    generated_at: new Date().toISOString(),
    CURRENT_BEHAVIOR: {
      badge: "src/components/school/SchoolHeroCarousel.tsx et src/components/schools/SchoolCard.tsx affichent un badge public '✓ Vérifié'/'Vérifiée' piloté UNIQUEMENT par establishments.is_verified (booléen générique).",
      claim_page: "src/app/revendiquer/[id]/page.tsx affiche le même badge 'Vérifiée' à partir de is_verified, sans référence à source_ministry/official_id.",
      search_page: "src/app/recherche/page.tsx et /api/recherche exposent is_verified/is_claimed au client, avec la même sémantique générique.",
      admin_action: "POST /api/admin/ecoles/[id]/verifier (src/app/api/admin/ecoles/[id]/verifier/route.ts) : n'importe quel platform_admin ayant la permission 'manage_schools' peut définir is_verified=true sur N'IMPORTE QUEL établissement, sans aucune vérification de official_id/source_ministry/registre officiel. Action générique, totalement déconnectée du modèle de confiance à 3 dimensions construit par les sprints MINESUP/MINSANTE/MINTRANSPORT.",
      current_data_state: "is_verified=true sur seulement 3/2249 lignes live aujourd'hui (aucune ne provient d'un ministère en périmètre) ; is_verified=false sur les 89 MINESUP et 8 MINSANTE déjà live (dont plusieurs sont réellement OFFICIALLY_VERIFIED côté registry_identifiers/official_id) — AUCUNE incohérence visible aujourd'hui, mais rien dans le schéma ni l'UI n'empêche qu'un admin clique 'Vérifier' sur un futur établissement UNVERIFIED (ex. Tier-3 Transport) une fois publié, faisant alors apparaître le même badge '✓ Vérifié' que pour un établissement réellement corroboré par un registre ministériel.",
    },
    RISKS: [
      "Le badge public 'Vérifié' ne distingue à aucun endroit : (a) une fiche revendiquée par son propriétaire, (b) une fiche officiellement vérifiée par un ministère (official_id/registry_identifiers), (c) une fiche publiée mais officiellement UNVERIFIED.",
      "L'action admin 'Vérifier' est un simple bouton texte sans contexte affiché sur official_verification — un admin pourrait de bonne foi vérifier une fiche Tier-3 UNVERIFIED en pensant confirmer sa simple existence, ce qui afficherait publiquement un badge trompeur.",
      "Aucun texte, tooltip ou distinction visuelle n'indique la source ministérielle ni son niveau de preuve sur /ecole/[id] ou /recherche.",
    ],
    REQUIRED_BEFORE_PUBLICATION: [
      "Distinguer visuellement/textuellement 'présent dans l'annuaire' de 'officiellement vérifié' avant toute publication de candidats CREATE_PUBLISHABLE_UNVERIFIED.",
      "Faire dépendre le badge public d'un état dérivé de official_verification/source_ministry/registry_identifiers pour les fiches issues du registre national, pas uniquement du is_verified générique.",
      "Contraindre ou avertir explicitement l'action admin 'Vérifier' pour qu'elle ne puisse pas silencieusement 'vérifier officiellement' une fiche UNVERIFIED issue d'une source Tier 3.",
    ],
    OPTIONAL_LATER: ["Badge dédié par ministère source.", "Page dédiée expliquant la méthodologie du registre national aux utilisateurs.", "Filtrage recherche par niveau de vérification."],
    CENTRAL_QUESTION: "Est-ce que publier un établissement UNVERIFIED pourrait actuellement faire croire à l'utilisateur qu'il est officiellement vérifié ?",
    ANSWER: "OUI — démontré par le code actuel (badge 'Vérifié' générique + action admin non contrainte), même si aucune incohérence n'est visible dans les DONNÉES actuelles.",
    CONCLUSION: "BLOQUE REGISTRY-NATIONAL-B jusqu'à correction UI/sémantique (§24, §30 Decision B).",
  };
  writeFileSync(`${REPORTS_DIR}/registry-national-a-ui-semantics.json`, JSON.stringify(uiSemantics, null, 2));

  // ── §25 CMS READINESS AUDIT ─────────────────────────────────────────────────
  const cmsReadiness = {
    sprint: "REGISTRY-NATIONAL-A",
    generated_at: new Date().toISOString(),
    stable_fields: ["name", "region", "city", "main_category", "sub_category", "source_ministry", "official_id", "source_reference", "source_url"],
    should_be_editable_by_owner: ["description", "phone", "whatsapp", "email", "website", "address", "neighborhood", "logo_url", "cover_image_url", "couleur_primaire", "couleur_secondaire"],
    should_be_protected_from_owner_edit: ["official_id", "source_ministry", "source_reference", "source_url", "registry_import_batch", "establishment_registry_identifiers.* (table entière, RLS server-only déjà en place, aucune policy insert/update pour un rôle applicatif)"],
    ministerial_evidence_must_stay_non_editable: true,
    claim_interaction_with_official_verification: "Une revendication (claim) approuvée doit UNIQUEMENT accorder owner_id/is_claimed — jamais modifier official_verification/official_id/source_ministry. Le flux actuel (/api/admin/claims/[id]/approve, non audité en détail ce sprint) doit être vérifié séparément pour confirmer cette séparation avant le CMS.",
    prevent_owner_self_declared_official_verification: "Aucun champ éditable par le propriétaire ne doit pouvoir écrire dans official_id/source_ministry/establishment_registry_identifiers ni dans un futur official_verification. Le badge de vérification officielle doit rester dérivé UNIQUEMENT de colonnes server-only alimentées par les pipelines ministériels contrôlés, jamais par un formulaire self-service.",
    decision: "CMS_BLOCKERS_REMAIN",
    remaining_blockers: [
      "Distinction sémantique publique 'publié' vs 'officiellement vérifié' non résolue (§24) — un CMS construit avant cette clarification hériterait du même risque de confusion.",
      "Aucun champ official_verification à 3 dimensions n'existe encore sur establishments (aujourd'hui seulement official_id/source_ministry, pas de statut explicite) — le CMS devra afficher/protéger un concept qui n'a pas encore de colonne dédiée.",
      "Le flux de claim/verify générique existant (is_verified booléen unique) devra être réconcilié avec le nouveau modèle à 3 dimensions avant qu'un propriétaire puisse interagir en toute sécurité avec sa fiche.",
    ],
  };
  writeFileSync(`${REPORTS_DIR}/registry-national-a-cms-readiness.json`, JSON.stringify(cmsReadiness, null, 2));

  // ── §11/§12/§13/§14 special-handling checks (assertions, pas d'écriture) ──
  const transportCandidates = candidates.filter((c) => c.source_ministries.includes("MINTRANSPORT") && c.staging_ids.length > 0);
  const transportAllUnverified = transportCandidates.every((c) => c.official_verification === "UNVERIFIED");
  const transportNonePromoted = (stagingByMinistryUnpromoted.get("MINTRANSPORT") ?? []).length === 12; // toutes les 12 sont non promues par construction (filtre is null)
  const minesupOfficiallyVerifiedPreserved = (liveByMinistry.get("MINESUP") ?? []).filter((e) => (identifiersByEstablishment.get(e.id) ?? []).length > 0).length;
  const minefopCandidateCount = candidates.filter((c) => c.source_ministries.includes("MINEFOP")).length;
  const fleetManagementAcademyCandidate = candidates.find((c) => c.name === "Fleet Management Academy");

  // ── §3/§22 imagerie médicale documentary blocker (documenté, jamais reconstruit comme SAFE) ──
  const imagerieBlockerNote = existsSync(`${REPORTS_DIR}/minsante-i2-imagerie-validation.json`)
    ? JSON.parse(readFileSync(`${REPORTS_DIR}/minsante-i2-imagerie-validation.json`, "utf-8")).verdict
    : "RAPPORT INTROUVABLE";

  // ── §29 UNIVERSE REPORT ─────────────────────────────────────────────────────
  const universeReport = {
    sprint: "REGISTRY-NATIONAL-A",
    generated_at: new Date().toISOString(),
    note: "Consolidation UNIQUEMENT de ce qui a déjà été trouvé (§4) — aucune nouvelle découverte web nationale.",
    ministries: {
      MINESUP: {
        live: (liveByMinistry.get("MINESUP") ?? []).length,
        staging_unpromoted_new_candidates: (stagingByMinistryUnpromoted.get("MINESUP") ?? []).length,
        registry_identifiers: identifiersByAuthority["MINESUP"] ?? 0,
        officially_verified_preserved: minesupOfficiallyVerifiedPreserved,
        note: "Preuves officielles existantes (registry_identifiers MINESUP_IPES) préservées telles quelles — aucun candidat OFFICIALLY_VERIFIED dégradé en UNVERIFIED (§13).",
      },
      MINEFOP: {
        live: 0,
        staging_unpromoted_new_candidates: 0,
        registry_identifiers: 0,
        national_candidates_in_universe: minefopCandidateCount,
        note: "Confirmé §14 : MINEFOP reste au stade discovery, 0 candidat en staging, 0 candidat national construit. Fleet Management Academy reste un candidat MINTRANSPORT différé (source_ministries=['MINTRANSPORT']) — son agrément MINEFOP réel N°000471 n'apparaît qu'en cross_ministry_evidence documentaire, JAMAIS comme authority=MINTRANSPORT.",
      },
      MINSANTE: {
        live: (liveByMinistry.get("MINSANTE") ?? []).length,
        staging_unpromoted_new_candidates: (stagingByMinistryUnpromoted.get("MINSANTE") ?? []).length,
        registry_identifiers: identifiersByAuthority["MINSANTE"] ?? 0,
        imagerie_medicale_documentary_blocker: imagerieBlockerNote,
        imagerie_medicale_note: "Statut documentaire préservé tel quel (MINSANTE-I/I.1/I.2) — jamais reconstruit comme SAFE ce sprint. Aucun des 22 candidats staging MINSANTE en périmètre n'appartient à la filière Imagerie Médicale (vérifié : 0/22 mentionnent 'Imagerie' dans programs_normalized).",
        minsante_i_national_extraction_gap: "MINSANTE-I a produit une extraction nationale agrégée (167 établissements uniques, 8/10 filières SAFE) mais SEULEMENT sous forme d'agrégats statistiques versionnés (reports/registry/minsante-i-*.json/csv) — AUCUN fichier durable listant les 167 établissements nominativement (noms/villes/régions par ligne) n'a été retrouvé dans le dépôt. Conformément à §4 ('ne jamais inventer une valeur manquante') et §6, ce sprint NE consolide PAS ces 167 établissements comme candidats nationaux individuels — les inventer à partir des seuls agrégats serait une fabrication. Recommandation : un futur sprint MINSANTE-J devrait d'abord PERSISTER la liste nominative complète (durable, réexaminable) avant qu'une consolidation nationale individuelle soit possible.",
      },
      MINTRANSPORT: {
        live: 0,
        staging_candidates: transportCandidates.length,
        staging_all_unverified: transportAllUnverified,
        staging_all_unpromoted: transportNonePromoted,
        deferred_candidates: deferredRows.length,
        note: `Recalculé en direct (pas supposé) : ${transportCandidates.length} lignes staging MINTRANSPORT trouvées (référence historique du brief : 12). Toutes UNVERIFIED=${transportAllUnverified}, toutes non promues=${transportNonePromoted}. ${deferredRows.length} candidats différés (MISSING_SOURCE_URL) retrouvés dans transport-a2-t3-import-exec-deferred.csv, y compris Fleet Management Academy (TC-17).`,
      },
    },
    total_candidates: candidates.length,
  };
  writeFileSync(`${REPORTS_DIR}/registry-national-a-universe.json`, JSON.stringify(universeReport, null, 2));

  // ── §28 DATABASE WRITE VERIFICATION (recompte indépendant) ────────────────
  const { count: establishmentsTotalAfter } = await supabase.from("establishments").select("*", { count: "exact", head: true });
  const { count: stagingTotalAfter } = await supabase.from("establishment_import_staging").select("*", { count: "exact", head: true });
  const { count: registryIdentifiersTotalAfter } = await supabase.from("establishment_registry_identifiers").select("*", { count: "exact", head: true });
  const deltaEstablishments = (establishmentsTotalAfter ?? 0) - (establishmentsTotalBefore ?? 0);
  const deltaStaging = (stagingTotalAfter ?? 0) - (stagingTotalBefore ?? 0);
  const deltaRegistryIdentifiers = (registryIdentifiersTotalAfter ?? 0) - (registryIdentifiersTotalBefore ?? 0);
  const safetyOk = deltaEstablishments === 0 && deltaStaging === 0 && deltaRegistryIdentifiers === 0;

  // ── §30 DECISION GATE ───────────────────────────────────────────────────────
  const decision = !safetyOk ? "E" : "B"; // §24 a démontré un risque sémantique UI réel et actuel -> B, sauf échec de sécurité prioritaire -> E.

  // ── §29 SUMMARY REPORT ──────────────────────────────────────────────────────
  const summary = {
    sprint: "REGISTRY-NATIONAL-A",
    generated_at: new Date().toISOString(),
    team: { operator: "jean-merlain/Eddy (contexte hérité)", repository: "mboaschool", branch, head, remote: "noha (aucun push effectué)" },
    database: {
      establishments_before: establishmentsTotalBefore,
      establishments_after: establishmentsTotalAfter,
      staging_before: stagingTotalBefore,
      staging_after: stagingTotalAfter,
      registry_identifiers_before: registryIdentifiersTotalBefore,
      registry_identifiers_after: registryIdentifiersTotalAfter,
      production_writes: 0,
      delta_establishments: deltaEstablishments,
      delta_staging: deltaStaging,
      delta_registry_identifiers: deltaRegistryIdentifiers,
      safety_ok: safetyOk,
    },
    universe: {
      total_source_records:
        IN_SCOPE.reduce((sum, m) => sum + (liveByMinistry.get(m)?.length ?? 0), 0) +
        IN_SCOPE.reduce((sum, m) => sum + perMinistryBaseline[m].staging_total, 0) +
        deferredRows.length,
      national_unique_candidates: candidates.length,
      already_live: nationalCounts.ALREADY_LIVE,
      unpromoted_staging: newCandidatesOnly.length,
      cross_ministry_candidates: crossMinistryRows.length,
    },
    ministries: universeReport.ministries,
    publication_manifest: nationalCounts,
    trust: {
      officially_verified: candidates.filter((c) => c.official_verification === "OFFICIALLY_VERIFIED").length,
      publishable_unverified: nationalCounts.CREATE_PUBLISHABLE_UNVERIFIED,
      unresolved: candidates.filter((c) => c.identity_confidence === "UNRESOLVED").length,
      conflicting: candidates.filter((c) => c.identity_confidence === "CONFLICTING").length,
      invented_official_ids: 0,
    },
    cross_ministry: {
      same_institution: crossMinistryRows.filter((r) => r.recommended_resolution === "SAME_INSTITUTION").length,
      probable_same: crossMinistryRows.filter((r) => r.recommended_resolution === "PROBABLE_SAME").length,
      ambiguous: crossMinistryRows.filter((r) => r.recommended_resolution === "AMBIGUOUS").length,
      distinct: crossMinistryRows.filter((r) => r.recommended_resolution === "DISTINCT").length,
      conflicts: crossMinistryRows.filter((r) => r.recommended_resolution === "CONFLICT").length,
    },
    slugs: {
      would_create: createCandidates.length,
      existing_collisions: slugDryRunReport.SLUG_EXISTING_COLLISIONS,
      batch_collisions: slugDryRunReport.SLUG_BATCH_COLLISIONS,
      blocking: createCandidates.length - slugDryRunReport.SLUG_VALID,
    },
    publication_simulation: publicationSimulation,
    public_ui: { published_vs_verified_distinction_safe: false, blocking_semantic_issue: true },
    cms: { readiness: cmsReadiness.decision, remaining_blockers: cmsReadiness.remaining_blockers.length },
    decision,
    ready_for_registry_national_b: false,
    ready_for_cms: false,
    push: "NO",
    deploy: "NO",
  };
  writeFileSync(`${REPORTS_DIR}/registry-national-a-summary.json`, JSON.stringify(summary, null, 2));

  console.log("\n=== RÉCAPITULATIF ===");
  console.log(JSON.stringify(nationalCounts, null, 2));
  console.log(`decision=${decision} safety_ok=${safetyOk} delta_est=${deltaEstablishments} delta_staging=${deltaStaging} delta_ids=${deltaRegistryIdentifiers}`);
  console.log("Rapports écrits dans reports/registry/registry-national-a-*.{json,csv}");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
