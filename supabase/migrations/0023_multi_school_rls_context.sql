-- ============================================================================
-- 0023_multi_school_rls_context.sql
--
-- PRÉPARÉE, NON EXÉCUTÉE. Attend la revue d'Eddy + l'architecte.
-- SPRINT MULTI-SCHOOL RECONCILIATION — CMS + PRO RLS COMPATIBILITY.
--
-- NE PAS ré-exécuter 0021/0022 : déjà appliquées en production par
-- l'architecte (school_page_sections + storage school-images/school-documents,
-- policies EXISTS multi-écoles). Ce fichier ne touche ni ne recrée ces deux
-- migrations.
--
-- CONSTAT (voir docs/04_SUPABASE_PROD_READINESS/03_ISOLATION_ETABLISSEMENTS.md,
-- section "Point de vigilance structurel") :
--
--   create or replace function current_establishment_id() ... as $$
--     select id from establishments where owner_id = auth.uid();
--   $$;
--
-- Sous-requête scalaire sans `limit 1`. Tant qu'un `owner_id` ne possédait
-- qu'une seule ligne `establishments`, aucun problème. PRO-00B/PRO-03
-- rendent maintenant le multi-établissement RÉEL pour un même owner : dès
-- qu'un propriétaire a 2+ écoles, CETTE fonction lève "more than one row
-- returned by a subquery used as an expression" partout où elle est
-- utilisée — un échec sûr (pas une fuite), mais qui casse whole tables pour
-- ce propriétaire (déjà vécu une fois côté Storage, corrigé par 0022 pour
-- school-images/school-documents uniquement).
--
-- DEUX bugs restants confirmés par audit applicatif (hors DB) :
--   1. src/lib/cms/authorizeSchoolMutation.ts — corrigé dans ce sprint
--      applicatif, réutilise getActiveEstablishment() (PRO-00B), AUCUN
--      changement DB requis pour ce point précis.
--   2. current_establishment_id() — objet de cette migration.
--
-- CLASSIFICATION (mission §5, "ne jamais mélanger les deux concepts") :
-- Chacune des policies ci-dessous scope des LIGNES par établissement pour un
-- propriétaire/directeur. Dans TOUS les cas identifiés, le code applicatif
-- qui les consomme (routes /pro/**, kiosque, paie, EDT — audité PRO-00B/
-- PRO-03) filtre déjà explicitement par l'établissement ACTIF avant
-- d'interroger Postgres (`.eq("etablissement_id", etablissementId)` avec
-- etablissementId résolu et revalidé côté serveur par getActiveEstablishment).
-- Le rôle réel de la RLS ici n'est donc PAS de choisir "quelle école" (ça,
-- l'application le fait déjà) mais de garantir qu'un `etablissement_id`
-- fourni par une requête authentifiée appartient RÉELLEMENT à l'utilisateur
-- — exactement le scénario A (ACCESS TO ANY OWNED SCHOOL) de la mission,
-- pas le scénario B. C'est pourquoi le remplacement correct est un EXISTS
-- multi-écoles (comme 0022), PAS un `limit 1` arbitraire (qui résoudrait
-- silencieusement à une école au hasard — faux architecturalement, mission §4).
--
-- EXCLUSION EXPLICITE (mission §9, "ne pas toucher au métier") :
--   calculer_heures_enseignant() (0002, redéfinie 0005) utilise aussi
--   current_establishment_id() en interne, y compris comme vérification
--   d'appartenance même quand p_etablissement_id est fourni explicitement
--   (ligne "p_etablissement_id = current_establishment_id()") — donc même
--   les 4 appels applicatifs qui passent déjà p_etablissement_id explicite
--   ne sont PAS à l'abri du bug pour un vrai propriétaire multi-écoles.
--   C'est un problème réel, mais c'est de la logique métier paie/pointage :
--   volontairement NON traité ici, à corriger dans un sprint dédié paie/
--   pointage avec test matrix propre (mission §9/§13).
--
-- current_establishment_id() elle-même N'EST PAS supprimée ni modifiée par
-- cette migration : elle reste nécessaire à calculer_heures_enseignant().
-- Une dépréciation complète (mission implicite, cf. PRO-03_2_DEPLOYMENT_
-- RUNBOOK "Final gate") n'est possible qu'une fois CE consommateur métier
-- également migré — hors périmètre ici.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Helper unique, réutilisé par toutes les policies ci-dessous — même idiome
-- que current_establishment_id() (security definer, stable), mais renvoie un
-- booléen "cet établissement m'appartient-il ?" au lieu d'un id scalaire
-- unique : gère nativement 1 owner → N établissements.
-- ----------------------------------------------------------------------------
create or replace function public.is_own_establishment(p_etablissement_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.establishments e
    where e.id = p_etablissement_id
      and e.owner_id = auth.uid()
  );
$$;

-- ============================================================================
-- 0001_timetable_schema.sql — matieres, enseignants, EDT
-- ============================================================================

drop policy if exists matieres_scope on matieres;
create policy matieres_scope on matieres
  for all using (public.is_own_establishment(etablissement_id));

drop policy if exists mvh_scope on matieres_volume_horaire;
create policy mvh_scope on matieres_volume_horaire
  for all using (
    matiere_id in (select id from matieres where public.is_own_establishment(etablissement_id))
  );

drop policy if exists em_scope on enseignant_matieres;
create policy em_scope on enseignant_matieres
  for all using (
    enseignant_id in (select id from enseignants where public.is_own_establishment(etablissement_id))
  );

drop policy if exists ed_scope on enseignant_disponibilites;
create policy ed_scope on enseignant_disponibilites
  for all using (
    enseignant_id in (select id from enseignants where public.is_own_establishment(etablissement_id))
  );

drop policy if exists contraintes_scope on contraintes_etablissement;
create policy contraintes_scope on contraintes_etablissement
  for all using (public.is_own_establishment(etablissement_id));

drop policy if exists creneaux_scope on creneaux_horaires;
create policy creneaux_scope on creneaux_horaires
  for all using (public.is_own_establishment(etablissement_id));

drop policy if exists edt_scope on emplois_du_temps;
create policy edt_scope on emplois_du_temps
  for all using (public.is_own_establishment(etablissement_id));

drop policy if exists enseignants_scope on enseignants;
create policy enseignants_scope on enseignants
  for all using (public.is_own_establishment(etablissement_id));

-- ============================================================================
-- 0002_presence.sql — pointages (table + policy directeur)
-- Note : la fonction calculer_heures_enseignant() de ce même fichier N'EST
-- PAS touchée ici (voir exclusion métier ci-dessus).
-- ============================================================================

drop policy if exists pointages_scope on pointages;
create policy pointages_scope on pointages
  for all using (public.is_own_establishment(etablissement_id));

-- Storage — même bug que school-images/school-documents (corrigé par 0022),
-- jamais corrigé ici pour pointages-photos.
drop policy if exists "pointages_owner_access" on storage.objects;
create policy "pointages_owner_access" on storage.objects
  for all
  using (
    bucket_id = 'pointages-photos'
    and exists (
      select 1 from public.establishments e
      where e.owner_id = auth.uid()
        and e.id::text = (storage.foldername(name))[1]
    )
  )
  with check (
    bucket_id = 'pointages-photos'
    and exists (
      select 1 from public.establishments e
      where e.owner_id = auth.uid()
        and e.id::text = (storage.foldername(name))[1]
    )
  );

-- ============================================================================
-- 0004_messagerie.sql
-- ============================================================================

drop policy if exists messages_directeur on messages;
create policy messages_directeur on messages
  for all
  using  (public.is_own_establishment(etablissement_id))
  with check (public.is_own_establishment(etablissement_id));

-- ============================================================================
-- 0009_pro_hr_foundation.sql — sections, staff_members, staff_contracts,
-- staff_documents (table + storage)
-- ============================================================================

drop policy if exists sections_scope on public.sections;
create policy sections_scope on public.sections
  for all using (public.is_own_establishment(etablissement_id));

drop policy if exists staff_members_scope on public.staff_members;
create policy staff_members_scope on public.staff_members
  for all using (public.is_own_establishment(etablissement_id));

drop policy if exists staff_contracts_director on public.staff_contracts;
create policy staff_contracts_director on public.staff_contracts
  for all using (
    staff_member_id in (
      select id from public.staff_members where public.is_own_establishment(etablissement_id)
    )
  );

drop policy if exists staff_documents_director on public.staff_documents;
create policy staff_documents_director on public.staff_documents
  for all using (
    staff_member_id in (
      select id from public.staff_members where public.is_own_establishment(etablissement_id)
    )
  );

-- Storage — staff-documents : même bug que school-images avant 0022, jamais
-- corrigé pour ce bucket.
drop policy if exists "staff_documents_director_access" on storage.objects;
create policy "staff_documents_director_access" on storage.objects
  for all
  using (
    bucket_id = 'staff-documents'
    and exists (
      select 1 from public.staff_members sm
      where sm.id::text = (storage.foldername(name))[1]
        and public.is_own_establishment(sm.etablissement_id)
    )
  )
  with check (
    bucket_id = 'staff-documents'
    and exists (
      select 1 from public.staff_members sm
      where sm.id::text = (storage.foldername(name))[1]
        and public.is_own_establishment(sm.etablissement_id)
    )
  );

-- ============================================================================
-- 0010_timetable_engine.sql — années scolaires, salles, remplacements
-- ============================================================================

drop policy if exists annees_scolaires_scope on public.annees_scolaires;
create policy annees_scolaires_scope on public.annees_scolaires
  for all using (public.is_own_establishment(etablissement_id));

drop policy if exists trimestres_scope on public.trimestres;
create policy trimestres_scope on public.trimestres
  for all using (
    annee_scolaire_id in (select id from public.annees_scolaires where public.is_own_establishment(etablissement_id))
  );

drop policy if exists salles_scope on public.salles;
create policy salles_scope on public.salles
  for all using (public.is_own_establishment(etablissement_id));

drop policy if exists salle_indispo_scope on public.salle_indisponibilites;
create policy salle_indispo_scope on public.salle_indisponibilites
  for all using (
    salle_id in (select id from public.salles where public.is_own_establishment(etablissement_id))
  );

drop policy if exists conges_scope on public.conges_vacances;
create policy conges_scope on public.conges_vacances
  for all using (public.is_own_establishment(etablissement_id));

drop policy if exists ens_indispo_directeur on public.enseignant_indisponibilites;
create policy ens_indispo_directeur on public.enseignant_indisponibilites
  for all using (
    enseignant_id in (select id from public.enseignants where public.is_own_establishment(etablissement_id))
  );

drop policy if exists remplacements_directeur on public.remplacements;
create policy remplacements_directeur on public.remplacements
  for all using (public.is_own_establishment(etablissement_id));

-- ============================================================================
-- 0011_payroll_engine.sql — paie (config, absences, primes, retenues,
-- bulletins). Logique de CALCUL non touchée — uniquement le scoping RLS des
-- lignes, conformément à la mission §9.
-- ============================================================================

drop policy if exists payroll_config_scope on public.payroll_config;
create policy payroll_config_scope on public.payroll_config
  for all using (public.is_own_establishment(etablissement_id));

drop policy if exists types_primes_scope on public.types_primes;
create policy types_primes_scope on public.types_primes
  for all using (public.is_own_establishment(etablissement_id));

drop policy if exists types_retenues_scope on public.types_retenues;
create policy types_retenues_scope on public.types_retenues
  for all using (public.is_own_establishment(etablissement_id));

drop policy if exists absences_directeur on public.absences;
create policy absences_directeur on public.absences
  for all using (
    staff_member_id in (select id from public.staff_members where public.is_own_establishment(etablissement_id))
  );

drop policy if exists primes_directeur on public.primes;
create policy primes_directeur on public.primes
  for all using (
    staff_member_id in (select id from public.staff_members where public.is_own_establishment(etablissement_id))
  );

drop policy if exists retenues_directeur on public.retenues;
create policy retenues_directeur on public.retenues
  for all using (
    staff_member_id in (select id from public.staff_members where public.is_own_establishment(etablissement_id))
  );

drop policy if exists bulletins_directeur on public.bulletins_paie;
create policy bulletins_directeur on public.bulletins_paie
  for all using (public.is_own_establishment(etablissement_id));

drop policy if exists bulletin_lignes_directeur on public.bulletin_paie_lignes;
create policy bulletin_lignes_directeur on public.bulletin_paie_lignes
  for all using (
    bulletin_id in (select id from public.bulletins_paie where public.is_own_establishment(etablissement_id))
  );

drop policy if exists bulletin_historique_directeur on public.bulletin_paie_historique;
create policy bulletin_historique_directeur on public.bulletin_paie_historique
  for all using (
    bulletin_id in (select id from public.bulletins_paie where public.is_own_establishment(etablissement_id))
  );

-- ============================================================================
-- 0015_school_setup_intelligence.sql
-- ============================================================================

drop policy if exists "Directeur gere ses imports" on public.school_setup_imports;
create policy "Directeur gere ses imports" on public.school_setup_imports
  for all using (public.is_own_establishment(etablissement_id))
  with check (public.is_own_establishment(etablissement_id));

drop policy if exists "Directeur gere ses fichiers d'import" on public.school_setup_files;
create policy "Directeur gere ses fichiers d'import" on public.school_setup_files
  for all using (public.is_own_establishment(etablissement_id))
  with check (public.is_own_establishment(etablissement_id));

drop policy if exists "Directeur gere ses brouillons d'import" on public.school_setup_drafts;
create policy "Directeur gere ses brouillons d'import" on public.school_setup_drafts
  for all using (public.is_own_establishment(etablissement_id))
  with check (public.is_own_establishment(etablissement_id));

drop policy if exists "Directeur gere les issues de ses imports" on public.school_setup_issues;
create policy "Directeur gere les issues de ses imports" on public.school_setup_issues
  for all using (public.is_own_establishment(etablissement_id))
  with check (public.is_own_establishment(etablissement_id));

drop policy if exists "Directeur lit le cout IA de son etablissement" on public.ai_usage;
create policy "Directeur lit le cout IA de son etablissement" on public.ai_usage
  for select using (public.is_own_establishment(etablissement_id));

drop policy if exists "Systeme peut enregistrer le cout IA" on public.ai_usage;
create policy "Systeme peut enregistrer le cout IA" on public.ai_usage
  for insert with check (public.is_own_establishment(etablissement_id));

-- ============================================================================
-- FIN — remplace uniquement les policies listées ci-dessus (mêmes noms,
-- mêmes tables), aucune permission nouvelle par rapport à l'intention
-- d'origine (toujours "propriétaire de CET établissement"), aucune donnée
-- modifiée. current_establishment_id() et calculer_heures_enseignant()
-- restent inchangées — hors périmètre de cette migration (voir exclusion
-- métier ci-dessus).
-- ============================================================================
