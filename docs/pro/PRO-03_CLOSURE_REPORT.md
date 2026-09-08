# PRO-03 — Rapport final de clôture

Date : 21 août 2026  
Branche : `feat/pro-school-organization`  
Production : `Ecoles237` (`umcwwynrftidytxgqkwi`), PostgreSQL 17.6

## Verdict

PRO-03 est clôturé techniquement. Les vagues B, C et D ont été exécutées dans
l'ordre, puis le gate final a supprimé `public.current_establishment_id()` après
confirmation de zéro consommateur. Les invitations restent volontairement
fermées.

## Gate final

Avant exécution, la fonction avait exactement les propriétés suivantes :

- signature : `public.current_establishment_id()` ;
- retour : `uuid` ;
- propriétaire : `postgres` ;
- langage : SQL ;
- volatilité : `STABLE` ;
- sécurité : `SECURITY DEFINER` ;
- EXECUTE : `authenticated` et `service_role` uniquement.

Les consommateurs étaient à zéro dans les policies, fonctions, vues, vues
matérialisées, dépendances catalogue et code applicatif actif. Le gate a révoqué
EXECUTE à `PUBLIC`, `anon`, `authenticated` et `service_role`, puis supprimé la
fonction avec `DROP ... RESTRICT`, dans une transaction unique.

Après exécution :

- signature absente : PASS ;
- overloads restants : 0 ;
- références SQL résiduelles : 0 ;
- dépendances cassées : 0 ;
- alerte Supabase spécifique au helper : supprimée.

## Policies et isolation

- Policies A–D : 38/38 présentes.
- RLS : actif pour 38/38 cibles de policy.
- Policies sans référence au helper supprimé : 38/38.
- Checksum global avant/après : identique.
- Checksum de la policy A `ai_usage` avant/après : identique.
- Propriétaire légitime / école propre : ALLOW.
- Propriétaire A / école étrangère B : DENY.
- Utilisateur étranger / école A : DENY.
- Tests PRO-03 multi-écoles : PASS.

La policy A cible encore `PUBLIC` et utilise
`is_own_establishment(etablissement_id)`. Conformément à l'autorisation reçue,
elle n'a pas été modifiée par le gate.

## Données métier

Les comptes exacts des 35 tables publiques A–D et des deux périmètres Storage
ont été capturés avant et après le gate. Ils sont identiques, notamment :

- `pointages` : 6 → 6 ;
- `storage.objects` / `pointages-photos` : 6 → 6 ;
- `enseignants` : 5 → 5 ;
- `staff_members` : 3 → 3 ;
- toutes les autres tables cibles : compte avant/après identique.

Aucune ligne métier n'a été créée, modifiée ou supprimée.

## Validation locale finale

- TypeScript : PASS (`npx tsc --noEmit --incremental false`).
- Tests PRO-03 : PASS, 72/72.
- Build : PASS, 88/88 pages.
- Routes d'invitation : toujours HTTP 503.
- Envoi réel : aucun.

## Alertes Supabase pertinentes

L'avertissement SECURITY DEFINER relatif à
`public.current_establishment_id()` a disparu. Aucun nouvel avis sécurité ne
cible les objets modifiés par le gate.

Les avis existants et hors gate sont consignés dans les travaux post-PRO-03
ci-dessous ; ils n'ont pas été modifiés pendant cette exécution.

## Travaux restant après PRO-03

Ces travaux sont séparés et ne remettent pas en cause la clôture du gate :

1. Revue architecturale de la policy A `ai_usage` ciblant encore `PUBLIC` et de
   la surface `SECURITY DEFINER` de `public.is_own_establishment(uuid)`.
2. Revue des fonctions signalées par les advisors :
   `get_admission_by_tracking`, `consume_targeted_invitation`,
   `is_commercial_admin`, `is_platform_admin` et `log_platform_action`.
3. Durcir le `search_path` de `touch_school_page_sections_updated_at` et revoir
   l'extension `unaccent` installée dans `public`.
4. Examiner séparément les tables RLS sans policy : tables privées
   d'invitation, `payments` et `sessions_impersonation`.
5. Activer la protection contre les mots de passe compromis dans Supabase Auth.
6. Backlog performance : clés étrangères sans index de couverture, policies
   self-read sans initPlan `(select auth.uid())`, policies permissives multiples
   et index inutilisés. Ne supprimer aucun index sans mesure de charge.
7. Formaliser les DDL production B/C/D/gate dans l'historique de migrations
   avant tout futur replay ou déploiement, sans réexécuter les changements live.
8. Invitations : poursuivre la revue staging, créer les rôles/secrets seulement
   après approbation et conserver les routes fermées jusque-là.

## Statut final

- PRO-03 CLOSED: YES
- FINAL GATE EXECUTED: YES
- CURRENT_ESTABLISHMENT_ID REMOVED: YES
- RLS POLICIES VERIFIED: 38/38
- CROSS-SCHOOL ISOLATION: PASS
- BUSINESS DATA CHANGED: NO
- DATABASE WRITES FOR GATE: 1 DDL transaction, 0 business rows
- TYPESCRIPT: PASS
- TESTS: PASS, 72/72
- BUILD: PASS, 88/88 pages
- INVITATIONS ACTIVATED: NO
- LOGIN / SECRET / EMAIL: NONE
- PUSH / DEPLOYMENT: NONE
