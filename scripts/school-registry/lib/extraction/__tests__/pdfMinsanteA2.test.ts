import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { parseMinsanteA2 } from "../pdfMinsanteA2";
import type { CoordTextItem } from "../pdfMinsanteA2";
import { piiScan } from "../piiScan";
import { sha256Bytes } from "../hashing";
import { OFFICIAL_PROGRAMS } from "../pdfMinsanteA1";

/**
 * SPRINT MINSANTE-I §15 — matrice de tests A-M pour le parseur
 * `minsante-a2-pdf-coordinates@1`. Lancer :
 * npx tsx --test scripts/school-registry/lib/extraction/__tests__/pdfMinsanteA2.test.ts
 *
 * Fixtures synthétiques (noms d'établissements fictifs, aucune donnée
 * réelle du PDF source, aucune PII possible par construction) construites
 * à partir des constantes structurelles mesurées empiriquement sur le
 * document réel : colonne région X<=120, colonne écoles X>120, hauteur de
 * ligne ~15pt entre lignes distinctes, ~10.3pt entre lignes d'un même nom
 * déroulé sur plusieurs lignes physiques (cf. MINSANTE_IMPORT_CONTRACT.md
 * §A.2 pour les mesures brutes et la preuve directe sur le document réel).
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
const INFIRMIERS = "INFIRMIERS";
const IMAGERIE = "IMAGERIE MEDICALE";
const KINE = "KINESITHERAPIE";

describe("A — détection des 10 filières (vocabulaire officiel)", () => {
  test("les 10 libellés officiels sont tous reconnus", () => {
    assert.equal(Object.keys(OFFICIAL_PROGRAMS).length, 10);
  });

  test("une filière inconnue déclenche un STOP fail-closed, jamais un tableau vide", () => {
    const pages: CoordTextItem[][] = [[filiereHeader(1, 648, "FILIERE INEXISTANTE"), ...tableHeader(1, 624), regionLabel(1, 595, "CENTRE"), ...numberedRow(1, 608, 1, "ECOLE TEST")]];
    assert.throws(() => parseMinsanteA2(pages), /filière inconnue/i);
  });

  test("aucun en-tête FILIERE -> STOP fail-closed", () => {
    const pages: CoordTextItem[][] = [[it(1, 60, 500, "TEXTE SANS AUCUNE STRUCTURE")]];
    assert.throws(() => parseMinsanteA2(pages), /aucun en-tête/i);
  });
});

describe("B — détection des régions", () => {
  test("une région officielle est correctement rattachée à ses lignes", () => {
    const pages: CoordTextItem[][] = [
      [filiereHeader(1, 648, ANALYSES), ...tableHeader(1, 624), regionLabel(1, 595, "CENTRE"), ...numberedRow(1, 608, 1, "ECOLE ALPHA DE YAOUNDE")],
    ];
    const result = parseMinsanteA2(pages);
    const s = result.filiereSections[0];
    assert.equal(s.rows.length, 1);
    assert.equal(s.rows[0].region, "Centre");
  });

  test("une étiquette dans la colonne région qui ne correspond à aucune région connue -> anomalie fail-closed", () => {
    const pages: CoordTextItem[][] = [
      [filiereHeader(1, 648, ANALYSES), ...tableHeader(1, 624), regionLabel(1, 595, "ATLANTIDE"), ...numberedRow(1, 608, 1, "ECOLE ALPHA")],
    ];
    const result = parseMinsanteA2(pages);
    const s = result.filiereSections[0];
    assert.equal(s.verdict, "QUARANTINED_STRUCTURE_AMBIGUOUS");
    assert.ok(s.structuralAnomalies.some((a) => a.startsWith("UNKNOWN_REGION_LABEL")));
  });
});

describe("C — reconstruction multi-colonnes / multi-fragments sur une même ligne", () => {
  test("des fragments partageant la même Y se recollent sans espace synthétique ajouté", () => {
    // Reproduit le cas réel trouvé ce sprint : un mot coupé en deux items
    // adjacents SANS item espace entre eux doit redevenir un seul mot.
    const pages: CoordTextItem[][] = [
      [
        filiereHeader(1, 648, ANALYSES),
        ...tableHeader(1, 624),
        regionLabel(1, 595, "CENTRE"),
        it(1, 144.86, 608, "1."),
        it(1, 150.99, 608, " "),
        it(1, 168.98, 608, "ECOLE PRIVEE DE FORMATION DES PERSON"),
        it(1, 240, 608, "NELS DE SANTE DE YAOUNDE"), // pas d'item espace entre les deux -> pas d'espace inséré
      ],
    ];
    const result = parseMinsanteA2(pages);
    assert.equal(result.filiereSections[0].rows[0].schoolName, "ECOLE PRIVEE DE FORMATION DES PERSONNELS DE SANTE DE YAOUNDE");
  });

  test("un item espace explicite entre deux fragments est préservé (pas perdu par le filtrage bruit)", () => {
    const pages: CoordTextItem[][] = [
      [
        filiereHeader(1, 648, ANALYSES),
        ...tableHeader(1, 624),
        regionLabel(1, 595, "CENTRE"),
        it(1, 144.86, 608, "1."),
        it(1, 150.99, 608, " "),
        it(1, 168.98, 608, "INSTITUT"),
        it(1, 200, 608, " "),
        it(1, 202, 608, "DES SCIENCES DE YAOUNDE"),
      ],
    ];
    const result = parseMinsanteA2(pages);
    assert.equal(result.filiereSections[0].rows[0].schoolName, "INSTITUT DES SCIENCES DE YAOUNDE");
  });

  test("un nom d'école déroulé sur 2 lignes physiques (écart Y réduit, orpheline 1 lettre) se recolle sans espace au point de coupure", () => {
    const pages: CoordTextItem[][] = [
      [
        filiereHeader(1, 648, ANALYSES),
        ...tableHeader(1, 624),
        regionLabel(1, 595, "CENTRE"),
        it(1, 144.86, 190.46, "1."),
        it(1, 150.99, 190.46, " "),
        it(1, 168.98, 190.46, "ECOLE PRIVEE DE F"), // orpheline 1 lettre -> suite mi-mot
        it(1, 168.98, 179.66, "ORMATION DES SCIENCES DE SANTE DE"), // 10.8pt d'écart -> suite
        it(1, 168.98, 169.34, "BAFANG"), // 10.32pt -> suite, mot complet, espace attendu avant
      ],
    ];
    const result = parseMinsanteA2(pages);
    assert.equal(result.filiereSections[0].rows[0].schoolName, "ECOLE PRIVEE DE FORMATION DES SCIENCES DE SANTE DE BAFANG");
  });
});

describe("D — changement de page au sein d'un bloc région", () => {
  test("une région qui continue sur la page suivante ne perd aucune ligne et ne casse pas la comparaison d'écart Y", () => {
    const pages: CoordTextItem[][] = [
      [filiereHeader(1, 648, ANALYSES), ...tableHeader(1, 624), regionLabel(1, 595, "CENTRE"), ...numberedRow(1, 580, 1, "ECOLE PAGE UN")],
      [...numberedRow(2, 700, 2, "ECOLE PAGE DEUX")],
    ];
    const result = parseMinsanteA2(pages);
    const s = result.filiereSections[0];
    assert.deepEqual(s.rows.map((r) => r.schoolName), ["ECOLE PAGE UN", "ECOLE PAGE DEUX"]);
    assert.deepEqual(s.pagesInvolved, [1, 2]);
    assert.equal(s.regionMatrix.find((r) => r.region === "Centre")?.numberingResetOk, true);
  });
});

describe("E — redémarrage de numérotation (numbering reset)", () => {
  test("chaque région redémarre correctement à 1", () => {
    const pages: CoordTextItem[][] = [
      [
        filiereHeader(1, 648, ANALYSES),
        ...tableHeader(1, 624),
        regionLabel(1, 595, "CENTRE"),
        ...numberedRow(1, 580, 1, "ECOLE CENTRE UN"),
        ...numberedRow(1, 565, 2, "ECOLE CENTRE DEUX"),
        regionLabel(1, 400, "OUEST"),
        ...numberedRow(1, 385, 1, "ECOLE OUEST UN"),
      ],
    ];
    const result = parseMinsanteA2(pages);
    const s = result.filiereSections[0];
    assert.equal(s.regionMatrix.find((r) => r.region === "Centre")?.numberingResetOk, true);
    assert.equal(s.regionMatrix.find((r) => r.region === "Ouest")?.numberingResetOk, true);
    assert.equal(s.verdict, "SAFE");
  });
});

describe("F — trou de numérotation (numbering gap)", () => {
  test("un numéro manquant est détecté et bloque le verdict SAFE", () => {
    const pages: CoordTextItem[][] = [
      [
        filiereHeader(1, 648, ANALYSES),
        ...tableHeader(1, 624),
        regionLabel(1, 595, "CENTRE"),
        ...numberedRow(1, 580, 1, "ECOLE CENTRE UN"),
        ...numberedRow(1, 565, 3, "ECOLE CENTRE TROIS"), // saut 1 -> 3, jamais 2
      ],
    ];
    const result = parseMinsanteA2(pages);
    const s = result.filiereSections[0];
    assert.equal(s.verdict, "QUARANTINED_STRUCTURE_AMBIGUOUS");
    assert.ok(s.structuralAnomalies.some((a) => a.startsWith("NUMBERING_GAP")));
  });
});

describe("G — zéro ligne réel (ZERO_ROWS_CONFIRMED)", () => {
  test("une région listée sans aucune ligne rattachée est un zéro confirmé, pas une perte de parsing", () => {
    const pages: CoordTextItem[][] = [
      [
        filiereHeader(1, 648, ANALYSES),
        ...tableHeader(1, 624),
        regionLabel(1, 595, "CENTRE"),
        ...numberedRow(1, 580, 1, "ECOLE CENTRE UN"),
        regionLabel(1, 560, "SUD"), // aucune ligne pour Sud avant la fin de section
      ],
    ];
    const result = parseMinsanteA2(pages);
    const s = result.filiereSections[0];
    const sud = s.regionMatrix.find((r) => r.region === "Sud");
    assert.equal(sud?.status, "ZERO_ROWS_CONFIRMED");
    assert.equal(sud?.rowCount, 0);
  });
});

describe("H — région non analysée ≠ zéro (REGION_NOT_PARSED)", () => {
  test("si la section est par ailleurs anormale, une région jamais vue n'est PAS convertie en zéro", () => {
    const pages: CoordTextItem[][] = [
      [
        filiereHeader(1, 648, ANALYSES),
        ...tableHeader(1, 624),
        regionLabel(1, 595, "CENTRE"),
        ...numberedRow(1, 580, 1, "ECOLE CENTRE UN"),
        ...numberedRow(1, 565, 3, "ECOLE CENTRE TROIS"), // provoque NUMBERING_GAP -> section anormale
      ],
    ];
    const result = parseMinsanteA2(pages);
    const s = result.filiereSections[0];
    assert.ok(s.structuralAnomalies.length > 0);
    // Adamaoua n'apparaît jamais dans ce document synthétique : comme la
    // section est anormale ailleurs, on ne peut pas garantir que
    // l'étiquette n'a pas été manquée -> REGION_NOT_PARSED, jamais un zéro.
    const adamaoua = s.regionMatrix.find((r) => r.region === "Adamaoua");
    assert.equal(adamaoua?.status, "REGION_NOT_PARSED");
  });
});

describe("I — régression Imagerie Médicale (numéros absents dès la source)", () => {
  test("une filière SANS AUCUN numéro peint ne doit JAMAIS retomber silencieusement à 0 ligne", () => {
    // Reproduit exactement la structure réelle : colonne ECOLES sans
    // aucun item numéro, séparation des lignes uniquement par écart Y.
    const pages: CoordTextItem[][] = [
      [
        filiereHeader(1, 648, IMAGERIE),
        ...tableHeader(1, 624),
        regionLabel(1, 595, "ADAMAOUA"),
        ...unnumberedRow(1, 580, "ECOLE IMAGERIE UN"),
        regionLabel(1, 400, "CENTRE"),
        ...unnumberedRow(1, 385, "ECOLE IMAGERIE DEUX"),
        ...unnumberedRow(1, 370, "ECOLE IMAGERIE TROIS"),
      ],
    ];
    const result = parseMinsanteA2(pages);
    const s = result.filiereSections[0];
    // C'est ICI le garde-fou anti-régression : le bug original MINSANTE-A
    // était exactement "0 ligne détectée pour Imagerie Médicale" à cause
    // d'une exigence de préfixe numérique. Ce test échoue si ce bug revient.
    assert.ok(s.rows.length > 0, "0 ligne détectée pour Imagerie Médicale — régression du bug MINSANTE-A");
    assert.equal(s.rows.length, 3);
    assert.equal(s.numberingMode, "NUMBERING_ABSENT_SOURCE_DEFECT");
    // Numéros absents = ne peut pas être déclaré SAFE (pas de recoupement possible), mais ce n'est pas 0 ligne pour autant.
    assert.equal(s.verdict, "QUARANTINED_NUMBERING_ABSENT");
  });
});

describe("J — réconciliation legacy (6 filières historiquement fiables)", () => {
  test("les variations de ponctuation/espacement se normalisent sans divergence silencieuse", () => {
    // Le mécanisme de réconciliation utilisé par extract-minsante-a2.ts
    // repose sur la normalisation des espaces (déjà appliquée par le
    // parseur lui-même) puis sur exactIdentityKey (moteur de matching
    // partagé, inchangé) pour absorber les variations de ponctuation
    // typiques des différences A.1 vs A.2 trouvées ce sprint.
    const pages: CoordTextItem[][] = [
      [filiereHeader(1, 648, ANALYSES), ...tableHeader(1, 624), regionLabel(1, 595, "CENTRE"), ...numberedRow(1, 580, 1, "ECOLE   ALPHA  DE YAOUNDE")],
    ];
    const result = parseMinsanteA2(pages);
    assert.equal(result.filiereSections[0].rows[0].schoolName, "ECOLE ALPHA DE YAOUNDE");
  });
});

describe("K — sortie sans PII", () => {
  test("piiScan ne trouve rien dans un jeu de lignes école×filière normal", () => {
    const pages: CoordTextItem[][] = [
      [filiereHeader(1, 648, INFIRMIERS), ...tableHeader(1, 624), regionLabel(1, 595, "CENTRE"), ...numberedRow(1, 580, 1, "ECOLE DES INFIRMIERS DE YAOUNDE")],
    ];
    const result = parseMinsanteA2(pages);
    const names = result.filiereSections.flatMap((s) => s.rows.map((r) => r.schoolName));
    assert.equal(piiScan(names).length, 0);
  });

  test("piiScan détecte un email, un téléphone et un matricule s'ils apparaissent", () => {
    const hits = piiScan(["contact@ecole-test.cm", "champ matricule 12345", "+237 677 12 34 56", "ECOLE NORMALE SANS PII"]);
    assert.deepEqual(
      hits.map((h) => h.field).sort(),
      ["email", "matricule", "phone"]
    );
  });
});

describe("L — sortie déterministe", () => {
  test("le même jeu d'items produit exactement le même résultat à chaque appel", () => {
    const pages: CoordTextItem[][] = [
      [
        filiereHeader(1, 648, KINE),
        ...tableHeader(1, 624),
        regionLabel(1, 595, "CENTRE"),
        ...numberedRow(1, 580, 1, "ECOLE UN"),
        ...numberedRow(1, 565, 2, "ECOLE DEUX"),
      ],
    ];
    const r1 = parseMinsanteA2(pages);
    const r2 = parseMinsanteA2(pages);
    assert.equal(JSON.stringify(r1), JSON.stringify(r2));
  });
});

describe("M — même PDF -> même checksum/résultats", () => {
  test("sha256Bytes est déterministe sur les mêmes octets", () => {
    const bytes = new Uint8Array([37, 80, 68, 70, 45, 49, 46, 53]); // "%PDF-1.5"
    assert.equal(sha256Bytes(bytes), sha256Bytes(bytes.slice()));
  });
  test("sha256Bytes distingue deux contenus différents", () => {
    const a = new Uint8Array([1, 2, 3]);
    const b = new Uint8Array([1, 2, 4]);
    assert.notEqual(sha256Bytes(a), sha256Bytes(b));
  });
});
