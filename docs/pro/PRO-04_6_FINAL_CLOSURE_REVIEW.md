# PRO-04.6 — Revue finale de clôture

Date : 24 août 2026  
Branche : `feat/pro-school-organization`  
Production : Ecoles237 (`umcwwynrftidytxgqkwi`)  
Mode : catalogue et Advisors en lecture seule ; aucune migration exécutée

## Verdict

Les quatre lots PRO-04 sont présents, conformes et sans régression détectée
sur leurs objets. Le gate de clôture sécurité global reste toutefois **bloqué** :
des policies historiques hors lots 1–4 accordent à `anon` des écritures
inconditionnelles. En particulier, `anon` peut insérer et supprimer dans
`public.classes`, qui contient actuellement deux lignes. La clôture ne peut
donc pas affirmer une isolation inter-écoles globale tant que cette surface
n'est pas fermée.

Aucun correctif n'a été appliqué pendant cette revue.

## PRO-04 migrations

| Lot | Version distante | Nom | Historique | État des objets |
|---|---|---|---|---|
| 1 | `20260823060906` | `pro_04_lot_01_owner_policy_and_helper` | Présent, 1 statement | Conforme |
| 2 | `20260823202851` | `pro_04_lot_02_low_risk_function_hardening` | Présent, 1 statement | Conforme |
| 3 | `20260824043833` | `pro_04_lot_03_legacy_deny_all_acl` | Présent, 1 statement | Conforme |
| 4 | `20260824062038` | `pro_04_lot_04_high_volume_fk_indexes` | Présent, 1 statement | Conforme |

Deux migrations CMS distinctes sont postérieures au lot 4 :
`20260824062810_publish_school_page_rpc` et
`20260824070848_fix_publish_school_page_owner_check`. Elles ne sont pas
attribuées à PRO-04 ; le snapshot Advisor courant inclut nécessairement leur
état.

## Local/remote parity

Les fichiers `docs/pro/*_PROPOSED.sql` et leurs quatre migrations locales sont
octet pour octet identiques. SHA-256 locaux :

| Lot | SHA-256 |
|---|---|
| 1 | `55361014ccfbd856a01dced1de9b3dac669e9d9955344094ce92bb75b42ff90b` |
| 2 | `5076efc88c8d6de9543f3afa6f6187c290c344b39eb00f1f7f6ecd38ea9ba6c2` |
| 3 | `c651ca9b7695bc8db8e8829bcc8154ec9705d9b02a9a69581bb386cad217786e` |
| 4 | `afb829a79170fe87136ec15651c4b99f0746861da1885fb1aad21151dcc2f1c7` |

Les statements enregistrés à distance ont la même charge SQL : lots 2 et 3
ont le même MD5 brut que le fichier local ; le lot 1 diffère seulement par la
suppression du saut de ligne terminal ; le lot 4 diffère seulement par un
`CRLF` terminal ajouté au transport. Les checksums recalculés après ces seules
normalisations correspondent. La parité fonctionnelle est en outre confirmée
par le catalogue :

- lot 1 : `is_own_establishment(uuid)` absent ; trois policies remplacées,
  rôles `authenticated`, prédicats directs corrélés et `(select auth.uid())` ;
- lot 2 : OID `20726`, corps MD5
  `9b1889f56258bf9d6554213c05019c76`, `SECURITY INVOKER`, propriétaire
  `postgres`, `search_path=''`, ACL `postgres` uniquement, trigger actif ;
- lot 3 : OID `21108`, corps MD5
  `aa21b9b769cef6bebd5080027064d356`, définition MD5
  `17e58602c8454c70c160e191e3c3ca9e`, propriétaire et mode inchangés,
  ACL `postgres` uniquement ; trigger OID `21109`, actif, définition MD5
  `df0b3d9ff934dfa3e8c918adf4ed6f2d` ;
- lot 4 : huit FK exactes et huit index présents, B-tree, valides, prêts,
  actifs, non partiels, avec colonne et ordre exacts.

## Security findings before/after

Source : [Supabase Security Advisor](https://supabase.com/docs/guides/database/database-linter).

| Finding | Avant | Après | Classement |
|---|---:|---:|---|
| RLS active sans policy | 4 | 4 | 2 intentionnels, 2 importants hors périmètre |
| `search_path` mutable | 1 | 1 | important hors périmètre |
| extension dans `public` | 1 | 1 | optimisation de sécurité future |
| `anon` exécute une fonction `SECURITY DEFINER` | 2 | 1 | risque réel restant |
| `authenticated` exécute une fonction `SECURITY DEFINER` | 6 | 5 | 4 usages intentionnels, 1 risque partagé avec l'oracle public |
| protection mots de passe compromis | 1 | 1 | risque réel restant |
| **Total** | **15** | **13** | aucune alerte de niveau ERROR/CRITICAL fournie par Advisor |

La baisse nette de deux correspond à la disparition des avis visant
`is_own_establishment`. Le warning du trigger `school_page_sections` a disparu ;
le warning courant concerne désormais `touch_school_page_drafts_updated_at`,
objet séparé explicitement exclu du lot 2.

### Classement des 13 findings Security restants

- **Intentionnels** : les tables privées d'invitation ont RLS active, aucune
  policy, aucune ACL ni même `USAGE` de schéma pour `anon`, `authenticated` ou
  `service_role`. Elles restent deny-all. `consume_targeted_invitation(text)`
  est `authenticated` uniquement, `search_path=''`, dérive l'identité de
  `auth.uid()` et les tables d'invitation sont vides. `is_platform_admin()` et
  `is_commercial_admin()` sont des helpers RLS ; `log_platform_action()`
  vérifie en interne `is_platform_admin()` avant l'insert d'audit.
- **Importants, hors périmètre PRO-04** : `payments` et
  `sessions_impersonation` ont RLS sans policy mais conservent des grants de
  table larges. RLS bloque actuellement `anon`/`authenticated`, mais les ACL
  sont trompeuses et `service_role` contourne RLS. Les deux tables sont vides.
- **Important, correction bornée** :
  `touch_school_page_drafts_updated_at()` est `SECURITY INVOKER`, possède un
  unique trigger `BEFORE UPDATE FOR EACH ROW` actif, mais garde
  `proconfig=NULL` et l'EXECUTE par défaut de `PUBLIC`. Son corps est identique
  à celui du trigger sections. Préparer un lot analogue au lot 2, sans recréer
  la fonction ou le trigger. Voir le finding
  [`function_search_path_mutable`](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable).
- **Risque réel P1** : `get_admission_by_tracking(text,text)` reste un oracle
  public `SECURITY DEFINER`, appelé par `/suivi-admission`, avec
  `search_path=public` et sans limitation de tentatives documentée. Le grant
  `anon` est fonctionnellement intentionnel, mais le rate-limit et la réduction
  de surface restent nécessaires. Voir
  [`anon_security_definer_function_executable`](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable).
- **Risque réel P1** : la protection Supabase Auth contre les mots de passe
  compromis reste désactivée. Voir la
  [documentation Password Security](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
- **Optimisation future** : `unaccent` 1.1 est relocatable mais installé dans
  `public`. `f_unaccent(text)` et `search_establishments(...)` en dépendent ;
  les rôles clients n'ont pas `CREATE` sur `public`. Le déplacement doit donc
  être préparé avec la réécriture du wrapper, pas appliqué automatiquement.
  Voir [`extension_in_public`](https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public).

## Performance findings before/after

Source : [Supabase Performance Advisor](https://supabase.com/docs/guides/database/database-linter).

| Finding | Avant | Après | Décision |
|---|---:|---:|---|
| FK sans index | 63 | 53 | 8 cibles du lot 4 supprimées ; backlog par volume |
| initPlan RLS | 56 | 56 | important performance, traitement atomique par groupes |
| index inutilisé | 52 | 46 | ne rien supprimer sans période de mesure |
| policies permissives multiples | 125 | 136 | revue sémantique ; contient un risque sécurité réel décrit ci-dessous |
| connexions Auth absolues | 1 | 1 | configuration future |
| **Total** | **297** | **292** | 100 INFO, 192 WARN, aucun niveau critique |

Le delta global n'est pas entièrement attribuable à PRO-04 en raison des deux
migrations CMS postérieures et de la nature dynamique des statistiques
d'index. La preuve spécifique du lot 4 reste nette : les huit findings FK
ciblés sont absents.

- **53 FK restantes** : optimisation future. Le catalogue courant ne montre
  pas de nouvelle table volumineuse parmi ces cibles (maximum positif estimé :
  5 lignes ; relation la plus grande : environ 120 KiB), mais plusieurs tables
  n'ont pas encore de statistiques fiables. Prioriser selon croissance et
  actions `ON DELETE`, pas par ajout massif d'index.
- **56 initPlan RLS** : important mais non bloquant sécurité. Remplacer les
  appels par `(select auth.uid())` uniquement après preuve d'équivalence de
  chaque policy. Voir
  [`auth_rls_initplan`](https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan).
- **136 policies permissives multiples** : la plupart reflètent la composition
  owner/self/admin ou l'expansion du rôle `PUBLIC`; elles doivent être
  fusionnées uniquement après truth table. Voir
  [`multiple_permissive_policies`](https://supabase.com/docs/guides/database/database-linter?lint=0006_multiple_permissive_policies).
- **46 index inutilisés** : sept des huit nouveaux index du lot 4 sont déjà
  signalés faute de scans depuis leur création. C'est un faux positif temporel
  pour la décision de suppression : ils couvrent des FK et ne doivent pas être
  supprimés. Les 39 autres attendent une fenêtre de statistiques représentative.
  Voir [`unused_index`](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index).

## Critical findings remaining

La revue du détail `multiple_permissive_policies`, complétée par une lecture du
catalogue, révèle des droits d'écriture `anon` effectifs :

| Table | Policy | Effet réel | Lignes actuelles | Priorité |
|---|---|---|---:|---|
| `classes` | `Allow all classes insert` | `INSERT WITH CHECK (true)` | 2 | P0 |
| `classes` | `Allow all classes delete` | `DELETE USING (true)` | 2 | P0 |
| `class_announcements` | `Allow class announcements insert/delete` | écriture/suppression anon inconditionnelle | 0 | P0 avant usage |
| `school_dashboard_context` | `Allow all dashboard context insert/update` | écriture/modification anon inconditionnelle | 0 | P0 avant usage |

Les grants de table nécessaires sont présents. Ces policies ne sont pas
versionnées dans les migrations locales retrouvées et ne proviennent pas des
lots PRO-04. Elles représentent néanmoins un accès inter-écoles réel ou futur.
`applications_public_insert` est séparée : l'insert public est intentionnel
pour la préinscription, mais doit rester soumis à validation et rate-limit.

## Intentional findings

- deny-all RLS des deux tables `private` d'invitation ;
- consommation d'invitation `authenticated` uniquement, avec création et
  révocation toujours fermées ;
- helpers admin utilisés par RLS et fonction d'audit avec contrôle interne ;
- lectures publiques CMS/admissions explicitement prévues ;
- sept nouveaux index FK sans scan observé immédiatement après leur création.

## Regression check

- 38/38 policies PRO-03 A–D présentes ; RLS active sur 38/38 ; rôles exacts
  `authenticated` ; aucun rôle ni objet manquant ; checksum catalogue courant
  `86f7c39440ce7e13f60338f6667d9c13`.
- Les trois policies du lot 1 et `admissions_config_public_read` sont conformes.
- Les fonctions et triggers des lots 2 et 3 conservent leurs OID, corps,
  propriétaire, mode de sécurité et état actif attendus.
- Les huit FK et index du lot 4 sont conformes.
- `current_establishment_id()` et `is_own_establishment(uuid)` restent absents.
- Les tests PRO-03 confirment les routes multi-écoles et les routes
  d'invitation HTTP 503 ; le build produit 91/91 pages.
- Aucun test HTTP live n'a été exécuté pendant cette revue en lecture seule.

Conclusion : aucune régression liée aux objets PRO-04 n'est détectée. Le risque
`anon` décrit plus haut est un état historique hors PRO-04, mais bloque la
conclusion de sécurité globale.

## Cross-school isolation

- Périmètre PRO-03 A–D : **PASS**. Les 38 policies sont intactes et les tests
  multi-écoles passent. Une vérification read-only avec deux propriétaires
  réels distincts donne `own school = true`, `foreign school = false`; le helper
  admin renvoie `false` au propriétaire et `true` à un compte platform admin.
- Périmètre global : **FAIL** tant que `anon` peut supprimer n'importe quelle
  ligne de `classes` via `USING (true)` et insérer avec un
  `establishment_id` arbitraire.

## Business data

Les 37 compteurs du baseline PRO-04.1 sont identiques : `enseignants=5`,
`staff_members=3`, `pointages=6`, objets Storage `pointages-photos=6`, toutes
les autres cibles à zéro. Les compteurs du lot 4 restent
`establishment_import_staging=2378` et `establishments=2252`.

**BUSINESS DATA CHANGED: NO.** La variation de taille des deux tables du lot 4
correspond uniquement aux index créés auparavant. Cette revue a effectué zéro
écriture en base.

## Validation locale

- **TYPESCRIPT: PASS** — `npx tsc --noEmit --incremental false`.
- **LINT: PASS ciblé** — cinq consommateurs critiques (contexte école,
  consommation d'invitation, suivi admission, audit plateforme), zéro warning
  ou erreur. Un essai plus large sur `src/app`, `src/lib` et `src/components`
  reste en échec sur huit erreurs historiques `react/no-unescaped-entities`
  hors PRO-04 ; aucune correction automatique n'a été faite.
- **TESTS: PASS** — PRO-03 `72/72`, PRO-04 `31/31`, total `103/103`.
- **BUILD: PASS** — Next.js 15.5.23, compilation réussie, 91/91 pages.

## Deferred backlog

1. **P0 — avant clôture** : fermer et versionner les writes `anon` de
   `classes`, `class_announcements` et `school_dashboard_context`; capturer
   l'origine, les consommateurs et une truth table avant migration.
2. **P1 sécurité** : limiter les tentatives de
   `get_admission_by_tracking`, fixer son `search_path` minimal et revoir ses
   grants sans casser le suivi public.
3. **P1 configuration Auth** : activer la protection contre les mots de passe
   compromis avec validation opérationnelle.
4. **P2** : lot borné pour `touch_school_page_drafts_updated_at()`.
5. **P2** : auditer puis fermer les ACL historiques de `payments` et
   `sessions_impersonation`.
6. **P2** : revue des helpers `SECURITY DEFINER` admin et de leur déplacement
   éventuel hors schéma exposé ; conserver les dépendances RLS nécessaires.
7. **P3 performance** : initPlan, FK restantes, policies permissives multiples
   et index inutilisés, par mesure et petits lots réversibles.
8. **P3 plateforme** : déplacer `unaccent` après réécriture et test de ses
   consommateurs ; passer les connexions Auth d'une valeur absolue à un
   pourcentage lors d'un prochain redimensionnement.
9. **Dette qualité** : corriger séparément les huit erreurs ESLint historiques
   afin de rétablir un lint applicatif large vert.

## Proposed next sprint

**PRO-05 — PUBLIC WRITE & PRIVILEGED RPC HARDENING** est justifié par des
risques réels, pas par le simple volume d'alertes :

1. gate prioritaire des écritures `anon` inconditionnelles ;
2. protection et rate-limit de l'oracle public de suivi admission ;
3. activation contrôlée de la protection des mots de passe compromis.

Les optimisations Performance Advisor restent un backlog séparé et ne doivent
pas élargir automatiquement PRO-05.

## Statut demandé

- PRO-04 MIGRATIONS: 4/4 PRESENTES ET CONFORMES
- LOCAL/REMOTE PARITY: PASS (écarts terminaux de whitespace uniquement)
- SECURITY FINDINGS BEFORE/AFTER: 15 → 13
- PERFORMANCE FINDINGS BEFORE/AFTER: 297 → 292
- CRITICAL FINDINGS REMAINING: YES — writes `anon` inconditionnels
- INTENTIONAL FINDINGS: DOCUMENTES
- DEFERRED BACKLOG: PRIORISE
- REGRESSION CHECK: PASS POUR LES OBJETS PRO-04
- CROSS-SCHOOL ISOLATION: PASS A–D / FAIL GLOBAL (`classes`)
- BUSINESS DATA CHANGED: NO
- TYPESCRIPT: PASS
- LINT: PASS CIBLE ; LINT LARGE FAIL SUR DETTE EXISTANTE
- TESTS: PASS 103/103
- BUILD: PASS, 91/91
- PRO-04 CLOSED: NO — P0 sécurité à traiter avant clôture
- PROPOSED NEXT SPRINT: PRO-05 — PUBLIC WRITE & PRIVILEGED RPC HARDENING
- MIGRATIONS EXECUTED: 0
- DATABASE WRITES: 0
- INVITATIONS ACTIVATED: NO
- PUSH / DEPLOYMENT: NONE
