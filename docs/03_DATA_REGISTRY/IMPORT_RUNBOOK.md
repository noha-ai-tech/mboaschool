# Import Runbook — Répertoire national Écoles237

Procédure d'exécution pour la mission DATA-REGISTRY-01 et les sprints suivants. **Aucune étape de ce document
n'a été exécutée contre l'environnement Supabase réel** — voir §5 pour un état exact de ce qui a et n'a pas
tourné.

---

## 0. Extraction Safety Gate — obligatoire depuis SPRINT R.2-SAFETY (ajouté 2026-08-18)

Ajouté après la clôture de SPRINT R.2-SAFETY et applicable à **tout** import futur, y compris un
premier crawl live MINESEC (§4 ci-dessous, jamais exécuté à ce jour) : aucun batch ne peut
atteindre `establishment_import_staging` sans être passé par le framework d'extraction
déterministe de `scripts/school-registry/lib/extraction/` — voir
[`REGISTRY_EXTRACTION_SAFETY.md`](./REGISTRY_EXTRACTION_SAFETY.md) pour la politique complète.

Concrètement, avant toute écriture staging :

1. Snapshot brut de la source (`writeSourceSnapshot`) — hash SHA256, `source_url`, `fetched_at`.
2. Extraction déterministe (jamais un résumé IA comme mécanisme de comptage exhaustif).
3. Vérification de complétude (`evaluateCompleteness` / `requireExtractionSafe`) — le batch est
   bloqué si le statut n'est pas `PASS` ou `PASS_WITH_EXPLAINED_EXCLUSIONS`.

Ce principe n'a pas encore été appliqué rétroactivement au collecteur MINESEC (`sources/minesec.ts`,
§3-4 ci-dessous) — il prédate ce framework et n'a pas de snapshot SHA256 ni de statut de complétude
formel, bien qu'il ait déjà une logique de pagination par épuisement raisonnable. Voir l'audit des
collecteurs existants dans `REGISTRY_EXTRACTION_SAFETY.md`. Il devra être aligné sur ce gate avant
tout nouveau crawl live à grande échelle.

---

## 1. Prérequis avant toute exécution réelle

1. Validation d'Eddy sur le schéma de staging (`supabase/migrations/0006_national_registry_staging.sql`)
2. Exécution de cette migration via SQL Editor Supabase (conformément à la règle de travail déjà en place —
   voir `CLAUDE_CONTEXT.md`, "Toute modification de schéma Supabase passe par SQL Editor")
3. Confirmation avec le ministère source (MINESEC) qu'une réutilisation de ces données à l'échelle du produit
   Écoles237 est acceptable — recommandation, pas un blocage technique constaté (voir `SOURCE_CATALOG.md`)
4. Vérification de l'accessibilité réseau réelle du site source depuis l'environnement qui exécutera le crawl
   (voir §3, limitation constatée dans cette mission)

## 2. Installer la toolchain (isolée de l'application principale)

```bash
cd scripts/school-registry
npm install
```

Ceci installe `cheerio`, `tsx` et `typescript` **uniquement** dans `scripts/school-registry/node_modules` — ne
touche pas au `package.json` ni au `node_modules` de l'application Next.js.

## 3. Exécuter un import — mode fixture (celui utilisé dans cette mission)

```bash
npx tsx run-import.ts --source=minesec --fixture
```

Ce mode ne fait **aucun appel réseau**. Il lit `fixtures/minesec-sample.html` (3 lignes réelles observées le
2026-08-07 + lignes synthétiques marquées, voir le fichier lui-même) et fait tourner la normalisation et le
dédoublonnage réels sur ces données. Résultats écrits dans `output/minesec-staging-dryrun.json` et
`output/minesec-quality-report.json`.

**Pourquoi un mode fixture plutôt qu'un vrai crawl** : l'environnement d'exécution de cette mission a une
connectivité internet générale fonctionnelle (vérifié : `curl` vers google.com réussit), mais les requêtes
directes vers `minesec.gov.cm` sur la page du répertoire ESG expirent systématiquement après 15 secondes sans
réponse (connexion TLS établie, aucune donnée reçue). L'outil de consultation web de cette session a pu récupérer
le contenu par un autre chemin technique. **Un vrai crawl doit être lancé depuis un environnement qui a été
vérifié comme pouvant atteindre ce site avec un délai d'attente généreux** (`politeFetch.ts` utilise 30s de
timeout par défaut, à ajuster si nécessaire).

## 4. Exécuter un import — mode live (non testé dans cette mission)

```bash
npx tsx run-import.ts --source=minesec
```

Fait de vrais appels réseau vers MINESEC, limités à 2 pages par défaut dans le CLI actuel (garde-fou volontaire
contre un crawl complet accidentel — voir `run-import.ts`, `maxPages: 2`). Pour un crawl complet des ~98 pages
(~1960 enregistrements estimés), ce garde-fou doit être retiré délibérément après validation.

**Non exécuté dans cette mission** — voir la limitation réseau ci-dessus. À valider par Helon ou Eddy depuis un
poste avec un accès réseau confirmé au site avant tout crawl réel.

**Sélecteurs HTML non vérifiés contre le HTML brut réel** — `sources/minesec.ts` utilise une structure de table
Joomla standard (`table tr` / `td`), confirmée dans ses grandes lignes par consultation web, mais jamais testée
contre le HTML brut effectif de la page (l'accès direct ayant échoué). Un premier run live doit être suivi d'une
inspection manuelle du fichier `output/minesec-staging-dryrun.json` produit avant tout usage en aval.

## 5. Résultat du dry-run exécuté dans cette mission

Commande réellement exécutée : `npx tsx run-import.ts --source=minesec --fixture` (2026-08-07).

```json
{
  "source": "Répertoire des Établissements ESG",
  "mode": "fixture",
  "rawCount": 8,
  "normalizedCount": 8,
  "withOfficialIdentifier": 4,
  "withoutOfficialIdentifier": 4,
  "exactDuplicates": 1,
  "potentialDuplicates": 1,
  "rejected": 1,
  "ready": 5,
  "regionsCovered": [],
  "educationFamilyBreakdown": { "secondary_general": 6, "secondary_technical": 1, "teacher_training": 1 },
  "subsystemBreakdown": { "francophone": 7, "bilingual": 1 }
}
```

Rapport complet : `scripts/school-registry/output/minesec-quality-report.json`.
Staging dry-run complet (8 enregistrements, un par ligne de la fixture) : `scripts/school-registry/output/minesec-staging-dryrun.json`.

`regionsCovered` est vide **par construction** — confirme le constat de `FIELD_MAPPING.md` : MINESEC n'expose
pas la région par ligne sur ce listing. Ce n'est pas un bug du dry-run, c'est une limitation réelle de la source
correctement reflétée dans le rapport.

**Ce dry-run valide la logique du pipeline (normalisation, classification, fingerprint, dédoublonnage), pas le
volume ni la fidélité d'un import réel** — 8 lignes dont 5 synthétiques, contre ~1960 lignes réelles estimées
pour un crawl complet.

## 6. Ce qui reste à faire avant un import réel à l'échelle

1. Confirmer l'accessibilité réseau réelle du site MINESEC depuis l'environnement de production/CI
2. Valider les sélecteurs HTML contre le HTML brut réel (voir §4)
3. Décider de la stratégie de capture région/département/arrondissement (itération par filtre, ou acceptation
   d'un import sans cette hiérarchie dans un premier temps) — décision produit, voir section correspondante du
   rapport final de mission
4. Écrire le code d'écriture réelle vers `establishment_import_staging` (actuellement le script écrit un JSON
   local, pas une insertion Supabase — voir `run-import.ts`)
5. Concevoir l'interface ou la procédure de revue humaine des statuts `duplicate_review` avant toute promotion
6. Écrire la logique de promotion staging → `establishments` (non commencée)
7. Répéter les étapes 1 à 6 de `SOURCE_CATALOG.md` pour chacune des 7 autres sources ministérielles

## 7. Limitations connues (résumé)

| Limitation | Détail | Impact |
|---|---|---|
| Accès réseau MINESEC non confirmé depuis cet environnement | Timeout systématique en `curl` direct | Le dry-run tourne sur fixture, pas sur données live |
| Sélecteurs HTML non vérifiés contre le HTML brut | Basés sur une structure Joomla standard déduite | Premier run live à inspecter manuellement avant usage |
| Région/département/arrondissement absents par ligne (MINESEC) | Confirmé structurellement sur le site | Aucun établissement importé de cette source n'aura ces champs remplis sans travail supplémentaire |
| `ownership` à confiance faible | Aucune colonne dédiée sur la source vérifiée | Toute valeur doit être vérifiée manuellement avant promotion |
| Dédoublonnage intra-batch uniquement | Pas de comparaison contre `establishments` existant ni contre des imports précédents | Un import répété créerait des doublons non détectés par la version actuelle |
