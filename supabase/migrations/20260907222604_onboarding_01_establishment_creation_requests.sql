-- ============================================================================
-- 20260907222604_onboarding_01_establishment_creation_requests.sql
--
-- PRÉPARÉE MAIS NON EXÉCUTÉE.
-- ONBOARDING-01 — permet à un utilisateur professionnel dont l'établissement
-- n'existe pas encore dans le registre de le PROPOSER, avec vérification
-- anti-doublon et validation admin, plutôt que de créer une fiche publique
-- immédiate et non vérifiée.
--
-- Complète (ne remplace pas) le système de revendication existant
-- (0008_school_onboarding.sql : establishment_claims). Une revendication
-- porte sur un établissement DÉJÀ référencé ; une demande de création porte
-- sur un établissement qui n'existe PAS ENCORE. Même philosophie de
-- sécurité : le demandeur n'obtient jamais de droits directement — seule
-- l'approbation d'un platform_admin, via une fonction SECURITY DEFINER
-- atomique, crée l'établissement et le rattache à son propriétaire.
--
-- Ne modifie AUCUNE donnée existante. N'ajoute AUCUNE colonne destructive.
-- ============================================================================


-- ============================================================================
-- 1. ÉTATS MÉTIER
-- ============================================================================

create type establishment_creation_status as enum (
  'pending',    -- soumise, en attente de traitement
  'under_review', -- un admin l'examine (anti-doublon, vérification)
  'approved',   -- établissement créé et rattaché
  'rejected',   -- refusée (doublon confirmé, informations invalides, etc.)
  'duplicate'   -- refusée spécifiquement car un établissement existant correspond déjà
);


-- ============================================================================
-- 2. TABLE DES DEMANDES DE CRÉATION
-- ============================================================================

create table if not exists public.establishment_creation_requests (
  id                 uuid primary key default gen_random_uuid(),
  requester_user_id  uuid not null references auth.users(id) on delete cascade,

  -- Établissement proposé — sous-ensemble des colonnes establishments
  -- réellement fiables aujourd'hui (voir ESTABLISHMENT_COLUMNS dans le code
  -- applicatif) ; pas de région/département, cette hiérarchie n'existe pas
  -- encore sur establishments elle-même.
  proposed_name          text not null,
  proposed_main_category text,
  proposed_city          text,
  proposed_neighborhood  text,
  proposed_address       text,
  proposed_phone         text not null,
  proposed_email         text not null,
  proposed_website       text,

  -- Le demandeur et son rôle déclaré — mêmes champs que establishment_claims
  -- pour rester cohérent avec le formulaire de revendication existant.
  first_name  text not null,
  last_name   text not null,
  role_title  text not null,
  comments    text,

  -- Anti-doublon : établissement existant que l'admin (ou le demandeur,
  -- avant soumission) a rapproché de cette proposition, le cas échéant.
  possible_duplicate_of uuid references public.establishments(id) on delete set null,

  -- Traitement admin
  status         establishment_creation_status not null default 'pending',
  admin_comment  text,
  reviewed_by    uuid references auth.users(id),
  reviewed_at    timestamptz,

  -- Renseigné uniquement après approbation (Phase 7) — l'établissement
  -- réellement créé par la fonction d'approbation.
  created_establishment_id uuid references public.establishments(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_creation_requests_requester on public.establishment_creation_requests(requester_user_id);
create index if not exists idx_creation_requests_status on public.establishment_creation_requests(status);

-- Documents justificatifs optionnels — même schéma que
-- establishment_claim_documents, table dédiée pour ne jamais mélanger les
-- deux buckets/policies malgré la forme identique.
create table if not exists public.establishment_creation_request_documents (
  id           uuid primary key default gen_random_uuid(),
  request_id   uuid not null references public.establishment_creation_requests(id) on delete cascade,
  file_name    text not null,
  storage_path text not null,
  uploaded_at  timestamptz not null default now()
);

create index if not exists idx_creation_request_documents_request on public.establishment_creation_request_documents(request_id);


-- ============================================================================
-- 3. RLS — establishment_creation_requests / documents
-- ============================================================================

alter table public.establishment_creation_requests enable row level security;
alter table public.establishment_creation_request_documents enable row level security;

drop policy if exists "requester reads own creation requests" on public.establishment_creation_requests;
create policy "requester reads own creation requests" on public.establishment_creation_requests
  for select
  using (requester_user_id = auth.uid());

-- Le demandeur peut créer une demande pour lui-même uniquement. Aucune
-- vérification anti-doublon n'est imposée ICI par la policy (elle est plus
-- riche côté application — nom proche, ville proche — qu'une contrainte SQL
-- simple ne peut l'exprimer) ; l'admin la refait de toute façon avant
-- approbation, et l'établissement proposé ne devient jamais public tant que
-- cette approbation n'a pas eu lieu (section 5).
drop policy if exists "requester creates own creation request" on public.establishment_creation_requests;
create policy "requester creates own creation request" on public.establishment_creation_requests
  for insert
  with check (requester_user_id = auth.uid());

drop policy if exists "platform_admin reads all creation requests" on public.establishment_creation_requests;
create policy "platform_admin reads all creation requests" on public.establishment_creation_requests
  for select
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'platform_admin')
  );

-- platform_admin peut mettre à jour le statut/commentaire d'une demande
-- (passage en cours, refus). L'APPROBATION passe exclusivement par la
-- fonction RPC de la section 5 (transaction atomique création + liaison),
-- jamais par un simple UPDATE de statut — voir cette section pour pourquoi.
drop policy if exists "platform_admin updates creation requests" on public.establishment_creation_requests;
create policy "platform_admin updates creation requests" on public.establishment_creation_requests
  for update
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'platform_admin')
  )
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'platform_admin')
  );

drop policy if exists "requester reads own creation request documents" on public.establishment_creation_request_documents;
create policy "requester reads own creation request documents" on public.establishment_creation_request_documents
  for select
  using (
    exists (
      select 1 from public.establishment_creation_requests r
      where r.id = request_id and r.requester_user_id = auth.uid()
    )
  );

drop policy if exists "platform_admin reads all creation request documents" on public.establishment_creation_request_documents;
create policy "platform_admin reads all creation request documents" on public.establishment_creation_request_documents
  for select
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'platform_admin')
  );

drop policy if exists "requester inserts own creation request documents" on public.establishment_creation_request_documents;
create policy "requester inserts own creation request documents" on public.establishment_creation_request_documents
  for insert
  with check (
    exists (
      select 1 from public.establishment_creation_requests r
      where r.id = request_id and r.requester_user_id = auth.uid()
    )
  );

drop policy if exists "requester deletes own creation request documents" on public.establishment_creation_request_documents;
create policy "requester deletes own creation request documents" on public.establishment_creation_request_documents
  for delete
  using (
    exists (
      select 1 from public.establishment_creation_requests r
      where r.id = request_id and r.requester_user_id = auth.uid() and r.status = 'pending'
    )
  );


-- ============================================================================
-- 4. STORAGE — creation-request-documents (privé)
-- ============================================================================
-- Chemin des fichiers : {request_id}/{timestamp}-{nom}.{ext} — même
-- convention que claim-documents, bucket séparé pour ne jamais mélanger les
-- deux familles de justificatifs.

insert into storage.buckets (id, name, public)
values ('creation-request-documents', 'creation-request-documents', false)
on conflict (id) do nothing;

drop policy if exists "creation_request_documents_requester_access" on storage.objects;
create policy "creation_request_documents_requester_access" on storage.objects
  for all
  using (
    bucket_id = 'creation-request-documents'
    and exists (
      select 1 from public.establishment_creation_requests r
      where r.id::text = (storage.foldername(name))[1]
        and r.requester_user_id = auth.uid()
    )
  )
  with check (
    bucket_id = 'creation-request-documents'
    and exists (
      select 1 from public.establishment_creation_requests r
      where r.id::text = (storage.foldername(name))[1]
        and r.requester_user_id = auth.uid()
    )
  );

drop policy if exists "creation_request_documents_admin_read" on storage.objects;
create policy "creation_request_documents_admin_read" on storage.objects
  for select
  using (
    bucket_id = 'creation-request-documents'
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'platform_admin')
  );


-- ============================================================================
-- 5. APPROBATION ATOMIQUE — fonction SECURITY DEFINER
-- ============================================================================
-- Un simple UPDATE de statut ne suffit pas ici : approuver une demande de
-- création doit (1) créer l'établissement, (2) le rattacher au demandeur
-- comme owner, (3) marquer la demande approuvée, dans UNE seule transaction
-- — jamais un établissement créé sans owner, ni une demande "approved" sans
-- établissement réellement créé. PL/pgSQL exécute dans une transaction
-- implicite unique ; toute erreur fait échouer l'ensemble (aucun état
-- partiel possible), contrairement à plusieurs appels séparés depuis le
-- code applicatif.
--
-- SECURITY DEFINER + vérification explicite du rôle admin à l'intérieur de
-- la fonction (jamais uniquement côté RLS de la table appelante) — même
-- garde que les routes API admin existantes (voir approve/route.ts).
create or replace function public.approve_establishment_creation_request(
  p_request_id uuid,
  p_admin_comment text default null
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_request public.establishment_creation_requests;
  v_new_establishment_id uuid;
begin
  if not exists (
    select 1 from public.profiles where id = auth.uid() and role = 'platform_admin'
  ) then
    raise exception 'Accès refusé : réservé aux administrateurs de la plateforme';
  end if;

  select * into v_request
  from public.establishment_creation_requests
  where id = p_request_id
  for update; -- verrou : deux admins ne peuvent pas approuver la même demande en même temps

  if v_request.id is null then
    raise exception 'Demande introuvable';
  end if;
  if v_request.status not in ('pending', 'under_review') then
    raise exception 'Cette demande a déjà été traitée (statut actuel : %)', v_request.status;
  end if;

  insert into public.establishments (
    name, main_category, city, neighborhood, address, phone, email, website,
    owner_id, is_claimed, is_verified, verification_status
  ) values (
    v_request.proposed_name, v_request.proposed_main_category, v_request.proposed_city,
    v_request.proposed_neighborhood, v_request.proposed_address, v_request.proposed_phone,
    v_request.proposed_email, v_request.proposed_website,
    v_request.requester_user_id, true, true, 'active'
  )
  returning id into v_new_establishment_id;

  update public.establishment_creation_requests
  set status = 'approved',
      admin_comment = p_admin_comment,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      updated_at = now(),
      created_establishment_id = v_new_establishment_id
  where id = p_request_id;

  return v_new_establishment_id;
end;
$$;


-- ============================================================================
-- FIN — aucune colonne supprimée, aucune donnée existante modifiée, aucune
-- opération destructive. N'affecte aucune règle RLS/table préexistante.
-- ============================================================================
