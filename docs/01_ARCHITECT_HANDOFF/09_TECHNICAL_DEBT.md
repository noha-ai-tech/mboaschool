# 09 — Technical Debt Register

Classement par gravité : `CRITIQUE` / `ÉLEVÉ` / `MOYEN` / `FAIBLE`. Chaque entrée précise la catégorie (sécurité, données, architecture, qualité, produit, UX, déploiement, maintenance, évolutivité).

---

### TD-001 — Dérive de schéma Supabase non versionnée
- **Catégorie** : Données, maintenance
- **Gravité** : CRITIQUE
- **Description** : Au moins 3 tables (`establishments`, `applications`, `school_announcements`) utilisent en production des colonnes absentes de `supabase/schema.sql` et de `supabase/migrations/*`. Certaines proviennent d'un script de seed (`seed_schools.sql`), d'autres n'ont aucune trace du tout.
- **Preuve** : `05_DATABASE_CURRENT_STATE.md`, comparaison colonne par colonne
- **Fichiers concernés** : `supabase/schema.sql`, `supabase/seed_schools.sql`, `src/app/preinscription/page.tsx`, `src/app/dashboard/ecole/admissions/page.tsx`, `src/app/dashboard/ecole/classes/[id]/page.tsx`
- **Impact** : Impossible de recréer un environnement fidèle ; toute revue de sécurité ou de policy RLS reste incomplète
- **Probabilité que ça cause un incident** : Élevée dès la première tentative de recréation d'environnement (staging, nouveau développeur)
- **Recommandation** : Exporter le schéma réel (`supabase db dump` ou équivalent) et le réconcilier avec les migrations versionnées avant toute nouvelle fonctionnalité de base de données
- **Dépendances** : Bloque une reconstruction fiable de l'environnement ; bloque une revue RLS complète (TD-002)
- **Urgence** : Avant toute nouvelle fonctionnalité touchant `establishments`, `applications` ou `school_announcements`

---

### TD-002 — Policy RLS `UPDATE` manquante (ou non versionnée) pour `platform_admin` sur `establishments`
- **Catégorie** : Sécurité, architecture
- **Gravité** : ÉLEVÉ
- **Description** : Voir `06_SECURITY_AUDIT.md` R-001. La seule policy `UPDATE` connue restreint l'écriture à `owner_id = auth.uid()`, ce qui ne couvre pas le cas d'un administrateur plateforme éditant une école qu'il ne possède pas.
- **Fichiers concernés** : `src/app/dashboard/admin/ecoles/[id]/page.tsx`, `supabase/schema.sql`
- **Impact** : Fonctionnalité admin potentiellement non opérationnelle en silence, ou policy non tracée trop permissive
- **Recommandation** : Vérifier en environnement réel ; migrer les mutations admin sensibles vers une route serveur avec `createAdminClient()`
- **Dépendances** : TD-001 (le schéma réel doit être connu pour statuer définitivement)
- **Urgence** : Avant d'inviter de vraies écoles à utiliser le produit

---

### TD-003 — Flux de revendication de fiche absent malgré une UI qui le promet
- **Catégorie** : Produit, UX
- **Gravité** : ÉLEVÉ
- **Description** : Voir `03_FEATURE_STATUS.md` et `08_UX_UI_AUDIT.md`. Le paramètre `?ecole=` transmis par le lien "Revendiquer cette page" n'est jamais lu par `auth/inscription/page.tsx`.
- **Fichiers concernés** : `src/app/page.tsx`, `src/app/auth/inscription/page.tsx`, `src/app/dashboard/ecole/onboarding/page.tsx`
- **Impact** : Risque de duplication de fiches, confusion et perte de confiance des écoles pilotes
- **Recommandation** : Soit masquer le bouton tant que le flux n'existe pas, soit le construire avant la beta
- **Urgence** : Avant toute communication publique du bouton à de vraies écoles

---

### TD-004 — Dépendances avec vulnérabilités connues (Next.js notamment)
- **Catégorie** : Sécurité, déploiement
- **Gravité** : ÉLEVÉ
- **Description** : `next@15.1.6` figé, concerné par de multiples avis de sécurité incluant un contournement d'autorisation dans le middleware — composant central de tout le contrôle d'accès de ce projet
- **Preuve** : `npm audit` (voir `06_SECURITY_AUDIT.md` R-004)
- **Recommandation** : Planifier une mise à jour testée de Next.js
- **Urgence** : Avant mise en production publique

---

### TD-005 — Aucune configuration ESLint, aucun test automatisé
- **Catégorie** : Qualité, maintenance
- **Gravité** : MOYEN
- **Description** : `npm run lint` ne peut pas s'exécuter sans configuration interactive ; aucun fichier de test ni framework configuré
- **Preuve** : `07_CODE_QUALITY.md`
- **Recommandation** : Ajouter une configuration ESLint non interactive (`eslint.config.js` ou `.eslintrc.json`) et un minimum de tests sur les flux critiques (auth, préinscription, mutations admin)
- **Urgence** : Avant beta, pour donner un filet de sécurité minimal aux futures modifications

---

### TD-006 — Duplication du composant `Logo` dans 8 fichiers
- **Catégorie** : Qualité, maintenance
- **Gravité** : FAIBLE
- **Description** : Le même balisage (bandeau vert/rouge/jaune + icône) est redéfini indépendamment dans `page.tsx`, `auth/connexion`, `auth/inscription`, `dashboard/admin/page.tsx`, `dashboard/ecole/layout.tsx`, `pro/layout.tsx`, `pro/acces-restreint/page.tsx`, `enseignant/layout.tsx`
- **Impact** : Toute évolution de la marque nécessite 8 modifications identiques et sujettes à divergence
- **Recommandation** : Extraire un composant partagé `src/components/Logo.tsx`
- **Urgence** : Non bloquant — à faire lors d'une prochaine évolution de la marque

---

### TD-007 — Duplication de la logique d'upload (galerie / documents)
- **Catégorie** : Qualité
- **Gravité** : FAIBLE
- **Description** : `dashboard/ecole/galerie/page.tsx` et `dashboard/ecole/documents/page.tsx` réimplémentent la même séquence (validation taille fichier → upload Storage → insert en base → reload) avec des variations mineures
- **Recommandation** : Extraire un hook partagé `useFileUpload(bucket, table)`
- **Urgence** : Non bloquant

---

### TD-008 — Typage `any` généralisé sur les données Supabase
- **Catégorie** : Qualité, évolutivité
- **Gravité** : MOYEN
- **Description** : 19 occurrences de `: any`, aucun type généré depuis le schéma Supabase (`supabase gen types typescript` non utilisé)
- **Preuve** : `07_CODE_QUALITY.md`
- **Recommandation** : Générer et committer les types Supabase, remplacer progressivement les `any`
- **Urgence** : Avant que l'équipe grandisse (facilite l'onboarding et évite les régressions silencieuses)

---

### TD-009 — Deux mécanismes de protection de route coexistent sans registre unique
- **Catégorie** : Architecture
- **Gravité** : MOYEN
- **Description** : Middleware pour `/dashboard`, `/auth`, `/pro`, certaines API ; vérification de page pour `/enseignant/*` et redondamment pour plusieurs routes Pro
- **Preuve** : `04_AUTH_AND_ROLES.md` §4
- **Recommandation** : Documenter explicitement (et si possible unifier) la stratégie de protection par route
- **Urgence** : Avant d'ajouter de nouvelles routes protégées

---

### TD-010 — Lien de déconnexion enseignant cassé
- **Catégorie** : Qualité, UX
- **Gravité** : FAIBLE
- **Description** : `<form action="/auth/signout">` sans route correspondante
- **Fichiers concernés** : `src/app/enseignant/layout.tsx`
- **Recommandation** : Remplacer par `supabase.auth.signOut()` côté client, cohérent avec le reste du produit
- **Urgence** : Rapide à corriger, à faire dès que possible

---

### TD-011 — Rôle `establishment_admin` mort dans l'enum PostgreSQL
- **Catégorie** : Données, maintenance
- **Gravité** : FAIBLE
- **Description** : Déclaré mais jamais assigné par aucun code applicatif
- **Recommandation** : Documenter son statut ("réservé, non utilisé") ou le retirer si une migration de nettoyage est un jour faite
- **Urgence** : Non bloquant

---

### TD-012 — Fichiers avec encodage de caractères corrompu
- **Catégorie** : Qualité
- **Gravité** : FAIBLE
- **Description** : `src/app/api/timetable/generate/route.ts` et `supabase/migrations/0001_timetable_schema.sql` contiennent des caractères accentués mal encodés, visibles notamment dans un message d'erreur retourné à l'utilisateur
- **Recommandation** : Ré-enregistrer ces fichiers en UTF-8 propre
- **Urgence** : Faible, mais rapide à corriger

---

### TD-013 — Concepts de plan commercial divergents entre documentation et code
- **Catégorie** : Produit, maintenance
- **Gravité** : MOYEN
- **Description** : `CLAUDE_CONTEXT.md` documente `plan_type`/`module_pro_actif` ; le code implémente `establishments.forfait`. Les deux ne sont pas synonymes dans le détail (valeurs `gratuit/gere/pro` vs. `autonome/gere/pro` documenté)
- **Recommandation** : Choisir une seule source de vérité et aligner la documentation produit dessus
- **Urgence** : Avant toute décision d'architecture sur le module de facturation
