# GUYSKULL-02B 0037 PRODUCTION PREFLIGHT REPORT

Date du contrôle : 2026-08-31  
Branche : `codex/guyskull-01b-reconciliation`  
Base de travail GUYSKULL-01C : `1632f79b1281d0689459ac7c3a6e25f76d9da96e`  
Nature du contrôle : catalogue et données de production en lecture seule, validations locales uniquement  
Migration exécutée : **NON**  
Écritures base de données : **0**

## TARGET

Project: `Ecoles237` — project ref lié `umcwwynrftidytxgqkwi`  
Environment: production, région `eu-west-1`, PostgreSQL `17.6.1.121`, état `ACTIVE_HEALTHY`  
0035: les marqueurs attendus sont présents dans cette base (`school_official_ranking`, `school_exam_results`).  
0036: les colonnes attendues sont présentes sur `school_announcements` (`event_date`, `event_start_time`).  

La cible n'est pas ambiguë. Les migrations numériques 0035/0036 ne figurent pas sous ces noms dans l'historique distant timestampé, mais leurs objets finaux sont bien ceux de la production liée.

## MIGRATION

0037 local SHA: `DBAB0D3F945DECE219E14DD5BB5296A627B40A0D3AC3B2D33909D46097A6188E`  
Expected SHA: `5263606BBDB7413DEA6B98D4F5EA8D59AE68406AC1700CD96F4FF6749B81C7DD`  
Match: **OUI sur le fichier initial contrôlé, NON après correction**. Le SHA initial correspondait exactement au SHA attendu. La correction minimale de sécurité décrite ci-dessous change volontairement l'identité du fichier et requiert une nouvelle approbation.  
Collision: **AUCUNE**. 0037 existe une seule fois dans les migrations actives locales, aucune version distante 0037 n'occupe ce numéro, et aucun objet proposé n'existe déjà en production.

Correction minimale apportée après le préflight :

- verrouillage des définitions de production de `publish_school_page` et `discard_school_page_draft` par checksum, propriétaire, mode de sécurité et `search_path` ;
- contrôle des noms exacts des policies initiales ;
- puisque le bucket `school-documents` est public, interdiction de représenter un document comme privé ou brouillon (`status = 'live'`, `is_public = true`) ;
- obligation que le premier segment de `storage_path` soit l'UUID exact de l'établissement ;
- post-checks et tests correspondants ;
- rollback complété pour la nouvelle contrainte.

## OBJECT AUDIT

Tables: les trois tables proposées sont **ABSENT** : `school_fee_schedules`, `school_fee_installments`, `school_additional_fees`.  
Columns: les six colonnes proposées sont **ABSENT** : `fees.is_qualified` et `school_documents.{academic_year,mime_type,description,is_public,status}`. `school_documents.establishment_id` existe et devientrait `NOT NULL`; la table contient actuellement 0 ligne.  
Indexes: les trois index proposés sont **ABSENT**.  
Policies: les nouvelles policies sont **ABSENT**. Les états initiaux observés correspondent aux ensembles attendus : 3 policies sur `fees`, 2 sur `school_documents`.  
Triggers: 0037 ne crée, ne remplace et ne supprime aucun trigger.  
RPC/functions: `publish_school_page_v2(uuid,timestamptz)` est **ABSENT**. Les fonctions de production requises sont présentes et strictement contrôlées :

- `publish_school_page(uuid,timestamptz)` : propriétaire `postgres`, `SECURITY INVOKER`, `VOLATILE`, `search_path=public, pg_temp`, checksum brut de définition `f47fdb855ed5830814f15045a5157398` ;
- `discard_school_page_draft(uuid,timestamptz,jsonb)` : propriétaire `postgres`, `SECURITY INVOKER`, `VOLATILE`, `search_path=public, pg_temp`, checksum brut de définition `b02e52187172d15100412bb637e22067`.

Constraints/types: aucun enum/type nouveau. Les contraintes et checks proposés sont **ABSENT**. Les FK de base requises existent.  
Grants: les ACL initiales ont été relevées. Les nouvelles tables n'ont naturellement aucune ACL; les grants proposés retirent les écritures clientes directes et conservent la lecture publique publiée.  
Conflicts: **AUCUN objet DIFFERENT ou PARTIAL critique**.

## EXISTING DATA

Legacy fees preserved: **OUI**. `fees` contient 7 lignes. 0037 ajoute `is_qualified default false`, mais ne supprime, ne réécrit et ne requalifie aucun montant existant.  
Guyskull 29,000 preserved: **OUI**. L'établissement `a4cc4966-0d85-4c63-9c24-0538b8d5133b` conserve sa ligne `fees` (`tuition_fee = 29000`, `currency = FCFA`) et son brouillon historique. Aucun DML métier ou backfill n'est présent dans 0037.  
Backfill required: **NON**.  
Destructive operation: **NON lors de la migration**. Les remplacements de pricing n'arrivent qu'au futur appel explicite de publication V2 d'un propriétaire autorisé.

Compteurs de référence : `fees = 7`, `school_documents = 0`, `school_page_drafts = 4`.

## PUBLISH / DISCARD

Production RPC parity: **OUI**. 0037 dépend désormais des définitions exactes réellement observées et refuse toute dérive.  
Atomic: **OUI**. `publish_school_page_v2` verrouille le brouillon, appelle la publication existante, puis remplace schedules, installments, frais additionnels et qualification dans un même bloc transactionnel. Une exception dans la matérialisation annule également les effets de la publication appelée. Aucun état partiel n'est conservé.  
Existing domains preserved: **OUI** — présentation, contact, admissions, frais historiques, infrastructure, hero, sections, galerie, chiffres clés, résultats et classement restent publiés par la fonction existante.  
New pricing lifecycle safe: **OUI**. Les brouillons structurés restent dans le JSON privé; les tables publiques ne contiennent que l'état matérialisé au moment de la publication. Le discard reconstruit le brouillon depuis le snapshot live, y compris les schedules et frais additionnels, sans publier ni modifier les tables live.

La publication vérifie l'owner via `auth.uid()`, verrouille le brouillon avec `FOR UPDATE`, exige son timestamp attendu, borne les volumes, et valide la structure avant toute mutation. La route applicative appelle uniquement V2.

## SECURITY

Owner direct published write: **REFUSÉ**. `authenticated` reçoit uniquement `SELECT` sur les tables publiées; aucune policy d'écriture n'existe. L'édition se fait dans le brouillon privé, puis la publication par la RPC V2.  
Cross-school write: **REFUSÉ** par le contrôle corrélé `establishments.id = p_establishment_id AND owner_id = auth.uid()` avant l'exécution en privilèges élevés.  
Anon draft read: **REFUSÉ**. `school_page_drafts` reste sous sa policy owner-only `authenticated` et sans grant anon.  
Anon published read: **AUTORISÉ**, volontairement, sur les trois tables de pricing matérialisé et les documents `live/public`.  
Trusted flag bypass: **NON**. Le flag transactionnel existant est positionné uniquement dans la RPC de publication après preuve d'ownership. Un client PostgREST ordinaire ne dispose ni d'une RPC arbitraire pour exécuter `SET LOCAL`, ni des grants DML nécessaires sur les tables publiées; le contexte transactionnel ne se propage pas entre requêtes.

`publish_school_page_v2` est `SECURITY DEFINER` uniquement pour matérialiser les tables live, avec `search_path=''`, objets qualifiés, identité dérivée de `auth.uid()`, `PUBLIC/anon/service_role` révoqués et `EXECUTE` accordé seulement à `authenticated`. Le rôle `service_role` conserve les accès directs de maintenance prévus, mais ne reçoit pas l'exécution de la RPC V2.

### Matrice de sécurité

| Acteur | Draft Read | Draft Write | Published Read | Published Direct Write |
|---|---:|---:|---:|---:|
| Propriétaire | Oui, sa propre école | Oui, via le chemin brouillon approuvé | Oui | Non |
| Propriétaire étranger | Non | Non | Oui, contenu public seulement | Non |
| Anonymous | Non | Non | Oui, contenu public seulement | Non |
| Platform admin / service | Selon architecture privilégiée existante; aucun bypass platform-admin ajouté | Service : maintenance directe; admin applicatif : pas d'exception implicite | Oui | Service uniquement, maintenance privilégiée |

### Matrice des opérations

| Opération | Propriétaire | Propriétaire étranger | Anonymous | Service |
|---|---:|---:|---:|---:|
| Créer/modifier un schedule dans le draft | Oui | Non | Non | Maintenance seulement |
| Ajouter/supprimer une tranche dans le draft | Oui | Non | Non | Maintenance seulement |
| Ajouter un frais additionnel dans le draft | Oui | Non | Non | Maintenance seulement |
| Écrire directement les tables publiées | Non | Non | Non | Oui, privilégié |
| Publier | Oui, RPC V2 | Non | Non | RPC V2 non accordée |
| Discard | Oui, RPC existante | Non | Non | Selon ACL existante |
| Lire le pricing public | Oui | Oui | Oui | Oui |
| Lire le draft privé | Oui, sa propre école | Non | Non | Maintenance privilégiée |

## DOCUMENT SECURITY

Ownership: **CORRÉLÉ À LA LIGNE** avec `establishment_id` et `(select auth.uid())`, dans `USING` et `WITH CHECK`.  
Storage isolation: **OUI**. Toute insertion ou modification doit conserver `split_part(storage_path, '/', 1) = establishment_id::text`. La policy Storage existante applique déjà le même ancrage au premier dossier; 0037 ne la modifie pas.  
Public visibility: le bucket `school-documents` est actuellement public. Pour ne pas créer une fausse promesse de confidentialité, 0037 corrigée n'accepte que des métadonnées `status='live'` et `is_public=true`; le CTA n'expose que ce même état.  
Cross-school asset risk: **REFUSÉ** par l'ancrage du chemin et l'ownership de l'établissement. Une mise à jour ne peut ni changer la ligne vers une école étrangère, ni pointer vers le dossier d'une autre école.

Une véritable gestion de documents privés/drafts nécessiterait une mission distincte : bucket privé, URL signées et lifecycle sécurisé. 0037 ne prétend pas fournir cette capacité et ne diminue aucune policy Storage existante.

## DELETE / CASCADE

- `school_fee_schedules.establishment_id -> establishments.id`: `ON DELETE CASCADE`.
- `school_fee_installments.fee_schedule_id -> school_fee_schedules.id`: `ON DELETE CASCADE`.
- `school_additional_fees.establishment_id -> establishments.id`: `ON DELETE CASCADE`.
- `school_documents.establishment_id -> establishments.id`: FK de production existante en `ON DELETE CASCADE`, inchangée; 0037 rend seulement la colonne non nulle.

La suppression d'un schedule supprime donc ses tranches. La suppression d'un établissement ne laisse pas d'orphelins dans ces tables. Aucune opération 0037 ne supprime un objet du bucket Storage; supprimer une ligne de métadonnées n'efface pas automatiquement le fichier.

## ROLLBACK

Classification: **SAFE AFTER PRODUCTION DATA WITH DATA LOSS**. Avant la première donnée structurée/document enrichi, il est pleinement sûr. Après utilisation, il supprime les trois tables structurées et les cinq colonnes documentaires ajoutées : ces nouvelles données seraient perdues.  
Pre-existing data preserved: **OUI**. Le rollback ne supprime aucune ligne `fees`, restaure les policies/grants initiaux, retire seulement `fees.is_qualified`, restaure la nullabilité documentaire initiale et ne touche ni 0035, ni 0036, ni une autre donnée scolaire. Les fichiers Storage ne sont pas supprimés.

Le rollback est protégé par un préflight d'état final et doit être sauvegardé avant toute utilisation réelle des nouvelles structures.

## DRY RUN

Migration: **NON EXÉCUTÉE** — aucun moteur Docker, Supabase CLI local ou base shadow jetable n'est disponible sur cette machine. Aucune base distante n'a été utilisée comme substitut.  
Rollback: **NON EXÉCUTÉ** pour la même raison; revue statique terminée.  
Schema restoration: **NON PROUVÉE PAR REPLAY**, mais le rollback a été comparé objet par objet au delta 0037 et ne dépasse pas ce périmètre.

## QUALITY

TypeScript: **PASS** — `npx tsc --noEmit --incremental false`, code 0.  
Tests: **PASS — 167/167**. Trois tests 02B supplémentaires couvrent les checksums RPC, l'impossibilité de déclarer un asset privé dans un bucket public et l'ancrage école du chemin Storage.  
Build: **PASS** — build Next.js complet, code 0, 88 pages générées.  
Lint ciblé GUYSKULL: **PASS**. Le lint global reste en échec sur 8 erreurs historiques dans des écrans hors périmètre et non modifiés par cette correction; aucune n'est masquée ou altérée.  
Diff: `git diff --check` sans erreur de whitespace (avertissements de conversion LF/CRLF uniquement).

## VERDICT

0037 TARGET CONFIRMED: **YES**  
0037 COLLISION-FREE: **YES**  
0037 SECURITY SAFE: **YES — POUR LE SQL CORRIGÉ AU NOUVEAU SHA**  
0037 ROLLBACK ACCEPTABLE: **YES, AVEC PERTE DES NOUVELLES DONNÉES SI UTILISÉ APRÈS MISE EN PRODUCTION**  
0037 SAFE TO APPLY TO PRODUCTION: **NO — nouveau SHA non encore approuvé et dry run jetable indisponible**  
READY FOR GUYSKULL-03: **NO**

STOP.
