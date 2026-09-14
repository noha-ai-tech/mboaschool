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
-- HOTFIX-APPLICATIONS-01.1 — CORRECTION APRÈS GATE INDÉPENDANT (deux P1
-- trouvés par vérification production en lecture seule, projet lié
-- umcwwynrftidytxgqkwi, jamais mergée/appliquée avant cette correction) :
--
--   P1 #1 — `student_name` n'existe PAS sur public.applications en
--   production (confirmé par `supabase db dump --linked -s public`,
--   schéma seul, aucune ligne). schema.sql (qui documente `student_name
--   text not null`) est un instantané historique du commit initial,
--   jamais réexécuté depuis, et ne reflète pas la réalité de production
--   — les colonnes réellement utilisées par tout le code applicatif
--   (dashboard école, suivi-admission) sont student_first_name,
--   student_last_name, full_student_name (ajoutées par 0007). La
--   fonction n'insère donc plus jamais dans student_name ; aucune
--   migration n'est ajoutée pour recréer cette colonne — elle n'a aucun
--   lecteur nulle part dans le code.
--
--   P1 #2 — la policy `applications_public_insert` réellement présente
--   en production (anon + authenticated, WITH CHECK (true), aucune
--   restriction de colonne) combinée au grant direct `INSERT` sur `anon`
--   permet AUJOURD'HUI à un client anonyme d'insérer une ligne
--   arbitraire par appel REST direct, y compris un `parent_id` usurpé ou
--   un `tracking_code` choisi (le trigger applications_set_tracking_code
--   ne le régénère que s'il est nul). Cette policy et son grant n'ont
--   plus aucun rôle utile une fois le seul chemin de création public
--   déplacé vers submit_public_application(...) — voir section 2
--   ci-dessous, qui les retire plutôt que de les laisser inertes.
--
-- DÉFAUTS SUPPLÉMENTAIRES FERMÉS PAR CONSTRUCTION (trouvés pendant
-- l'audit initial, indépendants du problème RLS) :
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
-- authenticated conserve, sans modification par cette migration, ses
-- grants SELECT/UPDATE table-level (nécessaires au tableau de bord
-- propriétaire — src/app/dashboard/ecole/admissions/page.tsx fait des
-- UPDATE directs sur admission_status/notes/parent_message) et ses
-- policies RLS de lecture/mise à jour scoping par établissement,
-- inchangées. Son grant direct INSERT devient inutilisé par tout le code
-- applicatif après cette migration (plus aucun `.from("applications").
-- insert(...)` nulle part dans src/, confirmé par audit), mais n'est pas
-- révoqué ici pour ne pas élargir le périmètre de ce hotfix au-delà des
-- deux P1 — documenté comme piste de durcissement future, pas appliqué
-- silencieusement. Le retrait de la policy applications_public_insert
-- (section 2) rend de toute façon tout INSERT direct impossible pour
-- authenticated comme pour anon : sans aucune policy INSERT permissive,
-- RLS refuse l'écriture pour tout rôle qui n'est pas propriétaire de la
-- table, et seule submit_public_application(...) (SECURITY DEFINER,
-- exécutée en tant que postgres, propriétaire de la table, donc exemptée
-- de RLS) peut encore créer une ligne.

-- ============================================================================
-- 1. RETRAIT DES PRIVILÈGES DIRECTS ANON SUR LA TABLE — moindre privilège,
--    idempotent, sans effet sur `authenticated` (dont les policies RLS
--    scoping existantes, utilisées par le tableau de bord propriétaire,
--    restent inchangées).
-- ============================================================================
revoke all on table public.applications from anon;
revoke all on table public.applications from public;

-- ============================================================================
-- 1bis. RETRAIT DE LA POLICY PUBLIQUE PERMISSIVE — plus aucun rôle utile
--    une fois le seul chemin de création public déplacé vers la RPC
--    ci-dessous ; la laisser active serait une policy WITH CHECK (true)
--    oubliée, un vrai risque même une fois le grant anon révoqué (elle
--    s'appliquerait encore à `authenticated`, sans plus-value puisque
--    tout code applicatif passe désormais par la RPC).
-- ============================================================================
drop policy if exists "applications_public_insert" on public.applications;
drop policy if exists "Anyone authenticated can create applications" on public.applications;

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
  -- nouvelle convention de nom affiché inventée ici. `student_name`
  -- (colonne d'origine de schema.sql) n'existe pas sur la production
  -- réelle — voir l'en-tête de migration — donc jamais insérée ici ;
  -- seule full_student_name (0007, réellement présente et lue par tout
  -- le code applicatif) porte le nom complet dérivé.
  v_full_student_name := trim(p_student_first_name || ' ' || p_student_last_name);

  -- parent_id, admission_status/status, tracking_code, notes : jamais des
  -- paramètres de cette fonction — voir l'en-tête de migration. auth.uid()
  -- est null pour un vrai visiteur anonyme ; s'il est non-null (un parent
  -- déjà connecté utilisant le même formulaire), l'association est
  -- correcte pour la policy "Parents can read own applications".
  insert into public.applications (
    parent_id, establishment_id,
    student_first_name, student_last_name, full_student_name,
    student_birth_date, student_age, desired_level, previous_school,
    parent_name, parent_phone, parent_email, message, annee_scolaire_id
  ) values (
    auth.uid(), p_establishment_id,
    p_student_first_name, p_student_last_name, v_full_student_name,
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
