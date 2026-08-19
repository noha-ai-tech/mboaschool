import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { extractSelectOptionPairs } from "./lib/extraction/htmlExtractor";
import { checkSourceStructure } from "./lib/extraction/validation";
import { writeSourceSnapshot } from "./lib/extraction/sourceSnapshot";
import { evaluateCompleteness } from "./lib/extraction/completeness";
import { sha256 } from "./lib/extraction/hashing";

/**
 * SPRINT MINESEC V1.1 — collecteur déterministe de cartescolaire.cm/minesec
 * (portail officiel MINESEC — "Carte scolaire est réalisée par le MINESEC",
 * footer du site, robots.txt entièrement ouvert : `Disallow:` vide).
 *
 * Ce n'est PAS un annuaire d'établissements navigable. C'est le portail de
 * vérification de matricule élève / paiement de scolarité. Le formulaire de
 * recherche (`<form name="search-form" action=".../get-matricule">`) exige
 * un nom d'élève — jamais interrogé ici, aucune donnée d'élève collectée
 * (§ minimisation des données, REGISTRY_EXTRACTION_SAFETY.md). Ce script ne
 * lit QUE le `<select name="school_code">` intégré statiquement dans la
 * page HTML brute (aucune requête vers get-matricule, aucune interaction).
 *
 * Ce select ne contient QUE {matricule, nom} — ni région, ni département,
 * ni catégorie par ligne. Toute région rapportée dans ce sprint est DÉDUITE
 * (préfixe numérique du matricule, décodage confirmé empiriquement contre
 * les 1941 official_identifier déjà connus de MINESEC V1 — voir
 * reports/registry/cartescolaire-by-region.csv), jamais lue directement
 * depuis cette source.
 *
 * Pas de pagination : tout le contenu est dans une seule réponse HTML
 * statique. La preuve de complétude ne peut donc pas venir d'un mécanisme
 * de pages — elle vient de la stabilité : deux récupérations indépendantes
 * doivent produire un compte et un hash de contenu identiques (§18, preuve
 * d'épuisement alternative à un total explicite, jamais une simple
 * impression que "la page a l'air complète").
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..", "..");
const BATCH_ID = "cartescolaire-v1";
const OPERATOR = "jean-merlain";
const PARSER_VERSION = "collect-cartescolaire-national-v1";
const SOURCE_URL = "https://cartescolaire.cm/minesec";

async function fetchRaw(): Promise<string> {
  const res = await fetch(SOURCE_URL, { headers: { "User-Agent": "Ecoles237-Registry-Bot/0.1 (+contact: enwaha22@gmail.com)" } });
  if (!res.ok) throw new Error(`GET ${SOURCE_URL} -> HTTP ${res.status}`);
  return res.text();
}

async function main() {
  console.log(`Récupération 1/2 : ${SOURCE_URL}`);
  const html1 = await fetchRaw();
  await new Promise((r) => setTimeout(r, 1500)); // §40 — délai poli entre requêtes
  console.log(`Récupération 2/2 (preuve de stabilité) : ${SOURCE_URL}`);
  const html2 = await fetchRaw();

  const structure1 = checkSourceStructure(html1, {
    requiredMarkers: ["<select", 'name="school_code"', "<option value="],
    forbiddenMarkers: ["captcha", "CAPTCHA", "Access Denied", "Please log in"],
    minLength: 10000,
  });

  const pairs1 = extractSelectOptionPairs(html1, { minLabelLength: 3 });
  const pairs2 = extractSelectOptionPairs(html2, { minLabelLength: 3 });

  // Le hash du document HTML entier varie à CHAQUE requête (jeton CSRF
  // `_token` propre à la session, confirmé en comparant les deux réponses
  // brutes octet par octet — le bloc `<select name="school_code">` lui-même
  // est strictement identique). La preuve de stabilité porte donc sur les
  // DONNÉES extraites (paires matricule/nom), pas sur le document entier —
  // sinon ce script échouerait à chaque exécution pour une raison n'ayant
  // aucun rapport avec la complétude réelle de la liste.
  const optionsHash1 = sha256(JSON.stringify([...pairs1].sort((a, b) => a.value.localeCompare(b.value))));
  const optionsHash2 = sha256(JSON.stringify([...pairs2].sort((a, b) => a.value.localeCompare(b.value))));
  const rawHash1 = sha256(html1);
  const rawHash2 = sha256(html2);
  const stableAcrossFetches = optionsHash1 === optionsHash2 && pairs1.length === pairs2.length;

  console.log(`Fetch 1 : ${pairs1.length} options, document SHA256 ${rawHash1.slice(0, 16)}..., données SHA256 ${optionsHash1.slice(0, 16)}...`);
  console.log(`Fetch 2 : ${pairs2.length} options, document SHA256 ${rawHash2.slice(0, 16)}..., données SHA256 ${optionsHash2.slice(0, 16)}...`);
  console.log(`Document HTML identique : ${rawHash1 === rawHash2 ? "OUI" : "NON (attendu — jeton CSRF _token change à chaque requête)"}`);
  console.log(`Données (matricule/nom) identiques : ${stableAcrossFetches ? "OUI" : "NON"}`);

  const snapshot = writeSourceSnapshot({
    rootDir,
    batchId: BATCH_ID,
    fileName: "cartescolaire-minesec-select.html",
    rawContent: html1,
    sourceUrl: SOURCE_URL,
    sourceType: "HTML_LIST",
    parserVersion: PARSER_VERSION,
    operator: OPERATOR,
  });

  // §18 EXPECTED_COUNT_UNKNOWN — aucun total publié sur la page (vérifié :
  // aucune occurrence de "total"/"nombre" à proximité du select). La preuve
  // d'épuisement alternative est la stabilité stricte entre deux
  // récupérations indépendantes (contenu ET compte identiques) — pas une
  // impression de complétude.
  const outcome = evaluateCompleteness({
    expectedRows: null,
    expectedRowsSource: "UNKNOWN",
    extractedRows: pairs1.length,
    duplicateRows: 0,
    explainedExclusions: [],
    pagination: null,
    structureValid: structure1.valid,
    structureInvalidReason: structure1.reason,
    networkFailed: false,
    networkFailureReason: null,
    unknownCountExplicitlyComplete: stableAcrossFetches
      ? { reason: `deux récupérations indépendantes (${new Date().toISOString()}) produisent un hash de contenu et un nombre d'options identiques (${pairs1.length}) — page statique sans pagination, aucun total publié pour comparaison directe.` }
      : null,
  });

  console.log(`\nVerdict complétude : ${outcome.status}`);
  console.log(outcome.explanation);

  // Déduplication interne (valeur de matricule strictement identique) — la
  // comptabilisée avant/après doit être explicite, jamais silencieuse (§16).
  const seen = new Map<string, { value: string; label: string }>();
  let exactDuplicates = 0;
  for (const p of pairs1) {
    if (seen.has(p.value) && p.value !== "") {
      exactDuplicates++;
      continue;
    }
    seen.set(p.value || `__blank__${seen.size}`, p);
  }
  const unique = [...seen.values()].filter((p) => p.value !== "");
  console.log(`Options avec value non vide : ${unique.length} (doublons exacts de matricule : ${exactDuplicates})`);

  // CORRIGÉ EN COURS D'AUDIT — une première version de ce script décodait le
  // préfixe numérique via la même table que le format MINESEC V1
  // (17 caractères, ex. "5EM1GSFD112245109", où le premier chiffre encode
  // bien la région — confirmé à 100% contre les 1941 official_identifier
  // connus). ERREUR : appliquer cette même table au format cartescolaire à
  // 8 chiffres (ex. "10030001") supposait à tort que les deux schémas
  // partagent la même convention. Contrôle : les 2355 matricules
  // DIGIT_PREFIX cartescolaire commencent TOUS par "1" sans exception — et
  // des noms sans ambiguïté ("COLLEGE PROTESTANT DE NGAOUNDERE",
  // "COLLEGE BILINGUE SAINT JOSEPH DE BANKIM", tous deux Adamaoua)
  // prouvent que ce "1" n'encode PAS "Nord" pour ce schéma. Aucune région
  // n'est donc déduite du préfixe numérique cartescolaire — volontairement
  // laissé UNKNOWN plutôt que de deviner (§ ne jamais spéculer).
  const DIGIT_PREFIX_TO_REGION: Record<string, string> = {};
  // Décodage du préfixe alphabétique — 8 des 10 codes confirmés par
  // correspondance exacte de nom contre un établissement V1 de région
  // connue (AD/CE/ES/EN/LT/NO/OU/SU). NW/SW n'ont eu aucune correspondance
  // directe dans l'échantillon (couverture V1 plus faible en zone
  // anglophone, constat déjà posé pendant SPRINT R.2-A2) — assignés par
  // élimination (2 codes restants pour les 2 seules régions restantes,
  // Nord-Ouest/Sud-Ouest) et convention anglophone standard, PAS par
  // correspondance directe. Marqués `region_inferred_confidence` en
  // conséquence — jamais présenté comme aussi certain que les 8 autres.
  const ALPHA_PREFIX_TO_REGION: Record<string, { region: string; confidence: "CONFIRMED_BY_MATCH" | "INFERRED_BY_ELIMINATION" }> = {
    AD: { region: "Adamaoua", confidence: "CONFIRMED_BY_MATCH" },
    CE: { region: "Centre", confidence: "CONFIRMED_BY_MATCH" },
    ES: { region: "Est", confidence: "CONFIRMED_BY_MATCH" },
    EN: { region: "Extrême-Nord", confidence: "CONFIRMED_BY_MATCH" },
    LT: { region: "Littoral", confidence: "CONFIRMED_BY_MATCH" },
    NO: { region: "Nord", confidence: "CONFIRMED_BY_MATCH" },
    OU: { region: "Ouest", confidence: "CONFIRMED_BY_MATCH" },
    SU: { region: "Sud", confidence: "CONFIRMED_BY_MATCH" },
    NW: { region: "Nord-Ouest", confidence: "INFERRED_BY_ELIMINATION" },
    SW: { region: "Sud-Ouest", confidence: "INFERRED_BY_ELIMINATION" },
  };
  function classifyMatricule(value: string): {
    scheme: "DIGIT_PREFIX" | "ALPHA_PREFIX" | "OTHER";
    region_inferred: string | null;
    region_inferred_confidence: "CONFIRMED_BY_MATCH" | "INFERRED_BY_ELIMINATION" | "DIGIT_SCHEME" | null;
  } {
    if (/^[0-9]/.test(value)) {
      const region = DIGIT_PREFIX_TO_REGION[value[0]] ?? null;
      return { scheme: "DIGIT_PREFIX", region_inferred: region, region_inferred_confidence: region ? "DIGIT_SCHEME" : null };
    }
    const alpha2 = value.slice(0, 2).toUpperCase();
    if (/^[A-Z]{2}/.test(value) && ALPHA_PREFIX_TO_REGION[alpha2]) {
      const { region, confidence } = ALPHA_PREFIX_TO_REGION[alpha2];
      return { scheme: "ALPHA_PREFIX", region_inferred: region, region_inferred_confidence: confidence };
    }
    if (/^[A-Z]{2}/.test(value)) {
      return { scheme: "ALPHA_PREFIX", region_inferred: null, region_inferred_confidence: null };
    }
    return { scheme: "OTHER", region_inferred: null, region_inferred_confidence: null };
  }

  const normalized = unique.map((p) => ({
    matricule: p.value,
    name_raw: p.label,
    ...classifyMatricule(p.value),
  }));

  mkdirSync(join(rootDir, "data", "registry", "normalized", "cartescolaire-v1"), { recursive: true });
  const normalizedPath = join(rootDir, "data", "registry", "normalized", "cartescolaire-v1", "cartescolaire-national-v1.json");
  writeFileSync(
    normalizedPath,
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        operator: OPERATOR,
        source_url: SOURCE_URL,
        source_authority: "MINESEC (portail officiel — voir footer du site, robots.txt ouvert)",
        content_sha256: snapshot.content_sha256,
        parser_version: PARSER_VERSION,
        extraction_status: outcome.status,
        extraction_explanation: outcome.explanation,
        stable_across_two_fetches: stableAcrossFetches,
        total_options_raw: pairs1.length,
        exact_duplicate_matricules: exactDuplicates,
        unique_count: unique.length,
        rows: normalized,
      },
      null,
      2
    ),
    "utf-8"
  );

  const byScheme: Record<string, number> = {};
  for (const r of normalized) byScheme[r.scheme] = (byScheme[r.scheme] ?? 0) + 1;
  console.log("\nRépartition par schéma de matricule :", JSON.stringify(byScheme));

  console.log(`\nDataset normalisé écrit : data/registry/normalized/cartescolaire-v1/cartescolaire-national-v1.json`);
  console.log(`Snapshot brut écrit : data/registry/raw/cartescolaire-v1/cartescolaire-minesec-select.html`);

  if (outcome.status !== "PASS" && outcome.status !== "PASS_WITH_EXPLAINED_EXCLUSIONS") {
    console.error(`\nFAIL CLOSED — statut ${outcome.status}, aucune analyse de correspondance ne doit être considérée fiable tant que ce statut n'est pas résolu.`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("Échec collecte cartescolaire national :", error);
  process.exit(1);
});
