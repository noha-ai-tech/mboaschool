-- ============================================================================
-- 0024_school_page_sections.sql
--
-- Renumérotée depuis 0021_school_page_sections.sql (branche
-- feat/cms-school-page-v1, aurelie) lors de RELEASE-INTEGRATION-A : le
-- numéro 0021 était déjà pris par establishment_registry_identifiers.sql
-- (piste Registry, EXÉCUTÉE EN PRODUCTION). Ce fichier CMS n'a jamais été
-- exécuté sous son ancien numéro — aucun risque de confusion avec une
-- migration déjà appliquée, pure renumérotation de fichier.
--
-- PRÉPARÉE MAIS NON EXÉCUTÉE.
-- CMS-B.2. Ne pas exécuter dans Supabase SQL Editor sans validation explicite
-- d'Eddy et de l'architecte, ET sans confirmation préalable des correctifs de
-- sécurité CMS-A/A.1 (fuite applications, migrations 0007/0014) — voir
-- docs/04_SUPABASE_PROD_READINESS.
--
-- Configuration minimale d'ordre / visibilité des sections de la fiche
-- publique. AUCUN contenu métier ici — le contenu reste dans ses tables
-- naturelles (establishments, fees, infrastructures, school_images,
-- school_documents, school_announcements), voir CMS-A §12/13.
--
-- Pas de backfill national : la table reste vide tant qu'une école n'a pas
-- commencé à personnaliser sa page (CMS-B.2 §5) — les valeurs par défaut
-- (ordre standard, tout visible) restent gérées côté application.
-- ============================================================================

create table if not exists public.school_page_sections (
  id uuid primary key default gen_random_uuid(),
  establishment_id uuid not null references public.establishments(id) on delete cascade,
  section_key text not null check (section_key in (
    'presentation', 'admissions', 'gallery', 'news',
    'documents', 'infrastructure', 'pricing', 'contact'
  )),
  position integer not null,
  is_visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (establishment_id, section_key)
);

alter table public.school_page_sections enable row level security;

-- Lecture publique — nécessaire pour piloter l'ordre/la visibilité sur la
-- fiche publique elle-même (comme school_images / school_documents).
drop policy if exists "school_page_sections_public_read" on public.school_page_sections;
create policy "school_page_sections_public_read" on public.school_page_sections
  for select
  using (true);

-- Écriture réservée au propriétaire de l'établissement concerné. Même
-- schéma que school_images_owner_write (0007) mais via owner_id direct
-- (pas de convention de chemin Storage ici).
drop policy if exists "school_page_sections_owner_write" on public.school_page_sections;
create policy "school_page_sections_owner_write" on public.school_page_sections
  for all
  using (
    exists (select 1 from public.establishments e where e.id = establishment_id and e.owner_id = auth.uid())
  )
  with check (
    exists (select 1 from public.establishments e where e.id = establishment_id and e.owner_id = auth.uid())
  );

create or replace function public.touch_school_page_sections_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists school_page_sections_touch_updated_at on public.school_page_sections;
create trigger school_page_sections_touch_updated_at
  before update on public.school_page_sections
  for each row execute procedure public.touch_school_page_sections_updated_at();

-- ============================================================================
-- FIN — table additive, vide par défaut, aucune donnée existante modifiée.
-- ============================================================================
