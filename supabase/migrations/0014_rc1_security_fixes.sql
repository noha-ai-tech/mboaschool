-- ============================================================================
-- 0014_rc1_security_fixes.sql
--
-- PREPAREE MAIS NON EXECUTEE.
-- Mission 09 - Release Candidate RC1. Ne pas executer dans Supabase SQL
-- Editor sans validation explicite d'Eddy et de l'architecte.
--
-- Corrige deux failles d'escalade de privileges trouvees lors de l'audit RLS
-- global (Phase 3) dans le schema DEJA EN PRODUCTION (schema.sql/auth-setup.sql,
-- pas une regression introduite par une mission recente) :
--
--   1. "Users can update own profile" (schema.sql) autorise un utilisateur a
--      modifier N'IMPORTE QUELLE colonne de son propre profil, y compris
--      `role` et `admin_role` - un utilisateur authentifie pouvait donc se
--      promouvoir platform_admin/super_admin par un simple PATCH.
--
--   2. "Owners can update own establishments" (schema.sql) autorise de meme
--      un proprietaire d'etablissement a modifier `is_verified`,
--      `is_featured`, `subscription_plan`, `forfait` et (une fois la
--      migration 0008 executee) `verification_status` sur sa propre fiche -
--      contournant entierement le badge de verification, le forfait Pro et
--      le workflow de revendication.
--
-- DEPENDANCE : ce fichier doit etre execute APRES 0008_school_onboarding.sql
-- (reference la colonne verification_status). Il ne supprime aucune policy
-- existante ni aucune colonne - il ajoute un trigger qui bloque uniquement
-- le cas precis "l'utilisateur modifie sa propre ligne ET touche une colonne
-- privilegiee". Les ecritures faites via le client admin (service role,
-- utilise par toutes les routes /api/admin/*) ne sont jamais bloquees, car
-- auth.uid() y est toujours NULL.
-- ============================================================================


-- ============================================================================
-- 1. profiles.role / profiles.admin_role - anti auto-escalade
-- ============================================================================

create or replace function public.protect_profile_privileged_columns()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.uid() = old.id
     and (new.role is distinct from old.role or new.admin_role is distinct from old.admin_role) then
    raise exception 'Modification de role reservee a un administrateur.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_privileged_columns on public.profiles;
create trigger profiles_protect_privileged_columns
  before update on public.profiles
  for each row execute procedure public.protect_profile_privileged_columns();


-- ============================================================================
-- 2. establishments - anti auto-verification / auto-upgrade de plan
-- ============================================================================

create or replace function public.protect_establishment_privileged_columns()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.uid() = old.owner_id
     and (
       new.is_verified is distinct from old.is_verified
       or new.is_featured is distinct from old.is_featured
       or new.subscription_plan is distinct from old.subscription_plan
       or new.forfait is distinct from old.forfait
       or new.verification_status is distinct from old.verification_status
     ) then
    raise exception 'Ce champ est gere par l equipe Ecoles237.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists establishments_protect_privileged_columns on public.establishments;
create trigger establishments_protect_privileged_columns
  before update on public.establishments
  for each row execute procedure public.protect_establishment_privileged_columns();


-- ============================================================================
-- FIN - aucune colonne supprimee, aucune donnee modifiee, aucune policy
-- retiree. Deux triggers additifs qui ne changent le comportement que pour
-- le cas d'abus identifie (auto-modification d'une colonne privilegiee).
-- ============================================================================
