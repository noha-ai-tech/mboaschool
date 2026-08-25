-- ============================================================================
-- 0031_discard_school_page_draft.sql
--
-- PRÉPARÉE, NON EXÉCUTÉE. Attend l'exécution directe par Eddy + l'architecte
-- (même canal que 0026/0027/0028/0029/0030 — cet environnement ne dispose
-- d'aucune capacité d'exécution DDL).
--
-- SPRINT CMS-F.7 — DISCARD DRAFT / RESET TO LIVE.
--
-- "Abandonner les modifications" : remet le brouillon à l'identique de LIVE
-- (tous les domaines GLOBAL DRAFT) et abandonne les photos en attente
-- d'ajout (draft_pending_add). N'écrit JAMAIS dans une table live —
-- contrairement à publish_school_page(), Discard ne touche QUE
-- school_page_drafts et les lignes draft_pending_add de school_images.
-- Aucune image live n'est jamais supprimée ni modifiée (une suppression
-- planifiée est annulée en réinitialisant gallery.remove_ids à [], jamais
-- en touchant les lignes live elles-mêmes). admissions_config.is_open,
-- school_announcements (News) et school_documents (Documents) ne sont pas
-- référencés par cette fonction — ils restent immediate-live, hors de sa
-- portée par construction (aucune table live dans son corps).
--
-- TRADE-OFF ARCHITECTURAL (documenté, voir aussi le rapport CMS-F.7) :
-- le payload LIVE cible n'est PAS reconstruit en SQL ici — cela dupliquerait
-- buildLiveSnapshot() (src/lib/schoolPage/snapshot.ts), déjà la seule source
-- de vérité pour la correspondance live -> brouillon (réutilisée par GET
-- /api/school-page/draft ET par Preview). p_live_payload est calculé
-- côté serveur par /api/school-page/draft/discard via cette même fonction
-- TypeScript, puis transmis ici — jamais depuis le navigateur (la route ne
-- lit que expected_updated_at depuis le corps de la requête). Une validation
-- de forme minimale (objet JSON) reste appliquée en défense en profondeur,
-- jamais une confiance aveugle même pour une donnée serveur-à-serveur.
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
  -- 1. Ownership — même contrôle inline que publish_school_page() (CMS-F.5B.1) :
  -- is_own_establishment() a été supprimée par PRO-04 / Lot 01, jamais recréée.
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

  -- 2. Charger ET verrouiller la ligne de brouillon avant toute autre chose
  -- (même discipline que publish_school_page() §2).
  select id, is_dirty, updated_at
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

  -- 3. Concurrence optimiste, évaluée sur la ligne verrouillée.
  if v_draft.updated_at is distinct from p_expected_draft_updated_at then
    return jsonb_build_object(
      'ok', false,
      'error_code', 'DRAFT_CONFLICT',
      'error', 'Le brouillon a été modifié depuis votre dernière lecture.'
    );
  end if;

  -- 4. Rien à abandonner ? Le brouillon peut être is_dirty=false tout en
  -- ayant des photos draft_pending_add en attente (l'upload Galerie écrit
  -- directement school_images, indépendamment de is_dirty — voir CMS-F.6).
  -- Les deux conditions doivent donc être vérifiées, jamais is_dirty seul.
  select exists (
    select 1 from public.school_images
    where establishment_id = p_establishment_id
      and status = 'draft_pending_add'
  ) into v_has_pending_add;

  if not v_draft.is_dirty and not v_has_pending_add then
    return jsonb_build_object(
      'ok', false,
      'error_code', 'NO_CHANGES',
      'error', 'Aucune modification à abandonner — le brouillon est déjà identique à la version publiée.'
    );
  end if;

  -- 5. Validation minimale de forme — défense en profondeur sur une donnée
  -- pourtant déjà serveur-à-serveur (jamais issue du navigateur).
  if jsonb_typeof(p_live_payload) is distinct from 'object' then
    return jsonb_build_object(
      'ok', false,
      'error_code', 'INVALID_DRAFT',
      'error', 'Le payload live fourni est invalide (objet JSON attendu).'
    );
  end if;

  -- 6. Apply — une seule table live jamais touchée : Discard ne réécrit
  -- QUE le brouillon et les lignes draft_pending_add. Aucune image live
  -- n'est supprimée ni modifiée ; annuler une suppression planifiée se
  -- fait simplement en ne reportant pas son id dans p_live_payload (déjà
  -- garanti par buildLiveSnapshot(), qui renvoie toujours
  -- gallery.remove_ids: []).
  begin
    update public.school_page_drafts
    set
      payload = p_live_payload,
      is_dirty = false
    where id = v_draft.id;

    -- Portée strictement établissement_id + status — jamais un id fourni
    -- par le client, jamais une suppression "propriétaire entier" (CMS-F.7 §9).
    delete from public.school_images
      where establishment_id = p_establishment_id
        and status = 'draft_pending_add';

  exception when others then
    raise log 'discard_school_page_draft failed for establishment %: %', p_establishment_id, sqlerrm;
    return jsonb_build_object(
      'ok', false,
      'error_code', 'DISCARD_FAILED',
      'error', 'L''abandon des modifications a échoué. Aucune modification n''a été appliquée.'
    );
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
