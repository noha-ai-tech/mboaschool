import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { buildUniqueSchoolCandidates } from "../minsanteDedup";
import type { RawSchoolProgramRow } from "../pdfMinsanteA1";

/**
 * SPRINT MINSANTE-A.1 — Suite de non-régression de la déduplication
 * école×filière -> établissement unique. Lancer :
 * npx tsx --test scripts/school-registry/lib/extraction/__tests__/minsanteDedup.test.ts
 */

function row(overrides: Partial<RawSchoolProgramRow>): RawSchoolProgramRow {
  return {
    filiereRaw: "INFIRMIERS",
    programNormalized: "Infirmiers",
    region: "Centre",
    rawSchoolName: "ECOLE TEST",
    sourceLine: 1,
    ...overrides,
  };
}

describe("§8 — même école, plusieurs filières -> 1 seul établissement, filières unies", () => {
  test("2 lignes, même nom exact, même région, filières différentes -> 1 candidat avec 2 programmes", () => {
    const rows: RawSchoolProgramRow[] = [
      row({ rawSchoolName: "ECOLE ALPHA DE YAOUNDE", programNormalized: "Infirmiers", filiereRaw: "INFIRMIERS", sourceLine: 10 }),
      row({ rawSchoolName: "ECOLE ALPHA DE YAOUNDE", programNormalized: "Analyses Médicales", filiereRaw: "ANALYSES MEDICALES", sourceLine: 50 }),
    ];
    const dedup = buildUniqueSchoolCandidates(rows);
    assert.equal(dedup.candidates.length, 1);
    assert.equal(dedup.exactMergeCount, 1);
    assert.deepEqual(dedup.candidates[0].programsNormalized, ["Analyses Médicales", "Infirmiers"]);
    assert.equal(dedup.candidates[0].mergedRowCount, 2);
    assert.deepEqual(dedup.candidates[0].sourceLines, [10, 50]);
  });

  test("casse/accents différents mais mots de catégorie identiques -> même clé (exactIdentityKey), toujours fusionné", () => {
    const rows: RawSchoolProgramRow[] = [
      row({ rawSchoolName: "École Alpha de Yaoundé", sourceLine: 1 }),
      row({ rawSchoolName: "ECOLE ALPHA DE YAOUNDE", programNormalized: "Kinésithérapie", filiereRaw: "KINESITHERAPIE", sourceLine: 2 }),
    ];
    const dedup = buildUniqueSchoolCandidates(rows);
    assert.equal(dedup.candidates.length, 1);
  });
});

describe("§9 — pas de fuzzy auto merge : LIKELY/AMBIGUOUS restent séparés", () => {
  test("noms très proches (variante de saisie) -> LIKELY_SAME_SCHOOL signalé, mais 2 candidats distincts (jamais fusionnés)", () => {
    const rows: RawSchoolProgramRow[] = [
      row({ rawSchoolName: "ECOLE DE FORMATION DU PERSONNEL DE SANTE ISSTMADD", sourceLine: 1 }),
      row({ rawSchoolName: "ECOLE DE FORMATION DU PERSONNEL DE SANTE ISSTMADD (NGAOUNDERE)", sourceLine: 2 }),
    ];
    const dedup = buildUniqueSchoolCandidates(rows);
    assert.equal(dedup.candidates.length, 2, "aucune fusion automatique même si très proche");
    const likely = dedup.reviewEntries.filter((r) => r.relationship === "LIKELY_SAME_SCHOOL");
    assert.equal(likely.length, 1);
  });

  test("noms partiellement proches (école différente, quartier voisin) -> AMBIGUOUS signalé, jamais fusionné", () => {
    const rows: RawSchoolProgramRow[] = [
      row({ rawSchoolName: "ECOLE PRIVEE DE FORMATION DES PROFESSIONNELS DE LA SANTE DE MEIGANGA", region: "Adamaoua", sourceLine: 1 }),
      row({ rawSchoolName: "ECOLE PRIVEE DE FORMATION DES PERSONNELS DE LA SANTE DE MEIGANGA", region: "Adamaoua", sourceLine: 2 }),
    ];
    const dedup = buildUniqueSchoolCandidates(rows);
    assert.equal(dedup.candidates.length, 2);
    assert.ok(dedup.reviewEntries.length >= 1);
    assert.ok(dedup.reviewEntries.every((r) => r.relationship !== "EXACT_SAME_SCHOOL" as never));
  });

  test("noms sans rapport, même région -> DISTINCT, aucun rapport généré (pas de bruit)", () => {
    const rows: RawSchoolProgramRow[] = [
      row({ rawSchoolName: "INSTITUT UNIVERSITAIRE PROTESTANT DE YAOUNDE", region: "Centre", sourceLine: 1 }),
      row({ rawSchoolName: "CESTAM DE YAOUNDE", region: "Centre", sourceLine: 2 }),
    ];
    const dedup = buildUniqueSchoolCandidates(rows);
    assert.equal(dedup.candidates.length, 2);
    assert.equal(dedup.reviewEntries.length, 0);
  });

  test("même nom exact mais région différente -> jamais fusionné, signalé AMBIGUOUS (collision de nom entre régions)", () => {
    const rows: RawSchoolProgramRow[] = [
      row({ rawSchoolName: "INSTITUT SUPERIEUR DE SANTE", region: "Centre", sourceLine: 1 }),
      row({ rawSchoolName: "INSTITUT SUPERIEUR DE SANTE", region: "Littoral", sourceLine: 2 }),
    ];
    const dedup = buildUniqueSchoolCandidates(rows);
    assert.equal(dedup.candidates.length, 2, "région différente => jamais fusionné même si nom identique");
    const crossRegion = dedup.reviewEntries.find((r) => r.schoolARegion !== r.schoolBRegion);
    assert.ok(crossRegion);
    assert.equal(crossRegion!.relationship, "AMBIGUOUS");
  });
});

describe("Comptabilité — input/output toujours cohérents, jamais de perte silencieuse", () => {
  test("totalInputRows = somme des mergedRowCount de tous les candidats", () => {
    const rows: RawSchoolProgramRow[] = [
      row({ rawSchoolName: "ECOLE A", sourceLine: 1 }),
      row({ rawSchoolName: "ECOLE A", programNormalized: "Kinésithérapie", filiereRaw: "KINESITHERAPIE", sourceLine: 2 }),
      row({ rawSchoolName: "ECOLE B", sourceLine: 3 }),
    ];
    const dedup = buildUniqueSchoolCandidates(rows);
    const total = dedup.candidates.reduce((sum, c) => sum + c.mergedRowCount, 0);
    assert.equal(total, rows.length);
    assert.equal(dedup.totalInputRows, rows.length);
  });
});
