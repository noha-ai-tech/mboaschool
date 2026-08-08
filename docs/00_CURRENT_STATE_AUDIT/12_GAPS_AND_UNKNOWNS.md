# 12 — Gaps and Unknowns

Liste exhaustive de ce qui ne peut pas être confirmé depuis ce dépôt seul, à vérifier directement auprès du fondateur, du développeur sprint (Helon), ou par accès direct au dashboard Supabase.

## Base de données

- **Schéma réel de production** : le schéma reconstitué dans `05_DATABASE_CURRENT_STATE.md` combine trois sources incohérentes entre elles. Le schéma réellement actif en base ne peut être confirmé qu'en exportant directement depuis Supabase.
- **Policies RLS réellement actives** : seules les policies définies dans les fichiers SQL de ce dépôt sont documentées. Toute policy créée directement via l'éditeur SQL Supabase (pratique explicitement recommandée par `CLAUDE_CONTEXT.md`) est invisible ici — en particulier, l'existence ou non d'une policy `UPDATE` pour `platform_admin` sur `establishments` (voir R-001).
- **Configuration réelle des buckets `school-images` et `school-documents`** : décrite uniquement en commentaire dans `auth-setup.sql` comme "à créer via le dashboard" — jamais confirmée comme faite.
- **Présence de vraies données en production vs. données de seed** : `CLAUDE_CONTEXT.md` affirme "il n'y a pas encore de vraies écoles en production" ; `seed_schools.sql` contient 40 fiches marquées "données réelles ou très plausibles — À VÉRIFIER". L'état réel des données en production au moment de cet audit n'est pas vérifiable depuis le code.
- **Table `payments`** : existe dans `schema.sql` mais aucune requête ne la référence dans le code. Impossible de savoir si elle est un vestige ou une préparation pour un développement futur déjà planifié ailleurs.

## Authentification et rôles

- **Comment un compte obtient le rôle `platform_admin`** : aucun flux applicatif ne l'assigne. Vraisemblablement fait manuellement dans le dashboard Supabase — à confirmer.
- **Statut réel du rôle `establishment_admin`** : déclaré dans l'enum, jamais utilisé. NON VÉRIFIÉ s'il a été utilisé par le passé (avant un refactoring vers `owner_id`) ou s'il a toujours été mort.

## Fonctionnalités

- **Devenir de l'offre "Gérée"** : aucune logique de code (accès délégué à l'équipe Écoles237, journal des modifications) trouvée. NON VÉRIFIÉ si elle est en cours de conception ailleurs (Figma, document produit non versionné) ou simplement pas commencée.
- **Sections et responsables de section** (module Pro Phase 4 mentionné dans `CLAUDE_CONTEXT.md`) : absentes du code et des migrations. Statut de la roadmap NON VÉRIFIÉ.
- **Table `pre_inscriptions` avec code de suivi public** : documentée comme prévue, jamais implémentée (le flux réel utilise `applications`). NON VÉRIFIÉ si cette table a été abandonnée intentionnellement au profit de `applications`, ou si elle reste un objectif non réalisé.
- **Paiement Mobile Money (Orange Money / MTN MoMo via CinetPay)** : mentionné comme prochain dans l'UI (`dashboard/ecole/paiements`) et dans `CLAUDE_CONTEXT.md`. Aucune intégration technique, aucune clé d'environnement documentée pour un fournisseur de paiement. Statut d'avancement réel NON VÉRIFIABLE depuis ce dépôt.

## Déploiement et infrastructure

- **Plateforme d'hébergement réelle** : `CLAUDE_CONTEXT.md` indique "à confirmer (Railway / Netlify / Vercel)". Aucune configuration de déploiement (`vercel.json`, `railway.json`, workflow CI/CD) trouvée dans le dépôt. NON VÉRIFIÉ si l'application tourne déjà quelque part en dehors de l'environnement de développement local.
- **Nom de domaine réel** : aucun domaine codé en dur dans le code (seul un fallback `localhost:3000` existe). NON VÉRIFIÉ.
- **Stratégie de sauvegarde de la base Postgres** : NON VÉRIFIABLE depuis ce dépôt (dépend de la configuration du projet Supabase).
- **Monitoring/observabilité** : aucun SDK de suivi d'erreurs ou de performance (Sentry, Datadog, etc.) trouvé dans les dépendances. NON VÉRIFIÉ si un tel outil est configuré en dehors du code (ex. au niveau infra).

## Organisation et process

- **Qui a écrit quel fichier et quand** : cet audit n'a pas exploité l'historique Git (hors périmètre demandé — lecture de l'état actuel uniquement). L'attribution des choix techniques (ex. pourquoi `forfait` plutôt que `plan_type`) n'est donc pas documentée ici.
- **Existence d'une documentation produit plus récente que `CLAUDE_CONTEXT.md`** : ce fichier date visiblement d'avant le module Pro (il ne le mentionne que comme roadmap "Offre 3"). NON VÉRIFIÉ s'il existe un document plus à jour ailleurs (Notion, Google Docs) que cet audit n'a pas pu consulter.

## Qualité et sécurité

- **Conséquence réelle de l'absence de policy RLS admin** (R-001) : NON VÉRIFIABLE sans exécuter la mutation en environnement réel — l'audit ne peut confirmer que l'incohérence de code, pas son effet observable en production.
- **Comportement réel du bucket `pointages-photos` et des autres buckets en production** (tailles, rétention, coûts) : NON VÉRIFIABLE depuis le code.
- **Résultat d'un vrai `next lint`** avec une configuration ESLint définie : non obtenu dans cet audit puisque aucune configuration n'existe et qu'en créer une sortait du périmètre ("ne modifier aucun fichier applicatif").
