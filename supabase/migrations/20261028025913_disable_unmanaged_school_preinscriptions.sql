-- PREINSCRIPTION-ELIGIBILITY-01
-- A listing with verification_status='referenced' is only an annuary entry:
-- no school administrator is linked to receive or process family data.
-- The frontend hides those listings, while this database guard is the
-- authoritative protection against direct RPC calls or stale clients.

create or replace function public.submit_public_application(
  p_establishment_id uuid,
  p_student_first_name text,
  p_student_last_name text,
  p_parent_name text,
  p_parent_phone text,
  p_student_birth_date date default null,
  p_student_age integer default null,
  p_desired_level text default null,
  p_previous_school text default null,
  p_parent_email text default null,
  p_message text default null,
  p_annee_scolaire_id uuid default null
)
returns table (id uuid, tracking_code text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_establishment_accepts_preinscriptions boolean;
  v_full_student_name text;
  v_application_id uuid;
  v_tracking_code text;
begin
  if p_establishment_id is null then
    raise exception 'establishment_id requis' using errcode = 'P0001';
  end if;

  select
    e.verification_status::text in ('verified', 'active')
    and e.owner_id is not null
  into v_establishment_accepts_preinscriptions
  from public.establishments as e
  where e.id = p_establishment_id;

  if not found then
    raise exception 'Établissement introuvable' using errcode = 'P0001';
  end if;

  if not coalesce(v_establishment_accepts_preinscriptions, false) then
    raise exception 'Préinscription indisponible pour cet établissement' using errcode = 'P0001';
  end if;

  if coalesce(trim(p_student_first_name), '') = '' or coalesce(trim(p_student_last_name), '') = '' then
    raise exception 'Nom et prénom de l''élève requis' using errcode = 'P0001';
  end if;
  if coalesce(trim(p_parent_name), '') = '' or coalesce(trim(p_parent_phone), '') = '' then
    raise exception 'Nom et téléphone du responsable requis' using errcode = 'P0001';
  end if;

  v_full_student_name := trim(p_student_first_name || ' ' || p_student_last_name);

  insert into public.applications (
    parent_id, establishment_id,
    student_first_name, student_last_name, full_student_name,
    student_birth_date, student_age, desired_level, previous_school,
    parent_name, parent_phone, parent_email, message, annee_scolaire_id
  ) values (
    auth.uid(), p_establishment_id,
    p_student_first_name, p_student_last_name, v_full_student_name,
    p_student_birth_date, p_student_age, p_desired_level, p_previous_school,
    p_parent_name, p_parent_phone, p_parent_email, p_message, p_annee_scolaire_id
  )
  returning applications.id, applications.tracking_code into v_application_id, v_tracking_code;

  return query select v_application_id, v_tracking_code;
end;
$$;

revoke all on function public.submit_public_application(
  uuid, text, text, text, text, date, integer, text, text, text, text, uuid
) from public, service_role;
grant execute on function public.submit_public_application(
  uuid, text, text, text, text, date, integer, text, text, text, text, uuid
) to anon, authenticated;
