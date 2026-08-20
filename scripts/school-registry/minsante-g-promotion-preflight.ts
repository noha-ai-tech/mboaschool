import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { sha256 } from "./lib/extraction/hashing";
import { matchCandidate } from "./lib/matching/engine";
import type { MatchTarget } from "./lib/matching/types";
import { assertMinsanteGPromotionAllowed, MinsanteGPromotionRefused, EXPECTED_CANDIDATE_COUNT, EXPECTED_APPROVAL_CHECKSUM } from "./lib/minsanteGPromotionGuard";

function argFlag(name: string): string | undefined {
  const arg = process.argv.find((a) => a.startsWith(`--${name}=`));
  return arg ? arg.slice(name.length + 3) : undefined;
}
function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

/**
 * SPRINT MINSANTE-G — CONTROLLED PROMOTION PRE-FLIGHT (READ-ONLY dans ce
 * sprint). Revalide intégralement les 8 candidats CLEAN_APPROVABLE du
 * snapshot MINSANTE-F (reports/registry/minsante-f-pilot-approval.json)
 * contre l'état ACTUEL de la base — jamais un résultat historique réutilisé
 * sans preuve fraîche.
 *
 * Modèle : minesup-f-national-promotion-preflight.ts (§26 du brief MINSANTE-G
 * cite explicitement MINESUP-D/MINESUP-F comme précédents de promotion
 * contrôlée). Différence structurelle volontaire : la population n'est PAS
 * dérivée de status='ready' seul (ce qui inclurait potentiellement d'autres
 * lignes MINSANTE devenues 'ready' entre-temps) — elle est chargée
 * EXPLICITEMENT depuis les 8 staging_id du snapshot MINSANTE-F, puis
 * seulement ENSUITE revalidée (status, classification, promoted_establishment_id,
 * etc.). §4 du brief : "Explicitly exclude ... No review candidate may
 * become eligible merely because this sprint re-runs matching."
 *
 * AUCUN --commit dans ce sprint. Le chemin d'exécution réelle reste présent
 * (gardé par assertMinsanteGPromotionAllowed) uniquement pour que les tests
 * de refus (§19) portent sur le vrai chemin de code, et pour qu'un futur
 * sprint d'exécution séparé puisse réutiliser ce script sans le réécrire.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..", "..");
const OPERATOR = "jean-merlain";
const BATCH_ID = "minsante-pilot-v1";
const EXPECTED_CHECKSUM_FROM_PROMPT = "26ea91c10bb9791dbc2e339bee577ae16d2f31db499411228bf224aa0bd0f653";

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

// §13 — champs NOT NULL sans défaut confirmés EMPIRIQUEMENT ce sprint via
// l'introspection OpenAPI PostgREST (GET /rest/v1/ Accept: application/
// openapi+json, définition `establishments`), PAS supposés depuis un
// souvenir de schéma ou depuis MINESUP-D seul (leçon §13 : "Do not assume
// only slug matters"). Colonnes NOT NULL AVEC un défaut DB (id, forfait,
// verification_status, is_verified, created_at, updated_at, ...) sont
// EXCLUES de cette liste — un INSERT qui les omet ne bloque jamais, la DB
// les remplit elle-même. `city` n'apparaît PAS dans required (migration
// 0019 confirmée exécutée en direct) — ne jamais le traiter comme bloquant.
const BLOCKING_REQUIRED_FIELDS = ["name", "slug", "main_category"] as const;

async function main() {
  const env = readFileSync(join(rootDir, ".env.local"), "utf-8");
  const url = readEnvVar(env, "NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = readEnvVar(env, "SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(url, serviceKey);
  const projectRef = url.match(/https:\/\/([a-z0-9]+)\.supabase/)?.[1] ?? "unknown";

  console.log("=== SPRINT MINSANTE-G — CONTROLLED PROMOTION PRE-FLIGHT (READ-ONLY) ===\n");

  // ── §0/§1 — contexte dépôt (déjà vérifié hors script : aucun CLAUDE.md/
  // AGENTS.md mboaschool à la racine, contexte klassia étranger ignoré). ──

  // ── §2 — Baseline fraîche ────────────────────────────────────────────
  const { count: estBefore } = await supabase.from("establishments").select("*", { count: "exact", head: true });
  const { count: stagingBefore } = await supabase.from("establishment_import_staging").select("*", { count: "exact", head: true });
  const { count: registryBefore } = await supabase.from("establishment_registry_identifiers").select("*", { count: "exact", head: true });
  const { count: minsanteStagingCount } = await supabase.from("establishment_import_staging").select("*", { count: "exact", head: true }).eq("source_ministry", "MINSANTE");
  console.log(`Baseline : establishments=${estBefore}, staging=${stagingBefore}, registry_identifiers=${registryBefore}, MINSANTE staging=${minsanteStagingCount}`);
  console.log(`Project ref confirmé : ${projectRef} (attendu umcwwynrftidytxgqkwi)`);
  if (projectRef !== "umcwwynrftidytxgqkwi") {
    console.log("\nPROJET INATTENDU — STOP.");
    process.exit(1);
  }

  // ── §3 — Snapshot d'approbation : charge EXACTEMENT le fichier existant,
  // ne le régénère JAMAIS dans ce sprint (§21 immutabilité). ─────────────
  const snapshot = JSON.parse(readFileSync(join(rootDir, "reports", "registry", "minsante-f-pilot-approval.json"), "utf-8"));
  console.log(`\nSnapshot chargé : ${snapshot.candidate_count} candidat(s) (attendu ${EXPECTED_CANDIDATE_COUNT})`);
  if (snapshot.candidate_count !== EXPECTED_CANDIDATE_COUNT || snapshot.candidates.length !== EXPECTED_CANDIDATE_COUNT) {
    console.log("INCOHÉRENCE — le snapshot ne contient pas exactement 8 candidats. STOP, ne pas régénérer.");
    process.exit(1);
  }

  const snapshotIds: string[] = snapshot.candidates.map((c: any) => c.staging_id).sort();

  // ── §3 — Population EXACTE du snapshot, chargée par staging_id (§4 :
  // jamais dérivée d'un re-matching ou d'un statut seul qui pourrait
  // inclure d'autres lignes). ────────────────────────────────────────────
  const approvedRows = await fetchAllPaginated<any>(
    supabase,
    "establishment_import_staging",
    "id,name_raw,region,city,status,source_ministry,education_family,source_url,raw_data,fingerprint,promoted_establishment_id,data_source_id",
    (q) => q.in("id", snapshotIds)
  );
  console.log(`Lignes staging trouvées pour les 8 staging_id du snapshot : ${approvedRows.length} (attendu 8)`);
  if (approvedRows.length !== EXPECTED_CANDIDATE_COUNT) {
    console.log("INCOHÉRENCE — au moins une ligne staging du snapshot est introuvable (supprimée ?). STOP.");
    process.exit(1);
  }

  // Recalcul EXACT du même algorithme que minsante-f-reclassify.ts (§3 :
  // tri déterministe par staging_id, champs identiques, sha256(JSON.stringify(...))).
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

  console.log(`\nChecksum attendu (prompt)        : ${EXPECTED_CHECKSUM_FROM_PROMPT}`);
  console.log(`Checksum stocké (approval.json)  : ${snapshot.checksum}`);
  console.log(`Checksum recalculé (état actuel) : ${computedChecksum}`);
  const checksumValid = computedChecksum === EXPECTED_CHECKSUM_FROM_PROMPT && computedChecksum === snapshot.checksum && EXPECTED_CHECKSUM_FROM_PROMPT === EXPECTED_APPROVAL_CHECKSUM;
  console.log(`Checksum valide (3 valeurs identiques) : ${checksumValid}`);
  if (!checksumValid) {
    console.log("\nCHECKSUM INVALIDE — STOP. La population approuvée a changé depuis MINSANTE-F, ou le snapshot a dérivé. Ne PAS régénérer un nouveau snapshot dans ce sprint.");
    process.exit(1);
  }

  // ── §20 — preuve mécanique que les 14 différés (13 CATEGORY_REVIEW + 1
  // DUPLICATE_REVIEW) ne peuvent jamais entrer dans le payload de ce
  // pre-flight, même si ce sprint re-matche/re-classe le reste du pilote. ──
  const allPilotRows = (await fetchAllPaginated<any>(supabase, "establishment_import_staging", "id,name_raw,raw_data", (q) => q.eq("source_ministry", "MINSANTE"))).filter((r) => r.raw_data?.batch === BATCH_ID);
  console.log(`\nPopulation complète du pilote MINSANTE (batch ${BATCH_ID}) relue : ${allPilotRows.length} (attendu 22)`);
  const deferredCategoryReview = allPilotRows.filter((r) => r.raw_data?.classification === "CATEGORY_REVIEW" && !snapshotIds.includes(r.id));
  const deferredDuplicateReview = allPilotRows.filter((r) => r.raw_data?.classification === "DUPLICATE_REVIEW" && !snapshotIds.includes(r.id));
  const deferredLeakIntoSnapshot = snapshotIds.filter((id) => {
    const row = allPilotRows.find((r) => r.id === id);
    return !row || (row.raw_data?.classification !== "CLEAN_APPROVABLE");
  });
  console.log(`CATEGORY_REVIEW différés (hors snapshot) : ${deferredCategoryReview.length} (attendu 13)`);
  console.log(`DUPLICATE_REVIEW différé (hors snapshot)  : ${deferredDuplicateReview.length} (attendu 1)`);
  console.log(`Fuite d'un candidat différé DANS le snapshot approuvé : ${deferredLeakIntoSnapshot.length} (attendu 0)`);
  const deferredProtectionOk = deferredCategoryReview.length === 13 && deferredDuplicateReview.length === 1 && deferredLeakIntoSnapshot.length === 0;
  if (!deferredProtectionOk) {
    console.log("\nPROTECTION DE POPULATION DIFFÉRÉE VIOLÉE — STOP.");
    process.exit(1);
  }

  // ── §5/§6/§7/§8/§9 — revalidation live complète ────────────────────────
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

  // §8 — cibles staging = TOUT le staging SAUF les 8 candidats approuvés
  // eux-mêmes (jamais comparer le batch contre lui-même, jamais de faux
  // conflit fraternel) ET SAUF les lignes déjà promues (ghost redondant).
  const approvedIds = new Set(snapshotIds);
  const stagingTargets: MatchTarget[] = allStaging
    .filter((s) => !approvedIds.has(s.id) && s.status !== "promoted")
    .map((s) => ({ id: `staging:${s.id}`, name: s.name_raw, region: s.region, city: s.city, category: s.education_family, identifiers: [] }));
  const allTargets = [...liveTargets, ...stagingTargets];
  console.log(`\nCibles de matching (§8) : ${liveTargets.length} live + ${stagingTargets.length} staging (8 candidats approuvés + lignes promues exclus, jamais le batch contre lui-même)`);

  // §9 — cibles MINESUP dédiées pour la frontière inter-ministérielle.
  const minesupIdRows = registryIds.filter((r) => r.authority === "MINESUP");
  const minesupEstablishmentIds = [...new Set(minesupIdRows.map((r) => r.establishment_id))];
  const estById = new Map(liveEst.map((e) => [e.id, e]));
  const minesupTargets: MatchTarget[] = minesupEstablishmentIds
    .map((id) => estById.get(id))
    .filter((e): e is LiveEst => !!e)
    .map((e) => ({ id: e.id, name: e.name, region: e.region, city: e.city, category: mainCategoryToEducationFamily(e.main_category), identifiers: idsByEstablishment.get(e.id) ?? [] }));
  console.log(`Cibles MINESUP dédiées (§9) : ${minesupTargets.length}`);

  const existingSlugs = new Set(liveEst.map((e) => e.slug).filter((s): s is string => !!s));

  type Decision =
    | "ELIGIBLE"
    | "ALREADY_LIVE"
    | "CONFLICT"
    | "DUPLICATE_SIGNAL"
    | "CATEGORY_CHANGED"
    | "SOURCE_ISSUE"
    | "PII_ISSUE"
    | "CROSS_MINISTRY_CONFLICT"
    | "INVALID";

  interface Reval {
    row: any;
    decision: Decision;
    matchLevel: string;
    matchedTargetId: string | null;
    matchedTargetName: string | null;
    matchAlternativeNames: string[];
    matchReason: string;
    crossMinistryLevel: string;
    crossMinistryTargetId: string | null;
    piiIssue: boolean;
    mainCategory: string | null;
    slug: string;
    slugConflict: boolean;
    requiredFieldsMissing: string[];
  }

  const revalResults: Reval[] = [];
  const usedSlugsThisRun = new Set<string>();
  let piiResidualTotal = 0;

  for (const r of approvedRows) {
    const raw = r.raw_data as any;
    const snapshotEntry = snapshot.candidates.find((c: any) => c.staging_id === r.id);

    // §6 — revalidation PII : raw_data, source_url, program metadata,
    // classification metadata, PLUS le rapport snapshot lui-même et le
    // payload production planifié ci-dessous.
    const rawStr = JSON.stringify(raw);
    const snapshotStr = JSON.stringify(snapshotEntry);
    const piiPattern = /nom\s+du\s+(promoteur|repr[eé]sentant\s+l[eé]gal)\s*:?\s*[a-z]/i;
    const piiInRaw = piiPattern.test(rawStr) && !/REDACTED/i.test(rawStr);
    const piiInSnapshot = piiPattern.test(snapshotStr) && !/REDACTED/i.test(snapshotStr);
    const piiInUrl = typeof r.source_url === "string" && /nom-du-promoteur|nom-du-representant/i.test(r.source_url);
    const piiIssue = piiInRaw || piiInSnapshot || piiInUrl;
    if (piiIssue) piiResidualTotal++;

    // §5 — statut/provenance/promotion intacts.
    const stillReady = r.status === "ready";
    const stillMinsante = r.source_ministry === "MINSANTE";
    const stillCleanApprovable = raw?.classification === "CLEAN_APPROVABLE";
    const notAlreadyPromoted = !r.promoted_establishment_id;
    const provenanceIntact = !!r.source_url && !!r.data_source_id;
    const programsIntact = Array.isArray(raw?.programs_normalized) && raw.programs_normalized.length > 0 && JSON.stringify([...raw.programs_normalized].sort()) === JSON.stringify([...(snapshotEntry?.programs ?? [])].sort());
    const sourceIssue = !stillReady || !stillMinsante || !notAlreadyPromoted || !provenanceIntact;

    // §7 — catégorie toujours résolue, main_category = decision snapshot, education_family inchangé.
    const currentMainCategory: string | null = raw?.category_decision === "SUPERIEUR_CONFIRMED" ? "superieur" : raw?.category_decision === "AUTRES_CONFIRMED" ? "autres" : null;
    const categoryStillResolved = currentMainCategory !== null;
    const categoryUnchanged = currentMainCategory === snapshotEntry?.main_category;
    const educationFamilyOk = r.education_family === "health_training" && snapshotEntry?.education_family === "health_training";
    const categoryChanged = !categoryStillResolved || !categoryUnchanged || !educationFamilyOk;

    // §8/§9 — matching frais contre live+staging (hors batch) et contre MINESUP dédié.
    const candidate = { name: r.name_raw, region: r.region, city: r.city, category: r.education_family, identifiers: [] };
    const match = matchCandidate(candidate, allTargets);
    const crossMinistryCandidate = { name: r.name_raw, region: r.region, city: r.city, category: null, identifiers: [] };
    const crossMatch = matchCandidate(crossMinistryCandidate, minesupTargets);
    const crossMinistryConflict = crossMatch.level === "EXACT_IDENTIFIER" || crossMatch.level === "EXACT_IDENTITY" || crossMatch.level === "STRONG_MATCH";

    // §12 — slug précalculé, désambiguïsation déterministe.
    const base = slugify(r.name_raw);
    let slug = base,
      n = 1;
    while (existingSlugs.has(slug) || usedSlugsThisRun.has(slug)) {
      slug = `${base}-${n}`;
      n++;
    }
    const slugConflict = slug !== base;
    usedSlugsThisRun.add(slug);

    // §13 — audit champs requis sur le payload PLANIFIÉ (jamais seulement le slug).
    const plannedPayload: Record<string, unknown> = {
      name: r.name_raw,
      slug,
      main_category: currentMainCategory,
      region: r.region,
      city: r.city ?? null,
    };
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

    revalResults.push({
      row: r,
      decision,
      matchLevel: match.level,
      matchedTargetId: match.target?.id ?? null,
      matchedTargetName: match.target?.name ?? null,
      matchAlternativeNames: match.alternativeTargets.map((t) => t.name),
      matchReason: match.reason,
      crossMinistryLevel: crossMatch.level,
      crossMinistryTargetId: crossMatch.target?.id ?? null,
      piiIssue,
      mainCategory: currentMainCategory,
      slug,
      slugConflict,
      requiredFieldsMissing,
    });
  }

  const revalTally = { eligible: 0, already_live: 0, conflict: 0, duplicate_signal: 0, category_changed: 0, source_issue: 0, pii_issue: 0, cross_ministry_conflict: 0, invalid: 0 };
  for (const r of revalResults) revalTally[r.decision.toLowerCase() as keyof typeof revalTally]++;
  console.log("\nRevalidation live (§5) :", revalTally);
  console.log(`Résidu PII total (§6) : ${piiResidualTotal} (attendu 0)`);

  const eligible = revalResults.filter((r) => r.decision === "ELIGIBLE");
  const slugBatchConflicts = eligible.filter((r) => r.slugConflict);
  const existingSlugCollisions = eligible.filter((r) => existingSlugs.has(slugify(r.row.name_raw)));
  const requiredFieldBlockers = revalResults.filter((r) => r.requiredFieldsMissing.length > 0);

  // ── §10 — stratégie d'identifiants : aucun identifiant MINSANTE validé
  // n'existe. registry identifiers planned = 0, TOUJOURS, jamais inventé. ──
  const registryIdentifiersPlanned = 0;

  // ── §11/§12/§14 — dry run ───────────────────────────────────────────────
  const wouldInsertEstablishments = eligible.length;
  const wouldLinkStaging = eligible.length;
  const wouldUpdateExisting = 0;
  const wouldDelete = 0;
  const wouldInsertRegistryIdentifiers = registryIdentifiersPlanned;
  const expectedEstablishmentsAfter = (estBefore ?? 0) + wouldInsertEstablishments;

  console.log("\n=== MINSANTE-G PROMOTION DRY RUN (§14) ===");
  console.log(`Would insert establishments: ${wouldInsertEstablishments}`);
  console.log(`Would link staging: ${wouldLinkStaging}`);
  console.log(`Would update existing: ${wouldUpdateExisting}`);
  console.log(`Would delete: ${wouldDelete}`);
  console.log(`Would insert registry identifiers: ${wouldInsertRegistryIdentifiers}`);
  console.log(`Expected establishments after: ${expectedEstablishmentsAfter}`);

  const readyToCommit =
    checksumValid &&
    deferredProtectionOk &&
    approvedRows.length === EXPECTED_CANDIDATE_COUNT &&
    eligible.length === EXPECTED_CANDIDATE_COUNT && // AUCUN candidat approuvé n'a été dégradé — jamais un sous-ensemble plus petit
    revalTally.pii_issue === 0 &&
    revalTally.cross_ministry_conflict === 0 &&
    requiredFieldBlockers.length === 0 &&
    slugBatchConflicts.length === 0 &&
    existingSlugCollisions.length === 0 &&
    piiResidualTotal === 0;
  console.log(`\nREADY TO COMMIT : ${readyToCommit ? "YES" : "NO"}`);
  if (!readyToCommit) {
    console.log("Raison : au moins un candidat approuvé n'est plus ELIGIBLE en l'état actuel, ou une collision/PII/champ requis/conflit inter-ministériel non résolu existe. Ne PAS dégrader localement — STOP et rapporter.");
  }

  // ── §22 — Review Center : les lignes promues resteraient auditables via
  // status/promoted_establishment_id/raw_data.classification — aucune
  // réécriture UI dans ce sprint, vérification statique du contrat. ────────
  const reviewCenterBlocksPromotion = false; // aucun obstacle structurel identifié (mêmes colonnes que MINESUP-D/F, déjà consommées par src/lib/registryReview.ts)

  // ── §23 — Search V2 : revue statique de src/app/api/recherche/route.ts
  // (aucune modification ce sprint) — pagination bornée (.range), jamais de
  // full-table fetch, aucune référence à establishment_import_staging (donc
  // aucune fuite de staging possible structurellement), accents gérés par
  // normalizeSearchText/queryBuilder (inchangés). Documenté, pas ré-exécuté
  // en profondeur ici (aucun changement de code candidat à régresser).
  const searchV2 = { regression: "STATIC_REVIEW_NO_CODE_CHANGE", staging_leakage: false, full_table_fetch: false };

  // ── §24 — Rapports ──────────────────────────────────────────────────────
  mkdirSync(join(rootDir, "reports", "registry"), { recursive: true });

  const revalHeaders = ["staging_id", "name", "region", "city", "decision", "match_level", "matched_target_id", "matched_alternative_names", "cross_ministry_level", "pii_issue", "main_category", "slug", "slug_conflict", "required_fields_missing"];
  const revalLines = [revalHeaders.join(",")];
  for (const r of revalResults)
    revalLines.push(
      [
        csvEscape(r.row.id),
        csvEscape(r.row.name_raw),
        csvEscape(r.row.region),
        csvEscape(r.row.city),
        csvEscape(r.decision),
        csvEscape(r.matchLevel),
        csvEscape(r.matchedTargetId),
        csvEscape(r.matchAlternativeNames.join(" | ")),
        csvEscape(r.crossMinistryLevel),
        csvEscape(r.piiIssue),
        csvEscape(r.mainCategory),
        csvEscape(r.slug),
        csvEscape(r.slugConflict),
        csvEscape(r.requiredFieldsMissing.join("|")),
      ].join(",")
    );
  writeFileSync(join(rootDir, "reports", "registry", "minsante-g-live-revalidation.csv"), revalLines.join("\n"), "utf-8");

  // ── Diagnostic §8 — analyse de cause racine pour toute DUPLICATE_SIGNAL
  // (jamais "fix and promote" dans ce sprint, §26 : documenter, ne pas
  // corriger le moteur de matching ici). Chaque signal observé ce sprint
  // provient de la comparaison des candidats approuvés contre les 13
  // CATEGORY_REVIEW/1 DUPLICATE_REVIEW du MÊME pilote (siblings), jamais
  // contre un établissement déjà en production — cette comparaison
  // "candidats approuvés vs. staging MINSANTE sœur" n'avait jamais été
  // exécutée par les sprints B-F (qui ne comparaient qu'à `liveTargets`/
  // `minesupTargets`, jamais aux AUTRES lignes staging du même pilote).
  const duplicateSignalRows = revalResults.filter((r) => r.decision === "DUPLICATE_SIGNAL");
  const duplicateSignalAnalysis = {
    count: duplicateSignalRows.length,
    check_is_new_this_sprint: true,
    note:
      "§8 exige explicitement de comparer les candidats approuvés contre le staging PERTINENT HORS population approuvée — ce qui inclut, pour la première fois dans ce pilote, les 13 CATEGORY_REVIEW + 1 DUPLICATE_REVIEW du MÊME batch minsante-pilot-v1 (jamais comparés entre eux par MINSANTE-B/C/D/E/F, qui ne matchaient les candidats que contre les établissements déjà en production et contre MINESUP). Root cause observée (inspection manuelle de match.alternativeTargets pour chaque AMBIGUOUS/PROBABLE_MATCH) : (1) toutes les lignes du pilote partagent region='Ouest' et city=NULL (colonne city jamais renseignée pour ce batch) — la géographie ne peut donc JAMAIS départager deux candidats, elle est toujours 'cohérente par défaut' ; (2) le nom de ville figure UNIQUEMENT à l'intérieur du texte du nom officiel (ex. '... DE BAFOUSSAM') et devient donc un mot significatif du chevauchement flou (fuzzyWords) au même titre qu'un nom propre, alors que Bafoussam/Bafang/Dschang hébergent chacune plusieurs établissements MINSANTE réels et DISTINCTS ; (3) le mot de rôle générique 'infirmiers' (et dans une moindre mesure 'diplômés'/'sciences') n'est pas encore dans FUZZY_STOPWORDS (engine.ts) alors qu'il joue exactement le même rôle que 'santé'/'médico'/'personnel'/'sanitaire', déjà retirés sur la base d'un précédent documenté (SPRINT MINSANTE-B §6-7). Évaluation humaine des 7 cas : AUCUN n'apparaît être un doublon réel (noms/fondateurs/sigles distinctifs différents dans chaque paire — ex. 'ECOLE DES INFIRMIERS DIPLOMES D'ETAT DE FOUMBAN' vs 'INSTITUT TROPICAL DE FORMATION EN PLAIES CHRONIQUES ET EN SOINS INFIRMIERS \"MOULLEC\" DE BALEVENG', seul mot commun significatif : 'infirmiers'). Conclusion : très probable limitation connue du moteur de matching (vocabulaire de rôle santé + géographie non discriminante quand city=NULL), PAS une preuve de doublon réel — mais §26 interdit explicitement de corriger le moteur et de re-promouvoir dans le même sprint ('Do not fix and promote'). STOP maintenu, ELIGIBLE=1 rapporté tel quel, sans dégradation locale du seuil de preuve.",
    recommendation:
      "Sprint dédié futur (ex. MINSANTE-H) : (a) ajouter 'infirmiers'/'diplome'/'diplomes' à FUZZY_STOPWORDS avec preuve documentée comme les précédents 'santé'/'médico', (b) backfiller la colonne city pour le batch minsante-pilot-v1 depuis le nom officiel (déjà présent en texte libre) pour rendre la géographie réellement discriminante, (c) revue humaine explicite des 7 paires signalées pour confirmer qu'aucune n'est un doublon réel avant toute nouvelle tentative de pre-flight.",
    signals: duplicateSignalRows.map((r) => ({ staging_id: r.row.id, name: r.row.name_raw, match_level: r.matchLevel, matched_target_name: r.matchedTargetName, alternative_target_names: r.matchAlternativeNames, reason: r.matchReason })),
  };

  const slugHeaders = ["staging_id", "name", "slug", "valid", "existing_collision", "batch_collision"];
  const slugLines = [slugHeaders.join(",")];
  for (const r of revalResults) slugLines.push([csvEscape(r.row.id), csvEscape(r.row.name_raw), csvEscape(r.slug), csvEscape(!!r.slug && r.slug.length > 0), csvEscape(existingSlugs.has(slugify(r.row.name_raw))), csvEscape(r.slugConflict)].join(","));
  writeFileSync(join(rootDir, "reports", "registry", "minsante-g-slug-audit.csv"), slugLines.join("\n"), "utf-8");

  const dryRun = {
    would_insert_establishments: wouldInsertEstablishments,
    would_link_staging: wouldLinkStaging,
    would_update_existing: wouldUpdateExisting,
    would_delete: wouldDelete,
    would_insert_registry_identifiers: wouldInsertRegistryIdentifiers,
    conflicts: slugBatchConflicts.length + existingSlugCollisions.length + requiredFieldBlockers.length,
    expected_establishments_after: expectedEstablishmentsAfter,
  };
  writeFileSync(join(rootDir, "reports", "registry", "minsante-g-dry-run.json"), JSON.stringify(dryRun, null, 2), "utf-8");

  const deferredProtection = {
    generated_at: new Date().toISOString(),
    sprint: "MINSANTE-G",
    snapshot_candidate_count: EXPECTED_CANDIDATE_COUNT,
    total_pilot: allPilotRows.length,
    category_review_excluded: deferredCategoryReview.length,
    duplicate_review_excluded: deferredDuplicateReview.length,
    deferred_leak_into_snapshot: deferredLeakIntoSnapshot.length,
    other_non_approved_excluded: true,
    protection_ok: deferredProtectionOk,
    note: "Population de promotion chargée EXCLUSIVEMENT par les 8 staging_id du snapshot minsante-f-pilot-approval.json (§4) — jamais dérivée d'un statut/re-matching qui pourrait laisser passer un candidat CATEGORY_REVIEW ou DUPLICATE_REVIEW différé, même si son nom/sa catégorie semble valide (§20).",
  };
  writeFileSync(join(rootDir, "reports", "registry", "minsante-g-deferred-protection.json"), JSON.stringify(deferredProtection, null, 2), "utf-8");

  const summary = {
    sprint: "MINSANTE-G",
    operator: OPERATOR,
    generated_at: new Date().toISOString(),
    repository_context: { repository: "mboaschool", cross_project_context_safe: true, note: "Aucun CLAUDE.md/AGENTS.md mboaschool à la racine — contexte klassia étranger (session hôte) ignoré, confirmé lors de MINSANTE-E/F et re-vérifié ce sprint." },
    database: { project_ref: projectRef, establishments: estBefore, staging: stagingBefore, registry_identifiers: registryBefore, minsante_staging: minsanteStagingCount },
    approval: {
      snapshot_candidates: snapshot.candidate_count,
      checksum_expected_prompt: EXPECTED_CHECKSUM_FROM_PROMPT,
      checksum_stored: snapshot.checksum,
      checksum_recomputed: computedChecksum,
      checksum_valid: checksumValid,
    },
    live_revalidation: revalTally,
    duplicate_signal_analysis: duplicateSignalAnalysis,
    pii: { candidates_checked: approvedRows.length, residual: piiResidualTotal, safe: piiResidualTotal === 0 },
    category: {
      health_training: approvedRows.filter((r) => r.education_family === "health_training").length,
      resolved_main_categories: revalResults.filter((r) => r.mainCategory !== null).length,
      category_changes: revalTally.category_changed,
      blocking_category_issues: revalTally.category_changed,
    },
    identifiers: { validated_identifiers: 0, identifiers_planned: registryIdentifiersPlanned, collisions: 0, note: "§10 — aucun identifiant MINSANTE validé n'existe encore. Jamais inventé (official_id/agrément/décret)." },
    slug_audit: { candidates: revalResults.length, valid: revalResults.filter((r) => r.slug.length > 0).length, existing_collisions: existingSlugCollisions.length, batch_collisions: slugBatchConflicts.length, resolution_required: slugBatchConflicts.length > 0 || existingSlugCollisions.length > 0 },
    required_fields: { checked: BLOCKING_REQUIRED_FIELDS, candidates_missing_fields: requiredFieldBlockers.length, blocking_fields: requiredFieldBlockers.flatMap((r) => r.requiredFieldsMissing) },
    dry_run: dryRun,
    deferred_protection: deferredProtection,
    review_center: { blocks_promotion: reviewCenterBlocksPromotion },
    search_v2: searchV2,
    production_writes: 0,
    ready_to_commit: readyToCommit,
  };
  writeFileSync(join(rootDir, "reports", "registry", "minsante-g-preflight-summary.json"), JSON.stringify(summary, null, 2), "utf-8");

  console.log("\nRapports écrits dans reports/registry/minsante-g-*");

  // ── §17/§19 — chemin d'écriture GARDÉ, jamais invoqué avec des flags
  // valides dans CE sprint (PRE-FLIGHT uniquement, §27 : "DO NOT RUN --commit"
  // même si tout est vert). Présent pour que les tests de refus (§19)
  // portent sur le vrai chemin de code. ─────────────────────────────────
  const commit = hasFlag("commit");
  if (commit) {
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
    // Non atteint dans ce sprint (aucun appel avec des flags valides n'est
    // effectué) — §27 : exécution réelle explicitement HORS PÉRIMÈTRE de
    // MINSANTE-G, réservée à un sprint futur avec autorisation humaine séparée.
    console.log("\n=== EXÉCUTION RÉELLE NON IMPLÉMENTÉE DANS CE SPRINT (§27 — hors périmètre MINSANTE-G) ===");
    process.exitCode = 1;
    return;
  }

  // ── §28 — post-condition — PRE-FLIGHT ne doit RIEN écrire ────────────────
  const { count: estAfter } = await supabase.from("establishments").select("*", { count: "exact", head: true });
  const { count: stagingAfter } = await supabase.from("establishment_import_staging").select("*", { count: "exact", head: true });
  const { count: registryAfter } = await supabase.from("establishment_registry_identifiers").select("*", { count: "exact", head: true });
  console.log(`\nPOST-CONDITION PRE-FLIGHT (§28) : establishments ${estBefore}->${estAfter} | staging ${stagingBefore}->${stagingAfter} | registry_identifiers ${registryBefore}->${registryAfter}`);
  if (estAfter !== estBefore || stagingAfter !== stagingBefore || registryAfter !== registryBefore) {
    console.log("VIOLATION — le pre-flight a écrit dans une table protégée. STOP.");
    process.exit(1);
  }

  console.log("\n\nSTOP — WAIT FOR EXPLICIT HUMAN APPROVAL.");
}

main().catch((error) => {
  console.error("Échec pre-flight MINSANTE-G :", error);
  process.exit(1);
});
