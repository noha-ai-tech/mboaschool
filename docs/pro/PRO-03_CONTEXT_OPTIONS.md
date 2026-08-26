# PRO-03 — Options de contexte multi-établissement

Statut : conception uniquement.

## Comparaison

| Critère | A — ID explicite + RLS directe | B — claim JWT/app_metadata | C — cookie serveur validé + ID explicite | D — contexte transactionnel PostgreSQL |
|---|---|---|---|---|
| Sécurité | Forte : chaque ligne est vérifiée contre son école | Correcte seulement si claim signé, mais stale | Forte si le cookie reste une préférence et que l’ID est revérifié | Forte dans une transaction maîtrisée |
| Fraîcheur | Immédiate à chaque requête | Dépend du refresh du token | Immédiate à la validation serveur | Immédiate dans la transaction |
| Supabase Data API | Native | Native, avec limites de fraîcheur/taille JWT | Native | Fragile : pooling et frontières de requêtes |
| RLS | Predicate directement corrélé à la ligne | Predicate dépendant du JWT | Predicate directement corrélé à la ligne | Predicate dépendant d’un état de session |
| Server Components | ID dans URL/params, simple à reproduire | Token transparent, contexte moins visible | URL d’abord, cookie fallback | Exige une couche serveur transactionnelle dédiée |
| Coût de migration | Moyen/élevé mais explicite | Moyen, plus gestion du refresh | Moyen/élevé | Élevé |
| Deux onglets | Bon si l’URL porte l’école | Bon, mais claim unique/non contextuel | Bon avec URL ; mauvais avec cookie seul | Bon par transaction |
| Multi-appareil | Explicite sur chaque appareil | Claim synchronisé au refresh | Préférence locale par appareil | Sans préférence persistante native |
| Révocation rapide | Oui | Non garantie avant refresh | Oui | Oui |
| Risque principal | Oubli d’un filtre explicite, compensé par RLS | droits périmés et confusion autorisation/contexte | cookie pris à tort pour une autorité | fuite d’état/pooling ou contexte non appliqué |

## Recommandation

Adopter **A + la partie UX de C** :

1. l’URL porte l’école de l’onglet (`?school=<uuid>` ou segment de route) ;
2. chaque appel API transmet `requestedEstablishmentId` ;
3. le serveur authentifie l’utilisateur puis vérifie l’accès/capacité sur cette école ;
4. chaque requête métier filtre explicitement par `etablissement_id` ou par une ressource enfant déjà liée à cette école ;
5. RLS vérifie l’école portée par chaque ligne ;
6. le cookie ne mémorise que la dernière école choisie et n’est utilisé qu’en fallback UX après validation ;
7. avec plusieurs écoles et aucune URL/cookie valide, afficher une sélection au lieu de choisir silencieusement la première.

Ce modèle résout les deux onglets : chaque onglet conserve son URL. Une modification du cookie par l’autre onglet ne modifie pas l’autorité ni l’école déjà portée par la requête.

## Contrat serveur proposé

```ts
type EstablishmentCapability =
  | "owner"
  | "staff.read"
  | "personnel.manage"
  | "teachers.manage"
  | "timetable.manage"
  | "attendance.manage"
  | "payroll.manage"
  | "messaging.manage"
  | "imports.manage";

requireEstablishmentAccess({
  supabase,
  userId,
  requestedEstablishmentId,
  capability,
});
```

La vérification retourne une décision, une école et la source d’accès. Elle ne retourne jamais « la première école ». Pour PRO-03, les capacités owner existantes sont migrées sans activer de responsabilités réelles.

## Sélecteur

La liste affichée est l’union dédupliquée des écoles :

- possédées ;
- où `staff_members.user_id = auth.uid()` et `status = 'actif'` ;
- où une responsabilité valide existe, uniquement pour les capacités prévues ;
- administrées via un workflow platform admin explicite.

Une organisation ne participe pas à cette union par défaut. Pour un platform admin, ne pas charger automatiquement les 2 180 écoles dans le sélecteur ordinaire ; utiliser une recherche/pagination et une route admin explicite.

## Options rejetées comme source d’autorité

- `LIMIT 1`, tri puis première école, ou `.single()` sur les écoles owner ;
- cookie seul, même signé ;
- valeur envoyée par le client sans contrôle ;
- `raw_user_meta_data` ;
- claim contenant « l’école active » : il devient périmé et ne gère pas proprement les onglets ;
- `SET LOCAL`/variable de session avec la Data API sans transaction serveur strictement contrôlée ;
- helper SQL universel `can_access_everything(establishment_id)` qui mélangerait appartenance et capacités métier.

## RLS et performance

Les predicates répètent `(select auth.uid())` afin que PostgreSQL puisse l’évaluer comme init plan. Les jointures owner utilisent la PK `establishments(id)` puis vérifient `owner_id`; les jointures enfants utilisent les PK/FK déjà indexées, y compris les index FK complétés avec PRO-02. Après chaque vague : `EXPLAIN (ANALYZE, BUFFERS)` en staging, audit des index et advisors Supabase.

Les sous-requêtes RLS restent soumises aux policies des tables référencées. Les migrations doivent donc être testées sous de vraies identités. Aucun helper `SECURITY DEFINER` n’est ajouté pour contourner cette propriété.
