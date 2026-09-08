-- ============================================================================
-- PUBLIC-SITE-02_0035_ROLLBACK.sql
--
-- PRÉPARÉ, NON EXÉCUTÉ. À n'exécuter QUE si migration
-- supabase/migrations/0035_school_page_identity_results_ranking.sql a été
-- appliquée en production et doit être annulée (échec critique post-
-- déploiement — voir PUBLIC-SITE-02B_PREFLIGHT_REPORT.md §RELEASE ORDER,
-- étape 10).
--
-- Restaure exactement l'état d'avant 0035 :
--   1. publish_school_page() reprend le corps EXACT de 0033 (dernière
--      version canonique avant 0035) — CREATE OR REPLACE, verbatim.
--   2. discard_school_page_draft() reprend le corps EXACT de 0034 —
--      CREATE OR REPLACE, verbatim.
--   3. Les 2 nouvelles tables (school_official_ranking,
--      school_exam_results) et tout ce qu'elles contiennent (policies,
--      trigger, fonction touch_*) sont supprimées.
--   4. Le trigger/fonction de protection des colonnes établissements
--      (establishments_protect_school_page_published_columns /
--      protect_school_page_published_columns) est supprimé.
--   5. Les 7 colonnes établissements ajoutées par 0035 sont supprimées.
--
-- ORDRE DE SÉCURITÉ (respecté ci-dessous) :
--   RPC d'abord (pour qu'aucun appel Publish/Discard ne référence encore
--   les nouveaux domaines pendant le rollback) -> tables/policies
--   dépendantes -> trigger établissements -> colonnes établissements en
--   dernier (rien ne doit plus les référencer à ce stade).
--
-- Chaque colonne supprimée EFFACE définitivement toute donnée déjà écrite
-- dedans (motto/history/mission/vision/founding_year/student_count/
-- teacher_count) — si des écoles ont déjà publié ces champs avant le
-- rollback, cette perte est irréversible sans une sauvegarde préalable
-- (voir RELEASE ORDER étape 1 : backup avant application de 0035).
-- ============================================================================


-- ============================================================================
-- 1. publish_school_page() — restauration EXACTE du corps 0033 (dernier
-- état canonique avant 0035). Verbatim, aucune modification.
-- ============================================================================
create or replace function public.publish_school_page(
  p_establishment_id uuid,
  p_expected_draft_updated_at timestamptz
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_draft record;
  v_payload jsonb;
  v_section jsonb;
  v_section_keys text[];
  v_positions int[];
  v_pos numeric;
  v_pending_add_count int;
  v_remove_ids text[];
  v_remove_id text;
  v_valid_remove_count int;
  v_now timestamptz := clock_timestamp();
begin
  if not exists (
    select 1
    from public.establishments e
    where e.id = p_establishment_id
      and e.owner_id = (select auth.uid())
  ) then
    return jsonb_build_object(
      'ok', false,
      'error_code', 'NOT_AUTHORIZED',
      'error', 'Établissement introuvable ou non autorisé pour cet utilisateur.'
    );
  end if;

  select id, payload, is_dirty, updated_at
    into v_draft
    from public.school_page_drafts
    where establishment_id = p_establishment_id
    for update;

  if not found then
    return jsonb_build_object('ok', false, 'error_code', 'NO_DRAFT', 'error', 'Aucun brouillon trouvé pour cet établissement.');
  end if;

  if v_draft.updated_at is distinct from p_expected_draft_updated_at then
    return jsonb_build_object('ok', false, 'error_code', 'DRAFT_CONFLICT', 'error', 'Le brouillon a été modifié depuis votre dernière lecture.');
  end if;

  if not v_draft.is_dirty then
    return jsonb_build_object('ok', false, 'error_code', 'NO_CHANGES', 'error', 'Aucune modification en attente de publication.');
  end if;

  v_payload := v_draft.payload;

  if jsonb_typeof(v_payload) is distinct from 'object' then
    return jsonb_build_object('ok', false, 'error_code', 'INVALID_DRAFT', 'error', 'Le brouillon est corrompu (payload non-objet).');
  end if;

  if not (
    v_payload ? 'presentation' and v_payload ? 'contact' and v_payload ? 'hero_mode'
    and v_payload ? 'pricing' and v_payload ? 'infrastructure' and v_payload ? 'admissions'
    and v_payload ? 'sections' and v_payload ? 'gallery'
  ) then
    return jsonb_build_object('ok', false, 'error_code', 'INVALID_DRAFT', 'error', 'Le brouillon est incomplet (domaine manquant).');
  end if;

  if v_payload->>'hero_mode' is distinct from 'carousel'
     and v_payload->>'hero_mode' is distinct from 'image'
     and v_payload->>'hero_mode' is distinct from 'none' then
    return jsonb_build_object('ok', false, 'error_code', 'INVALID_DRAFT', 'error', 'hero_mode invalide.');
  end if;

  if jsonb_typeof(v_payload->'sections') is distinct from 'array' then
    return jsonb_build_object('ok', false, 'error_code', 'INVALID_DRAFT', 'error', 'sections doit être une liste.');
  end if;

  if jsonb_array_length(v_payload->'sections') <> 8 then
    return jsonb_build_object('ok', false, 'error_code', 'INVALID_DRAFT', 'error', 'sections doit contenir exactement 8 entrées.');
  end if;

  v_section_keys := '{}';
  v_positions := '{}';
  for v_section in select * from jsonb_array_elements(v_payload->'sections')
  loop
    if jsonb_typeof(v_section->'section_key') is distinct from 'string'
       or not (v_section->>'section_key' = any (array['presentation','admissions','pricing','infrastructure','gallery','news','documents','contact'])) then
      return jsonb_build_object('ok', false, 'error_code', 'INVALID_DRAFT', 'error', 'sections : section_key invalide.');
    end if;

    if jsonb_typeof(v_section->'position') is distinct from 'number' then
      return jsonb_build_object('ok', false, 'error_code', 'INVALID_DRAFT', 'error', 'sections : position invalide.');
    end if;
    v_pos := (v_section->>'position')::numeric;
    if v_pos <> floor(v_pos) or v_pos < 0 or v_pos > 7 then
      return jsonb_build_object('ok', false, 'error_code', 'INVALID_DRAFT', 'error', 'sections : position hors limites (attendu un entier de 0 à 7).');
    end if;

    if jsonb_typeof(v_section->'is_visible') is distinct from 'boolean' then
      return jsonb_build_object('ok', false, 'error_code', 'INVALID_DRAFT', 'error', 'sections : is_visible invalide.');
    end if;

    v_section_keys := v_section_keys || (v_section->>'section_key');
    v_positions := v_positions || v_pos::int;
  end loop;

  if (select count(distinct k) from unnest(v_section_keys) k) <> 8 then
    return jsonb_build_object('ok', false, 'error_code', 'INVALID_DRAFT', 'error', 'sections : section_key dupliquée.');
  end if;

  if (select array_agg(p order by p) from unnest(v_positions) p) is distinct from array[0,1,2,3,4,5,6,7] then
    return jsonb_build_object('ok', false, 'error_code', 'INVALID_DRAFT', 'error', 'sections : positions invalides (attendu 0 à 7, chacune une seule fois).');
  end if;

  if jsonb_typeof(v_payload->'gallery'->'remove_ids') is distinct from 'array' then
    return jsonb_build_object('ok', false, 'error_code', 'INVALID_DRAFT', 'error', 'gallery.remove_ids est invalide.');
  end if;

  select coalesce(array_agg(x), '{}')
    into v_remove_ids
    from jsonb_array_elements_text(v_payload->'gallery'->'remove_ids') x;

  foreach v_remove_id in array v_remove_ids
  loop
    if v_remove_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      return jsonb_build_object('ok', false, 'error_code', 'GALLERY_INVALID', 'error', 'gallery.remove_ids contient un identifiant invalide.');
    end if;
  end loop;

  if cardinality(v_remove_ids) > 0 then
    select count(*)
      into v_valid_remove_count
      from public.school_images si
      where si.id = any (v_remove_ids::uuid[])
        and si.establishment_id = p_establishment_id
        and si.status = 'live';

    if v_valid_remove_count <> cardinality(v_remove_ids) then
      return jsonb_build_object(
        'ok', false,
        'error_code', 'GALLERY_INVALID',
        'error', 'gallery.remove_ids référence une image étrangère, inexistante, ou déjà non publiée.'
      );
    end if;
  end if;

  begin
    update public.establishments
    set
      description = v_payload->'presentation'->>'description',
      phone       = v_payload->'contact'->>'phone',
      email       = v_payload->'contact'->>'email',
      website     = v_payload->'contact'->>'website',
      address     = v_payload->'contact'->>'address',
      city        = v_payload->'contact'->>'city',
      hero_mode   = v_payload->>'hero_mode'
    where id = p_establishment_id;

    insert into public.fees (
      establishment_id, registration_fee, tuition_fee, transport_fee,
      canteen_fee, uniform_fee, exam_fee, other_fees
    )
    values (
      p_establishment_id,
      (v_payload->'pricing'->>'registration_fee')::numeric,
      (v_payload->'pricing'->>'tuition_fee')::numeric,
      (v_payload->'pricing'->>'transport_fee')::numeric,
      (v_payload->'pricing'->>'canteen_fee')::numeric,
      (v_payload->'pricing'->>'uniform_fee')::numeric,
      (v_payload->'pricing'->>'exam_fee')::numeric,
      (v_payload->'pricing'->>'other_fees')::numeric
    )
    on conflict (establishment_id) do update set
      registration_fee = excluded.registration_fee,
      tuition_fee       = excluded.tuition_fee,
      transport_fee     = excluded.transport_fee,
      canteen_fee       = excluded.canteen_fee,
      uniform_fee       = excluded.uniform_fee,
      exam_fee          = excluded.exam_fee,
      other_fees        = excluded.other_fees;

    insert into public.infrastructures (
      establishment_id, library, laboratory, computer_room, sports_field,
      canteen, boarding, transport, security, wifi, infirmary
    )
    values (
      p_establishment_id,
      (v_payload->'infrastructure'->>'library')::boolean,
      (v_payload->'infrastructure'->>'laboratory')::boolean,
      (v_payload->'infrastructure'->>'computer_room')::boolean,
      (v_payload->'infrastructure'->>'sports_field')::boolean,
      (v_payload->'infrastructure'->>'canteen')::boolean,
      (v_payload->'infrastructure'->>'boarding')::boolean,
      (v_payload->'infrastructure'->>'transport')::boolean,
      (v_payload->'infrastructure'->>'security')::boolean,
      (v_payload->'infrastructure'->>'wifi')::boolean,
      (v_payload->'infrastructure'->>'infirmary')::boolean
    )
    on conflict (establishment_id) do update set
      library       = excluded.library,
      laboratory    = excluded.laboratory,
      computer_room = excluded.computer_room,
      sports_field  = excluded.sports_field,
      canteen       = excluded.canteen,
      boarding      = excluded.boarding,
      transport     = excluded.transport,
      security      = excluded.security,
      wifi          = excluded.wifi,
      infirmary     = excluded.infirmary;

    insert into public.admissions_config (
      establishment_id, levels, conditions, required_documents,
      period_start, period_end, additional_info
    )
    values (
      p_establishment_id,
      coalesce((select array_agg(x) from jsonb_array_elements_text(v_payload->'admissions'->'levels') x), '{}'),
      v_payload->'admissions'->>'conditions',
      coalesce((select array_agg(x) from jsonb_array_elements_text(v_payload->'admissions'->'required_documents') x), '{}'),
      nullif(v_payload->'admissions'->>'period_start', '')::date,
      nullif(v_payload->'admissions'->>'period_end', '')::date,
      v_payload->'admissions'->>'additional_info'
    )
    on conflict (establishment_id) do update set
      levels             = excluded.levels,
      conditions         = excluded.conditions,
      required_documents = excluded.required_documents,
      period_start       = excluded.period_start,
      period_end         = excluded.period_end,
      additional_info    = excluded.additional_info;

    for v_section in select * from jsonb_array_elements(v_payload->'sections')
    loop
      insert into public.school_page_sections (establishment_id, section_key, position, is_visible)
      values (
        p_establishment_id,
        v_section->>'section_key',
        (v_section->>'position')::int,
        (v_section->>'is_visible')::boolean
      )
      on conflict (establishment_id, section_key) do update set
        position   = excluded.position,
        is_visible = excluded.is_visible;
    end loop;

    if cardinality(v_remove_ids) > 0 then
      delete from public.school_images
        where id = any (v_remove_ids::uuid[])
          and establishment_id = p_establishment_id
          and status = 'live';
    end if;

    update public.school_images
      set status = 'live'
      where establishment_id = p_establishment_id
        and status = 'draft_pending_add';

    update public.school_page_drafts
    set
      is_dirty = false,
      payload = jsonb_set(v_payload, '{gallery,remove_ids}', '[]'::jsonb)
    where id = v_draft.id;

  exception when others then
    raise log 'publish_school_page failed for establishment %: %', p_establishment_id, sqlerrm;
    return jsonb_build_object(
      'ok', false,
      'error_code', 'PUBLISH_FAILED',
      'error', 'La publication a échoué. Aucune modification n''a été appliquée.'
    );
  end;

  return jsonb_build_object(
    'ok', true,
    'error_code', null,
    'error', null,
    'published_at', v_now,
    'establishment_id', p_establishment_id
  );
end;
$$;

revoke all on function public.publish_school_page(uuid, timestamptz) from public;
revoke all on function public.publish_school_page(uuid, timestamptz) from anon;
grant execute on function public.publish_school_page(uuid, timestamptz) to authenticated;


-- ============================================================================
-- 2. discard_school_page_draft() — restauration EXACTE du corps 0034.
-- Verbatim, aucune modification.
-- ============================================================================
create or replace function public.discard_school_page_draft(
  p_establishment_id uuid,
  p_expected_draft_updated_at timestamptz,
  p_live_payload jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_draft record;
  v_has_pending_add boolean;
  v_now timestamptz := clock_timestamp();
begin
  if not exists (
    select 1
    from public.establishments e
    where e.id = p_establishment_id
      and e.owner_id = (select auth.uid())
  ) then
    return jsonb_build_object('ok', false, 'error_code', 'NOT_AUTHORIZED', 'error', 'Établissement introuvable ou non autorisé pour cet utilisateur.');
  end if;

  select id, is_dirty, updated_at
    into v_draft
    from public.school_page_drafts
    where establishment_id = p_establishment_id
    for update;

  if not found then
    return jsonb_build_object('ok', false, 'error_code', 'NO_DRAFT', 'error', 'Aucun brouillon trouvé pour cet établissement.');
  end if;

  if v_draft.updated_at is distinct from p_expected_draft_updated_at then
    return jsonb_build_object('ok', false, 'error_code', 'DRAFT_CONFLICT', 'error', 'Le brouillon a été modifié depuis votre dernière lecture.');
  end if;

  select exists (
    select 1 from public.school_images
    where establishment_id = p_establishment_id
      and status = 'draft_pending_add'
  ) into v_has_pending_add;

  if not v_draft.is_dirty and not v_has_pending_add then
    return jsonb_build_object('ok', false, 'error_code', 'NO_CHANGES', 'error', 'Aucune modification à abandonner — le brouillon est déjà identique à la version publiée.');
  end if;

  if jsonb_typeof(p_live_payload) is distinct from 'object' then
    return jsonb_build_object('ok', false, 'error_code', 'INVALID_DRAFT', 'error', 'Le payload live fourni est invalide (objet JSON attendu).');
  end if;

  begin
    update public.school_page_drafts
    set
      payload = p_live_payload,
      is_dirty = false
    where id = v_draft.id;

    delete from public.school_images
      where establishment_id = p_establishment_id
        and status = 'draft_pending_add';

  exception when others then
    raise log 'discard_school_page_draft failed for establishment %: %', p_establishment_id, sqlerrm;
    return jsonb_build_object('ok', false, 'error_code', 'DISCARD_FAILED', 'error', 'L''abandon des modifications a échoué. Aucune modification n''a été appliquée.');
  end;

  return jsonb_build_object(
    'ok', true,
    'error_code', null,
    'error', null,
    'discarded_at', v_now,
    'establishment_id', p_establishment_id
  );
end;
$$;

revoke all on function public.discard_school_page_draft(uuid, timestamptz, jsonb) from public;
revoke all on function public.discard_school_page_draft(uuid, timestamptz, jsonb) from anon;
grant execute on function public.discard_school_page_draft(uuid, timestamptz, jsonb) to authenticated;


-- ============================================================================
-- 3. Drop the 2 new tables (cascades their policies/triggers/indexes).
-- ============================================================================
drop table if exists public.school_exam_results;
drop table if exists public.school_official_ranking;
drop function if exists public.touch_school_official_ranking_updated_at();


-- ============================================================================
-- 4. Drop the establishments column-protection trigger + function.
-- ============================================================================
drop trigger if exists establishments_protect_school_page_published_columns on public.establishments;
drop function if exists public.protect_school_page_published_columns();


-- ============================================================================
-- 5. Drop the 7 new establishments columns LAST (nothing above references
-- them once steps 1-4 are done). IRREVERSIBLE data loss for any
-- motto/history/mission/vision/founding_year/student_count/teacher_count
-- value already published before this rollback runs.
-- ============================================================================
alter table public.establishments
  drop column if exists motto,
  drop column if exists history,
  drop column if exists mission,
  drop column if exists vision,
  drop column if exists founding_year,
  drop column if exists student_count,
  drop column if exists teacher_count;

-- ============================================================================
-- FIN ROLLBACK — production restaurée à l'état exact d'avant 0035.
-- ============================================================================
