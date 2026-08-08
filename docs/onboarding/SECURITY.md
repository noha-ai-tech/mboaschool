# SECURITY — Vérification école → Administrateur Principal → dashboard

Phase 8 de la mission : "Aucune école ne peut revendiquer celle d'une autre." Analyse point par point.

## 1. Une demande ne peut être soumise que pour un établissement non revendiqué

Double protection :
- **Application** (`POST /api/claims`) : vérifie `establishment.owner_id === null` avant d'insérer, retourne
  `409` sinon.
- **Base de données** (policy RLS `"requester creates own claim"`, migration 0008) : revérifie indépendamment
  la même condition dans son `with check`, plus l'absence de demande concurrente déjà active. Même si la route
  API était contournée (appel direct à Supabase), l'insertion échouerait.

## 2. Une seule demande active à la fois par établissement

La policy RLS ci-dessus empêche aussi la création d'une deuxième demande `new`/`in_review` pour un
établissement qui en a déjà une en cours — évite que deux personnes revendiquent la même école simultanément et
créent une confusion à l'arrivée en file d'admin.

## 3. Condition de course à l'approbation — le cas le plus dangereux

**Scénario risqué** : deux demandes `A` et `B` existent pour la même école (possible si la première a été créée,
puis refusée, puis une seconde soumise — ou si le garde-fou du point 2 était contourné). Un admin approuve `A`
et, presque simultanément, un second admin approuve `B`.

**Protection** : `POST /api/admin/claims/[id]/approve` revérifie `establishments.owner_id` **au moment même de
l'approbation** (pas seulement à la soumission), et la requête d'écriture elle-même porte un `.is('owner_id',
null)` — si `owner_id` a été renseigné entre la lecture et l'écriture (par l'autre requête concurrente), la mise
à jour ne touche aucune ligne et l'admin voit une erreur explicite plutôt qu'un écrasement silencieux.
**Limite honnête** : ceci réduit la fenêtre de course à la durée d'une requête SQL, ce qui est suffisant pour
un usage normal (deux admins n'agissent jamais à la milliseconde près en pratique), mais ce n'est pas une
garantie transactionnelle stricte au sens d'un `SELECT ... FOR UPDATE` explicite. Une vraie garantie
transactionnelle nécessiterait une fonction Postgres dédiée plutôt que deux requêtes séparées depuis la route
API — amélioration possible si le volume de demandes simultanées le justifie un jour (non nécessaire au lancement).

## 4. Approbation validée → toutes les demandes concurrentes se ferment automatiquement

Dès qu'une demande est acceptée, `approve/route.ts` referme automatiquement toute autre demande `new`/`in_review`
pour le même établissement (`status = 'rejected'`, commentaire automatique explicite) — évite qu'une demande
orpheline reste visible comme "à traiter" pour une école déjà attribuée.

## 5. Isolation des documents justificatifs

Bucket `claim-documents` privé. Policy Storage : le demandeur ne peut lire/écrire que sous le dossier
`{claim_id}/...` d'une demande dont il est `requester_user_id` — un utilisateur ne peut jamais accéder aux
documents d'une demande qui n'est pas la sienne. `platform_admin` peut tout lire (nécessaire pour l'examen des
justificatifs), aucun droit d'écriture accordé à l'admin sur ces fichiers (il ne fait que consulter).

## 6. Autorisation des routes admin — vérifiée à chaque appel, jamais supposée

Les trois routes `/api/admin/claims/[id]/{review,approve,reject}` vérifient, **à chaque requête**,
`profiles.role === 'platform_admin'` pour l'utilisateur de la session en cours, avant toute lecture/écriture
sensible. Aucune route ne fait confiance à un état côté client (pas de "l'utilisateur est sur cette page donc il
doit être admin") — cohérent avec le principe déjà établi dans `docs/00_CURRENT_STATE_AUDIT/04_AUTH_AND_ROLES.md`
("protection de page ≠ garantie sur la mutation").

## 7. Ce qui reste une dépendance externe à cette mission

L'écriture sur `establishments` par les routes admin utilise le client service role parce que la policy RLS
`platform_admin` sur cette table (migration 0007) n'est pas encore exécutée. **Ce choix est délibéré et sûr**
(l'autorisation est vérifiée dans le code de la route avant tout accès service role — voir `API.md`), mais il
signifie que ces routes dépendent de `SUPABASE_SERVICE_ROLE_KEY` étant correctement configurée et jamais exposée
côté client (déjà vérifié comme correct dans l'audit précédent, R-003 : `createAdminClient()` n'est importé que
dans des fichiers serveur dans tout le dépôt, y compris les trois nouvelles routes de cette mission).

## Résumé

| Vérification demandée (Phase 8) | Statut |
|---|---|
| École A ne peut pas revendiquer celle de B | Confirmé — double protection (API + RLS) |
| Pas de double approbation concurrente | Confirmé — revérification atomique + garde-fou requête, limite honnête documentée (point 3) |
| Documents isolés par demande | Confirmé — policy Storage scopée par `claim_id` |
| Autorisation admin vérifiée systématiquement | Confirmé — aucune route ne suppose le rôle |
