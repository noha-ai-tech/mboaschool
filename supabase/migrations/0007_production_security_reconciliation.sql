-- ============================================================================
-- 0007_production_security_reconciliation.sql
--
-- PRÉPARÉE MAIS NON EXÉCUTÉE.
-- Mission SUPABASE-PROD-01. Ne pas exécuter dans Supabase SQL Editor sans
-- validation explicite d'Eddy et de l'architecte.
--
-- Contenu, dans l'ordre :
--   1. Rattrapage du schéma dérivé (establishments, applications, school_announcements)
--      — voir docs/04_SUPABASE_PROD_READINESS/01_SCHEMA_DRIFT.md
--   2. Policy RLS platform_admin manquante sur establishments (UPDATE uniquement)
--      — voir docs/04_SUPABASE_PROD_READINESS/02_RLS_ADMIN_AUDIT.md
--   3. Buckets et policies Storage pour school-images / school-documents
--      — voir docs/04_SUPABASE_PROD_READINESS/05_STORAGE_AUDIT.md
--   4. Limitation de fréquence sur les préinscriptions publiques
--      — voir docs/04_SUPABASE_PROD_READINESS/06_PREINSCRIPTION_PROTECTION.md
--
-- AUCUNE OPÉRATION DESTRUCTIVE : aucune colonne supprimée, aucune donnée
-- supprimée ou modifiée en masse. Toutes les opérations sont additives
-- (ADD COLUMN IF NOT EXISTS, CREATE POLICY/TRIGGER avec DROP IF EXISTS
-- préalable pour permettre une réexécution idempotente).
-- ============================================================================


-- ============================================================================
-- 1. RATTRAPAGE DU SCHÉMA DÉRIVÉ
-- ============================================================================

-- 1a. establishments — colonnes ajoutées jusqu'ici uniquement par seed_schools.sql
alter table public.establishments
  add column if not exists is_claimed         boolean not null default false,
  add column if not exists quartier           text,
  add column if not exists couleur_primaire   text,
  add column if not exists couleur_secondaire text,
  add column if not exists emoji_logo         text;

-- 1b. applications — colonnes utilisées par preinscription/page.tsx et
--     dashboard/ecole/admissions/page.tsx, jamais versionnées.
--     Note : `notes` peut contenir des observations sur un dossier concernant
--     un mineur — aucune classification de confidentialité supplémentaire
--     n'est ajoutée ici (hors périmètre technique de cette migration), mais
--     le point est signalé pour décision produit séparée avec Eddy.
alter table public.applications
  add column if not exists student_first_name text,
  add column if not exists student_last_name  text,
  add column if not exists full_student_name  text,
  add column if not exists desired_level      text,
  add column if not exists previous_school    text,
  add column if not exists notes              text;

-- 1c. school_announcements — colonnes utilisées par dashboard/ecole/annonces
--     et dashboard/ecole/classes/[id], jamais versionnées.
alter table public.school_announcements
  add column if not exists is_important boolean not null default false,
  add column if not exists class_id     uuid references public.classes(id) on delete cascade,
  add column if not exists type         text default 'announcement';

-- Contrainte de validité sur `type` — ajoutée séparément pour ne pas faire
-- échouer tout le bloc ALTER TABLE si la colonne existait déjà avec des
-- valeurs hors de cette liste (cas non attendu, mais possible en dérive
-- manuelle). Si cette étape échoue, NE PAS la contourner en assouplissant la
-- contrainte : identifier et corriger manuellement les valeurs invalides
-- d'abord.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'school_announcements_type_check'
  ) then
    alter table public.school_announcements
      add constraint school_announcements_type_check
      check (type in ('announcement', 'homework', 'event', 'reminder'));
  end if;
end $$;


-- ============================================================================
-- 2. RLS — platform_admin sur establishments
-- ============================================================================
-- Seule policy UPDATE existante avant cette migration : "Owners can update
-- own establishments" (owner_id = auth.uid()), qui ne couvre jamais un
-- platform_admin éditant une école qu'il ne possède pas.
--
-- INSERT et DELETE volontairement NON ajoutés — voir
-- docs/04_SUPABASE_PROD_READINESS/02_RLS_ADMIN_AUDIT.md : aucun flux
-- applicatif ne les utilise aujourd'hui côté admin, les ajouter créerait des
-- policies orphelines sans bénéfice réel avant qu'un flux existe.

drop policy if exists "platform_admin can update any establishment" on public.establishments;
create policy "platform_admin can update any establishment" on public.establishments
  for update
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'platform_admin')
  )
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'platform_admin')
  );


-- ============================================================================
-- 3. STORAGE — school-images / school-documents
-- ============================================================================
-- Ces buckets n'ont jamais été créés ni protégés par SQL versionné — seule
-- une note en commentaire dans auth-setup.sql en décrivait l'intention, sans
-- isolation par établissement (voir 05_STORAGE_AUDIT.md pour le détail du
-- risque). Le code applicatif uploade déjà avec le chemin
-- `{establishment_id}/{timestamp}.{ext}` (dashboard/ecole/galerie,
-- dashboard/ecole/documents) — aucun changement de code nécessaire, la
-- policy ci-dessous s'appuie sur cette convention déjà en place.

insert into storage.buckets (id, name, public)
values ('school-images', 'school-images', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('school-documents', 'school-documents', true)
on conflict (id) do nothing;

-- Lecture publique (cohérent avec l'usage : galerie/documents visibles sur
-- la fiche publique de l'école).
drop policy if exists "school_images_public_read" on storage.objects;
create policy "school_images_public_read" on storage.objects
  for select
  using (bucket_id = 'school-images');

drop policy if exists "school_documents_public_read" on storage.objects;
create policy "school_documents_public_read" on storage.objects
  for select
  using (bucket_id = 'school-documents');

-- Écriture (insert/update/delete) réservée au propriétaire de l'établissement
-- correspondant au premier segment du chemin — même schéma que
-- pointages_owner_access (0002_presence.sql), adapté ici via owner_id
-- puisqu'il n'y a pas de notion de "session kiosque" pour ces buckets.
drop policy if exists "school_images_owner_write" on storage.objects;
create policy "school_images_owner_write" on storage.objects
  for all
  using (
    bucket_id = 'school-images'
    and (storage.foldername(name))[1] = (
      select id::text from public.establishments where owner_id = auth.uid()
    )
  )
  with check (
    bucket_id = 'school-images'
    and (storage.foldername(name))[1] = (
      select id::text from public.establishments where owner_id = auth.uid()
    )
  );

drop policy if exists "school_documents_owner_write" on storage.objects;
create policy "school_documents_owner_write" on storage.objects
  for all
  using (
    bucket_id = 'school-documents'
    and (storage.foldername(name))[1] = (
      select id::text from public.establishments where owner_id = auth.uid()
    )
  )
  with check (
    bucket_id = 'school-documents'
    and (storage.foldername(name))[1] = (
      select id::text from public.establishments where owner_id = auth.uid()
    )
  );

-- IMPORTANT avant exécution réelle : si ces buckets existent déjà en
-- production avec des policies configurées manuellement dans le dashboard
-- (différentes de celles décrites en commentaire dans auth-setup.sql), les
-- `drop policy if exists` ci-dessus ne suppriment QUE les policies portant
-- exactement ces noms. Une policy manuelle nommée différemment resterait
-- active en parallèle — à vérifier manuellement dans le dashboard Supabase
-- avant d'exécuter cette section.


-- ============================================================================
-- 4. PRÉINSCRIPTION PUBLIQUE — limitation de fréquence
-- ============================================================================
-- Voir docs/04_SUPABASE_PROD_READINESS/06_PREINSCRIPTION_PROTECTION.md pour
-- la justification du choix (trigger Postgres plutôt que rate-limit
-- applicatif — le formulaire écrit directement dans Supabase depuis le
-- navigateur, sans route API intermédiaire).

create or replace function public.check_application_rate_limit()
returns trigger
language plpgsql
as $$
declare
  v_recent_count integer;
begin
  select count(*) into v_recent_count
  from public.applications
  where parent_phone = new.parent_phone
    and created_at > now() - interval '15 minutes';

  if v_recent_count >= 3 then
    raise exception 'Trop de préinscriptions envoyées récemment avec ce numéro. Réessayez dans quelques minutes.'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists applications_rate_limit on public.applications;
create trigger applications_rate_limit
  before insert on public.applications
  for each row execute procedure public.check_application_rate_limit();

-- ============================================================================
-- FIN — aucune colonne supprimée, aucune donnée modifiée en masse,
-- aucune opération destructive.
-- ============================================================================
