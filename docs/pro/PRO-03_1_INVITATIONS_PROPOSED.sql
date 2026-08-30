-- PRO-03.2 — PROPOSED, NOT VALIDATED, NOT EXECUTED
-- Targeted, expiring, revocable and single-use invitations.
-- Do not execute without Eddy + architect approval.

begin;

create extension if not exists pgcrypto with schema extensions;
create schema if not exists private;

revoke all on schema private from public, anon, authenticated;

-- --------------------------------------------------------------------------
-- Preflight and durable staff/teacher same-establishment invariant.
-- The migration must abort rather than silently repair business data.
-- --------------------------------------------------------------------------

do $preflight$
begin
  if exists (
    select 1
      from public.staff_members staff
      join public.enseignants teacher on teacher.id = staff.enseignant_id
     where staff.enseignant_id is not null
       and staff.etablissement_id <> teacher.etablissement_id
  ) then
    raise exception 'invitation migration blocked: cross-school staff/teacher link exists';
  end if;

  if exists (
    select staff.enseignant_id
      from public.staff_members staff
     where staff.enseignant_id is not null
     group by staff.enseignant_id
    having count(*) > 1
  ) then
    raise exception 'invitation migration blocked: one teacher has multiple staff rows';
  end if;
end;
$preflight$;

create unique index if not exists uq_enseignants_id_etablissement
  on public.enseignants(id, etablissement_id);

create unique index if not exists uq_staff_members_enseignant
  on public.staff_members(enseignant_id)
  where enseignant_id is not null;

do $constraint$
begin
  if not exists (
    select 1
      from pg_catalog.pg_constraint c
     where c.conname = 'staff_members_teacher_same_establishment_fkey'
       and c.conrelid = 'public.staff_members'::regclass
  ) then
    alter table public.staff_members
      add constraint staff_members_teacher_same_establishment_fkey
      foreign key (enseignant_id, etablissement_id)
      references public.enseignants(id, etablissement_id);
  end if;
end;
$constraint$;

-- --------------------------------------------------------------------------
-- Invitation history. The private schema is not exposed through the Data API.
-- RLS remains enabled as defense in depth. No client or service role receives
-- direct table privileges: controlled functions are the only write surface.
-- --------------------------------------------------------------------------

create table private.targeted_invitations (
  id uuid primary key default gen_random_uuid(),
  token_hash char(64) not null unique,
  establishment_id uuid not null
    references public.establishments(id) on delete restrict,
  resource_type text not null
    check (resource_type in ('teacher', 'staff_member')),
  resource_id uuid not null,
  recipient_email text not null
    check (
      recipient_email = lower(btrim(recipient_email))
      and length(recipient_email) between 3 and 320
    ),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  consumed_by uuid references auth.users(id) on delete set null,
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id) on delete set null,
  revocation_reason text,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),

  constraint targeted_invitations_expiry_check
    check (expires_at > created_at),
  constraint targeted_invitations_consumption_check
    check (
      (consumed_at is null and consumed_by is null)
      or consumed_at is not null
    ),
  constraint targeted_invitations_revocation_check
    check (
      (revoked_at is null and revoked_by is null and revocation_reason is null)
      or (
        revoked_at is not null
        and revocation_reason is not null
        and length(btrim(revocation_reason)) between 1 and 500
      )
    ),
  constraint targeted_invitations_terminal_state_check
    check (consumed_at is null or revoked_at is null)
);

create index targeted_invitations_establishment_idx
  on private.targeted_invitations(establishment_id);

create index targeted_invitations_created_by_idx
  on private.targeted_invitations(created_by);

create index targeted_invitations_consumed_by_idx
  on private.targeted_invitations(consumed_by)
  where consumed_by is not null;

create index targeted_invitations_revoked_by_idx
  on private.targeted_invitations(revoked_by)
  where revoked_by is not null;

create index targeted_invitations_resource_lookup_idx
  on private.targeted_invitations(
    establishment_id, resource_type, resource_id, created_at desc
  );

-- `now()` cannot be used in an index predicate. Expired open invitations are
-- atomically revoked by create_targeted_invitation before a replacement is
-- inserted. This partial unique index therefore enforces one open invitation.
create unique index targeted_invitations_one_open_resource_idx
  on private.targeted_invitations(establishment_id, resource_type, resource_id)
  where consumed_at is null and revoked_at is null;

alter table private.targeted_invitations enable row level security;

revoke all privileges on table private.targeted_invitations
  from public, anon, authenticated, service_role;

-- --------------------------------------------------------------------------
-- Creation surface.
--
-- Kept in `public` because the authenticated Next.js server route must call it
-- through a future, separately approved delivery boundary. SECURITY DEFINER is
-- required because no application role has direct table privileges. The creator
-- is derived exclusively from auth.uid(); caller-controlled creator IDs are not
-- admitted. In PRO-03.2.2, EXECUTE is revoked from every Data API role and no
-- role receives a grant. The function is therefore versioned but dormant.
-- search_path is empty, every object is schema-qualified, and the function
-- independently validates ownership, resource, school, email and lifecycle.
--
-- No platform-admin exception is admitted in V1. Adding one later requires a
-- dedicated database permission, not a broad profiles.role shortcut.
-- --------------------------------------------------------------------------

-- Remove the superseded PRO-03.2 service-role signature if it was ever created
-- in an isolated review database. It must not remain callable alongside V1.
drop function if exists public.create_targeted_invitation(
  uuid, text, uuid, text, uuid, interval
);

create or replace function public.create_targeted_invitation(
  p_establishment_id uuid,
  p_resource_type text,
  p_resource_id uuid,
  p_recipient_email text,
  p_ttl interval default interval '48 hours'
)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_creator_id uuid := auth.uid();
  v_now timestamptz := statement_timestamp();
  v_normalized_email text := lower(btrim(p_recipient_email));
  v_raw_token text;
  v_teacher_id uuid;
  v_staff_id uuid;
  v_initial_teacher_id uuid;
  v_teacher_email text;
  v_staff_email text;
  v_teacher_user_id uuid;
  v_staff_user_id uuid;
  v_lock_id uuid;
begin
  if p_establishment_id is null
     or p_resource_id is null
     or p_recipient_email is null
     or p_ttl is null
     or p_resource_type is null
     or p_resource_type not in ('teacher', 'staff_member')
     or length(v_normalized_email) not between 3 and 320
     or p_ttl <= interval '0 seconds'
     or p_ttl > interval '7 days' then
    raise exception 'invalid invitation parameters' using errcode = '22023';
  end if;

  if not exists (
    select 1 from auth.users creator where creator.id = v_creator_id
  ) then
    raise exception 'authenticated invitation creator required' using errcode = '42501';
  end if;

  if not exists (
    select 1
      from public.establishments establishment
     where establishment.id = p_establishment_id
       and establishment.owner_id = v_creator_id
  ) then
    raise exception 'invitation creator is not establishment owner'
      using errcode = '42501';
  end if;

  -- Resolve only the explicitly targeted UUID + establishment before taking
  -- the canonical person lock. No email lookup is used to find a resource.
  if p_resource_type = 'teacher' then
    select teacher.id
      into v_teacher_id
      from public.enseignants teacher
     where teacher.id = p_resource_id
       and teacher.etablissement_id = p_establishment_id;

    if not found then
      raise exception 'invalid invitation resource' using errcode = '22023';
    end if;
    v_lock_id := v_teacher_id;
  else
    select staff.id, staff.enseignant_id
      into v_staff_id, v_initial_teacher_id
      from public.staff_members staff
     where staff.id = p_resource_id
       and staff.etablissement_id = p_establishment_id;

    if not found then
      raise exception 'invalid invitation resource' using errcode = '22023';
    end if;
    v_teacher_id := v_initial_teacher_id;
    v_lock_id := coalesce(v_teacher_id, v_staff_id);
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('targeted-invitation:' || v_lock_id::text, 0)
  );

  -- Consistent row-lock order: teacher first, then staff.
  if v_teacher_id is not null then
    select lower(btrim(teacher.email)), teacher.user_id
      into v_teacher_email, v_teacher_user_id
      from public.enseignants teacher
     where teacher.id = v_teacher_id
       and teacher.etablissement_id = p_establishment_id
     for update;

    if not found then
      raise exception 'invalid invitation resource' using errcode = '22023';
    end if;
  end if;

  if p_resource_type = 'teacher' then
    select staff.id, lower(btrim(staff.email)), staff.user_id
      into v_staff_id, v_staff_email, v_staff_user_id
      from public.staff_members staff
     where staff.enseignant_id = v_teacher_id
       and staff.etablissement_id = p_establishment_id
     for update;
  else
    select staff.enseignant_id, lower(btrim(staff.email)), staff.user_id
      into v_teacher_id, v_staff_email, v_staff_user_id
      from public.staff_members staff
     where staff.id = v_staff_id
       and staff.etablissement_id = p_establishment_id
     for update;

    if not found or v_teacher_id is distinct from v_initial_teacher_id then
      raise exception 'invalid invitation resource' using errcode = '22023';
    end if;
  end if;

  if p_resource_type = 'teacher' then
    if v_teacher_email is null or v_normalized_email <> v_teacher_email then
      raise exception 'invitation email does not match resource' using errcode = '22023';
    end if;
    if v_staff_email is not null and v_staff_email <> v_teacher_email then
      raise exception 'linked staff/teacher emails conflict' using errcode = '22023';
    end if;
  else
    if v_staff_email is null or v_normalized_email <> v_staff_email then
      raise exception 'invitation email does not match resource' using errcode = '22023';
    end if;
    if v_teacher_email is not null and v_teacher_email <> v_staff_email then
      raise exception 'linked staff/teacher emails conflict' using errcode = '22023';
    end if;
  end if;

  if v_teacher_user_id is not null or v_staff_user_id is not null then
    raise exception 'invitation resource is already linked' using errcode = '23505';
  end if;

  -- Preserve history while allowing replacement after natural expiry.
  update private.targeted_invitations invitation
     set revoked_at = v_now,
         revoked_by = v_creator_id,
         revocation_reason = 'expired_replaced'
   where invitation.establishment_id = p_establishment_id
     and invitation.consumed_at is null
     and invitation.revoked_at is null
     and invitation.expires_at <= v_now
     and (
       (v_teacher_id is not null
        and invitation.resource_type = 'teacher'
        and invitation.resource_id = v_teacher_id)
       or
       (v_staff_id is not null
        and invitation.resource_type = 'staff_member'
        and invitation.resource_id = v_staff_id)
     );

  if exists (
    select 1
      from private.targeted_invitations invitation
     where invitation.establishment_id = p_establishment_id
       and invitation.consumed_at is null
       and invitation.revoked_at is null
       and invitation.expires_at > v_now
       and (
         (v_teacher_id is not null
          and invitation.resource_type = 'teacher'
          and invitation.resource_id = v_teacher_id)
         or
         (v_staff_id is not null
          and invitation.resource_type = 'staff_member'
          and invitation.resource_id = v_staff_id)
       )
  ) then
    raise exception 'an active invitation already exists' using errcode = '23505';
  end if;

  v_raw_token := encode(extensions.gen_random_bytes(32), 'hex');

  insert into private.targeted_invitations (
    token_hash,
    establishment_id,
    resource_type,
    resource_id,
    recipient_email,
    expires_at,
    created_by
  ) values (
    encode(extensions.digest(v_raw_token, 'sha256'), 'hex'),
    p_establishment_id,
    p_resource_type,
    p_resource_id,
    v_normalized_email,
    v_now + p_ttl,
    v_creator_id
  );

  -- Returned exactly once to the authorized server caller for email delivery.
  -- The raw token is never stored in the database.
  return v_raw_token;
end;
$function$;

revoke execute on function public.create_targeted_invitation(
  uuid, text, uuid, text, interval
) from public, anon, authenticated, service_role;
-- PRO-03.2.2: intentionally no execution grant. Creation remains dormant.

-- Dormant owner-checked revocation. No DELETE is required in V1.
drop function if exists public.revoke_targeted_invitation(uuid, uuid, text);

create or replace function public.revoke_targeted_invitation(
  p_invitation_id uuid,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_revoker_id uuid := auth.uid();
  v_invitation private.targeted_invitations%rowtype;
begin
  if p_invitation_id is null
     or p_reason is null
     or length(btrim(p_reason)) not between 1 and 500 then
    raise exception 'invalid revocation parameters' using errcode = '22023';
  end if;

  if not exists (
    select 1 from auth.users revoker where revoker.id = v_revoker_id
  ) then
    raise exception 'authenticated invitation revoker required' using errcode = '42501';
  end if;

  select invitation.*
    into v_invitation
    from private.targeted_invitations invitation
   where invitation.id = p_invitation_id
   for update;

  if not found then
    return false;
  end if;

  if not exists (
    select 1
      from public.establishments establishment
     where establishment.id = v_invitation.establishment_id
       and establishment.owner_id = v_revoker_id
  ) then
    raise exception 'invitation revoker is not establishment owner'
      using errcode = '42501';
  end if;

  if v_invitation.consumed_at is not null or v_invitation.revoked_at is not null then
    return false;
  end if;

  update private.targeted_invitations invitation
     set revoked_at = statement_timestamp(),
         revoked_by = v_revoker_id,
         revocation_reason = btrim(p_reason)
   where invitation.id = p_invitation_id
     and invitation.consumed_at is null
     and invitation.revoked_at is null;

  return found;
end;
$function$;

revoke execute on function public.revoke_targeted_invitation(uuid, text)
  from public, anon, authenticated, service_role;
-- PRO-03.2.2: intentionally no execution grant. Revocation remains dormant until
-- an approved creation/delivery boundary exists.

-- --------------------------------------------------------------------------
-- Authenticated atomic consumption.
-- The function peeks only to derive a consistent advisory-lock key, then locks
-- and revalidates the invitation with FOR UPDATE before making any decision.
-- Any exception rolls back every resource update and consumed_at change.
-- --------------------------------------------------------------------------

create or replace function public.consume_targeted_invitation(p_token text)
returns table(
  resource_type text,
  resource_id uuid,
  establishment_id uuid,
  linked_teacher_id uuid
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_caller_id uuid := auth.uid();
  v_caller_email text;
  v_token_hash text;
  v_invitation private.targeted_invitations%rowtype;
  v_peek_resource_type text;
  v_peek_resource_id uuid;
  v_peek_establishment_id uuid;
  v_teacher_id uuid;
  v_staff_id uuid;
  v_initial_teacher_id uuid;
  v_teacher_email text;
  v_staff_email text;
  v_teacher_user_id uuid;
  v_staff_user_id uuid;
  v_lock_id uuid;
  v_affected_rows integer;
begin
  if v_caller_id is null
     or p_token is null
     or p_token !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid invitation' using errcode = '22023';
  end if;

  v_token_hash := encode(extensions.digest(p_token, 'sha256'), 'hex');

  select invitation.resource_type,
         invitation.resource_id,
         invitation.establishment_id
    into v_peek_resource_type,
         v_peek_resource_id,
         v_peek_establishment_id
    from private.targeted_invitations invitation
   where invitation.token_hash = v_token_hash;

  if not found then
    raise exception 'invalid invitation' using errcode = '22023';
  end if;

  if v_peek_resource_type = 'teacher' then
    v_lock_id := v_peek_resource_id;
  elsif v_peek_resource_type = 'staff_member' then
    select coalesce(staff.enseignant_id, staff.id)
      into v_lock_id
      from public.staff_members staff
     where staff.id = v_peek_resource_id
       and staff.etablissement_id = v_peek_establishment_id;
    v_lock_id := coalesce(v_lock_id, v_peek_resource_id);
  else
    raise exception 'invalid invitation' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('targeted-invitation:' || v_lock_id::text, 0)
  );

  select invitation.*
    into v_invitation
    from private.targeted_invitations invitation
   where invitation.token_hash = v_token_hash
   for update;

  if not found
     or v_invitation.consumed_at is not null
     or v_invitation.revoked_at is not null
     or v_invitation.expires_at <= statement_timestamp() then
    raise exception 'invalid invitation' using errcode = '22023';
  end if;

  select lower(btrim(auth_user.email))
    into v_caller_email
    from auth.users auth_user
   where auth_user.id = v_caller_id;

  if v_caller_email is null or v_caller_email <> v_invitation.recipient_email then
    raise exception 'invalid invitation' using errcode = '22023';
  end if;

  if v_invitation.resource_type = 'teacher' then
    v_teacher_id := v_invitation.resource_id;
  elsif v_invitation.resource_type = 'staff_member' then
    v_staff_id := v_invitation.resource_id;
    select staff.enseignant_id
      into v_initial_teacher_id
      from public.staff_members staff
     where staff.id = v_staff_id
       and staff.etablissement_id = v_invitation.establishment_id;
    if not found then
      raise exception 'invalid invitation' using errcode = '22023';
    end if;
    v_teacher_id := v_initial_teacher_id;
  else
    raise exception 'invalid invitation' using errcode = '22023';
  end if;

  -- Consistent row-lock order: teacher first, then staff.
  if v_teacher_id is not null then
    select lower(btrim(teacher.email)), teacher.user_id
      into v_teacher_email, v_teacher_user_id
      from public.enseignants teacher
     where teacher.id = v_teacher_id
       and teacher.etablissement_id = v_invitation.establishment_id
     for update;

    if not found then
      raise exception 'invalid invitation' using errcode = '22023';
    end if;
  end if;

  if v_invitation.resource_type = 'teacher' then
    select staff.id, lower(btrim(staff.email)), staff.user_id
      into v_staff_id, v_staff_email, v_staff_user_id
      from public.staff_members staff
     where staff.enseignant_id = v_teacher_id
       and staff.etablissement_id = v_invitation.establishment_id
     for update;
  else
    select staff.enseignant_id, lower(btrim(staff.email)), staff.user_id
      into v_teacher_id, v_staff_email, v_staff_user_id
      from public.staff_members staff
     where staff.id = v_staff_id
       and staff.etablissement_id = v_invitation.establishment_id
     for update;

    if not found or v_teacher_id is distinct from v_initial_teacher_id then
      raise exception 'invalid invitation' using errcode = '22023';
    end if;
  end if;

  if v_invitation.resource_type = 'teacher' then
    if v_teacher_email is null
       or v_teacher_email <> v_invitation.recipient_email
       or (v_staff_email is not null and v_staff_email <> v_teacher_email) then
      raise exception 'invalid invitation' using errcode = '22023';
    end if;
  else
    if v_staff_email is null
       or v_staff_email <> v_invitation.recipient_email
       or (v_teacher_email is not null and v_teacher_email <> v_staff_email) then
      raise exception 'invalid invitation' using errcode = '22023';
    end if;
  end if;

  if (v_teacher_user_id is not null and v_teacher_user_id <> v_caller_id)
     or (v_staff_user_id is not null and v_staff_user_id <> v_caller_id) then
    raise exception 'invalid invitation' using errcode = '22023';
  end if;

  if v_teacher_id is not null then
    update public.enseignants teacher
       set user_id = v_caller_id
     where teacher.id = v_teacher_id
       and teacher.etablissement_id = v_invitation.establishment_id
       and (teacher.user_id is null or teacher.user_id = v_caller_id);
    get diagnostics v_affected_rows = row_count;
    if v_affected_rows <> 1 then
      raise exception 'invalid invitation' using errcode = '22023';
    end if;
  end if;

  if v_staff_id is not null then
    update public.staff_members staff
       set user_id = v_caller_id
     where staff.id = v_staff_id
       and staff.etablissement_id = v_invitation.establishment_id
       and (staff.user_id is null or staff.user_id = v_caller_id);
    get diagnostics v_affected_rows = row_count;
    if v_affected_rows <> 1 then
      raise exception 'invalid invitation' using errcode = '22023';
    end if;
  end if;

  update private.targeted_invitations invitation
     set consumed_at = statement_timestamp(),
         consumed_by = v_caller_id
   where invitation.id = v_invitation.id
     and invitation.consumed_at is null
     and invitation.revoked_at is null;
  get diagnostics v_affected_rows = row_count;
  if v_affected_rows <> 1 then
    raise exception 'invalid invitation' using errcode = '22023';
  end if;

  return query
  select v_invitation.resource_type,
         v_invitation.resource_id,
         v_invitation.establishment_id,
         v_teacher_id;
end;
$function$;

revoke execute on function public.consume_targeted_invitation(text)
  from public, anon, authenticated, service_role;
grant execute on function public.consume_targeted_invitation(text)
  to authenticated;

commit;
