# PRO-03 — Audit du contexte établissement courant

Statut : audit et conception uniquement. Aucune migration PRO-03 validée ou exécutée.

## Instantané contrôlé le 19 août 2026

- Branche : `feat/pro-school-organization`
- HEAD : `e93bc28cb6285ba62589cd45c8bdaab0f9acc9fa`
- PRO-01 présente en production : oui (`20260819184429`, `20260819184517`)
- PRO-02 présente en production : oui (`20260819192235`, `20260819192340`, `20260819192427`)
- Établissements : 2 180
- Responsabilités de référence : 12
- Responsabilités attribuées : 0
- Départements : 0
- Matières avec `department_id` : 0
- Policies dépendant directement de `current_establishment_id()` : **38**, et non environ 35
- Autres fonctions dépendantes : **1**, `calculer_heures_enseignant(...)`
- Écritures base pendant l’audit : **0**

Le worktree contenait déjà des modifications avant PRO-03. Elles ont été conservées et ne font pas partie des migrations proposées ici.

`git status --short` initial :

```text
 M src/app/pro/layout.tsx
?? docs/pro/PRO-02_AUDIT.md
?? docs/pro/PRO-02_PROPOSED_MIGRATION.sql
?? docs/pro/PRO-02_RECOMMENDATION.md
?? docs/pro/PRO-02_RLS_TRUTH_TABLE.md
?? docs/pro/PRO-02_SCHEMA_OPTIONS.md
?? src/app/pro/organisation/
?? supabase/migrations/20260819150540_pro_01_organizations_foundation.sql
```

## Définition exacte en production

```sql
CREATE OR REPLACE FUNCTION public.current_establishment_id()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
  select id from establishments where owner_id = auth.uid();
$function$;
```

Propriétés constatées :

- `SECURITY DEFINER` ;
- volatilité `STABLE` ;
- `search_path = pg_catalog, public` ;
- `EXECUTE` accordé à `postgres`, `authenticated` et `service_role` ;
- `PUBLIC` et `anon` n’ont pas `EXECUTE` après le durcissement de production `20260819133012_harden_privileged_functions_and_hours_view`.

### Historique

1. `supabase/migrations/0001_timetable_schema.sql` crée la fonction avec le même `SELECT`, en `STABLE SECURITY DEFINER`, sans `search_path` fixé dans cette version locale.
2. La migration de production `20260819133012_harden_privileged_functions_and_hours_view` révoque `PUBLIC`/`anon`, accorde `authenticated`, et fixe `search_path = pg_catalog, public` sans modifier la logique.
3. Aucune version ne rend le choix d’établissement explicite. Toutes supposent au plus une ligne par propriétaire.

### Risques

- Un propriétaire de deux écoles provoque `more than one row returned by a subquery used as an expression` dans tout consommateur scalaire.
- Ajouter `LIMIT 1` masquerait l’erreur mais créerait une sélection arbitraire et une confusion de tenant ; ce n’est pas une correction acceptable.
- La fonction ne représente ni le staff actif, ni une responsabilité valide, ni un contexte de platform admin.
- `SECURITY DEFINER` n’est pas nécessaire à la cible : les policies doivent vérifier l’école portée par la ligne, et les agrégats doivent fonctionner en `SECURITY INVOKER` sous RLS.
- Tout nouveau code doit être interdit de dépendre de cette fonction. Elle reste temporairement seulement jusqu’à zéro consommateur.

## Fonction métier dépendante

`public.calculer_heures_enseignant(uuid,date,date,uuid default null)` est `STABLE SECURITY DEFINER`, exécutable par `authenticated` et `service_role`, avec un `search_path` fixé. Sa branche propriétaire sans `p_etablissement_id` appelle `current_establishment_id()`.

Appels applicatifs :

- `src/app/enseignant/mon-espace/page.tsx` : les deux appels transmettent déjà `p_etablissement_id` ;
- `src/app/pro/pointage/historique/page.tsx` : paramètre établissement absent ;
- `src/app/api/payroll/calculer/route.ts` : paramètre établissement absent.

Cible de la vague C : rendre `p_etablissement_id` obligatoire, supprimer toutes les branches implicites, passer la fonction en `SECURITY INVOKER`, garder `search_path` fixé et laisser les policies RLS autoriser ou refuser les lignes de pointage.

## Sources légitimes d’accès

| Source | Condition minimale | Portée PRO-03 |
|---|---|---|
| Owner | `establishments.owner_id = auth.uid()` | Accès owner existant à préserver |
| Staff | `staff_members.user_id = auth.uid()` et `status = 'actif'` | Rend l’école sélectionnable ; droits métier distincts |
| Responsibility | staff actif, assignment actif, non révoqué, période courante, même école, code et scope compatibles | À concevoir/tester ; aucune activation dans les vagues owner |
| Platform admin | `profiles.role = 'platform_admin'` | Seulement par policy ou route admin explicite ; aucun accès métier implicite ajouté |
| Organization | aucune | La propriété d’une organisation ne donne aucun accès transitif aux écoles |

Une appartenance permet de présenter une école dans le sélecteur. Elle ne suffit pas à autoriser toutes les opérations métier.

## Contexte applicatif actuel

### Helper serveur

`src/lib/supabase/activeEstablishment.ts` charge uniquement les écoles dont `owner_id = userId`, lit le cookie `ecoles237_active_school`, valide que sa valeur appartient à cette liste, puis choisit la première école si le cookie est absent ou invalide.

- Bon point : le cookie n’est pas accepté sans vérification owner.
- Défauts : owner seulement ; première école arbitraire ; aucune représentation staff/responsibility/admin ; cookie partagé entre onglets ; l’école n’est pas portée explicitement par la requête.

### Contexte navigateur

`src/lib/school/SchoolContext.tsx` duplique la résolution owner et écrit le même cookie depuis JavaScript (`SameSite=Lax`, durée un an, non `HttpOnly`). Le commentaire indique correctement que ce cookie est une préférence, pas une autorisation. La validation reste cependant owner-only et le fallback choisit la première ligne.

`src/lib/useSchool.ts` expose une seule école active issue de ce provider.

### Sélecteur et layout Pro

`src/app/pro/layout.tsx` recharge les écoles owner, valide le cookie et choisit la première école. `src/components/pro/ProSchoolSwitcher.tsx` remplace directement le cookie puis appelle `router.refresh()`.

Deux onglets ne peuvent donc pas conserver des écoles différentes : le dernier changement de cookie modifie le contexte des deux onglets au prochain chargement.

### Middleware

`src/middleware.ts` utilise `.eq("owner_id", user.id).maybeSingle()` pour autoriser `/pro` selon `forfait`. Avec plusieurs écoles, la requête peut échouer ; elle ne sait pas quelle école est demandée et ne couvre pas staff/responsibility. Un propriétaire ayant une école Pro et une école non-Pro est ambigu.

Le rôle général peut continuer à déterminer la destination (`platform_admin`, teacher, dashboard), mais jamais l’école précise.

### Clients Supabase

- `src/lib/supabase.ts` utilise `createBrowserClient` avec la clé publique et la session utilisateur : toutes les autorisations métier doivent rester sous RLS.
- `src/lib/supabase/server.ts` utilise `createServerClient` et les cookies de session : il conserve l’identité utilisateur et RLS ; il ne transforme pas le cookie d’école en autorisation.
- `src/lib/supabase/admin.ts` utilise `SUPABASE_SERVICE_ROLE_KEY`, sans persistance de session : il contourne RLS. Son usage doit rester serveur uniquement et intervenir après un contrôle métier précis.

Ces trois clients ont été relus. Aucun changement de primitive n’est requis ; les contrôles doivent être centralisés autour de leurs usages.

## Routes serveur mono-école

Ces 12 routes font actuellement `.eq("owner_id", user.id).single()` ou équivalent avant l’opération :

1. `src/app/api/enseignants/creer/route.ts`
2. `src/app/api/enseignants/[id]/inviter/route.ts`
3. `src/app/api/messagerie/envoyer/route.ts`
4. `src/app/api/payroll/calculer/route.ts`
5. `src/app/api/payroll/[id]/valider-direction/route.ts`
6. `src/app/api/payroll/[id]/valider-rh/route.ts`
7. `src/app/api/personnel/creer/route.ts`
8. `src/app/api/personnel/[id]/code-acces/route.ts`
9. `src/app/api/personnel/[id]/inviter/route.ts`
10. `src/app/api/pointage/enregistrer/route.ts`
11. `src/app/api/timetable/generate/route.ts`
12. `src/app/api/timetable/publish/route.ts`

Chaque route doit recevoir un `requestedEstablishmentId` explicite, vérifier l’accès et la capacité demandée, puis vérifier que chaque ressource enfant appartient à cette même école. Les routes d’invitation doivent conserver ce contrôle avant tout appel `service_role`.

## Risque d’invitation directement lié

`src/app/auth/enseignant-bienvenue/page.tsx` utilise actuellement l’adresse e-mail du compte comme preuve, puis un client `service_role` pour rattacher **toutes** les lignes `enseignants` non liées portant cet e-mail, et les lignes `staff_members` correspondantes. La branche de rechargement emploie aussi `.maybeSingle()` sur les lignes d’un enseignant potentiellement multi-école.

Ce flux est incompatible avec la règle « e-mail non utilisé comme preuve d’appartenance ». La cible doit consommer une invitation non rejouable, liée à une ressource et une école précises, puis vérifier le compte et l’état de l’invitation avant l’écriture admin. `src/app/auth/callback/route.ts` doit préserver ce contexte d’invitation. Aucun correctif n’est implémenté dans cet audit.

## Pages serveur utilisant le helper implicite

Les 16 pages suivantes doivent lire une école explicite depuis l’URL ou un contexte de requête validé, et conserver un filtre `etablissement_id` sur chaque requête :

- `src/app/pro/absences/page.tsx`
- `src/app/pro/emplois-du-temps/page.tsx`
- `src/app/pro/enseignants/nouveau/page.tsx`
- `src/app/pro/enseignants/page.tsx`
- `src/app/pro/matieres/page.tsx`
- `src/app/pro/messagerie/page.tsx`
- `src/app/pro/paie/[id]/page.tsx`
- `src/app/pro/paie/configuration/page.tsx`
- `src/app/pro/paie/page.tsx`
- `src/app/pro/parametres/emploi-du-temps/page.tsx`
- `src/app/pro/personnel/[id]/page.tsx`
- `src/app/pro/personnel/nouveau/page.tsx`
- `src/app/pro/personnel/page.tsx`
- `src/app/pro/pointage/historique/page.tsx`
- `src/app/pro/remplacements/page.tsx`
- `src/app/pro/salles/page.tsx`

## Composants de mutation affectés

Ces composants doivent transmettre l’école active explicite aux routes :

- `src/components/pro/BoutonInviter.tsx`
- `src/components/pro/FormulaireCalculPaie.tsx`
- `src/components/pro/FormulaireMessage.tsx`
- `src/components/pro/FormulaireNouveauPersonnel.tsx`
- `src/components/pro/FormulaireNouvelEnseignant.tsx`
- `src/components/pro/PaieValidation.tsx`
- `src/components/pro/PersonnelAcces.tsx`
- `src/components/timetable/BoutonGenerer.tsx`
- `src/components/timetable/BoutonPublier.tsx`
- `src/app/pro/pointage/kiosque/page.tsx`

## Dashboard école affecté par le provider

Le changement central concerne `src/app/dashboard/ecole/layout.tsx`, `src/lib/school/SchoolContext.tsx` et `src/lib/useSchool.ts`. Les consommateurs suivants doivent être vérifiés pour le rechargement sur changement d’école, même si leur API de hook peut rester stable :

- `admissions/page.tsx`, `annonces/page.tsx`, `centre-documentaire/page.tsx` ;
- `classes/page.tsx`, `classes/[id]/page.tsx`, `documents/page.tsx` ;
- `etablissement/page.tsx`, `frais/page.tsx`, `galerie/page.tsx` ;
- `infrastructure/page.tsx`, `page.tsx`, `parametres/page.tsx` ;
- `statistiques/page.tsx`, `support/page.tsx` sous `src/app/dashboard/ecole/`.

## Fichiers de fondation à ajouter lors de l’implémentation

Noms proposés, non créés dans PRO-03 audit :

- `src/lib/school/establishmentAccess.ts` : `listAccessibleEstablishments` et vérification de capacité ;
- `src/lib/school/requestedEstablishment.ts` : extraction UUID depuis URL/body et validation ;
- tests unitaires et d’intégration associés.

## Manifeste applicatif exact

Le périmètre direct prévu contient **48 fichiers existants** :

- 9 fichiers de fondation/navigation/invitation : `src/middleware.ts`, `src/lib/supabase/activeEstablishment.ts`, `src/lib/school/SchoolContext.tsx`, `src/lib/useSchool.ts`, `src/components/pro/ProSchoolSwitcher.tsx`, `src/app/pro/layout.tsx`, `src/app/dashboard/ecole/layout.tsx`, `src/app/auth/callback/route.ts`, `src/app/auth/enseignant-bienvenue/page.tsx` ;
- les 16 pages serveur Pro listées ci-dessus ;
- `src/app/enseignant/mon-espace/page.tsx` et `src/app/pro/pointage/kiosque/page.tsx` ;
- les 12 routes API listées ci-dessus ;
- les 9 composants de mutation listés ci-dessus, hors page kiosque.

Deux nouveaux helpers sont proposés, ce qui porte le périmètre d’implémentation prévu à **50 fichiers** avant ajout des tests. Les 14 pages dashboard consommatrices du provider sont un périmètre exact de non-régression ; elles ne nécessitent une édition que si leur effet/cache n’est pas déjà indexé par `school.id`.

`src/app/pro/organisation/actions.ts` a été relu : ses opérations prennent déjà des identifiants explicites et vérifient séparément owner/organization/school. Il ne doit pas être transformé en accès transitif d’organisation.

## Conclusion

Le cookie actuel ne constitue pas à lui seul une faille d’autorisation parce que les lectures owner le revalident, mais l’ensemble échoue fonctionnellement dès qu’un owner possède plusieurs écoles et ne couvre pas les autres appartenances. La correction doit être coordonnée entre contrat de requête, routes, navigation et RLS ; modifier seulement la fonction SQL serait dangereux.
