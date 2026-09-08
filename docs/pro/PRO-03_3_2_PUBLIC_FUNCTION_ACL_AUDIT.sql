-- PRO-03.3.2.1 - PUBLIC FUNCTION ACL AUDIT
-- STATUS: READ-ONLY / NOT EXECUTED
-- Run in isolated staging before any temporary LOGIN is created.
-- Expected result: zero rows. This query changes no ACL and no database row.

select
  namespace.nspname as schema_name,
  function.proname as function_name,
  pg_catalog.pg_get_function_identity_arguments(function.oid) as identity_arguments,
  function.prokind as object_kind,
  function.prosecdef as security_definer,
  pg_catalog.pg_get_userbyid(function.proowner) as owner_name
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
order by namespace.nspname, function.proname,
  pg_catalog.pg_get_function_identity_arguments(function.oid);
