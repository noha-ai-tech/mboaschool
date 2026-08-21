import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { sha256 } from "./lib/extraction/hashing";
import { matchCandidate } from "./lib/matching/engine";
import type { MatchTarget } from "./lib/matching/types";
import {
  assertMinsanteGPromotionAllowed,
  MinsanteGPromotionRefused,
  EXPECTED_CANDIDATE_COUNT,
  EXPECTED_APPROVAL_CHECKSUM,
} from "./lib/minsanteGPromotionGuard";
import { evaluateReconciliation } from "./lib/minesupPromotionGuard";

/**
 * SPRINT MINSANTE-H — script d'EXÉCUTION RÉELLE de la promotion contrôlée du
 * pilote MINSANTE (batch `minsante-pilot-v1`, 8 candidats CLEAN_APPROVABLE du
 * snapshot `reports/registry/minsante-f-pilot-approval.json`, checksum
 * `26ea91c10bb9791dbc2e339bee577ae16d2f31db499411228bf224aa0bd0f653`).
 *
 * Ce script réutilise EXACTEMENT la logique de revalidation de
 * `minsante-g-promotion-preflight.ts` (MINSANTE-G/G.3) — checksum triple,
 * protection de population différée, revalidation live complète (matching,
 * inter-ministériel, catégorie, PII, slug, champs requis) — puis, si et
 * SEULEMENT SI toutes les conditions sont réunies ET que les flags de garde
 * sont fournis, exécute l'écriture réelle suivant le même pattern fail-safe
 * séquentiel que MINESUP-D/MINESUP-F : establishment -> staging link, jamais
 * de registry_identifiers (aucun identifiant MINSANTE validé, §10 du brief
 * MINSANTE-G — jamais inventé).
 *
 * MODE PAR DÉFAUT : DRY RUN (aucune écriture). L'écriture réelle exige TOUS
 * les flags suivants, fournis explicitement au moment de l'exécution :
 *
 *   --commit
 *   --expected-count=<N>              (nombre d'éligibles recalculé maintenant)
 *   --approval-checksum=<sha256>       (checksum recalculé maintenant)
 *   --confirm="PROMOTE_MINSANTE_PILOT_TO_PRODUCTION"
 *   --operator="jean-merlain"
 *   --approved-by="<nom humain réel>"  (jamais operator, jamais codé en dur)
 *
 * Autorisation nommée reçue pour cette exécution : Jean Merlain (operator),
 * approuvé par Eddy (approved-by), périmètre = exactement les 8 candidats du
 * snapshot MINSANTE-F. Cf. `reports/registry/minsante-h-authorization.json`.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..", "..");
const BATCH_ID = "minsante-pilot-v1";
const EXPECTED_CHECKSUM_FROM_PROMPT = "26ea91c10bb9791dbc2e339bee577ae16d2f31db499411228bf224aa0bd0f653";
const PROMOTION_SOURCE_REFERENCE = `Promotion MINSANTE-H (batch ${BATCH_ID})`;

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
function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
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

// Mêmes champs NOT NULL sans défaut, confirmés empiriquement par MINSANTE-G
// (introspection OpenAPI PostgREST). `city` n'est jamais bloquant.
const BLOCKING_REQUIRED_FIELDS = ["name", "slug", "main_category"] as const;

async function main() {
  const env = readFileSync(join(rootDir, ".env.local"), "utf-8");
  const url = readEnvVar(env, "NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = readEnvVar(env, "SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(url, serviceKey);
  const projectRef = url.match(/https:\/\/([a-z0-9]+)\.supabase/)?.[1] ?? "unknown";

  const commit = hasFlag("commit");
  console.log(`=== SPRINT MINSANTE-H — PROMOTION ${commit ? "(--commit fourni)" : "(DRY RUN — défaut)"} ===\n`);

  // ── Baseline fraîche ──────────────────────────────────────────────────
  const { count: estBefore } = await supabase.from("establishments").select("*", { count: "exact", head: true });
  const { count: stagingBefore } = await supabase.from("establishment_import_staging").select("*", { count: "exact", head: true });
  const { count: registryBefore } = await supabase.from("establishment_registry_identifiers").select("*", { count: "exact", head: true });
  console.log(`Baseline : establishments=${estBefore}, staging=${stagingBefore}, registry_identifiers=${registryBefore}`);
  console.log(`Project ref confirmé : ${projectRef} (attendu umcwwynrftidytxgqkwi)`);
  if (projectRef !== "umcwwynrftidytxgqkwi") {
    console.log("\nPROJET INATTENDU — STOP.");
    process.exit(1);
  }

  // ── Snapshot d'approbation : chargé EXACTEMENT tel quel, jamais régénéré ──
  const snapshot = JSON.parse(readFileSync(join(rootDir, "reports", "registry", "minsante-f-pilot-approval.json"), "utf-8"));
  console.log(`\nSnapshot chargé : ${snapshot.candidate_count} candidat(s) (attendu ${EXPECTED_CANDIDATE_COUNT})`);
  if (snapshot.candidate_count !== EXPECTED_CANDIDATE_COUNT || snapshot.candidates.length !== EXPECTED_CANDIDATE_COUNT) {
    console.log("INCOHÉRENCE — le snapshot ne contient pas exactement 8 candidats. STOP, ne pas régénérer.");
    process.exit(1);
  }
  const snapshotIds: string[] = snapshot.candidates.map((c: any) => c.staging_id).sort();

  const approvedRows = await fetchAllPaginated<any>(
    supabase,
    "establishment_import_staging",
    "id,name_raw,region,city,status,source_ministry,education_family,source_url,raw_data,fingerprint,promoted_establishment_id,data_source_id",
    (q) => q.in("id", snapshotIds)
  );
  console.log(`Lignes staging trouvées pour les 8 staging_id du snapshot : ${approvedRows.length} (attendu 8)`);
  if (approvedRows.length !== EXPECTED_CANDIDATE_COUNT) {
    console.log("INCOHÉRENCE — au moins une ligne staging du snapshot est introuvable. STOP.");
    process.exit(1);
  }

  // Recalcul EXACT du même algorithme que minsante-f-reclassify.ts / minsante-g-promotion-preflight.ts.
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

  console.log(`\nChecksum attendu (autorisation)  : ${EXPECTED_CHECKSUM_FROM_PROMPT}`);
  console.log(`Checksum stocké (approval.json)  : ${snapshot.checksum}`);
  console.log(`Checksum recalculé (état actuel) : ${computedChecksum}`);
  const checksumValid = computedChecksum === EXPECTED_CHECKSUM_FROM_PROMPT && computedChecksum === snapshot.checksum && EXPECTED_CHECKSUM_FROM_PROMPT === EXPECTED_APPROVAL_CHECKSUM;
  console.log(`Checksum valide (3 valeurs identiques) : ${checksumValid}`);
  if (!checksumValid) {
    console.log("\nCHECKSUM INVALIDE — STOP. Ne PAS régénérer un nouveau snapshot, ne PAS promouvoir un sous-ensemble.");
    process.exit(1);
  }

  // ── Protection de population différée (13 CATEGORY_REVIEW + 1 DUPLICATE_REVIEW) ──
  const allPilotRows = (await fetchAllPaginated<any>(supabase, "establishment_import_staging", "id,name_raw,raw_data", (q) => q.eq("source_ministry", "MINSANTE"))).filter((r) => r.raw_data?.batch === BATCH_ID);
  console.log(`\nPopulation complète du pilote MINSANTE (batch ${BATCH_ID}) relue : ${allPilotRows.length} (attendu 22)`);
  const deferredCategoryReview = allPilotRows.filter((r) => r.raw_data?.classification === "CATEGORY_REVIEW" && !snapshotIds.includes(r.id));
  const deferredDuplicateReview = allPilotRows.filter((r) => r.raw_data?.classification === "DUPLICATE_REVIEW" && !snapshotIds.includes(r.id));
  const deferredLeakIntoSnapshot = snapshotIds.filter((id) => {
    const row = allPilotRows.find((r) => r.id === id);
    return !row || row.raw_data?.classification !== "CLEAN_APPROVABLE";
  });
  console.log(`CATEGORY_REVIEW différés (hors snapshot) : ${deferredCategoryReview.length} (attendu 13)`);
  console.log(`DUPLICATE_REVIEW différé (hors snapshot)  : ${deferredDuplicateReview.length} (attendu 1)`);
  console.log(`Fuite d'un candidat différé DANS le snapshot approuvé : ${deferredLeakIntoSnapshot.length} (attendu 0)`);
  const deferredProtectionOk = deferredCategoryReview.length === 13 && deferredDuplicateReview.length === 1 && deferredLeakIntoSnapshot.length === 0;
  if (!deferredProtectionOk) {
    console.log("\nPROTECTION DE POPULATION DIFFÉRÉE VIOLÉE — STOP.");
    process.exit(1);
  }

  // ── Revalidation live complète (matching, inter-ministériel, catégorie, PII, slug, champs requis) ──
  interface LiveEst { id: string; name: string; region: string | null; city: string | null; main_category: string | null; slug: string | null; }
  interface RegistryIdRow { establishment_id: string; authority: string; registry: string; identifier: string; identifier_type: string | null; }
  const liveEst = await fetchAllPaginated<LiveEst>(supabase, "establishments", "id,name,region,city,main_category,slug");
  const registryIds = await fetchAllPaginated<RegistryIdRow>(supabase, "establishment_registry_identifiers", "establishment_id,authority,registry,identifier,identifier_type");
  const allStaging = await fetchAllPaginated<{ id: string; name_raw: string; region: string | null; city: string | null; education_family: string | null; status: string }>(
    supabase,
    "establishment_import_staging",
    "id,name_raw,region,city,education_family,status"
  );

  const idsByEstablishment = new Map<string, { registry: string; identifier: string; identifierType?: string | null }[]>();
  for (const r of registryIds) {
    if (!idsByEstablishment.has(r.establishment_id)) idsByEstablishment.set(r.establishment_id, []);
    idsByEstablishment.get(r.establishment_id)!.push({ registry: r.registry, identifier: r.identifier, identifierType: r.identifier_type });
  }
  const liveTargets: MatchTarget[] = liveEst.map((e) => ({ id: e.id, name: e.name, region: e.region, city: e.city, category: mainCategoryToEducationFamily(e.main_category), identifiers: idsByEstablishment.get(e.id) ?? [] }));

  const approvedIds = new Set(snapshotIds);
  const stagingTargets: MatchTarget[] = allStaging
    .filter((s) => !approvedIds.has(s.id) && s.status !== "promoted")
    .map((s) => ({ id: `staging:${s.id}`, name: s.name_raw, region: s.region, city: s.city, category: s.education_family, identifiers: [] }));
  const allTargets = [...liveTargets, ...stagingTargets];
  console.log(`\nCibles de matching : ${liveTargets.length} live + ${stagingTargets.length} staging (8 candidats approuvés + lignes déjà promues exclus)`);

  const minesupIdRows = registryIds.filter((r) => r.authority === "MINESUP");
  const minesupEstablishmentIds = [...new Set(minesupIdRows.map((r) => r.establishment_id))];
  const estById = new Map(liveEst.map((e) => [e.id, e]));
  const minesupTargets: MatchTarget[] = minesupEstablishmentIds
    .map((id) => estById.get(id))
    .filter((e): e is LiveEst => !!e)
    .map((e) => ({ id: e.id, name: e.name, region: e.region, city: e.city, category: mainCategoryToEducationFamily(e.main_category), identifiers: idsByEstablishment.get(e.id) ?? [] }));

  const existingSlugs = new Set(liveEst.map((e) => e.slug).filter((s): s is string => !!s));

  type Decision = "ELIGIBLE" | "ALREADY_LIVE" | "CONFLICT" | "DUPLICATE_SIGNAL" | "CATEGORY_CHANGED" | "SOURCE_ISSUE" | "PII_ISSUE" | "CROSS_MINISTRY_CONFLICT" | "INVALID";
  interface Reval {
    row: any; decision: Decision; matchLevel: string; mainCategory: string | null; slug: string; slugConflict: boolean; requiredFieldsMissing: string[];
  }
  const revalResults: Reval[] = [];
  const usedSlugsThisRun = new Set<string>();
  let piiResidualTotal = 0;

  for (const r of approvedRows) {
    const raw = r.raw_data as any;
    const snapshotEntry = snapshot.candidates.find((c: any) => c.staging_id === r.id);

    const rawStr = JSON.stringify(raw);
    const snapshotStr = JSON.stringify(snapshotEntry);
    const piiPattern = /nom\s+du\s+(promoteur|repr[eé]sentant\s+l[eé]gal)\s*:?\s*[a-z]/i;
    const piiInRaw = piiPattern.test(rawStr) && !/REDACTED/i.test(rawStr);
    const piiInSnapshot = piiPattern.test(snapshotStr) && !/REDACTED/i.test(snapshotStr);
    const piiInUrl = typeof r.source_url === "string" && /nom-du-promoteur|nom-du-representant/i.test(r.source_url);
    const piiIssue = piiInRaw || piiInSnapshot || piiInUrl;
    if (piiIssue) piiResidualTotal++;

    const stillReady = r.status === "ready";
    const stillMinsante = r.source_ministry === "MINSANTE";
    const stillCleanApprovable = raw?.classification === "CLEAN_APPROVABLE";
    const notAlreadyPromoted = !r.promoted_establishment_id;
    const provenanceIntact = !!r.source_url && !!r.data_source_id;
    const programsIntact =
      Array.isArray(raw?.programs_normalized) &&
      raw.programs_normalized.length > 0 &&
      JSON.stringify([...raw.programs_normalized].sort()) === JSON.stringify([...(snapshotEntry?.programs ?? [])].sort());
    const sourceIssue = !stillReady || !stillMinsante || !notAlreadyPromoted || !provenanceIntact;

    const currentMainCategory: string | null = raw?.category_decision === "SUPERIEUR_CONFIRMED" ? "superieur" : raw?.category_decision === "AUTRES_CONFIRMED" ? "autres" : null;
    const categoryStillResolved = currentMainCategory !== null;
    const categoryUnchanged = currentMainCategory === snapshotEntry?.main_category;
    const educationFamilyOk = r.education_family === "health_training" && snapshotEntry?.education_family === "health_training";
    const categoryChanged = !categoryStillResolved || !categoryUnchanged || !educationFamilyOk;

    const candidate = { name: r.name_raw, region: r.region, city: r.city, category: r.education_family, identifiers: [] };
    const match = matchCandidate(candidate, allTargets);
    const crossMinistryCandidate = { name: r.name_raw, region: r.region, city: r.city, category: null, identifiers: [] };
    const crossMatch = matchCandidate(crossMinistryCandidate, minesupTargets);
    const crossMinistryConflict = crossMatch.level === "EXACT_IDENTIFIER" || crossMatch.level === "EXACT_IDENTITY" || crossMatch.level === "STRONG_MATCH";

    const base = slugify(r.name_raw);
    let slug = base, n = 1;
    while (existingSlugs.has(slug) || usedSlugsThisRun.has(slug)) {
      slug = `${base}-${n}`;
      n++;
    }
    const slugConflict = slug !== base;
    usedSlugsThisRun.add(slug);

    const plannedPayload: Record<string, unknown> = { name: r.name_raw, slug, main_category: currentMainCategory, region: r.region, city: r.city ?? null };
    const requiredFieldsMissing = BLOCKING_REQUIRED_FIELDS.filter((f) => plannedPayload[f] === null || plannedPayload[f] === undefined || plannedPayload[f] === "");

    let decision: Decision;
    if (requiredFieldsMissing.length > 0) decision = "INVALID";
    else if (piiIssue) decision = "PII_ISSUE";
    else if (crossMinistryConflict) decision = "CROSS_MINISTRY_CONFLICT";
    else if (sourceIssue) decision = "SOURCE_ISSUE";
    else if (categoryChanged) decision = "CATEGORY_CHANGED";
    else if (match.level === "EXACT_IDENTIFIER" || match.level === "EXACT_IDENTITY") decision = "ALREADY_LIVE";
    else if (match.level === "STRONG_MATCH" || match.level === "PROBABLE_MATCH" || match.level === "AMBIGUOUS") decision = "DUPLICATE_SIGNAL";
    else if (!stillCleanApprovable) decision = "CONFLICT";
    else decision = "ELIGIBLE";

    revalResults.push({ row: r, decision, matchLevel: match.level, mainCategory: currentMainCategory, slug, slugConflict, requiredFieldsMissing });
  }

  const revalTally = { eligible: 0, already_live: 0, conflict: 0, duplicate_signal: 0, category_changed: 0, source_issue: 0, pii_issue: 0, cross_ministry_conflict: 0, invalid: 0 };
  for (const r of revalResults) revalTally[r.decision.toLowerCase() as keyof typeof revalTally]++;
  console.log("\nRevalidation live :", revalTally);
  console.log(`Résidu PII total : ${piiResidualTotal} (attendu 0)`);

  const eligible = revalResults.filter((r) => r.decision === "ELIGIBLE");
  const slugBatchConflicts = eligible.filter((r) => r.slugConflict);
  const existingSlugCollisions = eligible.filter((r) => existingSlugs.has(slugify(r.row.name_raw)));
  const requiredFieldBlockers = revalResults.filter((r) => r.requiredFieldsMissing.length > 0);

  const wouldInsertEstablishments = eligible.length;
  const wouldLinkStaging = eligible.length;
  const wouldInsertRegistryIdentifiers = 0;
  const expectedEstablishmentsAfter = (estBefore ?? 0) + wouldInsertEstablishments;

  console.log("\n=== MINSANTE-H PROMOTION DRY RUN (recalcul au moment de l'exécution) ===");
  console.log(`Would insert establishments: ${wouldInsertEstablishments}`);
  console.log(`Would link staging: ${wouldLinkStaging}`);
  console.log(`Would insert registry identifiers: ${wouldInsertRegistryIdentifiers}`);
  console.log(`Would update existing: 0`);
  console.log(`Would delete: 0`);
  console.log(`Slug conflicts (batch): ${slugBatchConflicts.length}, (existing): ${existingSlugCollisions.length}`);
  console.log(`Required-field blockers: ${requiredFieldBlockers.length}`);
  console.log(`Expected establishments after: ${expectedEstablishmentsAfter}`);

  mkdirSync(join(rootDir, "reports", "registry"), { recursive: true });

  if (!commit) {
    writeFileSync(
      join(rootDir, "reports", "registry", "minsante-h-dry-run.json"),
      JSON.stringify(
        {
          generated_at: new Date().toISOString(),
          checksum_valid: checksumValid,
          eligible: eligible.length,
          reval_tally: revalTally,
          would_insert_establishments: wouldInsertEstablishments,
          would_link_staging: wouldLinkStaging,
          would_insert_registry_identifiers: wouldInsertRegistryIdentifiers,
          expected_establishments_after: expectedEstablishmentsAfter,
        },
        null,
        2
      ),
      "utf-8"
    );
    console.log("\nDRY RUN — aucune écriture. Pour exécuter réellement, fournir --commit avec tous les flags requis (voir en-tête du fichier).");
    console.log("\nSTOP — WAIT FOR EXPLICIT HUMAN APPROVAL.");
    return;
  }

  // ── Guard — toute écriture réelle passe ICI, jamais contournable ──────
  try {
    assertMinsanteGPromotionAllowed({
      commit,
      confirmPhrase: argFlag("confirm"),
      projectRef,
      operator: argFlag("operator"),
      approvedBy: argFlag("approved-by"),
      actualEligibleCount: eligible.length,
      expectedEligibleCount: argFlag("expected-count") ? Number(argFlag("expected-count")) : undefined,
      computedChecksum,
      approvalChecksum: argFlag("approval-checksum"),
      identifierConflicts: 0,
      slugConflicts: slugBatchConflicts.length + existingSlugCollisions.length,
    });
  } catch (e) {
    if (e instanceof MinsanteGPromotionRefused) {
      console.error(`\n${e.message}`);
      process.exitCode = 1;
      return;
    }
    throw e;
  }

  // ── Exécution réelle — séquentielle, fail-safe, par candidat ──────────
  console.log("\n=== EXÉCUTION RÉELLE AUTORISÉE (opérateur: jean-merlain, approuvé par: Eddy) ===\n");
  let created = 0, stagingLinked = 0;
  const createdWithoutStagingLink: string[] = [];
  const establishmentIdsCreatedThisRun = new Set<string>();
  const createdRows: { establishment_id: string; staging_id: string; name: string; region: string | null; city: string | null; main_category: string }[] = [];

  const existingSlugRows = await fetchAllPaginated<{ slug: string | null }>(supabase, "establishments", "slug");
  const usedSlugs = new Set<string>(existingSlugRows.map((r) => r.slug).filter((s): s is string => !!s));

  for (const r of eligible) {
    const row = r.row;
    const raw = row.raw_data as any;
    const base = slugify(row.name_raw);
    let slug = base, n = 1;
    while (usedSlugs.has(slug)) {
      slug = `${base}-${n}`;
      n++;
    }
    usedSlugs.add(slug);

    const { data: est, error: estError } = await supabase
      .from("establishments")
      .insert({
        name: row.name_raw,
        slug,
        main_category: r.mainCategory,
        region: row.region,
        city: row.city ?? null,
        source_ministry: "MINSANTE",
        source_url: row.source_url,
        source_reference: null,
        source_updated_at: new Date().toISOString(),
        official_id: null,
        owner_id: null,
        is_verified: false,
        description: null,
        cover_image_url: null,
        registry_import_batch: BATCH_ID,
      })
      .select("id")
      .single();
    if (estError || !est) {
      console.error(`ÉCHEC création establishment pour "${row.name_raw}" : ${estError?.message}`);
      continue;
    }
    created++;
    establishmentIdsCreatedThisRun.add(est.id);
    createdRows.push({ establishment_id: est.id, staging_id: row.id, name: row.name_raw, region: row.region, city: row.city ?? null, main_category: r.mainCategory! });

    const { error: linkError } = await supabase
      .from("establishment_import_staging")
      .update({ status: "promoted", promoted_establishment_id: est.id, promoted_at: new Date().toISOString() })
      .eq("id", row.id);
    if (linkError) {
      createdWithoutStagingLink.push(est.id);
      console.error(`ÉCHEC liaison staging pour "${row.name_raw}" (establishment ${est.id} créé) : ${linkError.message}`);
    } else {
      stagingLinked++;
    }
  }

  // Aucun registry identifier n'est jamais inséré pour MINSANTE (§10 — aucun
  // identifiant validé). orphanIdentifiers/createdWithoutIdentifiers restent
  // donc trivialement vides — la fonction générique reste réutilisée pour
  // cohérence de format avec MINESUP-D/F, pas parce qu'un vrai risque existe ici.
  const audit = evaluateReconciliation({
    createdCount: created,
    stagingLinkedCount: stagingLinked,
    identifiersInsertedCount: 0,
    createdWithoutStagingLink,
    createdWithoutIdentifiers: [],
    orphanIdentifiers: [],
  });
  console.log("\n=== RECONCILIATION AUDIT ===");
  console.log(JSON.stringify(audit, null, 2));

  // ── Vérifications post-exécution (relecture fraîche, jamais un compteur en mémoire) ──
  const { count: estAfter } = await supabase.from("establishments").select("*", { count: "exact", head: true });
  const { count: stagingAfter } = await supabase.from("establishment_import_staging").select("*", { count: "exact", head: true });
  const { count: registryAfter } = await supabase.from("establishment_registry_identifiers").select("*", { count: "exact", head: true });
  const postStagingRows = await fetchAllPaginated<any>(supabase, "establishment_import_staging", "id,status,promoted_establishment_id", (q) => q.in("id", snapshotIds));
  const promotedCount = postStagingRows.filter((r) => r.status === "promoted" && r.promoted_establishment_id).length;
  const correctlyLinked = postStagingRows.filter((r) => r.promoted_establishment_id && establishmentIdsCreatedThisRun.has(r.promoted_establishment_id)).length;
  const orphanEstablishments = createdRows.filter((c) => !postStagingRows.find((s) => s.id === c.staging_id && s.promoted_establishment_id === c.establishment_id)).length;

  console.log(`\nPOST-EXÉCUTION : establishments ${estBefore}->${estAfter} (+${(estAfter ?? 0) - (estBefore ?? 0)}, attendu +${created})`);
  console.log(`Staging total : ${stagingBefore}->${stagingAfter} (attendu inchangé, seul le statut change)`);
  console.log(`Registry identifiers : ${registryBefore}->${registryAfter} (attendu inchangé, 0 inséré)`);
  console.log(`Lignes staging promues (status=promoted + promoted_establishment_id) : ${promotedCount}/${snapshotIds.length}`);
  console.log(`Liens corrects (promoted_establishment_id créé CE run) : ${correctlyLinked}/${created}`);
  console.log(`Orphelins détectés : ${orphanEstablishments}`);

  mkdirSync(join(rootDir, "reports", "registry"), { recursive: true });
  writeFileSync(
    join(rootDir, "reports", "registry", "minsante-h-promotion-result.json"),
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        operator: argFlag("operator"),
        approved_by: argFlag("approved-by"),
        project_ref: projectRef,
        registry_import_batch: BATCH_ID,
        approval_checksum: computedChecksum,
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
        promoted_count: promotedCount,
        correctly_linked: correctlyLinked,
        orphan_establishments: orphanEstablishments,
        audit,
      },
      null,
      2
    ),
    "utf-8"
  );
  writeFileSync(join(rootDir, "reports", "registry", "minsante-h-created-ids.json"), JSON.stringify({ generated_at: new Date().toISOString(), registry_import_batch: BATCH_ID, count: createdRows.length, establishments: createdRows }, null, 2), "utf-8");
  writeFileSync(join(rootDir, "reports", "registry", "minsante-h-reconciliation.json"), JSON.stringify(audit, null, 2), "utf-8");

  if (audit.outcome !== "SUCCESS" || orphanEstablishments > 0) {
    console.log("\nRÉCONCILIATION INCOMPLÈTE — voir rapports pour détails.");
    process.exitCode = 1;
  } else {
    console.log("\nSUCCESS — promotion réconciliée intégralement, 0 orphelin, 0 lien manquant.");
  }
}

main().catch((error) => {
  console.error("Échec promotion MINSANTE-H :", error);
  process.exit(1);
});
