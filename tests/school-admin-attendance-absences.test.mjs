import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("le kiosque conserve le contrat de pointage et ses cinq états sans écriture de test", async () => {
  const file = await source("src/app/pro/pointage/kiosque/page.tsx");
  assert.match(file, /type Status = "idle" \| "loading" \| "success" \| "denied" \| "error"/);
  assert.match(file, /fetch\("\/api\/pointage\/enregistrer"/);
  assert.match(file, /JSON\.stringify\(\{ code_pointage: submittedPin, type, photo, requestedEstablishmentId \}\)/);
  assert.match(file, /capturePhoto\(\) \?\? "data:image\/jpeg;base64,\/9j\/4AAQ"/);
  assert.match(file, /setPin\(""\); setMessage\(""\); setStatus\("loading"\)/);
  assert.match(file, /role=\{success \? "status" : "alert"\}/);
  assert.doesNotMatch(file, /supabase|\.from\("pointages"\)/);
});

test("le kiosque préserve caméra, code masqué et zones tactiles accessibles", async () => {
  const file = await source("src/app/pro/pointage/kiosque/page.tsx");
  assert.match(file, /getUserMedia/);
  assert.match(file, /canvas\.toDataURL\("image\/jpeg", 0\.85\)/);
  assert.match(file, /aria-label=\{`Code saisi : \$\{pin\.length\}/);
  assert.match(file, /aria-label=\{digit === "DEL" \? "Effacer le dernier chiffre"/);
  assert.match(file, /disabled=\{pin\.length < 4 \|\| status === "loading"\}/);
});

test("l’historique conserve lectures, RPC, filtres et liens signés privés", async () => {
  const file = await source("src/app/pro/pointage/historique/page.tsx");
  assert.match(file, /requireActiveEstablishment\(supabase, user\.id, params\.school, "\/pro\/pointage\/historique"\)/);
  assert.match(file, /\.from\("pointages"\)\.select\("id, type, horodatage, photo_path"\)/);
  assert.match(file, /rpc\("calculer_heures_enseignant"/);
  assert.match(file, /createSignedUrl\(pointage\.photo_path, 3600\)/);
  assert.match(file, /rel="noopener noreferrer"/);
  assert.match(file, /name="school" value=\{etablissementId\}/);
  assert.match(file, /SchoolAdminResponsiveTable/);
  assert.match(file, /hidden md:block/);
  assert.match(file, /md:hidden/);
  assert.doesNotMatch(file, /console\.(?:log|error|warn)/);
});

test("les absences conservent leurs contrats sans inventer d’approbation", async () => {
  const [page, form] = await Promise.all([source("src/app/pro/absences/page.tsx"), source("src/components/pro/FormulaireAbsence.tsx")]);
  assert.match(page, /requireActiveEstablishment\(supabase, user\.id, school, "\/pro\/absences"\)/);
  assert.match(page, /select\("id, type, date_debut, date_fin, motif, statut, staff_members\(first_name, last_name\)"\)/);
  assert.match(page, /Aucun workflow d’approbation supplémentaire n’est disponible/);
  assert.match(page, /SchoolAdminResponsiveTable/);
  assert.match(form, /\.from\("absences"\)\.insert\(\{ staff_member_id: staffMemberId, type, date_debut: dateDebut, date_fin: dateFin, motif: motif \|\| null \}\)/);
  assert.match(form, /if \(!staffMemberId \|\| !dateDebut \|\| !dateFin \|\| saving\) return/);
  assert.doesNotMatch(`${page}\n${form}`, /approve|approuver|valider-direction/);
});
