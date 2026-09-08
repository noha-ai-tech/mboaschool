# PRO-02 — RLS truth table

Statut : conception uniquement, non exécutée.

## Règle effective proposée

Une attribution n'est effective que si l'appartenance et l'attribution sont actives, non révoquées, dans leur période de validité et dans le même établissement. La possession d'une organisation PRO-01 ne participe jamais au calcul.

| Cas | Résultat | Motif |
|---|---|---|
| Owner A / School A / responsabilité établissement | ALLOW | `establishments.owner_id = auth.uid()` et FK cohérentes |
| Owner A / School B | DENY | aucune propriété ni appartenance dans School B |
| Staff A / responsabilité School A | ALLOW selon responsabilité | appartenance active dans A + attribution effective dans A |
| Staff A / responsabilité School B | DENY | FK et filtres établissement interdisent le croisement |
| Responsable Section 1 / action Section 1 | ALLOW | `scope_type=section` et `section_id=Section 1` |
| Responsable Section 1 / action Section 2 | DENY | identifiant de scope différent |
| Responsable Maths / département Maths | ALLOW | `scope_type=department` et `department_id=Maths` |
| Responsable Maths / département Français | DENY | identifiant de scope différent |
| Enseignant sans responsabilité administrative | accès pédagogique propre uniquement | policies self existantes ; aucune responsabilité administrative effective |
| Platform admin | ALLOW selon règles plateforme | branche admin explicite, jamais via appartenance d'organisation |
| Membre inactif | DENY | `staff_members.status <> actif` |
| Responsabilité inactive | DENY | `is_active = false` |
| Responsabilité expirée | DENY | `ends_at < current_date` |
| Responsabilité future | DENY | `starts_at > current_date` |
| Responsabilité révoquée | DENY | `revoked_at IS NOT NULL` |
| Utilisateur sans staff_member | DENY | aucune appartenance scolaire |
| Staff School A + scope Section School B à l'insertion | DENY/contrainte FK | FK composite section-école |
| Staff School A + scope Department School B à l'insertion | DENY/contrainte FK | FK composite département-école |
| Staff School B + responsabilité School A à l'insertion | DENY/contrainte FK | FK composite membre-école |

## Matrice CRUD des nouvelles tables

| Acteur | Catalogue | Departments | Responsibilities |
|---|---|---|---|
| anon | aucun | aucun | aucun |
| authenticated sans staff | lecture catalogue | aucun | aucun |
| membre actif | lecture catalogue | lecture de son école | lecture de ses attributions |
| propriétaire école | lecture catalogue | CRUD de ses départements | SELECT/INSERT/UPDATE dans son école, pas DELETE |
| platform_admin | lecture catalogue | CRUD | SELECT/INSERT/UPDATE, pas DELETE direct |

La révocation se fait par UPDATE, jamais par DELETE. Les policies UPDATE comportent `USING` et `WITH CHECK`. Les FK et CHECK restent la dernière barrière d'intégrité, indépendamment de l'application.

## Tests SQL à préparer

Tous les tests devront s'exécuter dans une transaction terminée par `ROLLBACK` sur une base locale ou une branche de test, jamais directement en production.

1. une personne reçoit `teacher` + `censor` dans la même école ;
2. une personne reçoit des responsabilités différentes dans deux écoles via deux `staff_members` ;
3. scope établissement sans section/département ;
4. scope section avec section de la même école ;
5. rejet d'une section d'une autre école ;
6. scope département avec département de la même école ;
7. rejet d'un département d'une autre école ;
8. rejet d'une deuxième attribution strictement identique ;
9. membre inactif ignoré ;
10. responsabilité inactive, future, expirée ou révoquée ignorée ;
11. utilisateur sans appartenance refusé ;
12. utilisateur non propriétaire incapable d'attribuer ou révoquer ;
13. propriétaire incapable de gérer School B ;
14. platform admin conforme aux règles plateforme ;
15. enseignant conserve matières, disponibilités, pointage et EDT via `enseignants` ;
16. dashboard école continue de fonctionner avec `staff_members.role` ;
17. PRO-01 : aucune organisation ne donne accès aux autres écoles ;
18. audit log créé pour attribution, modification et suppression administrative ;
19. `current_establishment_id()` non utilisé par les nouvelles policies ;
20. tests de plan/index sur les recherches par école, membre, code et scope.

## Verdict

La truth table est cohérente avec le modèle proposé : **PASS conceptuel**. Elle ne deviendra un PASS d'exécution qu'après validation architecturale, exécution sur une branche de test et tests RLS avec plusieurs JWT.
