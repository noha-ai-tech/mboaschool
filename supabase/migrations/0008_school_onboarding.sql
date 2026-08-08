-- ============================================================================
-- 0008_school_onboarding.sql
--
-- PRÉPARÉE MAIS NON EXÉCUTÉE.
-- Mission 02 — School Onboarding. Ne pas exécuter dans Supabase SQL Editor
-- sans validation explicite d'Eddy et de l'architecte.
--
-- Objectif : permettre à un établissement déjà référencé (créé par seed ou
-- par import) d'être revendiqué par un utilisateur réel, vérifié par l'équipe
-- Écoles237, puis lié à son propriétaire (Administrateur Principal) qui
-- obtient l'accès au dashboard existant (dashboard/ecole/*, inchangé).
--
-- Ne modifie AUCUNE donnée existante. N'ajoute AUCUNE colonne destructive.
-- Documentation complète : docs/onboarding/{FLOW,STATES,API,DATABASE,SECURITY}.md
-- ============================================================================


-- ============================================================================
-- 1. ÉTATS MÉTIER
-- ============================================================================

-- État de vérification de l'établissement lui-même (une valeur par école).
create type establishment_verification_status as enum (
  'referenced',       -- présent dans l'annuaire, jamais revendiqué
  'claim_requested',  -- une demande de revendication est en cours
  'under_review',     -- l'équipe Écoles237 analyse les justificatifs
  'verified',         -- validé par l'équipe
  'active',           -- dashboard activé, Administrateur Principal lié
  'suspended'         -- accès suspendu (action de modération)
);

-- État d'une demande de revendication individuelle (une école peut faire
-- l'objet de plusieurs demandes successives si les précédentes échouent).
create type claim_status as enum ('new', 'in_review', 'accepted', 'rejected');

-- Colonne ajoutée à establishments — coexiste avec `is_claimed` (déjà utilisé
-- par l'annuaire public, voir seed_schools.sql / migration 0007). Les deux
-- sont tenues synchronisées par les routes API de validation (section 4) :
-- `verification_status = 'active'` implique toujours `is_claimed = true`.
alter table public.establishments
  add column if not exists verification_status establishment_verification_status
    not null default 'referenced';


-- ============================================================================
-- 2. TABLE DES DEMANDES DE REVENDICATION
-- ============================================================================

create table if not exists public.establishment_claims (
  id                 uuid primary key default gen_random_uuid(),
  establishment_id   uuid not null references public.establishments(id) on delete cascade,
  requester_user_id  uuid not null references auth.users(id) on delete cascade,

  -- Formulaire (Phase 4 de la mission)
  first_name  text not null,
  last_name   text not null,
  role_title  text not null,  -- "Fonction" : Directeur, Fondateur, Secrétariat...
  phone       text not null,
  email       text not null,
  comments    text,

  -- Traitement admin (Phase 5-6)
  status         claim_status not null default 'new',
  admin_comment  text,
  reviewed_by    uuid references auth.users(id),
  reviewed_at    timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_claims_establishment on public.establishment_claims(establishment_id);
create index if not exists idx_claims_requester on public.establishment_claims(requester_user_id);
create index if not exists idx_claims_status on public.establishment_claims(status);

-- Documents justificatifs (plusieurs fichiers possibles par demande).
create table if not exists public.establishment_claim_documents (
  id           uuid primary key default gen_random_uuid(),
  claim_id     uuid not null references public.establishment_claims(id) on delete cascade,
  file_name    text not null,
  storage_path text not null,
  uploaded_at  timestamptz not null default now()
);

create index if not exists idx_claim_documents_claim on public.establishment_claim_documents(claim_id);


-- ============================================================================
-- 3. RLS — establishment_claims / establishment_claim_documents
-- ============================================================================

alter table public.establishment_claims enable row level security;
alter table public.establishment_claim_documents enable row level security;

-- Le demandeur peut lire ses propres demandes.
drop policy if exists "requester reads own claims" on public.establishment_claims;
create policy "requester reads own claims" on public.establishment_claims
  for select
  using (requester_user_id = auth.uid());

-- Le demandeur peut créer une demande pour lui-même — UNIQUEMENT si
-- l'établissement n'est pas déjà revendiqué (owner_id null) et qu'aucune
-- demande n'est déjà en cours pour cet établissement (PHASE 8 : "aucune
-- école ne peut revendiquer celle d'une autre" — ici, une école ne peut pas
-- non plus recevoir deux revendications concurrentes).
drop policy if exists "requester creates own claim" on public.establishment_claims;
create policy "requester creates own claim" on public.establishment_claims
  for insert
  with check (
    requester_user_id = auth.uid()
    and exists (
      select 1 from public.establishments e
      where e.id = establishment_id and e.owner_id is null
    )
    and not exists (
      select 1 from public.establishment_claims existing
      where existing.establishment_id = establishment_id
        and existing.status in ('new', 'in_review')
    )
  );

-- platform_admin lit toutes les demandes.
drop policy if exists "platform_admin reads all claims" on public.establishment_claims;
create policy "platform_admin reads all claims" on public.establishment_claims
  for select
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'platform_admin')
  );

-- platform_admin peut mettre à jour le statut/commentaire d'une demande
-- (passage en cours, ajout d'un commentaire). L'approbation/le refus
-- passent par les routes API dédiées (section 6) qui, elles, écrivent aussi
-- sur `establishments` — cette policy couvre les mises à jour de la demande
-- elle-même, pas la liaison establishment <-> owner.
drop policy if exists "platform_admin updates claims" on public.establishment_claims;
create policy "platform_admin updates claims" on public.establishment_claims
  for update
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'platform_admin')
  )
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'platform_admin')
  );

-- Documents : lisibles par le demandeur propriétaire de la demande, ou par
-- platform_admin. Insertion réservée au demandeur, pour sa propre demande.
drop policy if exists "requester reads own claim documents" on public.establishment_claim_documents;
create policy "requester reads own claim documents" on public.establishment_claim_documents
  for select
  using (
    exists (
      select 1 from public.establishment_claims c
      where c.id = claim_id and c.requester_user_id = auth.uid()
    )
  );

drop policy if exists "platform_admin reads all claim documents" on public.establishment_claim_documents;
create policy "platform_admin reads all claim documents" on public.establishment_claim_documents
  for select
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'platform_admin')
  );

drop policy if exists "requester inserts own claim documents" on public.establishment_claim_documents;
create policy "requester inserts own claim documents" on public.establishment_claim_documents
  for insert
  with check (
    exists (
      select 1 from public.establishment_claims c
      where c.id = claim_id and c.requester_user_id = auth.uid()
    )
  );

drop policy if exists "requester deletes own claim documents" on public.establishment_claim_documents;
create policy "requester deletes own claim documents" on public.establishment_claim_documents
  for delete
  using (
    exists (
      select 1 from public.establishment_claims c
      where c.id = claim_id and c.requester_user_id = auth.uid() and c.status = 'new'
    )
  );


-- ============================================================================
-- 3b. TRANSITION AUTOMATIQUE establishments.verification_status
-- ============================================================================
-- Le demandeur n'est ni propriétaire ni platform_admin au moment où il crée
-- sa demande — il n'a donc, à raison, aucun droit RLS d'écriture sur
-- `establishments`. Ce trigger (security definer) fait cette unique
-- transition à sa place, de façon centralisée et auditable, plutôt que de
-- contourner RLS depuis le code applicatif. Les transitions suivantes
-- (under_review, verified/active, retour à referenced si refus) sont gérées
-- par les routes API admin, qui utilisent déjà le client service role pour
-- lier owner_id — voir docs/onboarding/DATABASE.md.

create or replace function public.handle_new_establishment_claim()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  update public.establishments
  set verification_status = 'claim_requested'
  where id = new.establishment_id
    and verification_status = 'referenced';
  return new;
end;
$$;

drop trigger if exists establishment_claims_after_insert on public.establishment_claims;
create trigger establishment_claims_after_insert
  after insert on public.establishment_claims
  for each row execute procedure public.handle_new_establishment_claim();


-- ============================================================================
-- 4. STORAGE — claim-documents (privé)
-- ============================================================================
-- Chemin des fichiers : {claim_id}/{timestamp}-{nom}.{ext}
-- Bucket privé : ces documents (pièce d'identité, registre de commerce,
-- autorisation d'ouverture...) ne sont jamais publics.

insert into storage.buckets (id, name, public)
values ('claim-documents', 'claim-documents', false)
on conflict (id) do nothing;

drop policy if exists "claim_documents_requester_access" on storage.objects;
create policy "claim_documents_requester_access" on storage.objects
  for all
  using (
    bucket_id = 'claim-documents'
    and exists (
      select 1 from public.establishment_claims c
      where c.id::text = (storage.foldername(name))[1]
        and c.requester_user_id = auth.uid()
    )
  )
  with check (
    bucket_id = 'claim-documents'
    and exists (
      select 1 from public.establishment_claims c
      where c.id::text = (storage.foldername(name))[1]
        and c.requester_user_id = auth.uid()
    )
  );

drop policy if exists "claim_documents_admin_read" on storage.objects;
create policy "claim_documents_admin_read" on storage.objects
  for select
  using (
    bucket_id = 'claim-documents'
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'platform_admin')
  );


-- ============================================================================
-- FIN — aucune colonne supprimée, aucune donnée existante modifiée,
-- aucune opération destructive. `is_claimed` (colonne existante) n'est pas
-- touché par cette migration ; sa synchronisation avec `verification_status`
-- est assurée par le code applicatif (routes API), pas par un trigger, pour
-- rester simple et explicite — voir docs/onboarding/DATABASE.md.
-- ============================================================================
