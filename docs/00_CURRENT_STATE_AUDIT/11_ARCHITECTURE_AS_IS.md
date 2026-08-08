# 11 — Architecture As-Is

Ce document décrit exclusivement l'architecture telle qu'observable dans le code au commit audité. Aucune recommandation d'architecture cible ici — voir `13_RECOMMENDED_NEXT_STEPS.md` pour les priorités, la conception de la cible relevant de l'architecte produit/logiciel.

## 1. Diagramme de contexte

```mermaid
flowchart LR
    Parent["Parent / visiteur\n(navigateur)"]
    Ecole["Établissement\n(propriétaire connecté)"]
    Enseignant["Enseignant\n(compte lié)"]
    Admin["Administrateur plateforme"]

    App["Écoles237\n(Next.js 15, App Router)"]
    Supabase["Supabase\n(Postgres + Auth + Storage)"]
    OSM["OpenStreetMap\n(tuiles cartographiques publiques)"]
    Unsplash["images.unsplash.com\n(images de démonstration)"]

    Parent -->|HTTPS| App
    Ecole -->|HTTPS| App
    Enseignant -->|HTTPS| App
    Admin -->|HTTPS| App

    App -->|clé anonyme + cookies de session| Supabase
    App -->|clé service role, serveur uniquement| Supabase
    App -->|tuiles cartographiques| OSM
    App -->|images distantes autorisées| Unsplash
```

## 2. Diagramme des conteneurs

```mermaid
flowchart TB
    subgraph Client["Navigateur"]
        RSC["Composants client (use client)\nformulaires, dashboard, carte Leaflet"]
    end

    subgraph Server["Serveur Next.js (App Router)"]
        MW["Middleware\n(src/middleware.ts)\nauth + rôle + forfait"]
        SC["Server Components\n(pages async, layouts)"]
        API["Route Handlers\n/api/enseignants/*\n/api/messagerie/*\n/api/pointage/*\n/api/timetable/*"]
    end

    subgraph SupabaseProject["Projet Supabase"]
        Auth["Auth\n(utilisateurs, sessions, triggers)"]
        DB["Postgres\n(RLS activé par table)"]
        Storage["Storage\n(school-images, school-documents, pointages-photos)"]
    end

    RSC -->|"lib/supabase.ts\n(clé anon)"| Auth
    RSC -->|"lib/supabase.ts\n(clé anon, RLS appliqué)"| DB
    RSC -->|upload direct| Storage

    SC -->|"lib/supabase/server.ts\n(clé anon, cookies)"| Auth
    SC -->|"lib/supabase/server.ts"| DB

    API -->|"lib/supabase/server.ts"| Auth
    API -->|"lib/supabase/server.ts"| DB
    API -->|"lib/supabase/admin.ts\n(clé service role — contourne RLS)"| Auth
    API -->|upload| Storage

    MW -->|"vérifie profiles.role /\nestablishments.forfait"| DB
    Client -->|requêtes| MW
    MW --> SC
    MW --> API
```

## 3. Flux d'authentification (tel qu'implémenté)

```mermaid
sequenceDiagram
    participant U as Utilisateur
    participant MW as Middleware
    participant Auth as Supabase Auth
    participant CB as /auth/callback
    participant DB as Postgres (profiles)

    U->>Auth: signUp() ou signInWithPassword()
    Auth-->>U: email de confirmation (signUp) ou session directe (connexion)
    U->>CB: clic sur le lien de confirmation (code)
    CB->>Auth: exchangeCodeForSession(code)
    Auth-->>CB: session posée (cookies)
    CB->>DB: select role from profiles where id = user.id
    DB-->>CB: role
    alt role = platform_admin
        CB-->>U: redirect /dashboard/admin
    else role = teacher
        CB-->>U: redirect /auth/enseignant-bienvenue
    else autre
        CB-->>U: redirect /dashboard/ecole
    end

    Note over MW: À chaque requête suivante vers /dashboard, /pro, /auth
    U->>MW: GET /dashboard/admin
    MW->>Auth: getUser() (via cookies)
    Auth-->>MW: user ou null
    MW->>DB: select role from profiles (si /dashboard/admin)
    DB-->>MW: role
    alt non authentifié
        MW-->>U: redirect /auth/connexion
    else authentifié mais role != platform_admin
        MW-->>U: redirect /dashboard/ecole
    else autorisé
        MW-->>U: laisse passer vers la page
    end
```

## 4. Flux de données principal — annuaire public

```mermaid
sequenceDiagram
    participant U as Visiteur
    participant Page as src/app/page.tsx (Client Component)
    participant SB as Supabase (clé anonyme, RLS)

    U->>Page: charge la page d'accueil
    Page->>SB: select establishments + fees + infrastructures + school_images (RLS: lecture publique)
    SB-->>Page: liste des établissements
    Page->>Page: filtrage client (catégorie, ville, recherche texte, rayon géographique)
    Page-->>U: rendu de la grille + carte Leaflet
    U->>Page: active la géolocalisation navigateur
    Page->>Page: navigator.geolocation.getCurrentPosition()
    Page->>Page: calcul de distance (haversine) en JS pur, aucun appel serveur
```

## 5. Intégration Supabase — vue d'ensemble

| Aspect | Constat |
|---|---|
| Clients utilisés | 3 (navigateur anon, serveur anon via cookies, serveur admin via service role) — voir `04_AUTH_AND_ROLES.md` §1 |
| RLS | Activé sur toutes les tables identifiées ; c'est le **seul** rempart pour les mutations côté client — voir la réserve importante sur `establishments` (`06_SECURITY_AUDIT.md` R-001) |
| Fonctions RPC | `current_establishment_id()` (résolution centrale de l'établissement courant, `security definer`), `calculer_heures_enseignant()` (calcul d'heures travaillées, plusieurs versions successives selon les migrations) |
| Triggers | `handle_new_user` sur `auth.users` (création automatique du profil, gère le rôle `teacher` depuis les métadonnées d'invitation) |
| Storage | 3 buckets identifiés (`pointages-photos` privé et versionné en SQL ; `school-images`/`school-documents` documentés seulement en commentaire, configuration réelle non vérifiable depuis ce dépôt) |
| Génération de types | Non utilisée — aucun fichier de types Supabase généré, d'où le recours généralisé à `any` (voir `07_CODE_QUALITY.md`) |

## 6. Services externes

| Service | Usage | Clé/config requise |
|---|---|---|
| Supabase | Base de données, authentification, stockage de fichiers | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (non documentée dans `.env.example`, voir R-003) |
| OpenStreetMap (tuiles) | Fond de carte pour la géolocalisation | Aucune clé — service public, sans SLA contractuel |
| images.unsplash.com | Images de démonstration/hero (pas les photos réelles des écoles, qui passent par Supabase Storage) | Autorisé explicitement dans `next.config.js` (`images.remotePatterns`) |
| Aucun fournisseur de paiement intégré | `CLAUDE_CONTEXT.md` mentionne Orange Money/MTN MoMo via CinetPay comme cible — **aucune trace dans le code actuel** | — |
| Aucun service d'email transactionnel personnalisé | Les emails passent par la configuration par défaut de Supabase Auth (confirmation, invitation) | — |

## 7. Ce que cette architecture ne montre PAS (hors périmètre du code)

- Configuration réelle des buckets Storage dans le dashboard Supabase
- Politique de sauvegarde/rétention de la base Postgres
- Environnement de déploiement réel (aucune configuration de plateforme trouvée dans le dépôt)
- Toute surveillance, alerting ou journalisation applicative (aucun SDK de monitoring — Sentry, LogRocket, etc. — trouvé dans les dépendances)
