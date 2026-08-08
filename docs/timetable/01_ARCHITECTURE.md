# 01 — Audit du moteur emplois du temps existant (Phase 1)

Lecture seule — aucune modification à cette étape. Sources : `supabase/migrations/0001_timetable_schema.sql`,
`src/lib/timetable/*`, `src/app/pro/emplois-du-temps/*`, `src/app/api/timetable/generate/route.ts`,
`src/components/timetable/*`.

---

## Tables existantes (migration 0001)

`matieres`, `matieres_volume_horaire`, `enseignant_matieres`, `enseignant_disponibilites`,
`contraintes_etablissement` (1 ligne/établissement), `creneaux_horaires`, `emplois_du_temps`. Toutes RLS-scopées
par `current_establishment_id()`. **Terminé et fonctionnel** — confirmé par l'audit de sécurité précédent
(`docs/04_SUPABASE_PROD_READINESS/03_ISOLATION_ETABLISSEMENTS.md`).

## APIs

`POST /api/timetable/generate` — seule route de génération. Charge contraintes + crée la grille de créneaux si
absente (`construireGrilleComplete`) + charge classes/matières/volumes/enseignants/dispos + appelle
`genererEmploiDuTemps` (algorithme pur, `src/lib/timetable/generate.ts`) + **persiste le résultat**.

## Composants

`GrilleEmploiDuTemps` (affichage grille, réutilisé par les 4 vues), `BoutonGenerer` (déclenche la génération).

## Génération actuelle

Algorithme pur (`src/lib/timetable/generate.ts`), reçoit un `GenerationInput` typé
(`src/lib/timetable/types.ts`) et retourne des `Affectation[]` + `besoinsNonSatisfaits`. **Non modifié par
cette mission** — le moteur d'affectation lui-même reste inchangé ; cette mission modifie uniquement ce qui
entoure la persistance (versioning, Phase 5) et l'étend (nouvelles vues, contraintes).

## Contraintes actuelles

`contraintes_etablissement` : amplitude horaire, pause déjeuner, récréations, jours travaillés
(`jours_semaine`), `max_heures_consecutives_matiere`, `max_heures_jour_enseignant`. `enseignant_disponibilites` :
disponibilités hebdomadaires récurrentes (absence de ligne = disponible partout).

**Absent** : indisponibilités ponctuelles (une date précise, pas une récurrence hebdomadaire), congés/vacances
d'établissement, contraintes de salle (aucun concept de salle n'existe), nombre **minimal** d'heures (seul un
maximum existe).

## Calculs actuels

`calculer_heures_enseignant` (RPC) — heures *pointées* uniquement (déduites de `pointages`), aucun lien avec les
heures *prévues* à l'emploi du temps. **Aucun calcul n'existe aujourd'hui reliant emploi du temps prévu et
présence réelle** — confirmé absent, construit par cette mission (Phase 7).

## Conflits

Deux contraintes d'unicité empêchent les doubles réservations au niveau base :
`unique (classe_id, creneau_id, annee_scolaire)` et `unique (enseignant_id, creneau_id, annee_scolaire)`
(migration 0001). **Terminé** pour la détection de conflit basique lors de l'insertion — aucune détection de
conflit en amont (avant génération) ni aucun message explicite dédié au conflit (une violation de contrainte
remonte comme une erreur SQL générique).

## Génération — comportement destructif identifié (bloquant pour Phase 5)

```ts
// src/app/api/timetable/generate/route.ts, tel qu'avant cette mission :
await supabase.from("emplois_du_temps").delete()
  .eq("etablissement_id", etablissementId)
  .eq("annee_scolaire", anneeScolaire)
  .eq("statut", "genere");
```

**Chaque génération supprime définitivement l'emploi du temps précédent** avant d'insérer le nouveau — aucun
historique, aucune version antérieure récupérable. Contraire à l'exigence explicite de cette mission ("aucune
modification ne doit supprimer les anciennes versions") — corrigé en Phase 5.

## Vues déjà existantes — plus avancé que ne le laissait supposer le contexte

`/pro/emplois-du-temps` propose déjà **4 vues** partageant le même moteur d'affichage (`GrilleEmploiDuTemps`) :
Par classe, Individuelle (par enseignant — équivaut à la "Vue Enseignant" demandée), Par département, Globale
(équivaut à la "Vue Établissement" demandée). **Manquantes** : Vue Salle (aucun concept de salle n'existe),
Vue Matière au sens strict (la vue "département" groupe par département disciplinaire, pas par matière
individuelle) — les deux sont construites par cette mission (Phase 3).

## Année scolaire — concept non structuré

`ANNEE_SCOLAIRE_COURANTE = "2026-2027"` est une **constante codée en dur** dans
`src/app/pro/emplois-du-temps/page.tsx`, pas une entité en base. `emplois_du_temps.annee_scolaire` est un champ
texte libre. Aucune notion de trimestre n'existe. Construit par cette mission (Phase 2), en **ajout** à côté du
champ texte existant — celui-ci n'est pas retiré, pour ne rien casser du comportement actuel.

---

## Synthèse

| Élément | État |
|---|---|
| Génération (algorithme) | Terminé, non modifié |
| Persistance de la génération | **Destructive** — corrigée par cette mission (Phase 5) |
| Vues Établissement / Enseignant / Classe | Terminées, déjà existantes |
| Vue Département (proche de Matière) | Terminée, existante — Vue Matière stricte ajoutée |
| Vue Salle | **Absente** — construite par cette mission |
| Année scolaire / Trimestre structurés | **Absents** — construits par cette mission |
| Indisponibilités ponctuelles, congés, contraintes salle | **Absents** — construits par cette mission |
| Calcul heures prévues/effectuées/retards/heures sup | **Absent** — construit par cette mission |
| Remplacements | **Absent** — architecture préparée par cette mission |
| IA | **Absente** — hors périmètre, architecture documentée uniquement |
