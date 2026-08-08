# 06 — Tests (Phase 12)

Aucun environnement Supabase réel disponible — tests documentés pour exécution manuelle après validation et
exécution de `0011_payroll_engine.sql` en environnement de test (jamais directement en production).

## Pointage

1. Confirmer que le pointage kiosque existant (`/pro/pointage/kiosque`) fonctionne à l'identique — non modifié
   par cette mission.

## Présence

1. Déclarer une absence (`/pro/absences`) pour un enseignant sur une période donnée.
2. **Attendu** : apparaît dans la liste avec le statut "Déclarée".
3. Vérifier qu'un enseignant peut lire/écrire ses propres absences (`absences_self`) mais pas celles d'un
   collègue (tentative directe via console : `select * from absences where staff_member_id = '<id_autre>'`
   → aucune ligne).

## Calcul

1. Créer un contrat `temps_plein` avec `salaire = 200000` pour un membre du personnel.
2. Appeler `POST /api/payroll/calculer` avec une période sans heures supplémentaires.
3. **Attendu** : `salaireBase = 200000`, `montantHeuresSup = 0`, bulletin créé au statut `brouillon`.
4. Ajouter une prime de 20000 et une retenue de 5000 pour la même période, relancer le calcul.
5. **Attendu** : `salaireBrut = 220000`, `salaireNet = 215000`, 4 lignes de détail (salaire de base, prime,
   retenue — pas de ligne heures sup si `heuresSupplementaires = 0`).
6. Relancer le calcul une seconde fois pour la même période.
7. **Attendu** : le bulletin existant est mis à jour (contrainte unique `staff_member_id, periode_debut,
   periode_fin`), pas de doublon créé ; les anciennes lignes de détail sont remplacées par les nouvelles.

## Contrat

1. Vérifier qu'un membre du personnel sans contrat actif ne peut pas être calculé
   (`POST /api/payroll/calculer` → `400`).

## Validation

1. Calculer un bulletin (statut `brouillon`).
2. Appeler `valider-rh` → statut `valide_rh`, entrée dans `bulletin_paie_historique`.
3. Appeler `valider-direction` → statut `paie_validee` en une étape, **deux** entrées d'historique ajoutées
   (`valide_direction` puis `paie_validee` — voir commentaire du fichier `valider-direction/route.ts`).
4. Tenter de rappeler `valider-rh` sur un bulletin déjà `valide_rh` → `409` (statut invalide pour cette action).

## Consultation

1. Avant validation direction, se connecter en tant qu'enseignant concerné, vérifier que "Mon salaire"
   n'affiche rien pour cette période.
2. Après validation direction, recharger — le bulletin apparaît avec le salaire net et un lien d'export CSV.

## Permissions

Voir `04_SECURITY.md` pour le détail complet — reproduire chaque vérification du tableau récapitulatif.

## Exports

1. Télécharger l'export CSV d'un bulletin en tant que directeur — vérifier l'ouverture correcte dans un tableur
   (encodage, colonnes).
2. Télécharger le même export en tant qu'enseignant concerné (une fois `paie_validee`) — doit réussir.
3. Tenter de télécharger l'export d'un bulletin d'un **autre** enseignant en modifiant l'URL — doit échouer
   (`404`, RLS bloque la lecture du bulletin, la route retourne alors "introuvable").

## Non-régression

1. Vérifier que `staff_contracts`, `staff_members`, `vue_heures_realisees`, `emplois_du_temps`, `pointages`
   fonctionnent exactement comme avant cette mission — aucun n'a été modifié.
2. Vérifier que `/enseignant/mon-espace` affiche toujours correctement les sections des missions précédentes
   (emploi du temps, présences, heures, documents) en plus de la nouvelle section "Mon salaire".
