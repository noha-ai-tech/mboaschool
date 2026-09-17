-- ============================================================================
-- 20260911120000_fix_applications_anon_grants.sql
--
-- FIX — le formulaire de préinscription public échoue à l'envoi avec
-- "permission denied for table applications" (code Postgres 42501).
--
-- Diagnostic confirmé en direct contre la base de production (clé anon,
-- 2026-09-11) : la politique RLS "Public can create applications" (voir
-- auth-setup.sql) est bien présente et correcte, mais le rôle `anon` n'a
-- PAS le GRANT de table lui-même sur public.applications — les deux sont
-- nécessaires (RLS filtre les lignes, GRANT autorise la commande). Le même
-- test avec une colonne inexistante renvoie une erreur PostgREST distincte
-- (PGRST204, schema cache), ce qui exclut un problème de colonne/schéma :
-- seul le GRANT manque.
--
-- auth-setup.sql:203-204 documente déjà le grant attendu
--   (`grant select, insert on table public.applications to anon;`
--    `grant all on table public.applications to authenticated;`)
-- mais ce script ne semble jamais avoir été appliqué (ou a été perdu) sur
-- l'environnement de production actuel. Cette migration ré-applique
-- exactement ce même grant, sans toucher aux colonnes, contraintes ni
-- politiques RLS existantes.
--
-- PRÉPARÉE MAIS NON EXÉCUTÉE — à appliquer manuellement (Eddy/admin DB).
-- ============================================================================

grant select, insert on table public.applications to anon;
grant all on table public.applications to authenticated;
