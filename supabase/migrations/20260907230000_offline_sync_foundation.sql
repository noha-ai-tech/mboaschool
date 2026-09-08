-- ============================================================================
-- 20260907230000_offline_sync_foundation.sql
--
-- PRÉPARÉE MAIS NON EXÉCUTÉE.
-- OFFLINE-01 — registre d'idempotence pour le moteur de synchronisation
-- offline. Une mutation soumise deux fois (double clic, retry après coupure
-- réseau juste après un ack non reçu par le client) ne doit jamais créer
-- deux fois la même donnée : POST /api/sync/push vérifie ce registre avant
-- d'exécuter la mutation métier réelle, et enregistre le résultat après.
--
-- Ne modifie AUCUNE table existante. La mutation métier elle-même (ex:
-- insert dans `absences`) passe par le client Supabase normal, scopé par
-- session (jamais le service role) : RLS reste l'autorité, ce registre ne
-- fait qu'empêcher le doublon, jamais la vérification des droits.
-- ============================================================================


create table if not exists public.sync_mutations (
  mutation_id       uuid primary key,
  entity_type       text not null,
  operation         text not null check (operation in ('create', 'update', 'delete')),
  establishment_id  uuid not null references public.establishments(id) on delete cascade,
  actor_user_id     uuid not null references auth.users(id) on delete cascade,
  entity_id         uuid,
  status            text not null check (status in ('applied', 'rejected', 'conflict')),
  error             text,
  applied_at        timestamptz not null default now()
);

create index if not exists idx_sync_mutations_establishment on public.sync_mutations(establishment_id);
create index if not exists idx_sync_mutations_actor on public.sync_mutations(actor_user_id);

alter table public.sync_mutations enable row level security;

-- L'acteur peut lire ses propres mutations (utile pour un futur écran
-- "historique de synchronisation" côté utilisateur) ; jamais celles des
-- autres, sur un autre établissement ou non.
drop policy if exists "actor reads own sync mutations" on public.sync_mutations;
create policy "actor reads own sync mutations" on public.sync_mutations
  for select
  using (actor_user_id = auth.uid());

-- L'acteur ne peut créer un enregistrement du registre que pour lui-même.
-- Le contrôle réel d'autorisation (accès à l'établissement, capability)
-- est fait par la route API AVANT d'écrire ici et avant d'exécuter la
-- mutation métier — cette policy est un filet, pas le point de contrôle
-- principal.
drop policy if exists "actor inserts own sync mutations" on public.sync_mutations;
create policy "actor inserts own sync mutations" on public.sync_mutations
  for insert
  with check (actor_user_id = auth.uid());

drop policy if exists "platform_admin reads all sync mutations" on public.sync_mutations;
create policy "platform_admin reads all sync mutations" on public.sync_mutations
  for select
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'platform_admin')
  );

-- Aucune policy update/delete : le registre est un journal d'audit
-- append-only, jamais modifié après coup.


-- ============================================================================
-- APPLICATION ATOMIQUE DU PILOTE "absence" — fonction SECURITY DEFINER
-- ============================================================================
-- Pourquoi une fonction plutôt qu'un select-puis-insert applicatif : deux
-- requêtes concurrentes portant le MÊME mutation_id (vrai double-clic,
-- retry réseau qui recroise la première tentative encore en vol) ne
-- doivent jamais insérer deux fois dans `absences`. La contrainte
-- primary key sur sync_mutations.mutation_id, combinée au fait que les
-- deux inserts (absences + sync_mutations) se produisent dans LA MÊME
-- transaction PL/pgSQL, garantit que la transaction perdante échoue sur
-- la contrainte d'unicité et voit alors SON insert dans `absences`
-- automatiquement annulé (rollback) — jamais de doublon, même sous vraie
-- concurrence. Le bloc EXCEPTION rejoue proprement le résultat déjà
-- committé par le gagnant plutôt que de renvoyer une erreur Postgres brute.
--
-- Autorisation reproduite manuellement (SECURITY DEFINER contourne RLS) :
-- exactement la même condition que la policy absences_directeur ET la
-- garde forfait='pro' de requireEstablishmentAccess (voir
-- src/lib/school/establishmentAccess.ts) — jamais élargie par rapport à
-- ce qu'un insert direct en ligne aurait autorisé.
--
-- OFFLINE-01.1 (correctif P1) — un mutation_id est une clé d'idempotence,
-- PAS un jeton d'accès. Cette fonction étant SECURITY DEFINER, un simple
-- `select ... where mutation_id = p_mutation_id` contourne RLS de plein
-- droit : sans revalider acteur + établissement AVANT de renvoyer le
-- résultat d'une mutation déjà existante, connaître (deviner, intercepter,
-- réutiliser) le mutation_id d'un tiers suffirait à lire son résultat
-- (entity_id, statut, erreur) malgré RLS. Les DEUX chemins de replay —
-- ligne déjà existante ET rattrapage unique_violation après une vraie
-- course concurrente — appliquent donc EXACTEMENT la même vérification
-- avant de rien renvoyer. En cas de désaccord (acteur différent OU
-- établissement différent de celui déclaré par CET appel), la fonction
-- renvoie le message générique de refus — jamais un message distinct qui
-- confirmerait l'existence de la mutation d'un tiers (fuite d'information
-- évitée, Phase 2).
create or replace function public.sync_apply_absence_create(
  p_mutation_id uuid,
  p_establishment_id uuid,
  p_staff_member_id uuid,
  p_type text,
  p_date_debut date,
  p_date_fin date,
  p_motif text
)
returns table (result_status text, result_entity_id uuid, result_error text)
language plpgsql
security definer set search_path = public
as $$
declare
  v_existing public.sync_mutations;
  v_authorized boolean;
  v_new_absence_id uuid;
  v_caller uuid := auth.uid();
  v_generic_denial text := 'Accès refusé pour cet établissement ou ce membre du personnel';
begin
  if v_caller is null then
    raise exception 'Non authentifié';
  end if;

  select * into v_existing from public.sync_mutations where mutation_id = p_mutation_id for update;

  if v_existing.mutation_id is not null then
    if v_existing.actor_user_id != v_caller or v_existing.establishment_id != p_establishment_id then
      return query select 'rejected'::text, null::uuid, v_generic_denial;
      return;
    end if;
    return query select v_existing.status, v_existing.entity_id, v_existing.error;
    return;
  end if;

  select exists (
    select 1
    from public.staff_members sm
    join public.establishments e on e.id = sm.etablissement_id
    where sm.id = p_staff_member_id
      and sm.etablissement_id = p_establishment_id
      and e.owner_id = v_caller
      and e.forfait = 'pro'
  ) into v_authorized;

  if not v_authorized then
    insert into public.sync_mutations (mutation_id, entity_type, operation, establishment_id, actor_user_id, entity_id, status, error)
    values (p_mutation_id, 'absence', 'create', p_establishment_id, v_caller, null, 'rejected', v_generic_denial);
    return query select 'rejected'::text, null::uuid, v_generic_denial;
    return;
  end if;

  begin
    insert into public.absences (staff_member_id, type, date_debut, date_fin, motif)
    values (p_staff_member_id, p_type::absence_type, p_date_debut, p_date_fin, p_motif)
    returning id into v_new_absence_id;

    insert into public.sync_mutations (mutation_id, entity_type, operation, establishment_id, actor_user_id, entity_id, status, error)
    values (p_mutation_id, 'absence', 'create', p_establishment_id, v_caller, v_new_absence_id, 'applied', null);
  exception
    when unique_violation then
      -- Une transaction concurrente a gagné la course sur ce mutation_id.
      -- Notre insert dans `absences` ci-dessus vient d'être annulé
      -- automatiquement avec cette exception — aucun doublon possible.
      -- Le "gagnant" peut être n'importe quel acteur si le mutation_id a
      -- été réutilisé/deviné/partagé : même contrôle identité + périmètre
      -- qu'au chemin de replay normal ci-dessus avant de rien renvoyer.
      select * into v_existing from public.sync_mutations where mutation_id = p_mutation_id;
      if v_existing.mutation_id is null or v_existing.actor_user_id != v_caller or v_existing.establishment_id != p_establishment_id then
        return query select 'rejected'::text, null::uuid, v_generic_denial;
        return;
      end if;
      return query select v_existing.status, v_existing.entity_id, v_existing.error;
      return;
  end;

  return query select 'applied'::text, v_new_absence_id, null::text;
end;
$$;


-- ============================================================================
-- FIN — aucune colonne supprimée, aucune donnée existante modifiée, aucune
-- opération destructive. N'affecte aucune règle RLS/table préexistante.
-- ============================================================================
