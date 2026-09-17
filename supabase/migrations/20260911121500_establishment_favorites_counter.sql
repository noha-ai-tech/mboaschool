-- ============================================================================
-- 20260911121500_establishment_favorites_counter.sql
--
-- CORRECTION 4 — bouton "Ajouter aux favoris" sur la page publique d'une
-- école. Les parents n'ont pas de compte (pas d'auth) : l'état "est-ce que
-- CE parent a mis cette école en favori" vit uniquement en localStorage côté
-- client (voir src/lib/useFavorites.ts). Ce que la base doit fournir, c'est
-- uniquement le COMPTEUR agrégé, pour que le directeur voie combien de fois
-- son école a été mise en favori, et que l'admin voie ce chiffre pour
-- toutes les écoles.
--
-- Pas de table d'audit par favori : sans identité de parent, une ligne par
-- favori n'apporterait aucune donnée exploitable de plus qu'un compteur, et
-- ajouterait une table sans lecteur réel. Un entier sur establishments
-- suffit exactement à ce qui est demandé.
--
-- L'incrément/décrément passe par une fonction SECURITY DEFINER dédiée
-- (jamais un GRANT UPDATE direct sur establishments à anon, qui autoriserait
-- n'importe quelle autre colonne à être modifiée par un visiteur anonyme) —
-- même philosophie que get_admission_by_tracking / search_establishments
-- (0012_admissions_v1.sql, 0020_search_v2_unaccent_rpc.sql). Le delta est
-- restreint à -1/+1 et le compteur ne descend jamais sous 0.
--
-- PRÉPARÉE MAIS NON EXÉCUTÉE — à appliquer manuellement (Eddy/admin DB).
-- ============================================================================

alter table public.establishments
  add column if not exists favorite_count integer not null default 0;

create or replace function public.adjust_favorite_count(
  p_establishment_id uuid,
  p_delta integer
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new_count integer;
begin
  if p_delta not in (-1, 1) then
    raise exception using message = 'INVALID_FAVORITE_DELTA';
  end if;

  update public.establishments
  set favorite_count = greatest(0, favorite_count + p_delta)
  where id = p_establishment_id
  returning favorite_count into v_new_count;

  if v_new_count is null then
    raise exception using message = 'ESTABLISHMENT_NOT_FOUND';
  end if;

  return v_new_count;
end;
$$;

grant execute on function public.adjust_favorite_count(uuid, integer) to anon, authenticated;
