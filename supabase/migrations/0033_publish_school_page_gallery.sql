-- ============================================================================
-- SYNC-03 REPOSITORY RECONCILIATION — GIT RENUMBERING ONLY.
--
-- Historically executed in production under filename 0030_publish_school_page_gallery.sql
-- (branch feat/pro-school-organization). Renumbered to 0033_publish_school_page_gallery.sql during
-- repository reconciliation with origin/main, whose own registry track
-- independently occupied numbers 0021-0025 (establishment_registry_
-- identifiers, transport_source_ministry_enum, registry_column_
-- protection, school_page_sections, storage_multi_school_hardening — see
-- reports/release/release-integration-a-conflict-resolution.csv on
-- origin/main for that side's own equivalent reconciliation).
--
-- DO NOT interpret this rename as pending DDL for the existing production
-- database. The SQL body below is byte-for-byte unchanged from 0030_publish_school_page_gallery.sql;
-- nothing here needs to be (re)executed. This header is documentation
-- only, added purely to prevent a future reader from mistaking an
-- already-applied migration for pending work.
-- ============================================================================

-- ============================================================================
-- 0030_publish_school_page_gallery.sql
--
-- PRÉPARÉE, NON EXÉCUTÉE. Attend l'exécution directe par Eddy + l'architecte
-- (même canal que les migrations 0027/0028/0029 — cet environnement ne
-- dispose d'aucune capacité d'exécution DDL). DÉPEND de 0029 (policy
-- publique school_images) exécutée AVANT ou EN MÊME TEMPS — sans elle, une
-- image tout juste promue 'live' par cette RPC resterait quand même
-- publiquement lisible avant promotion via l'ancienne policy `using (true)`
-- (déjà le cas aujourd'hui, ce risque existe indépendamment de cette RPC).
--
-- SPRINT CMS-F.6 — GALLERY DRAFT LIFECYCLE.
--
-- Remplace intégralement (CREATE OR REPLACE) la version CMS-F.5B.1
-- (0028_fix_publish_school_page_owner_check.sql, en production). Un seul
-- changement fonctionnel : les DEUX gardes Gallery bloquantes
-- (remove_ids non-vide → GALLERY_NOT_READY ; draft_pending_add existant →
-- GALLERY_NOT_READY) sont remplacées par une VRAIE publication Gallery,
-- dans la même transaction atomique que tous les autres domaines :
--
--   A. valider chaque remove_id : forme UUID, appartient à
--      p_establishment_id, status='live' actuellement — sinon
--      GALLERY_INVALID, zéro écriture ;
--   B. supprimer les lignes school_images correspondantes (DB uniquement —
--      Postgres ne peut pas orchestrer la suppression d'objets Supabase
--      Storage dans la même transaction relationnelle, voir le rapport
--      CMS-F.6 section STORAGE CLEANUP pour la stratégie applicative
--      post-commit) ;
--   C. promouvoir toutes les lignes draft_pending_add de cet établissement
--      vers status='live' ;
--   D. vider payload.gallery.remove_ids (jsonb_set) en même temps que le
--      passage is_dirty=false du brouillon ;
--   E/F. tout le reste (établissements, fees, infrastructures, admissions,
--      sections, is_dirty=false) est repris À L'IDENTIQUE de 0028.
--
-- Tout le reste de la fonction approuvée (CMS-F.5A.1/F.5A.2/F.5B.1) est
-- conservé sans modification : SECURITY INVOKER, search_path, verrou
-- FOR UPDATE sur le brouillon, garde de version optimiste, garde is_dirty,
-- validation structurelle (domaines, hero_mode, sections — clés/positions/
-- is_visible), écriture establishments, upserts ON CONFLICT pour
-- fees/infrastructures/admissions_config/school_page_sections (jamais
-- is_open), message générique PUBLISH_FAILED (sqlerrm loggé côté serveur
-- uniquement), et les revoke/grant (public/anon révoqués, authenticated
-- seul autorisé).
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
  -- 1. Ownership — is_own_establishment() a été supprimée par PRO-04 / Lot
  -- 01 (CMS-F.5B.1) ; alignement sur le même contrôle inline que ses
  -- autres consommateurs. Ne jamais faire confiance à p_establishment_id
  -- simplement parce qu'il a été fourni.
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

  -- 2. Load AND LOCK the draft row before anything else (CMS-F.5A.1 §1).
  select id, payload, is_dirty, updated_at
    into v_draft
    from public.school_page_drafts
    where establishment_id = p_establishment_id
    for update;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'error_code', 'NO_DRAFT',
      'error', 'Aucun brouillon trouvé pour cet établissement.'
    );
  end if;

  -- 3. Optimistic concurrency, évaluée sur la ligne verrouillée.
  if v_draft.updated_at is distinct from p_expected_draft_updated_at then
    return jsonb_build_object(
      'ok', false,
      'error_code', 'DRAFT_CONFLICT',
      'error', 'Le brouillon a été modifié depuis votre dernière lecture.'
    );
  end if;

  -- 4. Dirty guard — jamais de fausse publication.
  if not v_draft.is_dirty then
    return jsonb_build_object(
      'ok', false,
      'error_code', 'NO_CHANGES',
      'error', 'Aucune modification en attente de publication.'
    );
  end if;

  v_payload := v_draft.payload;

  -- 5. Validation structurelle — inchangée depuis 0028.
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

  -- 6. CMS-F.6 — validation Gallery. Remplace les anciennes gardes
  -- bloquantes GALLERY_NOT_READY : remove_ids est maintenant réellement
  -- traité, pas simplement interdit. Forme d'abord (jamais de cast qui
  -- pourrait lever avant d'avoir vérifié le format), puis appartenance +
  -- statut — tout échec ici est GALLERY_INVALID, zéro écriture (contrôlé
  -- AVANT le bloc d'écriture).
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

  -- 7. Apply — chaque écriture ci-dessous partage UNE transaction via ce
  -- bloc protégé par exception. Le verrou de ligne acquis à l'étape 2 est
  -- conservé pour toute la transaction.
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

    -- CMS-F.6 — Gallery : suppression DB des lignes live retenues dans
    -- remove_ids (déjà validées ci-dessus : appartiennent à cet
    -- établissement, status='live'). L'objet Storage correspondant N'EST
    -- JAMAIS supprimé ici — Postgres ne doit pas orchestrer Supabase
    -- Storage dans cette transaction relationnelle. Le nettoyage Storage
    -- est un best-effort applicatif APRÈS le commit (voir
    -- /api/school-page/publish et le rapport CMS-F.6, section STORAGE
    -- CLEANUP) : un orphelin Storage temporaire est acceptable, jamais
    -- une incohérence de données.
    if cardinality(v_remove_ids) > 0 then
      delete from public.school_images
        where id = any (v_remove_ids::uuid[])
          and establishment_id = p_establishment_id
          and status = 'live';
    end if;

    -- Promotion des images en attente d'ajout — inherently scoped par
    -- establishment_id (CMS-F.6 §15), aucune validation supplémentaire
    -- nécessaire au-delà du filtre WHERE.
    update public.school_images
      set status = 'live'
      where establishment_id = p_establishment_id
        and status = 'draft_pending_add';

    -- Marque le brouillon propre ET vide gallery.remove_ids (l'intention
    -- de suppression vient d'être exécutée, elle ne doit pas survivre
    -- dans le payload). Le reste du payload (presentation/contact/hero_
    -- mode/pricing/infrastructure/admissions/sections) reste inchangé —
    -- il équivaut déjà à ce qui vient d'être publié.
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
