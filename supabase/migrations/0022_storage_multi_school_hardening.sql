-- ============================================================================
-- 0022_storage_multi_school_hardening.sql
--
-- PRÉPARÉE MAIS NON EXÉCUTÉE.
-- CMS-B.2.1. Ne pas exécuter dans Supabase SQL Editor sans validation
-- explicite d'Eddy et de l'architecte.
--
-- BUG RÉEL identifié dans 0007_production_security_reconciliation.sql :
-- school_images_owner_write / school_documents_owner_write comparent le
-- premier segment du chemin Storage à une SOUS-REQUÊTE SCALAIRE :
--
--   (select id::text from public.establishments where owner_id = auth.uid())
--
-- `owner_id` n'est PAS unique sur establishments — rien n'empêche un même
-- utilisateur de posséder plusieurs écoles. Dès qu'un owner possède 2+
-- établissements, cette sous-requête retourne plusieurs lignes : Postgres
-- lève "more than one row returned by a subquery used as an expression",
-- et TOUT upload/delete échoue pour cet owner, y compris sur des fichiers
-- légitimes. Ce n'est pas une préoccupation théorique : le modèle
-- applicatif (forfait_multi_etab, 0005) prévoit explicitement un owner
-- multi-établissements.
--
-- CORRECTIF : remplacer la sous-requête scalaire par EXISTS, qui gère
-- nativement 1 owner → N établissements, SANS ouvrir de permission
-- nouvelle — un owner ne peut toujours écrire que dans le dossier de SES
-- propres établissements.
--
-- DÉPENDANCE : ce fichier suppose que 0007 a déjà créé ces deux policies.
-- S'il s'avère que 0007 n'a jamais été exécutée en production, appliquer
-- directement la version EXISTS ci-dessous au moment d'exécuter 0007 plutôt
-- que d'exécuter les deux fichiers séparément — à confirmer par Eddy avant
-- toute exécution.
-- ============================================================================

drop policy if exists "school_images_owner_write" on storage.objects;
create policy "school_images_owner_write" on storage.objects
  for all
  using (
    bucket_id = 'school-images'
    and exists (
      select 1 from public.establishments e
      where e.owner_id = auth.uid()
        and e.id::text = (storage.foldername(name))[1]
    )
  )
  with check (
    bucket_id = 'school-images'
    and exists (
      select 1 from public.establishments e
      where e.owner_id = auth.uid()
        and e.id::text = (storage.foldername(name))[1]
    )
  );

drop policy if exists "school_documents_owner_write" on storage.objects;
create policy "school_documents_owner_write" on storage.objects
  for all
  using (
    bucket_id = 'school-documents'
    and exists (
      select 1 from public.establishments e
      where e.owner_id = auth.uid()
        and e.id::text = (storage.foldername(name))[1]
    )
  )
  with check (
    bucket_id = 'school-documents'
    and exists (
      select 1 from public.establishments e
      where e.owner_id = auth.uid()
        and e.id::text = (storage.foldername(name))[1]
    )
  );

-- ============================================================================
-- FIN — remplace uniquement ces 2 policies existantes (mêmes noms), aucune
-- permission nouvelle, aucune donnée modifiée.
-- ============================================================================
