-- Restoration gate: validated against a schema-only copy of production.
-- This follows the onboarding, offline, mobile and timesheet foundations.
-- No existing school or application data is rewritten.

revoke all on table public.establishment_creation_requests,
  public.establishment_creation_request_documents, public.sync_mutations,
  public.students, public.lesson_sessions, public.student_attendance,
  public.timesheet_corrections, public.timesheet_approvals
  from public, anon, authenticated;
grant select, insert, update on public.establishment_creation_requests to authenticated;
grant select, insert, delete on public.establishment_creation_request_documents to authenticated;
grant select, insert on public.sync_mutations to authenticated;
grant select, insert, update, delete on public.students to authenticated;
grant select on public.lesson_sessions, public.student_attendance to authenticated;
grant select, insert, update on public.timesheet_corrections to authenticated;
grant select, insert on public.timesheet_approvals to authenticated;

alter policy "requester creates own creation request"
on public.establishment_creation_requests to authenticated
with check (
  requester_user_id = (select auth.uid()) and status = 'pending'
  and admin_comment is null and reviewed_by is null and reviewed_at is null
  and created_establishment_id is null
);
alter policy "platform_admin updates creation requests"
on public.establishment_creation_requests to authenticated
with check (
  exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'platform_admin')
  and status in ('pending','under_review','rejected','duplicate')
  and created_establishment_id is null
);

-- Only the atomic RPCs can record successful business mutations.
-- The HTTP route may still record a rejected request without side effects.
alter policy "actor inserts own sync mutations" on public.sync_mutations
to authenticated with check (
  actor_user_id = (select auth.uid()) and status = 'rejected' and entity_id is null
  and (
    exists (select 1 from public.establishments e
      where e.id = establishment_id and e.owner_id = (select auth.uid()))
    or exists (select 1 from public.enseignants t
      where t.etablissement_id = establishment_id and t.user_id = (select auth.uid()))
  )
);

revoke execute on function public.sync_apply_absence_create(uuid,uuid,uuid,text,date,date,text)
  from public, anon, service_role;
grant execute on function public.sync_apply_absence_create(uuid,uuid,uuid,text,date,date,text)
  to authenticated;
revoke execute on function public.sync_apply_attendance_mark(uuid,uuid,uuid,uuid,date,text)
  from public, anon, service_role;
grant execute on function public.sync_apply_attendance_mark(uuid,uuid,uuid,uuid,date,text)
  to authenticated;

create or replace function public.approve_establishment_creation_request(
  p_request_id uuid, p_admin_comment text default null
) returns uuid language plpgsql security definer set search_path = public
as $$
declare
  v_request public.establishment_creation_requests;
  v_new_id uuid := gen_random_uuid();
  v_category public.main_category;
begin
  if auth.uid() is null or not exists (
    select 1 from public.profiles where id = auth.uid() and role = 'platform_admin'
  ) then
    raise exception 'Accès refusé : réservé aux administrateurs de la plateforme';
  end if;
  select * into v_request from public.establishment_creation_requests
    where id = p_request_id for update;
  if not found then raise exception 'Demande introuvable'; end if;
  if v_request.status not in ('pending','under_review') then
    raise exception 'Cette demande a déjà été traitée (statut actuel : %)', v_request.status;
  end if;
  v_category := coalesce(nullif(trim(v_request.proposed_main_category),''),'autres')::public.main_category;
  insert into public.establishments (
    id, slug, name, main_category, city, neighborhood, address, phone, email, website,
    owner_id, is_claimed, is_verified, verification_status
  ) values (
    v_new_id, 'ecole-' || v_new_id::text, v_request.proposed_name, v_category,
    v_request.proposed_city, v_request.proposed_neighborhood, v_request.proposed_address,
    v_request.proposed_phone, v_request.proposed_email, v_request.proposed_website,
    v_request.requester_user_id, true, true, 'active'
  );
  update public.establishment_creation_requests set status='approved',
    admin_comment=p_admin_comment, reviewed_by=auth.uid(), reviewed_at=now(),
    updated_at=now(), created_establishment_id=v_new_id where id=p_request_id;
  return v_new_id;
end;
$$;
revoke execute on function public.approve_establishment_creation_request(uuid,text)
  from public, anon, service_role;
grant execute on function public.approve_establishment_creation_request(uuid,text) to authenticated;
