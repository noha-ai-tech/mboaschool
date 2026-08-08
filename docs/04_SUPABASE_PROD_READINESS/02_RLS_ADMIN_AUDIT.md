# 02 — Audit RLS `platform_admin` sur `establishments`

Méthode : recherche exhaustive de toute policy RLS mentionnant `establishments` dans `supabase/schema.sql` et
les six fichiers `supabase/migrations/*.sql`. Recherche exhaustive de toute vérification de rôle `platform_admin`
dans `src/`. **Une protection middleware ou frontend n'est jamais comptée comme une policy de base de données**
— seule une `create policy` réelle sur `establishments` compte ici.

---

## Policies RLS réellement trouvées sur `establishments`

Source : `supabase/schema.sql`, lignes 121-143. C'est la **seule** source qui définit des policies sur cette
table dans tout le dépôt — aucune migration ultérieure n'en ajoute.

```sql
create policy "Public can read establishments" on public.establishments for select using (true);
create policy "Owners can insert establishments" on public.establishments for insert with check (auth.uid() = owner_id);
create policy "Owners can update own establishments" on public.establishments for update using (auth.uid() = owner_id);
```

## Confirmation par opération, pour `platform_admin`

| Opération | Policy couvrant `platform_admin` | Statut |
|---|---|---|
| **SELECT** | `"Public can read establishments"` (`using (true)`) | **Couvert** — mais par la policy publique, pas par une policy spécifique à `platform_admin`. Un admin voit les écoles pour la même raison que n'importe quel visiteur anonyme. |
| **INSERT** | Aucune | **NON COUVERT** — seule `"Owners can insert establishments"` existe (`auth.uid() = owner_id`). Un `platform_admin` qui n'est propriétaire d'aucun établissement ne peut insérer aucune ligne. Le bouton "Ajouter" de `dashboard/admin/page.tsx` n'a d'ailleurs aucun `onClick` (déjà documenté dans l'audit précédent) — cohérent avec l'absence de policy : la fonctionnalité n'a jamais été câblée, probablement précisément parce que cette policy manque. |
| **UPDATE** | Aucune | **NON COUVERT** — seule `"Owners can update own establishments"` existe (`auth.uid() = owner_id`). C'est le point déjà identifié comme R-001 dans l'audit précédent (`docs/00_CURRENT_STATE_AUDIT/06_SECURITY_AUDIT.md`), reconfirmé ici par relecture exhaustive de **tous** les fichiers SQL du dépôt, pas seulement `schema.sql`. |
| **DELETE** | Aucune | **NON COUVERT** — aucune policy `DELETE` n'existe pour quiconque sur `establishments`, y compris les propriétaires eux-mêmes. Aucune fonctionnalité de suppression d'établissement n'a été identifiée dans le code (cohérent). |

## Ce que ça signifie concrètement

`src/app/dashboard/admin/ecoles/[id]/page.tsx` (le formulaire d'édition d'école dans l'admin) exécute :

```ts
const { error } = await supabase.from("establishments").update(form).eq("id", id);
```

avec le **client anonyme** (pas le client service role). Le middleware garantit qu'un `platform_admin` seul
atteint cette page — mais RLS, pas le middleware, gouverne si l'`UPDATE` réussit réellement en base. Avec
uniquement la policy `owner_id = auth.uid()` trouvée, cette mutation **échoue silencieusement pour tout admin
qui n'est pas propriétaire de l'école qu'il édite** — ce qui est le cas de tous les admins de plateforme par
construction (un `platform_admin` n'est pas censé être `owner_id` d'une école tierce).

## Classement

**NON COUVERT — bloquant pour la fonctionnalité admin la plus importante du produit.**

## Policies SQL préparées (NON EXÉCUTÉES)

Incluses dans `supabase/migrations/0007_production_security_reconciliation.sql`, section RLS admin :

- Une policy `UPDATE` explicite pour `platform_admin` sur `establishments`, vérifiant le rôle via `profiles.role`.
- Un `INSERT` volontairement **non ajouté** : aucun flux applicatif ne l'utilise aujourd'hui (le bouton "Ajouter"
  n'a pas de logique), l'ajouter sans un flux applicatif réel serait une policy orpheline. Recommandation :
  construire le flux "Ajouter une école" avant d'ouvrir ce droit, pas l'inverse.
- Un `DELETE` volontairement **non ajouté** pour la même raison — aucune fonctionnalité de suppression
  n'existe, et la suppression d'un établissement est une opération suffisamment sensible pour mériter sa propre
  décision produit (que faire des candidatures, classes, enseignants rattachés ?) avant d'ouvrir ce droit en RLS.

Voir `07_MIGRATION_NOTES.md` pour le texte SQL exact proposé.
