-- ============================================================================
-- 0010_timetable_engine.sql
--
-- PRÉPARÉE MAIS NON EXÉCUTÉE.
-- Mission 05 — Timetable & Workforce Engine. Ne pas exécuter dans Supabase
-- SQL Editor sans validation explicite d'Eddy et de l'architecte.
--
-- Étend le module emplois du temps (migration 0001, inchangée dans ses
-- tables et son algorithme) : structure pédagogique réutilisable (année
-- scolaire, trimestre, salle), contraintes supplémentaires, versioning non
-- destructif, remplacements (architecture), calcul des heures prévues vs
-- effectuées. Voir docs/timetable/01_ARCHITECTURE.md pour le diagnostic.
-- ============================================================================


-- ============================================================================
-- 1. STRUCTURE PÉDAGOGIQUE (Phase 2)
-- ============================================================================

create table if not exists public.annees_scolaires (
  id                uuid primary key default gen_random_uuid(),
  etablissement_id  uuid not null references public.establishments(id) on delete cascade,
  libelle           text not null,  -- ex. "2026-2027"
  date_debut        date not null,
  date_fin          date not null,
  statut            text not null default 'active' check (statut in ('active', 'archivee')),
  created_at        timestamptz not null default now()
);
create unique index if not exists idx_annees_scolaires_unique on public.annees_scolaires(etablissement_id, libelle);

create table if not exists public.trimestres (
  id                  uuid primary key default gen_random_uuid(),
  annee_scolaire_id   uuid not null references public.annees_scolaires(id) on delete cascade,
  nom                 text not null,  -- ex. "Trimestre 1"
  date_debut          date not null,
  date_fin            date not null,
  ordre               smallint not null
);
create index if not exists idx_trimestres_annee on public.trimestres(annee_scolaire_id);

create table if not exists public.salles (
  id                uuid primary key default gen_random_uuid(),
  etablissement_id  uuid not null references public.establishments(id) on delete cascade,
  nom               text not null,
  capacite          integer,
  type              text,  -- ex. 'classe', 'laboratoire', 'informatique', 'sport'
  created_at        timestamptz not null default now()
);
create index if not exists idx_salles_etablissement on public.salles(etablissement_id);

-- Rattachements additifs sur emplois_du_temps — la colonne texte
-- `annee_scolaire` existante (migration 0001) N'EST PAS RETIRÉE : le code
-- actuel (génération, 4 vues existantes) continue de fonctionner sans
-- modification. `annee_scolaire_id`/`salle_id` sont de nouveaux champs
-- optionnels que les nouvelles vues et la nouvelle UI peuvent adopter
-- progressivement.
alter table public.emplois_du_temps
  add column if not exists annee_scolaire_id uuid references public.annees_scolaires(id) on delete set null,
  add column if not exists salle_id          uuid references public.salles(id) on delete set null;


-- ============================================================================
-- 2. VERSIONING NON DESTRUCTIF (Phase 5)
-- ============================================================================
-- Constat de l'audit (Phase 1) : la génération actuelle SUPPRIME les lignes
-- précédentes avant d'insérer les nouvelles. Cette section ajoute les
-- colonnes nécessaires pour que la future logique applicative (Phase 5,
-- src/app/api/timetable/generate/route.ts modifié) marque l'ancienne
-- version comme inactive au lieu de la supprimer.

alter table public.emplois_du_temps
  add column if not exists version      integer not null default 1,
  add column if not exists est_actif    boolean not null default true,
  add column if not exists publie_le    timestamptz,
  add column if not exists publie_par   uuid references auth.users(id);

-- Élargit le workflow de statut (brouillon -> validé -> publié), sans
-- supprimer les valeurs existantes ('genere', 'modifie', 'valide') pour ne
-- pas invalider les lignes déjà en base avec ces statuts.
alter table public.emplois_du_temps drop constraint if exists emplois_du_temps_statut_check;
alter table public.emplois_du_temps add constraint emplois_du_temps_statut_check
  check (statut in ('genere', 'modifie', 'valide', 'brouillon', 'publie', 'archive'));

-- Les contraintes d'unicité existantes (classe/creneau/annee et
-- enseignant/creneau/annee) empêcheraient plusieurs versions actives
-- simultanées pour le même créneau — remplacées par des index partiels qui
-- n'appliquent l'unicité qu'aux lignes actives (est_actif = true), ce qui
-- permet de conserver l'historique (est_actif = false) sans le supprimer.
alter table public.emplois_du_temps drop constraint if exists emplois_du_temps_classe_id_creneau_id_annee_scolaire_key;
alter table public.emplois_du_temps drop constraint if exists emplois_du_temps_enseignant_id_creneau_id_annee_scolaire_key;

create unique index if not exists idx_edt_actif_classe_creneau
  on public.emplois_du_temps(classe_id, creneau_id, annee_scolaire)
  where est_actif;

create unique index if not exists idx_edt_actif_enseignant_creneau
  on public.emplois_du_temps(enseignant_id, creneau_id, annee_scolaire)
  where est_actif;


-- ============================================================================
-- 3. CONTRAINTES SUPPLÉMENTAIRES (Phase 4)
-- ============================================================================

-- Minimum d'heures hebdomadaires par enseignant (seul un maximum existait).
alter table public.contraintes_etablissement
  add column if not exists min_heures_semaine_enseignant integer;

-- Indisponibilités PONCTUELLES (une date précise), distinctes des
-- disponibilités récurrentes hebdomadaires déjà existantes
-- (enseignant_disponibilites, migration 0001).
create table if not exists public.enseignant_indisponibilites (
  id              uuid primary key default gen_random_uuid(),
  enseignant_id   uuid not null references public.enseignants(id) on delete cascade,
  date_debut      date not null,
  date_fin        date not null,
  motif           text,
  created_at      timestamptz not null default now()
);
create index if not exists idx_ens_indispo_enseignant on public.enseignant_indisponibilites(enseignant_id);

-- Congés et vacances d'établissement (jours où aucun cours n'a lieu).
create table if not exists public.conges_vacances (
  id                uuid primary key default gen_random_uuid(),
  etablissement_id  uuid not null references public.establishments(id) on delete cascade,
  nom               text not null,
  date_debut        date not null,
  date_fin          date not null,
  type              text not null default 'vacances' check (type in ('vacances', 'jour_ferie', 'autre'))
);
create index if not exists idx_conges_etablissement on public.conges_vacances(etablissement_id);

-- Indisponibilités de salle (ex. salle en travaux, réservée).
create table if not exists public.salle_indisponibilites (
  id          uuid primary key default gen_random_uuid(),
  salle_id    uuid not null references public.salles(id) on delete cascade,
  date_debut  date not null,
  date_fin    date not null,
  motif       text
);
create index if not exists idx_salle_indispo_salle on public.salle_indisponibilites(salle_id);


-- ============================================================================
-- 4. REMPLACEMENTS — architecture uniquement (Phase 6)
-- ============================================================================
-- Schéma préparé pour le workflow Absence -> Recherche -> Proposition ->
-- Validation -> Historique. Aucun algorithme de recherche de disponibilité
-- n'est construit dans cette mission (Phase 6 : "architecture uniquement").

create type remplacement_statut as enum ('absence_declaree', 'propose', 'valide', 'refuse', 'annule');

create table if not exists public.remplacements (
  id                        uuid primary key default gen_random_uuid(),
  etablissement_id          uuid not null references public.establishments(id) on delete cascade,
  emploi_du_temps_id        uuid not null references public.emplois_du_temps(id) on delete cascade,
  enseignant_absent_id      uuid not null references public.enseignants(id) on delete cascade,
  enseignant_remplacant_id  uuid references public.enseignants(id) on delete set null,
  date_cours                date not null,
  statut                    remplacement_statut not null default 'absence_declaree',
  motif_absence             text,
  propose_le                timestamptz,
  propose_par               uuid references auth.users(id),
  valide_le                 timestamptz,
  valide_par                uuid references auth.users(id),
  created_at                timestamptz not null default now()
);
create index if not exists idx_remplacements_etablissement on public.remplacements(etablissement_id);
create index if not exists idx_remplacements_enseignant_absent on public.remplacements(enseignant_absent_id);


-- ============================================================================
-- 5. CALCUL DES HEURES — vue SQL (Phase 7)
-- ============================================================================
-- "Chaque cours réalisé produit automatiquement heures prévues/effectuées/
-- annulées/retards/heures supplémentaires." Implémenté comme une VUE
-- (toujours à jour, sans job planifié ni trigger nécessaire) qui rapproche
-- l'emploi du temps prévu (emplois_du_temps + creneaux_horaires) et les
-- pointages réels (pointages) par établissement + enseignant + date.
--
-- Hypothèse de rapprochement : un "cours réalisé" est détecté par la
-- présence d'un pointage d'arrivée de l'enseignant concerné sur le jour de
-- la semaine du créneau prévu. Les heures effectuées utilisent
-- calculer_heures_enseignant (fonction déjà existante, migration
-- 0002/0003/0005, non modifiée). "Retard" = pointage d'arrivée postérieur de
-- plus de 10 minutes à l'heure de début du créneau prévu ce jour-là.

create or replace view public.vue_heures_realisees as
select
  edt.id                     as emploi_du_temps_id,
  edt.etablissement_id,
  edt.enseignant_id,
  edt.classe_id,
  edt.matiere_id,
  edt.annee_scolaire,
  cr.jour_semaine,
  cr.heure_debut             as heure_debut_prevue,
  cr.heure_fin                as heure_fin_prevue,
  extract(epoch from (cr.heure_fin::time - cr.heure_debut::time)) / 3600.0 as heures_prevues,
  p_arrivee.horodatage        as arrivee_reelle,
  case
    when p_arrivee.horodatage is null then 0
    else extract(epoch from (
      coalesce(p_depart.horodatage, p_arrivee.horodatage) - p_arrivee.horodatage
    )) / 3600.0
  end                          as heures_effectuees,
  case when p_arrivee.horodatage is null then true else false end as annule,
  case
    when p_arrivee.horodatage is not null
     and p_arrivee.horodatage::time > (cr.heure_debut::time + interval '10 minutes')
    then true else false
  end                          as en_retard,
  greatest(
    0,
    case
      when p_arrivee.horodatage is null then 0
      else extract(epoch from (
        coalesce(p_depart.horodatage, p_arrivee.horodatage) - p_arrivee.horodatage
      )) / 3600.0
    end
    - extract(epoch from (cr.heure_fin::time - cr.heure_debut::time)) / 3600.0
  )                            as heures_supplementaires
from public.emplois_du_temps edt
join public.creneaux_horaires cr on cr.id = edt.creneau_id
left join lateral (
  select horodatage from public.pointages p
  where p.enseignant_id = edt.enseignant_id
    and p.etablissement_id = edt.etablissement_id
    and p.type = 'arrivee'
    and extract(dow from p.horodatage) = (case when cr.jour_semaine = 6 then 6 else cr.jour_semaine end)
  order by p.horodatage desc
  limit 1
) p_arrivee on true
left join lateral (
  select horodatage from public.pointages p
  where p.enseignant_id = edt.enseignant_id
    and p.etablissement_id = edt.etablissement_id
    and p.type = 'depart'
    and p.horodatage > p_arrivee.horodatage
  order by p.horodatage asc
  limit 1
) p_depart on true
where edt.est_actif;

comment on view public.vue_heures_realisees is
  'Rapprochement heures prévues (emplois_du_temps) / heures effectuées (pointages). '
  'Alimentera la future paie (Phase 7) — voir docs/timetable/02_ENGINE.md pour les limites assumées.';


-- ============================================================================
-- 6. RLS
-- ============================================================================

alter table public.annees_scolaires enable row level security;
alter table public.trimestres enable row level security;
alter table public.salles enable row level security;
alter table public.enseignant_indisponibilites enable row level security;
alter table public.conges_vacances enable row level security;
alter table public.salle_indisponibilites enable row level security;
alter table public.remplacements enable row level security;

drop policy if exists annees_scolaires_scope on public.annees_scolaires;
create policy annees_scolaires_scope on public.annees_scolaires
  for all using (etablissement_id = current_establishment_id());

drop policy if exists trimestres_scope on public.trimestres;
create policy trimestres_scope on public.trimestres
  for all using (
    annee_scolaire_id in (select id from public.annees_scolaires where etablissement_id = current_establishment_id())
  );

drop policy if exists salles_scope on public.salles;
create policy salles_scope on public.salles
  for all using (etablissement_id = current_establishment_id());

drop policy if exists salle_indispo_scope on public.salle_indisponibilites;
create policy salle_indispo_scope on public.salle_indisponibilites
  for all using (
    salle_id in (select id from public.salles where etablissement_id = current_establishment_id())
  );

drop policy if exists conges_scope on public.conges_vacances;
create policy conges_scope on public.conges_vacances
  for all using (etablissement_id = current_establishment_id());

-- Indisponibilités enseignant : directeur (scope complet) + l'enseignant
-- lui-même peut déclarer/consulter SES PROPRES indisponibilités.
drop policy if exists ens_indispo_directeur on public.enseignant_indisponibilites;
create policy ens_indispo_directeur on public.enseignant_indisponibilites
  for all using (
    enseignant_id in (select id from public.enseignants where etablissement_id = current_establishment_id())
  );

drop policy if exists ens_indispo_self on public.enseignant_indisponibilites;
create policy ens_indispo_self on public.enseignant_indisponibilites
  for all using (
    enseignant_id in (select id from public.enseignants where user_id = auth.uid())
  )
  with check (
    enseignant_id in (select id from public.enseignants where user_id = auth.uid())
  );

drop policy if exists remplacements_directeur on public.remplacements;
create policy remplacements_directeur on public.remplacements
  for all using (etablissement_id = current_establishment_id());

-- Un enseignant voit les remplacements où il est concerné (absent ou
-- remplaçant proposé) — jamais ceux d'un collègue sans lien avec lui.
drop policy if exists remplacements_self_read on public.remplacements;
create policy remplacements_self_read on public.remplacements
  for select using (
    enseignant_absent_id in (select id from public.enseignants where user_id = auth.uid())
    or enseignant_remplacant_id in (select id from public.enseignants where user_id = auth.uid())
  );


-- ============================================================================
-- FIN — aucune colonne supprimée, aucune donnée existante modifiée ou
-- supprimée. Le champ `annee_scolaire` (texte) et les contraintes
-- d'unicité d'origine sont remplacés par des index partiels équivalents
-- (actifs uniquement), jamais par une suppression de données : toute ligne
-- historique (est_actif = false) reste intacte et interrogeable.
-- ============================================================================
