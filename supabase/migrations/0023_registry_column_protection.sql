-- ============================================================================
-- 0023_registry_column_protection.sql
--
-- PRÉPARÉE MAIS NON EXÉCUTÉE.
-- Sprint REGISTRY-NATIONAL-D §28/§29 (audit sécurité claim/RLS avant handoff
-- CMS-A). Ne pas exécuter dans Supabase SQL Editor sans validation explicite
-- d'Eddy et de l'architecte.
--
-- CONTEXTE : l'audit RLS de ce sprint a confirmé que la policy "Owners can
-- update own establishments" (supabase/schema.sql:143) est purement
-- row-level (using (auth.uid() = owner_id), sans WITH CHECK dédié — Postgres
-- réutilise alors l'expression USING comme WITH CHECK, ce qui empêche un
-- propriétaire de changer owner_id vers un autre utilisateur, mais ne
-- restreint AUCUNE autre colonne). Le trigger
-- protect_establishment_privileged_columns (0014_rc1_security_fixes.sql,
-- lui-même préparé mais non confirmé exécuté en direct) protège
-- is_verified / is_featured / subscription_plan / forfait /
-- verification_status — mais 0014 a été écrit AVANT que 0018 ajoute les
-- colonnes de provenance registre (official_id, source_ministry,
-- source_reference, source_url, source_updated_at, registry_import_batch).
-- Ces six colonnes restent donc modifiables par un propriétaire authentifié
-- via un appel REST direct à Supabase (contournant entièrement
-- src/app/dashboard/ecole/parametres/page.tsx, dont le formulaire ne limite
-- que l'UI, jamais l'API) — voir
-- reports/registry/registry-national-d-claim-security.json.
--
-- PORTÉE : ce fichier ne modifie NI ne supprime aucune policy ni colonne
-- existante. Il ajoute un unique trigger additif, sur le même modèle exact
-- que 0014, qui bloque uniquement le cas "le propriétaire modifie sa propre
-- ligne ET touche une colonne de provenance registre". Les écritures via le
-- client admin (service role, utilisé par toutes les routes /api/admin/* et
-- par les scripts scripts/school-registry/*) ne sont jamais bloquées, car
-- auth.uid() y est toujours NULL — identique au raisonnement de 0014.
--
-- DÉPENDANCE : doit être exécutée après 0018_registry_identity_fields.sql
-- (référence les colonnes qu'elle ajoute) et, idéalement, en même temps que
-- la confirmation/exécution de 0014 si celle-ci n'est pas déjà en direct —
-- les deux triggers sont indépendants et peuvent aussi être exécutés
-- séparément sans conflit (noms de fonction/trigger distincts).
-- ============================================================================

create or replace function public.protect_establishment_registry_columns()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.uid() = old.owner_id
     and (
       new.official_id is distinct from old.official_id
       or new.source_ministry is distinct from old.source_ministry
       or new.source_reference is distinct from old.source_reference
       or new.source_url is distinct from old.source_url
       or new.source_updated_at is distinct from old.source_updated_at
       or new.registry_import_batch is distinct from old.registry_import_batch
     ) then
    raise exception 'Ce champ de provenance registre est gere par l equipe Ecoles237.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists establishments_protect_registry_columns on public.establishments;
create trigger establishments_protect_registry_columns
  before update on public.establishments
  for each row execute procedure public.protect_establishment_registry_columns();

-- ============================================================================
-- FIN — aucune colonne supprimee, aucune donnee modifiee, aucune policy
-- retiree. Un trigger additif qui ne change le comportement que pour le cas
-- d'abus identifie (propriétaire modifiant une colonne de provenance
-- registre sur sa propre fiche).
-- ============================================================================
