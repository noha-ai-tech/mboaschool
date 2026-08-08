# Deduplication Rules — Répertoire national Écoles237

Implémentation : `scripts/school-registry/lib/dedup.ts` et `scripts/school-registry/lib/normalize.ts`
(fonction `computeFingerprint`). Vérifié par exécution réelle contre une fixture — voir `IMPORT_RUNBOOK.md`.

---

## Principe absolu

**Aucune suppression automatique.** Un cas ambigu est toujours marqué pour revue humaine (`duplicate_review`),
jamais résolu silencieusement. Seul un doublon certain (voir §1) est marqué `duplicate_exact` — et même dans ce
cas, l'enregistrement doublon reste en base de staging, il n'est pas effacé : il est simplement exclu de la
promotion vers `establishments`.

---

## 1. Priorité au matricule officiel

Quand un `official_identifier` (matricule MINESEC, ou équivalent d'un autre ministère) est présent, il devient
**seul déterminant** du fingerprint :

```
matricule:<IDENTIFIANT_NORMALISÉ_EN_MAJUSCULES>
```

Deux enregistrements avec le même matricule sont considérés comme un **doublon exact**, quelle que soit la
variation d'orthographe du nom ou de la localisation entre les deux lignes. Constaté en conditions réelles lors
du dry-run : `CES de DANFILI-MAMBAL` et `CES DANFILI MAMBAL` (orthographe différente) partagent le matricule
`2CC1GSFD102414108` → correctement fusionnés en un seul doublon exact.

## 2. Sans matricule — nom normalisé + géographie

Quand aucun matricule n'est disponible, le fingerprint combine :

```
name+geo:<nom_normalisé>|<région_normalisée_ou_"unknown-region">|<arrondissement_ou_localité_normalisé_ou_"unknown-geo">
```

### Normalisation du nom (`normalizeName`)

- Minuscules, accents retirés (NFD + suppression des diacritiques combinants)
- Préfixes de type d'établissement retirés (École, Collège, CES, CETIC, Lycée [Bilingue/Technique/Classique],
  Groupe Scolaire, Complexe Scolaire, Institut...) — liste dans `lib/normalize.ts`, volontairement conservatrice :
  seul le premier préfixe reconnu en début de chaîne est retiré, jamais une correspondance partielle au milieu du nom
- Ponctuation réduite à des espaces, espaces multiples réduits à un seul

Ce nettoyage sert **uniquement** au calcul du fingerprint — le nom brut (`name_raw`) n'est jamais modifié ni
perdu, conformément au principe absolu de traçabilité de la mission.

## 3. Deux niveaux de correspondance

| Niveau | Condition | Statut | Résolution |
|---|---|---|---|
| Doublon exact | Fingerprint strictement identique (donc même matricule, ou même nom normalisé + même géographie) | `duplicate_exact` | Exclu automatiquement de la promotion, mais jamais supprimé de la table de staging |
| Doublon potentiel | Nom normalisé identique, mais fingerprint différent (ex. localité orthographiée différemment, matricule présent d'un côté et absent de l'autre) | `duplicate_review` | **Jamais résolu automatiquement** — nécessite une décision humaine lors de la promotion |
| Pas de correspondance | Fingerprint et nom normalisé tous deux uniques dans le batch | `ready` | Candidat à la promotion, sous réserve de la revue humaine générale |

Vérifié en conditions réelles (dry-run MINESEC, voir `IMPORT_RUNBOOK.md`) : `Lycée de MBAKAOU` (localité
"MBAKAOU") et `Lycee de Mbakaou` (localité "Mbakaou-Centre", sans matricule) partagent le même nom normalisé
(`mbakaou`) mais un fingerprint différent → correctement marqués `duplicate_review`, pas fusionnés
automatiquement.

## 4. Enregistrements rejetés avant dédoublonnage

Un enregistrement sans **aucune** donnée de localisation exploitable (ni région, ni arrondissement, ni localité)
est marqué `rejected` avant même d'entrer dans la logique de dédoublonnage — un tel enregistrement ne peut de
toute façon pas produire un fingerprint géographique fiable. Il reste visible dans le rapport de qualité avec sa
raison de rejet, jamais silencieusement ignoré.

## 5. Ce qui n'est PAS couvert par cette version

- **Dédoublonnage inter-batch** (contre les enregistrements déjà en staging d'un import précédent, ou contre
  `establishments` existant) — la logique actuelle ne dédoublonne qu'à l'intérieur d'un seul batch d'import. La
  colonne `duplicate_of_establishment_id` existe dans le schéma de staging (migration `0006`, non exécutée) pour
  accueillir ce cas, mais aucun code ne la remplit encore.
- **Similarité floue** (distance de Levenshtein, phonétique) — la correspondance actuelle est un nom normalisé
  strictement égal, pas une similarité approximative. Deux noms très proches mais non identiques après
  normalisation (ex. faute de frappe) ne seront pas détectés comme doublons potentiels dans cette version.
- **Score de confiance par champ** — un enregistrement n'a aujourd'hui qu'un statut global, pas une confiance
  distincte pour chaque champ (ex. `ownership` déduit par heuristique faible vs `subsystem` fiable à 100 %).

Ces limites sont documentées volontairement plutôt que masquées — elles définissent le périmètre d'un futur
sprint, pas un défaut caché de celui-ci.
