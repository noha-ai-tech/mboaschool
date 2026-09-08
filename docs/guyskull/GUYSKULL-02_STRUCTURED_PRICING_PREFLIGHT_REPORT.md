# GUYSKULL-02 STRUCTURED PRICING PREFLIGHT REPORT

Date de revue : 2026-08-30  
Branche : `codex/guyskull-01b-reconciliation`  
Base de compatibilité : `1632f79b1281d0689459ac7c3a6e25f76d9da96e`  
Production consultée en lecture seule : `umcwwynrftidytxgqkwi`  
Écritures production : 0

## CURRENT PRICING MODEL

Existing tables:

- `public.fees` : 7 lignes, une ligne maximum par établissement.
- `public.school_documents` : 0 ligne.
- `school_page_drafts.payload.pricing` : copie brouillon des sept montants plats.

Existing fields:

- `fees` : `registration_fee`, `tuition_fee`, `transport_fee`, `canteen_fee`, `uniform_fee`, `exam_fee`, `other_fees`, `currency`.
- `school_documents` : `name`, `type`, `url`, `storage_path`, `created_at`, avec `establishment_id` historiquement nullable.
- Les ACL production de ces deux tables accordent actuellement tous les privilèges de table à `anon`, `authenticated` et `service_role`; la RLS limite les écritures effectives, mais cette surface est plus large que nécessaire.

Capabilities:

- Inscription, scolarité et cinq montants plats facultatifs.
- Devise, avec `FCFA` par défaut.
- Document téléchargeable rattaché à une école.
- Cycle brouillon/publication déjà utilisé par le CMS pour le payload tarifaire plat.

Limitations:

- Aucun tarif par niveau/classe, aucune année scolaire, tranche, échéance, note ou total structuré.
- Aucun frais de dossier distinct, frais ponctuel structuré, caractère obligatoire/facultatif ni périodicité.
- Aucun statut, visibilité, année scolaire, MIME ou description sur les documents.
- L'ancienne page `/dashboard/ecole/frais` écrivait directement dans `fees`, donc contournait le cycle Brouillon → Publication.

Consommateurs relevés : page publique `/ecole/[id]`, éditeur et aperçu CMS, snapshot live/discard, route de publication, ancienne page de frais, route Documents et pages historiques Documents.

## 29,000 FCFA

Storage:

`fees.tuition_fee = 29000` pour Guyskull (`a4cc4966-0d85-4c63-9c24-0538b8d5133b`).

Known meaning:

Inconnu : ni périodicité, ni niveau, ni année scolaire, ni nature réelle ne sont vérifiés.

Public handling:

- `fees.is_qualified` vaut `false` par défaut après 0037.
- Les montants plats non qualifiés ne sont pas affichés au public.
- L'éditeur affiche exactement `Montant existant à qualifier — 29 000 FCFA`.
- Aucun code spécifique à Guyskull et aucune réinterprétation en « scolarité » ne sont ajoutés.

## PROPOSED MODEL

Fee schedules:

`school_fee_schedules` contient l'école, l'année scolaire, le niveau/classe libre, inscription, scolarité, devise, notes et position. Le total est calculé à l'affichage; il n'est pas stocké et ne peut donc pas diverger.

Installments:

`school_fee_installments` contient le barème parent, le libellé, l'ordre, le montant, l'échéance optionnelle et les notes. Les montants doivent être entiers et non négatifs. La somme des tranches est informative : elle n'est pas imposée égale à la scolarité, car les usages réels peuvent exclure l'inscription ou inclure des arrondis; l'interface ne la présente pas comme un total contractuel.

Additional fees:

`school_additional_fees` contient l'école, l'année, la catégorie, le libellé, le montant, le caractère obligatoire, la fréquence, les notes et la position. Catégories : `application`, `uniform`, `sports_uniform`, `badge`, `supplies`, `insurance`, `ape_parent_contribution`, `exam`, `activity`, `transport`, `canteen`, `boarding`, `other`.

Academic year:

Format `AAAA-AAAA`, avec années consécutives. La validation existe en TypeScript et dans les contraintes SQL.

Currency:

Devise par barème, `FCFA` par défaut. Les frais additionnels utilisent la devise du payload publié.

## LIFECYCLE

Draft:

Le modèle structuré vit dans `school_page_drafts.payload.pricing`. Les brouillons historiques sont normalisés sans mutation : clés plates absentes → `null`, listes structurées → `[]`, qualification historique → `false`.

Preview:

L'aperçu rend directement le payload brouillon avec le même composant que le public.

Publish:

`publish_school_page_v2(uuid,timestamptz)` verrouille et valide le brouillon, vérifie le propriétaire via `auth.uid()`, appelle la publication existante, puis remplace atomiquement les barèmes/tranches/frais publiés. Toute erreur de matérialisation annule aussi les écritures effectuées par la publication existante.

Discard:

Le snapshot live inclut les trois nouvelles tables. La RPC de discard existante reçoit ce snapshot complet et reconstruit le brouillon publié.

Direct owner bypass:

Fermé. `authenticated` n'a aucun DML direct sur les tables tarifaires ni `fees`; l'ancien RPC `publish_school_page` n'est plus exécutable par le client. Seul le RPC v2 est accordé à `authenticated`.

Anonymous read:

Lecture uniquement des tables matérialisées publiées. Le brouillon n'est jamais interrogé par la page publique.

Matrice de sécurité attendue après 0037 :

| Acteur | Brouillon | Publication | Lecture publique | DML tarif direct |
|---|---|---|---|---|
| anon | refusé | refusé | autorisé | refusé |
| propriétaire légitime | sa propre école | autorisée via v2 | autorisée | refusé |
| propriétaire étranger | refusé | refusé | autorisée comme public | refusé |
| authenticated non propriétaire | refusé | refusé | autorisée comme public | refusé |
| service_role | maintenance serveur seulement | RPC v2 refusée | autorisée | maintenance autorisée |
| postgres | maintenance | maintenance | autorisée | autorisée |

## DOCUMENTS

Existing system:

`school_documents` et le bucket `school-documents` sont réutilisés; aucune table parallèle.

Reused:

`name` sert de titre, `type` de catégorie, `url`/`storage_path` de fichier et `establishment_id` de rattachement propriétaire.

Extensions required:

`academic_year`, `mime_type`, `description`, `is_public`, `status`; `establishment_id` devient obligatoire. Tant que le bucket existant reste public, 0037 refuse explicitement tout état privé ou brouillon (`status='live'`, `is_public=true`) et exige que le premier segment de `storage_path` soit l'UUID de l'établissement. Les policies deviennent explicites : propriétaire authentifié en gestion, public uniquement si `status='live' and is_public`.

Download CTA behavior:

Les CTA sont dérivés uniquement de documents live, publics et dotés d'une URL HTTPS valide : fiche d'inscription, tarifs, règlement et brochure. Aucun document valide signifie aucun bouton, sur l'accueil comme dans Admissions.

## CATEGORY UNKNOWN

Rendering:

Version neutre : `Formations`, `Admissions`, `Vie de l'établissement`.

Ministry link:

Aucun lien ni revendication ministérielle n'est inventé quand la catégorie ne correspond pas à une catégorie reconnue.

Results:

Aucun bloc BEPC/Bac n'est ajouté. Seules des données live réellement présentes peuvent être rendues.

Admissions:

Sous-navigation séparée : Formations, Admissions, Tarifs, Pièces à fournir, Documents.

## MIGRATION

0037 required:

YES.

Filename:

`supabase/migrations/0037_school_structured_pricing_documents.sql`

Applied: NO

Rollback ready:

YES — `docs/guyskull/GUYSKULL-0037_ROLLBACK.sql`. Il est destructif pour les nouvelles données structurées et impose donc un export préalable après toute utilisation réelle.

RLS ready:

YES — policies et grants explicites, pas de DML client tarifaire, documents live/public uniquement.

Security matrix ready:

YES.

Préflight/post-check : état initial/final ou refus d'état partiel, dépendances minimales, détection de policies inattendues, ACL RPC, RLS et compteurs `fees`/`school_documents` inchangés. Aucun backfill et aucune DML métier dans la migration.

## CODE

Files changed:

- Modèle/normalisation/snapshot : `src/lib/schoolPage/pricing.ts`, `draftPayload.ts`, `snapshot.ts`, `documents.ts`.
- Rendu : `StructuredPricing.tsx`, `DocumentDownloadCtas.tsx`, `GeneralTab.tsx`, `ParentTab.tsx`, `DocumentsTab.tsx`, `MiniSiteRenderer.tsx`, `SchoolPageSections.tsx`.
- CMS : `StructuredPricingEditor.tsx`, éditeur établissement; ancienne page Frais redirigée vers l'éditeur.
- API : draft, preview, publish v2 et métadonnées Documents.
- Public/Preview : chargement live structuré, filtrage Documents live/public et rendu commun.
- SQL/tests/docs : migration 0037, rollback, tests de compatibilité et tests GUYSKULL-02.

CMS:

Édition par niveau, tranches et frais supplémentaires; qualification explicite des montants historiques; métadonnées Documents.

Preview:

Payload structuré du brouillon, CTA uniquement sur documents publiés.

Public:

Tableau responsive, détail des tranches, frais obligatoires/facultatifs, sous-navigation en cinq sections et montant historique non qualifié masqué.

API:

Validation centralisée, publication via v2, documents re-scopés par école avec métadonnées validées.

## QUALITY

TypeScript:

PASS — `npx tsc --noEmit --incremental false`.

Build:

PASS — `npm run build`, 88 pages statiques générées. Les variables locales existantes ont été injectées sans afficher leurs valeurs; aucune écriture distante.

Tests total:

164.

Passed:

164.

Failed:

0.

Lint ciblé : PASS. `git diff --check` : PASS (avertissements de conversion LF/CRLF uniquement).

## VERDICT

PRICING MODEL COMPLETE: YES

DOCUMENT MODEL COMPLETE: YES

LIFECYCLE SAFE: YES

0037 SAFE TO APPLY: NO — l'architecture et les contrôles statiques sont prêts, mais l'application reste interdite jusqu'à revue architecturale explicite et exécution de ses préflights sur la cible.

SAFE TO POPULATE GUYSKULL AFTER 0037: YES — seulement après application autorisée de 0037 et post-checks réussis; aucune population n'a été faite ici.

STOP.
