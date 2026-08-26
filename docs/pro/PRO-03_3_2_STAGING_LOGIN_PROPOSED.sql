-- PRO-03.3.2 - STAGING LOGIN (PROPOSED / NOT EXECUTED / NO LOGIN CREATED)
-- Run only in an isolated staging database after architect approval.
-- This file contains no password. The role starts disabled (PASSWORD NULL and
-- VALID UNTIL epoch); activation and rotation belong to the external secret
-- procedure described in PRO-03_3_2_STAGING_RUNBOOK.md.

begin;

do $preflight$
begin
  if current_user <> 'postgres' then
    raise exception 'staging login provisioning requires postgres';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_roles
    where rolname = 'invitation_issuer' and not rolcanlogin and not rolinherit
  ) then
    raise exception 'safe invitation_issuer capability role is required';
  end if;
  if exists (
    select 1
      from pg_catalog.pg_proc as function
      join pg_catalog.pg_namespace as namespace
        on namespace.oid = function.pronamespace
     where namespace.nspname in ('public', 'private')
       and function.prokind in ('f', 'p')
       and not exists (
         select 1
           from pg_catalog.pg_depend dependency
           join pg_catalog.pg_extension extension
             on extension.oid = dependency.refobjid
          where dependency.classid = 'pg_catalog.pg_proc'::pg_catalog.regclass
            and dependency.objid = function.oid
            and dependency.deptype = 'e'
       )
       and exists (
         select 1
           from pg_catalog.aclexplode(
             coalesce(
               function.proacl,
               pg_catalog.acldefault('f', function.proowner)
             )
           ) as privilege
          where privilege.grantee = 0
            and privilege.privilege_type = 'EXECUTE'
       )
  ) then
    raise exception 'PUBLIC function ACL audit must be empty before LOGIN creation';
  end if;
  if exists (
    select 1 from pg_catalog.pg_roles
    where rolname = 'pro03_staging_invitation_login'
  ) then
    raise exception 'temporary staging login already exists';
  end if;
end;
$preflight$;

create role pro03_staging_invitation_login
  login noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls
  connection limit 2 password null valid until 'epoch';

alter role pro03_staging_invitation_login set search_path = '';
revoke anon, authenticated, service_role from pro03_staging_invitation_login;
grant invitation_issuer to pro03_staging_invitation_login;

-- Supavisor's client username is the LOGIN plus ".<staging_project_ref>".
-- The suffix routes the shared pooler; it is not part of this PostgreSQL role.

-- The LOGIN must be a member of exactly one role. PUBLIC is implicit in
-- PostgreSQL and cannot be revoked, hence the explicit effective-ACL audit.
do $membership_check$
declare
  v_memberships text[];
begin
  select pg_catalog.array_agg(parent.rolname order by parent.rolname)
    into v_memberships
    from pg_catalog.pg_auth_members membership
    join pg_catalog.pg_roles member on member.oid = membership.member
    join pg_catalog.pg_roles parent on parent.oid = membership.roleid
   where member.rolname = 'pro03_staging_invitation_login';

  if v_memberships is distinct from array['invitation_issuer']::text[] then
    raise exception 'temporary login has unexpected role memberships';
  end if;
end;
$membership_check$;

-- Before SET ROLE, the LOGIN must not be able to execute any user-defined
-- function, including one granted through PUBLIC. This intentionally aborts
-- instead of changing application-wide PUBLIC ACLs.
do $login_acl_check$
begin
  if exists (
    select 1
      from pg_catalog.pg_proc function
      join pg_catalog.pg_namespace namespace on namespace.oid = function.pronamespace
     where namespace.nspname not in ('pg_catalog', 'information_schema')
       and pg_catalog.has_schema_privilege(
         'pro03_staging_invitation_login', namespace.oid, 'USAGE'
       )
       and not exists (
         select 1
           from pg_catalog.pg_depend dependency
           join pg_catalog.pg_extension extension
             on extension.oid = dependency.refobjid
          where dependency.classid = 'pg_catalog.pg_proc'::pg_catalog.regclass
            and dependency.objid = function.oid
            and dependency.deptype = 'e'
       )
       and pg_catalog.has_function_privilege(
         'pro03_staging_invitation_login', function.oid, 'EXECUTE'
       )
  ) then
    raise exception 'temporary login inherits executable application functions';
  end if;
end;
$login_acl_check$;

-- After SET LOCAL ROLE, invitation_issuer may execute exactly this allow-list.
do $capability_acl_check$
declare
  v_actual oid[];
  v_expected oid[] := array[
    'private.issue_targeted_invitation(uuid,uuid,text,uuid,text,uuid,uuid,text,interval)'::regprocedure::oid,
    'private.complete_targeted_invitation_delivery(uuid,uuid,text)'::regprocedure::oid,
    'private.fail_targeted_invitation_delivery(uuid,uuid,text)'::regprocedure::oid,
    'private.revoke_issued_targeted_invitation(uuid,uuid,text)'::regprocedure::oid,
    'private.revoke_stale_targeted_invitation_delivery(uuid)'::regprocedure::oid
  ];
begin
  select pg_catalog.array_agg(function.oid order by function.oid)
    into v_actual
    from pg_catalog.pg_proc function
    join pg_catalog.pg_namespace namespace on namespace.oid = function.pronamespace
   where namespace.nspname not in ('pg_catalog', 'information_schema')
     and pg_catalog.has_schema_privilege(
       'invitation_issuer', namespace.oid, 'USAGE'
     )
     and not exists (
       select 1
         from pg_catalog.pg_depend dependency
         join pg_catalog.pg_extension extension
           on extension.oid = dependency.refobjid
        where dependency.classid = 'pg_catalog.pg_proc'::pg_catalog.regclass
          and dependency.objid = function.oid
          and dependency.deptype = 'e'
     )
     and pg_catalog.has_function_privilege('invitation_issuer', function.oid, 'EXECUTE');

  select pg_catalog.array_agg(item order by item) into v_expected
    from pg_catalog.unnest(v_expected) as expected(item);
  if v_actual is distinct from v_expected then
    raise exception 'invitation_issuer effective EXECUTE ACL exceeds allow-list';
  end if;
end;
$capability_acl_check$;

-- No schema or table grant is issued to the LOGIN. NOINHERIT makes an explicit
-- SET LOCAL ROLE invitation_issuer mandatory inside every short transaction.
commit;
