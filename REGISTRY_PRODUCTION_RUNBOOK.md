# Registry Production Runbook — Écoles237

Pipeline canonique pour toute promotion du registre national (MINESEC et
sources futures) vers la table publique `establishments`. Créé SPRINT P.6,
après que le batch `minesec-master-v1-promotion-p3` (556 établissements) a
été promu hors de tout script tracé dans ce repo (voir SPRINT P.5,
`scripts/school-registry/reconcile-promotion-p3.ts`, pour la réparation de
traçabilité). Objectif de ce document : qu'une promotion future ne puisse
plus se produire hors de ce chemin.

## PROMOTION PRODUCTION : IRREVERSIBLE / APPROVAL REQUIRED

> Écrire dans `establishments` est une action **irréversible / soumise à
> approbation**, au même titre qu'une migration production, un changement DNS,
> ou un paiement live. Aucun rollback automatique n'existe (voir §11 de
> `promote-master-v1-approved.ts` : le rollback documenté est un filtrage
> manuel par `registry_import_batch`, jamais un `DELETE` scripté). Toute
> exécution `--commit` exige une autorisation humaine explicite d'Eddy et de
> l'architecte, donnée pour un batch précis et un checksum d'approbation
> précis — jamais une autorisation générique réutilisable.

## Les 12 étapes

1. **Collect** — scripts de collecte par source ministérielle (ex.
   `scripts/school-registry/*` de normalisation brute). Écrit des fichiers
   locaux (`data/registry/...`), jamais Supabase.
2. **Normalize** — canonicalise noms/régions/localités/catégories.
3. **Staging** — import dans `establishment_import_staging` (migration
   0006), jamais `establishments`.
4. **Matching** — 4 niveaux (official_id / nom+région+localité confirmée /
   nom+région / flou), jamais de fusion automatique sur correspondance floue.
5. **Review** — Registry Review Center (`/dashboard/admin/registre`),
   décision humaine par ligne ou en masse sur critères objectifs stricts.
   N'écrit que `establishment_import_staging.raw_data._review` — aucune
   écriture `establishments` possible depuis cette page (vérifié SPRINT P.6
   §17 : page 100% client, RLS `platform_admin`, pas de bouton "Promouvoir").
6. **Approval snapshot** — le set exact de lignes `approved_for_promotion`
   au moment de la décision humaine est figé par un
   **checksum SHA256** (`computeApprovalChecksum` dans
   `scripts/school-registry/lib/productionGuard.ts`) sur
   `(staging_id, official_id, decision)` triés. Ce n'est pas un nouvel ID de
   snapshot en base — c'est le mécanisme retenu pour l'architecture actuelle
   (staging existant, pas de table de snapshot dédiée).
7. **Dry-run** — calcule candidats éligibles, produit
   `approval_checksum` + comptage, écrit les rapports CSV/JSON. Aucune
   écriture.
8. **Human authorization** — Eddy + architecte valident le dry-run pour CE
   batch et CE checksum précis, et fournissent explicitement au commit :
   `--commit --confirm="PROMOTE_REGISTRY_TO_PRODUCTION"
   --expected-candidates=N --approval-checksum=<sha256>`.
9. **Production promotion** — `INSERT establishments` par lots (100/lot),
   protégé par `assertRegistryProductionWriteAllowed()`
   (`scripts/school-registry/lib/productionGuard.ts`) : refuse avant toute
   écriture si `--commit` absent, project ref incorrect, phrase de
   confirmation incorrecte, batch inattendu, source inattendue, comptage
   différent du dry-run, ou checksum différent.
10. **Staging reconciliation** — chaque `establishments` créé doit recevoir
    IMMÉDIATEMENT sa ligne staging correspondante :
    `promoted_establishment_id` + `promoted_at` + `status = 'promoted'`.
    Le bug SPRINT P.3 (556 créés, 0 liés, silencieusement) ne doit plus
    jamais se qualifier de succès — voir `evaluatePromotionOutcome()` :
    `createdCount !== stagingLinkedCount` ⇒ `PARTIAL_RECONCILIATION_REQUIRED`,
    jamais `SUCCESS`.
11. **Audit verification** — le script doit produire : `promotion summary`,
    `created IDs`, `failed rows`, `project_ref`, `timestamp`, `source batch`,
    `approval_checksum`. Si le rapport ne peut pas être écrit, la promotion
    DB peut rester techniquement réussie mais le script doit signaler
    `AUDIT INCOMPLETE` et sortir en code non-zéro
    (`verifyPromotionReportComplete()`).
12. **QA public** — recherche (au moins un établissement par région
    concernée), fiches `/ecole/[id]` (nom, région, catégorie, fallback image,
    absence de ville gérée proprement, bouton revendication, aucune
    description inventée), parcours de revendication (sans revendiquer
    réellement), Registry Review Center (KPIs cohérents post-promotion).

## Garde-fou central

`scripts/school-registry/lib/productionGuard.ts` centralise :
- `EXPECTED_PROJECT_REF` (project ref Supabase production, jamais dispersé
  dans chaque script) ;
- `PROMOTION_CONFIRM_PHRASE` (`PROMOTE_REGISTRY_TO_PRODUCTION`) ;
- `assertRegistryProductionWriteAllowed()` — tout script de promotion future
  DOIT l'appeler avant toute écriture `establishments` ;
- `computeApprovalChecksum()`, `verifyPromotionReportComplete()`,
  `evaluatePromotionOutcome()`.

Ce module ne lit jamais de secret et ne fait aucun appel réseau — validation
pure des arguments fournis explicitement par l'appelant. Testé
(`scripts/school-registry/qa-production-guard.ts`) contre : absence de
`--commit`, mauvais project ref, mauvais comptage attendu, checksum
différent, batch non approuvé, phrase de confirmation absente — tous
bloqués avant écriture.

## Idempotence

`unique index uq_establishments_source_ministry_official_id on
public.establishments (source_ministry, official_id) where official_id is
not null` (migration `0018_registry_identity_fields.sql`, déjà appliquée)
empêche la recréation d'un établissement déjà live pour un couple
`(source_ministry, official_id)`. Voir `UNIQUE ID CONSTRAINT ANALYSIS`
ci-dessous.

## Scripts existants — classification

| Script | Étape |
|---|---|
| `import-master-v1-to-staging.ts` | Staging (+ Matching) |
| `classify-and-approve-staging.ts` | Matching, Review (approbation en masse critères objectifs) |
| `promote-batch-002.ts` | Promotion (legacy, gelé §18 P.5/P.6 — écrit directement `establishments`, hors pipeline staging) |
| `promote-master-v1-approved.ts` | Promotion (gelé — `--commit` toujours refusé, batch déjà promu) |
| `reconcile-promotion-p3.ts` | Reconciliation (staging uniquement, jamais `establishments`) |
| `pre-promotion-snapshot.ts` | Lecture seule — comptages avant promotion |
| `investigate-1277.ts` | Lecture seule — investigation ad hoc SPRINT P.5 |
| `qa-production-guard.ts` | Lecture seule — QA du garde-fou, aucun appel réseau |

## Nommage

Aucun script existant ne porte un nom générique dangereux (`run.ts`,
`sync.ts`) — tous nomment explicitement leur action et leur batch/sprint.
Pas de renommage nécessaire ce sprint. Toute future commande npm exposant un
script de promotion production doit porter un nom explicite (ex.
`registry:promote:production`), et rester protégée par
`assertRegistryProductionWriteAllowed()` même si invoquée via `npm run`.
