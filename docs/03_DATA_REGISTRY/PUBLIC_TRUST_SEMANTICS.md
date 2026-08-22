# PUBLIC TRUST SEMANTICS

Sprint REGISTRY-NATIONAL-A.1 — Public Trust Semantics Hardening.
Corrige le blocage identifié dans REGISTRY-NATIONAL-A §11.4/§24 (Decision B) :
le badge public « Vérifié » était piloté par un booléen générique
(`establishments.is_verified`) totalement déconnecté du modèle de confiance
registre à 3 dimensions (`presence_confidence`/`identity_confidence`/
`official_verification`).

Ce document est la référence canonique. Toute nouvelle UI/route affichant ou
exposant une information de confiance sur un établissement DOIT s'appuyer sur
`src/lib/trust/resolveEstablishmentTrustState.ts`, jamais réinventer sa
propre règle.

## 1. Les quatre couches, strictement séparées

| Couche | Ce qu'elle signifie | Ce qu'elle NE signifie JAMAIS |
|---|---|---|
| **DIRECTORY PRESENCE** | L'établissement est référencé dans l'annuaire Écoles237 (`establishments`). | Établissement agréé, vérifié, revendiqué, ou contrôlé par son propriétaire. |
| **CLAIM STATUS** | Relation utilisateur/établissement : `UNCLAIMED` / `CLAIM_PENDING` / `CLAIMED`. | Une preuve ministérielle de quoi que ce soit. |
| **PLATFORM VERIFICATION** | Écoles237 a vérifié en interne certains éléments (`is_verified=true`). | « Agréé par le ministère », « officiellement vérifié ». |
| **OFFICIAL VERIFICATION** | Preuve documentaire/administrative provenant d'une autorité compétente, au niveau d'un identifiant de registre précis. | Ne se déduit JAMAIS de `is_verified`, `is_claimed`, `owner_id`, ni de la simple présence d'un `official_id`/`source_ministry` (source *citée*, pas authentifiée). |

**Invariants centraux (non négociables) :**

```
PUBLISHED        != OFFICIALLY_VERIFIED
CLAIMED          != OFFICIALLY_VERIFIED
PLATFORM_VERIFIED != OFFICIALLY_VERIFIED
```

`OFFICIALLY_VERIFIED` ne peut être atteint QUE via une transition
explicitement contrôlée et documentée — aujourd'hui, cela signifie : au moins
un enregistrement `establishment_registry_identifiers` lié avec
`verification_status IN ('CORROBORATED', 'CONFIRMED')`. **Vérifié en direct
sur la production le 2026-08-22 : 0 sur 2242 identifiants de registre ont ce
statut.** Aucun établissement vivant ne peut donc afficher un badge
officiellement vérifié aujourd'hui — c'est le comportement sûr attendu, pas
un bug.

## 2. Stratégie de modèle de données — Option A (aucune migration)

`establishments.is_verified` reste **inchangé côté schéma**. Le code le
réinterprète comme `platform_verification` ; `official_verification` est
calculé séparément à partir de champs déjà existants (migrations 0018/0021,
réellement exécutées en production malgré leur en-tête de fichier disant le
contraire — **toujours vérifier le schéma live, jamais l'en-tête d'un fichier
de migration**) :

- `establishments.official_id` / `establishments.source_ministry` → source
  *citée* → `OFFICIAL_SOURCE_FOUND` au mieux, jamais `OFFICIALLY_VERIFIED`.
- `establishment_registry_identifiers.verification_status` (table
  RLS `platform_admin` uniquement) → seule source possible de
  `OFFICIALLY_VERIFIED`.

Cette option a été retenue car suffisante : aucune preuve n'a été trouvée
qu'un champ dédié supplémentaire sur `establishments` soit nécessaire tant
qu'aucun établissement n'a de preuve officielle réelle en base.

## 3. Le résolveur central

```ts
import { resolveEstablishmentTrustState, getPrimaryPublicBadge, trustInputFromEstablishmentRow } from "@/lib/trust/resolveEstablishmentTrustState";

const state = resolveEstablishmentTrustState(trustInputFromEstablishmentRow(school));
// state.directory_status        -> "LISTED"
// state.claim_status            -> "UNCLAIMED" | "CLAIM_PENDING" | "CLAIMED"
// state.platform_verification   -> "PLATFORM_VERIFIED" | "NOT_PLATFORM_VERIFIED"
// state.official_verification   -> "OFFICIALLY_VERIFIED" | "OFFICIAL_SOURCE_FOUND" | "UNVERIFIED" | "CONFLICTING"
// state.public_badges           -> PublicBadge[] (libellés déjà résolus, jamais un mot nu)

const badge = getPrimaryPublicBadge(state); // { id, label } | null — pour les emplacements compacts (cartes)
```

**Aucun composant UI ni route API ne doit réimplémenter cette logique
localement.** Contexte public (client anon) : `official_verification` ne peut
jamais dépasser `OFFICIAL_SOURCE_FOUND`, faute d'accès à
`establishment_registry_identifiers` (RLS `platform_admin` only) — c'est un
sous-ensemble sûr et conservateur, jamais un badge inventé.

## 4. Politique de badges publics (§7)

| Badge | Libellé affiché | Condition |
|---|---|---|
| `OFFICIALLY_VERIFIED` | « Vérification officielle » | preuve registre `CORROBORATED`/`CONFIRMED` |
| `OFFICIAL_SOURCE_FOUND` | « Source officielle disponible » | `official_id`/`source_ministry` cité, jamais authentifié — jamais utilisé seul comme badge compact primaire |
| `PLATFORM_VERIFIED` | « Vérifié par Écoles237 » | `is_verified=true` |

**Interdit** : afficher le simple mot « Vérifié » sans que l'utilisateur
puisse comprendre qui a vérifié et sur quelle base. Tous les emplacements
publics identifiés (12, voir `reports/registry/registry-national-a1-public-ui-map.csv`)
ont été corrigés ce sprint.

## 5. Frontière admin

L'action admin historique « Vérifier » (`POST /api/admin/ecoles/[id]/verifier`)
ne fait que `verification_status='verified', is_verified=true` — **aucune
vérification ministérielle**. Renommée « Marquer vérifié par Écoles237 »
dans toute l'UI admin. Ne jamais étendre cette action pour qu'elle affecte
`official_verification` sans preuve documentaire réelle au niveau
`establishment_registry_identifiers`.

## 6. Frontière propriétaire (claim flow)

Un propriétaire, via `/api/claims`, ne peut soumettre que :
`first_name, last_name, role_title, phone, email, comments` (+ documents
justificatifs). Le endpoint serveur n'accepte **aucun** autre champ — un
owner ne peut donc jamais définir `official_verification`, fabriquer un
identifiant de registre, définir `source_ministry`, ni écraser une
provenance officielle protégée. Voir
`reports/registry/registry-national-a1-claim-field-policy.json` pour la
classification complète `OWNER_EDITABLE` / `PLATFORM_ONLY` /
`REGISTRY_PROTECTED`.

Effet de bord documenté et **inchangé** ce sprint : l'approbation d'une
revendication par un admin (`POST /api/admin/claims/[id]/approve`) positionne
aussi `is_verified=true` — décision produit historique (Mission 02), jamais
déclenchée par l'owner lui-même. Reste `PLATFORM_VERIFIED` uniquement dans le
résolveur.

## 7. Implications CMS futures

Le futur CMS devra respecter trois classes de champs (détail complet :
`reports/registry/registry-national-a1-cms-readiness.json`) :

- **CONTENT_EDITABLE** : description, photos, site web, présentation.
- **OWNER_EDITABLE_REVIEWABLE** : contacts, adresse, frais, services.
- **REGISTRY_PROTECTED** : `official_id`, `source_ministry`,
  `establishment_registry_identifiers.*`, métadonnées de promotion staging.

**Le CMS ne doit jamais donner à un owner le droit d'auto-valider un
agrément.**
