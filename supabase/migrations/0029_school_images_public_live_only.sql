-- ============================================================================
-- 0029_school_images_public_live_only.sql
--
-- PRÉPARÉE, NON EXÉCUTÉE. Attend l'exécution directe par Eddy + l'architecte
-- (même canal que les migrations 0027/0028 — cet environnement ne dispose
-- d'aucune capacité d'exécution DDL).
-- SPRINT CMS-F.6 — GALLERY DRAFT LIFECYCLE.
--
-- CONTEXTE. school_images.status existe déjà (migration 0026, exécutée),
-- avec deux valeurs possibles : 'live' (défaut) et 'draft_pending_add'.
-- Jusqu'ici AUCUNE policy ni requête applicative ne filtrait par cette
-- colonne pour la lecture publique — CMS-F.6 introduit le premier usage
-- réel de 'draft_pending_add' (upload en brouillon), ce qui rend ce trou
-- de sécurité réel pour la première fois (avant F.6, aucune ligne
-- 'draft_pending_add' n'était jamais créée par l'application).
--
-- AUDIT LIVE (CMS-F.6, avant d'écrire cette migration — jamais une
-- confiance aveugle dans le texte historique) :
--   - policy actuelle, confirmée par lecture ET par sonde live :
--     "Public can read school images" on public.school_images
--     for select using (true)                    -- (auth-setup.sql:150)
--   - sonde live : un compte anonyme peut aujourd'hui lire une ligne
--     school_images avec status='draft_pending_add' sans aucune
--     restriction — confirmé par un SELECT anonyme réel pendant l'audit.
--   - policy propriétaire, INCHANGÉE par cette migration (déjà correcte) :
--     "Owners can manage school images" on public.school_images
--     for all using (exists(... e.owner_id = auth.uid()))
--     -- aucun with check séparé, aucun filtre sur status : le
--     -- propriétaire garde un accès complet à SES DEUX statuts
--     -- (live ET draft_pending_add), exactement l'exigence CMS-F.6 §3.
--   - grants, INCHANGÉS : select à anon+authenticated, insert/update/delete
--     à authenticated seul (auth-setup.sql:214-216).
--
-- DÉCISION SÉCURITÉ COMPLÉMENTAIRE (documentée, PAS corrigée ici — hors
-- scope DB) : le bucket Storage `school-images` est PUBLIC
-- (confirmé via l'API Storage : {"public": true}). Cette migration ferme
-- la fuite au niveau de la table (plus aucune ligne draft_pending_add
-- listable), mais un objet Storage reste techniquement récupérable par
-- quiconque connaît son URL exacte, RLS ou non — voir le rapport CMS-F.6
-- section STORAGE PRIVACY pour la décision produit V1 explicite
-- ("non listé mais techniquement accessible si l'URL exacte est connue").
-- Changer le bucket en privé casserait TOUTES les images publiques
-- existantes sur toute la plateforme — hors scope de cette migration,
-- signalé pour décision architecte séparée si nécessaire.
--
-- Portée : remplace UNIQUEMENT la policy SELECT publique par son
-- équivalent filtré sur status='live'. Aucune donnée modifiée, aucune
-- ligne supprimée, aucun changement de grant, aucun changement à la
-- policy propriétaire ni aux policies Storage.
-- ============================================================================

drop policy if exists "Public can read school images" on public.school_images;

create policy "Public can read school images" on public.school_images
  for select
  using (status = 'live');

-- ============================================================================
-- FIN — 1 policy remplacée (même nom, même rôle PUBLIC implicite via
-- l'absence de clause `to`, cohérent avec la déclaration d'origine), sans
-- aucun autre changement. La policy propriétaire "Owners can manage school
-- images" continue de donner au propriétaire un accès total (live +
-- draft_pending_add) à ses propres établissements, inchangée.
-- ============================================================================
