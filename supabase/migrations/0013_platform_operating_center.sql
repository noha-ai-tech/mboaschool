-- ============================================================================
-- 0013_platform_operating_center.sql
--
-- PREPAREE MAIS NON EXECUTEE.
-- Mission 08 - Platform Operating Center. Ne pas executer dans Supabase SQL
-- Editor sans validation explicite d'Eddy et de l'architecte.
--
-- Reserve aux administrateurs plateforme (role='platform_admin'). Aucune
-- table ici n'accorde d'acces aux ecoles ou aux enseignants, a l'exception
-- explicite de support_tickets (une ecole peut ouvrir un ticket - Phase 8).
--
-- Reutilise establishments.verification_status (deja prepare, migration
-- 0008, non execute non plus) pour suspendre/reactiver/verifier plutot que
-- de dupliquer un systeme de statut parallele.
--
-- AUCUNE SUPPRESSION PHYSIQUE (Phase 4) - toutes les tables sont additives,
-- les "suppressions" d'administrateur sont des changements de role, jamais
-- des DELETE.
-- ============================================================================


-- ============================================================================
-- 1. ROLES ADMINISTRATEUR (Phase 2)
-- ============================================================================
-- Extensible : de nouvelles valeurs pourront etre ajoutees plus tard via
-- ALTER TYPE ... ADD VALUE, sans casser l'existant.

create type platform_admin_role as enum ('super_admin', 'platform_admin', 'operations_admin');

-- N'a de sens que lorsque profiles.role = 'platform_admin'. Pas de contrainte
-- CHECK bloquante (migration additive, ne doit pas casser des lignes deja
-- en 'platform_admin' sans admin_role) - la coherence est assuree par les
-- routes API de gestion des administrateurs (Phase 2), pas par la base.
alter table public.profiles
  add column if not exists admin_role platform_admin_role;

create or replace function public.is_platform_admin()
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'platform_admin'
  );
$$;

-- Barrière plus fine que is_platform_admin() : réservée aux volets
-- commercial/financier/sensible (abonnements, paiements, journal d'audit),
-- où operations_admin est volontairement exclu (src/lib/platform/
-- permissions.ts). Sans cette fonction, RLS n'aurait pas su distinguer les
-- admin_role entre eux - operations_admin aurait pu écrire directement sur
-- ces tables via l'API REST malgré l'UI qui masque les actions.
create or replace function public.is_commercial_admin()
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'platform_admin' and admin_role in ('super_admin', 'platform_admin')
  );
$$;

-- Protection Super Admin (Phase 2) : impossible de retirer le role ou de
-- supprimer le dernier super_admin restant. Defense en profondeur - la regle
-- "seul un super_admin peut modifier un autre administrateur" est appliquee
-- cote route API (src/lib/platform/permissions.ts), ce trigger empeche en
-- plus toute situation ou la plateforme se retrouverait sans aucun super_admin.
create or replace function public.protect_last_super_admin()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_remaining int;
begin
  if TG_OP = 'DELETE' then
    if old.admin_role = 'super_admin' then
      select count(*) into v_remaining from public.profiles
        where admin_role = 'super_admin' and id <> old.id;
      if v_remaining = 0 then
        raise exception 'Impossible de supprimer le dernier Super Admin.' using errcode = 'P0001';
      end if;
    end if;
    return old;
  end if;

  if old.admin_role = 'super_admin'
     and (new.admin_role is distinct from 'super_admin' or new.role <> 'platform_admin') then
    select count(*) into v_remaining from public.profiles
      where admin_role = 'super_admin' and id <> old.id;
    if v_remaining = 0 then
      raise exception 'Impossible de retirer le dernier Super Admin.' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_last_super_admin on public.profiles;
create trigger profiles_protect_last_super_admin
  before update or delete on public.profiles
  for each row execute procedure public.protect_last_super_admin();


-- ============================================================================
-- 2. JOURNAL D'AUDIT (Phase 9) - append-only
-- ============================================================================
-- Aucune policy INSERT/UPDATE/DELETE pour les clients : la seule voie
-- d'ecriture est la fonction security definer ci-dessous, qui verifie
-- elle-meme l'appelant. "Connexion" n'est pas historisee dans cette version
-- (necessiterait un Auth Hook Supabase, hors perimetre de cette migration) -
-- l'action reste prevue dans le type, simplement jamais emise pour l'instant.

create table if not exists public.platform_audit_log (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid references public.profiles(id) on delete set null,
  action      text not null,
  target_type text,
  target_id   uuid,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists idx_audit_log_created_at on public.platform_audit_log (created_at desc);
create index if not exists idx_audit_log_action on public.platform_audit_log (action);

alter table public.platform_audit_log enable row level security;

create policy "platform_admin peut lire le journal d'audit"
  on public.platform_audit_log for select
  using (public.is_commercial_admin());

create or replace function public.log_platform_action(
  p_action text, p_target_type text, p_target_id uuid, p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Reserve aux administrateurs plateforme.' using errcode = '42501';
  end if;
  insert into public.platform_audit_log (actor_id, action, target_type, target_id, metadata)
  values (auth.uid(), p_action, p_target_type, p_target_id, p_metadata);
end;
$$;

grant execute on function public.log_platform_action(text, text, uuid, jsonb) to authenticated;


-- ============================================================================
-- 3. CRM COMMERCIAL (Phase 5)
-- ============================================================================

create type crm_status as enum ('prospect', 'contacte', 'demonstration', 'essai', 'client', 'suspendu', 'resilie');

create table if not exists public.establishment_crm (
  establishment_id  uuid primary key references public.establishments(id) on delete cascade,
  status            crm_status not null default 'prospect',
  next_followup_date date,
  assigned_admin_id uuid references public.profiles(id) on delete set null,
  updated_at        timestamptz not null default now()
);

create table if not exists public.crm_notes (
  id                uuid primary key default gen_random_uuid(),
  establishment_id  uuid not null references public.establishments(id) on delete cascade,
  author_id         uuid references public.profiles(id) on delete set null,
  comment           text not null,
  created_at        timestamptz not null default now()
);

create index if not exists idx_crm_notes_establishment on public.crm_notes (establishment_id, created_at desc);

alter table public.establishment_crm enable row level security;
alter table public.crm_notes enable row level security;

create policy "platform_admin gere le CRM" on public.establishment_crm for all
  using (public.is_platform_admin()) with check (public.is_platform_admin());

create policy "platform_admin gere les notes CRM" on public.crm_notes for all
  using (public.is_platform_admin()) with check (public.is_platform_admin());

-- Historique automatique : une note systeme est ajoutee a chaque changement
-- de statut CRM, en plus des commentaires manuels ("Afficher : historique").
create or replace function public.log_crm_status_change()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if TG_OP = 'INSERT' or new.status is distinct from old.status then
    insert into public.crm_notes (establishment_id, author_id, comment)
    values (
      new.establishment_id,
      auth.uid(),
      case when TG_OP = 'INSERT'
        then 'Statut initial : ' || new.status::text
        else 'Statut changé : ' || old.status::text || ' -> ' || new.status::text
      end
    );
  end if;
  return new;
end;
$$;

drop trigger if exists establishment_crm_log_status on public.establishment_crm;
create trigger establishment_crm_log_status
  after insert or update on public.establishment_crm
  for each row execute procedure public.log_crm_status_change();


-- ============================================================================
-- 4. ABONNEMENTS (Phase 6) - historique commercial, distinct du technique
-- ============================================================================
-- `subscriptions` est un historique commercial (offres Decouverte/Verifiee/
-- Pro), separe de `establishments.forfait`/`subscription_plan` (colonnes
-- techniques deja utilisees par le middleware pour le gating Pro, migration
-- 0005, deja en production - non modifiees ici). Le rapprochement des deux
-- axes est une decision produit a trancher separement avec Eddy.

create type subscription_plan_v2 as enum ('decouverte', 'verifiee', 'pro');
create type subscription_status as enum ('active', 'expiree', 'annulee');

create table if not exists public.subscriptions (
  id                uuid primary key default gen_random_uuid(),
  establishment_id  uuid not null references public.establishments(id) on delete cascade,
  plan              subscription_plan_v2 not null,
  status            subscription_status not null default 'active',
  started_at        timestamptz not null default now(),
  expires_at        timestamptz,
  created_by        uuid references public.profiles(id) on delete set null,
  created_at        timestamptz not null default now()
);

create index if not exists idx_subscriptions_establishment on public.subscriptions (establishment_id, created_at desc);

alter table public.subscriptions enable row level security;

create policy "platform_admin gere les abonnements" on public.subscriptions for all
  using (public.is_commercial_admin()) with check (public.is_commercial_admin());


-- ============================================================================
-- 5. PAIEMENTS (Phase 7) - architecture uniquement, aucune API connectee
-- ============================================================================

create type platform_payment_provider as enum ('mtn_momo', 'orange_money');
create type platform_payment_status as enum ('pending', 'paid', 'failed', 'refunded');

create table if not exists public.platform_payments (
  id                uuid primary key default gen_random_uuid(),
  establishment_id  uuid references public.establishments(id) on delete set null,
  subscription_id   uuid references public.subscriptions(id) on delete set null,
  provider          platform_payment_provider not null,
  reference         text,
  amount            integer not null,
  currency          text not null default 'FCFA',
  status            platform_payment_status not null default 'pending',
  created_at        timestamptz not null default now()
);

alter table public.platform_payments enable row level security;

create policy "platform_admin lit les paiements" on public.platform_payments for select
  using (public.is_commercial_admin());

-- Aucune policy INSERT/UPDATE : table vide en V1, aucune ecriture prevue
-- avant le branchement reel d'un fournisseur (hors perimetre, Phase 7).


-- ============================================================================
-- 6. SUPPORT (Phase 8)
-- ============================================================================
-- Seule table de cette migration accessible aux etablissements : une ecole
-- peut ouvrir un ticket et lire/ecrire ses propres messages, jamais ceux
-- d'une autre ecole (meme pattern owner_id que le reste du depot).

create type ticket_status as enum ('ouvert', 'en_cours', 'en_attente', 'resolu', 'ferme');

create table if not exists public.support_tickets (
  id                uuid primary key default gen_random_uuid(),
  establishment_id  uuid not null references public.establishments(id) on delete cascade,
  created_by        uuid references public.profiles(id) on delete set null,
  subject           text not null,
  status            ticket_status not null default 'ouvert',
  assigned_admin_id uuid references public.profiles(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table if not exists public.support_ticket_messages (
  id          uuid primary key default gen_random_uuid(),
  ticket_id   uuid not null references public.support_tickets(id) on delete cascade,
  author_id   uuid references public.profiles(id) on delete set null,
  body        text not null,
  created_at  timestamptz not null default now()
);

create index if not exists idx_support_tickets_establishment on public.support_tickets (establishment_id, created_at desc);
create index if not exists idx_support_messages_ticket on public.support_ticket_messages (ticket_id, created_at asc);

alter table public.support_tickets enable row level security;
alter table public.support_ticket_messages enable row level security;

create policy "Ecole gere ses propres tickets" on public.support_tickets for all
  using (
    exists (select 1 from public.establishments e where e.id = establishment_id and e.owner_id = auth.uid())
  )
  with check (
    exists (select 1 from public.establishments e where e.id = establishment_id and e.owner_id = auth.uid())
  );

create policy "platform_admin gere tous les tickets" on public.support_tickets for all
  using (public.is_platform_admin()) with check (public.is_platform_admin());

create policy "Ecole lit/ecrit les messages de ses tickets" on public.support_ticket_messages for all
  using (
    exists (
      select 1 from public.support_tickets t
      join public.establishments e on e.id = t.establishment_id
      where t.id = ticket_id and e.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.support_tickets t
      join public.establishments e on e.id = t.establishment_id
      where t.id = ticket_id and e.owner_id = auth.uid()
    )
  );

create policy "platform_admin gere tous les messages" on public.support_ticket_messages for all
  using (public.is_platform_admin()) with check (public.is_platform_admin());


-- ============================================================================
-- FIN - aucune colonne supprimee, aucune donnee modifiee en masse, aucune
-- policy retiree. Toutes les operations sont additives et idempotentes.
-- ============================================================================
