# 01 — Audit des modules Pro existants (Phase 1)

Lecture seule — aucune modification à cette étape. Sources : `supabase/migrations/0001-0004`, `src/app/pro/*`,
`src/app/api/{enseignants,pointage,messagerie,timetable}/*`, `src/app/enseignant/*`.

---

## Enseignants

**TERMINÉ.** Table `enseignants` (migration `0001`, étendue par `0002`/`0003`) : `nom`, `prenom`, `email`,
`etablissement_id`, `code_pointage` (pointage sans compte), `taux_horaire`, `type_contrat` (texte libre, non
contraint), `user_id` (lié une fois le compte créé), `invite_envoyee_le`. Liste (`/pro/enseignants`), création
(`/pro/enseignants/nouveau`), invitation (`BoutonInviter` + `/api/enseignants/[id]/inviter`) tous fonctionnels.
RLS `enseignants_scope` (directeur) + `enseignants_self_read` (soi-même).

**Limite identifiée** : `type_contrat` est un champ texte libre, pas une valeur contrainte — pas de statut
actif/inactif distinct, pas de photo, pas de date d'entrée, pas de document attaché. Pas de concept de personnel
non-enseignant (administratif, direction, soutien).

## Emplois du temps

**TERMINÉ**, hors périmètre de modification de cette mission ("ne pas développer les emplois du temps").
`emplois_du_temps`, `creneaux_horaires`, `contraintes_etablissement` (migration `0001`), génération via
`POST /api/timetable/generate`. Non touché.

## Matières

**TERMINÉ.** `matieres` (nom, département disciplinaire), `matieres_volume_horaire` (heures/semaine par
niveau), `enseignant_matieres` (association). Gestion via `/pro/matieres`. Non modifié par cette mission — la
nouvelle fiche personnel (Phase 3) affiche les matières déjà associées, sans dupliquer leur gestion.

## Classes

**TERMINÉ** pour la structure de base (`classes` : `name`, `level`, `establishment_id`, table originelle
`auth-setup.sql`). **PARTIEL** au sens organisationnel : aucune notion de section (maternelle/primaire/
secondaire général/technique) — confirmé absent, déjà documenté dans l'audit initial
(`docs/00_CURRENT_STATE_AUDIT/12_GAPS_AND_UNKNOWNS.md`). Phase 5 de cette mission prépare cette structure.

## Présences (pointage)

**TERMINÉ.** `pointages` (migration `0002`), mode kiosque (`/pro/pointage/kiosque`, identification par
`code_pointage`), historique (`/pro/pointage/historique`), bucket Storage `pointages-photos` scopé par
établissement. RLS `pointages_scope` (directeur) + `pointages_self_read` (enseignant, lecture seule — confirmé
sans droit d'écriture, voir `docs/04_SUPABASE_PROD_READINESS/04_ISOLATION_ENSEIGNANTS.md`).

## Calcul des heures

**TERMINÉ.** RPC `calculer_heures_enseignant` (migrations `0002`/`0003`/`0005`), accessible au directeur et à
l'enseignant pour ses propres données. Non modifié.

## Invitations

**TERMINÉ pour le mode email.** `POST /api/enseignants/[id]/inviter` (client service role,
`admin.auth.admin.inviteUserByEmail`), trigger `handle_new_user` affecte le rôle `teacher` depuis les métadonnées
d'invitation, redirection post-connexion vers `/auth/enseignant-bienvenue` qui lie `enseignants.user_id`.

**ABSENT — mode sans email.** Le `code_pointage` existant permet de pointer au kiosque **sans** compte, mais ne
crée jamais de compte ni d'accès à un espace personnel — ce n'est pas un "mode d'invitation sans email", c'est un
mécanisme de pointage anonyme côté kiosque. Phase 4 de cette mission construit un véritable mode d'accès sans
email (code d'accès personnel donnant accès à l'espace personnel, pas seulement au pointage).

## Rôles

**PARTIEL.** `user_role` (enum auth, `parent`/`establishment_admin`/`platform_admin`/`teacher`) gouverne l'accès
système (connexion, redirection). Aucune notion de rôle organisationnel (Directeur/Proviseur/Censeur/
Secrétaire/Comptable/Assistant...) n'existe — chaque enseignant a exactement les mêmes droits applicatifs que
tout autre enseignant, chaque propriétaire d'établissement a les mêmes droits que tout autre propriétaire. Phase 6
de cette mission introduit un rôle organisationnel **distinct** de `user_role`, sans toucher à ce dernier (voir
`03_ROLES.md`).

---

## Synthèse — ce qui est terminé / partiel / manquant

| Module | État |
|---|---|
| Enseignants (CRUD de base, invitation email) | Terminé |
| Emplois du temps | Terminé (hors périmètre) |
| Matières | Terminé |
| Classes | Terminé (structure de base), sections absentes |
| Présences / pointage | Terminé |
| Calcul des heures | Terminé |
| Invitation par email | Terminé |
| Invitation sans email | **Absent** — construit par cette mission (Phase 4) |
| Rôles organisationnels | **Absent** — construit par cette mission (Phase 6) |
| Personnel non-enseignant | **Absent** — construit par cette mission (Phase 2) |
| Fiche personnel complète (photo, statut, date d'entrée, contrat) | **Absent** — construit par cette mission (Phase 3, 8) |
| Documents RH | **Absent** — construit par cette mission (Phase 9) |
| Sections | **Absent** — structure préparée par cette mission (Phase 5), pas d'interface complète |
| Paie, bulletins, notes, élèves, comptabilité | **Explicitement hors périmètre** de cette mission |
