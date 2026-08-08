# 04 — Sécurité (Phase 9)

Vérification : un enseignant voit son emploi du temps → jamais celui d'un autre, sauf permission.

## Lacune corrigée

**Constat de l'audit (Phase 1)** : avant cette mission, `emplois_du_temps` n'avait **aucune** policy RLS
permettant à un enseignant de lire ses propres lignes — seule `edt_scope` (propriétaire de l'établissement)
existait (migration 0001). Un enseignant ne pouvait donc pas consulter directement son propre emploi du temps
par une requête `select` (la page `/pro/emplois-du-temps` elle-même n'est de toute façon accessible qu'au
propriétaire — mais cette lacune bloquait tout usage futur côté enseignant, dont l'espace personnel construit
par cette mission, Phase 8).

**Corrigé** : nouvelle policy `edt_self_read` (migration `0010_timetable_engine.sql`) —
`enseignant_id in (select id from enseignants where user_id = auth.uid())`. Un enseignant ne peut lire que les
lignes où `enseignant_id` correspond à sa propre fiche `enseignants`, jamais celles d'un collègue.

## "Sauf permission" — ce qui existe et ce qui reste à construire

La mission mentionne explicitement une exception ("jamais celui d'un autre, **sauf permission**"). Aucune
notion de permission déléguée (ex. un Censeur consultant les emplois du temps de plusieurs enseignants pour
organiser un remplacement) n'a été construite dans cette mission — seuls deux niveaux existent aujourd'hui :
propriétaire de l'établissement (accès complet) et l'enseignant lui-même (accès à ses propres données). Cohérent
avec `docs/pro/03_ROLES.md` (Mission 04) : les permissions par `staff_role` restent une matrice documentée, non
appliquée en RLS.

## Nouvelles tables — vérification table par table

| Table | Directeur | Enseignant lui-même |
|---|---|---|
| `annees_scolaires`, `trimestres` | Scope complet | Aucun accès (pas de besoin identifié — ce sont des paramètres d'établissement) |
| `salles`, `salle_indisponibilites` | Scope complet | Aucun accès direct |
| `conges_vacances` | Scope complet | Aucun accès direct (information publique au sein de l'établissement, mais aucune UI enseignant ne l'affiche dans cette mission) |
| `enseignant_indisponibilites` | Scope complet (peut consulter/gérer pour organiser) | Lecture ET écriture de ses propres indisponibilités (`ens_indispo_self`) — un enseignant peut déclarer sa propre indisponibilité |
| `remplacements` | Scope complet | Lecture seule des remplacements où il est concerné (absent OU remplaçant proposé) — jamais ceux d'un tiers sans lien avec lui |
| `emplois_du_temps` (nouvelle policy) | Scope complet (inchangé) | Lecture seule de ses propres lignes (`edt_self_read`, nouveau) |
| `vue_heures_realisees` (vue) | Hérite des policies de `emplois_du_temps`/`pointages`/`creneaux_horaires` sous-jacentes — pas de policy propre nécessaire (une vue simple applique les droits de l'utilisateur courant sur les tables qu'elle interroge) | Idem — un enseignant ne voit que ses propres lignes calculées, par transitivité de `edt_self_read` et `pointages_self_read` (existant) |

## Vérification négative

Recherche exhaustive dans `0010_timetable_engine.sql` de toute policy `using (true)` ou toute policy accordant
un accès non filtré par `auth.uid()`/`current_establishment_id()` : **aucune trouvée**.

## Résumé

| Vérification (Phase 9) | Statut |
|---|---|
| Enseignant voit son propre emploi du temps | Confirmé (lacune corrigée par cette mission) |
| Enseignant ne voit pas celui d'un collègue | Confirmé |
| Permissions déléguées ("sauf permission") | Non construites — deux niveaux seulement (directeur / soi-même), documenté comme limite assumée |
