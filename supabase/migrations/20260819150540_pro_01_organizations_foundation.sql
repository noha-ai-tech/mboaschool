-- ============================================================================
-- PRO-01 — Organizations / school group foundation
--
-- PREPARED, NOT EXECUTED. Await Eddy + architect approval.
-- Additive only: no backfill, no destructive schema operation.
-- A standalone establishment keeps organization_id = null.
-- ============================================================================

create table if not exists public.organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(trim(name)) between 1 and 160),
  slug        text unique,
  -- An organization is a durable governance entity. Its owner profile must be
  -- reassigned or the organization explicitly removed before profile deletion.
  owner_id    uuid not null references public.profiles(id) on delete restrict,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_organizations_owner_id
  on public.organizations(owner_id);

alter table public.establishments
  add column if not exists organization_id uuid
    references public.organizations(id) on delete set null;

create index if not exists idx_establishments_organization_id
  on public.establishments(organization_id);

create or replace function public.touch_organization_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists organizations_touch_updated_at on public.organizations;
create trigger organizations_touch_updated_at
  before update on public.organizations
  for each row execute procedure public.touch_organization_updated_at();

alter table public.organizations enable row level security;

-- Explicit grants keep this table available through the Data API even for
-- projects where automatic public-schema exposure is disabled. RLS remains
-- the row-level authority.
grant select, insert, update on public.organizations to authenticated;
-- Production already grants authenticated UPDATE at table level on
-- establishments. A column-level UPDATE grant would be redundant and would
-- not narrow that existing privilege, so none is added here.

create policy organizations_owner_select
  on public.organizations
  for select
  to authenticated
  using ((select auth.uid()) = owner_id);

create policy organizations_owner_insert
  on public.organizations
  for insert
  to authenticated
  with check ((select auth.uid()) = owner_id);

create policy organizations_owner_update
  on public.organizations
  for update
  to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

-- Existing establishment UPDATE policies remain intact. This restrictive
-- policy is combined with them using AND, so it cannot grant access to a row.
-- It only prevents a permitted updater from assigning an organization owned
-- by somebody else. Platform admins retain their existing maintenance scope.
create policy establishments_organization_owner_guard
  on public.establishments
  as restrictive
  for update
  to authenticated
  using (true)
  with check (
    organization_id is null
    or exists (
      select 1
      from public.organizations organization
      where organization.id = establishments.organization_id
        and organization.owner_id = (select auth.uid())
    )
    or exists (
      select 1
      from public.profiles profile
      where profile.id = (select auth.uid())
        and profile.role = 'platform_admin'
    )
  );

-- No organization is created automatically and no establishment is backfilled.
