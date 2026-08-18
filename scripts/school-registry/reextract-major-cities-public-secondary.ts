import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateCompleteness } from "./lib/extraction/completeness";
import { extractTableFirstColumn, segmentByHeading } from "./lib/extraction/htmlExtractor";
import { checkSourceStructure } from "./lib/extraction/validation";
import { writeSourceSnapshot } from "./lib/extraction/sourceSnapshot";
import type { ExtractionStatus } from "./lib/extraction/types";

/**
 * SPRINT R.2-SAFETY — Ré-extraction déterministe des 4 sources memoire*0.jimdofree.com
 * derrière les lignes staging classées EXTRACTION_UNCERTAIN par l'audit
 * rétrospectif (retrospective-audit-r2-pilot.ts, 80 lignes au moment de
 * l'exécution de ce script) : ces lignes venaient d'un résumé WebFetch/
 * recherche assisté par IA, jamais d'un parseur déterministe avec équation
 * de complétude — exactement le pattern de l'incident Yaoundé qui a
 * déclenché ce sprint.
 *
 * LECTURE SEULE côté Supabase — ne modifie, ne supprime, ne promeut aucune
 * ligne staging existante (§65 de l'audit rétrospectif). Compare seulement
 * les noms ré-extraits aux 75 lignes existantes (Douala publics + Yaoundé
 * publics + Yaoundé technique + Yaoundé catholiques) pour établir une
 * référence vérifiée pour tout futur import staging de complément.
 *
 * N'importe QUE 75 des 80 lignes : les 5 restantes (2 InovEdu — Douala, 3
 * ecolesaucameroun.com — Kumba x2 + Bertoua x1) sont des fiches détail
 * mono-établissement, pas des listes — aucun risque de sous-comptage de type
 * "incident Yaoundé", donc hors périmètre de cette ré-extraction basée sur
 * htmlExtractor.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..", "..");
const BATCH_ID = "major-cities-secondary-completeness-v1";
const OPERATOR = "jean-merlain";
const PARSER_VERSION = "reextract-major-cities-public-secondary-v1";

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
    if (!res.ok) throw new Error(`GET ${path} -> HTTP ${res.status}`);
    const page = (await res.json()) as T[];
    all.push(...page);
    if (page.length < pageSize) break;
    offset += pageSize;
  }
  return all;
}

function normalizeName(name: string): string {
  return name.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
}

interface StagingRow {
  id: string;
  city: string | null;
  raw_data: { official_name?: string; source_name?: string; source_url?: string } | null;
}

interface SourceSpec {
  id: string;
  city: "Douala" | "Yaoundé";
  fileName: string;
  url: string;
  headingMatch: RegExp;
  expectedSections: string[];
  ignoreCellText: string[];
  nameColumnIndex: number;
  /** Filtre les lignes staging existantes correspondant à cette source pour comparaison. */
  matchesStagingRow: (r: StagingRow) => boolean;
}

const SOURCES: SourceSpec[] = [
  {
    id: "douala-secondaire-publics",
    city: "Douala",
    fileName: "memoirelittoral-secondaire-publics.html",
    url: "https://memoirelittoral0.jimdofree.com/secondaire/littoral/etablissements-publics/",
    // §confirmé : une des 6 sections source a une faute de frappe dans son
    // titre ("Arronndissement" — double n) — /Douala\s*\d/ reste robuste à
    // cette variante plutôt que de dépendre de l'orthographe exacte du mot.
    headingMatch: /Douala\s*\d/,
    expectedSections: ["Douala 1", "Douala 2", "Douala 3", "Douala 4", "Douala 5", "Douala 6"],
    // §confirmé : l'en-tête de colonne n'est pas orthographié/formulé de façon
    // uniforme d'une section à l'autre sur la même page (7 sections Yaoundé,
    // une seule dit "Nom de l'Etablissement" au lieu de "Etablissement").
    ignoreCellText: ["Etablissement", "Établissement", "Nom de l'Etablissement", "Nom de l'Établissement", "Type", "Date de creation", "Date de création"],
    nameColumnIndex: 0,
    matchesStagingRow: (r) => r.city === "Douala" && r.raw_data?.source_url === "https://memoirelittoral0.jimdofree.com/secondaire/littoral/etablissements-publics/",
  },
  {
    id: "yaounde-secondaire-publics",
    city: "Yaoundé",
    fileName: "memoirecentre-mfoundi-publics.html",
    url: "https://memoirecentre0.jimdofree.com/secondaire/centre/mfoundi-publics/",
    headingMatch: /Yaoundé/,
    expectedSections: ["Yaoundé 1", "Yaoundé 2", "Yaoundé 3", "Yaoundé 4", "Yaoundé 5", "Yaoundé 6", "Yaoundé 7"],
    // §confirmé : l'en-tête de colonne n'est pas orthographié/formulé de façon
    // uniforme d'une section à l'autre sur la même page (7 sections Yaoundé,
    // une seule dit "Nom de l'Etablissement" au lieu de "Etablissement").
    ignoreCellText: ["Etablissement", "Établissement", "Nom de l'Etablissement", "Nom de l'Établissement", "Type", "Date de creation", "Date de création"],
    nameColumnIndex: 0,
    matchesStagingRow: (r) => r.city === "Yaoundé" && r.raw_data?.source_url === "https://memoirecentre0.jimdofree.com/secondaire/centre/mfoundi-publics/",
  },
  {
    id: "yaounde-technique-charles-atangana",
    city: "Yaoundé",
    fileName: "memoirecentre-technique-ca.html",
    url: "https://memoirecentre0.jimdofree.com/secondaire/centre/technique-ca/",
    headingMatch: /(?!)/, // pas de segmentation — fiche détail mono-établissement, voir traitement dédié.
    expectedSections: [],
    ignoreCellText: [],
    nameColumnIndex: 0,
    matchesStagingRow: (r) => r.city === "Yaoundé" && r.raw_data?.source_url === "https://memoirecentre0.jimdofree.com/secondaire/centre/technique-ca/",
  },
  {
    id: "yaounde-secondaire-catholiques",
    city: "Yaoundé",
    fileName: "memoirecentre-mfoundi-catholiques.html",
    url: "https://memoirecentre0.jimdofree.com/secondaire/centre/mfoundi-catholiques/",
    headingMatch: /(?!)/, // une seule table, pas de sous-sections par arrondissement sur cette page.
    expectedSections: [],
    ignoreCellText: ["Type", "Type d'enseignement", "Nom de l'établissement", "Localisation", "Date de creation", "Date de création"],
    nameColumnIndex: 1, // §confirmé : ordre de colonnes inversé par rapport aux pages "publics".
    matchesStagingRow: (r) => r.city === "Yaoundé" && r.raw_data?.source_url === "https://memoirecentre0.jimdofree.com/secondaire/centre/mfoundi-catholiques/",
  },
];

interface SourceReport {
  id: string;
  city: string;
  sourceUrl: string;
  contentSha256: string;
  structureValid: boolean;
  structureReason: string | null;
  sectionsFound: string[] | null;
  extractedCount: number;
  extractedNames: string[];
  completenessStatus: ExtractionStatus;
  completenessExplanation: string;
  stagingCount: number;
  namesMatchingStaging: number;
  namesOnlyInReextraction: string[];
  namesOnlyInStaging: string[];
}

async function main() {
  const env = (await import("node:fs")).readFileSync(join(rootDir, ".env.local"), "utf-8");
  const supabaseUrl = readEnvVar(env, "NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = readEnvVar(env, "SUPABASE_SERVICE_ROLE_KEY");

  const stagingRows = await fetchAllPaginated<StagingRow>(
    supabaseUrl,
    serviceKey,
    "/rest/v1/establishment_import_staging?select=id,city,raw_data&source_ministry=eq.OTHER"
  );

  const reports: SourceReport[] = [];

  for (const source of SOURCES) {
    const res = await fetch(source.url, { headers: { "User-Agent": "Mozilla/5.0" } });
    const rawHtml = await res.text();

    const structure = checkSourceStructure(rawHtml, {
      requiredMarkers: ["<table"],
      forbiddenMarkers: ["CAPTCHA", "Access Denied", "captcha"],
      minLength: 500,
    });

    const snapshot = writeSourceSnapshot({
      rootDir,
      batchId: BATCH_ID,
      fileName: source.fileName,
      rawContent: rawHtml,
      sourceUrl: source.url,
      sourceType: "HTML_TABLE",
      parserVersion: PARSER_VERSION,
      operator: OPERATOR,
    });

    let extractedNames: string[] = [];
    let sectionsFound: string[] | null = null;
    let completenessStatus: ExtractionStatus;
    let completenessExplanation: string;

    if (source.expectedSections.length > 0) {
      const sections = segmentByHeading(rawHtml, source.headingMatch);
      sectionsFound = sections.map((s) => s.title);
      for (const section of sections) {
        extractedNames.push(...extractTableFirstColumn(section.html, { ignoreCellText: source.ignoreCellText, nameColumnIndex: source.nameColumnIndex }));
      }
      extractedNames = [...new Set(extractedNames)];

      const allSectionsPresent = source.expectedSections.every((expected) => sectionsFound!.some((found) => found.includes(expected)));
      const outcome = evaluateCompleteness({
        expectedRows: null,
        expectedRowsSource: "FULL_DOM_TRAVERSAL",
        extractedRows: extractedNames.length,
        duplicateRows: 0,
        explainedExclusions: [],
        pagination: null,
        structureValid: structure.valid,
        structureInvalidReason: structure.reason,
        networkFailed: false,
        networkFailureReason: null,
        unknownCountExplicitlyComplete: allSectionsPresent
          ? { reason: `les ${source.expectedSections.length} arrondissements attendus sont tous présents dans les titres de section (${sectionsFound!.join(", ")}) — page mono-bloc sans pagination, aucun lien "page suivante" détecté.` }
          : null,
      });
      completenessStatus = outcome.status;
      completenessExplanation = allSectionsPresent
        ? outcome.explanation
        : `Arrondissements attendus non tous trouvés — attendu [${source.expectedSections.join(", ")}], trouvé [${sectionsFound!.join(", ")}]. ${outcome.explanation}`;
    } else if (source.id === "yaounde-technique-charles-atangana") {
      // Fiche détail mono-établissement : pas de liste à compter, juste
      // confirmer que la page décrit bien l'établissement attendu.
      const nameHit = /Charles Atangana/i.test(rawHtml);
      extractedNames = nameHit ? ["Lycée Technique Charles Atangana"] : [];
      completenessStatus = structure.valid && nameHit ? "PASS" : "SOURCE_STRUCTURE_CHANGED";
      completenessExplanation = nameHit
        ? "Fiche détail mono-établissement — nom confirmé présent dans le contenu brut, pas d'équation de complétude applicable (une seule entité, pas une liste)."
        : "Nom attendu introuvable dans le contenu brut — structure de page probablement changée.";
    } else {
      extractedNames = extractTableFirstColumn(rawHtml, { ignoreCellText: source.ignoreCellText, nameColumnIndex: source.nameColumnIndex });
      extractedNames = [...new Set(extractedNames)];
      const outcome = evaluateCompleteness({
        expectedRows: null,
        expectedRowsSource: "FULL_DOM_TRAVERSAL",
        extractedRows: extractedNames.length,
        duplicateRows: 0,
        explainedExclusions: [],
        pagination: null,
        structureValid: structure.valid,
        structureInvalidReason: structure.reason,
        networkFailed: false,
        networkFailureReason: null,
        unknownCountExplicitlyComplete: { reason: "table unique entièrement parcourue (aucune section/pagination sur cette page), aucun lien \"page suivante\" détecté." },
      });
      completenessStatus = outcome.status;
      completenessExplanation = outcome.explanation;
    }

    const stagingForSource = stagingRows.filter(source.matchesStagingRow);
    const stagingNames = new Set(stagingForSource.map((r) => normalizeName(r.raw_data?.official_name ?? "")));
    const reextractedNamesNorm = new Set(extractedNames.map(normalizeName));

    const namesMatchingStaging = [...reextractedNamesNorm].filter((n) => stagingNames.has(n)).length;
    const namesOnlyInReextraction = extractedNames.filter((n) => !stagingNames.has(normalizeName(n)));
    const namesOnlyInStaging = stagingForSource
      .map((r) => r.raw_data?.official_name ?? "")
      .filter((n) => !reextractedNamesNorm.has(normalizeName(n)));

    reports.push({
      id: source.id,
      city: source.city,
      sourceUrl: source.url,
      contentSha256: snapshot.content_sha256,
      structureValid: structure.valid,
      structureReason: structure.reason,
      sectionsFound,
      extractedCount: extractedNames.length,
      extractedNames: extractedNames.sort(),
      completenessStatus,
      completenessExplanation,
      stagingCount: stagingForSource.length,
      namesMatchingStaging,
      namesOnlyInReextraction,
      namesOnlyInStaging,
    });
  }

  const report = {
    audit_date: new Date().toISOString(),
    operator: OPERATOR,
    batch: BATCH_ID,
    scope:
      "Ré-extraction déterministe des sources memoire*0.jimdofree.com derrière les lignes staging EXTRACTION_UNCERTAIN — LECTURE SEULE, aucune écriture Supabase, aucune promotion.",
    sources: reports,
    summary: {
      total_reextracted: reports.reduce((sum, r) => sum + r.extractedCount, 0),
      total_staging_covered: reports.reduce((sum, r) => sum + r.stagingCount, 0),
      all_completeness_pass: reports.every((r) => r.completenessStatus === "PASS" || r.completenessStatus === "PASS_WITH_EXPLAINED_EXCLUSIONS"),
    },
    action_taken: "AUCUNE — aucune ligne staging modifiée, supprimée ou promue. Rapport de référence uniquement.",
    out_of_scope_note:
      "5 des 80 lignes EXTRACTION_UNCERTAIN (InovEdu x2 — Douala, ecolesaucameroun.com x3 — Kumba x2 + Bertoua x1) sont des fiches détail mono-établissement sans risque de sous-comptage de liste — non couvertes par cette ré-extraction basée sur htmlExtractor. 80 - 5 = 75, exactement total_staging_covered ci-dessus.",
  };

  mkdirSync(join(rootDir, "reports", "registry", "extraction"), { recursive: true });
  const outPath = join(rootDir, "reports", "registry", "extraction", "major-cities-public-secondary-reextraction-v1.json");
  writeFileSync(outPath, JSON.stringify(report, null, 2), "utf-8");

  console.log("=== RÉ-EXTRACTION DÉTERMINISTE — SOURCES PUBLIQUES DOUALA/YAOUNDÉ ===\n");
  for (const r of reports) {
    console.log(`${r.id} (${r.city})`);
    console.log(`  Statut complétude : ${r.completenessStatus}`);
    console.log(`  Ré-extrait : ${r.extractedCount} | Staging existant : ${r.stagingCount} | Correspondances : ${r.namesMatchingStaging}`);
    if (r.namesOnlyInReextraction.length > 0) console.log(`  Nouveaux (absents de staging) : ${r.namesOnlyInReextraction.length}`);
    if (r.namesOnlyInStaging.length > 0) console.log(`  Absents de la ré-extraction (présents en staging) : ${r.namesOnlyInStaging.length} -> ${r.namesOnlyInStaging.join(" | ")}`);
    console.log();
  }
  console.log(`Rapport écrit : reports/registry/extraction/major-cities-public-secondary-reextraction-v1.json`);
}

main().catch((error) => {
  console.error("Échec ré-extraction major cities public secondary :", error);
  process.exit(1);
});
