-- ============================================================================
-- 0020_search_v2_unaccent_rpc.sql
--
-- PRÉPARÉE MAIS NON EXÉCUTÉE.
-- SPRINT R.2-B §35 — migration additive préparée pour revue, PAS exécutée
-- par cet agent : aucun accès direct psql/mot de passe base disponible dans
-- cet environnement (uniquement les clés REST anon/service_role, qui ne
-- permettent pas de DDL) — cohérent avec la règle de travail existante du
-- projet ("toute modification de schéma Supabase passe par SQL Editor",
-- voir docs/03_DATA_REGISTRY/IMPORT_RUNBOOK.md §0). Exécution : Eddy ou
-- l'opérateur, via Supabase SQL Editor, après revue.
--
-- ── POURQUOI CETTE MIGRATION N'EST PAS REQUISE POUR QUE R.2-B FONCTIONNE ──
--
-- La recherche publique livrée dans ce sprint (/api/recherche) est
-- accent-insensible pour un ensemble BORNÉ de paires confirmées
-- (école/ecole, collège/college, privé/prive, supérieur/superieur,
-- Yaoundé/Yaounde, Ngaoundéré/Ngaoundere, Edéa/Edea, Kousséri/Kousseri,
-- Bangangté/Bangangte — voir src/lib/search/normalizeSearchText.ts,
-- ACCENT_VARIANT_PAIRS) via des OR ILIKE construits côté serveur (Next.js),
-- sans aucune dépendance à cette migration. Elle fonctionne dès aujourd'hui,
-- sans action base de données.
--
-- Limite connue : un mot accentué HORS de cette liste bornée (nom de ville
-- futur, nom d'établissement) ne sera PAS retrouvé par sa forme non-
-- accentuée, puisque ILIKE Postgres ne replie pas les accents. Cette
-- migration résout cette limite de façon générale — recommandée si le
-- volume de plaintes/tests QA sur des mots hors liste le justifie (§34 :
-- mesurer le besoin réel avant d'exécuter).
--
-- ── CE QUE FAIT CETTE MIGRATION ──
--
-- 1. Active l'extension standard `unaccent` (contrib Postgres, pas un
--    package tiers — disponible par défaut sur Supabase).
-- 2. Crée une fonction wrapper IMMUTABLE `public.f_unaccent(text)` — la
--    fonction `unaccent()` native n'est pas marquée IMMUTABLE par défaut
--    (elle dépend d'un dictionnaire configurable), ce qui empêcherait de
--    l'utiliser dans un index fonctionnel sans ce wrapper à search_path fixe.
-- 3. Crée une fonction RPC `public.search_establishments(...)` — SECURITY
--    INVOKER (§37 : jamais SECURITY DEFINER ici, la policy RLS publique
--    "Public can read establishments" (using (true)) suffit, pas besoin de
--    contourner RLS), qui applique le même contrat que /api/recherche
--    (q/regions[]/city/category/limit/offset -> lignes publiques +
--    total_count), mais avec un repli d'accents GÉNÉRAL via f_unaccent().
--
-- ADDITIF / NON DESTRUCTIF : aucune table modifiée, aucune ligne touchée,
-- aucun index requis à ce volume (≤ 20 000 lignes projetées, un scan
-- séquentiel avec quelques ILIKE reste largement sous 100ms — un index trgm/
-- GIN sur f_unaccent(lower(...)) resterait un ajout ultérieur SÉPARÉ, à ne
-- créer que si une mesure réelle de latence le justifie, pas par anticipation).
--
-- ============================================================================

create extension if not exists unaccent;

create or replace function public.f_unaccent(text)
returns text
language sql
immutable
parallel safe
set search_path = public, pg_temp
as $$
  select unaccent('unaccent', $1);
$$;

comment on function public.f_unaccent(text) is
  'Wrapper IMMUTABLE autour de unaccent() (search_path fixe) — SPRINT R.2-B §34/§35, permet un futur index fonctionnel si mesuré nécessaire. Ne modifie aucune donnée stockée, sert uniquement à comparer.';

create or replace function public.search_establishments(
  p_query text default '',
  p_regions text[] default null,
  p_city text default null,
  p_category text default null,
  p_limit int default 24,
  p_offset int default 0
)
returns table (
  id uuid,
  name text,
  main_category text,
  sub_category text,
  city text,
  region text,
  neighborhood text,
  quartier text,
  phone text,
  cover_image_url text,
  is_verified boolean,
  is_claimed boolean,
  accepts_online_payment boolean,
  is_featured boolean,
  couleur_primaire text,
  couleur_secondaire text,
  emoji_logo text,
  latitude double precision,
  longitude double precision,
  total_count bigint
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with filtered as (
    select e.*
    from public.establishments e
    where
      (p_category is null or p_category = 'all' or e.main_category::text = p_category)
      and (p_regions is null or e.region = any(p_regions))
      and (
        p_city is null or p_city = 'all' or
        public.f_unaccent(lower(coalesce(e.city, ''))) ilike '%' || public.f_unaccent(lower(p_city)) || '%' or
        public.f_unaccent(lower(coalesce(e.neighborhood, ''))) ilike '%' || public.f_unaccent(lower(p_city)) || '%' or
        public.f_unaccent(lower(coalesce(e.quartier, ''))) ilike '%' || public.f_unaccent(lower(p_city)) || '%' or
        public.f_unaccent(lower(coalesce(e.address, ''))) ilike '%' || public.f_unaccent(lower(p_city)) || '%' or
        public.f_unaccent(lower(e.name)) ilike '%' || public.f_unaccent(lower(p_city)) || '%'
      )
      and (
        p_query is null or trim(p_query) = '' or
        public.f_unaccent(lower(
          e.name || ' ' || coalesce(e.city, '') || ' ' || coalesce(e.region, '') || ' ' ||
          coalesce(e.neighborhood, '') || ' ' || coalesce(e.quartier, '') || ' ' ||
          e.main_category::text || ' ' || coalesce(e.sub_category, '')
        )) ilike '%' || public.f_unaccent(lower(trim(p_query))) || '%'
      )
  )
  select
    f.id, f.name, f.main_category, f.sub_category, f.city, f.region,
    f.neighborhood, f.quartier, f.phone, f.cover_image_url, f.is_verified,
    f.is_claimed, f.accepts_online_payment, f.is_featured, f.couleur_primaire,
    f.couleur_secondaire, f.emoji_logo, f.latitude, f.longitude,
    count(*) over () as total_count
  from filtered f
  order by f.is_featured desc, f.name asc
  limit least(greatest(p_limit, 1), 50)
  offset greatest(p_offset, 0);
$$;

comment on function public.search_establishments is
  'SPRINT R.2-B §35-36 RPC préparée (non requise pour le fonctionnement actuel de /api/recherche, voir en-tête). Repli d''accents général via f_unaccent, contre le repli borné utilisé aujourd''hui côté application. p_query est une correspondance de sous-chaîne simple (pas de découpage mot-par-mot ET, contrairement à /api/recherche) — à étendre si adoptée, pas un remplacement direct.';

grant execute on function public.search_establishments to anon, authenticated;

-- ============================================================================
-- SEARCH DATABASE MIGRATION REVIEW (§35)
--
-- Extensions   : unaccent (contrib standard Postgres, déjà courante sur Supabase)
-- Functions    : public.f_unaccent(text) [IMMUTABLE], public.search_establishments(...) [STABLE, SECURITY INVOKER]
-- Indexes      : aucun créé par cette migration (voir note ci-dessus — pas mesuré comme nécessaire à ce volume)
-- RLS impact   : aucun — SECURITY INVOKER s'exécute avec les droits de l'appelant (anon),
--                soumis à la policy existante "Public can read establishments" (using (true))
-- Writes       : aucune — 0 ligne insérée/modifiée/supprimée, uniquement CREATE EXTENSION/FUNCTION
-- Locks/risk   : verrou bref de catalogue (ACCESS EXCLUSIVE très court) lors de la création de
--                fonction — pas de verrou sur establishments elle-même, aucun risque de blocage
--                de lecture/écriture applicative pendant l'exécution
-- Rollback     : `drop function if exists public.search_establishments; drop function if exists public.f_unaccent(text);`
--                (l'extension unaccent peut rester active sans effet de bord, ou
--                `drop extension if exists unaccent;` si aucune autre fonction ne l'utilise)
-- ============================================================================
