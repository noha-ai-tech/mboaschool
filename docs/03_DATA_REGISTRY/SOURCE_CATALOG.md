# Source Catalog — Répertoire national Écoles237

Statut de chaque source ministérielle envisagée par la mission DATA-REGISTRY-01. Aucune de ces sources n'a été
importée en masse ; seul MINESEC a été vérifié et fait l'objet d'un adaptateur fonctionnel testé (voir
`IMPORT_RUNBOOK.md`).

---

## MINESEC — Ministère des Enseignements Secondaires

**Statut : source identifiée, vérifiée ET collectée en réel — SPRINT N, Batch 001 (2026-08-16).**

| Aspect | Constat |
|---|---|
| URL (courante, vérifiée) | `https://www.minesec.gov.cm/web/index.php/fr/carte-scolaire/immatriculation-fr` ("carte scolaire numérique") |
| Ancienne URL cataloguée | `https://www.minesec.gov.cm/web/index.php/fr/15-pages/350-repertoire-des-etablissements-esg` — répond toujours HTTP 200 mais n'a pas été revérifiée depuis la migration vers la carte scolaire numérique ; ne plus utiliser comme référence |
| Nom officiel | Registre National des Établissements (RNE) — "carte scolaire numérique" |
| Base légale mentionnée | Décision n° 90/11/MINESEC/CAB du 21 mars 2011 ouvrant le RNE |
| Couverture | 3 tables Fabrik sur la même page : **ESG** (secondaire général — celle collectée), **ESTP** (technique), **ENI** (écoles normales). Seule ESG a été collectée dans ce batch — voir `IMPORT_RUNBOOK.md` |
| Colonnes par ligne (ESG) | Nom Établissement, Localité, Cycles, Sous Système, Matricule — confirmé par inspection directe du HTML (classes `esg___nom_etablissement_esg`, etc.) |
| Région/Département/Arrondissement | Confirmé : **filtres serveur** (`esg.region_esg`, `esg.departement_esg`, `esg.arrondissement_esg`), absents des colonnes affichées. Le filtre région a été exploité (POST Fabrik) pour ce batch ; département/arrondissement non exploités (reporté à un batch ultérieur) |
| Pagination | Paramètre `limitstart13`, taille de page jusqu'à 100 (`limit13`) |
| `robots.txt` | **Absent** (404), reconfirmé 2026-08-16 |
| Mentions légales | Inchangé — pas de clause anti-scraping explicite |
| **Accessibilité technique** | **Corrigé** : accès réseau direct (`curl`) fonctionnel depuis cet environnement (contrairement à la mission DATA-REGISTRY-01 précédente). 494 lignes ESG collectées en réel pour Centre (345) + Littoral (149), ~6 requêtes au total, délai poli respecté (voir `politeFetch.ts` / `fabrikFilterFetch.ts`) |
| Adaptateur | `scripts/school-registry/sources/minesec.ts` — réécrit pour SPRINT N. Sélecteurs vérifiés contre le HTML réel (plus un best-effort). Ajout de `scripts/school-registry/lib/fabrikFilterFetch.ts` (session + filtre POST Fabrik) |
| Constat qualité notable | Le nom officiel source orthographie parfois "Lycée" sans accent ni "e" final ("Lyce ...") — écart interne à la donnée MINESEC elle-même, pas une erreur d'extraction. Impacte le matching par nom normalisé (corrigé dans `match-batch-001.ts` par une normalisation dédiée) |

---

## MINEDUB — Ministère de l'Éducation de Base

**Statut : source NON identifiée.**

Aucun répertoire national consultable en ligne équivalent à celui de MINESEC n'a été localisé pendant cette
mission. Couvre normalement maternelle et primaire (`education_family = basic`). À rechercher spécifiquement
avant le prochain sprint — possibilité qu'un tel répertoire n'existe pas sous forme numérique publique, auquel
cas une source alternative (ex. annuaires régionaux, données ouvertes) devra être envisagée.

## MINESUP — Ministère de l'Enseignement Supérieur

**Statut : source NON identifiée avec précision.**

MINESUP publie une liste des Institutions Privées d'Enseignement Supérieur (IPES) agréées ; l'existence de cette
liste est connue mais son URL exacte, sa structure et sa fraîcheur n'ont pas été vérifiées dans cette mission.

## MINEFOP — Ministère de l'Emploi et de la Formation Professionnelle

**Statut : source NON identifiée.**

## MINSANTE — Ministère de la Santé Publique

**Statut : source NON identifiée.**

Concerne les écoles de formation en santé (infirmiers, sages-femmes, etc.) — à distinguer des établissements de
santé eux-mêmes (hôpitaux), hors périmètre d'Écoles237.

## MINADER — Ministère de l'Agriculture et du Développement Rural

**Statut : source NON identifiée.**

## MINEPIA — Ministère de l'Élevage, des Pêches et des Industries Animales

**Statut : source NON identifiée.**

## MINFOF — Ministère des Forêts et de la Faune

**Statut : source NON identifiée.**

---

## Méthode de vérification appliquée à MINESEC (reproductible pour les 7 autres sources)

1. Recherche du répertoire officiel (nom, URL, base légale)
2. Vérification de `robots.txt`
3. Vérification des mentions légales de la page consultée
4. Test d'accessibilité technique directe (`curl`) depuis l'environnement d'exécution
5. Consultation de la structure de page (colonnes, pagination, filtres) via un outil de consultation web
6. Documentation explicite de toute limitation constatée avant d'écrire le moindre code d'adaptateur

Les 7 sources restantes n'ont reçu **aucune** de ces étapes dans cette mission — les fichiers
`scripts/school-registry/sources/*.ts` correspondants sont des stubs qui lèvent une erreur explicite plutôt que
de simuler une implémentation.
