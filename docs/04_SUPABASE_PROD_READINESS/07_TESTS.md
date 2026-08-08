# 07 — Tests de vérification

Aucun test automatisé n'a été exécuté dans cette mission (aucune migration exécutée, aucun environnement de
test disponible). Ce document liste les vérifications manuelles à exécuter **après** validation et exécution de
`0007_production_security_reconciliation.sql` dans un environnement de test (jamais directement en production),
avant toute ouverture à de vraies écoles.

Chaque test précise : compte(s) nécessaire(s), étapes, résultat attendu.

---

## ADMIN

### T-01 — Un `platform_admin` peut modifier une école
1. Se connecter avec un compte `platform_admin`.
2. Aller sur `/dashboard/admin/ecoles/[id]` pour une école dont ce compte n'est PAS `owner_id`.
3. Modifier un champ (ex. cocher "École vérifiée") et enregistrer.
4. **Attendu (après migration 0007)** : le message "Modifications sauvegardées" s'affiche, et le champ est
   effectivement modifié en base (vérifiable en rechargeant la page ou via SQL Editor).
5. **Avant migration 0007 (état actuel)** : attendu que rien ne se passe visiblement, ou une erreur silencieuse
   (voir R-001) — utile pour confirmer que le test capture bien la régression corrigée.

### T-02 — Un utilisateur normal ne peut pas modifier une école qu'il ne possède pas
1. Se connecter avec un compte école ordinaire (rôle `parent`, propriétaire d'une école A).
2. Tenter, via la console navigateur ou un appel direct à l'API Supabase REST, un `UPDATE` sur une école B dont
   ce compte n'est pas propriétaire (ex. `supabase.from('establishments').update({name:'test'}).eq('id', <id_B>)`).
3. **Attendu** : la mise à jour ne modifie aucune ligne (RLS bloque), qu'il s'agisse de l'état actuel ou après
   migration — le nouveau droit accordé est strictement réservé à `platform_admin`, pas élargi aux écoles.

## ÉCOLE A / ÉCOLE B

### T-03 — Isolation lecture
1. Créer ou utiliser deux comptes école A et B, chacun propriétaire d'un établissement distinct.
2. Connecté en tant que A, tenter de lire les candidatures (`applications`) de B via un appel direct
   (`supabase.from('applications').select('*').eq('establishment_id', <id_B>)`).
3. **Attendu** : résultat vide (RLS `"Owners can read establishment applications"` filtre par propriété).

### T-04 — Isolation écriture
1. Connecté en tant que A, tenter une insertion dans `enseignants` avec `etablissement_id = <id_B>`.
2. **Attendu** : échec (policy `enseignants_scope` exige `etablissement_id = current_establishment_id()`, qui
   résout à l'établissement de A, jamais B).

## ENSEIGNANT A / ENSEIGNANT B

### T-05 — Isolation données personnelles
1. Créer ou utiliser deux comptes enseignant A et B (liés à des lignes `enseignants` distinctes).
2. Connecté en tant qu'enseignant A, tenter de lire la ligne `enseignants` de B
   (`supabase.from('enseignants').select('*').eq('id', <id_enseignant_B>)`).
3. **Attendu** : résultat vide.

### T-06 — Isolation présence
1. Connecté en tant qu'enseignant A, tenter de lire les `pointages` de B.
2. **Attendu** : résultat vide (`pointages_self_read` filtre par `enseignant_id in (select id from enseignants
   where user_id = auth.uid())`).
3. Tenter une insertion directe dans `pointages` (n'importe quelle valeur).
4. **Attendu** : échec — aucune policy `INSERT` n'existe pour un enseignant sur cette table (voir
   `04_ISOLATION_ENSEIGNANTS.md` §3).

### T-07 — Isolation rémunération
1. Connecté en tant qu'enseignant A, appeler la RPC `calculer_heures_enseignant` avec `p_enseignant_id =
   <id_enseignant_B>`.
2. **Attendu** : résultat `0` ou vide (voir la vérification de contournement documentée dans
   `04_ISOLATION_ENSEIGNANTS.md`).

## STORAGE

### T-08 — École A ne peut pas remplacer/supprimer les fichiers privés de B
**Nécessite la migration 0007 exécutée** (avant, aucune policy scope-par-dossier n'existe pour ces buckets —
voir `05_STORAGE_AUDIT.md`).
1. Connecté en tant qu'école A, tenter `supabase.storage.from('school-images').remove(['<id_B>/photo.jpg'])`
   pour un fichier réel appartenant à B.
2. **Attendu (après migration)** : échec, aucun fichier supprimé.
3. **Avant migration (état actuel)** : à tester en environnement de test uniquement — si la policy manuelle du
   dashboard correspond au commentaire `auth-setup.sql`, cette suppression réussirait (faille confirmée).

## PUBLIC

### T-09 — L'annuaire reste lisible sans connexion
1. Sans être connecté (navigation privée), charger `/`, `/categorie/primaire`, `/ecole/[id]` pour une école
   existante.
2. **Attendu** : contenu public visible normalement (aucune régression introduite par cette mission — la
   migration ne touche aucune policy `SELECT` publique existante).

### T-10 — La préinscription reste fonctionnelle pour un usage normal
**Nécessite la migration 0007 exécutée.**
1. Soumettre une préinscription valide.
2. **Attendu** : succès (premier envoi, sous le seuil de 3/15 min).
3. Soumettre 3 préinscriptions supplémentaires avec le même numéro de téléphone en moins de 15 minutes.
4. **Attendu** : la 4ᵉ échoue avec le message du trigger `applications_rate_limit`.

---

## Note méthodologique

Ces tests nécessitent un environnement Supabase réel (au minimum un projet de test distinct de la production) et
des comptes de test. Aucun n'a pu être exécuté depuis cet environnement d'audit (pas d'accès à un projet
Supabase). Ils doivent être exécutés par Eddy ou Helon avant toute ouverture publique, idéalement dans un
environnement de staging créé à partir de la migration 0007 validée.
