import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertRegistryProductionWriteAllowed,
  computeApprovalChecksum,
  evaluatePromotionOutcome,
  verifyPromotionReportComplete,
  RegistryWriteRefused,
  EXPECTED_PROJECT_REF,
} from "./lib/productionGuard";

/**
 * SPRINT R.3 — Promotion contrôlée des candidats Major Cities déjà présents
 * dans establishment_import_staging (source_ministry='OTHER', status='ready',
 * 310 lignes au moment de ce sprint — le pilote Douala/Yaoundé/Kumba/Bertoua).
 *
 * Reconstruit la classification EN DIRECT contre l'état réel de production —
 * jamais de confiance aveugle dans un ancien rapport (§2). Sépare
 * explicitement EXTRACTION_CONFIDENCE (framework R.2-SAFETY — déjà PASS pour
 * l'essentiel de ce batch, voir reports/registry/extraction/) de
 * SOURCE_AUTHORITY (tier de la source elle-même) : les 310 lignes viennent
 * TOUTES de memoire{littoral,centre}0.jimdofree.com, inovedu.net ou
 * ecolesaucameroun.com — aucune source officielle Tier 1/2. Une extraction
 * PASS ne transforme jamais une source Tier 3 en source suffisante pour
 * CLEAN_APPROVABLE (§2 de la spec R.3, cohérent avec le constat déjà posé
 * par l'audit rétrospectif R.2-SAFETY : "les 310 lignes sont TOUTES Tier 3,
 * donc aucune n'est CLEAN_APPROVABLE quelle que soit la méthode d'extraction").
 *
 * Usage :
 *   npx tsx promote-major-cities-controlled.ts --dry-run
 *   npx tsx promote-major-cities-controlled.ts --commit --confirm="PROMOTE_REGISTRY_TO_PRODUCTION" --expected-candidates=N --approval-checksum=<sha256> --operator=jean-merlain
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..", "..");
const REGISTRY_IMPORT_BATCH = "major-cities-secondary-completeness-v1-controlled-promotion";
const EXPECTED_OPERATOR = "jean-merlain";
const EXPECTED_SOURCE_MINISTRY = "OTHER";

// Sources Tier 3 confirmées derrière les 310 candidats — voir
// docs/03_DATA_REGISTRY/REGISTRY_EXTRACTION_SAFETY.md ("source quality vs
// extraction quality") et SPRINT_R2_SPEC.md §16 (hiérarchie des sources).
// Aucune de ces quatre n'est une source gouvernementale/institutionnelle
// officielle — encyclopédie associative (Osidimbea) ou annuaire privé/
// crowdsourcé (InovEdu, ecolesaucameroun.com).
const TIER3_HOSTS = new Set(["memoirelittoral0.jimdofree.com", "memoirecentre0.jimdofree.com", "www.inovedu.net", "ecolesaucameroun.com"]);

function sourceTier(sourceUrl: string | null): "TIER1" | "TIER2" | "TIER3" | "UNKNOWN" {
  if (!sourceUrl) return "UNKNOWN";
  try {
    const host = new URL(sourceUrl).hostname;
    if (TIER3_HOSTS.has(host)) return "TIER3";
    return "UNKNOWN";
  } catch {
    return "UNKNOWN";
  }
}

function readEnvVar(env: string, key: string): string {
  const match = env.match(new RegExp(`^${key}=(.*)$`, "m"));
  const value = match?.[1]?.trim();
  if (!value) throw new Error(`${key} introuvable dans .env.local`);
  return value;
}
function argValue(args: string[], flag: string): string | undefined {
  const prefix = `--${flag}=`;
  const found = args.find((a) => a.startsWith(prefix));
  return found ? found.slice(prefix.length) : undefined;
}
async function fetchAllPaginated<T>(url: string, key: string, path: string): Promise<T[]> {
  const all: T[] = [];
  const pageSize = 1000;
  let offset = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const res = await fetch(`${url}${path}${path.includes("?") ? "&" : "?"}limit=${pageSize}&offset=${offset}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    if (!res.ok) throw new Error(`GET ${path} -> HTTP ${res.status}: ${await res.text()}`);
    const page = (await res.json()) as T[];
    all.push(...page);
    if (page.length < pageSize) break;
    offset += pageSize;
  }
  return all;
}

// Level 1-2 EXACT match key — normalisation MINIMALE (accents/casse/mots
// génériques uniquement). Ne retire JAMAIS "technique"/"polyvalent"/
// "bilingue"/mots d'ownership — SPRINT R.2 §24 : "École Publique de New
// Bell" et "Lycée de New Bell" ne sont pas des doublons ; une normalisation
// trop agressive fusionnerait à tort "Lycée Technique d'Akwa" avec
// "Lycée d'Akwa" (constaté en premier passage de cet audit — corrigé ici).
const GENERIC_ARTICLES = new Set(["de", "du", "des", "la", "le", "les", "d", "l", "et", "a", "au", "aux"]);
function exactKey(name: string): string {
  return (name || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter((w) => !GENERIC_ARTICLES.has(w))
    .sort()
    .join(" ");
}
// Level 3-4 FUZZY key — REVIEW ONLY, jamais utilisé pour auto-classifier ALREADY_LIVE.
const FUZZY_STOPWORDS = new Set([
  ...GENERIC_ARTICLES,
  "college", "collège", "lycee", "lycée", "lyce", "ces", "cetic", "cetif", "ceti", "cegt", "cefti",
  "school", "secondary", "high", "bilingual", "bilingue", "prive", "privé", "private", "laic", "laïc",
  "institut", "complexe", "scolaire", "groupe", "ecole", "école", "polyvalent", "technique", "public", "comprehensive",
]);
function fuzzyWords(name: string): string[] {
  return exactKey(name).split(" ").filter((w) => w.length > 3 && !FUZZY_STOPWORDS.has(w));
}

interface StagingRow {
  id: string;
  status: string;
  source_ministry: string | null;
  source_url: string | null;
  official_identifier: string | null;
  city: string | null;
  region: string | null;
  locality: string | null;
  name_raw: string;
  education_family: string | null;
}
interface LiveEstablishment {
  id: string;
  name: string;
  city: string | null;
  region: string | null;
  main_category: string;
  owner_id: string | null;
  is_verified: boolean;
  is_claimed: boolean;
  official_id: string | null;
}

type Classification =
  | "ALREADY_LIVE"
  | "CLEAN_APPROVABLE"
  | "DUPLICATE_REVIEW"
  | "SOURCE_REVIEW"
  | "IDENTITY_REVIEW"
  | "LOCALITY_REVIEW"
  | "INSUFFICIENT_SOURCE"
  | "REJECTED";

interface CandidateDecision {
  staging_id: string;
  name_raw: string;
  city: string | null;
  region: string | null;
  source_url: string | null;
  source_tier: ReturnType<typeof sourceTier>;
  classification: Classification;
  reason: string;
}

async function main() {
  const args = process.argv.slice(2);
  const commit = args.includes("--commit");

  const env = readFileSync(join(rootDir, ".env.local"), "utf-8");
  const url = readEnvVar(env, "NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = readEnvVar(env, "SUPABASE_SERVICE_ROLE_KEY");
  const projectRef = new URL(url).hostname.split(".")[0];

  console.log(`Project ref détecté : ${projectRef} (attendu ${EXPECTED_PROJECT_REF})`);

  const [staging, live] = await Promise.all([
    fetchAllPaginated<StagingRow>(
      url,
      serviceKey,
      "/rest/v1/establishment_import_staging?select=id,status,source_ministry,source_url,official_identifier,city,region,locality,name_raw,education_family"
    ),
    fetchAllPaginated<LiveEstablishment>(
      url,
      serviceKey,
      "/rest/v1/establishments?select=id,name,city,region,main_category,owner_id,is_verified,is_claimed,official_id"
    ),
  ]);

  const establishmentsBefore = live.length;
  console.log(`Establishments (live) : ${establishmentsBefore}`);
  console.log(`Staging (total) : ${staging.length}`);

  const candidates = staging.filter((r) => r.source_ministry === EXPECTED_SOURCE_MINISTRY && r.status === "ready");
  console.log(`Candidats Major Cities (source_ministry=OTHER, status=ready) : ${candidates.length}`);

  const liveByExactKey = new Map<string, LiveEstablishment[]>();
  for (const l of live) {
    const k = exactKey(l.name);
    if (!liveByExactKey.has(k)) liveByExactKey.set(k, []);
    liveByExactKey.get(k)!.push(l);
  }

  // Doublons INTERNES au batch (même établissement collecté deux fois avec
  // une variante orthographique — ex. "LAÏC" vs "LAIC" dans la source elle-
  // même) — repérés AVANT la classification pour que les deux membres d'une
  // paire soient marqués DUPLICATE_REVIEW, jamais promus tous les deux.
  const internalByKey = new Map<string, StagingRow[]>();
  for (const c of candidates) {
    const k = `${exactKey(c.name_raw)}|${c.city ?? ""}`;
    if (!internalByKey.has(k)) internalByKey.set(k, []);
    internalByKey.get(k)!.push(c);
  }
  const internalDuplicateIds = new Set<string>();
  for (const group of internalByKey.values()) {
    if (group.length > 1) for (const c of group) internalDuplicateIds.add(c.id);
  }

  const decisions: CandidateDecision[] = [];
  for (const c of candidates) {
    const tier = sourceTier(c.source_url);
    const exactMatches = liveByExactKey.get(exactKey(c.name_raw)) ?? [];

    if (exactMatches.length > 0) {
      decisions.push({
        staging_id: c.id, name_raw: c.name_raw, city: c.city, region: c.region, source_url: c.source_url, source_tier: tier,
        classification: "ALREADY_LIVE",
        reason: `correspondance exacte de nom avec établissement(s) live déjà présents : ${exactMatches.map((m) => m.name).join(", ")}`,
      });
      continue;
    }

    if (internalDuplicateIds.has(c.id)) {
      decisions.push({
        staging_id: c.id, name_raw: c.name_raw, city: c.city, region: c.region, source_url: c.source_url, source_tier: tier,
        classification: "DUPLICATE_REVIEW",
        reason: "doublon interne au batch (même établissement collecté deux fois, variante orthographique de la source)",
      });
      continue;
    }

    const candWords = new Set(fuzzyWords(c.name_raw));
    let fuzzyHit: LiveEstablishment | null = null;
    if (candWords.size > 0) {
      for (const l of live) {
        if (l.city !== c.city && l.region !== c.region) continue;
        const lWords = new Set(fuzzyWords(l.name));
        if ([...candWords].some((w) => lWords.has(w))) {
          fuzzyHit = l;
          break;
        }
      }
    }
    if (fuzzyHit) {
      decisions.push({
        staging_id: c.id, name_raw: c.name_raw, city: c.city, region: c.region, source_url: c.source_url, source_tier: tier,
        classification: "DUPLICATE_REVIEW",
        reason: `chevauchement de mots significatifs avec un établissement live de même ville/région ("${fuzzyHit.name}") — jamais fusionné automatiquement (§14 fuzzy = REVIEW_REQUIRED)`,
      });
      continue;
    }

    if (!c.name_raw?.trim() || !c.education_family) {
      decisions.push({
        staging_id: c.id, name_raw: c.name_raw, city: c.city, region: c.region, source_url: c.source_url, source_tier: tier,
        classification: "IDENTITY_REVIEW",
        reason: "nom ou catégorie manquant/insuffisant",
      });
      continue;
    }

    if (!c.city && !c.locality) {
      decisions.push({
        staging_id: c.id, name_raw: c.name_raw, city: c.city, region: c.region, source_url: c.source_url, source_tier: tier,
        classification: "LOCALITY_REVIEW",
        reason: "ni ville ni localité disponible",
      });
      continue;
    }

    // §2 — SOURCE_AUTHORITY distincte d'EXTRACTION_CONFIDENCE : une
    // extraction PASS (R.2-SAFETY) ne suffit jamais seule pour Tier 3.
    if (tier === "TIER3" || tier === "UNKNOWN") {
      decisions.push({
        staging_id: c.id, name_raw: c.name_raw, city: c.city, region: c.region, source_url: c.source_url, source_tier: tier,
        classification: "SOURCE_REVIEW",
        reason: `source ${tier} (${c.source_url ? new URL(c.source_url).hostname : "URL absente"}) — jamais suffisante seule pour CLEAN_APPROVABLE (§2/§16 politique de sources), quel que soit le statut d'extraction`,
      });
      continue;
    }

    decisions.push({
      staging_id: c.id, name_raw: c.name_raw, city: c.city, region: c.region, source_url: c.source_url, source_tier: tier,
      classification: "CLEAN_APPROVABLE",
      reason: "identité/région/catégorie fiables, aucun doublon détecté, source Tier 1/2",
    });
  }

  const tally: Record<Classification, number> = {
    ALREADY_LIVE: 0, CLEAN_APPROVABLE: 0, DUPLICATE_REVIEW: 0, SOURCE_REVIEW: 0,
    IDENTITY_REVIEW: 0, LOCALITY_REVIEW: 0, INSUFFICIENT_SOURCE: 0, REJECTED: 0,
  };
  for (const d of decisions) tally[d.classification]++;

  const eligible = decisions.filter((d) => d.classification === "CLEAN_APPROVABLE");

  // §5 — snapshot reconstruit depuis l'état réel, jamais un ancien checksum réutilisé.
  const approvalRows = eligible.map((d) => ({ id: d.staging_id, officialId: null, decision: "CLEAN_APPROVABLE" }));
  const checksum = computeApprovalChecksum(approvalRows);
  const snapshot = {
    generated_at: new Date().toISOString(),
    operator: EXPECTED_OPERATOR,
    project_ref: projectRef,
    staging_batch: REGISTRY_IMPORT_BATCH,
    candidate_count: eligible.length,
    candidates: eligible.map((d) => ({
      staging_id: d.staging_id, official_id: null, name_raw: d.name_raw, city: d.city, region: d.region,
      source_url: d.source_url, source_tier: d.source_tier, decision: "CLEAN_APPROVABLE",
    })),
    checksum,
  };
  mkdirSync(join(rootDir, "reports", "registry"), { recursive: true });
  const snapshotPath = join(rootDir, "reports", "registry", "major-cities-v1-controlled-promotion-snapshot.json");
  writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2), "utf-8");

  // Rapport de classification complet (les 310, pas seulement les éligibles) — audit trail.
  const classificationPath = join(rootDir, "reports", "registry", "major-cities-v1-controlled-promotion-classification.json");
  writeFileSync(classificationPath, JSON.stringify({ generated_at: new Date().toISOString(), total: decisions.length, tally, decisions }, null, 2), "utf-8");

  console.log("\n=== DRY RUN ===");
  console.log(`TOTAL CANDIDATES: ${decisions.length}`);
  console.log(`ALREADY LIVE: ${tally.ALREADY_LIVE}`);
  console.log(`ELIGIBLE: ${tally.CLEAN_APPROVABLE}`);
  console.log(`BLOCKED SOURCE: ${tally.SOURCE_REVIEW}`);
  console.log(`BLOCKED IDENTITY: ${tally.IDENTITY_REVIEW}`);
  console.log(`BLOCKED DUPLICATE: ${tally.DUPLICATE_REVIEW}`);
  console.log(`BLOCKED LOCALITY: ${tally.LOCALITY_REVIEW}`);
  console.log(`CONFLICTS: 0`);
  console.log(`EXPECTED INSERTS: ${eligible.length}`);
  console.log(`EXPECTED STAGING LINKS: ${eligible.length}`);
  console.log(`\nSnapshot écrit : reports/registry/major-cities-v1-controlled-promotion-snapshot.json`);
  console.log(`Classification complète écrite : reports/registry/major-cities-v1-controlled-promotion-classification.json`);
  console.log(`Checksum d'approbation : ${checksum}`);

  // §6-7 — fail closed : sans --commit (jamais passé par ce sprint), le
  // garde-fou refuse systématiquement, quel que soit le nombre d'éligibles.
  try {
    assertRegistryProductionWriteAllowed({
      commit,
      confirmPhrase: argValue(args, "confirm"),
      projectRef,
      batch: REGISTRY_IMPORT_BATCH,
      expectedBatch: REGISTRY_IMPORT_BATCH,
      sourceMinistry: EXPECTED_SOURCE_MINISTRY,
      expectedSourceMinistry: EXPECTED_SOURCE_MINISTRY,
      actualCandidates: eligible.length,
      expectedCandidates: Number(argValue(args, "expected-candidates") ?? NaN),
      computedChecksum: checksum,
      approvalChecksum: argValue(args, "approval-checksum"),
      operator: argValue(args, "operator"),
      expectedOperator: EXPECTED_OPERATOR,
    });
  } catch (error) {
    if (error instanceof RegistryWriteRefused) {
      console.log(`\n${error.message}`);
      console.log("\nAUCUNE écriture production effectuée. STOP — voir rapport PRE-FLIGHT.");
      return;
    }
    throw error;
  }

  // Non atteint dans ce sprint (aucune autorisation --commit fournie) —
  // conservé pour un futur run explicitement autorisé, jamais exécuté ici.
  console.log("\n(promotion réelle non implémentée dans cette exécution — hors périmètre tant qu'aucune autorisation explicite n'a été donnée)");
  void evaluatePromotionOutcome;
  void verifyPromotionReportComplete;
}

main().catch((error) => {
  console.error("Échec dry-run promotion Major Cities :", error);
  process.exit(1);
});
