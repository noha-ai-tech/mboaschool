-- ============================================================================
-- 0028_fix_publish_school_page_owner_check.sql
--
-- PRÉPARÉE, NON EXÉCUTÉE. Attend l'exécution directe par Eddy + l'architecte
-- (même canal que la création initiale de la fonction et que la migration
-- 0027 — cet environnement ne dispose d'aucune capacité d'exécution DDL).
-- SPRINT CMS-F.5B.1 — FIX PRO-04 / PUBLISH RPC AUTH DEPENDENCY.
--
-- CONTEXTE. La fonction public.publish_school_page(uuid, timestamptz) a été
-- créée directement en production (hors dépôt) selon le SQL approuvé en
-- CMS-F.5A.1. Son premier test réel (CMS-F.5B) a révélé qu'elle échoue
-- systématiquement, dès sa toute première ligne :
--
--   ERROR 42883: function public.is_own_establishment(uuid) does not exist
--
-- CAUSE RACINE. La migration parallèle
-- supabase/migrations/20260823060906_pro_04_lot_01_owner_policy_and_helper.sql
-- ("PRO-04 / Lot 01") a :
--   1. remplacé les 3 policies RLS qui utilisaient is_own_establishment()
--      (ai_usage, admissions_config_owner_write, school_page_drafts_owner_only)
--      par un contrôle inline `exists (... e.owner_id = (select auth.uid()))` ;
--   2. puis supprimé public.is_own_establishment(uuid), après avoir vérifié
--      via pg_depend qu'aucune AUTRE policy n'en dépendait.
--
-- Cette vérification pg_depend ne pouvait pas voir la dépendance : un appel
-- de fonction à l'intérieur du corps texte (prosrc) d'une fonction PL/pgSQL
-- n'est pas un objet suivi par pg_depend de la même façon qu'une expression
-- de policy RLS (qual/with_check), qui elle est parsée et son usage de
-- fonction tracé. publish_school_page() a été créée APRÈS ce lot PRO-04
-- mais contenait encore, dans son corps, un appel à l'helper déjà supprimé
-- — invisible à l'audit de dépendances qui avait autorisé le DROP.
--
-- DÉCISION (CMS-F.5B.1). Ne PAS recréer is_own_establishment() : PRO-04 a
-- délibérément fait évoluer la convention vers le contrôle inline sur
-- establishments.owner_id. publish_school_page() doit s'aligner sur cette
-- même convention, pas la contourner.
--
-- PORTÉE DE CETTE CORRECTION. Un seul changement : le bloc d'autorisation
-- en tête de fonction. Tout le reste de la fonction approuvée en CMS-F.5A.1
-- est repris à l'identique — SECURITY INVOKER, search_path, verrouillage
-- FOR UPDATE de la ligne brouillon, garde de version optimiste, garde
-- is_dirty, validation structurelle (domaines, hero_mode, sections —
-- clés/positions/is_visible), gardes Gallery (remove_ids,
-- draft_pending_add), écriture establishments, upserts ON CONFLICT pour
-- fees/infrastructures (débloqués par la migration 0027, déjà exécutée),
-- upsert ON CONFLICT pour admissions_config (n'écrit jamais is_open),
-- upsert ON CONFLICT pour school_page_sections, passage is_dirty=false du
-- brouillon après succès, message générique PUBLISH_FAILED (sqlerrm loggé
-- côté serveur uniquement via RAISE LOG, jamais renvoyé au client), et les
-- revoke/grant (public/anon révoqués, authenticated seul autorisé).
--
-- Cette fonction remplace intégralement (CREATE OR REPLACE) la version
-- actuellement cassée en production — exécutable seule, sans dépendre
-- d'aucun fragment externe.
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
  v_now timestamptz := clock_timestamp();
begin
  -- 1. Ownership — CMS-F.5B.1 : is_own_establishment() a été supprimée par
  -- PRO-04 / Lot 01 ; alignement sur la même convention de contrôle inline
  -- que ses trois autres consommateurs (ai_usage, admissions_config,
  -- school_page_drafts). Ne jamais faire confiance à p_establishment_id
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

  -- 2. Load AND LOCK the draft row before anything else (CMS-F.5A.1 §1) —
  -- inchangé. Sans FOR UPDATE, un PATCH concurrent sur le même brouillon
  -- pourrait s'intercaler entre la lecture et l'écriture de ce Publish ;
  -- avec FOR UPDATE, ce PATCH est bloqué jusqu'à la fin de cette
  -- transaction, puis s'applique correctement après coup (remettant
  -- is_dirty=true si nécessaire) au lieu d'être silencieusement perdu.
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
  -- IS DISTINCT FROM (jamais !=) pour qu'une valeur attendue NULL ne
  -- puisse jamais contourner silencieusement ce contrôle.
  if v_draft.updated_at is distinct from p_expected_draft_updated_at then
    return jsonb_build_object(
      'ok', false,
      'error_code', 'DRAFT_CONFLICT',
      'error', 'Le brouillon a été modifié depuis votre dernière lecture.'
    );
  end if;

  -- 4. Dirty guard — jamais de fausse publication, jamais de timestamp
  -- modifié juste parce que Publish a été cliqué.
  if not v_draft.is_dirty then
    return jsonb_build_object(
      'ok', false,
      'error_code', 'NO_CHANGES',
      'error', 'Aucune modification en attente de publication.'
    );
  end if;

  v_payload := v_draft.payload;

  -- 5. Validation structurelle. Chaque contrôle est séquentiel (jamais
  -- combiné dans une condition composée "A or B"), pour qu'un contrôle
  -- plus tardif ne puisse jamais s'exécuter — et potentiellement lever une
  -- exception — avant qu'un contrôle antérieur ait confirmé que c'est sûr.
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

  -- section_key, position et is_visible validés ensemble en un seul
  -- passage. Chaque conversion jsonb->numeric est précédée d'un contrôle
  -- jsonb_typeof explicite, de sorte que rien ici ne puisse jamais lever
  -- d'exception (une conversion qui échouerait ici, avant le bloc
  -- d'écriture protégé par exception, exposerait sinon une erreur
  -- Postgres brute à l'appelant).
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

  -- 6. Garde Gallery (règle explicite F.5A) — contrôlée AVANT toute
  -- écriture, pour qu'un échec de garde ne produise aucune modification
  -- des tables live. Remplacée/étendue en CMS-F.6 une fois la transaction
  -- média complète construite.
  if jsonb_typeof(v_payload->'gallery'->'remove_ids') is distinct from 'array' then
    return jsonb_build_object('ok', false, 'error_code', 'INVALID_DRAFT', 'error', 'gallery.remove_ids est invalide.');
  end if;

  if jsonb_array_length(v_payload->'gallery'->'remove_ids') > 0 then
    return jsonb_build_object('ok', false, 'error_code', 'GALLERY_NOT_READY', 'error', 'Des suppressions de galerie sont en attente — publication bloquée avant CMS-F.6.');
  end if;

  select count(*)
    into v_pending_add_count
    from public.school_images
    where establishment_id = p_establishment_id
      and status = 'draft_pending_add';

  if v_pending_add_count > 0 then
    return jsonb_build_object('ok', false, 'error_code', 'GALLERY_NOT_READY', 'error', 'Des photos en attente d''ajout existent — publication bloquée avant CMS-F.6.');
  end if;

  -- 7. Application — chaque écriture ci-dessous partage UNE transaction
  -- via ce bloc protégé par exception. Tout échec annule tout ce qui a été
  -- fait dans ce BEGIN...END, y compris les écritures antérieures
  -- réussies dans le même bloc. Le verrou de ligne acquis à l'étape 2 est
  -- conservé pour toute la transaction indépendamment de ce savepoint,
  -- donc aucune autre session ne peut s'intercaler sur ce même brouillon
  -- pendant cette exécution.
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

    -- fees : migration 0027 (déjà exécutée) a ajouté NOT NULL + UNIQUE sur
    -- establishment_id — ON CONFLICT est donc valide. currency n'est
    -- jamais mentionné dans DO UPDATE (préservé tel quel) ni dans la liste
    -- de colonnes INSERT au-delà de son défaut de colonne ('FCFA') —
    -- jamais inventé, jamais dans le contrat du brouillon.
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

    -- infrastructures : même déblocage par la migration 0027.
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

    -- admissions_config : unique(establishment_id) déjà confirmée en
    -- production avant même 0027. is_open n'est mentionné nulle part dans
    -- cette instruction — structurellement impossible pour Publish de le
    -- modifier.
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

    -- school_page_sections : unique(establishment_id, section_key) et la
    -- contrainte CHECK sur section_key déjà confirmées en production.
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

    -- Marque le brouillon propre. payload n'est pas touché (il est déjà
    -- égal à ce qui vient d'être publié) ; updated_at est mis à jour par
    -- le trigger existant touch_school_page_drafts_updated_at (CMS-F.1,
    -- non modifié).
    update public.school_page_drafts
    set is_dirty = false
    where id = v_draft.id;

  exception when others then
    -- L'erreur Postgres brute (sqlerrm) est journalisée uniquement côté
    -- serveur (visible par l'architecte/l'équipe ops via les logs
    -- Postgres, jamais envoyée au navigateur) et jamais incluse dans le
    -- jsonb renvoyé. L'appelant ne voit toujours qu'un message générique
    -- et sûr.
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
-- FIN — CREATE OR REPLACE complet de publish_school_page(uuid, timestamptz).
-- Un seul changement fonctionnel par rapport à la version CMS-F.5A.1 :
-- le bloc d'autorisation (is_own_establishment() supprimée par PRO-04 →
-- contrôle inline sur establishments.owner_id). Tout le reste — verrou
-- FOR UPDATE, gardes de version/dirty/validation/Gallery, écritures ON
-- CONFLICT, préservation de is_open, message générique PUBLISH_FAILED,
-- revoke/grant — est repris à l'identique de la version approuvée.
-- ============================================================================
