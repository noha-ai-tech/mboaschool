import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { isInMinsanteApprovedPopulation, selectMinsanteApprovedPopulation, type MinsantePilotRowForPopulation } from "../minsanteApprovedPopulation";

/**
 * SPRINT MINSANTE-G §20 — "Mechanically prove none of the 14 deferred rows
 * can enter payload... Even if names/categories look valid: not in approval
 * snapshot = not promotable."
 *
 * Fixture = les 22 lignes RÉELLES du pilote MINSANTE (batch minsante-pilot-v1,
 * relues en direct depuis establishment_import_staging ce sprint,
 * 2026-08-20) : 8 CLEAN_APPROVABLE (exactement les staging_id du snapshot
 * reports/registry/minsante-f-pilot-approval.json), 13 CATEGORY_REVIEW, 1
 * DUPLICATE_REVIEW. Noms d'établissements publics (registre officiel
 * MINSANTE), aucune donnée personnelle.
 */

const APPROVED_STAGING_IDS = [
  "109f38dc-ff92-4fb9-9028-f2f1fb065042",
  "273f8980-4983-4ae8-b3c1-8b1036dfd43d",
  "6b365ea6-5cb6-43b0-ac22-cabd3a60b8e5",
  "79370ccb-3f09-426f-bdc7-bc6ac9055345",
  "9c4b9a28-1aa2-4fc2-baa8-48d3919758f7",
  "b92dd780-b05c-4b47-aaa4-e6d0b6783778",
  "ba827d94-6542-40fd-b811-a0d964a8bceb",
  "bbf4f625-3574-4bfa-b17a-278282b3bb6f",
] as const;

const PILOT_22_ROWS: (MinsantePilotRowForPopulation & { name: string })[] = [
  { staging_id: "2c29d228-e387-4db1-a855-7425c05e6a96", name: "ECOLE PRIVEE FONDATION JEUGEUVOU FOWANG DE BAFOUSSAM", classification: "CATEGORY_REVIEW" },
  { staging_id: "79370ccb-3f09-426f-bdc7-bc6ac9055345", name: "ECOLE PRIVEE DES SCIENCES DE LA SANTE MENO DE BAMENA", classification: "CLEAN_APPROVABLE" },
  { staging_id: "b92dd780-b05c-4b47-aaa4-e6d0b6783778", name: "COMPLEXE PRIVE DE FORMATION DES PERSONNELS MEDICO-SANITAIRES \"FONDATION TSOPJIO ET TAKOUDJOU\" DE DSCHANG", classification: "CLEAN_APPROVABLE" },
  { staging_id: "109f38dc-ff92-4fb9-9028-f2f1fb065042", name: "ECOLE DES INFIRMIERS DIPLOMES D'ETAT DE BAFOUSSAM", classification: "CLEAN_APPROVABLE" },
  { staging_id: "7517d1df-be2c-4b4e-bb15-fc4548735739", name: "ECOLE DES METIERS DE LA SANTE DE BAMOUGOUM", classification: "CATEGORY_REVIEW" },
  { staging_id: "265476d2-d4fe-4e6d-adc7-39cabdc01fa8", name: "ECOLE PRIVEE DE FORMATION DES PERSONNELS DE SANTE FONDATION SAINT MAURICE DE BAFOUSSAM", classification: "CATEGORY_REVIEW" },
  { staging_id: "3c04b5c8-4a6d-4ad8-b625-bda87186c800", name: "COMPLEXE PRIVE DE FORMATION DU PERSONNEL DE LA SANTE DE MBOUO BANDJOUN", classification: "CATEGORY_REVIEW" },
  { staging_id: "68c3cd5b-de66-4f3c-9c3c-fdbdaad7f54c", name: "COMPLEXE DE FORMATION DES PERSONNELS DE SANTE ROIS MAGES COFPSAROMA DE BALENG", classification: "CATEGORY_REVIEW" },
  { staging_id: "8bf90bbd-3520-4f16-8cd7-e708892473bd", name: "COMPLEXE PRIVE DE FORMATION DU PERSONNEL MEDICO-SANITAIRE DE MBOUDA", classification: "CATEGORY_REVIEW" },
  { staging_id: "ba827d94-6542-40fd-b811-a0d964a8bceb", name: "ECOLE DES INFIRMIERS DIPLOMES D'ETAT DE FOUMBAN", classification: "CLEAN_APPROVABLE" },
  { staging_id: "92c96f6f-bf11-4de7-b9cf-44f2be0564b4", name: "ECOLE DES PROFESSIONNELS DE LA SANTE LES ETOILES DE BAFOUSSAM", classification: "CATEGORY_REVIEW" },
  { staging_id: "276633af-df10-4d1e-b91e-596c7a50ed34", name: "ECOLE DES METIERS DE LA SANTE EMES DE BAMOUGOUM", classification: "DUPLICATE_REVIEW" },
  { staging_id: "273f8980-4983-4ae8-b3c1-8b1036dfd43d", name: "ECOLE DES SCIENCES DE LA SANTE DE L'INSTITUT SUPERIEUR DE BAFANG", classification: "CLEAN_APPROVABLE" },
  { staging_id: "5f99f3be-fd64-4d9a-a8fd-709d9e4f0821", name: "ECOLE PRIVEE DE FORMATION DES PERSONNELS SANITAIRES \"SAINT JOSEPH\" DE BAFOUSSAM", classification: "CATEGORY_REVIEW" },
  { staging_id: "0e0202b8-3175-4db9-890d-0294057239a1", name: "ECOLE PRIVEE DE FORMATION DU PERSONNEL DE LA SANTE DE BAFOUSSAM", classification: "CATEGORY_REVIEW" },
  { staging_id: "500e77b8-68a9-4e4f-8e0f-032890ff8520", name: "INSTITUT DES SCIENCES MEDICO-SANITAIRES LES ARGUS DE BANDJOUN", classification: "CATEGORY_REVIEW" },
  { staging_id: "27a2a636-eced-4971-8f62-67d8d1028ab3", name: "INSTITUT TROPICAL DE FORMATION EN PLAIES CHRONIQUES ET EN SOINS INFIRMIERS \"MOULLEC\" DE BALEVENG", classification: "CATEGORY_REVIEW" },
  { staging_id: "bbf4f625-3574-4bfa-b17a-278282b3bb6f", name: "INSTITUT DES SCIENCES ET TECHNIQUES MEDICO-SANITAIRES DE BAFOUSSAM", classification: "CLEAN_APPROVABLE" },
  { staging_id: "a2f1cf0b-520e-42b1-bb84-81a20f9de8a3", name: "INSTITUT INTERNATIONAL DE FORMATION DE PERSONNELS PARAMEDICAUX IFOPP DE FOUMBOT", classification: "CATEGORY_REVIEW" },
  { staging_id: "f56097c9-ac2a-4bae-95af-2838aed0033f", name: "INSTITUT DES SCIENCES DE LA SANTE POOLA DE BAFOUSSAM", classification: "CATEGORY_REVIEW" },
  { staging_id: "9c4b9a28-1aa2-4fc2-baa8-48d3919758f7", name: "ECOLE PRIVEE FONDATION TCHUENTE DE BAFOUSSAM", classification: "CLEAN_APPROVABLE" },
  { staging_id: "6b365ea6-5cb6-43b0-ac22-cabd3a60b8e5", name: "INSTITUT UNIVERSITAIRE ROYAL BABOUTCHA NINTCHEU (IURB) DE BAFANG", classification: "CLEAN_APPROVABLE" },
];

describe("selectMinsanteApprovedPopulation — SPRINT MINSANTE-G §4/§20, protection mécanique de la population différée", () => {
  test("22 lignes réelles du pilote -> exactement 8 sélectionnées, toutes dans le snapshot", () => {
    assert.equal(PILOT_22_ROWS.length, 22);
    const selected = selectMinsanteApprovedPopulation(PILOT_22_ROWS, APPROVED_STAGING_IDS);
    assert.equal(selected.length, 8);
    for (const row of selected) assert.ok(APPROVED_STAGING_IDS.includes(row.staging_id as (typeof APPROVED_STAGING_IDS)[number]));
  });

  test("les 13 CATEGORY_REVIEW différés sont TOUS exclus", () => {
    const categoryReview = PILOT_22_ROWS.filter((r) => r.classification === "CATEGORY_REVIEW");
    assert.equal(categoryReview.length, 13);
    for (const row of categoryReview) assert.equal(isInMinsanteApprovedPopulation(row, APPROVED_STAGING_IDS), false, `${row.name} (CATEGORY_REVIEW) ne doit jamais être éligible`);
  });

  test("la ligne DUPLICATE_REVIEW différée est exclue", () => {
    const dup = PILOT_22_ROWS.find((r) => r.classification === "DUPLICATE_REVIEW")!;
    assert.equal(dup.staging_id, "276633af-df10-4d1e-b91e-596c7a50ed34");
    assert.equal(isInMinsanteApprovedPopulation(dup, APPROVED_STAGING_IDS), false);
  });

  test("un candidat différé dont la classification est falsifiée en CLEAN_APPROVABLE (mais staging_id hors snapshot) reste exclu — 'not in approval snapshot = not promotable', §20 littéral", () => {
    const tampered: MinsantePilotRowForPopulation = { staging_id: "500e77b8-68a9-4e4f-8e0f-032890ff8520", classification: "CLEAN_APPROVABLE" };
    assert.equal(isInMinsanteApprovedPopulation(tampered, APPROVED_STAGING_IDS), false, "ne pas figurer dans le snapshot suffit seul à exclure, même si la classification semble valide");
  });

  test("un candidat du snapshot dont la classification a régressé (ex. DUPLICATE_REVIEW détecté à la revalidation) est exclu malgré son staging_id approuvé — §5, jamais un statut historique réutilisé sans preuve fraîche", () => {
    const regressed: MinsantePilotRowForPopulation = { staging_id: "9c4b9a28-1aa2-4fc2-baa8-48d3919758f7", classification: "DUPLICATE_REVIEW" };
    assert.equal(isInMinsanteApprovedPopulation(regressed, APPROVED_STAGING_IDS), false);
  });

  test("un ID totalement inconnu (hors des 22 lignes du pilote) marqué CLEAN_APPROVABLE reste exclu", () => {
    const foreign: MinsantePilotRowForPopulation = { staging_id: "00000000-0000-0000-0000-000000000000", classification: "CLEAN_APPROVABLE" };
    assert.equal(isInMinsanteApprovedPopulation(foreign, APPROVED_STAGING_IDS), false);
  });

  test("total pilote reconcilié : 8 + 13 + 1 = 22", () => {
    const tally: Record<string, number> = {};
    for (const r of PILOT_22_ROWS) tally[r.classification] = (tally[r.classification] ?? 0) + 1;
    assert.deepEqual(tally, { CATEGORY_REVIEW: 13, CLEAN_APPROVABLE: 8, DUPLICATE_REVIEW: 1 });
  });
});
