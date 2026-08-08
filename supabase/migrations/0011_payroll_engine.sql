-- ============================================================================
-- 0011_payroll_engine.sql
--
-- PREPAREE MAIS NON EXECUTEE.
-- Mission 06 - Attendance & Payroll Engine. Ne pas executer dans Supabase
-- SQL Editor sans validation explicite d'Eddy et de l'architecte.
--
-- Construit le moteur de paie : configuration, absences/conges/missions,
-- primes/retenues, bulletins de paie avec workflow de validation historise.
-- S'appuie sur staff_members/staff_contracts (Mission 04, migration 0009)
-- et vue_heures_realisees (Mission 05, migration 0010) sans les modifier.
-- Voir docs/payroll/01_ARCHITECTURE.md pour le diagnostic complet.
--
-- AUCUN PAIEMENT BANCAIRE INTEGRE (Phase 6, exclusion explicite) - ce
-- module calcule et valide des montants, il ne les transfere jamais.
-- ============================================================================


-- ============================================================================
-- 1. TYPES ENUMERES
-- ============================================================================

create type absence_type as enum ('absence', 'conge', 'mission');
create type absence_statut as enum ('declaree', 'justifiee', 'refusee');
create type bulletin_statut as enum ('brouillon', 'valide_rh', 'valide_direction', 'paie_validee');
create type ligne_bulletin_type as enum ('salaire_base', 'heures_sup', 'prime', 'retenue');


-- ============================================================================
-- 2. CONFIGURATION (Phase 11) - toutes les regles sont modifiables
-- ============================================================================

create table if not exists public.payroll_config (
  etablissement_id            uuid primary key references public.establishments(id) on delete cascade,
  devise                      text not null default 'FCFA',
  frequence_paie              text not null default 'mensuelle' check (frequence_paie in ('mensuelle', 'quinzaine', 'hebdomadaire')),
  seuil_retard_minutes        integer not null default 10,
  taux_heure_sup_multiplicateur numeric not null default 1.25,
  jour_paie                   smallint check (jour_paie between 1 and 28),
  updated_at                  timestamptz not null default now()
);

-- Catalogue configurable des primes (au lieu de valeurs codees en dur).
create table if not exists public.types_primes (
  id                uuid primary key default gen_random_uuid(),
  etablissement_id  uuid not null references public.establishments(id) on delete cascade,
  nom               text not null,
  montant_defaut    numeric,
  recurrente        boolean not null default false,
  created_at        timestamptz not null default now()
);
create index if not exists idx_types_primes_etablissement on public.types_primes(etablissement_id);

create table if not exists public.types_retenues (
  id                uuid primary key default gen_random_uuid(),
  etablissement_id  uuid not null references public.establishments(id) on delete cascade,
  nom               text not null,
  montant_defaut    numeric,
  recurrente        boolean not null default false,
  created_at        timestamptz not null default now()
);
create index if not exists idx_types_retenues_etablissement on public.types_retenues(etablissement_id);


-- ============================================================================
-- 3. ABSENCES / CONGES / MISSIONS (Phase 3)
-- ============================================================================

create table if not exists public.absences (
  id                          uuid primary key default gen_random_uuid(),
  staff_member_id             uuid not null references public.staff_members(id) on delete cascade,
  type                        absence_type not null,
  date_debut                  date not null,
  date_fin                    date not null,
  motif                       text,
  justification_document_path text,
  statut                      absence_statut not null default 'declaree',
  created_at                  timestamptz not null default now()
);
create index if not exists idx_absences_staff_member on public.absences(staff_member_id);
create index if not exists idx_absences_dates on public.absences(date_debut, date_fin);


-- ============================================================================
-- 4. PRIMES / RETENUES (Phase 5)
-- ============================================================================

create table if not exists public.primes (
  id              uuid primary key default gen_random_uuid(),
  staff_member_id uuid not null references public.staff_members(id) on delete cascade,
  type_prime_id   uuid references public.types_primes(id) on delete set null,
  libelle         text not null,
  montant         numeric not null check (montant >= 0),
  periode_debut   date not null,
  periode_fin     date not null,
  created_at      timestamptz not null default now()
);
create index if not exists idx_primes_staff_member on public.primes(staff_member_id);

create table if not exists public.retenues (
  id              uuid primary key default gen_random_uuid(),
  staff_member_id uuid not null references public.staff_members(id) on delete cascade,
  type_retenue_id uuid references public.types_retenues(id) on delete set null,
  libelle         text not null,
  montant         numeric not null check (montant >= 0),
  periode_debut   date not null,
  periode_fin     date not null,
  created_at      timestamptz not null default now()
);
create index if not exists idx_retenues_staff_member on public.retenues(staff_member_id);


-- ============================================================================
-- 5. BULLETINS DE PAIE (Phase 6/7)
-- ============================================================================

create table if not exists public.bulletins_paie (
  id                    uuid primary key default gen_random_uuid(),
  staff_member_id       uuid not null references public.staff_members(id) on delete cascade,
  etablissement_id      uuid not null references public.establishments(id) on delete cascade,
  periode_debut         date not null,
  periode_fin           date not null,

  -- Entrees du moteur, figees au moment du calcul (tracabilite - voir
  -- docs/payroll/03_PAYROLL_ENGINE.md)
  salaire_base          numeric not null default 0,
  heures_prevues        numeric not null default 0,
  heures_effectuees     numeric not null default 0,
  heures_supplementaires numeric not null default 0,
  montant_heures_sup    numeric not null default 0,
  total_primes          numeric not null default 0,
  total_retenues        numeric not null default 0,

  -- Sorties
  salaire_brut          numeric not null default 0,
  salaire_net           numeric not null default 0,

  -- Workflow (Phase 7)
  statut                bulletin_statut not null default 'brouillon',
  calcule_le            timestamptz not null default now(),
  calcule_par           uuid references auth.users(id),
  valide_rh_le          timestamptz,
  valide_rh_par         uuid references auth.users(id),
  valide_direction_le   timestamptz,
  valide_direction_par  uuid references auth.users(id),

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index if not exists idx_bulletins_staff_member on public.bulletins_paie(staff_member_id);
create index if not exists idx_bulletins_etablissement on public.bulletins_paie(etablissement_id);
create unique index if not exists idx_bulletins_unique_periode on public.bulletins_paie(staff_member_id, periode_debut, periode_fin);

-- Detail ligne par ligne (salaire de base, chaque prime, chaque retenue,
-- heures sup) - permet un bulletin transparent et auditable.
create table if not exists public.bulletin_paie_lignes (
  id          uuid primary key default gen_random_uuid(),
  bulletin_id uuid not null references public.bulletins_paie(id) on delete cascade,
  type        ligne_bulletin_type not null,
  libelle     text not null,
  montant     numeric not null,
  signe       text not null check (signe in ('+', '-'))
);
create index if not exists idx_bulletin_lignes_bulletin on public.bulletin_paie_lignes(bulletin_id);

-- Historique de chaque transition de statut (Phase 7 : "chaque etape est
-- historisee") - jamais de mise a jour silencieuse du statut sans trace.
create table if not exists public.bulletin_paie_historique (
  id                uuid primary key default gen_random_uuid(),
  bulletin_id       uuid not null references public.bulletins_paie(id) on delete cascade,
  statut_precedent  bulletin_statut,
  statut_nouveau    bulletin_statut not null,
  change_par        uuid references auth.users(id),
  change_le         timestamptz not null default now(),
  commentaire       text
);
create index if not exists idx_bulletin_historique_bulletin on public.bulletin_paie_historique(bulletin_id);


-- ============================================================================
-- 6. RLS
-- ============================================================================
-- Principe applique partout : scope etablissement pour le directeur
-- (current_establishment_id(), via staff_members), lecture seule pour la
-- personne elle-meme (staff_members.user_id = auth.uid()). AUCUNE policy
-- platform_admin sur aucune table de ce fichier - conforme a la Phase 10
-- ("les administrateurs Ecoles237 n'ont pas acces au detail des salaires
-- sans permission explicite" ; aucun mecanisme de permission explicite
-- n'est construit dans cette mission, donc aucun acces n'est accorde).

alter table public.payroll_config enable row level security;
alter table public.types_primes enable row level security;
alter table public.types_retenues enable row level security;
alter table public.absences enable row level security;
alter table public.primes enable row level security;
alter table public.retenues enable row level security;
alter table public.bulletins_paie enable row level security;
alter table public.bulletin_paie_lignes enable row level security;
alter table public.bulletin_paie_historique enable row level security;

drop policy if exists payroll_config_scope on public.payroll_config;
create policy payroll_config_scope on public.payroll_config
  for all using (etablissement_id = current_establishment_id());

drop policy if exists types_primes_scope on public.types_primes;
create policy types_primes_scope on public.types_primes
  for all using (etablissement_id = current_establishment_id());

drop policy if exists types_retenues_scope on public.types_retenues;
create policy types_retenues_scope on public.types_retenues
  for all using (etablissement_id = current_establishment_id());

drop policy if exists absences_directeur on public.absences;
create policy absences_directeur on public.absences
  for all using (
    staff_member_id in (select id from public.staff_members where etablissement_id = current_establishment_id())
  );

drop policy if exists absences_self on public.absences;
create policy absences_self on public.absences
  for all using (
    staff_member_id in (select id from public.staff_members where user_id = auth.uid())
  )
  with check (
    staff_member_id in (select id from public.staff_members where user_id = auth.uid())
  );

drop policy if exists primes_directeur on public.primes;
create policy primes_directeur on public.primes
  for all using (
    staff_member_id in (select id from public.staff_members where etablissement_id = current_establishment_id())
  );

drop policy if exists primes_self_read on public.primes;
create policy primes_self_read on public.primes
  for select using (
    staff_member_id in (select id from public.staff_members where user_id = auth.uid())
  );

drop policy if exists retenues_directeur on public.retenues;
create policy retenues_directeur on public.retenues
  for all using (
    staff_member_id in (select id from public.staff_members where etablissement_id = current_establishment_id())
  );

drop policy if exists retenues_self_read on public.retenues;
create policy retenues_self_read on public.retenues
  for select using (
    staff_member_id in (select id from public.staff_members where user_id = auth.uid())
  );

-- Bulletins : le directeur gere le cycle complet (brouillon -> validations).
-- L'enseignant ne voit son bulletin QUE lorsqu'il est au statut final
-- 'paie_validee' (Phase 7 : "Consultation enseignant" arrive apres "Paie
-- validee" dans le workflow, pas avant).
drop policy if exists bulletins_directeur on public.bulletins_paie;
create policy bulletins_directeur on public.bulletins_paie
  for all using (etablissement_id = current_establishment_id());

drop policy if exists bulletins_self_read on public.bulletins_paie;
create policy bulletins_self_read on public.bulletins_paie
  for select using (
    staff_member_id in (select id from public.staff_members where user_id = auth.uid())
    and statut = 'paie_validee'
  );

drop policy if exists bulletin_lignes_directeur on public.bulletin_paie_lignes;
create policy bulletin_lignes_directeur on public.bulletin_paie_lignes
  for all using (
    bulletin_id in (select id from public.bulletins_paie where etablissement_id = current_establishment_id())
  );

drop policy if exists bulletin_lignes_self_read on public.bulletin_paie_lignes;
create policy bulletin_lignes_self_read on public.bulletin_paie_lignes
  for select using (
    bulletin_id in (
      select b.id from public.bulletins_paie b
      join public.staff_members sm on sm.id = b.staff_member_id
      where sm.user_id = auth.uid() and b.statut = 'paie_validee'
    )
  );

drop policy if exists bulletin_historique_directeur on public.bulletin_paie_historique;
create policy bulletin_historique_directeur on public.bulletin_paie_historique
  for all using (
    bulletin_id in (select id from public.bulletins_paie where etablissement_id = current_establishment_id())
  );

-- L'historique complet (y compris les etapes intermediaires) reste reserve
-- au directeur - l'enseignant voit le resultat final (le bulletin), pas le
-- detail du processus de validation interne.


-- ============================================================================
-- FIN - aucune colonne supprimee, aucune donnee existante modifiee.
-- Aucune integration de paiement bancaire. Aucune policy platform_admin.
-- ============================================================================
