# PRO-02 — Recommandation architecturale finale

## Décision

Adopter une architecture additive en quatre couches :

1. **Identité globale** : `auth.users` + `profiles`, sans changer `profiles.role`.
2. **Appartenance scolaire** : `staff_members`, une ligne par relation professionnelle avec une école.
3. **Données pédagogiques** : `enseignants`, facultativement liée à `staff_members`, conservée comme source pour matières, disponibilités, pointage, taux horaire et EDT.
4. **Autorisation scolaire** : `staff_responsibilities`, plusieurs lignes par membre, chacune limitée à un établissement, une section ou un département canonique.

Le modèle de scope retenu est le modèle A : une table d'attributions avec colonnes explicites et contraintes fortes. Les responsabilités utilisent une table de référence extensible ; les trois types structurels de scope utilisent un enum fermé.

## Décisions de compatibilité

- `profiles.role` reste le rôle global mono-valeur.
- `teacher` et `establishment_admin` restent disponibles pendant la transition.
- `staff_members.role` reste la responsabilité principale affichée, mais ne devient pas une autorité.
- `enseignants` reste intacte et nécessaire.
- `sections.responsable_staff_member_id` reste intacte ; les nouvelles attributions deviennent progressivement la source d'autorité.
- `matieres.departement_disciplinaire` reste intact ; `department_id` est ajouté nullable et sans backfill.
- Aucune relation PRO-01 `organizations` n'accorde automatiquement un accès à une école.

## Prérequis avant activation applicative

1. Valider le projet SQL avec Eddy et l'architecte.
2. Exécuter d'abord sur une branche Supabase de test.
3. Tester les FK composites et toutes les identities de la truth table.
4. Résoudre la stratégie multi-école des 35 policies basées sur `current_establishment_id()` ; la fonction actuelle devient ambiguë avec plusieurs écoles.
5. Corriger les routes Personnel/Enseignants et le middleware Pro qui utilisent encore `.single()`/`.maybeSingle()` sur toutes les écoles d'un propriétaire.
6. Décider les opérations métier exactes accordées à chaque code ; PRO-02 ne doit pas inventer une matrice universelle.
7. Générer les types Supabase après exécution validée, jamais avant.

## Plan de migration progressive

### Étape A — validation de schéma

- revue SQL statique ;
- branche de test ;
- vérification des advisors sécurité/performance ;
- tests de contraintes, indexes, RLS et rollback.

### Étape B — fondation additive

- catalogue ;
- départements ;
- responsabilités ;
- lifecycle et audit ;
- aucune attribution métier et aucun backfill automatique.

### Étape C — couche serveur

- routes d'attribution/révocation avec établissement explicite et vérifié ;
- transaction atomique pour créer `enseignants` + `staff_members` ;
- abandon de l'email comme seule preuve de rapprochement ;
- aucune lecture d'autorisation depuis `user_metadata`.

### Étape D — double lecture/double écriture

- garder `staff_members.role` ;
- écrire aussi la responsabilité principale de même code lorsque le code historique existe ;
- lire les responsabilités, avec repli temporaire sur le rôle historique ;
- mesurer les lignes encore servies par le repli.

### Étape E — activation policy par policy

- commencer par une opération à faible risque ;
- appliquer `USING` et `WITH CHECK` ;
- tester chaque scope et chaque refus inter-école ;
- étendre seulement après preuve.

### Étape F — dépréciation ultérieure

- arrêter le repli après couverture complète ;
- documenter `staff_members.role` comme champ historique/d'affichage ;
- ne supprimer aucune colonne dans PRO-02.

## Plan de tests

### Schéma

- création rejouable sur base propre ;
- refus des scopes incohérents ;
- refus des FK inter-écoles ;
- refus des dates inversées ;
- refus des doublons exacts, y compris avec cibles NULL ;
- suppression/restriction conforme sur staff, section, département et école.

### RLS

- exécuter les 20 scénarios de `PRO-02_RLS_TRUTH_TABLE.md` sous JWT distincts ;
- vérifier INSERT/UPDATE et l'absence de DELETE ;
- vérifier que les rôles `anon` n'ont aucun accès ;
- vérifier qu'un membre inactif ou une attribution expirée ne confère aucun droit ;
- vérifier que platform admin ne dépend pas d'une appartenance scolaire.

### Compatibilité

- connexion parent, enseignant, établissement et platform admin ;
- callback d'invitation enseignant ;
- espace enseignant multi-école ;
- écrans Personnel et Enseignants ;
- matière/EDT/pointage/paie ;
- sélecteur d'école actif ;
- absence de régression PRO-01 et absence d'accès transitif par organisation.

### Performance

- `EXPLAIN (ANALYZE, BUFFERS)` sur lookup établissement/code, membre/code, section et département ;
- vérifier l'utilisation des indexes de FK et de l'index effectif partiel ;
- contrôler les advisors Supabase après déploiement sur branche de test.

## Rollback conceptuel

Avant activation des lectures nouvelles, le rollback consiste à supprimer les objets PRO-02 dans l'ordre inverse. Après double écriture, désactiver d'abord les consommateurs et revenir au repli `staff_members.role`; conserver les tables pour investigation. Aucun rollback ne doit supprimer des attributions ou journaux sans export et validation explicite.

## Verdict

Le modèle est prêt pour revue architecturale, mais **pas prêt pour exécution production**. Le SQL reste une proposition. La validation doit porter en particulier sur le catalogue initial, la politique d'audit, le comportement de suppression et le chantier `current_establishment_id()`.
