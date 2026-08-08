# 03 — Contraintes (Phase 4)

| Contrainte demandée | Statut avant cette mission | Statut après |
|---|---|---|
| Disponibilités (récurrentes) | Terminé (`enseignant_disponibilites`, migration 0001) | Inchangé |
| Indisponibilités (ponctuelles) | **Absent** | Nouvelle table `enseignant_indisponibilites` (date_debut/date_fin/motif) |
| Nombre maximal d'heures | Terminé (`contraintes_etablissement.max_heures_jour_enseignant`) | Inchangé — maximum **par jour**, pas par semaine |
| Nombre minimal | **Absent** | Nouvelle colonne `contraintes_etablissement.min_heures_semaine_enseignant` |
| Pause déjeuner | Terminé (`contraintes_etablissement.pause_dejeuner_debut/fin`) | Inchangé |
| Jours travaillés | Terminé (`contraintes_etablissement.jours_semaine`) | Inchangé |
| Congés | **Absent** | Nouvelle table `conges_vacances` (type `jour_ferie`/`autre`) |
| Vacances | **Absent** | Même table, `type = 'vacances'` |
| Contraintes salles | **Absent** (aucun concept de salle) | Nouvelle table `salles` + `salle_indisponibilites` |

## Ce qui reste non appliqué par l'algorithme de génération

**Point important à ne pas perdre de vue** : ces nouvelles contraintes sont **stockées**, mais
`src/lib/timetable/generate.ts` (l'algorithme d'affectation) **n'a pas été modifié** par cette mission — il ne
lit et n'applique aujourd'hui que les contraintes déjà existantes avant cette mission (`GenerationInput`,
`src/lib/timetable/types.ts`, inchangé). Concrètement :

- Une indisponibilité ponctuelle enregistrée dans `enseignant_indisponibilites` **n'empêche pas encore**
  l'algorithme de proposer un créneau à cet enseignant sur cette période.
- Un congé/une vacance enregistré dans `conges_vacances` **n'exclut pas encore** ces dates de la génération.
- Une indisponibilité de salle **n'empêche pas encore** l'attribution de cette salle.
- Le minimum d'heures hebdomadaires **n'est pas encore vérifié** en sortie de génération.

**Pourquoi ce choix** : modifier l'algorithme de génération est un changement plus risqué et plus vaste que
préparer son entrée (Phase 1 de cette mission a confirmé que l'algorithme actuel est fonctionnel et non cassé —
le modifier sans une conception dédiée du nouvel algorithme contraint aurait risqué d'introduire des
régressions dans un composant qui fonctionne). Le schéma est prêt ; brancher ces contraintes dans
`GenerationInput` et `genererEmploiDuTemps` est le travail d'une prochaine mission ciblée sur le moteur
d'affectation lui-même, avec ses propres tests.

## Utilisation actuelle possible

Même sans intégration dans l'algorithme, ces tables sont d'ores et déjà consultables manuellement (ex. avant de
lancer une génération, un directeur peut consulter `enseignant_indisponibilites` pour ajuster les disponibilités
récurrentes en conséquence) — utilité immédiate en lecture, automatisation complète à construire ensuite.
