# 04 — Sécurité (Phase 11)

Vérification : école → dashboard → données. Aucune fuite.

## Principe hérité, non modifié

Toutes les nouvelles pages (`etablissement`, `centre-documentaire`, `statistiques`, `support`) résolvent
l'établissement via **le même** `useSchool()` (`establishments.owner_id = auth.uid()`) déjà utilisé par toutes
les pages existantes du dashboard école. Aucune nouvelle page n'introduit d'ID d'établissement dans une URL ou
un paramètre de requête — le principe déjà vérifié dans l'audit de sécurité précédent ("pas de risque de fuite
par manipulation d'URL") reste intact.

## Nouvelles requêtes ajoutées — vérification une par une

| Page | Nouvelle requête | Filtrée par |
|---|---|---|
| `dashboard/ecole/page.tsx` | `establishments` (logo/description), `fees`, `infrastructures`, `school_images` count, `school_announcements` (dernière) | Toutes `.eq("establishment_id"/"id", school.id)` où `school.id` provient de `useSchool()`, jamais d'une source externe |
| `centre-documentaire/page.tsx` | `school_documents` count, `school_images` count, `establishments.logo_url` | Idem |
| `statistiques/page.tsx` | `applications` (dates) | Idem |
| `NotificationBell.tsx` | `applications` count (pending) | Reçoit `schoolId` en prop depuis `layout.tsx` (résolu par `useSchool()`), jamais depuis l'URL |

Aucune de ces requêtes ne lit ni n'écrit une donnée d'un autre établissement — chacune est bornée par l'ID de
l'établissement de l'utilisateur connecté, résolu côté serveur par RLS (`owner_id = auth.uid()` sur
`establishments`, et les policies déjà existantes sur `fees`/`infrastructures`/`school_images`/
`school_documents`/`school_announcements`/`applications` — toutes scopées par `establishment_id` via
`exists (select 1 from establishments e where e.id = establishment_id and e.owner_id = auth.uid())`, inchangées
par cette mission).

## RLS — aucune nouvelle table, aucune nouvelle policy nécessaire

Cette mission ne crée aucune nouvelle table ni colonne. Toutes les données affichées proviennent de tables et de
policies RLS déjà existantes et déjà auditées (`docs/00_CURRENT_STATE_AUDIT/`, `docs/04_SUPABASE_PROD_READINESS/`).
**Aucune migration n'a été créée pour cette mission** — cohérent avec la consigne "ne jamais exécuter de
migration" et le fait qu'aucune nouvelle donnée n'était nécessaire.

## Module Pro — accès inchangé

Les liens Enseignants/Emplois du temps/Présences pointent vers des routes déjà protégées par le middleware
(`/pro/:path*`, vérification `forfait = 'pro'`). Cette mission ajoute uniquement un lien visuel conditionnel
(`isPro ? "/pro/..." : "/pro/acces-restreint"`) — **aucun contournement du middleware** : même en modifiant le
DOM pour forcer l'affichage du lien "actif", la navigation réelle resterait bloquée côté serveur par le
middleware existant, inchangé.

## Notifications — pas de nouvelle surface d'attaque

`NotificationBell` ne fait qu'une lecture (`select ... count`), aucune écriture. Le composant ne peut pas être
détourné pour modifier une donnée.

## Résumé

| Vérification (Phase 11) | Statut |
|---|---|
| École A ne peut pas voir les données de B via les nouveaux widgets | Confirmé — toutes les requêtes sont bornées par `owner_id = auth.uid()`, RLS inchangée |
| Aucune fuite via URL/paramètre | Confirmé — aucun ID d'établissement dans une URL de cette mission |
| Aucun contournement du module Pro | Confirmé — middleware inchangé, seul un lien conditionnel ajouté |
