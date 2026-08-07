# Checklist de déploiement Vercel — Écoles237

Document produit dans le cadre de la mission "Préparer Écoles237 pour un premier déploiement Vercel"
(branche `chore/vercel-readiness`, commit de départ `045a2d8f78886e821e6150510373849e61f66c7d`).

**Ce document ne déclenche aucun déploiement.** Il liste ce qui doit être vrai avant qu'Eddy (ou la personne
qui a accès au compte Vercel/Supabase) déclenche le premier déploiement contrôlé.

---

## A. Prérequis

- [x] `npm run build` réussit localement (0 erreur, 37 routes compilées)
- [x] `npx tsc --noEmit` ne remonte aucune erreur
- [x] `.env.example` documente toutes les variables réellement utilisées par le code
- [ ] Un projet Vercel existe et est relié au dépôt GitHub d'Écoles237 (NON VÉRIFIABLE depuis ce dépôt — aucune configuration de plateforme trouvée, voir `docs/00_CURRENT_STATE_AUDIT/12_GAPS_AND_UNKNOWNS.md`)
- [ ] Le projet Supabase de production existe et son URL/clés sont disponibles
- [ ] Eddy a confirmé l'environnement Supabase cible (un seul projet a été trouvé référencé dans le dépôt — confirmer qu'il s'agit bien de celui à utiliser pour ce déploiement)

## B. Variables Vercel

À renseigner dans Vercel → Project Settings → Environment Variables, pour l'environnement **Production** (et Preview si souhaité) :

| Variable | Portée | Source de la valeur |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Public (build + runtime) | Dashboard Supabase → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public (build + runtime) | Dashboard Supabase → Project Settings → API (clé `anon`/`public`) |
| `SUPABASE_SERVICE_ROLE_KEY` | **Serveur uniquement** | Dashboard Supabase → Project Settings → API (clé `service_role`) — **ne jamais préfixer par `NEXT_PUBLIC_`** |
| `NEXT_PUBLIC_SITE_URL` | Public (build + runtime) | URL Vercel finale (ex. `https://ecoles237.vercel.app` ou le domaine personnalisé une fois configuré) |

Toutes les variables réellement lues par le code sont listées ci-dessus (confirmé par recherche exhaustive de `process.env.` dans `src/`, cf. Étape 2 de l'audit Vercel-readiness) — aucune autre variable n'est nécessaire.

## C. Configuration Supabase Auth

À vérifier/configurer directement dans le dashboard Supabase (**aucune migration exécutée dans cette mission**) :

- Site URL (Authentication → URL Configuration) doit correspondre à l'URL Vercel de production
- Les emails de confirmation (`signUp`) et d'invitation (`inviteUserByEmail`, utilisé par `/api/enseignants/[id]/inviter`) utilisent la configuration SMTP par défaut de Supabase — vérifier les quotas d'envoi si le volume de préinscriptions/invitations grandit
- Confirmer comment le rôle `platform_admin` est assigné à au moins un compte (aucun flux applicatif ne le fait — voir `docs/00_CURRENT_STATE_AUDIT/04_AUTH_AND_ROLES.md` §3) — à faire manuellement dans Supabase avant le premier déploiement si ce n'est pas déjà fait

## D. URL du site

- `NEXT_PUBLIC_SITE_URL` doit être l'URL Vercel réelle (ou le domaine personnalisé), sans slash final
- Cette variable n'est utilisée qu'en secours (`src/app/api/enseignants/[id]/inviter/route.ts:61`) — le code utilise en priorité l'en-tête `origin` de la requête entrante, donc une valeur correcte de cette variable n'est critique que pour les invitations enseignant déclenchées par un job serveur sans en-tête `origin` (cas non observé dans le code actuel)

## E. Redirect URLs

Dans Supabase → Authentication → URL Configuration → Redirect URLs, ajouter :

```
https://<domaine-vercel-ou-personnalise>/auth/callback
```

C'est la seule route de callback trouvée dans le code (`src/app/auth/callback/route.ts`). Sans cette entrée, `signUp`, la confirmation d'email et les invitations enseignant échoueront après clic sur le lien reçu par email.

## F. Configuration Storage

**NON VÉRIFIABLE depuis ce dépôt** — voir `docs/00_CURRENT_STATE_AUDIT/05_DATABASE_CURRENT_STATE.md` §5 :

| Bucket | Statut dans le dépôt |
|---|---|
| `pointages-photos` | Créé et versionné en SQL (`supabase/migrations/0002_presence.sql`), policy `pointages_owner_access` confirmée |
| `school-images` | Documenté uniquement en commentaire dans `auth-setup.sql` comme "à créer via le dashboard" — **à confirmer manuellement avant déploiement** |
| `school-documents` | Idem — **à confirmer manuellement avant déploiement** |

Avant le premier déploiement contrôlé, vérifier dans le dashboard Supabase que ces trois buckets existent bien et que leurs policies correspondent à l'usage attendu (lecture publique pour `school-images`/`school-documents`, accès restreint par établissement pour `pointages-photos`). Si `school-images`/`school-documents` n'existent pas, la galerie et les documents des écoles ne fonctionneront pas malgré un build réussi.

## G. Domaine personnalisé

Aucune configuration de domaine trouvée dans le dépôt (pas de `vercel.json`, pas de domaine codé en dur en dehors du fallback `localhost:3000`). Le premier déploiement peut se faire sur le sous-domaine `*.vercel.app` fourni par défaut ; le branchement d'un domaine personnalisé (`ecoles237.cm` ou équivalent) est une étape Vercel standard indépendante du code, à faire quand le domaine est prêt. Ne pas oublier de mettre à jour `NEXT_PUBLIC_SITE_URL` et la Redirect URL Supabase (section E) si le domaine change après le premier déploiement.

## H. Build command

```
npm run build
```

(`next build`, confirmé fonctionnel en local — voir Étape 1). Aucune commande personnalisée nécessaire ; c'est la détection automatique par défaut de Vercel pour un projet Next.js.

## I. Output

Framework Next.js standard (App Router) — Vercel détecte automatiquement le répertoire `.next` et le mode de sortie (pas de `output: 'export'` ni `output: 'standalone'` dans `next.config.js`, donc déploiement serveur classique avec Route Handlers et Middleware supportés nativement par Vercel).

## J. Tests après déploiement

Voir `docs/02_DEPLOYMENT/PRODUCTION_SMOKE_TEST.md` pour la checklist manuelle complète à exécuter juste après le premier déploiement.

## K. Procédure de rollback

Vercel conserve chaque déploiement précédent comme immuable :

1. Dashboard Vercel → Project → Deployments
2. Repérer le dernier déploiement stable précédent
3. Menu "…" → **Promote to Production** (ou "Instant Rollback" selon le plan Vercel)
4. Aucune action Supabase n'est nécessaire pour un rollback applicatif pur, **à condition qu'aucune migration Supabase n'ait été exécutée entre les deux déploiements** — ce point doit être vérifié manuellement avant tout rollback, car ce dépôt ne garantit pas la réversibilité d'une migration de schéma (voir section L)

## L. Points Supabase encore non vérifiés

Repris de `docs/00_CURRENT_STATE_AUDIT/12_GAPS_AND_UNKNOWNS.md` et de l'audit de sécurité Vercel-readiness (Étape 4) — **rien ici n'a été corrigé ni migré dans cette mission** :

| Point | Constat | Classement |
|---|---|---|
| Isolation des données par établissement | Code cohérent (`owner_id`, `current_establishment_id()`), RLS réelle en production non vérifiable depuis le dépôt | BLOQUANT BETA RÉELLE |
| Mutation admin sur `establishments` | Seule policy `UPDATE` connue : `owner_id = auth.uid()` — ne couvre pas `platform_admin`. Le formulaire admin (`dashboard/admin/ecoles/[id]`) peut échouer silencieusement en production | BLOQUANT BETA RÉELLE |
| Policies Storage `school-images` / `school-documents` | Non versionnées, décrites seulement en commentaire | BLOQUANT BETA RÉELLE |
| Préinscription publique sans limite de fréquence | `applications`, policy `with check (true)`, aucun rate-limit | BLOQUANT BETA RÉELLE |
| Dérive de schéma non versionnée | `establishments`, `applications`, `school_announcements` utilisent des colonnes absentes des migrations versionnées | BLOQUANT BETA RÉELLE (préalable à toute migration future) |
| Assignation du rôle `platform_admin` | Aucun flux applicatif ne l'assigne — probablement fait manuellement dans Supabase | À confirmer avant le premier déploiement (section C) |

**Aucune migration ne doit être exécutée à partir de ce document sans validation explicite d'Eddy.** Chaque point ci-dessus nécessite une décision produit ou une policy RLS à écrire et valider séparément.

## M. Modes de paiement — année 1

Confirmé par le fondateur pour le lancement :

- **MTN Mobile Money**
- **Orange Money**
- **Aucune autre méthode prévue pour le lancement** — pas de carte bancaire (Visa/Mastercard), pas de virement bancaire

**Aucune intégration de paiement n'a été construite dans cette mission**, conformément à la consigne. Le dépôt ne contient à ce jour aucune intégration technique de paiement (`docs/00_CURRENT_STATE_AUDIT/11_ARCHITECTURE_AS_IS.md` §6) : l'écran `/dashboard/ecole/paiements` reste un placeholder "Prochainement". Pour la première année, le modèle reste donc : l'école encaisse elle-même via MTN MoMo/Orange Money par ses propres moyens (hors plateforme) et marque manuellement la pré-inscription/candidature comme payée — cohérent avec le modèle "Offre 1 — Autonome" documenté dans `CLAUDE_CONTEXT.md`.
