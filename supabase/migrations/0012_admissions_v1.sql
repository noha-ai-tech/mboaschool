-- ============================================================================
-- 0012_admissions_v1.sql
--
-- PREPAREE MAIS NON EXECUTEE.
-- Mission 07 - Admissions Platform V1. Ne pas executer dans Supabase SQL
-- Editor sans validation explicite d'Eddy et de l'architecte.
--
-- Etend la table existante public.applications (schema.sql) : nouveau
-- statut a 8 valeurs, code de suivi, message public au parent (distinct
-- des notes internes), historique des changements de statut, fonction de
-- consultation publique securisee (code + telephone).
--
-- AUCUNE TABLE DUPLIQUEE : pas de nouvelle table "pre_inscriptions", tout
-- est construit sur applications, deja utilisee par preinscription/page.tsx
-- et dashboard/ecole/admissions/page.tsx. Voir docs/admissions/ADMISSIONS_V1.md.
--
-- AUCUNE OPERATION DESTRUCTIVE : l'ancienne colonne `status` et l'enum
-- `application_status` ne sont ni supprimes ni renommes ; un trigger les
-- maintient a jour pour compatibilite (Phase 3 de la mission).
--
-- AUCUNE INTEGRATION DE PAIEMENT (Phase 17, exclusion explicite).
-- ============================================================================


-- ============================================================================
-- 1. NOUVEAU STATUT D'ADMISSION (Phase 3)
-- ============================================================================

create type admission_status as enum (
  'submitted',            -- Nouvelle demande
  'in_review',            -- En analyse
  'documents_required',   -- Documents requis
  'interview',            -- Entretien programme
  'waitlisted',           -- Liste d'attente
  'accepted',             -- Acceptee
  'rejected',             -- Refusee
  'cancelled'             -- Annulee (par le parent ou l'ecole)
);

alter table public.applications
  add column if not exists admission_status admission_status not null default 'submitted';

-- Retro-compatibilite : reprise des dossiers existants sur l'ancien enum
-- application_status (pending/reviewed/accepted/rejected) vers le nouveau.
update public.applications
set admission_status = case status
  when 'pending'  then 'submitted'
  when 'reviewed' then 'in_review'
  when 'accepted' then 'accepted'
  when 'rejected' then 'rejected'
  else 'submitted'
end::admission_status
where admission_status = 'submitted';


-- ============================================================================
-- 1b. CHAMPS DE FORMULAIRE COMPLEMENTAIRES (Phase 4)
-- ============================================================================
-- Date de naissance : absente du schema actuel (seul student_age existe),
-- ajoutee car explicitement demandee par la mission ("si compatible avec
-- le schema" - elle ne l'etait pas, elle l'est desormais, sans rien casser
-- de l'existant qui continue a lire student_age).
-- Annee scolaire : optionnelle, reference annees_scolaires (migration 0010,
-- egalement non executee) - nullable, aucun blocage si l'etablissement n'a
-- pas encore configure d'annee scolaire.

alter table public.applications
  add column if not exists student_birth_date date,
  add column if not exists annee_scolaire_id uuid references public.annees_scolaires(id) on delete set null;


-- ============================================================================
-- 2. CODE DE SUIVI (Phase 5) - aucune convention preexistante a preserver
-- ============================================================================

alter table public.applications
  add column if not exists tracking_code text;

create unique index if not exists applications_tracking_code_key
  on public.applications (tracking_code);

create or replace function public.generate_admission_tracking_code()
returns text
language plpgsql
as $$
declare
  v_chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- sans 0/O/1/I ambigus
  v_code text;
  v_exists boolean;
begin
  loop
    v_code := 'E237-';
    for i in 1..6 loop
      v_code := v_code || substr(v_chars, floor(random() * length(v_chars) + 1)::int, 1);
    end loop;
    select exists(select 1 from public.applications where tracking_code = v_code) into v_exists;
    exit when not v_exists;
  end loop;
  return v_code;
end;
$$;

create or replace function public.set_admission_tracking_code()
returns trigger
language plpgsql
as $$
begin
  if new.tracking_code is null then
    new.tracking_code := public.generate_admission_tracking_code();
  end if;
  return new;
end;
$$;

drop trigger if exists applications_set_tracking_code on public.applications;
create trigger applications_set_tracking_code
  before insert on public.applications
  for each row execute procedure public.set_admission_tracking_code();

-- Le GRANT INSERT sur applications est accorde a `anon` au niveau table
-- entier (auth-setup.sql, deja en production) - sans restriction par
-- colonne. Sans ce garde-fou, un client public pourrait techniquement
-- inserer une ligne avec admission_status = 'accepted' des la soumission.
-- Ce trigger force toute nouvelle demande a demarrer au statut initial,
-- quelle que soit la valeur envoyee par le client.
create or replace function public.enforce_admission_initial_status()
returns trigger
language plpgsql
as $$
begin
  new.admission_status := 'submitted';
  return new;
end;
$$;

drop trigger if exists applications_enforce_initial_status on public.applications;
create trigger applications_enforce_initial_status
  before insert on public.applications
  for each row execute procedure public.enforce_admission_initial_status();

-- Backfill des dossiers deja existants sans code (execute une seule fois,
-- idempotent : ne touche que les lignes ou tracking_code est encore nul).
update public.applications
set tracking_code = public.generate_admission_tracking_code()
where tracking_code is null;


-- ============================================================================
-- 3. MESSAGE AU PARENT vs NOTES INTERNES (Phase 9)
-- ============================================================================
-- `notes` (ajoutee en migration 0007) reste strictement interne (aucune
-- policy SELECT publique ne l'expose). `parent_message` est le seul champ
-- renvoye par get_admission_by_tracking() ci-dessous.

alter table public.applications
  add column if not exists parent_message text;


-- ============================================================================
-- 4. HISTORIQUE DES CHANGEMENTS DE STATUT (Phase 8)
-- ============================================================================

create table if not exists public.admissions_history (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  from_status admission_status,
  to_status admission_status not null,
  comment text,               -- commentaire interne optionnel (jamais public)
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.admissions_history enable row level security;

-- Journal ajoute automatiquement a chaque changement de statut.
create or replace function public.log_admission_status_change()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.admission_status is distinct from old.admission_status then
    insert into public.admissions_history (application_id, from_status, to_status, created_by)
    values (new.id, old.admission_status, new.admission_status, auth.uid());
  end if;
  return new;
end;
$$;

drop trigger if exists applications_log_status_change on public.applications;
create trigger applications_log_status_change
  after update on public.applications
  for each row execute procedure public.log_admission_status_change();

-- Entree initiale pour toute demande deja soumise (reception du dossier).
create or replace function public.log_admission_submission()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.admissions_history (application_id, from_status, to_status)
  values (new.id, null, new.admission_status);
  return new;
end;
$$;

drop trigger if exists applications_log_submission on public.applications;
create trigger applications_log_submission
  after insert on public.applications
  for each row execute procedure public.log_admission_submission();

-- Seul le directeur (proprietaire de l'etablissement concerne) peut lire
-- l'historique. Aucune lecture publique, aucune lecture platform_admin.
create policy "Directeur peut lire l'historique de ses admissions"
  on public.admissions_history for select
  using (
    exists (
      select 1 from public.applications a
      join public.establishments e on e.id = a.establishment_id
      where a.id = application_id and e.owner_id = auth.uid()
    )
  );


-- ============================================================================
-- 5. COMPATIBILITE ANCIEN STATUT (Phase 3) - aucune suppression de colonne
-- ============================================================================
-- L'ancienne colonne `status` (application_status) reste alimentee
-- automatiquement pour tout code externe non migre. Correspondance
-- approximative documentee dans docs/admissions/ADMISSIONS_V1.md.

create or replace function public.sync_legacy_application_status()
returns trigger
language plpgsql
as $$
begin
  new.status := case new.admission_status
    when 'submitted'           then 'pending'
    when 'in_review'           then 'reviewed'
    when 'documents_required'  then 'reviewed'
    when 'interview'           then 'reviewed'
    when 'waitlisted'          then 'reviewed'
    when 'accepted'            then 'accepted'
    when 'rejected'            then 'rejected'
    when 'cancelled'           then 'rejected'
  end::application_status;
  return new;
end;
$$;

drop trigger if exists applications_sync_legacy_status on public.applications;
create trigger applications_sync_legacy_status
  before insert or update of admission_status on public.applications
  for each row execute procedure public.sync_legacy_application_status();


-- ============================================================================
-- 6. CONSULTATION PUBLIQUE SECURISEE (Phase 6)
-- ============================================================================
-- Fonction security definer plutot qu'une policy RLS "select *" : ne
-- renvoie jamais les notes internes, l'id du dossier, ni les donnees
-- d'autres familles. Exige une correspondance exacte code + telephone.

create or replace function public.get_admission_by_tracking(p_tracking_code text, p_phone text)
returns table (
  establishment_name text,
  student_name text,
  desired_level text,
  submitted_at timestamptz,
  status admission_status,
  parent_message text
)
language sql
security definer set search_path = public
stable
as $$
  select
    e.name,
    coalesce(nullif(a.full_student_name, ''), trim(coalesce(a.student_first_name, '') || ' ' || coalesce(a.student_last_name, ''))),
    a.desired_level,
    a.created_at,
    a.admission_status,
    a.parent_message
  from public.applications a
  join public.establishments e on e.id = a.establishment_id
  where a.tracking_code = upper(trim(p_tracking_code))
    and a.parent_phone = p_phone
  limit 1;
$$;

grant execute on function public.get_admission_by_tracking(text, text) to anon, authenticated;


-- ============================================================================
-- 7. ADMINISTRATION PLATEFORME (Phase 11)
-- ============================================================================
-- Rien a construire : public.profiles.role (schema.sql) est deja un enum
-- user_role ('parent' | 'establishment_admin' | 'platform_admin'), jamais
-- lie a un email en dur. Plusieurs comptes platform_admin sont deja
-- possibles sans aucun changement de schema. Aucune policy platform_admin
-- n'est ajoutee sur applications/admissions_history dans cette migration
-- (V1 : pas d'acces support/moderation construit, voir
-- docs/admissions/ADMISSIONS_V1.md).


-- ============================================================================
-- FIN - aucune colonne supprimee, aucune donnee modifiee en masse,
-- aucune policy retiree. Toutes les operations sont additives et
-- idempotentes (IF NOT EXISTS / OR REPLACE / DROP POLICY IF EXISTS avant
-- CREATE POLICY absent ici car aucune policy existante n'est remplacee).
-- ============================================================================
