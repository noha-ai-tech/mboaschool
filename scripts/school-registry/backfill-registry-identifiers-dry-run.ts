import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { findIdentifierCollisions } from "./lib/matching/engine";
import type { MatchTarget } from "./lib/matching/types";

/**
 * SPRINT REGISTRY-MULTI-A §8 — simulation READ-ONLY du backfill de
 * `establishment_registry_identifiers` (migration 0021, préparée mais NON
 * exécutée). N'ÉCRIT RIEN — ni dans establishments, ni dans une nouvelle
 * table (qui n'existe pas encore en production). Produit uniquement un
 * rapport.
 *
 * Deux sources simulées :
 *  1. establishments.official_id existant (1938 lignes MINESEC connues) ->
 *     registry MINESEC_ESG.
 *  2. Les 161 établissements Major Cities promus SPRINT R.3.2, dont la
 *     corroboration cartescolaire vit aujourd'hui en texte libre dans
 *     source_reference — reconstituée ici depuis
 *     reports/registry/major-cities-official-corroboration-approval.json
 *     (source structurée, pas un re-parsing fragile du texte) pour tester
 *     le scénario RÉEL de double identifiant (§9 : "le modèle doit pouvoir
 *     représenter MINESEC_V1_ID + CARTESCOLAIRE_ID sans écraser l'un par
 *     l'autre").
 *
 * Usage : npx tsx backfill-registry-identifiers-dry-run.ts
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..", "..");

function readEnvVar(env: string, key: string): string {
  const match = env.match(new RegExp(`^${key}=(.*)$`, "m"));
  const value = match?.[1]?.trim();
  if (!value) throw new Error(`${key} introuvable dans .env.local`);
  return value;
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

interface LiveEstablishment {
  id: string;
  name: string;
  official_id: string | null;
  source_ministry: string | null;
  registry_import_batch: string | null;
}
interface ApprovalCandidate {
  staging_id: string;
  name: string;
  official_corroboration_id: string | null;
  official_corroboration_id_type: string | null;
}

// Format MINESEC_ESG — vérifié par LONGUEUR, pas par une regex de motif de
// caractères. Une première version de ce script imposait un segment médian
// fixe ("GSFD") qui s'est révélé faux à l'exécution : les 1935 identifiants
// de longueur 17 se répartissent en réalité sur 3 segments médians distincts
// (1GSF: 1191, 1GSB: 383, 1GSA: 361 — vraisemblablement francophone/
// bilingue/anglophone, jamais confirmé, jamais deviné ici) — inventer une
// regex de motif aurait classé à tort 764 identifiants pourtant valides
// comme "invalides". La longueur (17) reste le seul signal réellement
// homogène sur les 1938 lignes MINESEC connues (1935/1938 = 99.85%).
const ESG_EXPECTED_LENGTH = 17;

async function main() {
  const env = readFileSync(join(rootDir, ".env.local"), "utf-8");
  const url = readEnvVar(env, "NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = readEnvVar(env, "SUPABASE_SERVICE_ROLE_KEY");

  console.log("=== BACKFILL DRY RUN — establishment_registry_identifiers (LECTURE SEULE) ===\n");

  const live = await fetchAllPaginated<LiveEstablishment>(url, serviceKey, "/rest/v1/establishments?select=id,name,official_id,source_ministry,registry_import_batch");
  console.log(`Établissements (live) : ${live.length}`);

  const withOfficialId = live.filter((e) => e.official_id);
  const minesecCount = live.filter((e) => e.source_ministry === "MINESEC").length;
  const otherCount = live.filter((e) => e.source_ministry === "OTHER").length;

  console.log(`\nCombien possèdent official_id ? ${withOfficialId.length}`);
  console.log(`Combien ont source_ministry MINESEC ? ${minesecCount}`);
  console.log(`Combien OTHER ? ${otherCount}`);

  // Simulation des identifiants qui seraient produits — source 1 : official_id existant.
  const simulatedIdentifiers: (MatchTarget & { source: string })[] = [];
  let invalidFormat = 0;
  let unclassifiable = 0;

  for (const e of withOfficialId) {
    if (e.source_ministry === "MINESEC") {
      const value = e.official_id!.trim().toUpperCase();
      const valid = value.length === ESG_EXPECTED_LENGTH;
      if (!valid) {
        invalidFormat++;
        // Longueur inattendue -> REVIEW_REQUIRED, jamais inséré comme
        // MINESEC_ESG "propre" sans vérification humaine (§8 : ne jamais deviner).
        simulatedIdentifiers.push({
          id: e.id, name: e.name, region: null, city: null, category: null,
          identifiers: [],
          source: `official_id MINESEC de longueur inattendue (${value.length} caractères, attendu ${ESG_EXPECTED_LENGTH}) — REVIEW_REQUIRED, non inséré automatiquement`,
        });
        continue;
      }
      simulatedIdentifiers.push({
        id: e.id,
        name: e.name,
        region: null,
        city: null,
        category: null,
        identifiers: [{ registry: "MINESEC_ESG", identifier: value }],
        source: "official_id (MINESEC_ESG, longueur conforme)",
      });
    } else {
      // official_id non-null mais source_ministry != MINESEC : ne jamais deviner le registre.
      unclassifiable++;
      simulatedIdentifiers.push({
        id: e.id,
        name: e.name,
        region: null,
        city: null,
        category: null,
        identifiers: [],
        source: `official_id présent mais source_ministry="${e.source_ministry}" non reconnu pour un classement automatique — REVIEW_REQUIRED, aucun registre deviné`,
      });
    }
  }

  // Simulation — source 2 : corroboration cartescolaire des 161 Major Cities (source structurée, pas un re-parsing texte).
  let cartescolaireCandidates: ApprovalCandidate[] = [];
  try {
    const approval = JSON.parse(readFileSync(join(rootDir, "reports", "registry", "major-cities-official-corroboration-approval.json"), "utf-8"));
    cartescolaireCandidates = approval.candidates;
  } catch {
    console.log("\n(reports/registry/major-cities-official-corroboration-approval.json introuvable — section cartescolaire ignorée)");
  }

  const dualIdSimulation: (MatchTarget & { source: string })[] = [];
  for (const c of cartescolaireCandidates) {
    if (!c.official_corroboration_id) continue;
    dualIdSimulation.push({
      id: c.staging_id, // établissement réel non ré-identifié ici (staging_id sert de clé de simulation) — un vrai backfill lierait establishment_id via promoted_establishment_id, non recalculé dans ce dry-run
      name: c.name,
      region: null,
      city: null,
      category: null,
      identifiers: [{ registry: "MINESEC_CARTESCOLAIRE", identifier: c.official_corroboration_id.trim().toUpperCase() }],
      source: `corroboration cartescolaire R.3.2 (${c.official_corroboration_id_type})`,
    });
  }
  console.log(`\nCandidats de corroboration cartescolaire (161 promus R.3.2) exploitables pour simulation : ${dualIdSimulation.length}`);

  // Collisions (registry, identifier) — sur l'ENSEMBLE simulé (official_id existant + cartescolaire simulé).
  const allSimulated = [...simulatedIdentifiers.filter((s) => s.identifiers.length > 0), ...dualIdSimulation];
  const collisions = findIdentifierCollisions(allSimulated);
  console.log(`\nCombien de collisions (registry, identifier) ? ${collisions.length}`);
  for (const c of collisions.slice(0, 5)) console.log(`  - (${c.registry}, ${c.identifier}) revendiqué par ${c.targets.length} établissements`);

  // Doublons purs de la valeur identifier (même texte, indépendamment du registre) — signal informatif, PAS une collision au sens (registry, identifier).
  const byIdentifierTextOnly = new Map<string, Set<string>>();
  for (const s of allSimulated) {
    for (const id of s.identifiers) {
      const key = id.identifier;
      if (!byIdentifierTextOnly.has(key)) byIdentifierTextOnly.set(key, new Set());
      byIdentifierTextOnly.get(key)!.add(s.id);
    }
  }
  const duplicateIdentifierValues = [...byIdentifierTextOnly.entries()].filter(([, ids]) => ids.size > 1);
  console.log(`Combien d'identifiants (valeur texte) dupliqués entre établissements différents, tous registres confondus ? ${duplicateIdentifierValues.length}`);
  console.log(`Combien d'établissements différents partageraient le même identifiant texte ? ${duplicateIdentifierValues.reduce((sum, [, ids]) => sum + ids.size, 0)}`);

  console.log(`\nCombien sont impossibles à classifier automatiquement (REVIEW_REQUIRED) ? ${unclassifiable}`);
  console.log(`Combien de valeurs invalides (format inattendu pour leur registre présumé) ? ${invalidFormat}`);

  const wouldInsert = simulatedIdentifiers.filter((s) => s.identifiers.length > 0).length + dualIdSimulation.length;
  console.log(`\nCombien d'identifiants seraient insérés au total (simulation) ? ${wouldInsert}`);
  console.log(`  - MINESEC_ESG (depuis official_id existant, format valide) : ${simulatedIdentifiers.filter((s) => s.identifiers.length > 0 && s.identifiers[0].registry === "MINESEC_ESG").length}`);
  console.log(`  - MINESEC_CARTESCOLAIRE (simulation corroboration R.3.2) : ${dualIdSimulation.length}`);

  const report = {
    generated_at: new Date().toISOString(),
    operator: "jean-merlain",
    sprint: "REGISTRY-MULTI-A",
    mode: "DRY_RUN_READ_ONLY — aucune écriture, la table cible n'existe pas encore en production (migration 0021 non exécutée)",
    establishments_total: live.length,
    with_official_id: withOfficialId.length,
    source_ministry_minesec: minesecCount,
    source_ministry_other: otherCount,
    unclassifiable_review_required: unclassifiable,
    invalid_format: invalidFormat,
    registry_identifier_collisions: collisions.length,
    collision_detail: collisions.map((c) => ({ registry: c.registry, identifier: c.identifier, establishment_count: c.targets.length })),
    duplicate_identifier_text_across_establishments: duplicateIdentifierValues.length,
    establishments_sharing_a_duplicate_identifier: duplicateIdentifierValues.reduce((sum, [, ids]) => sum + ids.size, 0),
    would_insert_identifiers_total: wouldInsert,
    would_insert_by_registry: {
      MINESEC_ESG: simulatedIdentifiers.filter((s) => s.identifiers.length > 0 && s.identifiers[0].registry === "MINESEC_ESG").length,
      MINESEC_CARTESCOLAIRE: dualIdSimulation.length,
    },
    dual_id_scenario_tested: dualIdSimulation.length > 0,
    note: "Simulation uniquement. Aucune ligne insérée nulle part. establishments.official_id reste inchangé. Le scénario dual-ID (un même concept d'établissement avec un identifiant MINESEC_ESG ET un identifiant MINESEC_CARTESCOLAIRE) n'a pas encore été testé établissement-par-établissement réel (les 161 candidats R.3.2 n'ont pas de official_id MINESEC_ESG connu — voir MINESEC V1.1, zéro recouvrement direct) ; le test structurel du modèle (deux registres, une seule table, unicité par registre) est couvert par scripts/school-registry/lib/matching/__tests__/matching.test.ts §23.H avec une fixture locale.",
  };

  mkdirSync(join(rootDir, "reports", "registry"), { recursive: true });
  writeFileSync(join(rootDir, "reports", "registry", "registry-identifiers-backfill-dry-run.json"), JSON.stringify(report, null, 2), "utf-8");
  console.log("\nRapport écrit : reports/registry/registry-identifiers-backfill-dry-run.json");
}

main().catch((error) => {
  console.error("Échec dry-run backfill registry identifiers :", error);
  process.exit(1);
});
