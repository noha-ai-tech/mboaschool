import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(testDirectory, "..");

async function source(relativePath) {
  return readFile(path.join(projectRoot, relativePath), "utf8");
}

const FORM = "src/components/pro/FormulaireAbsence.tsx";

test("le pilote enqueue une mutation offline plutôt que d'insérer directement dans Supabase", async () => {
  const src = await source(FORM);
  assert.match(src, /enqueueMutation\(\{/);
  assert.match(src, /entityType: "absence"/);
  assert.match(src, /operation: "create"/);
  assert.doesNotMatch(src, /supabase\.from\("absences"\)\.insert/);
});

test("la mutation en attente déclenche immédiatement une tentative de synchronisation (en ligne, l'UX reste instantanée)", async () => {
  const src = await source(FORM);
  assert.match(src, /triggerManualSync\(\)/);
});

test("le message affiché distingue explicitement 'enregistré localement' de 'synchronisé' — jamais un faux 'Enregistré' serveur", async () => {
  const src = await source(FORM);
  assert.match(src, /navigator\.onLine \? "Période enregistrée — synchronisation en cours\." : "Période enregistrée sur cet appareil — sera synchronisée au retour du réseau\."/);
});

test("le formulaire affiche <SyncStatus /> pour que l'état de synchronisation soit toujours visible", async () => {
  const src = await source(FORM);
  assert.match(src, /<SyncStatus \/>/);
});

test("la soumission est bloquée tant que l'identité de l'utilisateur (userId) n'est pas résolue — jamais de mutation orpheline", async () => {
  const src = await source(FORM);
  assert.match(src, /if \(!staffMemberId \|\| !dateDebut \|\| !dateFin \|\| saving \|\| !userId\) return;/);
});

test("le composant reçoit establishmentId en prop plutôt que de le deviner côté client", async () => {
  const src = await source(FORM);
  assert.match(src, /establishmentId \}: \{ staffMembers: \{ id: string; nom: string \}\[\]; establishmentId: string \}/);
});

test("la page /pro/absences fournit bien establishmentId depuis l'établissement actif résolu côté serveur", async () => {
  const src = await source("src/app/pro/absences/page.tsx");
  assert.match(src, /establishmentId=\{etablissement\.id\}/);
});

// OFFLINE-01.2 (P1 fix) — une seule source de vérité pour "quel
// utilisateur authentifié" (syncIdentity.ts), la même que le moteur de
// synchronisation utilise, plutôt qu'un second appel getUser() séparé
// qui pourrait diverger de l'identité active du moteur offline.
test("le pilote lit l'identité active partagée (syncIdentity) plutôt qu'un appel getUser() séparé", async () => {
  const src = await source(FORM);
  assert.match(src, /getActiveSyncIdentity\(\)\.userId/);
  assert.match(src, /subscribeActiveSyncIdentity\(\(identity\) => setUserId\(identity\.userId\)\)/);
  assert.doesNotMatch(src, /supabase\.auth\.getUser\(\)/);
});
