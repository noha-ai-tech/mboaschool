# PRO-02 — Audit responsabilités et périmètres

Date de l'audit : 2026-08-19  
Branche : `feat/pro-school-organization`  
Commit de départ : `e93bc28cb6285ba62589cd45c8bdaab0f9acc9fa`  
Production auditée en lecture seule : projet Supabase `Ecoles237` (`umcwwynrftidytxgqkwi`), PostgreSQL 17  
Écritures base pendant l'audit : **0**

## 1. Contrôles initiaux

- PRO-01 local : présent dans `supabase/migrations/20260819150540_pro_01_organizations_foundation.sql`.
- PRO-01 production : présent sous les versions `20260819184429_pro_01_organizations_foundation` et `20260819184517_pro_01_harden_organization_privileges`.
- Production : 2 180 établissements, 0 organisation.
- Les changements locaux PRO-01 préexistants n'ont pas été écrasés.

## 2. Séparation actuelle des concepts

### Identité

`auth.users` porte l'identité authentifiée. `profiles.id` est à la fois sa clé primaire et une FK vers `auth.users(id) ON DELETE CASCADE`.

`profiles.role` est un enum global mono-valeur `user_role` :

- `parent`
- `establishment_admin`
- `platform_admin`
- `teacher`

Il est utilisé par le middleware, le callback Auth, la page de connexion, `/dashboard` et les contrôles d'administration plateforme. Il ne doit pas devenir une liste de fonctions scolaires.

Point de sécurité existant : `handle_new_user()` lit `raw_user_meta_data.role` pour attribuer `teacher`. Cette métadonnée est modifiable par l'utilisateur et ne doit pas devenir une source d'autorité générale. PRO-02 ne doit pas étendre ce mécanisme. Une future invitation doit créer l'appartenance et les responsabilités par une route serveur autorisée, puis conserver `profiles.role` uniquement pour la compatibilité de navigation.

### Appartenance

`staff_members` est déjà la meilleure base pour représenter l'appartenance d'une personne à un établissement :

- PK : `id uuid` ;
- établissement : `etablissement_id → establishments(id) ON DELETE CASCADE` ;
- compte éventuel : `user_id → auth.users(id) ON DELETE SET NULL` ;
- fiche pédagogique éventuelle : `enseignant_id → enseignants(id) ON DELETE SET NULL` ;
- statut : `staff_status` (`actif`, `inactif`) ;
- rôle unique historique : `staff_role`.

Il n'existe toutefois aucune unicité sur `(user_id, etablissement_id)` ni sur `enseignant_id`. La base autorise donc plusieurs appartenances pour le même compte et le même établissement, ou plusieurs fiches RH pour une même fiche enseignant. Les données actuelles ne contiennent aucun de ces doublons.

### Responsabilité

`staff_members.role` est un enum mono-valeur :

`admin_principal`, `directeur`, `proviseur`, `principal`, `censeur`, `secretaire`, `comptable`, `enseignant`, `assistant`.

Il est affiché dans les écrans Personnel et sa valeur est exigée lors de la création. Il n'est utilisé par aucune policy d'autorisation. Les commentaires des routes de paie confirment que les permissions par fonction ne sont pas encore appliquées.

Conclusion : `staff_members.role` doit rester temporairement la responsabilité principale compatible et devenir progressivement un champ d'affichage sans autorité. Il ne doit pas être supprimé dans PRO-02 V1.

### Périmètre

- Établissement : présent sur `staff_members.etablissement_id`.
- Section : `sections(id, etablissement_id)` existe ; `sections.responsable_staff_member_id` ne garantit pas que le responsable appartient au même établissement.
- Département disciplinaire : aucune table canonique. `matieres.departement_disciplinaire` est un texte obligatoire.
- Il n'existe aucune table générique de responsabilités ni de scopes.

## 3. Schéma et relations constatés

### Enseignants

`enseignants` contient les données pédagogiques : établissement, identité affichée, email, code de pointage, taux horaire, type de contrat, compte et date d'invitation. `user_id` référence `auth.users(id) ON DELETE SET NULL`.

`enseignant_matieres` possède une PK composite `(enseignant_id, matiere_id)` avec deux FK en cascade. Aucune contrainte ne garantit actuellement que l'enseignant et la matière appartiennent au même établissement. Les données production ne contiennent aucun croisement inter-école.

La fiche `enseignants` doit rester nécessaire pour les matières, disponibilités, pointages, taux horaire et emplois du temps. Une responsabilité `enseignant` ne la remplace pas.

Relation cible :

`profiles/auth.users → staff_members (appartenance RH) → enseignants (facultatif, données pédagogiques)`

Les responsabilités sont rattachées à `staff_members`, parallèlement à la fiche `enseignants`.

### Sections et classes

- `sections.etablissement_id → establishments ON DELETE CASCADE`.
- `sections.responsable_staff_member_id → staff_members ON DELETE SET NULL`.
- `classes.section_id → sections ON DELETE SET NULL`.
- `classes.establishment_id → establishments ON DELETE CASCADE`.

Les FK simples n'empêchent pas une section de School A de référencer un membre de School B, ni une classe de School A de référencer une section de School B. Aucun cas fautif n'existe actuellement en production.

### Matières et départements

`matieres.departement_disciplinaire` est du texte non nullable. Les pages Matières, Messagerie, Emplois du temps, le formulaire enseignant et les types du générateur utilisent directement ce texte.

Production au moment de l'audit : **0 matière**, donc 0 valeur distincte, 0 variante et 0 collision de normalisation. Ce constat rend possible l'ajout sans backfill d'une table canonique `departments` et d'un `matieres.department_id` nullable. Le texte existant doit rester intact pour compatibilité.

## 4. Volumes production

| Mesure | Valeur |
|---|---:|
| profiles | 6 |
| staff_members | 3 |
| enseignants | 5 |
| staff_members liés à enseignants | 3 |
| enseignants sans staff_member | 2 |
| staff_members sans user_id | 3 |
| enseignants sans user_id | 5 |
| personnes staff multi-établissement | 0 |
| personnes enseignant multi-établissement | 0 |
| groupes de doublons email staff | 0 |
| groupes de doublons email enseignants | 0 |
| sections | 0 |
| sections avec responsable | 0 |
| classes | 2 |
| matières | 0 |
| enseignant_matieres | 0 |

Les 3 lignes `staff_members` ont toutes `role = 'enseignant'`.

## 5. RLS et établissement actif

`current_establishment_id()` est une fonction `SECURITY DEFINER`, stable, exécutable par `authenticated`, avec `search_path = pg_catalog, public` :

```sql
select id from establishments where owner_id = auth.uid();
```

Elle n'utilise ni le cookie d'établissement actif ni un identifiant passé explicitement. Trente-cinq policies production en dépendent, notamment sur enseignants, matières, sections, staff, horaires, paie, présence, messagerie et imports.

Aujourd'hui, les 5 propriétaires ayant une école n'en possèdent qu'une. Dès qu'un propriétaire en possède deux, cette fonction scalaire peut lever « more than one row returned » et bloquer les policies. Le helper applicatif `getActiveEstablishment()` gère déjà correctement le cookie et vérifie la propriété, mais la RLS ne connaît pas ce cookie.

PRO-02 ne doit donc pas construire ses nouvelles policies sur `current_establishment_id()`. Les nouvelles policies doivent vérifier explicitement `establishment_id` et l'appartenance/responsabilité. La réparation globale des 35 policies existantes est un chantier de compatibilité séparé à planifier avant l'ouverture réelle du multi-école.

Autres constats RLS :

- `staff_members_scope`, `sections_scope`, `enseignants_scope` et `matieres_scope` sont des policies `FOR ALL` sans `WITH CHECK` explicite ; PostgreSQL réutilise leur `USING`, mais la politique est moins lisible qu'une séparation par opération.
- `staff_members_self_read` et `enseignants_self_read` fournissent une lecture de sa propre fiche.
- `platform_admin` n'a pas de policy générale sur les tables RH/pédagogiques auditées.
- Les grants historiques sont très larges (`anon` et `authenticated` possèdent souvent toutes les opérations), la RLS étant la barrière effective.

## 6. Hypothèses mono-rôle ou mono-école dans l'application

- `profiles.role` pilote une destination unique dans `middleware.ts`, `auth/callback`, `auth/connexion` et `/dashboard`.
- Le callback traite spécialement `teacher`, mais la connexion classique envoie tout non-platform-admin vers `/dashboard/ecole`.
- L'invitation enseignant impose `role = teacher` dans les métadonnées.
- L'invitation d'un personnel non enseignant laisse le rôle global à `parent`.
- Les écrans Personnel n'affichent qu'un seul `staff_members.role`.
- Le formulaire Personnel n'accepte qu'un seul rôle.
- Les routes `api/personnel/*` et `api/enseignants/*` résolvent encore l'école avec `.eq(owner_id, user.id).single()` et échoueront pour un propriétaire de plusieurs écoles.
- Le middleware Pro utilise `.maybeSingle()` sur toutes les écoles du propriétaire pour tester le forfait ; même risque multi-école.
- Les pages Pro principales utilisent déjà `getActiveEstablishment()` et sont compatibles avec le sélecteur actif.

## 7. Doublons fonctionnels

Deux chemins créent un enseignant :

1. `/api/enseignants/creer` crée uniquement `enseignants` ;
2. `/api/personnel/creer` crée `enseignants`, puis `staff_members` si la catégorie vaut `teacher`.

Le second chemin n'est pas transactionnel : si l'insertion `staff_members` échoue, une fiche enseignant orpheline reste créée. La production contient déjà 2 enseignants sans `staff_member`, sans que l'audit puisse attribuer leur origine avec certitude.

L'accueil enseignant lie toutes les lignes `enseignants` partageant exactement l'email, puis synchronise les `staff_members` liés. Cela prend en charge plusieurs établissements mais dépend de l'email comme mécanisme de rapprochement initial.

## 8. Conclusion d'audit

Les constats annoncés sont confirmés. Le besoin multi-responsabilités ne doit pas être résolu par un tableau dans `profiles.role`, une extension continue de `staff_role`, ni une duplication de personnes. Il exige une table d'attribution liée à l'appartenance `staff_members`, avec établissement redondant mais contraint par FK composite, scopes explicites, cycle de vie et audit.
