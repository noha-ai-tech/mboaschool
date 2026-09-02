import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("la liste de paie conserve données, contexte et vues responsive", async () => {
  const page = await source("src/app/pro/paie/page.tsx");
  assert.match(page, /requireActiveEstablishment\(supabase, user\.id, school, "\/pro\/paie"\)/);
  assert.match(page, /\.from\("bulletins_paie"\)/);
  assert.match(page, /FormulaireCalculPaie/);
  assert.match(page, /withEstablishmentQuery\(`\/pro\/paie\/\$\{item\.id\}`/);
  assert.match(page, /SchoolAdminResponsiveTable/);
  assert.match(page, /hidden md:block/);
  assert.match(page, /md:hidden/);
});

test("calcul et validations conservent exactement API et payloads", async () => {
  const [calculation, validation] = await Promise.all([source("src/components/pro/FormulaireCalculPaie.tsx"), source("src/components/pro/PaieValidation.tsx")]);
  assert.match(calculation, /fetch\("\/api\/payroll\/calculer"/);
  assert.match(calculation, /JSON\.stringify\(\{ staffMemberId, periodeDebut, periodeFin, requestedEstablishmentId: establishmentId \}\)/);
  assert.match(calculation, /withEstablishmentQuery\(`\/pro\/paie\/\$\{body\.bulletinId\}`/);
  assert.match(validation, /`\/api\/payroll\/\$\{bulletinId\}\/\$\{step\}`/);
  assert.match(validation, /"valider-rh"/);
  assert.match(validation, /"valider-direction"/);
  assert.match(validation, /JSON\.stringify\(\{ requestedEstablishmentId: establishmentId \}\)/);
  for (const file of [calculation, validation]) { assert.match(file, /SchoolAdminDialog/); assert.doesNotMatch(file, /supabase|console\./); }
});

test("le bulletin conserve export, lignes, heures et historique", async () => {
  const page = await source("src/app/pro/paie/[id]/page.tsx");
  assert.match(page, /\.from\("bulletins_paie"\)/);
  assert.match(page, /\.eq\("etablissement_id", etablissement\.id\)/);
  assert.match(page, /\.from\("bulletin_paie_lignes"\)/);
  assert.match(page, /\.from\("bulletin_paie_historique"\)/);
  assert.match(page, /href=\{`\/api\/payroll\/\$\{id\}\/export`\}/);
  assert.match(page, /heures_prevues/);
  assert.match(page, /heures_effectuees/);
  assert.match(page, /line\.signe === "-" \? "Déduction" : "Ajout"/);
  assert.doesNotMatch(page, /console\./);
});

test("la configuration conserve valeurs, unités et upsert", async () => {
  const [page, form] = await Promise.all([source("src/app/pro/paie/configuration/page.tsx"), source("src/components/pro/FormulaireConfigurationPaie.tsx")]);
  assert.match(page, /requireActiveEstablishment\(supabase, user\.id, school, "\/pro\/paie\/configuration"\)/);
  assert.match(form, /devise: initial\?\.devise \?\? "FCFA"/);
  assert.match(form, /frequence_paie: initial\?\.frequence_paie \?\? "mensuelle"/);
  assert.match(form, /seuil_retard_minutes: initial\?\.seuil_retard_minutes \?\? 10/);
  assert.match(form, /taux_heure_sup_multiplicateur: initial\?\.taux_heure_sup_multiplicateur \?\? 1\.25/);
  assert.match(form, /jour_paie: initial\?\.jour_paie \?\? 28/);
  assert.match(form, /\.from\("payroll_config"\)\.upsert\(\{ etablissement_id: etablissementId, \.\.\.form, updated_at: new Date\(\)\.toISOString\(\) \}\)/);
});

test("les frais conservent la sémantique exacte de zéro et le contexte école", async () => {
  const [fees, publicPage] = await Promise.all([source("src/app/dashboard/ecole/frais/page.tsx"), source("src/components/school/GeneralTab.tsx")]);
  assert.match(fees, /useSchool\(\)/);
  assert.match(fees, /\.eq\("establishment_id", school\.id\)/);
  assert.match(fees, /data\[field\.key\] \? String\(data\[field\.key\]\) : ""/);
  assert.match(fees, /form\[field\.key\] \? Number\(form\[field\.key\]\) : 0/);
  assert.match(fees, /\.from\("fees"\)\.update\(payload\)/);
  assert.match(fees, /\.from\("fees"\)\.insert\(\{ establishment_id: school\.id, \.\.\.payload \}\)/);
  assert.match(publicPage, /Number\(fees\[f\.key\]\) > 0/);
});

test("paiements reste un placeholder sans transaction ni intégration", async () => {
  const page = await source("src/app/dashboard/ecole/paiements/page.tsx");
  assert.match(page, /Prochainement/);
  assert.match(page, /Orange Money, MTN MoMo et CinetPay ne sont pas activés/);
  assert.match(page, /SchoolAdminEmptyState/);
  assert.doesNotMatch(page, /fetch\(|supabase|<form|transaction.*map/i);
});
