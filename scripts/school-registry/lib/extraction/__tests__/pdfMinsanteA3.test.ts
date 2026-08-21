import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { parseMinsanteA3, subsequenceOverlapRatio } from "../pdfMinsanteA3";
import { parseMinsanteA2 } from "../pdfMinsanteA2";
import type { CoordTextItem } from "../pdfMinsanteA2";
import { piiScan } from "../piiScan";

/**
 * SPRINT MINSANTE-I.1 §10 — matrice de tests A-O pour le parseur
 * `minsante-a3-pdf-recovery@1`. Lancer :
 * npx tsx --test scripts/school-registry/lib/extraction/__tests__/pdfMinsanteA3.test.ts
 *
 * Fixtures synthétiques (mêmes conventions que pdfMinsanteA2.test.ts —
 * noms fictifs, aucune donnée réelle du PDF source).
 *
 * NOTE DE COUVERTURE — certains points de la matrice §10 du brief portent
 * intrinsèquement sur le PDF RÉEL ou sur Supabase (pas synthétisables sans
 * perdre leur valeur probante) et sont couverts par les SCRIPTS
 * D'EXÉCUTION READ-ONLY de ce sprint plutôt que par des fixtures ici :
 *   B (détection graphique/non-texte)  -> minsante-i1-forensics.ts (getOperatorList/structTree/annotations réels, voir minsante-i1-imagerie-analysis.json)
 *   C (réconciliation source alternative) -> minsante-i1-source-corroboration.json (recherche web réelle)
 *   K (8 filières SAFE inchangées)     -> minsante-i1-run.ts, section "8 filières précédemment SAFE" (comparaison A.2/A.3 sur le PDF réel)
 *   L (293 lignes legacy inchangées)   -> minsante-i1-run.ts, section "legacy 6 filières" + minsante-i1-full-reconciliation.json
 *   M/N (22 pilote / 8 promus)         -> minsante-i1-run.ts, section régression pilote (lecture Supabase réelle) + minsante-i1-pilot-regression.json
 * Ce fichier couvre A, D, E, F, G, H, I, J, O avec des équivalents
 * synthétiques déterministes, plus une variante synthétique de K/L (§ "K'"
 * ci-dessous) qui vérifie la PROPRIÉTÉ GÉNÉRALE (A.3 ≡ A.2 en l'absence
 * d'étiquette non reconnue), indépendamment du PDF réel.
 */

function it(page: number, x: number, y: number, str: string): CoordTextItem {
  return { page, x, y, str };
}
function filiereHeader(page: number, y: number, label: string): CoordTextItem {
  return it(page, 70.82, y, `FILIERE : ${label}`);
}
function tableHeader(page: number, y: number): CoordTextItem[] {
  return [it(page, 64.22, y, "REGIONS"), it(page, 307.39, y, "ECOLES")];
}
function regionLabel(page: number, y: number, label: string): CoordTextItem {
  return it(page, 60, y, label);
}
function numberedRow(page: number, y: number, num: number, name: string): CoordTextItem[] {
  return [it(page, 144.86, y, `${num}.`), it(page, 150.99, y, " "), it(page, 168.98, y, name)];
}
function unnumberedRow(page: number, y: number, name: string): CoordTextItem[] {
  return [it(page, 132.98, y, name)];
}

const ANALYSES = "ANALYSES MEDICALES";
const IMAGERIE = "IMAGERIE MEDICALE";
const SCIENCES_PHARMA = "SCIENCES PHARMACEUTIQUES";

/**
 * Construit une section synthétique EST -> [étiquette corrompue] -> LITTORAL,
 * avec la numérotation qui redémarre à 1 après l'étiquette corrompue —
 * reproduit la structure réelle isolée dans Sciences Pharmaceutiques
 * (page 11) SANS utiliser le texte réel "EXTRME NORD" (généricité, §H).
 */
function corruptedLabelFixture(opts: { corruptedLabelText: string; numberAfterLabel?: number; secondRegionAfterLabel?: string }): CoordTextItem[][] {
  const rows: CoordTextItem[] = [
    filiereHeader(1, 700, SCIENCES_PHARMA),
    ...tableHeader(1, 680),
    regionLabel(1, 660, "EST"),
    ...numberedRow(1, 645, 1, "ECOLE EST UNE"),
    regionLabel(1, 620, opts.corruptedLabelText),
    ...numberedRow(1, 605, opts.numberAfterLabel ?? 1, "ECOLE RECUPEREE UNE"),
    regionLabel(1, 560, opts.secondRegionAfterLabel ?? "LITTORAL"),
    ...numberedRow(1, 545, 1, "ECOLE LITTORAL UNE"),
  ];
  return [rows];
}

describe("A — Imagerie : numéros réellement absents (pas de récupération inventée)", () => {
  test("A.3 traite l'absence totale de numérotation exactement comme A.2 (aucune tentative de récupération sur ce type de défaut)", () => {
    const pages: CoordTextItem[][] = [
      [
        filiereHeader(1, 648, IMAGERIE),
        ...tableHeader(1, 624),
        regionLabel(1, 595, "ADAMAOUA"),
        ...unnumberedRow(1, 580, "ECOLE IMAGERIE UN"),
        regionLabel(1, 400, "CENTRE"),
        ...unnumberedRow(1, 385, "ECOLE IMAGERIE DEUX"),
      ],
    ];
    const a2 = parseMinsanteA2(pages);
    const a3 = parseMinsanteA3(pages, true);
    assert.equal(a3.filiereSections[0].verdict, "QUARANTINED_NUMBERING_ABSENT");
    assert.equal(a3.filiereSections[0].recoveryEvidence.length, 0);
    assert.equal(a3.filiereSections[0].rows.length, a2.filiereSections[0].rows.length);
    assert.equal(JSON.stringify(a3.filiereSections[0].rows), JSON.stringify(a2.filiereSections[0].rows));
  });
});

describe("D — isolation d'une étiquette de région corrompue", () => {
  test("l'étiquette corrompue est isolée avec page/x/y/texte brut dans recoveryEvidence", () => {
    const pages = corruptedLabelFixture({ corruptedLabelText: "EXTREM NORD" }); // corruption générique, PAS le texte réel du sprint
    const result = parseMinsanteA3(pages, true);
    const s = result.filiereSections[0];
    assert.equal(s.recoveryEvidence.length, 1);
    assert.equal(s.recoveryEvidence[0].rawLabelText, "EXTREM NORD");
    assert.equal(s.recoveryEvidence[0].page, 1);
    assert.equal(typeof s.recoveryEvidence[0].y, "number");
  });
});

describe("E — récupération d'étiquette de région par corroboration structurelle", () => {
  test("la région corrompue entre EST et LITTORAL est récupérée comme EXTRÊME-NORD (seul candidat alphabétique dans l'intervalle)", () => {
    const pages = corruptedLabelFixture({ corruptedLabelText: "EXTREM NORD" }); // corruption différente de la corruption réelle du sprint (généricité)
    const result = parseMinsanteA3(pages, true);
    const s = result.filiereSections[0];
    assert.equal(s.verdict, "SAFE");
    assert.equal(s.recoveryEvidence[0].recoveredRegion, "Extrême-Nord");
    assert.equal(s.recoveryEvidence[0].method, "CORRUPTED_REGION_LABEL_RECOVERED_BY_STRUCTURE");
    assert.ok(s.rows.some((r) => r.region === "Extrême-Nord" && r.schoolName === "ECOLE RECUPEREE UNE"));
  });

  test("aucun candidat dans l'intervalle (régions adjacentes dans REGION_CANONICAL_LIST) -> pas de récupération", () => {
    // CENTRE et EST sont directement adjacents dans REGION_CANONICAL_LIST — aucun candidat possible entre les deux.
    const pages: CoordTextItem[][] = [
      [
        filiereHeader(1, 700, SCIENCES_PHARMA),
        ...tableHeader(1, 680),
        regionLabel(1, 660, "CENTRE"),
        ...numberedRow(1, 645, 1, "ECOLE CENTRE UNE"),
        regionLabel(1, 620, "ETIQUETTE INCONNUE"),
        ...numberedRow(1, 605, 1, "ECOLE X"),
        regionLabel(1, 560, "EST"),
        ...numberedRow(1, 545, 1, "ECOLE EST UNE"),
      ],
    ];
    const result = parseMinsanteA3(pages, true);
    const s = result.filiereSections[0];
    assert.equal(s.recoveryEvidence.length, 0);
    assert.equal(s.verdict, "QUARANTINED_STRUCTURE_AMBIGUOUS");
  });

  test("plusieurs candidats possibles dans l'intervalle -> ambiguïté, pas de récupération", () => {
    // Entre CENTRE et LITTORAL : EST et EXTRÊME-NORD sont TOUS DEUX candidats -> ambigu, fail-closed.
    const pages: CoordTextItem[][] = [
      [
        filiereHeader(1, 700, SCIENCES_PHARMA),
        ...tableHeader(1, 680),
        regionLabel(1, 660, "CENTRE"),
        ...numberedRow(1, 645, 1, "ECOLE CENTRE UNE"),
        regionLabel(1, 620, "ETIQUETTE INCONNUE"),
        ...numberedRow(1, 605, 1, "ECOLE X"),
        regionLabel(1, 560, "LITTORAL"),
        ...numberedRow(1, 545, 1, "ECOLE LITTORAL UNE"),
      ],
    ];
    const result = parseMinsanteA3(pages, true);
    const s = result.filiereSections[0];
    assert.equal(s.recoveryEvidence.length, 0);
    assert.equal(s.verdict, "QUARANTINED_STRUCTURE_AMBIGUOUS");
  });
});

describe("F — frontière de région après l'étiquette récupérée", () => {
  test("les lignes sont correctement réparties entre la région précédente et la région récupérée (pas de fuite de lignes)", () => {
    const pages = corruptedLabelFixture({ corruptedLabelText: "EXTREM NORD" });
    const result = parseMinsanteA3(pages, true);
    const s = result.filiereSections[0];
    const estRows = s.rows.filter((r) => r.region === "Est");
    const enRows = s.rows.filter((r) => r.region === "Extrême-Nord");
    const littoralRows = s.rows.filter((r) => r.region === "Littoral");
    assert.deepEqual(estRows.map((r) => r.schoolName), ["ECOLE EST UNE"]);
    assert.deepEqual(enRows.map((r) => r.schoolName), ["ECOLE RECUPEREE UNE"]);
    assert.deepEqual(littoralRows.map((r) => r.schoolName), ["ECOLE LITTORAL UNE"]);
  });
});

describe("G — continuité de numérotation comme condition de récupération", () => {
  test("la numérotation redémarre à 1 après l'étiquette -> condition remplie (cas positif, voir E)", () => {
    const pages = corruptedLabelFixture({ corruptedLabelText: "EXTREM NORD", numberAfterLabel: 1 });
    const result = parseMinsanteA3(pages, true);
    assert.equal(result.filiereSections[0].recoveryEvidence.length, 1);
  });

  test("la numérotation NE redémarre PAS à 1 après l'étiquette -> pas de récupération (signal indépendant du texte de l'étiquette)", () => {
    const pages = corruptedLabelFixture({ corruptedLabelText: "EXTREM NORD", numberAfterLabel: 4 }); // ne redémarre pas à 1
    const result = parseMinsanteA3(pages, true);
    const s = result.filiereSections[0];
    assert.equal(s.recoveryEvidence.length, 0);
    assert.equal(s.verdict, "QUARANTINED_STRUCTURE_AMBIGUOUS");
  });
});

describe("H — pas de réparation sémantique câblée en dur (généricité)", () => {
  test("la récupération fonctionne pour une corruption TEXTUELLEMENT DIFFÉRENTE de celle observée dans le PDF réel du sprint", () => {
    // Le brief interdit explicitement `if text == "EXTRME NORD" -> ...`. Ce
    // test prouve que le mécanisme n'est PAS câblé sur cette chaîne précise
    // en utilisant une corruption synthétique différente ("XTREME-NRD").
    const pages = corruptedLabelFixture({ corruptedLabelText: "XTREME-NRD" });
    const result = parseMinsanteA3(pages, true);
    assert.equal(result.filiereSections[0].recoveryEvidence[0]?.recoveredRegion, "Extrême-Nord");
  });

  test("garde-fou de similarité résiduelle : une étiquette non reconnue SANS AUCUN rapport textuel avec le candidat structurel n'est PAS récupérée", () => {
    const pages = corruptedLabelFixture({ corruptedLabelText: "ZZZZZZZZZZ" }); // structurellement au bon endroit, mais aucune ressemblance textuelle
    const result = parseMinsanteA3(pages, true);
    const s = result.filiereSections[0];
    assert.equal(s.recoveryEvidence.length, 0, "le garde-fou §5 doit bloquer une récupération purement positionnelle sans aucun résidu textuel plausible");
    assert.equal(s.verdict, "QUARANTINED_STRUCTURE_AMBIGUOUS");
  });

  test("subsequenceOverlapRatio est symétrique à l'ordre des caractères (robuste à un glyphe manquant au milieu du mot)", () => {
    assert.ok(subsequenceOverlapRatio("EXTRME NORD", "Extrême-Nord") >= 0.75);
    assert.ok(subsequenceOverlapRatio("ZZZZZZZZZZ", "Extrême-Nord") < 0.75);
  });
});

describe("I — SHA256 incorrect désactive la récupération source-versionnée", () => {
  test("sourceSha256Verified=false -> aucune récupération, même si toutes les conditions structurelles sont réunies", () => {
    const pages = corruptedLabelFixture({ corruptedLabelText: "EXTREM NORD" });
    const result = parseMinsanteA3(pages, false); // SHA256 NON vérifié
    const s = result.filiereSections[0];
    assert.equal(s.recoveryEvidence.length, 0);
    assert.equal(s.verdict, "QUARANTINED_STRUCTURE_AMBIGUOUS");
  });

  test("l'invariant document-wide non tenu (une autre section a un ordre de région inversé) désactive la récupération pour TOUT le document", () => {
    const brokenOrderSection: CoordTextItem[] = [
      filiereHeader(1, 900, ANALYSES),
      ...tableHeader(1, 880),
      regionLabel(1, 860, "LITTORAL"), // Littoral AVANT Est -> viole l'ordre canonique
      ...numberedRow(1, 845, 1, "ECOLE LITTORAL"),
      regionLabel(1, 820, "EST"),
      ...numberedRow(1, 805, 1, "ECOLE EST"),
    ];
    const [pharmaSection] = corruptedLabelFixture({ corruptedLabelText: "EXTREM NORD" });
    const pages: CoordTextItem[][] = [[...brokenOrderSection, ...pharmaSection]];
    const result = parseMinsanteA3(pages, true);
    assert.equal(result.documentWideOrderInvariantHolds, false);
    const s = result.filiereSections.find((x) => x.programNormalized === "Sciences Pharmaceutiques")!;
    assert.equal(s.recoveryEvidence.length, 0, "l'invariant document-wide doit être violé nulle part avant d'activer la récupération, même localement ailleurs dans le même document");
  });
});

describe("J — extraction déterministe (répétée)", () => {
  test("le même jeu d'items produit exactement le même résultat à chaque appel, récupération incluse", () => {
    const pages = corruptedLabelFixture({ corruptedLabelText: "EXTREM NORD" });
    const r1 = parseMinsanteA3(pages, true);
    const r2 = parseMinsanteA3(pages, true);
    assert.equal(JSON.stringify(r1), JSON.stringify(r2));
  });
});

describe("K' — équivalence A.2/A.3 en l'absence d'étiquette non reconnue (généralise K/L sans dépendre du PDF réel)", () => {
  test("sans aucune étiquette corrompue, A.3 produit un résultat identique à A.2 pour n'importe quelle section", () => {
    const pages: CoordTextItem[][] = [
      [
        filiereHeader(1, 648, ANALYSES),
        ...tableHeader(1, 624),
        regionLabel(1, 595, "CENTRE"),
        ...numberedRow(1, 580, 1, "ECOLE ALPHA"),
        ...numberedRow(1, 565, 2, "ECOLE BETA"),
        regionLabel(1, 400, "OUEST"),
        ...numberedRow(1, 385, 1, "ECOLE GAMMA"),
      ],
    ];
    const a2 = parseMinsanteA2(pages);
    const a3 = parseMinsanteA3(pages, true);
    assert.equal(a3.filiereSections[0].verdict, a2.filiereSections[0].verdict);
    assert.equal(JSON.stringify(a3.filiereSections[0].rows), JSON.stringify(a2.filiereSections[0].rows));
    assert.equal(a3.filiereSections[0].recoveryEvidence.length, 0);
  });
});

describe("O — sortie sans PII", () => {
  test("piiScan ne trouve rien dans les lignes récupérées par corroboration structurelle", () => {
    const pages = corruptedLabelFixture({ corruptedLabelText: "EXTREM NORD" });
    const result = parseMinsanteA3(pages, true);
    const names = result.filiereSections.flatMap((s) => s.rows.map((r) => r.schoolName));
    assert.equal(piiScan(names).length, 0);
  });
});
