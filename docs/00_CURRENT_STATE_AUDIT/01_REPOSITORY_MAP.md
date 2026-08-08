# 01 — Repository Map

## Stack technique confirmée (package.json, tsconfig.json, next.config.js)

| Élément | Valeur constatée | Source |
|---|---|---|
| Framework | Next.js **15.1.6** | `package.json` |
| Routing | App Router (dossier `src/app`, fichiers `page.tsx`/`route.ts`) | arborescence |
| React | 18.3.1 | `package.json` |
| TypeScript | `"latest"` (version résolue non figée), `strict: false`, `target: es5` | `package.json`, `tsconfig.json` |
| CSS | Tailwind CSS 3.4.17 + PostCSS + Autoprefixer | `package.json`, `tailwind.config.ts`, `postcss.config.js` |
| Bibliothèque UI | Aucune (composants faits main), icônes via `lucide-react` 0.468.0 | `package.json` |
| Formulaires | Aucune bibliothèque — `useState` manuel partout | grep sur les pages |
| Validation | Aucune bibliothèque (pas de zod/yup) — validations manuelles inline | grep sur les pages |
| Carte / géolocalisation | `leaflet` 1.9.4 + `@types/leaflet` (ajoutés récemment) | `package.json`, `src/components/LocalSchoolMap.tsx` |
| Authentification | Supabase Auth via `@supabase/ssr` 0.10.3 et `@supabase/supabase-js` (version `"latest"`, non figée) | `package.json` |
| Tests | **Aucun framework, aucun fichier de test applicatif** | recherche `**/*.test.*` (seuls des fichiers dans `node_modules`) |
| Lint | `next lint`, **aucune configuration ESLint présente** (le dépôt ne contient pas de `.eslintrc*`) | `npm run lint` demande une configuration interactive au lancement |
| Scripts npm | `dev`, `build`, `start`, `lint` uniquement — **pas de `typecheck` ni `test`** | `package.json` |
| Déploiement | NON VÉRIFIÉ DANS LE CODE — aucun `vercel.json`, aucun workflow `.github/`, aucune configuration Railway/Netlify trouvée. `CLAUDE_CONTEXT.md` indique "à confirmer" | absence de fichiers |
| Alias d'import | `@/*` → `./src/*` | `tsconfig.json` |
| Images distantes autorisées | `images.unsplash.com` uniquement | `next.config.js` |

## Dépendances à surveiller (npm audit, exécuté sans modification du code)

3 vulnérabilités remontées par `npm audit` (2 high, 1 critical), toutes liées à la version figée de `next@15.1.6` (dont RCE potentiel dans le protocole React Flight, DoS, SSRF via middleware) ainsi qu'à `postcss` et `sharp` en dépendances transitives. Voir `06_SECURITY_AUDIT.md` pour le détail et `09_TECHNICAL_DEBT.md` pour la recommandation.

## Arborescence et rôle des dossiers

```text
mboaschool/
├── .claude/launch.json           # config locale de preview (non applicative)
├── .env.example                  # NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY uniquement
├── .env.local                    # présent localement (non versionné, non lu ici)
├── CLAUDE_CONTEXT.md             # briefing produit — PARTIELLEMENT OBSOLÈTE (voir 12_GAPS_AND_UNKNOWNS.md)
├── README.md                     # description initiale du MVP — décrit un état antérieur du projet
├── next.config.js
├── postcss.config.js
├── tailwind.config.ts
├── tsconfig.json
├── package.json / package-lock.json
├── src/
│   ├── middleware.ts              # UNIQUE point de contrôle d'accès par middleware (dashboard, auth, pro, api pro)
│   ├── app/
│   │   ├── layout.tsx             # layout racine + métadonnées SEO globales
│   │   ├── page.tsx               # page d'accueil : annuaire, hero, carrousel, carte, recherche
│   │   ├── globals.css
│   │   ├── api/                   # routes API serveur (Pro : enseignants, messagerie, pointage, emploi du temps)
│   │   ├── auth/                  # connexion, inscription, callback OAuth/email, accueil enseignant
│   │   ├── categorie/[slug]/      # listing filtré par catégorie
│   │   ├── dashboard/             # /dashboard (redirection), /dashboard/admin, /dashboard/ecole/*
│   │   ├── ecole/[id]/            # fiche publique établissement
│   │   ├── enseignant/            # espace enseignant (hors middleware, protégé page par page)
│   │   ├── preinscription/        # formulaire public de préinscription (écrit dans `applications`)
│   │   └── pro/                   # module Pro (emplois du temps, matières, enseignants, pointage, messagerie)
│   ├── components/
│   │   ├── LocalSchoolMap.tsx     # carte Leaflet réutilisable (accueil)
│   │   ├── ui.tsx                 # composants UI partagés (non détaillé exhaustivement dans cet audit)
│   │   ├── enseignant/            # sélecteur d'établissement (multi-établissement enseignant)
│   │   ├── pro/                   # formulaires du module Pro (matières, invitation, message, nouvel enseignant)
│   │   └── timetable/             # grille d'emploi du temps + bouton de génération
│   ├── lib/
│   │   ├── supabase.ts            # client Supabase navigateur (clé anonyme)
│   │   ├── supabase/server.ts     # client Supabase serveur (cookies, clé anonyme)
│   │   ├── supabase/admin.ts      # client Supabase **service role** — usage serveur uniquement (invitations, liaison enseignant)
│   │   ├── useSchool.ts           # hook client : établissement + utilisateur courant (dashboard école)
│   │   └── timetable/             # génération de grille d'emploi du temps (algorithme + types)
│   └── types/css.d.ts
└── supabase/
    ├── schema.sql                 # schéma de base initial (incomplet par rapport au code actuel — voir 05)
    ├── migrations/
    │   ├── auth-setup.sql          # policies auth, table classes, school_announcements, school_images/documents, grants
    │   ├── 0001_timetable_schema.sql
    │   ├── 0002_presence.sql
    │   ├── 0003_comptes_enseignants.sql
    │   ├── 0004_messagerie.sql
    │   └── 0005_forfait_multi_etab.sql
    ├── seed_schools.sql            # AJOUTE des colonnes (quartier, couleur_primaire, couleur_secondaire, emoji_logo, is_claimed) + 40 écoles de test
    └── seed_presence.sql           # données de test pour le pointage
```

## Remarque méthodologique importante

Les fichiers `supabase/migrations/*.sql` ne constituent **pas** un historique complet et chronologique du schéma réel. Au moins un fichier de seed (`seed_schools.sql`) contient des `ALTER TABLE` qui ajoutent des colonnes utilisées massivement dans le code (`quartier`, `couleur_primaire`, `couleur_secondaire`, `emoji_logo`, `is_claimed`). D'autres colonnes utilisées par le code (sur `applications` et `school_announcements`) n'apparaissent dans **aucun** fichier SQL du dépôt. Voir `05_DATABASE_CURRENT_STATE.md` pour le détail complet, table par table.
