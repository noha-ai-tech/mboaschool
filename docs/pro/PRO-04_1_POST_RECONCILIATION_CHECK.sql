-- PRO-04.1 — READ-ONLY POST-RECONCILIATION CONTROL
-- PREPARED ONLY. Every top-level statement is SELECT/WITH.
-- Compare the final result sets with:
--   docs/pro/PRO-04_1_PRODUCTION_OBJECT_SNAPSHOT.json
--   docs/pro/PRO-04_1_BUSINESS_ROW_BASELINE.json

-- 1. History: the four repaired versions must exist exactly once.
select
  version,
  name,
  cardinality(statements) as statement_count,
  rollback is not null as has_recorded_rollback
from supabase_migrations.schema_migrations
where version in (
  '20260822155238',
  '20260822194239',
  '20260822194251',
  '20260822194302'
)
order by version;

-- Expected:
-- 20260822155238 pro_03_wave_b_rls_consolidation
-- 20260822194239 pro_03_wave_c_rls_and_hours_consolidation
-- 20260822194251 pro_03_wave_d_rls_consolidation
-- 20260822194302 pro_03_final_deprecation_gate_consolidation

-- 2. B/C/D objects: 12/11/14, no missing policy, authenticated only, RLS on.
with expected(wave, schemaname, tablename, policyname) as (values
  ('B','public','absences','absences_directeur'),
  ('B','public','conges_vacances','conges_scope'),
  ('B','public','enseignant_disponibilites','ed_scope'),
  ('B','public','enseignant_matieres','em_scope'),
  ('B','public','enseignants','enseignants_scope'),
  ('B','public','matieres','matieres_scope'),
  ('B','public','matieres_volume_horaire','mvh_scope'),
  ('B','public','sections','sections_scope'),
  ('B','public','staff_contracts','staff_contracts_director'),
  ('B','public','staff_documents','staff_documents_director'),
  ('B','public','staff_members','staff_members_scope'),
  ('B','storage','objects','staff_documents_director_access'),
  ('C','public','annees_scolaires','annees_scolaires_scope'),
  ('C','public','trimestres','trimestres_scope'),
  ('C','public','contraintes_etablissement','contraintes_scope'),
  ('C','public','creneaux_horaires','creneaux_scope'),
  ('C','public','emplois_du_temps','edt_scope'),
  ('C','public','enseignant_indisponibilites','ens_indispo_directeur'),
  ('C','public','salles','salles_scope'),
  ('C','public','salle_indisponibilites','salle_indispo_scope'),
  ('C','public','pointages','pointages_scope'),
  ('C','public','remplacements','remplacements_directeur'),
  ('C','storage','objects','pointages_owner_access'),
  ('D','public','ai_usage','Systeme peut enregistrer le cout IA'),
  ('D','public','bulletin_paie_historique','bulletin_historique_directeur'),
  ('D','public','bulletin_paie_lignes','bulletin_lignes_directeur'),
  ('D','public','bulletins_paie','bulletins_directeur'),
  ('D','public','messages','messages_directeur'),
  ('D','public','payroll_config','payroll_config_scope'),
  ('D','public','primes','primes_directeur'),
  ('D','public','retenues','retenues_directeur'),
  ('D','public','types_primes','types_primes_scope'),
  ('D','public','types_retenues','types_retenues_scope'),
  ('D','public','school_setup_imports','Directeur gere ses imports'),
  ('D','public','school_setup_files','Directeur gere ses fichiers d''import'),
  ('D','public','school_setup_drafts','Directeur gere ses brouillons d''import'),
  ('D','public','school_setup_issues','Directeur gere les issues de ses imports')
),
state as (
  select
    e.wave,
    p.policyname is not null as policy_exists,
    p.roles,
    c.relrowsecurity
  from expected e
  left join pg_policies p using (schemaname, tablename, policyname)
  left join pg_class c
    on c.oid = to_regclass(format('%I.%I', e.schemaname, e.tablename))
)
select
  wave,
  count(*) filter (where policy_exists) as present,
  count(*) filter (where not policy_exists) as missing,
  bool_and(roles = '{authenticated}'::name[]) filter (where policy_exists)
    as authenticated_only,
  bool_and(relrowsecurity) as rls_enabled
from state
group by wave
order by wave;

-- 3. Corrected C function and final gate.
select
  pg_get_userbyid(p.proowner) as owner,
  p.prosecdef as security_definer,
  p.provolatile,
  p.proconfig,
  p.pronargdefaults as default_count,
  has_function_privilege('public', p.oid, 'EXECUTE') as public_execute,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE')
    as authenticated_execute,
  has_function_privilege('service_role', p.oid, 'EXECUTE')
    as service_role_execute
from pg_proc p
where p.oid = to_regprocedure(
  'public.calculer_heures_enseignant(uuid,date,date,uuid)'
);

select
  to_regprocedure('public.current_establishment_id()') is null
    as final_gate_still_effective;

-- 4. school_page_drafts remains associated only with its existing remote
-- version. Its statement checksum must not change.
select
  version,
  name,
  cardinality(statements) as statement_count,
  octet_length(statements[1]) as statement_bytes,
  encode(
    extensions.digest(convert_to(statements[1], 'UTF8'), 'sha256'),
    'hex'
  ) as statement_sha256
from supabase_migrations.schema_migrations
where name = 'school_page_drafts'
order by version;

-- Expected sole row:
-- version 20260822154940
-- SHA-256 fcc99d793476157c29c91199d71dde2cae94436b33dc73f13ab5c98df643bd21

-- 5. Business baseline. Compare exactly with PRO-04_1_BUSINESS_ROW_BASELINE.json.
select json_agg(row_to_json(x) order by object_name) as counts
from (
  select 'public.absences' object_name, count(*)::bigint row_count from public.absences
  union all select 'public.ai_usage', count(*)::bigint from public.ai_usage
  union all select 'public.annees_scolaires', count(*)::bigint from public.annees_scolaires
  union all select 'public.bulletin_paie_historique', count(*)::bigint from public.bulletin_paie_historique
  union all select 'public.bulletin_paie_lignes', count(*)::bigint from public.bulletin_paie_lignes
  union all select 'public.bulletins_paie', count(*)::bigint from public.bulletins_paie
  union all select 'public.conges_vacances', count(*)::bigint from public.conges_vacances
  union all select 'public.contraintes_etablissement', count(*)::bigint from public.contraintes_etablissement
  union all select 'public.creneaux_horaires', count(*)::bigint from public.creneaux_horaires
  union all select 'public.emplois_du_temps', count(*)::bigint from public.emplois_du_temps
  union all select 'public.enseignant_disponibilites', count(*)::bigint from public.enseignant_disponibilites
  union all select 'public.enseignant_indisponibilites', count(*)::bigint from public.enseignant_indisponibilites
  union all select 'public.enseignant_matieres', count(*)::bigint from public.enseignant_matieres
  union all select 'public.enseignants', count(*)::bigint from public.enseignants
  union all select 'public.matieres', count(*)::bigint from public.matieres
  union all select 'public.matieres_volume_horaire', count(*)::bigint from public.matieres_volume_horaire
  union all select 'public.messages', count(*)::bigint from public.messages
  union all select 'public.payroll_config', count(*)::bigint from public.payroll_config
  union all select 'public.pointages', count(*)::bigint from public.pointages
  union all select 'public.primes', count(*)::bigint from public.primes
  union all select 'public.remplacements', count(*)::bigint from public.remplacements
  union all select 'public.retenues', count(*)::bigint from public.retenues
  union all select 'public.salle_indisponibilites', count(*)::bigint from public.salle_indisponibilites
  union all select 'public.salles', count(*)::bigint from public.salles
  union all select 'public.school_setup_drafts', count(*)::bigint from public.school_setup_drafts
  union all select 'public.school_setup_files', count(*)::bigint from public.school_setup_files
  union all select 'public.school_setup_imports', count(*)::bigint from public.school_setup_imports
  union all select 'public.school_setup_issues', count(*)::bigint from public.school_setup_issues
  union all select 'public.sections', count(*)::bigint from public.sections
  union all select 'public.staff_contracts', count(*)::bigint from public.staff_contracts
  union all select 'public.staff_documents', count(*)::bigint from public.staff_documents
  union all select 'public.staff_members', count(*)::bigint from public.staff_members
  union all select 'public.trimestres', count(*)::bigint from public.trimestres
  union all select 'public.types_primes', count(*)::bigint from public.types_primes
  union all select 'public.types_retenues', count(*)::bigint from public.types_retenues
  union all select 'storage.objects:pointages-photos', count(*)::bigint
    from storage.objects where bucket_id = 'pointages-photos'
  union all select 'storage.objects:staff-documents', count(*)::bigint
    from storage.objects where bucket_id = 'staff-documents'
) x;

