-- ============================================================================
-- SYNC-03 REPOSITORY RECONCILIATION — GIT RENUMBERING ONLY.
--
-- Historically executed in production under filename 0026_school_page_drafts.sql
-- (branch feat/pro-school-organization). Renumbered to 0029_school_page_drafts.sql during
-- repository reconciliation with origin/main, whose own registry track
-- independently occupied numbers 0021-0025 (establishment_registry_
-- identifiers, transport_source_ministry_enum, registry_column_
-- protection, school_page_sections, storage_multi_school_hardening — see
-- reports/release/release-integration-a-conflict-resolution.csv on
-- origin/main for that side's own equivalent reconciliation).
--
-- DO NOT interpret this rename as pending DDL for the existing production
-- database. The SQL body below is byte-for-byte unchanged from 0026_school_page_drafts.sql;
-- nothing here needs to be (re)executed. This header is documentation
-- only, added purely to prevent a future reader from mistaking an
-- already-applied migration for pending work.
-- ============================================================================

-- ============================================================================
-- 0026_school_page_drafts.sql
--
-- PRÉPARÉE, NON EXÉCUTÉE. Attend la revue d'Eddy + l'architecte.
-- SPRINT CMS-F.1 — DRAFT DATABASE FOUNDATION.
--
-- Fondation DB uniquement. Aucun code applicatif ne lit ni n'écrit cette
-- table ou cette colonne à ce stade — F.1 est délibérément inerte :
--   - Presentation/Contact/Hero/Pricing/Infrastructure/Admissions/Sections/
--     Gallery continuent d'écrire directement dans leurs tables live
--     exactement comme avant (routes /api/school-page/* inchangées).
--   - Aucune ligne draft_pending_add ne peut être créée avant CMS-F.6
--     (aucune route n'écrit encore school_images.status).
--   - La policy SELECT publique de school_images n'est PAS modifiée ici —
--     volontairement, voir section school_images ci-dessous.
--
-- Portée EXCLUE explicitement de cette migration (décisions CMS-F.0/F.1) :
--   - school_documents : aucune colonne, aucune policy. Documents restent
--     IMMEDIATE LIVE, hors du mécanisme Draft/Publish V1.
--   - school_announcements (News) : aucune colonne, aucune policy. News
--     reste IMMEDIATE LIVE, hors du mécanisme Draft/Publish V1.
--   - admissions_config.is_open : n'apparaît jamais dans le payload draft
--     (voir commentaire sur la colonne payload plus bas) — reste un champ
--     opérationnel immediate-live, édité directement sur la table live.
--   - Aucune fonction publish_school_page() — le contrat exact du Publish
--     sera figé en CMS-F.5, une fois le payload réellement implémenté et
--     testé par CMS-F.2/F.3.
--   - Aucune table school_page_versions — l'historique de versions est un
--     besoin futur (V2), pas V1 ; cette table reste compatible avec son
--     ajout ultérieur sans réécriture (voir rapport CMS-F.0).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. school_page_drafts — une ligne par établissement, payload JSONB de
-- staging interne. La DB ne valide pas la forme complète du JSON ici
-- (document de staging applicatif, jamais joint/interrogé par clé) ; seule
-- la présence d'un objet JSON est garantie par le type de colonne.
-- ----------------------------------------------------------------------------
create table if not exists public.school_page_drafts (
  id                 uuid primary key default gen_random_uuid(),
  establishment_id   uuid not null unique references public.establishments(id) on delete cascade,
  payload            jsonb not null default '{}'::jsonb,
  is_dirty           boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint school_page_drafts_payload_object_check
    check (jsonb_typeof(payload) = 'object')
);

comment on table public.school_page_drafts is
  'CMS-F — document de staging interne par établissement (jamais lu par la fiche publique). '
  'Un seul document JSONB représentant l''état brouillon des domaines GLOBAL DRAFT : '
  'presentation, contact, hero_mode, pricing, infrastructure, admissions (config descriptive '
  'uniquement — is_open n''y figure JAMAIS, reste immediate-live sur admissions_config), '
  'sections (visibility/order), et gallery.remove_ids (liste des school_images.id dont la '
  'suppression est prévue au prochain Publish, jamais un statut sur la ligne live elle-même). '
  'News (school_announcements) et Documents (school_documents) ne participent PAS à ce '
  'mécanisme : ils restent immediate-live, aucune référence à eux dans ce payload. '
  'Forme cible actuelle (non validée par la DB, documentée pour référence) : '
  '{"presentation":{"description":""},"contact":{"phone":"","email":"","website":"","address":"","city":""},'
  '"hero_mode":"carousel","pricing":{"registration_fee":null,"...":null},'
  '"infrastructure":{"library":false,"...":false},'
  '"admissions":{"levels":[],"conditions":"","required_documents":[],"period_start":null,"period_end":null,"additional_info":""},'
  '"sections":[{"section_key":"presentation","position":0,"is_visible":true}],'
  '"gallery":{"remove_ids":[]}}';

-- ----------------------------------------------------------------------------
-- 2. updated_at — même idiome que 0021/0025 (un touch trigger dédié par
-- table, convention déjà établie dans ce projet ; audité avant écriture,
-- aucun helper générique partagé n'existe à réutiliser).
-- ----------------------------------------------------------------------------
create or replace function public.touch_school_page_drafts_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists school_page_drafts_touch_updated_at on public.school_page_drafts;
create trigger school_page_drafts_touch_updated_at
  before update on public.school_page_drafts
  for each row execute procedure public.touch_school_page_drafts_updated_at();

-- ----------------------------------------------------------------------------
-- 3. RLS — aucun accès anon. Owner uniquement, via is_own_establishment()
-- (0023, déjà multi-écoles-safe) — aucun nouveau resolver créé.
-- ----------------------------------------------------------------------------
alter table public.school_page_drafts enable row level security;

drop policy if exists "school_page_drafts_owner_only" on public.school_page_drafts;
create policy "school_page_drafts_owner_only" on public.school_page_drafts
  for all
  using (public.is_own_establishment(establishment_id))
  with check (public.is_own_establishment(establishment_id));

-- Aucune policy select pour anon ou pour authenticated non-owner : le
-- public ne lira JAMAIS cette table.

revoke all on public.school_page_drafts
  from public, anon, authenticated;
grant select, insert, update, delete on public.school_page_drafts to authenticated;
-- anon : aucun grant du tout.

-- ----------------------------------------------------------------------------
-- 4. school_images — fondation de staging média UNIQUEMENT. Deux valeurs
-- seulement : 'live' (comportement actuel, valeur par défaut — toutes les
-- lignes existantes restent 'live' sans backfill explicite, ADD COLUMN
-- ... DEFAULT est une opération de métadonnées, pas une réécriture de
-- table) et 'draft_pending_add' (réservée à CMS-F.6, aucun code n'écrit
-- encore cette valeur). PAS de 'pending_delete' — décision CMS-F.1 : une
-- photo live à supprimer reste publiquement live jusqu'au Publish ; la
-- suppression prévue est trackée dans school_page_drafts.payload.gallery.
-- remove_ids, jamais comme un statut sur la ligne elle-même.
-- ----------------------------------------------------------------------------
alter table public.school_images
  add column if not exists status text not null default 'live';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'school_images_status_check'
      and conrelid = 'public.school_images'::regclass
  ) then
    alter table public.school_images
      add constraint school_images_status_check
      check (status in ('live', 'draft_pending_add'));
  end if;
end
$$;

comment on column public.school_images.status is
  'CMS-F — ''live'' (défaut, comportement actuel inchangé) ou ''draft_pending_add'' '
  '(réservé à CMS-F.6, aucun code n''écrit encore cette valeur en F.1). Aucune valeur '
  '''pending_delete'' : une suppression prévue est trackée dans '
  'school_page_drafts.payload.gallery.remove_ids, jamais ici — une photo live reste '
  'visible publiquement jusqu''au Publish même si sa suppression est planifiée.';

-- ============================================================================
-- FIN — table additive + 1 colonne additive avec défaut, aucune donnée
-- existante modifiée, aucune policy publique touchée (school_images garde
-- sa policy SELECT publique actuelle `using (true)`, inchangée — le
-- resserrement vers `status = 'live'` est explicitement différé à
-- CMS-F.6). school_documents et school_announcements non touchées.
-- ============================================================================
