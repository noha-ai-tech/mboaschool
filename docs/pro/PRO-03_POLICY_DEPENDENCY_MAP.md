# PRO-03 — Carte des dépendances RLS

Source : catalogue PostgreSQL de production lu le 19 août 2026. Aucune écriture.

## Légende

- **D** : ligne porte directement `etablissement_id`; remplacer par `exists` sur `establishments(id, owner_id)`.
- **E** : ligne enfant ; joindre le parent métier puis `establishments`.
- **S** : objet Storage ; vérifier bucket, segment de chemin et école propriétaire sans cast non sûr.
- **R-A/B/C/D** : priorité et vague de migration.
- Toutes les policies ci-dessous sont actuellement `PERMISSIVE`, rôle `{public}`. La fonction qu’elles appellent n’est exécutable que par `authenticated`/`service_role`; les propositions ciblent explicitement `authenticated`.
- Pour une policy `ALL` sans `WITH CHECK` explicite, PostgreSQL réutilise `USING` comme contrôle des nouvelles lignes. La cible écrit les deux clauses afin que l’intention soit vérifiable.

## Consommateurs directs : 38 policies

| # | Table / policy | Opération | Comportement actuel | Risque multi-école | Remplacement | Priorité |
|---:|---|---|---|---|---|---|
| 1 | `public.absences` / `absences_directeur` | ALL | staff dont l’école = fonction courante | appel scalaire ; parent indirect | E via `staff_members` + owner | R-B |
| 2 | `public.ai_usage` / `Directeur lit le cout IA de son etablissement` | SELECT | école = fonction courante | appel scalaire | D | R-A |
| 3 | `public.ai_usage` / `Systeme peut enregistrer le cout IA` | INSERT | école = fonction courante | appel scalaire ; nom « système » trompeur pour une policy user | D, conserver le droit owner existant | R-D |
| 4 | `public.annees_scolaires` / `annees_scolaires_scope` | ALL | école = fonction courante | appel scalaire | D | R-C |
| 5 | `public.bulletin_paie_historique` / `bulletin_historique_directeur` | ALL | bulletin dont l’école = fonction courante | appel scalaire ; parent sensible | E via `bulletins_paie` | R-D |
| 6 | `public.bulletin_paie_lignes` / `bulletin_lignes_directeur` | ALL | bulletin dont l’école = fonction courante | idem | E via `bulletins_paie` | R-D |
| 7 | `public.bulletins_paie` / `bulletins_directeur` | ALL | école = fonction courante | appel scalaire ; paie | D | R-D |
| 8 | `public.conges_vacances` / `conges_scope` | ALL | école = fonction courante | appel scalaire | D | R-B |
| 9 | `public.contraintes_etablissement` / `contraintes_scope` | ALL | école = fonction courante | appel scalaire | D | R-C |
| 10 | `public.creneaux_horaires` / `creneaux_scope` | ALL | école = fonction courante | appel scalaire | D | R-C |
| 11 | `public.emplois_du_temps` / `edt_scope` | ALL | école = fonction courante | appel scalaire | D | R-C |
| 12 | `public.enseignant_disponibilites` / `ed_scope` | ALL | enseignant dont l’école = fonction courante | appel scalaire ; parent indirect | E via `enseignants` | R-B |
| 13 | `public.enseignant_indisponibilites` / `ens_indispo_directeur` | ALL | enseignant dont l’école = fonction courante | idem | E via `enseignants` | R-C |
| 14 | `public.enseignant_matieres` / `em_scope` | ALL | enseignant dont l’école = fonction courante | appel scalaire ; relation indirecte | E via `enseignants` | R-B |
| 15 | `public.enseignants` / `enseignants_scope` | ALL | école = fonction courante | appel scalaire ; coexiste avec self-read | D, préserver `enseignants_self_read` | R-B |
| 16 | `public.matieres` / `matieres_scope` | ALL | école = fonction courante | appel scalaire | D | R-B |
| 17 | `public.matieres_volume_horaire` / `mvh_scope` | ALL | matière dont l’école = fonction courante | appel scalaire ; parent indirect | E via `matieres` | R-B |
| 18 | `public.messages` / `messages_directeur` | ALL | école = fonction courante | appel scalaire ; lecture/écriture | D | R-D |
| 19 | `public.payroll_config` / `payroll_config_scope` | ALL | école = fonction courante | appel scalaire ; configuration sensible | D | R-D |
| 20 | `public.pointages` / `pointages_scope` | ALL | école = fonction courante | appel scalaire ; coexiste avec self-read | D, préserver `pointages_self_read` | R-C |
| 21 | `public.primes` / `primes_directeur` | ALL | staff dont l’école = fonction courante | appel scalaire ; paie indirecte | E via `staff_members` | R-D |
| 22 | `public.remplacements` / `remplacements_directeur` | ALL | école = fonction courante | appel scalaire | D | R-C |
| 23 | `public.retenues` / `retenues_directeur` | ALL | staff dont l’école = fonction courante | appel scalaire ; paie indirecte | E via `staff_members` | R-D |
| 24 | `public.salle_indisponibilites` / `salle_indispo_scope` | ALL | salle dont l’école = fonction courante | appel scalaire ; parent indirect | E via `salles` | R-C |
| 25 | `public.salles` / `salles_scope` | ALL | école = fonction courante | appel scalaire | D | R-C |
| 26 | `public.school_setup_drafts` / `Directeur gere ses brouillons d'import` | ALL | école = fonction courante | appel scalaire ; import | D | R-D |
| 27 | `public.school_setup_files` / `Directeur gere ses fichiers d'import` | ALL | école = fonction courante | appel scalaire ; import/fichiers | D | R-D |
| 28 | `public.school_setup_imports` / `Directeur gere ses imports` | ALL | école = fonction courante | appel scalaire ; import | D | R-D |
| 29 | `public.school_setup_issues` / `Directeur gere les issues de ses imports` | ALL | école = fonction courante | appel scalaire ; import | D | R-D |
| 30 | `public.sections` / `sections_scope` | ALL | école = fonction courante | appel scalaire | D | R-B |
| 31 | `public.staff_contracts` / `staff_contracts_director` | ALL | staff dont l’école = fonction courante | appel scalaire ; données RH | E via `staff_members` | R-B |
| 32 | `public.staff_documents` / `staff_documents_director` | ALL | staff dont l’école = fonction courante | appel scalaire ; documents RH | E via `staff_members` | R-B |
| 33 | `public.staff_members` / `staff_members_scope` | ALL | école = fonction courante | appel scalaire ; coexiste avec self-read | D, préserver `staff_members_self_read` | R-B |
| 34 | `public.trimestres` / `trimestres_scope` | ALL | année dont l’école = fonction courante | appel scalaire ; parent indirect | E via `annees_scolaires` | R-C |
| 35 | `public.types_primes` / `types_primes_scope` | ALL | école = fonction courante | appel scalaire ; config paie | D | R-D |
| 36 | `public.types_retenues` / `types_retenues_scope` | ALL | école = fonction courante | appel scalaire ; config paie | D | R-D |
| 37 | `storage.objects` / `pointages_owner_access` | ALL | premier dossier = UUID de la fonction courante | appel scalaire ; fichiers | S via dossier texte = `e.id::text` | R-C |
| 38 | `storage.objects` / `staff_documents_director_access` | ALL | premier dossier = staff de l’école courante | appel scalaire ; documents sensibles | S via `staff_members` + owner | R-B |

## Consommateur fonction : 1

| Fonction | Mode actuel | Dépendance | Risque | Remplacement | Priorité |
|---|---|---|---|---|---|
| `calculer_heures_enseignant(uuid,date,date,uuid default null)` | `STABLE SECURITY DEFINER`, `authenticated`/`service_role` | branches owner avec et sans établissement explicite | erreur scalaire ; appel owner sans école ; privilège definer plus large que nécessaire | `p_etablissement_id` obligatoire, agrégat explicitement filtré, `SECURITY INVOKER`, RLS pointages/enseignants | R-C |

## Policies associées qui ne doivent pas être cassées

- `enseignants_self_read` autorise l’enseignant à lire ses propres fiches.
- `pointages_self_read` autorise l’enseignant à lire ses propres pointages.
- `staff_members_self_read` autorise un membre à lire sa propre fiche.
- Les policies PRO-02 sur `departments` et `staff_responsibilities` ne dépendent déjà pas de la fonction.
- Les routes platform admin utilisent actuellement des policies/routes spécifiques ou un client admin après contrôle de rôle. Les nouvelles policies owner n’ajoutent pas de bypass admin global.

## Emplacements historiques locaux

- `0001_timetable_schema.sql` : création de la fonction et policies timetable.
- `0002_attendance_payroll_schema.sql`, `0003_multi_school_attendance.sql`, `0005_teacher_portal.sql` : versions successives de `calculer_heures_enseignant` et policies présence/paie.
- `0004_ai_usage_logs.sql`, `0009_pro_hr_foundation.sql`, `0010_pro_replacements.sql`, `0011_pro_payroll.sql`, `0015_school_setup_imports.sql` : autres policies dépendantes.

Les fichiers historiques ne sont pas réécrits. Les propositions PRO-03 ajoutent de nouvelles migrations de remplacement.
