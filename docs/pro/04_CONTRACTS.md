# 04 — Contrats (Phase 8) et fondations de la future paie

## Table `staff_contracts`

| Colonne | Rôle |
|---|---|
| `type` | `temps_plein` / `temps_partiel` / `vacataire` (même enum que `staff_members.employment_type`) |
| `salaire` | Salaire mensuel fixe, si applicable (temps plein/partiel) |
| `taux_horaire` | Taux horaire, si applicable (vacataire notamment — cohérent avec `enseignants.taux_horaire` déjà existant pour le calcul des heures) |
| `volume_hebdomadaire` | Heures/semaine prévues au contrat |
| `date_debut` / `date_fin` | `date_fin` nullable = contrat toujours en cours |
| `statut` | `actif` / `termine` |

Un membre du personnel peut avoir plusieurs lignes `staff_contracts` dans le temps (historique des contrats
successifs) — la fiche (`/pro/personnel/[id]`) affiche uniquement le contrat `statut = 'actif'` le plus récent,
avec un bouton pour en enregistrer un nouveau.

## Ce que cette mission NE construit PAS (explicitement exclu)

- **Aucun calcul de paie.** `staff_contracts` stocke les paramètres (salaire, taux horaire, volume) qu'un futur
  moteur de paie utiliserait, mais aucune fonction de calcul, aucune fiche de paie, aucun export n'existe.
- **Aucun lien automatique avec les heures pointées.** `enseignants.taux_horaire` (existant) et
  `staff_contracts.taux_horaire` (nouveau) sont **deux champs distincts, non synchronisés** — pour un enseignant,
  les deux peuvent diverger si l'un est modifié sans l'autre. Ce doublon est assumé pour cette mission (la
  fiche RH devait exister indépendamment de la logique de pointage déjà en place) ; leur réconciliation est un
  travail de conception à mener avant de construire le moteur de paie réel (Phase 11).

## Relation avec le pointage existant

`enseignants.taux_horaire`/`type_contrat` (texte libre, existant depuis la migration `0002`) restent inchangés
et continuent de servir à `calculer_heures_enseignant`. `staff_contracts` ne remplace pas ce mécanisme — c'est
une couche RH plus riche et structurée (contrainte par enum, historisée, avec dates), pensée pour l'ensemble du
personnel, pas seulement les enseignants pointés au kiosque.
