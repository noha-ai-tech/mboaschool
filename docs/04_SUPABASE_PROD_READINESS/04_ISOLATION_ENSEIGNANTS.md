# 04 — Isolation entre enseignants (Enseignant A / Enseignant B)

Méthode : analyse de toutes les policies `*_self_read` et du code de `src/app/enseignant/mon-espace/page.tsx`
(le seul point d'accès enseignant à ses propres données), de la RPC `calculer_heures_enseignant`, et des routes
API utilisées pour créer/inviter/faire pointer des enseignants.

---

## 1. Un enseignant ne voit que ses propres données

**SÛR.** `enseignants_self_read` (`0003_comptes_enseignants.sql`) : `using (user_id = auth.uid())`. Un
enseignant ne peut `SELECT` que la ligne `enseignants` où `user_id` correspond à son propre compte. Aucune
policy ne permet de lire la ligne d'un autre enseignant. Vérifié dans le code : `mon-espace/page.tsx` interroge
`enseignants` avec `.eq("user_id", user.id)` (ligne 20-23) — cohérent et redondant avec RLS (défense en
profondeur correcte).

## 2. Un enseignant ne voit que les établissements auxquels il est rattaché

**SÛR.** La même requête (`enseignants` filtrée par `user_id`) retourne une ligne par rattachement
enseignant↔établissement. Le sélecteur multi-établissement (`?eid=`) ne fait que choisir *parmi* ce tableau déjà
scopé côté serveur (`enseignants.find((e) => e.id === params.eid) ?? enseignants[0]`, ligne 37-40) — il est
techniquement impossible de faire pointer `?eid=` vers l'enseignant d'un autre compte, puisque `.find()` opère
sur un tableau déjà filtré par `user_id = auth.uid()` en amont. Confirmé également par RLS indépendamment
(défense en profondeur) sur `messages` (`messages_enseignant_read`) et `pointages` (`pointages_self_read`), qui
revérifient chacune l'appartenance via `enseignants.user_id = auth.uid()`.

## 3. Un enseignant ne peut pas modifier ses présences brutes

**SÛR.** Recherche exhaustive de toute policy `INSERT`/`UPDATE`/`DELETE` sur `pointages` accordée à un
enseignant (via `user_id = auth.uid()`) : **aucune trouvée**. Les seules policies d'écriture sur `pointages`
sont `pointages_scope` (`for all`, réservée au propriétaire de l'établissement via `current_establishment_id()`).
`pointages_self_read` est strictement `for select`. Un enseignant n'a donc, au niveau base de données, **aucun
moyen d'insérer, modifier ou supprimer une ligne de pointage**, y compris la sienne.

Le seul chemin d'écriture applicatif est `POST /api/pointage/enregistrer` (`src/app/api/pointage/enregistrer/route.ts`)
— vérifié ligne par ligne : la route résout l'établissement via `owner_id = auth.uid()` de la **session
connectée** (celle du kiosque, qui appartient au propriétaire de l'établissement, pas à un enseignant
individuel — cohérent avec le modèle de kiosque partagé déjà documenté dans l'audit précédent), identifie
l'enseignant par `code_pointage` (pas par une session enseignant), et insère avec l'établissement de la session
courante. Un enseignant n'a jamais de session authentifiée capable d'appeler cette route en son nom propre pour
falsifier un horodatage.

## 4. Un enseignant ne peut pas voir le salaire d'un autre enseignant

**SÛR.** `enseignants.taux_horaire` est protégé par les mêmes policies que le reste de la ligne
(`enseignants_scope` pour le propriétaire, `enseignants_self_read` pour l'enseignant lui-même). Aucune policy
ne permet à un enseignant de lire la ligne d'un autre enseignant, donc aucune fuite de `taux_horaire` possible
par ce chemin.

**Vérification approfondie de la RPC `calculer_heures_enseignant`** (utilisée pour calculer les heures, dont
`mon-espace/page.tsx` déduit ensuite un salaire estimé côté client à partir de `taux_horaire` — la RPC elle-même
ne retourne pas de montant, seulement des heures) : la fonction est `security definer` (bypasse RLS en interne)
mais reconstruit elle-même la vérification d'accès dans sa clause `WHERE` (`0005_forfait_multi_etab.sql`) :

```sql
and (
  (p_etablissement_id is not null and a.etablissement_id = p_etablissement_id
    and (p_etablissement_id = current_establishment_id()
         or exists (select 1 from enseignants e where e.id = p_enseignant_id and e.user_id = auth.uid())))
  or (p_etablissement_id is null and a.etablissement_id = current_establishment_id())
  or (p_etablissement_id is null and exists (select 1 from enseignants e where e.id = p_enseignant_id and e.user_id = auth.uid()))
)
```

Test de contournement analysé : un Enseignant A qui appellerait la RPC avec `p_enseignant_id` = l'identifiant de
B échoue sur toutes les branches — la branche "propriétaire" nécessite `current_establishment_id()` non nul
(A n'est pas propriétaire) et la branche "moi-même" exige `enseignants.user_id = auth.uid()` **pour la ligne
`p_enseignant_id` fournie**, ce qui est faux puisque la ligne de B a `user_id = B`, pas `A`. **Aucun
contournement identifié.**

## Résumé

| Vérification | Classement |
|---|---|
| Données personnelles isolées | SÛR |
| Établissements rattachés isolés | SÛR |
| Présences brutes non modifiables par l'enseignant | SÛR |
| Rémunération isolée entre enseignants | SÛR |

**Aucune faille signalée.** Aucune correction requise pour cette section dans la migration 0007.
