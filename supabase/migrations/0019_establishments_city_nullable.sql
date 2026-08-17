-- ============================================================================
-- 0019_establishments_city_nullable.sql
--
-- PRÉPARÉE MAIS NON EXÉCUTÉE.
-- Fait partie de SPRINT P.2B (registre national — préparation uniquement,
-- ce sprint n'exécute pas 0019). Ne pas exécuter sans validation explicite
-- d'Eddy et de l'architecte, ET sans avoir traité les points listés dans le
-- rapport "CITY NULLABILITY IMPACT" (audit du code applicatif).
--
-- Objectif : rendre `establishments.city` nullable. Aujourd'hui NOT NULL —
-- constaté empiriquement lors de SPRINT O (`promote-batch-002.ts` a dû
-- exclure 84 établissements MINESEC réels faute de localité publiée par la
-- source officielle — voir reports/registry/missing-locality-84.csv,
-- tous classés REGION_ONLY_VALID : région connue, ville absente de la
-- source, pas une erreur de collecte).
--
-- Recommandation SPRINT P.2A §12 : option B (rendre nullable) plutôt que
-- A (garder NOT NULL, bloque des établissements réels) ou C (fabriquer une
-- valeur de repli du type "recopier la région dans city", qui fabriquerait
-- une fausse précision géographique — interdit par la politique anti-
-- fabrication du projet).
--
-- ADDITIF / NON DESTRUCTIF :
--  - Ne touche à aucune ligne existante (aucune des 721 lignes actuelles n'a
--    city = null, cette migration ne fait que retirer une contrainte, elle
--    n'insère ni ne modifie aucune donnée).
--  - Aucun DROP, aucun renommage.
-- ============================================================================

alter table public.establishments
  alter column city drop not null;

comment on column public.establishments.city is
  'Ville/localité. Peut être NULL pour un établissement dont la région est connue mais dont la source officielle ne publie pas de localité précise (ex. registre MINESEC) — voir SPRINT P.2A/P.2B. Ne jamais y écrire une valeur de repli fabriquée (ex. le nom de la région) : NULL doit rester NULL, l''affichage gère l''absence côté application.';

-- ============================================================================
-- FIN — retire une seule contrainte, n'écrit aucune donnée. Rollback trivial :
-- `alter table public.establishments alter column city set not null;`
-- (fonctionnerait tant qu'aucune ligne n'a été insérée avec city = null
-- entre-temps — à vérifier au moment du rollback, pas avant).
-- ============================================================================
