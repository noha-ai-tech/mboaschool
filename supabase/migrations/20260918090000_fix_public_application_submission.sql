-- HOTFIX-APPLICATIONS-01 — soumission publique de préinscription, sans
-- lecture générale anonyme sur public.applications.
--
-- CONTEXTE (audité, pas supposé) : le formulaire public réel
-- (src/app/preinscription/page.tsx) ne fait aucun login — il s'exécute
-- sous le rôle `anon` — et enchaîne aujourd'hui `insert(...).select("id,
-- tracking_code")`. La seule policy INSERT existante
-- ("Anyone authenticated can create applications", schema.sql) exige
-- `auth.uid() is not null`, ce qu'une session anonyme n'a jamais. Le
-- grant historique `grant select, insert on table public.applications to
-- anon` (auth-setup.sql) a un statut de déploiement production incertain
-- (auth-setup.sql ne suit pas la convention de nommage horodatée que la
-- CLI Supabase reconnaît — confirmé en pratique : ce fichier est
-- silencieusement ignoré par `supabase start`/`db reset` sur une instance
-- fraîche) ; qu'il soit vivant ou non en production, il serait de toute
-- façon insuffisant seul : `INSERT ... RETURNING` (ce que fait
-- `.select()` après `.insert()`) exige AUSSI un GRANT SELECT et une
-- policy SELECT autorisant la lecture de la ligne tout juste insérée —
-- vérifié empiriquement sur une instance Postgres jetable pendant
-- l'audit de cette mission.
--
-- CHOIX D'ARCHITECTURE : Option B retenue (RPC SECURITY DEFINER dédiée),
-- pas Option A (grants + policy SELECT restreinte). Une policy SELECT
-- anon, même restreinte à "la ligne que je viens de créer", n'a aucun
-- moyen fiable de scoper une session anonyme sans identité stable — le
-- moindre défaut de cette policy transformerait applications (qui peut
-- contenir des données privées sur un mineur, cf. commentaire de
-- 0007_production_security_reconciliation.sql sur la colonne `notes`) en
-- table lisible par un rôle anonyme. La RPC ne retourne que id et
-- tracking_code, jamais un accès SELECT à la table elle-même.
--
-- DÉFAUTS SUPPLÉMENTAIRES FERMÉS PAR CONSTRUCTION (trouvés pendant
-- l'audit, indépendants du problème RLS initial) :
--   - `student_name` (colonne d'origine, `not null`, schema.sql) n'est
--     plus jamais renseignée par le formulaire actuel, qui n'utilise que
--     student_first_name/student_last_name/full_student_name depuis
--     0007 — un insert direct échouerait sur cette contrainte NOT NULL
--     avant même d'atteindre RLS. La RPC la dérive elle-même, exactement
--     comme get_admission_by_tracking() le fait déjà pour l'affichage
--     (0012_admissions_v1.sql) — aucune nouvelle convention inventée.
--   - `notes` (interne, jamais exposée en lecture publique) et
--     `tracking_code` (sinon écrasable par le client — le trigger
--     existant ne le régénère QUE s'il est déjà nul) ne sont tout
--     simplement jamais des paramètres acceptés par la RPC : elles restent
--     à leur valeur par défaut / sont laissées au trigger existant
--     applications_set_tracking_code (0012), jamais dupliqué ici.
--   - `parent_id` n'est jamais un paramètre libre : toujours auth.uid()
--     (null pour un vrai visiteur anonyme, l'id réel si un parent
--     connecté utilise le même formulaire).
--   - `admission_status`/`status` : déjà forcés à l'état initial par le
--     trigger existant applications_enforce_initial_status (0012),
--     inchangé, non dupliqué — la RPC ne les accepte pas non plus en
--     paramètre par cohérence.
--
-- Le rate-limiting par téléphone (trigger applications_rate_limit,
-- 0007_production_security_reconciliation.sql, message d'erreur exact
-- "Trop de préinscriptions..." déjà attendu par le frontend) s'applique
-- automatiquement puisque c'est un trigger BEFORE INSERT sur la table —
-- aucune logique anti-abus dupliquée ici.
--
-- STATUT DE DÉPLOIEMENT DE 0007/0012 : leurs propres en-têtes indiquent
-- "PRÉPARÉE MAIS NON EXÉCUTÉE", contrairement à
-- 20260825054125_pro_05_2_admission_tracking_hardening.sql dont l'en-tête
-- a été corrigé après vérification directe en lecture seule sur la
-- production. Aucune vérification équivalente n'a été faite ici pour
-- 0007/0012 (hors périmètre de cette mission, aucune inspection
-- production autorisée) — ce point est documenté comme risque explicite
-- dans le rapport final, pas résolu silencieusement.

-- ============================================================================
-- 1. RETRAIT DES PRIVILÈGES DIRECTS ANON SUR LA TABLE — moindre privilège,
--    idempotent, sans effet sur `authenticated` (dont les policies RLS
--    scoping existantes, utilisées par le tableau de bord propriétaire,
--    restent inchangées).
-- ============================================================================
revoke all on table public.applications from anon;
revoke all on table public.applications from public;

-- ============================================================================
-- 2. RPC PUBLIQUE DE SOUMISSION — SECURITY DEFINER, jamais de SQL
--    dynamique, entrées strictement typées et nommées (jamais un JSON
--    arbitraire inséré tel quel), retour minimal.
-- ============================================================================
create or replace function public.submit_public_application(
  p_establishment_id uuid,
  p_student_first_name text,
  p_student_last_name text,
  p_parent_name text,
  p_parent_phone text,
  p_student_birth_date date default null,
  p_student_age integer default null,
  p_desired_level text default null,
  p_previous_school text default null,
  p_parent_email text default null,
  p_message text default null,
  p_annee_scolaire_id uuid default null
)
returns table (id uuid, tracking_code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_establishment_exists boolean;
  v_full_student_name text;
  v_application_id uuid;
  v_tracking_code text;
begin
  if p_establishment_id is null then
    raise exception 'establishment_id requis' using errcode = 'P0001';
  end if;

  -- `establishments.id` must be explicitly qualified here: this function's
  -- own RETURNS TABLE (id uuid, ...) clause puts a plpgsql variable named
  -- `id` in scope for the whole function body, so a bare `id` anywhere
  -- inside — even in an unrelated table's WHERE clause — is genuinely
  -- ambiguous to Postgres, not just a style preference.
  select exists(select 1 from public.establishments where establishments.id = p_establishment_id)
    into v_establishment_exists;
  if not v_establishment_exists then
    raise exception 'Établissement introuvable' using errcode = 'P0001';
  end if;

  if coalesce(trim(p_student_first_name), '') = '' or coalesce(trim(p_student_last_name), '') = '' then
    raise exception 'Nom et prénom de l''élève requis' using errcode = 'P0001';
  end if;
  if coalesce(trim(p_parent_name), '') = '' or coalesce(trim(p_parent_phone), '') = '' then
    raise exception 'Nom et téléphone du responsable requis' using errcode = 'P0001';
  end if;

  -- Même dérivation que get_admission_by_tracking() (0012) — aucune
  -- nouvelle convention de nom affiché inventée ici.
  v_full_student_name := trim(p_student_first_name || ' ' || p_student_last_name);

  -- parent_id, admission_status/status, tracking_code, notes : jamais des
  -- paramètres de cette fonction — voir l'en-tête de migration. auth.uid()
  -- est null pour un vrai visiteur anonyme ; s'il est non-null (un parent
  -- déjà connecté utilisant le même formulaire), l'association est
  -- correcte pour la policy "Parents can read own applications".
  insert into public.applications (
    parent_id, establishment_id,
    student_name, student_first_name, student_last_name, full_student_name,
    student_birth_date, student_age, desired_level, previous_school,
    parent_name, parent_phone, parent_email, message, annee_scolaire_id
  ) values (
    auth.uid(), p_establishment_id,
    v_full_student_name, p_student_first_name, p_student_last_name, v_full_student_name,
    p_student_birth_date, p_student_age, p_desired_level, p_previous_school,
    p_parent_name, p_parent_phone, p_parent_email, p_message, p_annee_scolaire_id
  )
  returning applications.id, applications.tracking_code into v_application_id, v_tracking_code;

  return query select v_application_id, v_tracking_code;
end;
$$;

-- Aucune lecture générale : anon et authenticated peuvent seulement
-- EXÉCUTER cette fonction précise, jamais SELECT/UPDATE/DELETE la table.
revoke all on function public.submit_public_application(
  uuid, text, text, text, text, date, integer, text, text, text, text, uuid
) from public, service_role;
grant execute on function public.submit_public_application(
  uuid, text, text, text, text, date, integer, text, text, text, text, uuid
) to anon, authenticated;
