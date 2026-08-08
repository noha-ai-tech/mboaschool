# 03 — Isolation entre établissements (École A / École B)

Méthode : analyse exhaustive de toutes les policies RLS s'appuyant sur `establishment_id`/`etablissement_id` et
sur `current_establishment_id()`, croisée avec le code applicatif qui lit/écrit ces tables. Classement SÛR /
À CORRIGER / NON VÉRIFIABLE pour chaque scénario demandé par la mission.

---

## Scénarios testés

| # | Scénario | Classement | Preuve |
|---|---|---|---|
| 1 | École A lit les données privées de B (`applications`) | **SÛR** | `applications` RLS : `"Owners can read establishment applications"` (`schema.sql`) — `exists (select 1 from establishments e where e.id = establishment_id and e.owner_id = auth.uid())`. École A ne peut lire que les candidatures dont `establishment_id` correspond à une école qu'elle possède. Vérifié qu'aucune autre policy `SELECT` plus permissive n'existe sur `applications`. |
| 2 | École A modifie B (`establishments`) | **SÛR** (au sens isolation A/B — distinct du problème admin) | `"Owners can update own establishments"` : `auth.uid() = owner_id`. École A ne peut mettre à jour que la ligne où elle est `owner_id`. Aucune policy ne permet à un propriétaire de modifier une autre ligne. |
| 3 | École A voit les enseignants de B (`enseignants`) | **SÛR** | `enseignants_scope` (`0001_timetable_schema.sql`) : `etablissement_id = current_establishment_id()`, où `current_establishment_id()` résout strictement `establishments.owner_id = auth.uid()`. École A (connectée en tant que propriétaire A) ne peut jamais faire correspondre `etablissement_id` de B. |
| 4 | École A voit les présences de B (`pointages`) | **SÛR** | `pointages_scope` (`0002_presence.sql`) : même mécanisme, `etablissement_id = current_establishment_id()`. Confirmé également côté Storage (bucket `pointages-photos`, policy `pointages_owner_access` scope le dossier par `current_establishment_id()`). |
| 5 | École A accède aux horaires internes de B (`emplois_du_temps`, `creneaux_horaires`, `contraintes_etablissement`) | **SÛR** | Les trois tables ont des policies dédiées (`edt_scope`, `creneaux_scope`, `contraintes_scope`) suivant exactement le même schéma `etablissement_id = current_establishment_id()`. |
| 6 | École A accède aux informations salariales de B (`enseignants.taux_horaire`) | **SÛR** | `taux_horaire` est une colonne de la table `enseignants`, protégée par la même `enseignants_scope` — aucune policy distincte ni plus permissive pour ce champ précis (RLS s'applique à la ligne entière, pas colonne par colonne, donc pas de fuite partielle possible). |

## Fonction centrale `current_establishment_id()`

Toutes les policies ci-dessus reposent sur cette unique fonction (`security definer`, `stable`) :

```sql
select id from establishments where owner_id = auth.uid();
```

**Point de vigilance structurel, pas une faille active** : cette fonction suppose qu'un `auth.uid()` donné ne
possède **jamais plus d'une ligne** `establishments` avec `owner_id` égal à lui-même. Rien dans le schéma ne
contraint ceci explicitement (`owner_id` n'est pas `unique` dans `establishments`). Si un compte se retrouvait
un jour propriétaire de deux établissements (cas non prévu par le produit actuel, mais non empêché par une
contrainte de base), `current_establishment_id()` (qui fait un `select ... where ...` sans `limit 1` dans un
contexte `returns uuid` scalaire) lèverait une erreur Postgres ("more than one row returned by a subquery used
as an expression") plutôt qu'une fuite de données — **échec sûr, pas une faille d'isolation**, mais un bug
opérationnel potentiel à surveiller si le produit évolue un jour vers du multi-établissement pour les
propriétaires (actuellement hors périmètre produit).

## Confirmation négative — recherche de contre-exemples

Recherche exhaustive de toute policy RLS `for all`/`for select`/`for update`/`for insert`/`for delete` sur les
tables scopées par établissement qui **n'utiliserait pas** `current_establishment_id()` ou l'équivalent
`exists (... e.owner_id = auth.uid())` : **aucune trouvée**. Toutes les policies identifiées suivent le même
schéma de scoping. Aucune policy `using (true)` inattendue (accès non filtré) n'a été trouvée sur une table
contenant des données privées d'établissement.

## Synthèse

**SÛR** pour les six scénarios explicitement demandés par la mission. Aucune correction nécessaire pour
l'isolation A/B au niveau RLS. Le seul point non couvert par cette section est la mutation `platform_admin`
(traité séparément en `02_RLS_ADMIN_AUDIT.md`), qui concerne l'accès *admin plateforme* à *toutes* les écoles
— un cas légitime et distinct de l'isolation entre deux écoles clientes.
