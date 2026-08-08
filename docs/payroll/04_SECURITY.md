# 04 — Sécurité (Phase 10)

Trois vérifications explicites demandées par la mission.

## 1. Un enseignant ne consulte que sa propre paie

`bulletins_self_read` (migration `0011_payroll_engine.sql`) : `staff_member_id in (select id from staff_members
where user_id = auth.uid()) and statut = 'paie_validee'`. Double condition : le bulletin doit lui appartenir
**et** être au statut final publié — un enseignant ne voit jamais un bulletin en cours de validation (brouillon,
validé RH, validé direction), seulement le résultat final. Même schéma pour `bulletin_paie_lignes` (détail) et
lecture seule pour `primes`/`retenues`/`absences`.

**Vérification négative** : recherche exhaustive de toute policy `select` sur ces tables ne filtrant pas par
`user_id = auth.uid()` en plus du statut — aucune trouvée en dehors de la policy `_directeur` (propriétaire de
l'établissement, voir point 2).

## 2. Le directeur voit tous les enseignants de son établissement

`bulletins_directeur`, `absences_directeur`, `primes_directeur`, `retenues_directeur` : toutes scopées par
`etablissement_id = current_establishment_id()` (ou via jointure `staff_members.etablissement_id =
current_establishment_id()`) — même fonction centrale que tout le reste du module Pro (Missions 04/05), non
modifiée. Le directeur voit tous les statuts, y compris les brouillons — nécessaire pour piloter le workflow de
validation.

## 3. Les administrateurs Écoles237 n'ont pas accès au détail des salaires sans permission explicite

**Vérifié par construction, pas par une policy à retirer** : recherche exhaustive dans
`0011_payroll_engine.sql` de toute policy mentionnant `platform_admin` sur `bulletins_paie`,
`bulletin_paie_lignes`, `bulletin_paie_historique`, `primes`, `retenues`, `absences`, `payroll_config`,
`types_primes`, `types_retenues` — **aucune n'existe**. Confirmé également pour les tables dont dépend le calcul
(`staff_contracts`, `staff_members`, migration 0009) : aucune de ces migrations, y compris celles des missions
précédentes, n'accorde de policy `platform_admin` sur une table du module Pro/RH. La seule policy
`platform_admin` de tout le dépôt concerne `establishments` elle-même (migration 0007, non exécutée) — ses
colonnes n'incluent aucune donnée salariale.

**"Sans permission explicite"** — la mission laisse entendre qu'un mécanisme d'accès exceptionnel pourrait
exister un jour (ex. support technique sur demande du directeur). **Aucun mécanisme de ce type n'est construit
dans cette mission** — la formulation actuelle ("aucune policy") satisfait l'exigence par défaut (pas d'accès du
tout), qui est un sur-ensemble sûr de "pas d'accès sans permission explicite". Construire un mécanisme de
permission temporaire et traçable (ex. un accès limité dans le temps, journalisé) est un travail de conception
à part entière, non entamé ici.

## Récapitulatif des frontières RLS sur les nouvelles tables

| Table | Directeur (scope établissement) | Personne elle-même (self) | platform_admin |
|---|---|---|---|
| `payroll_config`, `types_primes`, `types_retenues` | Complet | Aucun accès | Aucun |
| `absences` | Complet | Lecture + écriture de ses propres absences | Aucun |
| `primes`, `retenues` | Complet | Lecture seule | Aucun |
| `bulletins_paie`, `bulletin_paie_lignes` | Complet | Lecture seule, uniquement si `statut = 'paie_validee'` | Aucun |
| `bulletin_paie_historique` | Complet | **Aucun accès** (le processus de validation interne reste privé, seul le résultat final est visible) | Aucun |

## Résumé

| Vérification (Phase 10) | Statut |
|---|---|
| Enseignant limité à sa propre paie | Confirmé |
| Directeur voit tout son établissement | Confirmé |
| `platform_admin` sans accès aux salaires | Confirmé (par absence totale de policy, vérifié exhaustivement) |
