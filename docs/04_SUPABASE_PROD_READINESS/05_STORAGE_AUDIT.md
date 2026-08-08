# 05 — Audit Storage

Méthode : recherche exhaustive de `storage.buckets`/`storage.objects`/`storage.from(` dans tout le dépôt
(migrations SQL + code applicatif), lecture des chemins d'upload réels dans le code.

---

## Buckets identifiés

| Bucket | Créé par | Public | Usage |
|---|---|---|---|
| `pointages-photos` | SQL versionné (`0002_presence.sql`, `insert into storage.buckets`) | Non | Photos de pointage enseignant |
| `school-images` | **Jamais créé en SQL** — décrit uniquement en commentaire dans `auth-setup.sql` comme "à créer dans le dashboard Supabase" | Documenté comme public (intention) | Galerie photo des écoles |
| `school-documents` | Idem | Documenté comme public (intention) | Documents des écoles (fiches, règlement, etc.) |

## `pointages-photos` — SÛR

```sql
create policy "pointages_owner_access" on storage.objects
  for all
  using (bucket_id = 'pointages-photos' and (storage.foldername(name))[1] = (current_establishment_id())::text)
  with check (bucket_id = 'pointages-photos' and (storage.foldername(name))[1] = (current_establishment_id())::text);
```

- **Lecture / Upload / Update / Delete** : tous scopés au premier segment du chemin (`{etablissement_id}/...`),
  vérifié contre `current_establishment_id()`. École A ne peut ni lire ni écraser ni supprimer un fichier du
  dossier de B.
- **Taille/type de fichier** : non contraint au niveau policy SQL — le code (`api/pointage/enregistrer/route.ts`)
  force `contentType: "image/jpeg"` à l'upload, mais rien n'empêche un appel direct au bucket avec un fichier
  d'un autre type/une taille arbitraire en dehors de ce chemin applicatif précis (Storage lui-même peut avoir des
  limites globales configurées au niveau projet Supabase — **NON VÉRIFIABLE** depuis ce dépôt).

## `school-images` / `school-documents` — À CORRIGER

**Constat central** : ces deux buckets n'ont **aucune policy SQL versionnée**. La seule trace de leur
configuration prévue est un commentaire dans `auth-setup.sql` (lignes 173-193) :

```
-- Policies Storage (via Dashboard → Storage → Policies) :
--   Pour chaque bucket, créer une policy permettant :
--   - INSERT : pour les utilisateurs authentifiés (auth.uid() is not null)
--   - SELECT : pour tout le monde (true)
--   - DELETE : pour les utilisateurs authentifiés (auth.uid() is not null)
```

**Si cette configuration a été appliquée telle quelle dans le dashboard Supabase (c'est la seule
documentation disponible pour quiconque l'aurait configurée), l'isolation par établissement est ABSENTE au
niveau Storage pour ces deux buckets** : la condition est `auth.uid() is not null`, pas une vérification que le
chemin du fichier appartient à l'établissement de l'utilisateur. Concrètement, cela signifierait que **n'importe
quelle école connectée pourrait supprimer ou écraser les photos/documents de n'importe quelle autre école**,
puisque `DELETE`/`INSERT` ne sont conditionnés qu'à "être authentifié", pas à la propriété du fichier.

**Confirmation que le code applicatif utilise pourtant une convention de chemin exploitable pour une policy
correcte** — vérifié dans `dashboard/ecole/galerie/page.tsx` et `dashboard/ecole/documents/page.tsx` :

```ts
const path = `${school.id}/${Date.now()}.${ext}`;
```

Exactement la même convention `{etablissement_id}/...` que `pointages-photos`. Une policy scope-par-dossier
identique à `pointages_owner_access` (adaptée à `owner_id = auth.uid()` plutôt qu'à
`current_establishment_id()`, ou réutilisant directement `current_establishment_id()` puisque c'est la même
fonction) est directement applicable **sans changement de code applicatif** — seul le chemin d'upload déjà en
place est nécessaire.

**Statut de vérification** : NON VÉRIFIABLE avec certitude que la configuration en production correspond
exactement au commentaire (elle a pu être configurée différemment, mieux ou moins bien, directement dans le
dashboard) — mais c'est la seule documentation existante, et le risque qu'elle décrit fidèlement l'état réel est
suffisamment élevé pour justifier une correction préparée maintenant.

## Policies SQL préparées (NON EXÉCUTÉES)

Incluses dans `0007_production_security_reconciliation.sql` :

1. `insert into storage.buckets (id, name, public) values ('school-images', 'school-images', true) on conflict (id) do nothing;` — et idem pour `school-documents` (garantit que le bucket existe avec les bonnes propriétés, sans écraser une configuration existante grâce à `on conflict do nothing`).
2. Policies scope-par-dossier pour les deux buckets, sur le modèle exact de `pointages_owner_access` :
   - `SELECT` : public (`true`) — cohérent avec l'usage (galerie/documents visibles sur la fiche publique).
   - `INSERT`/`UPDATE`/`DELETE` : réservés au propriétaire de l'établissement correspondant au premier segment
     du chemin (`(storage.foldername(name))[1] = (select id::text from establishments where owner_id = auth.uid())`).

**Point d'attention pour l'exécution réelle** : si les buckets existent déjà en production avec des policies
différentes (configurées manuellement dans le dashboard), les nouvelles policies devront remplacer les
anciennes explicitement (`drop policy if exists ... ; create policy ...`, déjà le pattern utilisé partout
ailleurs dans ce dépôt) — inclus dans la migration proposée. **Cette migration doit être revue par Eddy avant
exécution**, notamment pour confirmer qu'aucune policy manuelle différente n'a été mise en place entre-temps.

## Taille et type de fichier

Aucune limite de taille/type n'est actuellement imposée au niveau des policies Storage SQL pour
`school-images`/`school-documents` (le commentaire `auth-setup.sql` documente des limites prévues — 5 MB
images, 10 MB documents — mais uniquement comme note d'intention pour la configuration dashboard, jamais comme
contrainte SQL exécutable). La migration 0007 n'ajoute pas de contrainte de taille/type (Supabase Storage ne
permet pas cette contrainte via RLS SQL classique — elle se configure au niveau bucket dans le dashboard ou via
l'API Storage) ; recommandation documentée pour configuration manuelle post-migration, hors périmètre SQL.
