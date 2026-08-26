-- ==========================================================================
-- PRO-03.3 — SECURE INVITATION ISSUER & DELIVERY
-- STATUS: PROPOSED / NOT VALIDATED / NOT EXECUTED
--
-- Preconditions supplied by the production review:
--   * PRO-03.2.2 is installed;
--   * private.targeted_invitations exists and contains zero rows;
--   * public create/revoke are dormant; consume is authenticated-only.
--
-- This file creates no LOGIN, password, provider secret, email, or business row.
-- It intentionally grants neither authenticated nor service_role an issuer.
-- Validate against an isolated production-schema clone before approval.
-- ==========================================================================

begin;

-- Abort before schema changes if the supplied zero-row precondition changed.
do $preflight$
begin
  if current_user <> 'postgres' then
    raise exception 'PRO-03.3 must be applied by postgres so every function owner is explicit';
  end if;

  if pg_catalog.to_regclass('private.targeted_invitations') is null then
    raise exception 'PRO-03.2.2 targeted_invitations table is required';
  end if;

  if exists (select 1 from private.targeted_invitations limit 1) then
    raise exception 'PRO-03.3 requires zero existing invitations for first deployment';
  end if;
end;
$preflight$;

-- A capability role only. A separately approved, server-only LOGIN may later
-- receive membership. This migration deliberately creates no runtime secret.
do $role$
begin
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'invitation_issuer') then
    create role invitation_issuer nologin noinherit nosuperuser nocreatedb
      nocreaterole noreplication nobypassrls;
  end if;

  if not exists (
    select 1 from pg_catalog.pg_roles role
    where role.rolname = 'invitation_issuer'
      and not role.rolcanlogin and not role.rolinherit
      and not role.rolsuper and not role.rolcreatedb
      and not role.rolcreaterole and not role.rolreplication
      and not role.rolbypassrls
  ) then
    raise exception 'invitation_issuer role attributes are unsafe';
  end if;
end;
$role$;

-- Default privileges are bound to the explicit object owner required above.
alter default privileges for role postgres in schema private
  revoke execute on functions from public, anon, authenticated, service_role;

revoke all on schema private from public, anon, authenticated, service_role;
grant usage on schema private to invitation_issuer;

-- Delivery state gates consumption after the external provider boundary.
alter table private.targeted_invitations
  add column if not exists delivery_status text not null default 'pending',
  add column if not exists delivered_at timestamptz,
  add column if not exists delivery_failed_at timestamptz;

do $constraints$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'private.targeted_invitations'::regclass
      and conname = 'targeted_invitations_delivery_status_check'
  ) then
    alter table private.targeted_invitations
      add constraint targeted_invitations_delivery_status_check
      check (delivery_status in ('pending', 'delivered', 'failed', 'revoked'));
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'private.targeted_invitations'::regclass
      and conname = 'targeted_invitations_delivery_coherence_check'
  ) then
    alter table private.targeted_invitations
      add constraint targeted_invitations_delivery_coherence_check
      check (
        (delivery_status = 'pending'
          and delivered_at is null and delivery_failed_at is null)
        or (delivery_status = 'delivered'
          and delivered_at is not null and delivery_failed_at is null)
        or (delivery_status = 'failed'
          and delivered_at is null and delivery_failed_at is not null)
        or delivery_status = 'revoked'
      );
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'private.targeted_invitations'::regclass
      and conname = 'targeted_invitations_consumed_after_delivery_check'
  ) then
    alter table private.targeted_invitations
      add constraint targeted_invitations_consumed_after_delivery_check
      check (consumed_at is null or delivery_status = 'delivered');
  end if;
end;
$constraints$;

create table if not exists private.targeted_invitation_delivery_attempts (
  id uuid primary key default extensions.gen_random_uuid(),
  idempotency_key uuid not null unique,
  invitation_id uuid not null unique
    references private.targeted_invitations(id) on delete restrict,
  retry_of uuid
    references private.targeted_invitation_delivery_attempts(id) on delete restrict,
  actor_id uuid not null references auth.users(id) on delete restrict,
  establishment_id uuid not null
    references public.establishments(id) on delete restrict,
  resource_type text not null
    check (resource_type in ('teacher', 'staff_member')),
  resource_id uuid not null,
  provider text not null check (provider = 'email'),
  status text not null default 'pending'
    check (status in ('pending', 'delivered', 'failed', 'revoked')),
  attempt_number integer not null default 1 check (attempt_number > 0),
  provider_message_id text,
  failure_code text,
  requested_at timestamptz not null default statement_timestamp(),
  delivered_at timestamptz,
  failed_at timestamptz,
  updated_at timestamptz not null default statement_timestamp(),

  constraint targeted_invitation_attempt_provider_message_check
    check (
      provider_message_id is null
      or length(provider_message_id) between 1 and 255
    ),
  constraint targeted_invitation_attempt_failure_code_check
    check (
      failure_code is null
      or failure_code ~ '^[A-Z0-9_.:-]{1,100}$'
    ),
  constraint targeted_invitation_attempt_terminal_check
    check (
      (status = 'pending' and delivered_at is null and failed_at is null)
      or (status = 'delivered' and delivered_at is not null and failed_at is null)
      or (status = 'failed' and delivered_at is null and failed_at is not null)
      or status = 'revoked'
    )
);

create index if not exists targeted_invitation_attempt_actor_school_idx
  on private.targeted_invitation_delivery_attempts(
    actor_id, establishment_id, requested_at desc
  );

create index if not exists targeted_invitation_attempt_resource_idx
  on private.targeted_invitation_delivery_attempts(
    establishment_id, resource_type, resource_id, requested_at desc
  );

create index if not exists targeted_invitation_attempt_pending_idx
  on private.targeted_invitation_delivery_attempts(requested_at)
  where status = 'pending';

alter table private.targeted_invitation_delivery_attempts enable row level security;
revoke all on table private.targeted_invitation_delivery_attempts
  from public, anon, authenticated, service_role, invitation_issuer;
revoke all on table private.targeted_invitations
  from public, anon, authenticated, service_role, invitation_issuer;

create or replace function private.set_targeted_invitation_attempt_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  new.updated_at := statement_timestamp();
  return new;
end;
$function$;

alter function private.set_targeted_invitation_attempt_updated_at() owner to postgres;

revoke execute on function private.set_targeted_invitation_attempt_updated_at()
  from public, anon, authenticated, service_role, invitation_issuer;

drop trigger if exists targeted_invitation_attempt_updated_at
  on private.targeted_invitation_delivery_attempts;
create trigger targeted_invitation_attempt_updated_at
before update on private.targeted_invitation_delivery_attempts
for each row execute function private.set_targeted_invitation_attempt_updated_at();

-- Gives a stable, explicit error before the CHECK constraint and also protects
-- the existing consume function without broadening its signature or grants.
create or replace function private.guard_targeted_invitation_consumption()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if new.consumed_at is not null and new.delivery_status <> 'delivered' then
    raise exception 'invitation has not been delivered' using errcode = '22023';
  end if;
  return new;
end;
$function$;

alter function private.guard_targeted_invitation_consumption() owner to postgres;

revoke execute on function private.guard_targeted_invitation_consumption()
  from public, anon, authenticated, service_role, invitation_issuer;

drop trigger if exists targeted_invitation_delivery_guard
  on private.targeted_invitations;
create trigger targeted_invitation_delivery_guard
before insert or update of consumed_at, delivery_status
on private.targeted_invitations
for each row execute function private.guard_targeted_invitation_consumption();

-- Internal issue result. activation_code is non-null only for the transaction
-- that creates the invitation; idempotent replays return only prior status.
create or replace function private.issue_targeted_invitation(
  p_actor_id uuid,
  p_establishment_id uuid,
  p_resource_type text,
  p_resource_id uuid,
  p_recipient_email text,
  p_idempotency_key uuid,
  p_retry_of uuid default null,
  p_provider text default 'email',
  p_ttl interval default interval '48 hours'
)
returns table(
  invitation_id uuid,
  attempt_id uuid,
  delivery_status text,
  created boolean,
  activation_code text
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_existing private.targeted_invitation_delivery_attempts%rowtype;
  v_existing_email text;
  v_retry private.targeted_invitation_delivery_attempts%rowtype;
  v_token text;
  v_hash text;
  v_invitation_id uuid;
  v_attempt_id uuid;
  v_attempt_number integer := 1;
  v_email text := lower(btrim(p_recipient_email));
  v_previous_sub text := current_setting('request.jwt.claim.sub', true);
  v_previous_claims text := current_setting('request.jwt.claims', true);
begin
  if p_actor_id is null or p_establishment_id is null or p_resource_id is null
     or p_idempotency_key is null or p_recipient_email is null
     or p_resource_type not in ('teacher', 'staff_member')
     or p_provider <> 'email' or length(v_email) not between 3 and 320
     or p_ttl <= interval '0 seconds' or p_ttl > interval '7 days' then
    raise exception 'invalid issuer parameters' using errcode = '22023';
  end if;

  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'issuer requires read committed isolation' using errcode = '25000';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('invitation-idempotency:' || p_idempotency_key::text, 0)
  );

  select attempt.*
    into v_existing
    from private.targeted_invitation_delivery_attempts attempt
   where attempt.idempotency_key = p_idempotency_key;

  if found then
    select invitation.recipient_email
      into strict v_existing_email
      from private.targeted_invitations invitation
     where invitation.id = v_existing.invitation_id;

    if v_existing.actor_id <> p_actor_id
       or v_existing.establishment_id <> p_establishment_id
       or v_existing.resource_type <> p_resource_type
       or v_existing.resource_id <> p_resource_id
       or v_existing.provider <> p_provider
       or v_existing.retry_of is distinct from p_retry_of
       or v_existing_email <> v_email then
      raise exception 'idempotency key payload conflict' using errcode = '23505';
    end if;

    return query select v_existing.invitation_id, v_existing.id,
      v_existing.status, false, null::text;
    return;
  end if;

  if not exists (select 1 from auth.users actor where actor.id = p_actor_id) then
    raise exception 'valid invitation actor required' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.establishments establishment
    where establishment.id = p_establishment_id
      and establishment.owner_id = p_actor_id
  ) then
    raise exception 'actor is not establishment owner' using errcode = '42501';
  end if;

  -- Different idempotency keys must not race past COUNT(*) at the same limit.
  -- Locks are transaction-scoped and always acquired in this order. Under READ
  -- COMMITTED, a waiter takes a fresh snapshot for the following count after the
  -- preceding issuer transaction commits its attempt.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'invitation-rate:actor-school:' || p_actor_id::text || ':' || p_establishment_id::text,
      0
    )
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'invitation-rate:resource:' || p_establishment_id::text || ':'
        || p_resource_type || ':' || p_resource_id::text,
      0
    )
  );

  if p_resource_type = 'teacher' then
    if not exists (
      select 1 from public.enseignants teacher
      where teacher.id = p_resource_id
        and teacher.etablissement_id = p_establishment_id
        and lower(btrim(teacher.email)) = v_email
    ) then
      raise exception 'invalid invitation resource' using errcode = '22023';
    end if;
  else
    if not exists (
      select 1 from public.staff_members staff
      where staff.id = p_resource_id
        and staff.etablissement_id = p_establishment_id
        and lower(btrim(staff.email)) = v_email
    ) then
      raise exception 'invalid invitation resource' using errcode = '22023';
    end if;
  end if;

  if p_retry_of is not null then
    select attempt.* into v_retry
      from private.targeted_invitation_delivery_attempts attempt
     where attempt.id = p_retry_of
     for update;

    if not found or v_retry.actor_id <> p_actor_id
       or v_retry.establishment_id <> p_establishment_id
       or v_retry.resource_type <> p_resource_type
       or v_retry.resource_id <> p_resource_id
       or v_retry.status not in ('failed', 'revoked') then
      raise exception 'invalid retry attempt' using errcode = '22023';
    end if;
    v_attempt_number := v_retry.attempt_number + 1;
  end if;

  if (
    select count(*) from private.targeted_invitation_delivery_attempts attempt
    where attempt.actor_id = p_actor_id
      and attempt.establishment_id = p_establishment_id
      and attempt.requested_at >= statement_timestamp() - interval '1 hour'
  ) >= 5 then
    raise exception 'invitation actor rate limit exceeded' using errcode = 'P0001';
  end if;

  if (
    select count(*) from private.targeted_invitation_delivery_attempts attempt
    where attempt.establishment_id = p_establishment_id
      and attempt.resource_type = p_resource_type
      and attempt.resource_id = p_resource_id
      and attempt.requested_at >= statement_timestamp() - interval '24 hours'
  ) >= 3 then
    raise exception 'invitation resource rate limit exceeded' using errcode = 'P0001';
  end if;

  -- The internal capability supplies the actor, while the dormant function
  -- continues deriving it from auth.uid() and rechecking current ownership.
  perform pg_catalog.set_config('request.jwt.claim.sub', p_actor_id::text, true);
  perform pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.json_build_object('sub', p_actor_id::text, 'role', 'authenticated')::text,
    true
  );

  begin
    v_token := public.create_targeted_invitation(
      p_establishment_id, p_resource_type, p_resource_id, v_email, p_ttl
    );
  exception when others then
    perform pg_catalog.set_config('request.jwt.claim.sub', coalesce(v_previous_sub, ''), true);
    perform pg_catalog.set_config('request.jwt.claims', coalesce(v_previous_claims, ''), true);
    raise;
  end;

  perform pg_catalog.set_config('request.jwt.claim.sub', coalesce(v_previous_sub, ''), true);
  perform pg_catalog.set_config('request.jwt.claims', coalesce(v_previous_claims, ''), true);

  v_hash := encode(extensions.digest(v_token, 'sha256'), 'hex');
  select invitation.id into strict v_invitation_id
    from private.targeted_invitations invitation
   where invitation.token_hash = v_hash;

  insert into private.targeted_invitation_delivery_attempts (
    idempotency_key, invitation_id, retry_of, actor_id, establishment_id,
    resource_type, resource_id, provider, status, attempt_number
  ) values (
    p_idempotency_key, v_invitation_id, p_retry_of, p_actor_id,
    p_establishment_id, p_resource_type, p_resource_id, p_provider,
    'pending', v_attempt_number
  ) returning id into v_attempt_id;

  return query select v_invitation_id, v_attempt_id, 'pending'::text, true, v_token;
end;
$function$;

alter function private.issue_targeted_invitation(
  uuid, uuid, text, uuid, text, uuid, uuid, text, interval
) owner to postgres;

create or replace function private.complete_targeted_invitation_delivery(
  p_actor_id uuid,
  p_attempt_id uuid,
  p_provider_message_id text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_attempt private.targeted_invitation_delivery_attempts%rowtype;
  v_invitation private.targeted_invitations%rowtype;
  v_now timestamptz := statement_timestamp();
begin
  if p_actor_id is null or p_attempt_id is null
     or p_provider_message_id is null
     or length(p_provider_message_id) not between 1 and 255 then
    raise exception 'invalid delivery completion' using errcode = '22023';
  end if;

  select attempt.* into v_attempt
    from private.targeted_invitation_delivery_attempts attempt
   where attempt.id = p_attempt_id
   for update;

  if not found or v_attempt.actor_id <> p_actor_id then
    raise exception 'delivery attempt unavailable' using errcode = '42501';
  end if;
  if v_attempt.status = 'delivered' then return true; end if;
  if v_attempt.status <> 'pending' then return false; end if;

  select invitation.* into v_invitation
    from private.targeted_invitations invitation
   where invitation.id = v_attempt.invitation_id
   for update;
  if not found or v_invitation.delivery_status <> 'pending'
     or v_invitation.consumed_at is not null
     or v_invitation.revoked_at is not null then
    return false;
  end if;

  if not exists (
    select 1 from public.establishments establishment
    where establishment.id = v_attempt.establishment_id
      and establishment.owner_id = p_actor_id
  ) then
    raise exception 'actor is not current establishment owner' using errcode = '42501';
  end if;

  -- Provider success after expiry cannot activate a stale code. Both rows move
  -- atomically to a terminal failed/revoked state.
  if v_invitation.expires_at <= v_now then
    update private.targeted_invitations invitation
       set delivery_status = 'failed', delivery_failed_at = v_now,
           revoked_at = v_now, revoked_by = p_actor_id,
           revocation_reason = 'delivery_failed:EXPIRED_DURING_DELIVERY'
     where invitation.id = v_attempt.invitation_id;
    update private.targeted_invitation_delivery_attempts attempt
       set status = 'failed', failed_at = v_now,
           failure_code = 'EXPIRED_DURING_DELIVERY'
     where attempt.id = p_attempt_id;
    return false;
  end if;

  update private.targeted_invitations invitation
     set delivery_status = 'delivered', delivered_at = v_now
   where invitation.id = v_attempt.invitation_id
     and invitation.delivery_status = 'pending'
     and invitation.consumed_at is null and invitation.revoked_at is null;
  if not found then return false; end if;

  update private.targeted_invitation_delivery_attempts attempt
     set status = 'delivered', delivered_at = v_now,
         provider_message_id = p_provider_message_id
   where attempt.id = p_attempt_id;
  return true;
end;
$function$;

alter function private.complete_targeted_invitation_delivery(uuid, uuid, text)
  owner to postgres;

create or replace function private.fail_targeted_invitation_delivery(
  p_actor_id uuid,
  p_attempt_id uuid,
  p_failure_code text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_attempt private.targeted_invitation_delivery_attempts%rowtype;
  v_now timestamptz := statement_timestamp();
begin
  if p_actor_id is null or p_attempt_id is null or p_failure_code is null
     or p_failure_code !~ '^[A-Z0-9_.:-]{1,100}$' then
    raise exception 'invalid delivery failure' using errcode = '22023';
  end if;

  select attempt.* into v_attempt
    from private.targeted_invitation_delivery_attempts attempt
   where attempt.id = p_attempt_id
   for update;
  if not found or v_attempt.actor_id <> p_actor_id then
    raise exception 'delivery attempt unavailable' using errcode = '42501';
  end if;
  if v_attempt.status = 'failed' then return true; end if;
  if v_attempt.status <> 'pending' then return false; end if;

  update private.targeted_invitations invitation
     set delivery_status = 'failed', delivery_failed_at = v_now,
         revoked_at = v_now, revoked_by = p_actor_id,
         revocation_reason = 'delivery_failed:' || p_failure_code
   where invitation.id = v_attempt.invitation_id
     and invitation.delivery_status = 'pending'
     and invitation.consumed_at is null and invitation.revoked_at is null;

  if not found then return false; end if;

  update private.targeted_invitation_delivery_attempts attempt
     set status = 'failed', failed_at = v_now, failure_code = p_failure_code
   where attempt.id = p_attempt_id;
  return true;
end;
$function$;

alter function private.fail_targeted_invitation_delivery(uuid, uuid, text)
  owner to postgres;

create or replace function private.revoke_issued_targeted_invitation(
  p_actor_id uuid,
  p_invitation_id uuid,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_invitation private.targeted_invitations%rowtype;
  v_revoked boolean;
  v_previous_sub text := current_setting('request.jwt.claim.sub', true);
  v_previous_claims text := current_setting('request.jwt.claims', true);
begin
  if p_actor_id is null or p_invitation_id is null or p_reason is null
     or p_reason !~ '^[A-Z0-9_.:-]{1,100}$' then
    raise exception 'invalid invitation revocation' using errcode = '22023';
  end if;

  -- Keep the same lock order as complete/fail/stale: attempt, then invitation.
  -- Every PRO-03.3-issued invitation has exactly one delivery attempt.
  perform 1
    from private.targeted_invitation_delivery_attempts attempt
   where attempt.invitation_id = p_invitation_id
   for update;
  if not found then return false; end if;

  select invitation.* into v_invitation
    from private.targeted_invitations invitation
   where invitation.id = p_invitation_id
   for update;
  if not found then return false; end if;

  if not exists (
    select 1 from public.establishments establishment
    where establishment.id = v_invitation.establishment_id
      and establishment.owner_id = p_actor_id
  ) then
    raise exception 'actor is not current establishment owner' using errcode = '42501';
  end if;

  perform pg_catalog.set_config('request.jwt.claim.sub', p_actor_id::text, true);
  perform pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.json_build_object('sub', p_actor_id::text, 'role', 'authenticated')::text,
    true
  );
  begin
    v_revoked := public.revoke_targeted_invitation(p_invitation_id, btrim(p_reason));
  exception when others then
    perform pg_catalog.set_config('request.jwt.claim.sub', coalesce(v_previous_sub, ''), true);
    perform pg_catalog.set_config('request.jwt.claims', coalesce(v_previous_claims, ''), true);
    raise;
  end;
  perform pg_catalog.set_config('request.jwt.claim.sub', coalesce(v_previous_sub, ''), true);
  perform pg_catalog.set_config('request.jwt.claims', coalesce(v_previous_claims, ''), true);

  if v_revoked then
    update private.targeted_invitations invitation
       set delivery_status = 'revoked'
     where invitation.id = p_invitation_id;
    update private.targeted_invitation_delivery_attempts attempt
       set status = 'revoked'
     where attempt.invitation_id = p_invitation_id
       and attempt.status in ('pending', 'delivered');
  end if;
  return v_revoked;
end;
$function$;

alter function private.revoke_issued_targeted_invitation(uuid, uuid, text)
  owner to postgres;

-- Fixed stale threshold: the internal reconciler can revoke, never activate.
create or replace function private.revoke_stale_targeted_invitation_delivery(
  p_attempt_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_attempt private.targeted_invitation_delivery_attempts%rowtype;
  v_now timestamptz := statement_timestamp();
begin
  select attempt.* into v_attempt
    from private.targeted_invitation_delivery_attempts attempt
   where attempt.id = p_attempt_id
   for update;
  if not found or v_attempt.status <> 'pending'
     or v_attempt.requested_at > v_now - interval '15 minutes' then
    return false;
  end if;

  update private.targeted_invitations invitation
     set delivery_status = 'failed', delivery_failed_at = v_now,
         revoked_at = v_now, revoked_by = v_attempt.actor_id,
         revocation_reason = 'delivery_failed:STALE_PENDING'
   where invitation.id = v_attempt.invitation_id
     and invitation.delivery_status = 'pending'
     and invitation.consumed_at is null and invitation.revoked_at is null;

  if not found then return false; end if;

  update private.targeted_invitation_delivery_attempts attempt
     set status = 'failed', failed_at = v_now, failure_code = 'STALE_PENDING'
   where attempt.id = p_attempt_id;
  return true;
end;
$function$;

alter function private.revoke_stale_targeted_invitation_delivery(uuid)
  owner to postgres;

-- Explicitly close every surface first, including service_role.
revoke execute on function private.issue_targeted_invitation(
  uuid, uuid, text, uuid, text, uuid, uuid, text, interval
) from public, anon, authenticated, service_role, invitation_issuer;
revoke execute on function private.complete_targeted_invitation_delivery(uuid, uuid, text)
  from public, anon, authenticated, service_role, invitation_issuer;
revoke execute on function private.fail_targeted_invitation_delivery(uuid, uuid, text)
  from public, anon, authenticated, service_role, invitation_issuer;
revoke execute on function private.revoke_issued_targeted_invitation(uuid, uuid, text)
  from public, anon, authenticated, service_role, invitation_issuer;
revoke execute on function private.revoke_stale_targeted_invitation_delivery(uuid)
  from public, anon, authenticated, service_role, invitation_issuer;

-- Grant only the minimal internal capability role.
grant execute on function private.issue_targeted_invitation(
  uuid, uuid, text, uuid, text, uuid, uuid, text, interval
) to invitation_issuer;
grant execute on function private.complete_targeted_invitation_delivery(uuid, uuid, text)
  to invitation_issuer;
grant execute on function private.fail_targeted_invitation_delivery(uuid, uuid, text)
  to invitation_issuer;
grant execute on function private.revoke_issued_targeted_invitation(uuid, uuid, text)
  to invitation_issuer;
grant execute on function private.revoke_stale_targeted_invitation_delivery(uuid)
  to invitation_issuer;

-- Preserve the PRO-03.2.2 public RPC posture exactly.
alter function public.create_targeted_invitation(uuid, text, uuid, text, interval)
  owner to postgres;
alter function public.revoke_targeted_invitation(uuid, text) owner to postgres;
alter function public.consume_targeted_invitation(text) owner to postgres;

revoke execute on function public.create_targeted_invitation(
  uuid, text, uuid, text, interval
) from public, anon, authenticated, service_role, invitation_issuer;
revoke execute on function public.revoke_targeted_invitation(uuid, text)
  from public, anon, authenticated, service_role, invitation_issuer;
revoke execute on function public.consume_targeted_invitation(text)
  from public, anon, service_role, invitation_issuer;
grant execute on function public.consume_targeted_invitation(text)
  to authenticated;

-- No membership grant and no LOGIN creation in this migration.
-- No route activation and no provider configuration in this migration.

commit;
