# 06 — Tests (Phase 12)

Aucun environnement Supabase réel disponible — tests documentés pour exécution manuelle après validation et
exécution de `0009_pro_hr_foundation.sql` en environnement de test (jamais directement en production).

## Invitation

1. Créer un membre du personnel avec un email (`/pro/personnel/nouveau`, catégorie "Enseignant").
2. Cliquer "Inviter par email" sur sa fiche (`/pro/personnel/[id]`).
3. **Attendu** : email d'invitation envoyé, `staff_members.invite_envoyee_le` renseigné.
4. Sur un membre sans email, vérifier que le bouton "Inviter par email" est désactivé.
5. Cliquer "Générer un code d'accès" sur un membre quelconque.
6. **Attendu** : `staff_members.access_code` renseigné, code affiché à l'écran (à noter/transmettre
   manuellement — voir la limite documentée dans `05_SECURITY.md`).

## Connexion

1. Accepter l'invitation email (compte enseignant) → `/auth/enseignant-bienvenue`.
2. **Attendu** : `enseignants.user_id` ET `staff_members.user_id` sont tous deux renseignés (vérifier la
   synchronisation ajoutée dans `src/app/auth/enseignant-bienvenue/page.tsx`).
3. Se connecter, aller sur `/enseignant/mon-espace`.
4. **Attendu** : les nouvelles sections (Mon emploi du temps, Mes classes, Mes documents) s'affichent sans
   erreur, avec des données réelles si `edt_self_read`/`staff_documents_self_read` sont actives.

## Permissions

1. Se connecter avec le compte d'un enseignant A. Tenter de charger `/pro/personnel` directement.
2. **Attendu** : redirection (la route est protégée par le middleware existant `/pro/:path*`, réservé au
   propriétaire avec `forfait = 'pro'` — un compte enseignant n'est jamais `owner_id`, donc jamais autorisé).
   Confirme que le module Personnel reste un outil de direction, pas un espace enseignant.
3. Depuis la console navigateur, en tant qu'enseignant A, tenter de lire `staff_members` d'un enseignant B du
   même établissement (`select * from staff_members where id = '<id_B>'`).
4. **Attendu** : aucune ligne retournée.

## Création

1. Créer un membre "Personnel administratif" (catégorie `admin`, rôle `secretaire`) sans email.
2. **Attendu** : création réussie, `enseignant_id` reste `null`, la personne n'apparaît jamais dans
   `/pro/enseignants` ni `/pro/matieres`.
3. Créer un membre "Enseignant" (catégorie `teacher`).
4. **Attendu** : une ligne `enseignants` est créée en parallèle avec un `code_pointage`, visible dans
   `/pro/enseignants` en plus de `/pro/personnel`.

## Modification

1. Sur une fiche personnel, ajouter un contrat (`staff_contracts`).
2. **Attendu** : le contrat s'affiche immédiatement sur la fiche, un nouveau bouton "+ Nouveau contrat" apparaît
   pour en ajouter un suivant.
3. Uploader un document (catégorie "Diplôme").
4. **Attendu** : le document apparaît dans la liste avec un lien de téléchargement signé (1h de validité,
   même mécanisme que les photos de pointage existantes).

## Consultation

1. Vérifier que la liste `/pro/personnel` regroupe correctement par catégorie, dans l'ordre Direction /
   Enseignants / Administratif / Soutien, et que le compteur total est exact.
2. Vérifier que les enseignants déjà existants avant cette mission (créés via `/pro/enseignants/nouveau`
   avant l'exécution de `0009`) apparaissent bien dans `/pro/personnel` après exécution de la migration
   (rétro-remplissage, voir `docs/pro/02_RH.md`).

## Non-régression

1. Vérifier que `/pro/enseignants`, `/pro/matieres`, `/pro/emplois-du-temps`, `/pro/pointage/*`,
   `/pro/messagerie` fonctionnent exactement comme avant cette mission — aucun de ces fichiers n'a été modifié
   dans son contenu fonctionnel (seul `pro/layout.tsx` a reçu un lien de navigation supplémentaire).
2. Vérifier que le flux d'invitation enseignant existant (`/api/enseignants/[id]/inviter`, distinct de
   `/api/personnel/[id]/inviter`) continue de fonctionner à l'identique.
