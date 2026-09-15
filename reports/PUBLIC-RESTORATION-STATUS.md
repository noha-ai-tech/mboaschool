# Écoles237 — restauration de la version consolidée

État : corrections locales préparées, publication non effectuée.

## Versions vérifiées

- Production : `96225e4c3273c84c37d64bbab45b96461841f6aa`, branche `main`, déploiement `dpl_HUBixPCgJ3Ge5c46pHgqecgjLFQr`.
- Base de cette restauration : `164d85456dd5bfd70cf7325d704206fddd120db3`, branche `integration/final-platform-consolidation`.
- Copie de travail isolée : `release/restore-consolidated-platform` ; le dépôt utilisateur et ses modifications sont préservés.
- Prévisualisation consolidée vérifiée au navigateur : https://mboaschool-q5bnfzvvv-bodingo.vercel.app
- Cette prévisualisation montre la nouvelle interface, 2 255 établissements et 10 régions. Elle ne contient pas encore les corrections locales de cette mission.

## Données vérifiées en lecture seule

Projet Supabase : `umcwwynrftidytxgqkwi`, Ecoles237, ACTIVE_HEALTHY.

| Catégorie | Établissements |
| --- | ---: |
| Secondaire | 2115 |
| Supérieur | 100 |
| Formations/autres | 17 |
| Primaire | 16 |
| Garderie | 7 |
| Total | 2255 |

Le registre n'a pas disparu. 2 199 lignes ont une source ministérielle renseignée ; 1 938 ont un identifiant officiel. L'absence d'identifiant officiel pour d'autres écoles ne doit pas conduire à inventer un identifiant ou à réimporter aveuglément le registre.

Le RPC `submit_public_application` existe toujours. Le hotfix est conservé dans la version préparée.

## Corrections locales

- Préinscription : pagination stable de toute la liste, par lots de 500 ; recherche nom/ville dans le sélecteur ; compteur réel ; erreurs de chargement visibles ; annulation des requêtes obsolètes.
- Catégories : même pagination exhaustive, tri stable, annulation au changement de catégorie et erreur explicite au lieu de résultats partiels silencieux.
- Recherche serveur : conservation de l'orthographe accentuée saisie, en plus des variantes connues ; Réussite/Reussite couvert.
- Suggestions : même recherche mot par mot que l'annuaire, y compris une école et une ville dans un ordre différent.
- La base consolidée restaure déjà le compteur complet de l'accueil et les liens publics vers les fiches indépendamment du statut de revendication.

Limite connue : le repli des accents pour un mot non accentué inconnu reste fondé sur les variantes existantes. Un repli Unicode universel côté serveur nécessite un travail distinct sur le contrat de recherche SQL ; il n'est pas prétendu acquis ici.

## Vérifications

- 36 tests ciblés réussis, aucun échec ni test ignoré : pagination, recherche, suggestions, liens publics, statistiques, sitemap.
- TypeScript : aucun diagnostic.
- Lint des cinq fichiers modifiés : aucune erreur ni avertissement.
- Diff : aucune erreur d'espacement.
- Compilation de production : non validée, téléchargement Google Fonts refusé par le réseau de l'environnement.
- Premier passage de la suite globale avant corrections : 700 réussites, 49 échecs, 0 ignoré. Causes observées : collision entre créations concurrentes de rôles PostgreSQL dans une base de test neuve ; imports de scripts Guyskull exigeant une configuration locale ; tests d'activité qui choisissent la journée UTC alors que les fonctions interrogent la journée Africa/Douala. La suite globale n'est donc pas déclarée PASS.

## Conditions restantes avant publication complète

La production ne contient pas les tables des nouveaux modules `establishment_creation_requests`, `sync_mutations`, `students`, `lesson_sessions`, `student_attendance`, `timesheet_corrections`, `timesheet_approvals`, `school_events`.

Revoir et rejouer dans une copie locale du schéma réel les dix migrations allant de `20260907222604_onboarding_01_establishment_creation_requests.sql` à `20260917090000_daily_intelligence_01_1_local_day_boundary.sql`. Ne pas lancer un rattrapage global des anciennes migrations : le registre distant ne reflète pas tous les objets réellement présents, y compris le hotfix applications déjà appliqué.

Points à contrôler explicitement : grants des nouvelles tables, restriction des colonnes administratives à la création des demandes, compatibilité des enums avec le RPC d'approbation, fonctions SECURITY DEFINER, contraintes multi-école, événements ajoutés aux candidatures et absence de régression du hotfix.

Après validation : finaliser la compilation, vérifier les parcours publics sur ordinateur/mobile avec les corrections, préparer le déploiement de la version complète, contrôler les fonctions et tables de production, publier puis vérifier le domaine, les 2255 écoles, la recherche avec accents et la présence du RPC. Une ancienne version dépourvue du hotfix ne constitue pas un retour arrière acceptable.

## Blocage d'environnement

La revue automatique a refusé la commande `npx supabase migration new restore_public_directory_search`, en indiquant une limite d'usage atteinte. Aucun contournement ni write en production n'a été effectué. La préparation de migration et les opérations protégées restent à reprendre après rétablissement de l'accès. La correction locale de pagination et des cas d'accents ci-dessus ne nécessite elle-même aucune migration.

Les données, DNS, domaines, déploiement de production, candidatures et comptes utilisateurs n'ont pas été modifiés pendant cette mission.
