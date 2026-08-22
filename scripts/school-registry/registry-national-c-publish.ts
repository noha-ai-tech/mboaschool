import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { matchCandidate } from "./lib/matching/engine";
import type { MatchCandidate, MatchTarget } from "./lib/matching/types";
import { scanCandidateForPii } from "./lib/nationalRegistry/piiAudit";
import { slugify } from "./lib/nationalRegistry/slugDryRun";
import {
  assertRegistryNationalPublicationAllowed,
  RegistryNationalPublicationRefused,
  computeRegistryNationalApprovalChecksum,
  EXPECTED_PROJECT_REF,
  REGISTRY_NATIONAL_B_CONFIRM_PHRASE,
  type RegistryNationalApprovalChecksumRow,
} from "./lib/nationalRegistry/registryNationalPublicationGuard";

/**
 * SPRINT REGISTRY-NATIONAL-C — script d'EXÉCUTION RÉELLE de la publication
 * nationale contrôlée (lot figé par REGISTRY-NATIONAL-B,
 * `reports/registry/registry-national-b-approval.json`, 3 candidats
 * CREATE_PUBLISHABLE_UNVERIFIED, checksum
 * c22e1b88e1cb1026f0115d7d118abcccc4a832bb3375e9fd62e7ed754f7849ce).
 *
 * Modélisé sur les scripts de promotion contrôlée éprouvés du dépôt
 * (`minsante-h-promote.ts` MINSANTE-H, `transport-a2-t3-import.ts`
 * TRANSPORT-A.2-T3) — MÊME pattern séquentiel fail-safe candidat par
 * candidat, MÊME convention de flags CLI — mais N'EST PAS une copie
 * aveugle d'un script spécifique à un ministère : ce script est
 * générique "national" et s'appuie exclusivement sur
 * `registryNationalPublicationGuard.ts` (garde-fou dédié REGISTRY-
 * NATIONAL-B/C, phrase de confirmation PUBLISH_NATIONAL_REGISTRY_TO_DIRECTORY,
 * jamais interchangeable avec PROMOTE_MINSANTE_PILOT_TO_PRODUCTION ni
 * IMPORT_TRANSPORT_TIER3_TO_STAGING).
 *
 * MODE PAR DÉFAUT : DRY RUN (aucune écriture). L'écriture réelle exige
 * TOUS les flags suivants, fournis explicitement au moment de l'exécution,
 * ET une autorisation humaine explicite nommée distincte (§18 du brief
 * REGISTRY-NATIONAL-C — jamais le brief lui-même) :
 *
 *   --commit
 *   --expected-count=<N>              (éligibles recalculé maintenant)
 *   --approval-checksum=<sha256>      (checksum recalculé maintenant)
 *   --confirm="PUBLISH_NATIONAL_REGISTRY_TO_DIRECTORY"
 *   --operator="jean-merlain"
 *   --approved-by="<nom humain réel et distinct — jamais operator>"
 *
 * Portée d'écriture autorisée (brief §3) :
 *   A. INSERT des établissements exacts approuvés par le snapshot.
 *   B. Liaison des lignes staging correspondantes UNIQUEMENT parce que les
 *      3 candidats de ce lot proviennent tous de establishment_import_staging
 *      (source_reference="establishment_import_staging.id=...") ET que
 *      l'architecture de promotion existante du dépôt (MINSANTE-H,
 *      MINESUP-D/F, TRANSPORT-A.2-T3-write) lie systématiquement
 *      promoted_establishment_id lors d'une création establishments issue
 *      d'une ligne staging — jamais fabriqué pour ce sprint.
 * RIEN d'autre : 0 UPDATE d'établissement existant, 0 DELETE, 0
 * establishment_registry_identifiers écrit, 0 is_verified=true, 0 owner_id
 * assigné, 0 migration.
 *
 * AUCUNE AUTORISATION HUMAINE NOMMÉE DISTINCTE N'A ÉTÉ REÇUE AU MOMENT DE
 * L'ÉCRITURE DE CE SCRIPT (REGISTRY-NATIONAL-C, sprint de préparation) —
 * ce script N'EST JAMAIS INVOQUÉ AVEC --commit CE SPRINT. Il est construit
 * et testé (garde-fou en refus, dry-run réel) pour qu'un futur run
 * explicitement autorisé puisse le réutiliser tel quel.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..", "..");
const REPORTS_DIR = join(rootDir, "reports", "registry");
const APPROVAL_SNAPSHOT_PATH = join(REPORTS_DIR, "registry-national-b-approval.json");

function readEnvVar(env: string, key: string): string {
  const match = env.match(new RegExp(`^${key}=(.*)$`, "m"));
  const value = match?.[1]?.trim();
  if (!value) throw new Error(`${key} introuvable dans .env.local`);
  return value;
}
function argFlag(name: string): string | undefined {
  const arg = process.argv.find((a) => a.startsWith(`--${name}=`));
  return arg ? arg.slice(name.length + 3) : undefined;
}
function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
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

const BLOCKING_REQUIRED_FIELDS = ["name", "slug", "main_category"] as const;

async function main() {
  const env = readFileSync(join(rootDir, ".env.local"), "utf-8");
  const url = readEnvVar(env, "NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = readEnvVar(env, "SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(url, serviceKey);
  const projectRef = url.match(/https:\/\/([a-z0-9]+)\.supabase/)?.[1] ?? "unknown";

  const commit = hasFlag("commit");
  console.log(`=== SPRINT REGISTRY-NATIONAL-C — PUBLICATION ${commit ? "(--commit fourni)" : "(DRY RUN — défaut)"} ===\n`);
  console.log(`Project ref confirmé : ${projectRef} (attendu ${EXPECTED_PROJECT_REF})`);

  // ── Baseline fraîche ──────────────────────────────────────────────────
  const { count: estBefore } = await supabase.from("establishments").select("*", { count: "exact", head: true });
  const { count: stagingBefore } = await supabase.from("establishment_import_staging").select("*", { count: "exact", head: true });
  const { count: registryBefore } = await supabase.from("establishment_registry_identifiers").select("*", { count: "exact", head: true });
  console.log(`Baseline : establishments=${estBefore}, staging=${stagingBefore}, registry_identifiers=${registryBefore}`);

  // ── Snapshot d'approbation : chargé EXACTEMENT tel quel, jamais régénéré ──
  const snapshot = JSON.parse(readFileSync(APPROVAL_SNAPSHOT_PATH, "utf-8"));
  const snapshotChecksumRows: RegistryNationalApprovalChecksumRow[] = snapshot.candidates.map((r: any) => ({
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
  const recomputedChecksum = computeRegistryNationalApprovalChecksum(snapshotChecksumRows);
  console.log(`\nSnapshot chargé : ${snapshot.candidate_count} candidat(s). Checksum stocké=${snapshot.checksum_sha256}. Checksum recalculé=${recomputedChecksum}.`);

  // ── Revalidation live fraîche des 3 candidats (already-live, doublon, PII, champ requis, slug) ──
  const liveEst = await fetchAllPaginated<{ id: string; name: string; slug: string | null; region: string | null; city: string | null; main_category: string | null }>(
    supabase,
    "establishments",
    "id,name,slug,region,city,main_category"
  );
  const registryIds = await fetchAllPaginated<{ establishment_id: string; registry: string; identifier: string; identifier_type: string | null }>(
    supabase,
    "establishment_registry_identifiers",
    "establishment_id,registry,identifier,identifier_type"
  );
  const idsByEstablishment = new Map<string, { registry: string; identifier: string; identifierType?: string | null }[]>();
  for (const r of registryIds) {
    if (!idsByEstablishment.has(r.establishment_id)) idsByEstablishment.set(r.establishment_id, []);
    idsByEstablishment.get(r.establishment_id)!.push({ registry: r.registry, identifier: r.identifier, identifierType: r.identifier_type });
  }
  const liveTargets: MatchTarget[] = liveEst.map((e) => ({ id: e.id, name: e.name, region: e.region, city: e.city, category: mainCategoryToEducationFamily(e.main_category), identifiers: idsByEstablishment.get(e.id) ?? [] }));

  const snapshotStagingIds: string[] = snapshot.candidates.map((c: any) => c.source_reference?.replace("establishment_import_staging.id=", "")).filter(Boolean);
  const stagingRows = await fetchAllPaginated<{ id: string; name_raw: string; region: string | null; city: string | null; status: string; education_family: string | null; promoted_establishment_id: string | null }>(
    supabase,
    "establishment_import_staging",
    "id,name_raw,region,city,status,education_family,promoted_establishment_id",
    (q) => q.in("id", snapshotStagingIds)
  );
  const stagingById = new Map(stagingRows.map((r) => [r.id, r]));

  const existingLiveSlugs = new Set(liveEst.map((e) => e.slug).filter((s): s is string => !!s));
  const usedSlugsThisRun = new Set<string>();

  type Decision = "ELIGIBLE" | "ALREADY_LIVE" | "DUPLICATE_SIGNAL" | "PII_ISSUE" | "MISSING_REQUIRED_FIELD" | "STAGING_ROW_MISSING_OR_ALREADY_PROMOTED";
  interface Reval {
    candidate: any;
    stagingId: string | undefined;
    decision: Decision;
    matchLevel: string;
    slug: string;
    slugConflict: boolean;
  }
  const revalResults: Reval[] = [];

  for (const c of snapshot.candidates) {
    const stagingId = c.source_reference?.replace("establishment_import_staging.id=", "");
    const stagingRow = stagingId ? stagingById.get(stagingId) : undefined;

    const pii = scanCandidateForPii({ name: c.name, extraText: [c.city ?? "", c.region ?? ""] });
    const requiredFieldsMissing: string[] = [];
    if (!c.name?.trim()) requiredFieldsMissing.push("name");
    const proposedSlug = c.name ? slugify(c.name) : "";
    if (!proposedSlug) requiredFieldsMissing.push("slug");
    if (!c.main_category) requiredFieldsMissing.push("main_category");

    const matchCandidateObj: MatchCandidate = { name: c.name, region: c.region, city: c.city, category: c.education_family, identifiers: [] };
    const match = matchCandidate(matchCandidateObj, liveTargets);

    let slug = proposedSlug, n = 1;
    while (existingLiveSlugs.has(slug) || usedSlugsThisRun.has(slug)) {
      slug = `${proposedSlug}-${n}`;
      n++;
    }
    const slugConflict = slug !== proposedSlug;
    usedSlugsThisRun.add(slug);

    let decision: Decision;
    if (!stagingId || !stagingRow || stagingRow.status === "promoted" || stagingRow.promoted_establishment_id) decision = "STAGING_ROW_MISSING_OR_ALREADY_PROMOTED";
    else if (requiredFieldsMissing.length > 0) decision = "MISSING_REQUIRED_FIELD";
    else if (pii.piiDetected) decision = "PII_ISSUE";
    else if (match.level === "EXACT_IDENTIFIER" || match.level === "EXACT_IDENTITY") decision = "ALREADY_LIVE";
    else if (match.level === "STRONG_MATCH" || match.level === "PROBABLE_MATCH" || match.level === "AMBIGUOUS") decision = "DUPLICATE_SIGNAL";
    else decision = "ELIGIBLE";

    revalResults.push({ candidate: c, stagingId, decision, matchLevel: match.level, slug, slugConflict });
  }

  const eligible = revalResults.filter((r) => r.decision === "ELIGIBLE");
  const alreadyLiveCount = revalResults.filter((r) => r.decision === "ALREADY_LIVE").length;
  const duplicateSignalCount = revalResults.filter((r) => r.decision === "DUPLICATE_SIGNAL").length;
  const missingRequiredFieldCount = revalResults.filter((r) => r.decision === "MISSING_REQUIRED_FIELD").length;
  const piiCount = revalResults.filter((r) => r.decision === "PII_ISSUE").length;
  const stagingIssueCount = revalResults.filter((r) => r.decision === "STAGING_ROW_MISSING_OR_ALREADY_PROMOTED").length;

  console.log("\nRevalidation live fraîche :", {
    eligible: eligible.length,
    already_live: alreadyLiveCount,
    duplicate_signal: duplicateSignalCount,
    missing_required_field: missingRequiredFieldCount,
    pii_issue: piiCount,
    staging_row_missing_or_already_promoted: stagingIssueCount,
  });

  const wouldInsertEstablishments = eligible.length;
  const expectedEstablishmentsAfter = (estBefore ?? 0) + wouldInsertEstablishments;
  console.log(`\nWould insert establishments: ${wouldInsertEstablishments}`);
  console.log(`Would link staging: ${wouldInsertEstablishments}`);
  console.log(`Would insert registry identifiers: 0`);
  console.log(`Would update existing: 0`);
  console.log(`Would delete: 0`);
  console.log(`Expected establishments after: ${expectedEstablishmentsAfter}`);

  mkdirSync(REPORTS_DIR, { recursive: true });

  if (!commit) {
    writeFileSync(
      join(REPORTS_DIR, "registry-national-c-publish-dry-run.json"),
      JSON.stringify(
        {
          sprint: "REGISTRY-NATIONAL-C",
          generated_at: new Date().toISOString(),
          project_ref: projectRef,
          snapshot_checksum_stored: snapshot.checksum_sha256,
          snapshot_checksum_recomputed: recomputedChecksum,
          eligible: eligible.length,
          reval_tally: { already_live: alreadyLiveCount, duplicate_signal: duplicateSignalCount, missing_required_field: missingRequiredFieldCount, pii_issue: piiCount, staging_issue: stagingIssueCount },
          would_insert_establishments: wouldInsertEstablishments,
          would_link_staging: wouldInsertEstablishments,
          would_insert_registry_identifiers: 0,
          expected_establishments_after: expectedEstablishmentsAfter,
        },
        null,
        2
      ),
      "utf-8"
    );
    console.log("\nDRY RUN — aucune écriture. Pour exécuter réellement, fournir --commit avec tous les flags requis (voir en-tête du fichier) ET une autorisation humaine explicite nommée distincte (brief §18).");
    console.log("\nSTOP — WAIT FOR EXPLICIT HUMAN APPROVAL.");
    return;
  }

  // ── Guard — toute écriture réelle passe ICI, jamais contournable ──────
  try {
    assertRegistryNationalPublicationAllowed({
      commit,
      confirmPhrase: argFlag("confirm"),
      projectRef,
      operator: argFlag("operator"),
      approvedBy: argFlag("approved-by"),
      expectedCandidateCount: argFlag("expected-count") ? Number(argFlag("expected-count")) : undefined,
      actualCandidateCount: eligible.length,
      approvalChecksum: argFlag("approval-checksum"),
      recomputedChecksum,
      storedSnapshotChecksum: snapshot.checksum_sha256,
      freshAlreadyLiveCount: alreadyLiveCount,
      freshDuplicateSignalCount: duplicateSignalCount,
      freshMissingRequiredFieldCount: missingRequiredFieldCount,
      freshTier3OfficiallyVerifiedCount: 0,
      freshPiiDetectedCount: piiCount,
      registryIdentifiersToInsert: 0,
    });
  } catch (e) {
    if (e instanceof RegistryNationalPublicationRefused) {
      console.error(`\n${e.message}`);
      process.exitCode = 1;
      return;
    }
    throw e;
  }

  // ── Exécution réelle — séquentielle, fail-safe, par candidat ──────────
  console.log(`\n=== EXÉCUTION RÉELLE AUTORISÉE (opérateur: ${argFlag("operator")}, approuvé par: ${argFlag("approved-by")}) ===\n`);
  let created = 0;
  let stagingLinked = 0;
  const createdWithoutStagingLink: string[] = [];
  const establishmentIdsCreatedThisRun = new Set<string>();
  const createdRows: { establishment_id: string; staging_id: string | undefined; name: string; region: string | null; city: string | null; main_category: string }[] = [];

  const existingSlugRows = await fetchAllPaginated<{ slug: string | null }>(supabase, "establishments", "slug");
  const usedSlugs = new Set<string>(existingSlugRows.map((r) => r.slug).filter((s): s is string => !!s));

  for (const r of eligible) {
    const c = r.candidate;
    const base = slugify(c.name);
    let slug = base, n = 1;
    while (usedSlugs.has(slug)) {
      slug = `${base}-${n}`;
      n++;
    }
    usedSlugs.add(slug);

    const { data: est, error: estError } = await supabase
      .from("establishments")
      .insert({
        name: c.name,
        slug,
        main_category: c.main_category,
        sub_category: c.sub_category ?? null,
        region: c.region,
        city: c.city ?? null,
        address: c.address ?? null,
        source_ministry: c.source_ministries?.[0] ?? null,
        source_url: c.source_url ?? null,
        source_reference: c.source_reference ?? null,
        official_id: null,
        owner_id: null,
        is_verified: false,
        registry_import_batch: "registry-national-c-publish",
      })
      .select("id")
      .single();
    if (estError || !est) {
      console.error(`ÉCHEC création establishment pour "${c.name}" : ${estError?.message}`);
      continue;
    }
    created++;
    establishmentIdsCreatedThisRun.add(est.id);
    createdRows.push({ establishment_id: est.id, staging_id: r.stagingId, name: c.name, region: c.region, city: c.city ?? null, main_category: c.main_category });

    if (r.stagingId) {
      const { error: linkError } = await supabase
        .from("establishment_import_staging")
        .update({ status: "promoted", promoted_establishment_id: est.id, promoted_at: new Date().toISOString() })
        .eq("id", r.stagingId);
      if (linkError) {
        createdWithoutStagingLink.push(est.id);
        console.error(`ÉCHEC liaison staging pour "${c.name}" (establishment ${est.id} créé) : ${linkError.message}`);
      } else {
        stagingLinked++;
      }
    } else {
      createdWithoutStagingLink.push(est.id);
    }
  }

  // ── Vérifications post-exécution (relecture fraîche, jamais un compteur en mémoire) ──
  const { count: estAfter } = await supabase.from("establishments").select("*", { count: "exact", head: true });
  const { count: stagingAfter } = await supabase.from("establishment_import_staging").select("*", { count: "exact", head: true });
  const { count: registryAfter } = await supabase.from("establishment_registry_identifiers").select("*", { count: "exact", head: true });
  const outcome = created === eligible.length && createdWithoutStagingLink.length === 0 ? "SUCCESS" : created === 0 ? "TOTAL_FAILURE" : "PARTIAL_RECONCILIATION_REQUIRED";

  console.log(`\nPOST-EXÉCUTION : establishments ${estBefore}->${estAfter} (+${(estAfter ?? 0) - (estBefore ?? 0)}, attendu +${created})`);
  console.log(`Registry identifiers : ${registryBefore}->${registryAfter} (attendu inchangé, 0 inséré)`);
  console.log(`Créés : ${created}/${eligible.length}. Liés au staging : ${stagingLinked}. Sans lien : ${createdWithoutStagingLink.length}.`);
  console.log(`Outcome : ${outcome}`);

  writeFileSync(
    join(REPORTS_DIR, "registry-national-c-execution.json"),
    JSON.stringify(
      {
        sprint: "REGISTRY-NATIONAL-C",
        generated_at: new Date().toISOString(),
        operator: argFlag("operator"),
        approved_by: argFlag("approved-by"),
        project_ref: projectRef,
        approval_checksum: recomputedChecksum,
        eligible: eligible.length,
        created,
        staging_linked: stagingLinked,
        identifiers_inserted: 0,
        establishments_before: estBefore,
        establishments_after: estAfter,
        staging_before: stagingBefore,
        staging_after: stagingAfter,
        registry_identifiers_before: registryBefore,
        registry_identifiers_after: registryAfter,
        outcome,
      },
      null,
      2
    ),
    "utf-8"
  );
  writeFileSync(join(REPORTS_DIR, "registry-national-c-created-ids.json"), JSON.stringify({ sprint: "REGISTRY-NATIONAL-C", generated_at: new Date().toISOString(), count: createdRows.length, establishments: createdRows }, null, 2), "utf-8");
  writeFileSync(
    join(REPORTS_DIR, "registry-national-c-reconciliation.json"),
    JSON.stringify({ sprint: "REGISTRY-NATIONAL-C", generated_at: new Date().toISOString(), created, staging_linked: stagingLinked, created_without_staging_link: createdWithoutStagingLink, outcome }, null, 2),
    "utf-8"
  );

  if (outcome !== "SUCCESS") {
    console.log("\nRÉCONCILIATION INCOMPLÈTE — voir rapports pour détails. Ne PAS relancer automatiquement --commit.");
    process.exitCode = 1;
  } else {
    console.log("\nSUCCESS — publication réconciliée intégralement, 0 lien manquant.");
  }
}

main().catch((error) => {
  console.error("Échec publication REGISTRY-NATIONAL-C :", error);
  process.exit(1);
});
