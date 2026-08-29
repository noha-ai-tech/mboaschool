-- ============================================================================
-- 0035_school_page_identity_results_ranking.sql
--
-- PRÉPARÉE, NON EXÉCUTÉE. Attend la revue d'Eddy + l'architecte avant toute
-- exécution en production (cet environnement ne dispose d'aucune capacité
-- d'exécution DDL).
--
-- PUBLIC-SITE-02 — CMS CONTROL FOR MINI-SITE IDENTITY/RESULTS/RANKING.
--
-- Extends the Draft → Preview → Publish → Discard lifecycle (school_page_
-- drafts, publish_school_page(), discard_school_page_draft() — 0029/0031/
-- 0033/0034) to cover every school-specific field the PUBLIC-SITE-01/02
-- mini-site displays, so no school-specific content is ever hard-coded.
--
-- Reuses the existing lifecycle exactly, no second CMS, no page builder:
--   - 4 new SCALAR text columns on establishments (motto/history/mission/
--     vision) — same mechanism as the existing `description` column,
--     written by publish_school_page() from payload.presentation.
--   - 3 new SCALAR integer columns on establishments (founding_year/
--     student_count/teacher_count) — same mechanism, from a new
--     payload.key_numbers domain.
--   - 1 new 1-row-per-establishment table, school_official_ranking —
--     same shape as fees/infrastructures/admissions_config (upsert on
--     publish), from a new payload.ranking domain.
--   - 1 new REPEATABLE table, school_exam_results — same status-column
--     lifecycle as school_images (0026: 'live' | 'draft_pending_add',
--     added immediately via a dedicated route, removed live rows tracked
--     via payload.results.remove_ids exactly like payload.gallery.
--     remove_ids), promoted/deleted by publish_school_page(), pending rows
--     dropped by discard_school_page_draft().
--
-- No official_website_url column — the mission's IDENTITY "official
-- website" requirement is already served by the existing establishments.
-- website / payload.contact.website (CMS-editable since CMS-F.2/F.5) —
-- adding a second field would be a duplicate semantic field (explicitly
-- disallowed, PUBLIC-SITE-01 §5 / PUBLIC-SITE-02 §4).
--
-- Both RPCs below are CREATE OR REPLACE of the exact CURRENT production
-- bodies (publish_school_page from 0033, discard_school_page_draft from
-- 0034) — every existing check/branch is preserved unchanged; only the new
-- domains are added. Ownership check uses the CURRENT convention (inline
-- `e.owner_id = (select auth.uid())`, established by PRO-04/Lot 01 —
-- is_own_establishment() no longer exists in production, never referenced
-- here).
-- ============================================================================


-- ============================================================================
-- 1. establishments — 7 new nullable scalar columns, additive only.
-- ============================================================================
alter table public.establishments
  add column if not exists motto text,
  add column if not exists history text,
  add column if not exists mission text,
  add column if not exists vision text,
  add column if not exists founding_year integer,
  add column if not exists student_count integer,
  add column if not exists teacher_count integer;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'establishments_founding_year_check'
      and conrelid = 'public.establishments'::regclass
  ) then
    alter table public.establishments
      add constraint establishments_founding_year_check
      check (founding_year is null or founding_year between 1800 and extract(year from now())::int);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'establishments_student_count_check'
      and conrelid = 'public.establishments'::regclass
  ) then
    alter table public.establishments
      add constraint establishments_student_count_check
      check (student_count is null or student_count >= 0);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'establishments_teacher_count_check'
      and conrelid = 'public.establishments'::regclass
  ) then
    alter table public.establishments
      add constraint establishments_teacher_count_check
      check (teacher_count is null or teacher_count >= 0);
  end if;
end
$$;

comment on column public.establishments.motto is
  'PUBLIC-SITE-02 — devise/slogan, CMS-editable via payload.presentation.motto. Never fabricated client-side.';
comment on column public.establishments.history is
  'PUBLIC-SITE-02 — historique, CMS-editable via payload.presentation.history.';
comment on column public.establishments.mission is
  'PUBLIC-SITE-02 — mission, CMS-editable via payload.presentation.mission.';
comment on column public.establishments.vision is
  'PUBLIC-SITE-02 — vision, CMS-editable via payload.presentation.vision.';
comment on column public.establishments.founding_year is
  'PUBLIC-SITE-02 — CMS-editable via payload.key_numbers.founding_year. Null = hidden on the mini-site key-numbers row, never a fabricated value.';
comment on column public.establishments.student_count is
  'PUBLIC-SITE-02 — CMS-editable via payload.key_numbers.student_count.';
comment on column public.establishments.teacher_count is
  'PUBLIC-SITE-02 — CMS-editable via payload.key_numbers.teacher_count.';


-- ============================================================================
-- 2. school_official_ranking — 1 row per establishment, mirrors fees/
-- infrastructures/admissions_config exactly (same RLS shape as 0028
-- admissions_config: public read, owner write via the current inline
-- ownership convention). year/rank/scope/source are required TOGETHER
-- (mission §6 — never label a ranking "official" without provenance);
-- source_url is optional.
-- ============================================================================
create table if not exists public.school_official_ranking (
  id             uuid primary key default gen_random_uuid(),
  establishment_id uuid not null unique references public.establishments(id) on delete cascade,
  year           integer not null,
  rank           text not null,
  scope          text not null,
  source         text not null,
  source_url     text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint school_official_ranking_year_check check (year between 1990 and extract(year from now())::int + 1)
);

comment on table public.school_official_ranking is
  'PUBLIC-SITE-02 §6 — single official ranking per establishment. year/rank/scope/source required together (never displayed as "official" without provenance); source_url optional. CMS-editable via payload.ranking, published atomically by publish_school_page().';

create or replace function public.touch_school_official_ranking_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists school_official_ranking_touch_updated_at on public.school_official_ranking;
create trigger school_official_ranking_touch_updated_at
  before update on public.school_official_ranking
  for each row execute procedure public.touch_school_official_ranking_updated_at();

alter table public.school_official_ranking enable row level security;

drop policy if exists "school_official_ranking_public_read" on public.school_official_ranking;
create policy "school_official_ranking_public_read" on public.school_official_ranking
  for select
  using (true);

drop policy if exists "school_official_ranking_owner_write" on public.school_official_ranking;
create policy "school_official_ranking_owner_write" on public.school_official_ranking
  for all
  using (
    exists (
      select 1 from public.establishments e
      where e.id = school_official_ranking.establishment_id
        and e.owner_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.establishments e
      where e.id = school_official_ranking.establishment_id
        and e.owner_id = (select auth.uid())
    )
  );

revoke all on public.school_official_ranking from anon, authenticated;
grant select on public.school_official_ranking to anon, authenticated;
grant insert, update, delete on public.school_official_ranking to authenticated;


-- ============================================================================
-- 3. school_exam_results — repeatable, mirrors school_images' status
-- lifecycle exactly ('live' | 'draft_pending_add'). Added immediately via
-- a dedicated route (draft_pending_add, never 'live' directly — same as
-- gallery upload), removed live rows tracked in payload.results.remove_ids
-- (never a status on the row itself, same as gallery.remove_ids),
-- promoted/deleted atomically by publish_school_page(). Public SELECT is
-- scoped to status='live' from day one (unlike school_images' historical
-- two-step 0026→0032 tightening — this is a new table, no retrofit needed).
-- ============================================================================
create table if not exists public.school_exam_results (
  id                    uuid primary key default gen_random_uuid(),
  establishment_id      uuid not null references public.establishments(id) on delete cascade,
  exam                  text not null,
  academic_year         integer not null,
  candidates_count      integer,
  admitted_count        integer,
  success_rate_percent  numeric(5,2),
  status                text not null default 'live',
  created_at            timestamptz not null default now(),
  constraint school_exam_results_status_check check (status in ('live', 'draft_pending_add')),
  constraint school_exam_results_academic_year_check check (academic_year between 1990 and extract(year from now())::int + 1),
  constraint school_exam_results_candidates_count_check check (candidates_count is null or candidates_count >= 0),
  constraint school_exam_results_admitted_count_check check (admitted_count is null or admitted_count >= 0),
  constraint school_exam_results_admitted_le_candidates_check check (
    candidates_count is null or admitted_count is null or admitted_count <= candidates_count
  ),
  constraint school_exam_results_success_rate_check check (
    success_rate_percent is null or (success_rate_percent >= 0 and success_rate_percent <= 100)
  )
);

comment on table public.school_exam_results is
  'PUBLIC-SITE-02 §3/§7 — repeatable exam results (BEPC/Probatoire/Bac/GCE...), one row per exam+year. status mirrors school_images: ''live'' (public) or ''draft_pending_add'' (staged, added via POST /api/school-page/results, promoted on Publish). Editing an existing live row = add its replacement as draft_pending_add + list the old row in payload.results.remove_ids, same UX as gallery photos — never an in-place edit.';

create index if not exists idx_school_exam_results_establishment on public.school_exam_results (establishment_id);

alter table public.school_exam_results enable row level security;

drop policy if exists "school_exam_results_public_read" on public.school_exam_results;
create policy "school_exam_results_public_read" on public.school_exam_results
  for select
  using (status = 'live');

drop policy if exists "school_exam_results_owner_all" on public.school_exam_results;
create policy "school_exam_results_owner_all" on public.school_exam_results
  for all
  using (
    exists (
      select 1 from public.establishments e
      where e.id = school_exam_results.establishment_id
        and e.owner_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.establishments e
      where e.id = school_exam_results.establishment_id
        and e.owner_id = (select auth.uid())
    )
  );

revoke all on public.school_exam_results from anon, authenticated;
grant select on public.school_exam_results to anon, authenticated;
grant insert, update, delete on public.school_exam_results to authenticated;


-- ============================================================================
-- 4. publish_school_page() — CREATE OR REPLACE of the CURRENT production
-- body (0033). Every existing check/branch is unchanged; additions only:
--   - establishments UPDATE gains 7 columns from payload.presentation
--     (.motto/.history/.mission/.vision) and payload.key_numbers
--     (.founding_year/.student_count/.teacher_count);
--   - upsert school_official_ranking from payload.ranking (skipped
--     entirely when payload.ranking is null — a school with no ranking
--     configured has no row, never a row of nulls);
--   - payload.results.remove_ids validated (UUID shape, ownership,
--     status='live') and deleted, EXACT same pattern as gallery.
--     remove_ids (step 6/7 below) — GALLERY_INVALID reused as the error
--     code family (RESULTS_INVALID for results-specific failures, kept
--     distinct so the client can tell which list failed validation);
--   - draft_pending_add school_exam_results rows promoted to 'live',
--     exact same pattern as school_images promotion;
--   - payload.results.remove_ids cleared via jsonb_set alongside
--     gallery.remove_ids, same is_dirty=false update.
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
  v_remove_ids text[];
  v_remove_id text;
  v_valid_remove_count int;
  v_result_remove_ids text[];
  v_result_remove_id text;
  v_valid_result_remove_count int;
  v_now timestamptz := clock_timestamp();
begin
  -- 1. Ownership — unchanged inline convention (PRO-04/Lot 01).
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

  -- 2. Load AND LOCK the draft row — unchanged.
  select id, payload, is_dirty, updated_at
    into v_draft
    from public.school_page_drafts
    where establishment_id = p_establishment_id
    for update;

  if not found then
    return jsonb_build_object('ok', false, 'error_code', 'NO_DRAFT', 'error', 'Aucun brouillon trouvé pour cet établissement.');
  end if;

  -- 3. Optimistic concurrency — unchanged.
  if v_draft.updated_at is distinct from p_expected_draft_updated_at then
    return jsonb_build_object('ok', false, 'error_code', 'DRAFT_CONFLICT', 'error', 'Le brouillon a été modifié depuis votre dernière lecture.');
  end if;

  -- 4. Dirty guard — unchanged.
  if not v_draft.is_dirty then
    return jsonb_build_object('ok', false, 'error_code', 'NO_CHANGES', 'error', 'Aucune modification en attente de publication.');
  end if;

  v_payload := v_draft.payload;

  -- 5. Structural validation — unchanged from 0033, PLUS presence checks
  -- for the 2 new domains (key_numbers, results) — ranking is NOT required
  -- (it is legitimately null for a school with no configured ranking).
  if jsonb_typeof(v_payload) is distinct from 'object' then
    return jsonb_build_object('ok', false, 'error_code', 'INVALID_DRAFT', 'error', 'Le brouillon est corrompu (payload non-objet).');
  end if;

  if not (
    v_payload ? 'presentation' and v_payload ? 'contact' and v_payload ? 'hero_mode'
    and v_payload ? 'pricing' and v_payload ? 'infrastructure' and v_payload ? 'admissions'
    and v_payload ? 'sections' and v_payload ? 'gallery'
    and v_payload ? 'key_numbers' and v_payload ? 'results'
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

  -- 6. Gallery validation — unchanged from 0033.
  if jsonb_typeof(v_payload->'gallery'->'remove_ids') is distinct from 'array' then
    return jsonb_build_object('ok', false, 'error_code', 'INVALID_DRAFT', 'error', 'gallery.remove_ids est invalide.');
  end if;

  select coalesce(array_agg(x), '{}') into v_remove_ids from jsonb_array_elements_text(v_payload->'gallery'->'remove_ids') x;

  foreach v_remove_id in array v_remove_ids
  loop
    if v_remove_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      return jsonb_build_object('ok', false, 'error_code', 'GALLERY_INVALID', 'error', 'gallery.remove_ids contient un identifiant invalide.');
    end if;
  end loop;

  if cardinality(v_remove_ids) > 0 then
    select count(*) into v_valid_remove_count
      from public.school_images si
      where si.id = any (v_remove_ids::uuid[])
        and si.establishment_id = p_establishment_id
        and si.status = 'live';

    if v_valid_remove_count <> cardinality(v_remove_ids) then
      return jsonb_build_object('ok', false, 'error_code', 'GALLERY_INVALID', 'error', 'gallery.remove_ids référence une image étrangère, inexistante, ou déjà non publiée.');
    end if;
  end if;

  -- 6b. PUBLIC-SITE-02 — results.remove_ids validation, exact same pattern
  -- as gallery.remove_ids above, distinct error_code (RESULTS_INVALID) so
  -- the client can attribute the failure to the right list.
  if jsonb_typeof(v_payload->'results'->'remove_ids') is distinct from 'array' then
    return jsonb_build_object('ok', false, 'error_code', 'INVALID_DRAFT', 'error', 'results.remove_ids est invalide.');
  end if;

  select coalesce(array_agg(x), '{}') into v_result_remove_ids from jsonb_array_elements_text(v_payload->'results'->'remove_ids') x;

  foreach v_result_remove_id in array v_result_remove_ids
  loop
    if v_result_remove_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      return jsonb_build_object('ok', false, 'error_code', 'RESULTS_INVALID', 'error', 'results.remove_ids contient un identifiant invalide.');
    end if;
  end loop;

  if cardinality(v_result_remove_ids) > 0 then
    select count(*) into v_valid_result_remove_count
      from public.school_exam_results sr
      where sr.id = any (v_result_remove_ids::uuid[])
        and sr.establishment_id = p_establishment_id
        and sr.status = 'live';

    if v_valid_result_remove_count <> cardinality(v_result_remove_ids) then
      return jsonb_build_object('ok', false, 'error_code', 'RESULTS_INVALID', 'error', 'results.remove_ids référence un résultat étranger, inexistant, ou déjà non publié.');
    end if;
  end if;

  -- 7. Apply — single transaction, unchanged locking/exception discipline.
  begin
    update public.establishments
    set
      description = v_payload->'presentation'->>'description',
      motto       = nullif(v_payload->'presentation'->>'motto', ''),
      history     = nullif(v_payload->'presentation'->>'history', ''),
      mission     = nullif(v_payload->'presentation'->>'mission', ''),
      vision      = nullif(v_payload->'presentation'->>'vision', ''),
      phone       = v_payload->'contact'->>'phone',
      email       = v_payload->'contact'->>'email',
      website     = v_payload->'contact'->>'website',
      address     = v_payload->'contact'->>'address',
      city        = v_payload->'contact'->>'city',
      hero_mode   = v_payload->>'hero_mode',
      founding_year = nullif(v_payload->'key_numbers'->>'founding_year', '')::int,
      student_count = nullif(v_payload->'key_numbers'->>'student_count', '')::int,
      teacher_count = nullif(v_payload->'key_numbers'->>'teacher_count', '')::int
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

    -- PUBLIC-SITE-02 — ranking upsert. Skipped entirely (no insert, no
    -- delete) when payload.ranking is null: a school with no configured
    -- ranking simply has no row, never a row of nulls that some future
    -- reader might mistake for "ranked, but empty".
    if v_payload->'ranking' is not null and jsonb_typeof(v_payload->'ranking') = 'object' then
      insert into public.school_official_ranking (establishment_id, year, rank, scope, source, source_url)
      values (
        p_establishment_id,
        (v_payload->'ranking'->>'year')::int,
        v_payload->'ranking'->>'rank',
        v_payload->'ranking'->>'scope',
        v_payload->'ranking'->>'source',
        nullif(v_payload->'ranking'->>'source_url', '')
      )
      on conflict (establishment_id) do update set
        year       = excluded.year,
        rank       = excluded.rank,
        scope      = excluded.scope,
        source     = excluded.source,
        source_url = excluded.source_url;
    else
      delete from public.school_official_ranking where establishment_id = p_establishment_id;
    end if;

    -- Gallery — unchanged from 0033.
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

    -- PUBLIC-SITE-02 — exam results, exact same promote/delete pattern.
    if cardinality(v_result_remove_ids) > 0 then
      delete from public.school_exam_results
        where id = any (v_result_remove_ids::uuid[])
          and establishment_id = p_establishment_id
          and status = 'live';
    end if;

    update public.school_exam_results
      set status = 'live'
      where establishment_id = p_establishment_id
        and status = 'draft_pending_add';

    update public.school_page_drafts
    set
      is_dirty = false,
      payload = jsonb_set(
        jsonb_set(v_payload, '{gallery,remove_ids}', '[]'::jsonb),
        '{results,remove_ids}', '[]'::jsonb
      )
    where id = v_draft.id;

  exception when others then
    raise log 'publish_school_page failed for establishment %: %', p_establishment_id, sqlerrm;
    return jsonb_build_object('ok', false, 'error_code', 'PUBLISH_FAILED', 'error', 'La publication a échoué. Aucune modification n''a été appliquée.');
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
-- 5. discard_school_page_draft() — CREATE OR REPLACE of the CURRENT
-- production body (0034). Only addition: draft_pending_add
-- school_exam_results rows are dropped alongside draft_pending_add
-- school_images rows (both are "never published, nothing to preserve").
-- payload is still fully replaced by p_live_payload (computed by
-- buildLiveSnapshot(), TypeScript-side — never rebuilt in SQL, same
-- documented trade-off as 0034), which now includes the new domains.
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

  -- PUBLIC-SITE-02 — pending exam results now also count as "something to
  -- discard", exact same reasoning as pending images (uploaded/added
  -- independently of is_dirty).
  select exists (
    select 1 from public.school_images
    where establishment_id = p_establishment_id and status = 'draft_pending_add'
  ) or exists (
    select 1 from public.school_exam_results
    where establishment_id = p_establishment_id and status = 'draft_pending_add'
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

    delete from public.school_exam_results
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
-- FIN — 7 nouvelles colonnes additives (establishments), 2 nouvelles tables
-- additives (school_official_ranking, school_exam_results), CREATE OR
-- REPLACE complet des 2 RPC existantes. Aucune donnée existante modifiée,
-- aucune policy publique retirée. school_documents/school_announcements
-- restent hors de ce mécanisme, inchangées.
-- ============================================================================
