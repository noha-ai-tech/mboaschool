import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseMinsanteA1Pdf, OFFICIAL_PROGRAMS } from "../pdfMinsanteA1";

/**
 * SPRINT MINSANTE-A.1 — Suite de non-régression du prototype d'extraction
 * PDF (Source A MINSANTE 2025). Lancer :
 * npx tsx --test scripts/school-registry/lib/extraction/__tests__/pdfMinsanteA1.test.ts
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..", "..", "..", "..", "..");
const REAL_FIXTURE_PATH = join(rootDir, "data", "registry", "raw", "minsante-a1", "liste-ecoles-agrees-minsante-2025.txt");

function pageMarker(page: number, total: number): string {
  return `                                    Page ${page} sur ${total}`;
}

function buildMinimalDocument(filiereBlocks: string[]): string {
  return filiereBlocks.join("\n") + "\n" + pageMarker(1, 1);
}

describe("Extraction réelle — document Source A MINSANTE 2025 (fixture réelle, pas synthétique)", () => {
  const realText = readFileSync(REAL_FIXTURE_PATH, "utf-8");
  const result = parseMinsanteA1Pdf(realText);

  test("11 pages déclarées, 11 pages trouvées (aucune page manquante)", () => {
    assert.equal(result.declaredTotalPages, 11);
    assert.equal(result.pagesFound.length, 11);
  });

  test("10 filières officielles détectées (vocabulaire complet, aucune inconnue)", () => {
    assert.equal(result.filiereSections.length, 10);
    for (const s of result.filiereSections) {
      assert.ok(Object.values(OFFICIAL_PROGRAMS).includes(s.programNormalized), `filière normalisée inattendue : ${s.programNormalized}`);
    }
  });

  test("6/10 filières PARSED, 4/10 en STRUCTURE_ANOMALY — trouvaille réelle du sprint, pas un chiffre forcé", () => {
    const parsed = result.filiereSections.filter((s) => s.status === "PARSED");
    const anomalous = result.filiereSections.filter((s) => s.status === "STRUCTURE_ANOMALY");
    assert.equal(parsed.length, 6);
    assert.equal(anomalous.length, 4);
    assert.deepEqual(
      anomalous.map((s) => s.filiereRaw).sort(),
      ["IMAGERIE MEDICALE", "KINESITHERAPIE", "PSYCHOMOTRICITE ET RELAXATION", "SCIENCES PHARMACEUTIQUES"].sort()
    );
  });

  test("IMAGERIE MEDICALE : 0 numérotation détectée — le grep naïf de MINSANTE-A (330 lignes) ratait entièrement cette filière", () => {
    const imagerie = result.filiereSections.find((s) => s.filiereRaw === "IMAGERIE MEDICALE")!;
    assert.equal(imagerie.status, "STRUCTURE_ANOMALY");
    assert.equal(imagerie.regionResetCount, 0);
    assert.equal(imagerie.rows.length, 0);
  });

  test("293 lignes école×filière extraites sur les 6 filières fiables (pas 330 — celui-ci exclut explicitement, jamais silencieusement, les 4 filières ambiguës)", () => {
    assert.equal(result.rows.length, 293);
  });

  test("10/10 régions officielles observées malgré les exclusions de filières", () => {
    assert.equal(result.regionsObserved.length, 10);
    for (const r of ["Adamaoua", "Centre", "Est", "Extrême-Nord", "Littoral", "Nord", "Nord-Ouest", "Ouest", "Sud", "Sud-Ouest"]) {
      assert.ok(result.regionsObserved.includes(r), `région manquante : ${r}`);
    }
  });

  test("chaque exclusion est comptée et catégorisée — jamais une perte silencieuse", () => {
    assert.equal(result.explainedExclusions.length, 4);
    for (const e of result.explainedExclusions) {
      assert.equal(e.category, "STRUCTURE_ANOMALY");
      assert.ok(e.count >= 0);
      assert.ok(e.reason.length > 0);
    }
  });

  test("nom d'école coupé sur 2 lignes correctement rejoint (cas réel observé : hyphénation en fin de ligne)", () => {
    const row = result.rows.find((r) => r.rawSchoolName.includes("D'ELIG-MFOMO"));
    assert.ok(row, "ligne AGORA HEALTH LEKIE ... D'ELIG-MFOMO introuvable");
    assert.equal(row!.rawSchoolName, 'INSTITUT PRIVE DE FORMATION MEDICO-SANITAIRE AGORA HEALTH LEKIE CENTRE D\'ELIG-MFOMO');
  });

  test("nom d'école coupé sur 2 lignes correctement rejoint (cas réel : pas de hyphénation, jointure par espace)", () => {
    const row = result.rows.find((r) => r.rawSchoolName.includes("LIFE INSTITUT DE MBANKOMO"));
    assert.ok(row, "ligne LIFE INSTITUT DE MBANKOMO introuvable");
    assert.equal(row!.rawSchoolName, "ECOLE PRIVEE DE FORMATION DES PERSONNELS MEDICO-SANITAIRES LIFE INSTITUT DE MBANKOMO");
  });
});

describe("PII — 0 donnée candidate persistée dans l'extraction", () => {
  const realText = readFileSync(REAL_FIXTURE_PATH, "utf-8");
  const result = parseMinsanteA1Pdf(realText);

  test("aucune ligne extraite ne ressemble à un motif matricule/candidat", () => {
    const matriculeLike = /\b\d{2,4}[A-Z]{2,5}[-\s]?\d{3,5}\b/; // ex. 221DE-4826, motif observé dans les documents concours MINSANTE
    const hits = result.rows.filter((r) => matriculeLike.test(r.rawSchoolName));
    assert.equal(hits.length, 0, `ligne(s) ressemblant à un matricule candidat trouvée(s) : ${JSON.stringify(hits)}`);
  });

  test("aucune ligne extraite ne contient le mot MATRICULE ou NOMS ET PRENOMS", () => {
    const hits = result.rows.filter((r) => /MATRICULE|NOMS ET PRENOMS/i.test(r.rawSchoolName));
    assert.equal(hits.length, 0);
  });
});

describe("§7 — FAIL-CLOSED : le parseur STOP, jamais catch{return []}", () => {
  test("texte vide -> exception", () => {
    assert.throws(() => parseMinsanteA1Pdf(""), /texte source vide/);
  });

  test("aucun marqueur de pagination -> exception (impossible de prouver la complétude)", () => {
    const doc = "FILIERE : INFIRMIERS\nADAMAOUA\n1. ECOLE TEST\n";
    assert.throws(() => parseMinsanteA1Pdf(doc), /aucun marqueur de pagination/i);
  });

  test("page manquante dans la séquence déclarée -> exception", () => {
    const doc = ["FILIERE : INFIRMIERS", "ADAMAOUA", "1. ECOLE TEST", pageMarker(1, 3), pageMarker(3, 3)].join("\n");
    assert.throws(() => parseMinsanteA1Pdf(doc), /page\(s\) manquante\(s\)/i);
  });

  test("aucun en-tête FILIERE détecté -> exception", () => {
    const doc = ["ADAMAOUA", "1. ECOLE TEST", pageMarker(1, 1)].join("\n");
    assert.throws(() => parseMinsanteA1Pdf(doc), /aucun en-tête 'FILIERE/i);
  });

  test("filière inconnue (hors vocabulaire officiel) -> exception, jamais acceptée silencieusement", () => {
    const doc = ["FILIERE : CHIRURGIE ESTHETIQUE", "ADAMAOUA", "1. ECOLE TEST", pageMarker(1, 1)].join("\n");
    assert.throws(() => parseMinsanteA1Pdf(doc), /filière inconnue/i);
  });

  test("0 ligne extraite au total (toutes les filières en anomalie) -> exception, jamais un résultat vide silencieux", () => {
    // Une seule filière connue, sans aucune numérotation ni étiquette région -> STRUCTURE_ANOMALY, 0 ligne au global.
    const doc = ["FILIERE : ODONTOSTOMATOLOGIE", "un contenu quelconque sans numerotation ni region", pageMarker(1, 1)].join("\n");
    assert.throws(() => parseMinsanteA1Pdf(doc), /0 ligne école×filière extraite/i);
  });
});

describe("Région/filière/école — extraction déterministe sur document synthétique minimal", () => {
  test("2 régions, numérotation propre -> assignation région correcte", () => {
    const doc = buildMinimalDocument([
      "FILIERE : INFIRMIERS",
      " REGIONS                                               ECOLES",
      "ADAMAOUA",
      "           1. ECOLE ALPHA DE NGAOUNDERE",
      "           2. ECOLE BETA DE NGAOUNDERE",
      "  CENTRE   1. ECOLE GAMMA DE YAOUNDE",
    ]);
    const result = parseMinsanteA1Pdf(doc);
    const section = result.filiereSections[0];
    assert.equal(section.status, "PARSED");
    assert.equal(section.rows.length, 3);
    assert.equal(section.rows[0].region, "Adamaoua");
    assert.equal(section.rows[1].region, "Adamaoua");
    assert.equal(section.rows[2].region, "Centre");
    assert.equal(section.rows[2].rawSchoolName, "ECOLE GAMMA DE YAOUNDE");
  });

  test("désaccord redémarrages vs étiquettes région -> STRUCTURE_ANOMALY, pas d'invention de région", () => {
    // Une 2e filière saine (KINESITHERAPIE) est incluse pour que le document
    // ait au moins 1 ligne fiable au total — sinon le garde-fou "0 ligne au
    // global" (test précédent) masquerait celui qu'on veut isoler ici.
    const doc = buildMinimalDocument([
      "FILIERE : INFIRMIERS",
      "ADAMAOUA",
      "           1. ECOLE ALPHA",
      "           1. ECOLE BETA", // 2e redémarrage sans étiquette région correspondante
      "FILIERE : KINESITHERAPIE",
      "CENTRE",
      "           1. ECOLE SAINE DE YAOUNDE",
    ]);
    const result = parseMinsanteA1Pdf(doc);
    const anomalySection = result.filiereSections.find((s) => s.filiereRaw === "INFIRMIERS")!;
    assert.equal(anomalySection.status, "STRUCTURE_ANOMALY");
    assert.equal(anomalySection.rows.length, 0);
    assert.equal(anomalySection.regionResetCount, 2);
    assert.equal(anomalySection.regionLabelCount, 1);

    const healthySection = result.filiereSections.find((s) => s.filiereRaw === "KINESITHERAPIE")!;
    assert.equal(healthySection.status, "PARSED");
    assert.equal(result.rows.length, 1);
  });
});
