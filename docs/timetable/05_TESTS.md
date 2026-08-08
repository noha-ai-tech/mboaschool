# 05 — Tests (Phase 11)

Aucun environnement Supabase réel disponible — tests documentés pour exécution manuelle après validation et
exécution de `0010_timetable_engine.sql` en environnement de test (jamais directement en production).

## Publication

1. Générer un emploi du temps (`BoutonGenerer`, `/pro/emplois-du-temps`).
2. **Attendu** : les 6 vues continuent d'afficher la version précédemment publiée (ou rien, si première
   génération) — le nouveau brouillon n'apparaît dans aucune vue.
3. Cliquer "Publier le brouillon".
4. **Attendu** : les vues affichent désormais la nouvelle version. Vérifier en base que l'ancienne version a
   `est_actif = false, statut = 'archive'` (et non supprimée) et que la nouvelle a `est_actif = true, statut =
   'publie', publie_le` renseigné.
5. Générer une seconde fois sans publier.
6. **Attendu** : `version` incrémente (3ᵉ génération), le brouillon précédent (2ᵉ génération) reste en base
   avec `statut = 'brouillon'` — vérifier qu'aucune ligne historique n'a été supprimée à aucune étape.

## Modification

1. Vérifier qu'une tentative d'insertion manuelle en double sur un créneau déjà actif
   (`classe_id`/`creneau_id`/`annee_scolaire` identiques, `est_actif = true`) échoue (index unique partiel).
2. Vérifier qu'une insertion sur le même créneau avec `est_actif = false` (une ligne archivée) **réussit** —
   confirme que l'historique n'est plus contraint par l'unicité.

## Conflits

1. Tenter de générer deux fois pour la même année scolaire sans publier entre les deux.
2. **Attendu** : succès des deux générations (chacune crée son propre brouillon avec sa propre `version`), sans
   conflit — la contrainte d'unicité ne s'applique qu'aux lignes actives.

## Calcul des heures

1. Sur un enseignant avec un créneau prévu le mardi et un pointage réel un mardi, consulter
   `vue_heures_realisees`.
2. **Attendu** : `heures_prevues` correspond à la durée du créneau, `heures_effectuees` à la durée réelle entre
   arrivée et départ pointés, `annule = false`.
3. Sur un enseignant avec un créneau prévu mais aucun pointage correspondant.
4. **Attendu** : `annule = true`, `heures_effectuees = 0`.
5. Sur un pointage d'arrivée 15 minutes après l'heure de début du créneau.
6. **Attendu** : `en_retard = true`.
7. **Limite à garder en tête pendant les tests** (voir `02_ENGINE.md`) : le rapprochement se fait par jour de
   semaine récurrent, pas par date précise — un enseignant qui pointe deux mardis différents dans la période
   testée verra ses heures agrégées sur les deux occurrences pour le même créneau du mardi.

## Permissions

1. Se connecter en tant qu'enseignant A, consulter `/enseignant/mon-espace`.
2. **Attendu** : la section "Mon emploi du temps" affiche uniquement les créneaux où `enseignant_id` correspond
   à A.
3. Depuis la console navigateur, en tant qu'enseignant A, tenter
   `select * from emplois_du_temps where enseignant_id = '<id_B>'`.
4. **Attendu** : aucune ligne retournée (policy `edt_self_read`).
5. Vérifier que `/pro/emplois-du-temps`, `/pro/salles`, `/pro/remplacements` restent inaccessibles à un compte
   enseignant (protection déjà existante du middleware `/pro/:path*`, non modifiée).

## Non-régression

1. Vérifier que les 4 vues existantes avant cette mission (Établissement, Enseignant, Classe, Département)
   affichent des résultats identiques à avant cette mission pour une version déjà publiée (seul le filtre
   `est_actif = true` a été ajouté aux requêtes — sans impact sur des données déjà à `est_actif = true` par
   défaut après migration).
2. Vérifier que `calculer_heures_enseignant` (RPC existante, non modifiée) continue de fonctionner à l'identique
   — `vue_heures_realisees` est une addition, pas un remplacement.
3. Vérifier que le module Pro (matières, pointage kiosque, messagerie) fonctionne sans changement.
