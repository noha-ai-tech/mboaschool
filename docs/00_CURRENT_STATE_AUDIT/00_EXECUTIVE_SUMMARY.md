# 00 — Executive Summary

**Branche analysée :** `main`
**Commit analysé :** `045a2d8f78886e821e6150510373849e61f66c7d` (2026-07-24)
**Méthode :** lecture directe du code, des migrations SQL et de la configuration. Aucune donnée de production consultée (pas d'accès au dashboard Supabase depuis cet environnement) — voir `12_GAPS_AND_UNKNOWNS.md` pour tout ce qui reste NON VÉRIFIÉ.

---

## 1. Ce qu'est actuellement le produit

Écoles237 (anciennement MboaSchool — **aucune trace du nom "MboaSchool" trouvée dans le dépôt actuel**, voir `10_RENAME_MBOASCHOOL_TO_ECOLES237.md`) est une application Next.js 15 (App Router) + Supabase. Le code contient réellement :

- Un annuaire public d'établissements avec recherche, filtres, catégories, carrousel, comparaison et une carte interactive (Leaflet).
- Une fiche publique d'établissement avec onglets (Général, Galerie, Documents, Annonces, Espace parent).
- Un flux de création de compte école (inscription → confirmation email → création manuelle d'un établissement).
- Un tableau de bord école (admissions, classes, frais, infrastructures, galerie, documents, annonces, paramètres, paiements).
- Un tableau de bord administrateur plateforme, protégé par rôle.
- Un formulaire de préinscription public (écrit dans la table `applications`, **pas** dans une table `pre_inscriptions` — cette dernière n'existe pas).
- Un module "Pro" substantiel et réellement câblé : emplois du temps, matières, enseignants (comptes + invitations), pointage (mode kiosque avec photo), messagerie interne. Protégé par middleware + vérification du `forfait` de l'établissement.
- Un espace enseignant séparé (`/enseignant/mon-espace`) avec sélection multi-établissement et calcul d'heures travaillées.

Le produit est **beaucoup plus avancé que ce que `CLAUDE_CONTEXT.md` et `README.md` laissent penser** : ces deux documents décrivent un état antérieur du projet (MVP annuaire simple) et n'ont pas été mis à jour depuis l'ajout du module Pro et de plusieurs corrections. Ils doivent être considérés comme **partiellement obsolètes**, pas comme source de vérité.

## 2. Ce qui fonctionne réellement (vérifié dans le code)

- Le middleware (`src/middleware.ts`) protège correctement `/dashboard/admin` par rôle `platform_admin`, protège `/pro/*` par `forfait = 'pro'`, et protège `/dashboard/*` par authentification. **La faille décrite dans `CLAUDE_CONTEXT.md` comme "priorité absolue" semble déjà corrigée dans le code actuel** — voir `04_AUTH_AND_ROLES.md` pour la nuance importante (protection de page ≠ protection des mutations).
- Le build de production (`npm run build`) réussit sans erreur : 37 routes compilées, aucune erreur TypeScript bloquante.
- Le module Pro dispose de policies RLS dédiées et de vérifications serveur cohérentes dans chaque route API (`owner_id = auth.uid()` systématique).

## 3. Ce qui est incomplet ou cassé (vérifié dans le code)

- **Dérive de schéma majeure** : au moins trois tables (`establishments`, `applications`, `school_announcements`) sont utilisées avec des colonnes qui n'existent dans aucun fichier de migration versionné du dépôt (`quartier`, `couleur_primaire`, `couleur_secondaire`, `emoji_logo`, `is_claimed` ajoutées seulement dans `supabase/seed_schools.sql` ; `student_first_name`, `full_student_name`, `desired_level`, `previous_school`, `notes` sur `applications` ; `class_id`, `type`, `is_important` sur `school_announcements` — introuvables partout). Le schéma réel de production ne peut être reconstitué qu'en partie depuis ce dépôt.
- **Revendication de fiche non connectée** : le lien "Revendiquer cette page" (`src/app/page.tsx`) pointe vers `/auth/inscription?ecole=<id>`, mais `auth/inscription/page.tsx` n'utilise jamais ce paramètre. L'utilisateur créé un **nouvel** établissement via l'onboarding, il ne revendique jamais la fiche existante. `is_claimed` est présent en base (via un script de seed) mais n'est jamais modifié par un flux applicatif.
- **Mutation admin potentiellement bloquée par RLS** : `dashboard/admin/ecoles/[id]/page.tsx` met à jour `establishments` via le client anonyme. Or la seule policy `UPDATE` connue sur `establishments` est `owner_id = auth.uid()`. Aucune policy RLS accordant un droit d'écriture au rôle `platform_admin` n'a été trouvée. Cette fonctionnalité risque d'échouer silencieusement en production (NON VÉRIFIABLE sans accès direct à Supabase).
- **Lien de déconnexion mort** : `src/app/enseignant/layout.tsx` poste vers `/auth/signout`, route qui n'existe pas dans le dépôt.
- **Aucun test automatisé** : aucun fichier de test, aucun framework de test configuré, pas de script `npm run test`.
- **Aucune configuration ESLint** : `npm run lint` demande une configuration interactive absente du dépôt — jamais exécuté en CI ni en local de façon reproductible.
- **Paiements en ligne** : `/dashboard/ecole/paiements` est un écran "Prochainement", aucune intégration réelle.
- **Rôle `establishment_admin`** : déclaré dans l'enum PostgreSQL mais jamais assigné par aucun code applicatif — mort.

## 4. Les trois plus grands risques

1. **Sécurité — écriture admin potentiellement non fonctionnelle ou, pire, RLS trop permissive côté écriture** (`06_SECURITY_AUDIT.md`, R-001). Impact : soit l'admin ne peut pas vraiment gérer les écoles, soit une policy manquante/mal scopée existe en prod sans trace dans le dépôt — dans les deux cas, l'équipe travaille à l'aveugle sur cette zone.
2. **Dérive de schéma non versionnée** (`05_DATABASE_CURRENT_STATE.md`). Sans migration traçable pour une bonne partie des colonnes réellement utilisées, toute recréation d'environnement (staging, nouveau développeur, disaster recovery) est impossible à reproduire fidèlement depuis ce dépôt seul.
3. **Flux de revendication de fiche absent alors qu'il est présenté à l'utilisateur comme existant** (`03_FEATURE_STATUS.md`). Cœur du modèle commercial "Autonome" — un bouton visible qui ne fait pas ce qu'il promet est un risque produit et un risque de confiance directe avec les écoles pilotes.

## 5. Les cinq prochaines priorités (constat, pas développement)

1. Clarifier et **rapatrier le schéma réel de Supabase** dans des migrations versionnées (établir un état de référence fiable avant toute nouvelle fonctionnalité).
2. Vérifier en environnement réel si les mutations admin (`dashboard/admin/ecoles/[id]`) fonctionnent ; sinon, définir les policies RLS manquantes.
3. Décider si le flux "Revendiquer une fiche" doit être construit maintenant ou retiré de l'interface tant qu'il n'existe pas (ne pas laisser un bouton qui ne fait rien).
4. Mettre en place une configuration ESLint et un pipeline minimal de vérification (lint + typecheck + build) exécutable en CI.
5. Documenter formellement quelles pages sont protégées par middleware vs. par vérification serveur locale (les deux mécanismes coexistent sans registre unique).

## 6. Niveau de préparation pour une beta

Le produit a une base technique réelle et un module Pro plus avancé que documenté, mais la dérive de schéma non tracée et l'incertitude sur les mutations admin sont bloquantes pour une beta avec de vraies écoles tant qu'elles ne sont pas vérifiées en environnement réel. **Estimation : proche d'une beta technique, pas encore prêt pour une beta avec engagement commercial (paiement, SLA).**

---

## Notation globale : 58 / 100

| Axe | Note | Justification courte |
|---|---|---|
| Produit | 60/100 | Périmètre large et cohérent, mais fonctionnalités clés (revendication, paiement) absentes ou factices |
| Architecture | 62/100 | App Router bien utilisé, séparation client/serveur Supabase correcte, mais deux mécanismes d'autorisation qui se chevauchent sans registre |
| Sécurité | 45/100 | Middleware correct pour la lecture de pages ; zones d'ombre réelles sur les mutations admin et sur les policies RLS non versionnées |
| Qualité du code | 55/100 | Compile sans erreur TypeScript, mais aucun test, aucun lint configuré, dupliqué important entre les formulaires |
| Base de données | 40/100 | Dérive de schéma significative et non documentée entre le code et les migrations versionnées |
| UX | 65/100 | Cohérente visuellement, bons états de chargement/vide, mais boutons qui ne mènent nulle part (revendication, "Documents"/"Galerie" en `#` dans l'admin) |
| Préparation beta | 50/100 | Techniquement proche, mais les inconnues sur les données et les mutations admin doivent être levées avant d'accueillir de vraies écoles |
