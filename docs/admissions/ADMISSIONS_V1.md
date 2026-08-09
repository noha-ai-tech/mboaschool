# Admissions V1 (Mission 07)

Migration préparée : `supabase/migrations/0012_admissions_v1.sql` — **non exécutée**.

## Modèle

Une seule table : `public.applications` (déjà existante, schema.sql — aucune table
`pre_inscriptions` dupliquée). Étendue avec : `admission_status`, `tracking_code`,
`parent_message`, `student_birth_date`, `annee_scolaire_id`. Historique séparé dans
`public.admissions_history` (append-only, jamais modifié/supprimé).

## Statuts

Enum `admission_status` : `submitted` (Nouvelle) → `in_review` (En analyse) →
`documents_required` (Documents requis) → `interview` (Entretien) → `waitlisted`
(Liste d'attente) → `accepted` / `rejected` / `cancelled`.

**Compatibilité ancien statut** : l'enum `application_status` d'origine
(`pending`/`reviewed`/`accepted`/`rejected`) et la colonne `status` ne sont ni
supprimés ni renommés. Un trigger (`sync_legacy_application_status`) maintient
`status` à jour à chaque changement de `admission_status` :

| Nouveau | Ancien |
|---|---|
| submitted | pending |
| in_review / documents_required / interview / waitlisted | reviewed |
| accepted | accepted |
| rejected / cancelled | rejected |

**Bug pré-existant corrigé** : le dashboard utilisait le statut `"reviewing"`
(inexistant dans l'ancien enum, qui ne connaît que `reviewed`) — remplacé par le
nouveau modèle à 8 statuts partout où il était référencé (dashboard admissions,
accueil dashboard école, `NotificationBell`).

## Code de suivi

Format `E237-XXXXXX` (6 caractères alphanumériques sans caractères ambigus
0/O/1/I), généré côté base par trigger à l'insertion. Aucune convention
préexistante à préserver — le dépôt ne contenait aucun système de code de suivi
avant cette mission.

## Permissions et isolation

| Acteur | Accès |
|---|---|
| Public (anon) | INSERT sur `applications` (déjà en place, `with check (true)`). Consultation de son propre dossier uniquement via la fonction `get_admission_by_tracking(code, téléphone)` — jamais de lecture directe de la table. |
| École propriétaire | SELECT/UPDATE complet sur ses propres dossiers (`establishments.owner_id = auth.uid()`, pattern identique au reste du dépôt) + lecture de `admissions_history`. |
| École B | Aucun accès aux dossiers de l'école A — même RLS que partout ailleurs dans le dépôt, non modifiée. |
| `platform_admin` | **Aucun accès construit en V1** — aucune policy `platform_admin` ajoutée sur `applications`/`admissions_history` dans cette migration. La mission autorisait un accès support/modération sans l'imposer ; l'absence totale d'accès est un sous-ensemble sûr de cette exigence. Un mécanisme d'accès support tracé (temporaire, journalisé) reste à concevoir séparément si besoin. |
| Comptes admin plateforme | Rien à construire : `profiles.role` (`user_role` enum) supporte déjà plusieurs comptes `platform_admin`, jamais lié à un email en dur. |

**Fonction `get_admission_by_tracking`** : `security definer`, ne renvoie que 6
champs publics (établissement, enfant, niveau, date, statut, message de
l'école) — jamais l'id du dossier, jamais les notes internes, jamais les
données d'un autre dossier. Exige une correspondance exacte code + téléphone ;
en cas d'échec, la page affiche un message générique ("Aucune demande
trouvée") sans préciser lequel des deux champs est incorrect.

**Garde-fou ajouté** : le GRANT INSERT sur `applications` est accordé à `anon`
au niveau de la table entière (déjà en production, `auth-setup.sql`), sans
restriction par colonne — un client public pourrait donc techniquement
insérer `admission_status = 'accepted'` dès la soumission. Un trigger
(`enforce_admission_initial_status`) force chaque nouvelle ligne à démarrer à
`submitted`, quelle que soit la valeur envoyée par le client.

## Note interne vs message au parent

- `notes` (migration 0007) : strictement interne, jamais exposée par
  `get_admission_by_tracking`, jamais lue par aucune policy publique.
- `parent_message` (cette migration) : seul champ texte libre renvoyé par la
  consultation publique — l'équipe école le renseigne volontairement depuis le
  tiroir de détail du dashboard.

Les deux champs sont visuellement séparés dans l'interface (bordure verte
"visible publiquement" vs bordure neutre "jamais visible du parent") pour
éviter toute confusion au moment de la saisie.

## Routes et pages

| Route | Statut |
|---|---|
| `/preinscription` | Modifiée — ajout date de naissance, année scolaire (optionnelle), affichage du code de suivi après soumission |
| `/suivi-admission` | Nouvelle — consultation publique par code + téléphone |
| `/dashboard/ecole/admissions` | Refondue — pipeline à 7 colonnes actives, filtres (recherche, niveau), historique, actions de transition, séparation note/message, statistiques réelles |
| `/dashboard/ecole` (accueil) | Modifiée — KPI et liste récente basculés sur `admission_status` |

Aucune nouvelle route API créée : toutes les opérations passent par le client
Supabase (RLS + triggers), cohérent avec le pattern déjà en place pour
`applications` avant cette mission (aucune route `/api/applications/*`
n'existait).

## Documents d'admission (Phase 12)

**Non construit.** Aucune table ni bucket dédié aux pièces jointes (acte de
naissance, bulletin, photo, certificat) dans cette mission — seule
l'architecture est préparée : le pattern `staff-documents`/`claim-documents`
(buckets privés scopés par dossier, Missions 02 et 04) est directement
réutilisable le jour où l'upload sera implémenté, sans changement de schéma
nécessaire sur `applications`.

## Notifications (Phase 16)

**Architecture uniquement**, même pattern que
`src/lib/notifications/claimNotifications.ts` (Mission 02) :
`src/lib/notifications/admissionNotifications.ts` définit 7 événements
(`admission_submitted`, `admission_in_review`, `admission_documents_required`,
`admission_interview`, `admission_accepted`, `admission_waitlisted`,
`admission_rejected`) et une fonction `deliver()` qui journalise seulement
(`console.log`), appelée depuis la soumission publique et chaque changement de
statut dans le dashboard. Aucun fournisseur SMS/WhatsApp/email connecté.

## Paiement

**Hors périmètre, non touché.** La table `payments` (schema.sql) existe déjà
mais n'est câblée nulle part dans ce flux ; aucune intégration MTN
MoMo/Orange Money n'est ajoutée dans cette mission (exclusion explicite,
réservée à une mission commerciale dédiée).

## Anti-spam

Réutilise tel quel le trigger `check_application_rate_limit` (migration 0007,
également non exécutée) — 3 soumissions / 15 minutes par `parent_phone`.
Aucune nouvelle infrastructure ajoutée.

## Tests (à exécuter après validation et exécution de la migration en environnement de test)

**Public**
1. Soumettre `/preinscription` avec des champs valides → code de suivi affiché, format `E237-XXXXXX`.
2. Soumettre avec un champ requis manquant → bloqué côté formulaire (HTML `required`).
3. Réessayer 4 fois en moins de 15 minutes avec le même téléphone → 4e tentative rejetée (trigger `check_application_rate_limit`, migration 0007).
4. `/suivi-admission` avec code + téléphone corrects → dossier affiché (établissement, enfant, niveau, date, statut, message école le cas échéant).
5. `/suivi-admission` avec bon code + mauvais téléphone → "Aucune demande trouvée" (pas d'indice sur lequel des deux est faux).
6. Vérifier que la réponse ne contient jamais l'id du dossier, les notes internes, ni des données d'un autre dossier (inspection réseau).

**École**
1. Se connecter en tant que directeur, ouvrir `/dashboard/ecole/admissions` → seuls les dossiers de son établissement apparaissent.
2. Changer un statut via les actions du tiroir → nouvelle entrée dans l'historique, badge mis à jour immédiatement.
3. Écrire une note interne puis un message au parent, sauvegarder séparément → vérifier en base que `notes` ≠ `parent_message`.
4. Recharger `/suivi-admission` avec le dossier concerné → seul `parent_message` apparaît, jamais `notes`.
5. Filtrer par statut, par niveau, rechercher par nom → liste correctement filtrée.

**Isolation (École A vs École B)**
1. Connecté comme directeur de l'école A, tenter `select * from applications where establishment_id = '<id_ecole_B>'` → aucune ligne (RLS).
2. Tenter une mise à jour directe d'un dossier de l'école B depuis le compte A → refusée (RLS UPDATE).
3. Vérifier `admissions_history` : le directeur A ne voit que l'historique des dossiers de A.

**Admin**
1. Confirmer qu'aucun compte `platform_admin` ne peut lire `applications`/`admissions_history` (aucune policy présente).
2. Créer un second profil avec `role = 'platform_admin'` → fonctionne sans changement de schéma (confirme l'architecture multi-admin).

## Limitations V1

- Pas d'upload de documents d'admission (architecture seule, voir ci-dessus).
- Pas de notification réelle envoyée (SMS/WhatsApp/email) — journalisation
  console uniquement.
- Pas d'accès `platform_admin` construit pour le support/la modération.
- L'historique (`admissions_history`) capture les changements de statut mais
  pas les modifications de `notes`/`parent_message` elles-mêmes.
- `get_admission_by_tracking` ne gère pas de limitation de tentatives
  (brute-force du couple code/téléphone) — à considérer si l'usage réel le
  justifie ; le code à 6 caractères (32^6 ≈ 1 milliard de combinaisons)
  combiné à l'exigence du téléphone exact rend une attaque par force brute peu
  praticable en V1, mais aucun rate-limit dédié n'est ajouté sur cette
  fonction RPC.
