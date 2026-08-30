-- PRO-02 — VALIDATED AND EXECUTED IN PRODUCTION ON 2026-08-19
-- Production migrations: pro_02_responsibilities_and_scopes_foundation,
-- pro_02_add_covering_fk_indexes, pro_02_complete_fk_indexes.
-- No backfill. No removal or rename of compatibility columns.
-- This consolidated file is the local reference; production history is split
-- across the three migration entries listed above.

-- ============================================================================
-- 1. CLOSED STRUCTURAL SCOPE TYPE + EXTENSIBLE RESPONSIBILITY CATALOG
-- ============================================================================

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'responsibility_scope_type'
  ) then
    create type public.responsibility_scope_type as enum (
      'establishment', 'section', 'department'
    );
  end if;
end $$;

create table if not exists public.responsibility_catalog (
  code        text primary key
              check (code ~ '^[a-z][a-z0-9_]{1,63}$'),
  label       text not null check (length(trim(label)) between 1 and 120),
  description text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

-- Reference values only. This proposal creates no assignment and no user data.
insert into public.responsibility_catalog (code, label) values
  ('enseignant', 'Enseignant'),
  ('directeur', 'Directeur'),
  ('proviseur', 'Proviseur'),
  ('principal', 'Principal'),
  ('censeur', 'Censeur'),
  ('animateur_pedagogique', 'Animateur pédagogique'),
  ('responsable_section', 'Responsable de section'),
  ('responsable_departement', 'Responsable de département'),
  ('secretaire', 'Secrétaire'),
  ('comptable', 'Comptable'),
  ('admin_principal', 'Administrateur principal'),
  ('assistant', 'Assistant')
on conflict (code) do nothing;

alter table public.responsibility_catalog enable row level security;
revoke all privileges on table public.responsibility_catalog from anon, authenticated;
grant select on public.responsibility_catalog to authenticated;

drop policy if exists responsibility_catalog_authenticated_read
  on public.responsibility_catalog;
create policy responsibility_catalog_authenticated_read
  on public.responsibility_catalog
  for select
  to authenticated
  using (true);


-- ============================================================================
-- 2. CANONICAL SCHOOL DEPARTMENTS — ADDITIVE, NO SUBJECT BACKFILL
-- ============================================================================

create table if not exists public.departments (
  id                 uuid primary key default gen_random_uuid(),
  etablissement_id   uuid not null
                     references public.establishments(id) on delete cascade,
  code               text not null
                     check (code ~ '^[a-z][a-z0-9_]{1,63}$'),
  name               text not null check (length(trim(name)) between 1 and 120),
  is_active          boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (etablissement_id, code),
  unique (id, etablissement_id)
);

create index if not exists idx_departments_establishment_active
  on public.departments(etablissement_id, is_active);

alter table public.matieres
  add column if not exists department_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'matieres_department_same_establishment_fkey'
      and conrelid = 'public.matieres'::regclass
  ) then
    alter table public.matieres
      add constraint matieres_department_same_establishment_fkey
      foreign key (department_id, etablissement_id)
      references public.departments(id, etablissement_id)
      on delete set null (department_id);
  end if;
end $$;

create index if not exists idx_matieres_department_id
  on public.matieres(department_id)
  where department_id is not null;

create index if not exists idx_matieres_department_establishment
  on public.matieres(department_id, etablissement_id);

alter table public.departments enable row level security;
revoke all privileges on table public.departments from anon, authenticated;
grant select, insert, update, delete on public.departments to authenticated;

drop policy if exists departments_member_select on public.departments;
create policy departments_member_select
  on public.departments
  for select
  to authenticated
  using (
    exists (
      select 1 from public.establishments e
      where e.id = departments.etablissement_id
        and e.owner_id = (select auth.uid())
    )
    or exists (
      select 1 from public.staff_members sm
      where sm.etablissement_id = departments.etablissement_id
        and sm.user_id = (select auth.uid())
        and sm.status = 'actif'
    )
    or exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.role = 'platform_admin'
    )
  );

drop policy if exists departments_owner_insert on public.departments;
create policy departments_owner_insert
  on public.departments
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.establishments e
      where e.id = departments.etablissement_id
        and e.owner_id = (select auth.uid())
    )
    or exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.role = 'platform_admin'
    )
  );

drop policy if exists departments_owner_update on public.departments;
create policy departments_owner_update
  on public.departments
  for update
  to authenticated
  using (
    exists (
      select 1 from public.establishments e
      where e.id = departments.etablissement_id
        and e.owner_id = (select auth.uid())
    )
    or exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.role = 'platform_admin'
    )
  )
  with check (
    exists (
      select 1 from public.establishments e
      where e.id = departments.etablissement_id
        and e.owner_id = (select auth.uid())
    )
    or exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.role = 'platform_admin'
    )
  );

drop policy if exists departments_owner_delete on public.departments;
create policy departments_owner_delete
  on public.departments
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.establishments e
      where e.id = departments.etablissement_id
        and e.owner_id = (select auth.uid())
    )
    or exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.role = 'platform_admin'
    )
  );


-- ============================================================================
-- 3. COMPOSITE TENANT KEYS REQUIRED BY CROSS-SCHOOL-SAFE FOREIGN KEYS
-- ============================================================================

create unique index if not exists uq_staff_members_id_establishment
  on public.staff_members(id, etablissement_id);

create unique index if not exists uq_sections_id_establishment
  on public.sections(id, etablissement_id);


-- ============================================================================
-- 4. MULTIPLE RESPONSIBILITIES WITH EXPLICIT SCOPES
-- ============================================================================

create table if not exists public.staff_responsibilities (
  id                  uuid primary key default gen_random_uuid(),
  staff_member_id     uuid not null,
  establishment_id    uuid not null
                      references public.establishments(id) on delete cascade,
  responsibility_code text not null
                      references public.responsibility_catalog(code) on delete restrict,
  scope_type           public.responsibility_scope_type not null,
  section_id           uuid,
  department_id        uuid,
  is_active            boolean not null default true,
  starts_at            date not null default current_date,
  ends_at              date,
  created_by           uuid default auth.uid()
                       references auth.users(id) on delete set null,
  created_at           timestamptz not null default now(),
  revoked_by           uuid references auth.users(id) on delete set null,
  revoked_at           timestamptz,
  revocation_reason    text,
  updated_at           timestamptz not null default now(),

  constraint staff_responsibilities_staff_same_establishment_fkey
    foreign key (staff_member_id, establishment_id)
    references public.staff_members(id, etablissement_id)
    on delete cascade,

  constraint staff_responsibilities_section_same_establishment_fkey
    foreign key (section_id, establishment_id)
    references public.sections(id, etablissement_id)
    on delete restrict,

  constraint staff_responsibilities_department_same_establishment_fkey
    foreign key (department_id, establishment_id)
    references public.departments(id, etablissement_id)
    on delete restrict,

  constraint staff_responsibilities_scope_shape_check check (
    (scope_type = 'establishment' and section_id is null and department_id is null)
    or (scope_type = 'section' and section_id is not null and department_id is null)
    or (scope_type = 'department' and section_id is null and department_id is not null)
  ),

  constraint staff_responsibilities_dates_check check (
    ends_at is null or ends_at >= starts_at
  ),

  constraint staff_responsibilities_revocation_check check (
    (
      is_active = true
      and revoked_at is null
      and revoked_by is null
      and revocation_reason is null
    )
    or (
      is_active = false
      and revoked_at is not null
      and revoked_by is not null
    )
  )
);

create index if not exists idx_staff_responsibilities_staff_member
  on public.staff_responsibilities(staff_member_id);

create index if not exists idx_staff_responsibilities_staff_establishment
  on public.staff_responsibilities(staff_member_id, establishment_id);

create index if not exists idx_staff_responsibilities_establishment_code
  on public.staff_responsibilities(establishment_id, responsibility_code);

create index if not exists idx_staff_responsibilities_responsibility_code
  on public.staff_responsibilities(responsibility_code);

create index if not exists idx_staff_responsibilities_section
  on public.staff_responsibilities(section_id)
  where section_id is not null;

create index if not exists idx_staff_responsibilities_section_establishment
  on public.staff_responsibilities(section_id, establishment_id);

create index if not exists idx_staff_responsibilities_department
  on public.staff_responsibilities(department_id)
  where department_id is not null;

create index if not exists idx_staff_responsibilities_department_establishment
  on public.staff_responsibilities(department_id, establishment_id);

create index if not exists idx_staff_responsibilities_created_by
  on public.staff_responsibilities(created_by);

create index if not exists idx_staff_responsibilities_revoked_by
  on public.staff_responsibilities(revoked_by);

create index if not exists idx_staff_responsibilities_effective_lookup
  on public.staff_responsibilities(
    establishment_id, staff_member_id, responsibility_code, scope_type
  )
  where is_active = true and revoked_at is null;

-- PostgreSQL 15+ NULLS NOT DISTINCT makes establishment-scoped NULL targets
-- participate in uniqueness instead of allowing duplicate NULL combinations.
create unique index if not exists uq_staff_responsibilities_exact_assignment
  on public.staff_responsibilities(
    staff_member_id, responsibility_code, scope_type, section_id, department_id
  ) nulls not distinct
  where is_active = true and revoked_at is null;


-- ============================================================================
-- 5. RLS — NO DEPENDENCY ON current_establishment_id()
-- ============================================================================

alter table public.staff_responsibilities enable row level security;

revoke all privileges on table public.staff_responsibilities from anon, authenticated;
grant select, insert on public.staff_responsibilities to authenticated;
grant update (
  is_active, starts_at, ends_at, revoked_by, revoked_at, revocation_reason
) on public.staff_responsibilities to authenticated;

drop policy if exists staff_responsibilities_select on public.staff_responsibilities;
create policy staff_responsibilities_select
  on public.staff_responsibilities
  for select
  to authenticated
  using (
    exists (
      select 1 from public.establishments e
      where e.id = staff_responsibilities.establishment_id
        and e.owner_id = (select auth.uid())
    )
    or exists (
      select 1 from public.staff_members sm
      where sm.id = staff_responsibilities.staff_member_id
        and sm.etablissement_id = staff_responsibilities.establishment_id
        and sm.user_id = (select auth.uid())
    )
    or exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.role = 'platform_admin'
    )
  );

drop policy if exists staff_responsibilities_owner_insert
  on public.staff_responsibilities;
create policy staff_responsibilities_owner_insert
  on public.staff_responsibilities
  for insert
  to authenticated
  with check (
    created_by = (select auth.uid())
    and (
      exists (
        select 1 from public.establishments e
        where e.id = staff_responsibilities.establishment_id
          and e.owner_id = (select auth.uid())
      )
      or exists (
        select 1 from public.profiles p
        where p.id = (select auth.uid()) and p.role = 'platform_admin'
      )
    )
  );

drop policy if exists staff_responsibilities_owner_update
  on public.staff_responsibilities;
create policy staff_responsibilities_owner_update
  on public.staff_responsibilities
  for update
  to authenticated
  using (
    exists (
      select 1 from public.establishments e
      where e.id = staff_responsibilities.establishment_id
        and e.owner_id = (select auth.uid())
    )
    or exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.role = 'platform_admin'
    )
  )
  with check (
    (revoked_by is null or revoked_by = (select auth.uid()))
    and (
      exists (
        select 1 from public.establishments e
        where e.id = staff_responsibilities.establishment_id
          and e.owner_id = (select auth.uid())
      )
      or exists (
        select 1 from public.profiles p
        where p.id = (select auth.uid()) and p.role = 'platform_admin'
      )
    )
  );

-- No DELETE policy and no DELETE grant: revoke by lifecycle UPDATE.


-- ============================================================================
-- 6. UPDATED_AT + AUDIT LOG REUSE
-- ============================================================================

create schema if not exists private;

create or replace function private.touch_pro02_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function private.touch_pro02_updated_at() from public, anon, authenticated;

drop trigger if exists departments_touch_updated_at on public.departments;
create trigger departments_touch_updated_at
  before update on public.departments
  for each row execute function private.touch_pro02_updated_at();

drop trigger if exists staff_responsibilities_touch_updated_at
  on public.staff_responsibilities;
create trigger staff_responsibilities_touch_updated_at
  before update on public.staff_responsibilities
  for each row execute function private.touch_pro02_updated_at();

create or replace function private.audit_staff_responsibility_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_uuid uuid;
begin
  if tg_op = 'DELETE' then
    target_uuid := old.id;
  else
    target_uuid := new.id;
  end if;

  insert into public.platform_audit_log (
    actor_id, action, target_type, target_id, metadata
  ) values (
    auth.uid(),
    'staff_responsibility.' || lower(tg_op),
    'staff_responsibility',
    target_uuid,
    jsonb_build_object(
      'old', case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
      'new', case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end
    )
  );
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function private.audit_staff_responsibility_change()
  from public, anon, authenticated;

drop trigger if exists staff_responsibilities_audit
  on public.staff_responsibilities;
create trigger staff_responsibilities_audit
  after insert or update or delete on public.staff_responsibilities
  for each row execute function private.audit_staff_responsibility_change();


-- ============================================================================
-- 7. EXPLICIT NON-ACTIONS
-- ============================================================================
-- No modification of profiles.role, staff_members.role, enseignants,
-- sections.responsable_staff_member_id or matieres.departement_disciplinaire.
-- No organization membership. No business responsibility assignment.
-- No department or subject backfill. No current_establishment_id() rewrite.
