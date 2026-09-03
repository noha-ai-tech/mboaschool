import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("l’emploi du temps conserve ses vues, contrats et contexte établissement", async () => {
  const page = await source("src/app/pro/emplois-du-temps/page.tsx");
  for (const view of ["classe", "individuelle", "departement", "matiere", "salle", "globale"]) assert.match(page, new RegExp(`"${view}"`));
  assert.match(page, /requireActiveEstablishment\(supabase, user\.id, params\.school, "\/pro\/emplois-du-temps"\)/);
  assert.match(page, /withEstablishmentQuery\(href, etablissementId\)/);
  assert.match(page, /\.from\("emplois_du_temps"\)/);
  assert.match(page, /\.eq\("annee_scolaire", ANNEE_SCOLAIRE_COURANTE\)/);
  assert.match(page, /BoutonGenerer anneeScolaire=\{ANNEE_SCOLAIRE_COURANTE\} establishmentId=\{etablissementId\}/);
  assert.match(page, /BoutonPublier anneeScolaire=\{ANNEE_SCOLAIRE_COURANTE\}/);
  assert.doesNotMatch(page, />Année scolaire \{ANNEE_SCOLAIRE_COURANTE\}</);
});

test("génération et publication gardent les API et payloads avec confirmation", async () => {
  const [generate, publish] = await Promise.all([source("src/components/timetable/BoutonGenerer.tsx"), source("src/components/timetable/BoutonPublier.tsx")]);
  assert.match(generate, /fetch\("\/api\/timetable\/generate"/);
  assert.match(generate, /JSON\.stringify\(\{ anneeScolaire, requestedEstablishmentId: establishmentId \}\)/);
  assert.match(publish, /fetch\("\/api\/timetable\/publish"/);
  assert.match(publish, /JSON\.stringify\(\{ anneeScolaire, requestedEstablishmentId: establishmentId \}\)/);
  for (const file of [generate, publish]) { assert.match(file, /SchoolAdminDialog/); assert.match(file, /if \(enCours\) return/); assert.doesNotMatch(file, /supabase|\.from\(/); }
  assert.match(publish, /if \(!hasBrouillon\) return null/);
});

test("la grille garde les conflits existants et une structure desktop mobile accessible", async () => {
  const grid = await source("src/components/timetable/GrilleEmploiDuTemps.tsx");
  assert.match(grid, /besoinsNonSatisfaits/);
  assert.match(grid, /heuresManquantes/);
  assert.match(grid, /SchoolAdminResponsiveTable/);
  assert.match(grid, /hidden md:block/);
  assert.match(grid, /md:hidden/);
  assert.match(grid, /<caption className="sr-only">/);
  assert.match(grid, /<th scope="row"/);
  assert.match(grid, /Créneau libre/);
  assert.doesNotMatch(grid, /onClick=.*affect|fetch\(|supabase/);
});

test("les paramètres conservent leur upsert et leurs contrôles existants", async () => {
  const [page, form] = await Promise.all([source("src/app/pro/parametres/emploi-du-temps/page.tsx"), source("src/components/pro/FormulaireContraintes.tsx")]);
  assert.match(page, /requireActiveEstablishment\(supabase, user\.id, school, "\/pro\/parametres\/emploi-du-temps"\)/);
  assert.match(page, /\.from\("contraintes_etablissement"\)/);
  assert.match(page, /\.from\("creneaux_horaires"\)/);
  assert.match(form, /\.from\("contraintes_etablissement"\)\.upsert/);
  assert.match(form, /\{ onConflict: "etablissement_id" \}/);
  assert.match(form, /jours_semaine: form\.jours_semaine/);
  assert.match(form, /max_heures_consecutives_matiere: form\.max_heures_consecutives_matiere/);
  assert.match(form, /aria-pressed=\{active\}/);
  assert.match(form, /aria-label="Activer ou désactiver la pause déjeuner"/);
});

test("les remplacements restent en lecture seule et n’inventent aucune relation", async () => {
  const page = await source("src/app/pro/remplacements/page.tsx");
  assert.match(page, /requireActiveEstablishment\(supabase, user\.id, school, "\/pro\/remplacements"\)/);
  assert.match(page, /select\("id, date_cours, statut, motif_absence, enseignants!remplacements_enseignant_absent_id_fkey\(nom, prenom\)"\)/);
  assert.match(page, /recherche automatique d’un enseignant disponible.*restent indisponibles/);
  assert.match(page, /SchoolAdminResponsiveTable/);
  assert.match(page, /hidden md:block/);
  assert.match(page, /md:hidden/);
  assert.doesNotMatch(page, /insert\(|update\(|delete\(|fetch\(/);
});
