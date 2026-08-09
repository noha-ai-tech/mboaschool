# Platform Operating Center V1 (Mission 08)

Migration préparée : `supabase/migrations/0013_platform_operating_center.sql` — **non exécutée**.

Réservé aux administrateurs plateforme. Aucune table de cette mission n'accorde d'accès
aux écoles ou aux enseignants, à l'exception explicite de `support_tickets`
(une école peut ouvrir un ticket — Phase 8).

## Architecture

Extension du dashboard admin existant (Mission 01) plutôt que reconstruction : la barrière
d'accès (`middleware.ts`, `profiles.role === 'platform_admin'`) n'est **pas modifiée**. La
liste d'établissements qui vivait sur `/dashboard/admin` est devenue `/dashboard/admin/ecoles`
— le suivi de vérification réutilise `establishments.verification_status` (déjà préparé,
migration 0008), pas un statut parallèle. Le plan technique `forfait`/`subscription_plan`
(migration 0005, déjà en production) reste inchangé ; `subscriptions` (cette migration) est un
**historique commercial séparé** (Découverte/Vérifiée/Pro), pas un remplacement.

L'ancienne sidebar codée en dur dans `page.tsx` a été extraite dans un `layout.tsx` partagé
(même refactor que `dashboard/ecole/layout.tsx`, Mission 03) — navigation filtrée selon les
permissions de l'administrateur connecté.

## Rôles (Phase 2)

Nouvel enum `platform_admin_role` (extensible via `ALTER TYPE ... ADD VALUE`) :

| Rôle | Portée |
|---|---|
| `super_admin` | Tout, y compris la gestion des autres administrateurs |
| `platform_admin` | Tout sauf gérer les administrateurs |
| `operations_admin` | Écoles, CRM, support, statistiques — **pas** abonnements/paiements/journal d'audit/gestion des admins |

`profiles.admin_role` (nullable, n'a de sens que si `role = 'platform_admin'`). Aucun email
codé en dur : la promotion se fait par recherche d'un email déjà inscrit
(`POST /api/admin/administrateurs`). Le dernier Super Admin ne peut être ni rétrogradé ni
retiré — appliqué en base par le trigger `protect_last_super_admin` (défense en profondeur,
en plus de la restriction `manage_admins` côté route API).

## Permissions

Deux couches, jamais une seule :
1. **Middleware** (inchangé) : barrière large, `role === 'platform_admin'`.
2. **`src/lib/platform/permissions.ts`** : matrice fine par `admin_role`, vérifiée côté client
   (masquer/désactiver, confort uniquement) et côté serveur dans chaque route
   `/api/admin/*` sensible (`requireAdmin(permission)` — autorité réelle).

**RLS** : `is_platform_admin()` (n'importe quel `admin_role`) pour écoles/CRM/support ;
`is_commercial_admin()` (super_admin/platform_admin uniquement, exclut operations_admin) pour
abonnements/paiements/journal d'audit — sans cette distinction en base, `operations_admin`
aurait pu écrire directement sur ces tables via l'API REST malgré l'UI qui masque l'accès.

**Écritures sur `establishments`** (vérifier/suspendre/réactiver/synchronisation `forfait`) :
passent par le client admin (service role) après vérification serveur, car aucune policy RLS
`platform_admin` UPDATE n'existe encore sur cette table (préparée, migration 0007, non
exécutée) — même contournement que `/api/admin/claims/*` (Mission 02).

## Navigation

`/dashboard/admin` (vue d'ensemble) · `/ecoles` · `/verifications` (Mission 02, inchangée) ·
`/crm` · `/abonnements` · `/paiements` · `/support` · `/statistiques` · `/audit` ·
`/administrateurs` — chaque entrée masquée si l'`admin_role` courant n'a pas la permission
correspondante.

## Phases construites

| Phase | Statut |
|---|---|
| 2. Rôles administrateurs | Réel — enum extensible, protection Super Admin, aucun email en dur |
| 3. Dashboard global | Réel — 8 cartes KPI, uniquement des comptages réels |
| 4. Gestion des écoles | Réel — recherche/filtres/tri, vérifier/suspendre/réactiver (aucune suppression physique) |
| 5. CRM commercial | Réel — statut, prochaine relance, responsable, notes + historique automatique des changements de statut |
| 6. Abonnements | Réel — historique commercial séparé du `forfait` technique, sans paiement |
| 7. Paiements | **Architecture uniquement** — table prête (MTN MoMo/Orange Money), page en lecture seule, aucune API connectée |
| 8. Support | Réel — tickets + messages, école et admin, RLS scopée par établissement |
| 9. Journal d'audit | Réel pour les actions déclenchées par ce POC (vérification/suspension/réactivation/changement d'offre/gestion admin). "Connexion" prévue dans le modèle mais jamais émise — nécessiterait un Auth Hook Supabase, hors périmètre |
| 10. Statistiques | Réel — croissance 6 mois, répartition région, répartition `ownership_type` (valeurs affichées telles quelles, aucune normalisation supposée) |
| 11. Sécurité | Vérifiée — voir section Permissions |
| 12. Qualité | Tests manuels documentés ci-dessous |

## Tests (Phase 12)

1. Se connecter avec un compte école ou enseignant → `/dashboard/admin/*` redirige vers son propre dashboard (middleware inchangé).
2. Se connecter en `operations_admin` → les entrées Abonnements/Paiements/Audit/Administrateurs sont absentes de la nav ; tenter `fetch('/api/admin/administrateurs')` → 403 ; tenter un insert direct sur `subscriptions` via le client Supabase → bloqué par RLS (`is_commercial_admin()`).
3. Suspendre puis réactiver un établissement → statut restauré correctement (`active` si `owner_id` existe, sinon `verified`) ; entrée créée dans le journal d'audit.
4. Tenter de retirer le dernier `super_admin` → rejeté par le trigger `protect_last_super_admin`.
5. Ouvrir un ticket côté école, y répondre côté admin → visible des deux côtés ; une autre école ne voit jamais ce ticket (RLS `owner_id`).
6. Responsive : sidebar masquée sous 1024px (comportement hérité de `dashboard/ecole/layout.tsx`) — non retravaillé dans cette mission, limite connue identique au reste du dépôt.

## Limitations V1

- Paiements : architecture seule, aucun fournisseur connecté.
- Journal d'audit : pas d'événement de connexion (pas d'Auth Hook).
- `subscriptions` et `establishments.forfait` restent deux axes distincts, non réconciliés automatiquement (décision produit à trancher séparément).
- Pas de suppression physique nulle part (établissements, administrateurs) — conforme à la consigne, mais signifie qu'un compte mal promu doit être rétrogradé, jamais supprimé.
- Responsive mobile de la sidebar admin non retravaillé (hérité du dashboard école existant).
