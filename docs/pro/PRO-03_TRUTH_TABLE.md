# PRO-03 — Truth table multi-école

Statut : scénarios attendus ; non exécutés en production.

## Accès et contexte

| Scénario | Attendu | Raison |
|---|---|---|
| Owner A / requête School A possédée | ALLOW | Predicate direct sur l’école de la ligne |
| Owner A / School B non possédée | DENY | L’ID client ne crée aucun droit |
| Owner A possède A et C / requête C | ALLOW | Aucune sélection scalaire ; C est vérifiée directement |
| Owner A possède deux écoles | PASS, aucune erreur scalaire | Aucun appel à `current_establishment_id()` après migration complète |
| Staff A actif / School A | ALLOW selon permission | Appartenance valide, capacité encore requise |
| Staff A / School B | DENY | Pas d’appartenance/capacité dans B |
| Staff inactif / School A | DENY | `status <> 'actif'` |
| Responsabilité active, non révoquée, période courante, bon code/scope | ALLOW selon code et scope | Autorisation métier explicite |
| Responsabilité révoquée | DENY | `is_active = false` ou `revoked_at is not null` |
| Responsabilité expirée/non commencée | DENY | Date courante hors période |
| Platform admin | ALLOW seulement par policy/route admin explicite | PRO-03 n’ajoute pas d’accès métier global implicite |
| Owner d’Organization sans appartenance scolaire | DENY | Aucun accès transitif d’organisation |
| `requestedEstablishmentId` falsifié | DENY | Contrôle serveur + RLS de la ligne |
| Cookie A + requête B sans accès B | DENY | L’URL/body est contrôlé ; le cookie n’est pas une autorité |
| Cookie A + requête B avec accès B | ALLOW selon capacité B | Le cookie ne peut pas forcer A |
| Deux onglets A et C | PASS, aucune fuite | L’URL et chaque appel portent leur école propre |
| Ressource enfant de B envoyée dans une mutation A | DENY | Validation enfant + école et FK composites le cas échéant |
| Service role après contrôle métier absent | DENY au niveau applicatif | Aucun appel admin ne doit précéder le contrôle |

## Compatibilité

| Parcours | Attendu après implémentation |
|---|---|
| Espace enseignant multi-école | École explicite, RPC heures avec `p_etablissement_id`, uniquement ses lignes |
| Dashboard Pro | Route et composants alignés sur la même école explicite |
| Personnel / Enseignants | Création, invitation et détail limités à l’école demandée |
| Pointage | Code/enseignant et stockage vérifiés dans la même école |
| Paie | Staff, contrat, bulletin et validations rattachés à la même école |
| Emplois du temps | Génération/publication filtrées par l’école demandée |
| Imports | Draft/fichier/import/issue limités à l’école demandée |
| Callback invitation | Jeton d’invitation précis ; jamais l’e-mail seul comme preuve |
| Administration plateforme | Routes admin explicites inchangées, aucune policy globale ajoutée par accident |

## Matrice par vague

Chaque vague doit exécuter au minimum sous JWT distincts :

1. SELECT autorisé owner A sur A et C ;
2. SELECT refusé owner A sur B ;
3. INSERT avec école falsifiée refusé ;
4. UPDATE ne pouvant pas déplacer une ligne de A vers B (`WITH CHECK`) ;
5. DELETE cross-school refusé ;
6. self-read enseignant préservé ;
7. staff sans capacité d’écriture refusé ;
8. platform admin conforme aux policies existantes du domaine ;
9. comportement `anon` refusé ;
10. test d’un nom de fichier storage malformé sans erreur de cast ni fuite.

## Verdict de conception

La truth table est **PASS au niveau de la conception**. Elle reste **non validée techniquement** tant que les migrations n’ont pas été appliquées sur un environnement isolé et les scénarios exécutés.
