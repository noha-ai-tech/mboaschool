# 03 — Moteur de paie (Phases 4, 5, 6, 7, 9)

## Calcul des heures (Phase 4)

| Élément | Source | Configurable |
|---|---|---|
| Heures prévues | `emplois_du_temps` (approximation : occurrences du jour de semaine × durée du créneau sur la période — voir limite déjà documentée `docs/timetable/02_ENGINE.md`, Mission 05) | Non (dépend de la structure de l'emploi du temps) |
| Heures réalisées | RPC `calculer_heures_enseignant` (existante, inchangée) | Non |
| Heures supplémentaires | `max(0, heuresEffectuees - heuresPrevues)` | Multiplicateur de valorisation configurable (`payroll_config.taux_heure_sup_multiplicateur`) |
| Retards | `vue_heures_realisees.en_retard` (Mission 05) | Seuil configurable (`payroll_config.seuil_retard_minutes`) — **remplace le seuil codé en dur de la migration 0010** |
| Absences | `absences` (cette mission) | Non reliées automatiquement au calcul (voir `02_ATTENDANCE.md`) |
| Heures non rémunérées | **Non implémenté** — nécessiterait de croiser `absences` non justifiées avec les heures prévues correspondantes ; laissé à une saisie manuelle de retenue pour cette version |

## Contrats (Phase 5)

`staff_contracts` (Mission 04) couvre déjà : type (temps plein/partiel/vacataire), salaire, taux horaire, volume
hebdomadaire, dates. **Primes et retenues ne sont pas des colonnes du contrat** — modélisées comme des tables
indépendantes (`primes`, `retenues`) liées au membre du personnel et à une période, pas au contrat lui-même :
une prime exceptionnelle ou une retenue ponctuelle n'a pas besoin d'un nouveau contrat pour exister. Catalogue
configurable (`types_primes`, `types_retenues`) plutôt que des libellés en texte libre non structurés.

## Moteur de paie (Phase 6)

**Architecture** : fonction pure `calculerBulletin()` (`src/lib/payroll/calculate.ts`), sans accès réseau ni
base — mêmes principes que `genererEmploiDuTemps()` (Mission 05). Entrées : contrat, heures, primes, retenues,
configuration. Sortie : salaire de base, montant heures sup, total primes, total retenues, salaire brut, salaire
net, détail ligne par ligne, avertissements explicites (voir ci-dessous).

**Règles de calcul assumées** (voir commentaires en tête de `calculate.ts` pour le détail complet) :
1. Contrat à salaire fixe → salaire de base versé intégralement, indépendamment des heures effectuées.
2. Contrat à taux horaire (vacataire) → salaire de base = heures effectuées × taux horaire.
3. Heures supplémentaires toujours valorisées en plus, au taux horaire connu ou dérivé.
4. Primes et retenues sommées sans plafonnement automatique.

Chaque simplification produit un **avertissement explicite** dans le résultat (`avertissements: string[]`) —
jamais une valeur silencieusement approximative sans trace. Un salaire net négatif déclenche également un
avertissement (à vérifier avant validation, pas bloqué automatiquement — la décision reste humaine).

**Aucune intégration de paiement bancaire** — le moteur calcule et historise des montants, il ne les transfère
jamais (Phase 6, exclusion explicite). `bulletins_paie` n'a aucune colonne de référence de virement/mobile
money.

## Validation (Phase 7)

Workflow implémenté exactement comme demandé : `brouillon → valide_rh → valide_direction → paie_validee`, avec
`paie_validee` déclenchant immédiatement la visibilité du bulletin pour l'enseignant concerné (policy
`bulletins_self_read`, migration 0011). Chaque transition est historisée dans `bulletin_paie_historique` (jamais
de changement de statut silencieux).

**Limite assumée sur les rôles** : "Validation RH" et "Validation Direction" sont deux **étapes** du workflow,
historisées séparément, mais accessibles à la **même** frontière d'accès technique (propriétaire de
l'établissement) — aucune séparation de permissions par `staff_role` (`comptable` vs `directeur`) n'est
appliquée en RLS, cohérent avec la limite déjà documentée dans `docs/pro/03_ROLES.md` (Mission 04). Voir
`04_SECURITY.md`.

## Exports (Phase 9)

| Format | Statut |
|---|---|
| CSV | **Implémenté** — `GET /api/payroll/[id]/export`, génération de chaîne CSV pure (aucune dépendance ajoutée), protégé par RLS (le demandeur ne peut exporter que ce qu'il a le droit de lire) |
| PDF | **Non implémenté** — nécessiterait une bibliothèque de génération PDF (ex. `@react-pdf/renderer`, `pdfkit`), volontairement non ajoutée au projet principal dans cette mission (décision de ne pas introduire de nouvelle dépendance de production sans validation). Les données sont déjà structurées (`bulletins_paie` + `bulletin_paie_lignes`) pour qu'un futur export PDF reste une simple couche de présentation, sans nouveau calcul |
| Excel | **Non implémenté** — même raisonnement (nécessiterait `exceljs` ou équivalent). Le CSV déjà produit s'ouvre nativement dans Excel/Google Sheets, ce qui couvre une partie du besoin en attendant |

**Aucun logiciel comptable externe connecté** (Phase 9, exclusion explicite) — aucun webhook, aucune
intégration API sortante vers un tiers.
