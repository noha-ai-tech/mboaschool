# GUYSKULL-01C LEGACY DRAFT COMPATIBILITY REPORT

## ROOT CAUSE

Legacy schema: huit domaines (`presentation`, `contact`, `hero_mode`, `pricing`, `infrastructure`, `admissions`, `sections`, `gallery`) et uniquement `presentation.description`.

Current schema: les huit domaines historiques, quatre champs éditoriaux nullable dans `presentation`, plus `key_numbers`, `results` et `ranking`.

Failure mechanism: les lectures transformaient directement le JSONB historique en `SchoolPageDraftPayload`. Le CMS et l'aperçu accédaient ensuite à `key_numbers`, `results` et `ranking` comme s'ils existaient, tandis que la validation courante attendait aussi les quatre champs éditoriaux.

## NORMALIZER

File: `src/lib/schoolPage/draftPayload.ts`

Function: `normalizeSchoolPageDraftPayload(rawPayload)`

Defaults:

- `presentation.motto/history/mission/vision`: `null` ;
- `key_numbers`: `{ founding_year: null, student_count: null, teacher_count: null }` ;
- `results`: `{ remove_ids: [] }` ;
- `ranking`: `null`.

Mutation-free: YES. Le payload est cloné récursivement; aucune valeur existante n'est modifiée et les extensions compatibles inconnues sont conservées à la lecture.

## VALIDATION

Legacy missing fields: NORMALIZED.

Malformed key_numbers: REJECTED.

Malformed results: REJECTED.

Malformed ranking: REJECTED, notamment tout classement partiel.

La validation PATCH complète existante reste appliquée après normalisation; elle n'a pas été assouplie.

## GUYSKULL READ-ONLY

CMS: PASS. Le chemin GET central normalise avant la réponse; le build du CMS et le test du payload Guyskull capturé passent sans accès `undefined`.

Preview: PASS. La route d'aperçu utilise le même normalizer avant tout accès au contrat courant.

Production draft modified: NO. Contrôle avant/après : `payload_md5 = 1f55e8d1e33c0cd147d45a0087077ad8`, `updated_at = 2026-08-28 18:00:06.4108+00`.

Normalized key_numbers: `{ founding_year: null, student_count: null, teacher_count: null }`.

Normalized results: `{ remove_ids: [] }`.

Normalized ranking: `null`.

## CURRENT FORMAT REGRESSION

Current drafts: PASS; un brouillon production actuel a été contrôlé en lecture seule et le test automatisé vérifie l'identité sémantique complète.

Preview: PASS.

Publish preparation: PASS; la préparation utilise le normalizer central et conserve les domaines historiques.

Results: PRESERVED.

Ranking: PRESERVED.

Key numbers: PRESERVED.

## QUALITY

TypeScript: PASS (`npx tsc --noEmit`).

Build: PASS (`npm run build`).

Tests total: 141.

Passed: 141.

Failed: 0.

Targeted lint: PASS.

## DATABASE

Migration: NONE.

Production writes: 0.

0035/0036 touched: NO.

## GIT

Branch: `codex/guyskull-01b-reconciliation` (canonical PUBLIC-SITE base `15b8f47`).

Commit: `fix(cms): normalize legacy school page draft payloads`.

Files changed: central contract/normalizer, three server routes, targeted tests and this report.

## VERDICT

LEGACY DRAFT COMPATIBILITY FIXED: YES

CURRENT DRAFTS PRESERVED: YES

GUYSKULL CMS SAFE: YES

GUYSKULL PREVIEW SAFE: YES

DATABASE UNCHANGED: YES

SAFE TO DESIGN 0037: YES

READY FOR GUYSKULL-02: YES
