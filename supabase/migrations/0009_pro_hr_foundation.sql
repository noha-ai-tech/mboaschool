-- ============================================================================
-- 0009_pro_hr_foundation.sql
--
-- PRÉPARÉE MAIS NON EXÉCUTÉE.
-- Mission 04 — Écoles237 Pro Foundation. Ne pas exécuter dans Supabase SQL
-- Editor sans validation explicite d'Eddy et de l'architecte.
--
-- Construit les fondations RH du module Pro : personnel (au-delà des seuls
-- enseignants), contrats, documents RH, sections. Ne touche à AUCUNE table
-- existante de façon destructive — `enseignants`, `emplois_du_temps`,
-- `matieres`, `pointages`, `classes` restent inchangées dans leur usage
-- actuel. `staff_members` s'ajoute à côté, lié à `enseignants` par une clé
-- optionnelle. Voir docs/pro/01_ARCHITECTURE.md pour le diagnostic complet.
-- ============================================================================


-- ============================================================================
-- 1. TYPES ÉNUMÉRÉS
-- ============================================================================

create type staff_category as enum ('teacher', 'admin', 'direction', 'support');

-- Rôles organisationnels (Phase 6) — DISTINCTS de l'enum auth `user_role`
-- (parent/establishment_admin/platform_admin/teacher), qui gouverne l'accès
-- système et n'est pas modifié par cette migration. `staff_role` gouverne
-- la fonction de la personne dans l'établissement, pas ses droits système.
create type staff_role as enum (
  'admin_principal', 'directeur', 'proviseur', 'principal', 'censeur',
  'secretaire', 'comptable', 'enseignant', 'assistant'
);

create type staff_employment_type as enum ('temps_plein', 'temps_partiel', 'vacataire');
create type staff_status as enum ('actif', 'inactif');
create type staff_access_mode as enum ('email', 'code');
create type staff_document_category as enum (
  'contrat', 'cv', 'diplome', 'decision', 'attestation', 'piece_administrative'
);
create type staff_contract_status as enum ('actif', 'termine');


-- ============================================================================
-- 2. SECTIONS (Phase 5 — structure uniquement, pas d'emploi du temps)
-- ============================================================================

create table if not exists public.sections (
  id                uuid primary key default gen_random_uuid(),
  etablissement_id  uuid not null references public.establishments(id) on delete cascade,
  nom               text not null,
  type              text,  -- ex. 'maternelle', 'primaire', 'secondaire_general', 'secondaire_technique'
  created_at        timestamptz not null default now()
);

create index if not exists idx_sections_etablissement on public.sections(etablissement_id);

-- classes -> sections (nullable — une classe existante reste valide sans section)
alter table public.classes
  add column if not exists section_id uuid references public.sections(id) on delete set null;


-- ============================================================================
-- 3. STAFF_MEMBERS (Phase 2/3 — registre RH généralisé)
-- ============================================================================

create table if not exists public.staff_members (
  id                uuid primary key default gen_random_uuid(),
  etablissement_id  uuid not null references public.establishments(id) on delete cascade,

  -- Lien optionnel vers la fiche enseignant existante — NULL pour le
  -- personnel non-enseignant. La table `enseignants` reste la source de
  -- vérité pour tout ce qui concerne matières/emplois du temps/pointage ;
  -- `staff_members` est la couche RH qui s'ajoute par-dessus.
  enseignant_id     uuid references public.enseignants(id) on delete set null,

  category          staff_category not null,
  role              staff_role not null,

  first_name        text not null,
  last_name         text not null,
  email             text,
  phone             text,
  photo_url         text,

  date_entree       date,
  employment_type   staff_employment_type,
  status            staff_status not null default 'actif',

  -- Accès (Phase 4)
  access_mode       staff_access_mode not null default 'email',
  access_code       text,  -- utilisé si access_mode = 'code' (mode sans email)
  user_id           uuid references auth.users(id) on delete set null,
  invite_envoyee_le timestamptz,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists idx_staff_members_etablissement on public.staff_members(etablissement_id);
create index if not exists idx_staff_members_enseignant on public.staff_members(enseignant_id);
create index if not exists idx_staff_members_user on public.staff_members(user_id);
create unique index if not exists idx_staff_members_access_code
  on public.staff_members(etablissement_id, access_code)
  where access_code is not null;

-- Rattache `sections.responsable_staff_member_id` maintenant que la table existe.
alter table public.sections
  add column if not exists responsable_staff_member_id uuid references public.staff_members(id) on delete set null;

-- Rétro-remplissage non destructif : chaque enseignant existant obtient une
-- fiche staff_members correspondante (category='teacher', role='enseignant'),
-- pour que le module Personnel affiche immédiatement le personnel déjà créé
-- sans ressaisie. N'écrase ni ne supprime rien dans `enseignants`.
insert into public.staff_members (
  etablissement_id, enseignant_id, category, role, first_name, last_name,
  email, user_id, invite_envoyee_le, access_mode
)
select
  e.etablissement_id, e.id, 'teacher', 'enseignant', e.prenom, e.nom,
  e.email, e.user_id, e.invite_envoyee_le, 'email'
from public.enseignants e
where not exists (
  select 1 from public.staff_members sm where sm.enseignant_id = e.id
);


-- ============================================================================
-- 4. CONTRATS (Phase 8)
-- ============================================================================

create table if not exists public.staff_contracts (
  id                    uuid primary key default gen_random_uuid(),
  staff_member_id       uuid not null references public.staff_members(id) on delete cascade,
  type                  staff_employment_type not null,
  salaire               numeric,           -- salaire mensuel fixe, si applicable
  taux_horaire          numeric,           -- taux horaire, si applicable (vacataire notamment)
  volume_hebdomadaire   numeric,           -- heures/semaine prévues
  date_debut            date not null,
  date_fin              date,              -- nullable = contrat en cours
  statut                staff_contract_status not null default 'actif',
  created_at            timestamptz not null default now()
);

create index if not exists idx_staff_contracts_member on public.staff_contracts(staff_member_id);


-- ============================================================================
-- 5. DOCUMENTS RH (Phase 9)
-- ============================================================================

create table if not exists public.staff_documents (
  id                uuid primary key default gen_random_uuid(),
  staff_member_id   uuid not null references public.staff_members(id) on delete cascade,
  category          staff_document_category not null,
  file_name         text not null,
  storage_path      text not null,
  uploaded_at       timestamptz not null default now()
);

create index if not exists idx_staff_documents_member on public.staff_documents(staff_member_id);


-- ============================================================================
-- 6. RLS
-- ============================================================================

alter table public.sections enable row level security;
alter table public.staff_members enable row level security;
alter table public.staff_contracts enable row level security;
alter table public.staff_documents enable row level security;

-- Sections : scope établissement (même fonction que le reste du module Pro).
drop policy if exists sections_scope on public.sections;
create policy sections_scope on public.sections
  for all using (etablissement_id = current_establishment_id());

-- staff_members : directeur (scope complet) + membre lui-même (lecture seule
-- de sa propre fiche) — même schéma que enseignants_scope/enseignants_self_read.
drop policy if exists staff_members_scope on public.staff_members;
create policy staff_members_scope on public.staff_members
  for all using (etablissement_id = current_establishment_id());

drop policy if exists staff_members_self_read on public.staff_members;
create policy staff_members_self_read on public.staff_members
  for select using (user_id = auth.uid());

-- staff_contracts : accès via le staff_member parent. Le membre lui-même
-- peut lire son propre contrat (transparence sur son propre volume/taux),
-- jamais celui d'un autre.
drop policy if exists staff_contracts_director on public.staff_contracts;
create policy staff_contracts_director on public.staff_contracts
  for all using (
    staff_member_id in (
      select id from public.staff_members where etablissement_id = current_establishment_id()
    )
  );

drop policy if exists staff_contracts_self_read on public.staff_contracts;
create policy staff_contracts_self_read on public.staff_contracts
  for select using (
    staff_member_id in (select id from public.staff_members where user_id = auth.uid())
  );

-- staff_documents : même schéma.
drop policy if exists staff_documents_director on public.staff_documents;
create policy staff_documents_director on public.staff_documents
  for all using (
    staff_member_id in (
      select id from public.staff_members where etablissement_id = current_establishment_id()
    )
  );

drop policy if exists staff_documents_self_read on public.staff_documents;
create policy staff_documents_self_read on public.staff_documents
  for select using (
    staff_member_id in (select id from public.staff_members where user_id = auth.uid())
  );


-- ============================================================================
-- 6b. LACUNE CORRIGÉE — lecture de son propre emploi du temps (Phase 7)
-- ============================================================================
-- Constat de l'audit (Phase 1) : `emplois_du_temps` n'avait, avant cette
-- migration, aucune policy de lecture pour l'enseignant lui-même — seul
-- `edt_scope` (propriétaire de l'établissement) existait
-- (0001_timetable_schema.sql). Un enseignant ne pouvait donc pas consulter
-- son propre emploi du temps par une requête directe. Ajout additif, ne
-- retire aucune policy existante.

drop policy if exists edt_self_read on public.emplois_du_temps;
create policy edt_self_read on public.emplois_du_temps
  for select
  using (
    enseignant_id in (select id from public.enseignants where user_id = auth.uid())
  );


-- ============================================================================
-- 7. STORAGE — staff-documents (privé)
-- ============================================================================
-- Chemin : {staff_member_id}/{timestamp}-{nom}. Même schéma que
-- claim-documents (migration 0008) et pointages-photos (migration 0002).

insert into storage.buckets (id, name, public)
values ('staff-documents', 'staff-documents', false)
on conflict (id) do nothing;

drop policy if exists "staff_documents_director_access" on storage.objects;
create policy "staff_documents_director_access" on storage.objects
  for all
  using (
    bucket_id = 'staff-documents'
    and exists (
      select 1 from public.staff_members sm
      where sm.id::text = (storage.foldername(name))[1]
        and sm.etablissement_id = current_establishment_id()
    )
  )
  with check (
    bucket_id = 'staff-documents'
    and exists (
      select 1 from public.staff_members sm
      where sm.id::text = (storage.foldername(name))[1]
        and sm.etablissement_id = current_establishment_id()
    )
  );

drop policy if exists "staff_documents_self_read" on storage.objects;
create policy "staff_documents_self_read" on storage.objects
  for select
  using (
    bucket_id = 'staff-documents'
    and exists (
      select 1 from public.staff_members sm
      where sm.id::text = (storage.foldername(name))[1]
        and sm.user_id = auth.uid()
    )
  );


-- ============================================================================
-- FIN — aucune colonne supprimée, aucune donnée existante modifiée ou
-- supprimée. Le rétro-remplissage de `staff_members` (section 3) n'effectue
-- que des INSERT conditionnels (`where not exists`), jamais d'UPDATE ni de
-- DELETE sur `enseignants`.
-- ============================================================================
