import assert from "node:assert/strict";
import test from "node:test";
import { resolveConflict, strategyFor } from "../src/lib/offline/conflict.ts";

// OFFLINE-01 Phase 4 — le pilote "absence" est create-only (aucune table
// actuelle n'a de colonne updated_at/version, voir l'audit Phase 0), donc
// ce chemin n'est jamais exercé en conditions réelles par le pilote. Ces
// tests prouvent la logique générique avec un type d'entité synthétique
// ("draft-note") pour que les futurs modules update-heavy (Présence,
// Timesheet) puissent réutiliser le moteur immédiatement.

test("aucun conflit quand les versions correspondent", () => {
  const decision = resolveConflict("absence", "2026-09-01T10:00:00Z", "2026-09-01T10:00:00Z");
  assert.deepEqual(decision, { outcome: "apply", reason: "no-conflict" });
});

test("aucun conflit possible pour une création (baseVersion null)", () => {
  const decision = resolveConflict("absence", null, null);
  assert.equal(decision.outcome, "apply");
});

test("données opérationnelles (présence/timesheet-like) : conflit EXPLICITE si les versions divergent, jamais d'écrasement silencieux", () => {
  const decision = resolveConflict("absence", "2026-09-01T09:00:00Z", "2026-09-01T09:10:00Z");
  assert.deepEqual(decision, { outcome: "conflict", reason: "version-mismatch" });
});

test("brouillon (draft-note) : last-write-wins accepté même si les versions divergent", () => {
  const decision = resolveConflict("draft-note", "2026-09-01T09:00:00Z", "2026-09-01T09:10:00Z");
  assert.deepEqual(decision, { outcome: "apply", reason: "last-write-wins" });
});

test("strategyFor documente explicitement la stratégie par type d'entité", () => {
  assert.equal(strategyFor("absence"), "server-wins-explicit-conflict");
  assert.equal(strategyFor("draft-note"), "last-write-wins");
});

test("scénario du brief : professeur offline 09:00, censeur en ligne 09:10, retour réseau 09:30 — jamais d'écrasement silencieux pour une donnée opérationnelle", () => {
  const baseVersionSeenByTeacherOffline = "2026-09-01T08:55:00Z";
  const serverVersionAfterCenseurEdit = "2026-09-01T09:10:00Z";
  const decision = resolveConflict("absence", baseVersionSeenByTeacherOffline, serverVersionAfterCenseurEdit);
  assert.equal(decision.outcome, "conflict", "la mutation du professeur ne doit jamais écraser silencieusement la modification du censeur");
});
