# 01 — Dérive de schéma Supabase

Comparaison exhaustive entre : `supabase/schema.sql`, tous les fichiers `supabase/migrations/*.sql`
(0001-0006 + `auth-setup.sql`), les types TypeScript (**aucun fichier de types généré n'existe dans ce
dépôt** — `supabase gen types typescript` n'a jamais été utilisé, confirmé par recherche exhaustive), et
les requêtes réellement exécutées par le code applicatif (`grep` exhaustif de `.from("...")`/`.select("...")`
sur tout `src/`).

**Aucune modification effectuée.** Ce tableau est la source de vérité pour la migration de réconciliation
(`0007_production_security_reconciliation.sql`).

---

## `establishments`

| Colonne | Code attend | Migration contient | Type TS contient | Divergence | Risque | Correction proposée |
|---|---|---|---|---|---|---|
| `id`, `owner_id`, `name`, `slug`, `main_category`, `sub_category`, `description`, `region`, `department`, `city`, `arrondissement`, `neighborhood`, `address`, `latitude`, `longitude`, `phone`, `whatsapp`, `email`, `website`, `logo_url`, `cover_image_url`, `is_verified`, `is_featured`, `accepts_online_payment`, `subscription_plan`, `created_at`, `updated_at` | Oui | `schema.sql` | N/A (aucun type généré) | Aucune | Aucun | — |
| `ownership_type` | Déclarée mais **jamais lue ni écrite par aucune page** | `schema.sql` | N/A | Colonne orpheline (existe en base, inutilisée en code) | Faible — pas un risque de sécurité, mais fausse piste pour quiconque conçoit une policy en pensant qu'elle est exploitée | Documenter comme "réservée" ou l'activer réellement comme critère de filtre (décision produit, hors migration technique) |
| `is_claimed` | Oui — lue dans `src/app/page.tsx` | **[DÉRIVE]** `seed_schools.sql` uniquement, jamais dans une migration versionnée | N/A | Colonne de production non tracée dans les migrations | **Élevé** — aucune garantie que cette colonne existe dans tout environnement recréé depuis ce dépôt seul | Inclure dans la migration 0007 (`ADD COLUMN IF NOT EXISTS`, non destructif) |
| `quartier` | Oui — priorité sur `neighborhood` dans `page.tsx` | **[DÉRIVE]** `seed_schools.sql` uniquement | N/A | Idem | **Élevé** | Idem |
| `couleur_primaire`, `couleur_secondaire`, `emoji_logo` | Oui — identité visuelle des cartes (`page.tsx`) | **[DÉRIVE]** `seed_schools.sql` uniquement | N/A | Idem | **Élevé** | Idem |
| `forfait` | Oui — pilote l'accès au module Pro (middleware) | Migration versionnée `0005_forfait_multi_etab.sql` | N/A | Aucune — c'est la seule colonne dérivée correctement versionnée | Aucun | — |
| `plan_type`, `module_pro_actif` | Mentionnées dans `CLAUDE_CONTEXT.md` comme "à ajouter" | **Absentes de tout le dépôt** | N/A | Concept jamais implémenté ; le concept réel est `forfait` | Aucun risque technique — risque de confusion documentaire uniquement | Ne pas ajouter — aligner la documentation produit sur `forfait` (déjà recommandé dans l'audit précédent) |

## `applications`

| Colonne | Code attend | Migration contient | Divergence | Risque | Correction proposée |
|---|---|---|---|---|---|
| `id`, `parent_id`, `establishment_id`, `student_name`, `student_age`, `student_level`, `parent_name`, `parent_phone`, `parent_email`, `message`, `status`, `created_at` | Partiellement (voir ci-dessous) | `schema.sql` | `student_name`/`student_level` du schéma initial ne sont plus utilisés par `preinscription/page.tsx`, remplacés par les colonnes DÉRIVE ci-dessous | Faible — colonnes probablement encore présentes mais orphelines | Confirmer si `student_name`/`student_level` sont encore alimentées ailleurs ; sinon les documenter comme obsolètes (ne pas supprimer sans confirmation, voir 0007) |
| `student_first_name`, `student_last_name`, `full_student_name` | Oui — `preinscription/page.tsx`, `dashboard/ecole/admissions/page.tsx` | **[DÉRIVE] absentes de toute migration** | Colonnes de production non tracées | **Élevé** | Inclure dans 0007 |
| `desired_level` | Oui — remplace `student_level` | **[DÉRIVE] absente** | Idem | **Élevé** | Inclure dans 0007 |
| `previous_school` | Oui — `dashboard/ecole/admissions/page.tsx` | **[DÉRIVE] absente** | Idem | **Élevé** | Inclure dans 0007 |
| `notes` | Oui — notes internes de l'école sur un dossier (`dashboard/ecole/admissions/page.tsx:70`) | **[DÉRIVE] absente** | Idem — colonne texte libre, contient potentiellement des données sensibles sur un enfant | **Élevé** (schéma) + point de vigilance RGPD/données mineurs à signaler séparément à Eddy | Inclure dans 0007 |
| `parent_id` | Jamais renseigné par `preinscription/page.tsx` (formulaire public sans compte) | `schema.sql` | Cohérent avec l'objectif "sans compte requis", mais rend la policy `Parents can read own applications` inopérante pour ces dossiers | Faible — pas une faille, une fonctionnalité non exploitée | Aucune action requise, documenté pour mémoire |

## `school_announcements`

| Colonne | Code attend | Migration contient | Divergence | Risque | Correction proposée |
|---|---|---|---|---|---|
| `id`, `establishment_id`, `title`, `content`, `published_at`, `created_at` | Oui | `auth-setup.sql` | Aucune | Aucun | — |
| `is_important` | Oui — `dashboard/ecole/annonces/page.tsx` | **[DÉRIVE] absente** | Colonne de production non tracée | **Élevé** | Inclure dans 0007 |
| `class_id` | Oui — `dashboard/ecole/classes/[id]/page.tsx` (annonces liées à une classe) | **[DÉRIVE] absente, aucune contrainte de clé étrangère versionnée vers `classes`** | Colonne structurante (lien vers une classe) sans FK tracée — risque d'intégrité référentielle non garanti par le schéma versionné | **Élevé** | Inclure dans 0007 avec `references classes(id) on delete cascade` |
| `type` | Oui — `announcement`/`homework`/`event`/`reminder` (`dashboard/ecole/classes/[id]/page.tsx`) | **[DÉRIVE] absente, aucune contrainte `check` versionnée** | Valeurs non contraintes en base — n'importe quelle chaîne pourrait être insérée hors du client applicatif actuel | **Moyen** | Inclure dans 0007 avec `check (type in (...))` |

## Tables du module Pro (migrations 0001-0004) — confirmées cohérentes

`enseignants`, `matieres`, `matieres_volume_horaire`, `enseignant_matieres`, `enseignant_disponibilites`,
`contraintes_etablissement`, `creneaux_horaires`, `emplois_du_temps`, `pointages`, `messages` : **aucune
dérive détectée**. Chaque colonne utilisée par le code applicatif (`dashboard/ecole/classes`, `pro/emplois-du-temps`,
`pro/enseignants`, `pro/pointage/*`, `pro/messagerie`, API `timetable/generate`, `enseignants/creer`,
`enseignants/[id]/inviter`, `messagerie/envoyer`) correspond exactement à une colonne créée dans une migration
versionnée (0001 à 0004). C'est la seule zone du schéma sans dérive — cohérent avec le fait que ces tables sont
nées directement en migrations SQL versionnées plutôt que par ajout manuel via SQL Editor.

## `classes`, `school_images`, `school_documents`, `payments`, `profiles`, `fees`, `infrastructures`

- `classes`, `school_images`, `school_documents` : confirmées cohérentes (`auth-setup.sql`), aucune dérive.
- `payments` : déclarée dans `schema.sql`, **aucune requête ne la référence nulle part dans le code
  applicatif**. Vestige ou préparation non exploitée — sans impact sur la production tant qu'elle reste inutilisée.
- `profiles`, `fees`, `infrastructures` : aucune dérive détectée.

---

## Synthèse

| Table | Colonnes en dérive | Gravité |
|---|---|---|
| `establishments` | `is_claimed`, `quartier`, `couleur_primaire`, `couleur_secondaire`, `emoji_logo` | Élevé — 5 colonnes de production non tracées |
| `applications` | `student_first_name`, `student_last_name`, `full_student_name`, `desired_level`, `previous_school`, `notes` | Élevé — 6 colonnes, dont une (`notes`) contenant potentiellement des données sensibles sur des mineurs |
| `school_announcements` | `is_important`, `class_id`, `type` | Élevé — 3 colonnes, dont `class_id` sans FK versionnée et `type` sans contrainte `check` versionnée |

**Total : 14 colonnes de production, réellement utilisées par le code, absentes de toute migration
versionnée.** Toutes sont reprises dans `supabase/migrations/0007_production_security_reconciliation.sql`
(non exécutée) avec des `ADD COLUMN IF NOT EXISTS` strictement non destructifs.
