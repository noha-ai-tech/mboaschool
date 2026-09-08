# PRO-02 — Options de schéma et recommandation

## 1. Catalogue des responsabilités

### Options

| Option | Extensibilité | Intégrité | RLS/TypeScript | Verdict |
|---|---|---|---|---|
| Enum PostgreSQL | Faible : migration pour chaque ajout | Forte | Simple, mais couplage rigide | Rejeté |
| Texte + CHECK | Faible à moyenne | Forte tant que la liste reste figée | Duplication SQL/TS probable | Rejeté |
| Table de référence | Forte | FK forte | Lecture et types simples | Retenu |
| Hybride | Forte | Forte | Enum seulement pour les scopes structurels | Retenu |

Recommandation : une table globale `responsibility_catalog` avec un `code text` stable comme PK et un libellé. Les codes V1 proposés sont :

- `enseignant`
- `directeur`
- `proviseur`
- `principal`
- `censeur`
- `animateur_pedagogique`
- `responsable_section`
- `responsable_departement`
- `secretaire`
- `comptable`
- `admin_principal`
- `assistant`

La table permet d'ajouter un code sans modifier un enum ni les tables d'attribution. Elle n'est pas un moteur universel de permissions : elle décrit seulement des responsabilités scolaires connues.

## 2. Modèles de scopes comparés

### Modèle A — une table, colonnes de scope explicites

`staff_responsibilities` contient `scope_type`, `section_id nullable` et `department_id nullable`.

Avantages :

- une seule table et une seule API ;
- requêtes simples par membre, école ou code ;
- RLS centralisée ;
- index composites directs ;
- ergonomie TypeScript sous forme d'union discriminée ;
- coût de migration faible.

Risques :

- nécessite une CHECK stricte pour assurer exactement zéro ou une cible ;
- nécessite des FK composites pour empêcher les références inter-écoles ;
- ajouter un quatrième type de scope demandera une migration.

### Modèle B — tables de scopes spécialisées

Une table d'attribution principale, puis `responsibility_section_scopes` et `responsibility_department_scopes`.

Avantages :

- chaque table possède une FK non nullable et une intégrité naturelle ;
- extension vers des scopes multiples par attribution plus directe.

Inconvénients :

- davantage de jointures, policies, grants et types ;
- état incomplet possible entre l'insertion de l'attribution et celle du scope ;
- lecture plus coûteuse et API plus complexe ;
- disproportionné pour trois scopes fermés en V1.

### Recommandation

Retenir le **modèle A**, avec :

- enum structurel fermé `responsibility_scope_type` (`establishment`, `section`, `department`) ;
- CHECK garantissant la cohérence des colonnes ;
- FK composite `(staff_member_id, establishment_id)` ;
- FK composite `(section_id, establishment_id)` ;
- FK composite `(department_id, establishment_id)` ;
- index unique `NULLS NOT DISTINCT` empêchant deux attributions strictement identiques.

Une personne responsable de deux sections possède deux attributions distinctes. Une personne ayant deux fonctions possède deux codes distincts. Une personne travaillant dans deux écoles possède deux `staff_members` et des responsabilités isolées par école.

## 3. Départements disciplinaires

### Options

- A — normaliser maintenant dans `departments`.
- B — utiliser une clé dérivée du texte actuel.
- C — reporter le scope département.

Production contient 0 ligne `matieres` et donc aucune valeur à nettoyer ou backfiller. L'option A est la plus sûre et la moins coûteuse maintenant : ajouter `departments`, puis `matieres.department_id` nullable, sans toucher `departement_disciplinaire`.

Recommandation : **OPTION A — NORMALISATION ADDITIVE, SANS BACKFILL**.

Chaque département appartient à un établissement et possède un code unique dans cette école. La FK composite de `matieres` empêche une matière de School A de pointer vers un département de School B. Les écrans existants continuent de lire le texte historique jusqu'à une phase applicative validée.

## 4. Modèle recommandé

### `staff_members`

Reste la source d'appartenance et du statut professionnel. `role` reste obligatoire en V1 pour compatibilité mais n'accorde aucun droit nouveau. Une contrainte d'unicité sur `(id, etablissement_id)` est ajoutée uniquement pour servir de cible à la FK composite.

Une future migration, précédée d'un audit de doublons, pourra ajouter un index unique partiel `(user_id, etablissement_id) WHERE user_id IS NOT NULL`. Il n'est pas inclus dans la proposition initiale pour ne pas imposer prématurément qu'une personne ne puisse avoir qu'un seul contrat/appartenance dans une école.

### `staff_responsibilities`

- identité : `id` ;
- appartenance : `staff_member_id`, `establishment_id` ;
- responsabilité : `responsibility_code` ;
- scope : `scope_type`, `section_id`, `department_id` ;
- validité : `is_active`, `starts_at`, `ends_at` ;
- traçabilité : `created_by`, `created_at`, `revoked_by`, `revoked_at`, `revocation_reason`, `updated_at`.

Une responsabilité est effective seulement si :

```text
staff_member.status = actif
AND responsibility.is_active
AND responsibility.revoked_at IS NULL
AND starts_at <= current_date
AND (ends_at IS NULL OR ends_at >= current_date)
```

### Auditabilité

`platform_audit_log` est réutilisable : il possède déjà `actor_id`, `action`, `target_type`, `target_id`, `metadata` et `created_at`. La proposition ajoute un trigger dédié, non appelable directement par les rôles API, qui journalise INSERT/UPDATE/DELETE de `staff_responsibilities`. Les colonnes de création/révocation restent sur la ligne pour les requêtes courantes ; le journal conserve l'historique des changements.

## 5. Autorisation

PRO-02 V1 ne crée pas immédiatement `has_responsibility()` et ne modifie pas les 35 policies métier existantes.

Stratégie :

1. RLS des nouvelles tables avec vérifications directes et indexées ;
2. propriétaire de l'école et platform admin gèrent les attributions ;
3. un membre actif lit ses propres attributions ;
4. aucune appartenance d'organisation PRO-01 ne confère un accès scolaire ;
5. une future fonction d'aide sera `SECURITY INVOKER` si les policies sous-jacentes suffisent ;
6. si un `SECURITY DEFINER` devient indispensable pour éviter une récursion RLS, il devra vivre dans un schéma non exposé, fixer `search_path = ''`, vérifier `auth.uid()`, avoir des droits EXECUTE révoqués par défaut et être testé contre les contournements.

## 6. Compatibilité progressive

### Phase 1 — schéma uniquement

- créer catalogue, départements et responsabilités ;
- ajouter `matieres.department_id` nullable ;
- aucun backfill ;
- aucune policy métier existante remplacée.

### Phase 2 — double écriture applicative

- à la création d'un personnel, conserver `staff_members.role` ;
- créer en plus la responsabilité principale de même code lorsque le code historique existe ;
- toute création `teacher` continue de créer/lier `enseignants` ;
- corriger les routes pour recevoir et valider explicitement l'établissement actif.

### Phase 3 — double lecture

- les écrans lisent `staff_responsibilities` ;
- si aucune attribution n'existe, ils affichent encore `staff_members.role` ;
- `teacher` et `establishment_admin` restent utilisés pour les redirections historiques.

### Phase 4 — autorisations par responsabilité

- introduire les checks sur des opérations métier précisément choisies ;
- migrer policy par policy avec tests d'isolation ;
- remplacer la dépendance à `current_establishment_id()` par des vérifications multi-école explicites.

### Phase 5 — dépréciation

- cesser d'utiliser `staff_members.role` comme autorité ;
- conserver la colonne tant que tous les consommateurs ne sont pas migrés ;
- ne retirer aucune valeur globale avant un audit complet des redirections.

Rollback conceptuel : tant que la double lecture est active, désactiver les lectures/écritures de responsabilités dans l'application suffit ; les anciennes colonnes et tables restent intactes.

## 7. Fichiers applicatifs affectés lors d'une future implémentation

### Accès global et établissement actif

- `src/middleware.ts`
- `src/app/auth/callback/route.ts`
- `src/app/auth/connexion/page.tsx`
- `src/app/auth/enseignant-bienvenue/page.tsx`
- `src/app/dashboard/page.tsx`
- `src/lib/supabase/activeEstablishment.ts`

### Personnel et responsabilités

- `src/app/pro/personnel/page.tsx`
- `src/app/pro/personnel/[id]/page.tsx`
- `src/app/pro/personnel/nouveau/page.tsx`
- `src/components/pro/FormulaireNouveauPersonnel.tsx`
- `src/app/api/personnel/creer/route.ts`
- `src/app/api/personnel/[id]/inviter/route.ts`
- `src/app/api/personnel/[id]/code-acces/route.ts`

### Enseignants

- `src/app/pro/enseignants/page.tsx`
- `src/app/pro/enseignants/nouveau/page.tsx`
- `src/components/pro/FormulaireNouvelEnseignant.tsx`
- `src/app/api/enseignants/creer/route.ts`
- `src/app/api/enseignants/[id]/inviter/route.ts`
- `src/app/enseignant/mon-espace/page.tsx`

### Sections, matières et départements

- `src/app/pro/matieres/page.tsx`
- `src/components/pro/GestionMatieres.tsx`
- `src/components/pro/FormulaireMessage.tsx`
- `src/app/pro/messagerie/page.tsx`
- `src/app/api/messagerie/envoyer/route.ts`
- `src/app/pro/emplois-du-temps/page.tsx`
- `src/app/api/timetable/generate/route.ts`
- `src/lib/timetable/types.ts`

### Types

Aucun fichier de types Supabase généré n'existe actuellement dans `src`. Après validation puis exécution future de la migration, générer un fichier dédié avec l'outil Supabase, le committer et remplacer progressivement les types locaux. Ne pas écrire manuellement les types générés avant exécution.
