import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateCompleteness, requireExtractionSafe } from "../completeness";
import { PaginationTracker } from "../pagination";
import { checkSourceStructure } from "../validation";
import { extractTableFirstColumn, segmentByHeading } from "../htmlExtractor";

/**
 * §52 (suite) — table 3 colonnes (nom/type/date) telle qu'observée sur les
 * pages memoire*0.jimdofree.com (villes publiques) : "Général"/"Technique"/
 * "Normal"/"Mixte" apparaissent en colonne 2 et dépassent minCellLength.
 * Régression pour le bug corrigé dans extractTableFirstColumn (scan par
 * ligne, pas par td global).
 */
const THREE_COLUMN_TABLE_FIXTURE = `
<table><tbody>
<tr><td>Etablissement</td><td>Type</td><td>Date de creation</td></tr>
<tr><td><a href="/x"><strong>Lycée de Test</strong></a></td><td>Général</td><td>2010</td></tr>
<tr><td><a href="/y"><strong>Lycée Technique de Test</strong></a></td><td>Technique</td><td>2012</td></tr>
<tr><td><a href="/z"><strong>CES de Test-Mixte</strong></a></td><td>Mixte</td><td></td></tr>
</tbody></table>`;

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..", "..", "..", "..", "..");

/**
 * SPRINT R.2-SAFETY §52-60 — Suite de non-régression du framework de
 * sécurité d'extraction. Utilise `node:test` (natif, aucune dépendance
 * ajoutée — §90 : ne pas installer un outil juste pour ce sprint).
 *
 * Lancer : npx tsx --test scripts/school-registry/lib/extraction/__tests__/extraction.test.ts
 */

describe("§52 — Régression Yaoundé (incident déclencheur du sprint)", () => {
  test("le parseur déterministe retrouve ~231 établissements, pas ~10 (résumé IA d'origine)", () => {
    const html = readFileSync(
      join(rootDir, "data", "registry", "raw", "major-cities-secondary-completeness-v1", "osidimbea-yaounde-prives-laics.html"),
      "utf-8"
    );
    const sections = segmentByHeading(html, /Arrondissement/);
    assert.ok(sections.length >= 7, `attendu 7 arrondissements Yaoundé, trouvé ${sections.length}`);

    let total = 0;
    for (const section of sections) {
      const names = extractTableFirstColumn(section.html, { ignoreCellText: ["Type", "Date de création", "Établissement"] });
      total += new Set(names).size;
    }

    // La découverte du sprint : un résumé IA avait annoncé ~10. Le parseur
    // déterministe doit en trouver un ordre de grandeur au-dessus.
    assert.ok(total > 200, `extraction déterministe = ${total}, attendu > 200 (résumé IA d'origine : ~10)`);
    assert.ok(total >= 225 && total <= 235, `extraction déterministe = ${total}, attendu ~231 (valeur constatée SPRINT R.2)`);
  });
});

describe("§27 — Extraction table 3 colonnes ne fuite pas la colonne Type", () => {
  test("colonnes Type (Général/Technique/Mixte) ne sont jamais retournées comme noms d'établissement", () => {
    const names = extractTableFirstColumn(THREE_COLUMN_TABLE_FIXTURE, { ignoreCellText: ["Etablissement", "Type", "Date de creation"] });
    assert.deepEqual(names, ["Lycée de Test", "Lycée Technique de Test", "CES de Test-Mixte"]);
    assert.ok(!names.includes("Général"));
    assert.ok(!names.includes("Technique"));
    assert.ok(!names.includes("Mixte"));
  });
});

describe("§27 — Extraction table avec colonne nom non-première", () => {
  test("mfoundi-catholiques : colonne 2 (Nom de l'établissement), pas colonne 1 (Type d'enseignement)", () => {
    const fixture = `
<table><tbody>
<tr><td>Type d'enseignement</td><td>Nom de l'établissement</td><td>Localisation</td><td>Date de création</td></tr>
<tr><td>Général</td><td>Collège Jean Tabi</td><td>Yaoundé - Etoudi</td><td>1961</td></tr>
<tr><td></td><td>Collège FX Vogt</td><td>Yaoundé - Mvolyé</td><td>1947</td></tr>
</tbody></table>`;
    const names = extractTableFirstColumn(fixture, {
      ignoreCellText: ["Type d'enseignement", "Nom de l'établissement", "Localisation", "Date de création"],
      nameColumnIndex: 1,
    });
    assert.deepEqual(names, ["Collège Jean Tabi", "Collège FX Vogt"]);
  });
});

describe("§53-55 — Comptabilité de complétude", () => {
  test("§54 extraction complète (100/100) -> PASS", () => {
    const outcome = evaluateCompleteness({
      expectedRows: 100,
      expectedRowsSource: "SOURCE_EXPLICIT_COUNTER",
      extractedRows: 100,
      duplicateRows: 0,
      explainedExclusions: [],
      pagination: null,
      structureValid: true,
      structureInvalidReason: null,
      networkFailed: false,
      networkFailureReason: null,
    });
    assert.equal(outcome.status, "PASS");
    assert.equal(outcome.safeForStaging, true);
    assert.doesNotThrow(() => requireExtractionSafe(outcome));
  });

  test("§53 extraction partielle (100 attendues, 99 extraites) -> INCOMPLETE_EXTRACTION, staging NO", () => {
    const outcome = evaluateCompleteness({
      expectedRows: 100,
      expectedRowsSource: "SOURCE_EXPLICIT_COUNTER",
      extractedRows: 99,
      duplicateRows: 0,
      explainedExclusions: [],
      pagination: null,
      structureValid: true,
      structureInvalidReason: null,
      networkFailed: false,
      networkFailureReason: null,
    });
    assert.equal(outcome.status, "INCOMPLETE_EXTRACTION");
    assert.equal(outcome.safeForStaging, false);
    assert.throws(() => requireExtractionSafe(outcome), /EXTRACTION BLOCKED/);
  });

  test("§55 doublon source (100 lignes, 99 uniques, 1 doublon exact) -> 100 accounted, PASS_WITH_EXPLAINED_EXCLUSIONS", () => {
    const outcome = evaluateCompleteness({
      expectedRows: 100,
      expectedRowsSource: "SOURCE_EXPLICIT_COUNTER",
      extractedRows: 99,
      duplicateRows: 1,
      explainedExclusions: [],
      pagination: null,
      structureValid: true,
      structureInvalidReason: null,
      networkFailed: false,
      networkFailureReason: null,
    });
    assert.equal(outcome.accounted, 100);
    assert.equal(outcome.status, "PASS_WITH_EXPLAINED_EXCLUSIONS");
    assert.equal(outcome.safeForStaging, true);
  });

  test("§16 exclusions expliquées (header/footer + doublon) équilibrent l'équation -> PASS_WITH_EXPLAINED_EXCLUSIONS", () => {
    const outcome = evaluateCompleteness({
      expectedRows: 231,
      expectedRowsSource: "FULL_DOM_TRAVERSAL",
      extractedRows: 228,
      duplicateRows: 1,
      explainedExclusions: [{ category: "HEADER_FOOTER", count: 2, reason: "lignes header/footer mal comptées par le compteur source" }],
      pagination: null,
      structureValid: true,
      structureInvalidReason: null,
      networkFailed: false,
      networkFailureReason: null,
    });
    assert.equal(outcome.accounted, 231);
    assert.equal(outcome.status, "PASS_WITH_EXPLAINED_EXCLUSIONS");
  });

  test("§15 pas de règle aveugle 98% — 99/100 (99%) reste INCOMPLETE_EXTRACTION", () => {
    const outcome = evaluateCompleteness({
      expectedRows: 100,
      expectedRowsSource: "SOURCE_EXPLICIT_COUNTER",
      extractedRows: 99,
      duplicateRows: 0,
      explainedExclusions: [],
      pagination: null,
      structureValid: true,
      structureInvalidReason: null,
      networkFailed: false,
      networkFailureReason: null,
    });
    assert.notEqual(outcome.status, "PASS");
    assert.equal(outcome.safeForStaging, false);
  });
});

describe("§56-57 — Sécurité de pagination", () => {
  test("§56 trou de pagination (pages 1,2,4 — page 3 absente) -> PAGINATION_GAP, staging NO", () => {
    const tracker = new PaginationTracker();
    tracker.recordPage(1, "contenu page 1");
    tracker.recordPage(2, "contenu page 2");
    tracker.recordPage(4, "contenu page 4");
    const pagination = tracker.finalize(4);

    const outcome = evaluateCompleteness({
      expectedRows: null,
      expectedRowsSource: "UNKNOWN",
      extractedRows: 30,
      duplicateRows: 0,
      explainedExclusions: [],
      pagination,
      structureValid: true,
      structureInvalidReason: null,
      networkFailed: false,
      networkFailureReason: null,
    });
    assert.equal(outcome.status, "PAGINATION_GAP");
    assert.equal(outcome.safeForStaging, false);
  });

  test("§57 boucle de pagination (page 3 identique à page 2) -> PAGINATION_LOOP, staging NO", () => {
    const tracker = new PaginationTracker();
    tracker.recordPage(1, "contenu page 1");
    tracker.recordPage(2, "contenu identique");
    tracker.recordPage(3, "contenu identique");
    const pagination = tracker.finalize(null);

    const outcome = evaluateCompleteness({
      expectedRows: null,
      expectedRowsSource: "UNKNOWN",
      extractedRows: 20,
      duplicateRows: 0,
      explainedExclusions: [],
      pagination,
      structureValid: true,
      structureInvalidReason: null,
      networkFailed: false,
      networkFailureReason: null,
    });
    assert.equal(outcome.status, "PAGINATION_LOOP");
    assert.equal(outcome.safeForStaging, false);
  });

  test("pagination complète et propre (1,2,3,4, aucune boucle) -> pas de FAIL pagination", () => {
    const tracker = new PaginationTracker();
    tracker.recordPage(1, "page 1");
    tracker.recordPage(2, "page 2");
    tracker.recordPage(3, "page 3");
    tracker.recordPage(4, "page 4 dernière");
    const pagination = tracker.finalize(4);
    assert.equal(pagination.gapDetected, false);
    assert.equal(pagination.loopDetected, false);
  });
});

describe("§58-59 — Validation de structure", () => {
  test("§58 changement de structure (sélecteur attendu absent) -> invalide", () => {
    const fixtureWithoutTable = "<html><body><p>Bienvenue sur notre nouveau site</p></body></html>";
    const result = checkSourceStructure(fixtureWithoutTable, { requiredMarkers: ["<table", "Établissement"], minLength: 10 });
    assert.equal(result.valid, false);
  });

  test("§59 HTTP 200 contenant une page d'erreur -> invalide (jamais PASS)", () => {
    const errorPage = "<html><body><h1>Access Denied</h1><p>Please complete the CAPTCHA to continue.</p></body></html>";
    const result = checkSourceStructure(errorPage, { requiredMarkers: ["<table"], forbiddenMarkers: ["CAPTCHA", "Access Denied"], minLength: 10 });
    assert.equal(result.valid, false);

    const outcome = evaluateCompleteness({
      expectedRows: 50,
      expectedRowsSource: "SOURCE_EXPLICIT_COUNTER",
      extractedRows: 0,
      duplicateRows: 0,
      explainedExclusions: [],
      pagination: null,
      structureValid: result.valid,
      structureInvalidReason: result.reason,
      networkFailed: false,
      networkFailureReason: null,
    });
    assert.notEqual(outcome.status, "PASS");
    assert.equal(outcome.status, "SOURCE_STRUCTURE_CHANGED");
  });

  test("structure conforme -> valide", () => {
    const goodPage = "<html><body><table><tr><td>Établissement</td></tr><tr><td>École Test</td></tr></table></body></html>";
    const result = checkSourceStructure(goodPage, { requiredMarkers: ["<table", "Établissement"], minLength: 10 });
    assert.equal(result.valid, true);
  });
});

describe("§60 — L'IA ne peut jamais outrepasser le verdict déterministe", () => {
  test("un statut IA \"looks complete\" ne change rien si les comptes déterministes échouent", () => {
    // Simule un appelant qui a une opinion IA optimiste mais fournit quand
    // même les vrais comptes déterministes — le framework ignore l'opinion.
    const aiOpinion = "looks complete"; // jamais lu par evaluateCompleteness — le contrat ExtractionResult.aiAssistance ne participe pas au calcul du statut.
    void aiOpinion;

    const outcome = evaluateCompleteness({
      expectedRows: 231,
      expectedRowsSource: "FULL_DOM_TRAVERSAL",
      extractedRows: 10, // le chiffre du résumé IA d'origine, incident SPRINT R.2
      duplicateRows: 0,
      explainedExclusions: [],
      pagination: null,
      structureValid: true,
      structureInvalidReason: null,
      networkFailed: false,
      networkFailureReason: null,
    });
    assert.equal(outcome.status, "INCOMPLETE_EXTRACTION");
    assert.equal(outcome.safeForStaging, false);
    assert.throws(() => requireExtractionSafe(outcome));
  });
});

describe("Réseau et cas EXPECTED_COUNT_UNKNOWN", () => {
  test("échec réseau -> NETWORK_FAILURE, jamais 0 résultat silencieux (§75-76)", () => {
    const outcome = evaluateCompleteness({
      expectedRows: null,
      expectedRowsSource: "UNKNOWN",
      extractedRows: 0,
      duplicateRows: 0,
      explainedExclusions: [],
      pagination: null,
      structureValid: true,
      structureInvalidReason: null,
      networkFailed: true,
      networkFailureReason: "ETIMEDOUT après 3 tentatives",
    });
    assert.equal(outcome.status, "NETWORK_FAILURE");
    assert.notEqual(outcome.status, "PASS");
  });

  test("§18 expectedRows inconnu sans preuve d'épuisement -> MANUAL_REVIEW_REQUIRED, jamais PASS silencieux", () => {
    const outcome = evaluateCompleteness({
      expectedRows: null,
      expectedRowsSource: "UNKNOWN",
      extractedRows: 42,
      duplicateRows: 0,
      explainedExclusions: [],
      pagination: null,
      structureValid: true,
      structureInvalidReason: null,
      networkFailed: false,
      networkFailureReason: null,
    });
    assert.equal(outcome.status, "MANUAL_REVIEW_REQUIRED");
    assert.equal(outcome.safeForStaging, false);
  });

  test("§18 expectedRows inconnu MAIS épuisement prouvé -> PASS", () => {
    const outcome = evaluateCompleteness({
      expectedRows: null,
      expectedRowsSource: "UNKNOWN",
      extractedRows: 42,
      duplicateRows: 0,
      explainedExclusions: [],
      pagination: null,
      structureValid: true,
      structureInvalidReason: null,
      networkFailed: false,
      networkFailureReason: null,
      unknownCountExplicitlyComplete: { reason: "aucune page suivante détectée, curseur stable sur 3 requêtes consécutives" },
    });
    assert.equal(outcome.status, "PASS");
    assert.equal(outcome.safeForStaging, true);
  });
});
