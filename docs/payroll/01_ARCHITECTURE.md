# 01 — Audit de l'existant (Phase 1)

Lecture seule — aucune modification à cette étape. S'appuie sur les missions précédentes (04 — RH, 05 —
Emplois du temps), non ré-auditées en détail ici, uniquement rappelées pour situer ce que cette mission ajoute.

---

## Présence / pointage

**Terminé.** `pointages` (migration `0002_presence.sql`) : arrivée/départ, photo, kiosque par `code_pointage`
(4 chiffres, propre à chaque enseignant/établissement). C'est déjà exactement le mode "Code personnel sécurisé"
demandé comme seule méthode V1 par cette mission (Phase 2) — **rien à construire pour la Phase 2**, seulement à
confirmer et documenter (voir `02_ATTENDANCE.md`).

## Calcul des heures

**Terminé pour prévu/effectué.** `vue_heures_realisees` (Mission 05, migration `0010_timetable_engine.sql`,
non exécutée) : heures prévues, effectuées, annulé, retard, heures supplémentaires — par rapprochement
`emplois_du_temps` × `pointages`. RPC `calculer_heures_enseignant` (existante, migrations `0002`/`0003`/`0005`) :
heures pointées sur une période, indépendamment de l'emploi du temps prévu.

**Absent** : absences déclarées (justifiées ou non), congés individuels, missions — aucun de ces concepts
n'existe. Le seuil de retard (10 minutes) est **codé en dur** dans la vue SQL de la mission 05, pas configurable
— corrigé par cette mission (Phase 11).

## Contrats

**Terminé pour la structure.** `staff_contracts` (Mission 04, migration `0009_pro_hr_foundation.sql`, non
exécutée) : `type` (temps_plein/temps_partiel/vacataire), `salaire`, `taux_horaire`, `volume_hebdomadaire`,
`date_debut`/`date_fin`, `statut`. Couvre déjà l'essentiel de la Phase 5 de cette mission.

**Absent** : primes et retenues ne sont pas des colonnes du contrat ni des tables séparées — construites par
cette mission, comme entités indépendantes (une prime/retenue peut être ponctuelle, pas seulement contractuelle).

## Rémunération / paie

**Totalement absent avant cette mission.** Aucune table `bulletins_paie`, aucun calcul de salaire brut/net,
aucune notion de déduction, aucun workflow de validation. `enseignants.taux_horaire` (colonne historique,
migration `0002`) sert uniquement à afficher une estimation dans `/enseignant/mon-espace` — jamais à produire un
bulletin de paie réel. C'est le cœur de cette mission (Phase 6).

## APIs existantes pertinentes

`POST /api/pointage/enregistrer` (pointage kiosque, inchangé), `POST /api/timetable/generate`/`publish`
(inchangés). Aucune API de paie n'existe.

## Permissions existantes pertinentes

`pointages_self_read`, `edt_self_read` (Mission 05), `staff_contracts_self_read` (Mission 04) — un enseignant
peut déjà lire ses propres présences, son propre emploi du temps, son propre contrat. **Aucune policy
`platform_admin` n'a été ajoutée sur aucune table du module Pro dans aucune migration précédente** — confirmé
par relecture des migrations 0001 à 0010 : `platform_admin` n'a jamais eu accès aux données RH/Pro d'un
établissement, uniquement à `establishments` elle-même (migration 0007, non exécutée). Point de départ
directement conforme à l'exigence de cette mission (Phase 10, "les administrateurs Écoles237 n'ont pas accès au
détail des salaires") — **rien à retirer, seulement à ne rien ajouter par erreur**.

---

## Synthèse

| Élément | État |
|---|---|
| Pointage par code | Terminé (satisfait déjà la V1 de cette mission) |
| Heures prévues/effectuées/retards/heures sup | Terminé (Mission 05) |
| Absences/congés/missions déclarés | **Absent** — construit par cette mission |
| Contrats (structure) | Terminé (Mission 04) |
| Primes/retenues | **Absent** — construit par cette mission |
| Moteur de calcul de paie | **Absent** — construit par cette mission |
| Workflow de validation paie | **Absent** — construit par cette mission |
| Espace enseignant — salaire | **Absent** — construit par cette mission |
| Configuration (devise, seuils, fréquence) | **Absent** (seuil de retard codé en dur) — construit par cette mission |
| Exports PDF/Excel/CSV | **Absent** — CSV construit, PDF/Excel documentés comme préparation uniquement |
| Accès `platform_admin` aux salaires | **Déjà absent par construction** — confirmé, à ne pas introduire |
