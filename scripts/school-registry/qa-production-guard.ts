import {
  assertRegistryProductionWriteAllowed,
  computeApprovalChecksum,
  EXPECTED_PROJECT_REF,
  PROMOTION_CONFIRM_PHRASE,
  RegistryWriteRefused,
  type RegistryWriteRequest,
} from "./lib/productionGuard";

/**
 * SPRINT P.6 §28 — Prouve que le garde-fou refuse AVANT toute écriture pour
 * chaque scénario invalide, et n'accepte qu'un jeu de paramètres entièrement
 * correct. Aucun appel réseau, aucune écriture : validation pure de
 * assertRegistryProductionWriteAllowed().
 */

const approvedRows = [
  { id: "s1", officialId: "OFF-1", decision: "approved_for_promotion" },
  { id: "s2", officialId: "OFF-2", decision: "approved_for_promotion" },
];
const validChecksum = computeApprovalChecksum(approvedRows);

const BASE: RegistryWriteRequest = {
  commit: true,
  confirmPhrase: PROMOTION_CONFIRM_PHRASE,
  projectRef: EXPECTED_PROJECT_REF,
  batch: "some-batch",
  expectedBatch: "some-batch",
  sourceMinistry: "MINESEC",
  expectedSourceMinistry: "MINESEC",
  actualCandidates: 2,
  expectedCandidates: 2,
  computedChecksum: validChecksum,
  approvalChecksum: validChecksum,
};

interface Scenario {
  name: string;
  request: RegistryWriteRequest;
  expectBlocked: boolean;
}

const scenarios: Scenario[] = [
  { name: "pas de --commit", request: { ...BASE, commit: false }, expectBlocked: true },
  { name: "mauvais project ref", request: { ...BASE, projectRef: "wrong-project-ref" }, expectBlocked: true },
  { name: "mauvais expected count", request: { ...BASE, actualCandidates: 3 }, expectBlocked: true },
  { name: "checksum différent", request: { ...BASE, approvalChecksum: "0000000000000000000000000000000000000000000000000000000000000000" }, expectBlocked: true },
  { name: "staging non approuvé (batch différent de l'attendu)", request: { ...BASE, batch: "unapproved-batch" }, expectBlocked: true },
  {
    name: "official_id déjà existant (simulé par actualCandidates=0 après filtrage anti-doublon)",
    request: { ...BASE, actualCandidates: 0, expectedCandidates: 0, computedChecksum: computeApprovalChecksum([]), approvalChecksum: computeApprovalChecksum([]) },
    // Ce cas n'est PAS un refus du guard lui-même : le filtrage anti-doublon (déjà
    // implémenté dans promote-master-v1-approved.ts, §"already_exists") retire la
    // ligne AVANT que le guard ne voie 0 candidat restant. On vérifie ici que 0
    // candidat approuvé ne s'auto-transforme jamais en écriture (expectedCandidates
    // doit aussi valoir 0, sinon REFUSED plus haut).
    expectBlocked: false,
  },
  { name: "phrase de confirmation manquante", request: { ...BASE, confirmPhrase: undefined }, expectBlocked: true },
  { name: "tous les paramètres corrects", request: { ...BASE }, expectBlocked: false },
];

let allExpected = true;
console.log("=== SPRINT P.6 §28 — QA garde-fou production ===\n");
for (const s of scenarios) {
  let blocked = false;
  let reason = "";
  try {
    assertRegistryProductionWriteAllowed(s.request);
  } catch (e) {
    blocked = true;
    reason = e instanceof RegistryWriteRefused ? e.message : `erreur inattendue: ${e}`;
  }
  const ok = blocked === s.expectBlocked;
  allExpected = allExpected && ok;
  const label = blocked ? "BLOCKED" : "ALLOWED";
  console.log(`[${ok ? "OK" : "ÉCHEC QA"}] ${s.name} -> ${label}${reason ? ` (${reason})` : ""}`);
}

console.log(`\nTous les scénarios se comportent comme attendu : ${allExpected ? "OUI" : "NON"}`);
if (!allExpected) process.exit(1);
