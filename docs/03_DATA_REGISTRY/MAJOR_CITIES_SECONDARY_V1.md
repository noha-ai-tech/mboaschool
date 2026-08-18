# Major Cities Secondary Completeness V1 — Douala + Yaoundé (en cours)

SPRINT R.2, Mission A. Opérateur : jean-merlain. Ce document couvre l'état
au 2026-08-18 après le pilote Douala + Yaoundé — **pas encore les 24 autres
villes prioritaires**. Voir `SPRINT_R2_SPEC.md` pour la spécification
complète et `MINESEC_V1_STATUS.md` pour le registre MINESEC clos (SPRINT
R.1), non modifié par ce travail.

## Scope de ce document

- Douala et Yaoundé uniquement (Priorité A). Les 24 autres villes
  (Priorité B/C) n'ont pas encore été traitées.
- Mission B (moteur de recherche scalable) non commencée.

## Méthode

1. Audit du registre actuel (`reports/registry/major-cities-current-coverage.csv`,
   §5-9 du spec) — jamais recréé, déjà produit avant l'adoption de cette
   spec.
2. Recherche web ciblée (§17-19) — jamais un scraping aveugle. Sources
   utilisées :
   - Osidimbea — La Mémoire du Cameroun (`memoirelittoral0.jimdofree.com`,
     `memoirecentre0.jimdofree.com`) : archive structurée des établissements
     publics et privés par arrondissement. Extraction complète du HTML brut
     (pas un résumé IA) pour les listes privées laïques, après avoir constaté
     qu'un résumé automatique tronquait fortement les grandes pages (231
     établissements réels à Yaoundé contre ~10 visibles dans un premier
     résumé).
   - InovEdu, ecolesaucameroun.com : corroboration croisée pour certaines
     fiches.
   - Recherche web générale : découverte, jamais suffisante seule (voir
     `INSUFFICIENT_SOURCE` ci-dessous).
   - Toutes ces sources sont **TIER 3** (§16) — discovery uniquement, jamais
     une preuve suffisante pour `CLEAN_APPROVABLE`.
3. Matching (§20-24) contre `establishments` + `establishment_import_staging`
   existants, par clé normalisée (accents/casse/stopwords supprimés) puis
   chevauchement de mots significatifs pour le flou — jamais de fusion
   automatique, toute correspondance floue devient `REVIEW_REQUIRED`.
4. Classification (§32) et import staging (§30-31) des seuls candidats
   `SOURCE_VERIFIED_REVIEW` disposant d'une `source_url` non vide — principe
   absolu de la migration 0006 : aucune ligne de staging sans source
   traçable.

## Résultats

| Ville | Candidats examinés | Déjà live | À réviser | Source vérifiée (staged) | Source insuffisante | Clean approvable |
|---|---|---|---|---|---|---|
| Douala | 78 | 2 | 8 | 55 | 13 | 0 |
| Yaoundé | 292 | 2 | 26 | 252 | 12 | 0 |

**0 candidat `CLEAN_APPROVABLE`** dans ce batch — attendu : aucune source
Tier 1/2 utilisée, donc aucune promotion possible même en théorie (§33). Les
307 candidats stagés restent `status = 'ready'`, en attente de revue humaine
et de corroboration (matricule MINESEC, site officiel, appel téléphonique,
etc.) avant tout passage en `CLEAN_APPROVABLE` dans un batch futur.

## Limitation connue

L'extraction Yaoundé (231 établissements privés laïcs) vient d'une seule
page Osidimbea structurée en tableau HTML — fiable pour l'extraction
automatique. L'extraction Douala (26 établissements) vient d'un menu
déroulant sur la même famille de site — également fiable, et confirmée
complète par recoupement avec un premier résumé indépendant. Les 24 autres
villes prioritaires n'ont pas encore reçu ce traitement — un sous-comptage
similaire (échantillonnage au lieu d'extraction complète) est probable si
la même méthode d'extraction structurée n'est pas appliquée.

## Import staging (2026-08-18)

- Batch : `major-cities-secondary-completeness-v1`
- `source_ministry = 'OTHER'` (jamais MINESEC — §26, aucune de ces sources
  n'est un registre ministériel officiel)
- 307 lignes insérées, `status = 'ready'`
- `establishments` inchangé (1989 avant/après, §74) — aucune promotion,
  aucune écriture live
- `establishment_import_staging` : 1942 → 2249
- Script : `scripts/school-registry/import-major-cities-to-staging.ts`
  (idempotent — fingerprint déterministe `web-discovery:<ville>:<nom>`)

## Fichiers

- `data/registry/normalized/major-cities-secondary-completeness-v1.json` — candidats bruts avec provenance
- `scripts/school-registry/collect-major-cities-secondary.ts` — matching/classification, lecture seule
- `scripts/school-registry/import-major-cities-to-staging.ts` — import staging, idempotent
- `reports/registry/cities/douala-secondary-v1.csv`, `yaounde-secondary-v1.csv`, `major-cities-secondary-v1.csv`
- `reports/registry/major-cities-secondary-v1-summary.json`
- `reports/registry/major-cities-secondary-v1-approval.json` (vide — 0 clean approvable)
- `reports/registry/major-cities-secondary-v1-staging-import.json` (résultat de l'import)
- `src/lib/cameroonMajorCities.ts` — configuration produit (§28), distincte de `scripts/school-registry/lib/majorCities.ts` (outillage registre)

## Prochaine étape

24 villes prioritaires restantes (Priorité B/C). Appliquer la même méthode
— en particulier privilégier l'extraction structurée directe (HTML/tableau/
menu) plutôt qu'un résumé automatique sur les grandes pages source, pour
éviter le sous-comptage constaté sur le premier passage Yaoundé.

Mission B (moteur de recherche scalable, §43-70) non commencée.
