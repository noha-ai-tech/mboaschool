# Source Catalog — Répertoire national Écoles237

Statut de chaque source ministérielle envisagée par la mission DATA-REGISTRY-01. Aucune de ces sources n'a été
importée en masse ; seul MINESEC a été vérifié et fait l'objet d'un adaptateur fonctionnel testé (voir
`IMPORT_RUNBOOK.md`).

---

## MINESEC — Ministère des Enseignements Secondaires

**Statut : source identifiée et vérifiée, adaptateur fonctionnel (couverture partielle).**

| Aspect | Constat |
|---|---|
| URL | `https://www.minesec.gov.cm/web/index.php/fr/15-pages/350-repertoire-des-etablissements-esg` |
| Nom officiel | Répertoire des Établissements ESG (Enseignement Secondaire Général) |
| Base légale mentionnée | Décision n° 90/11/MINESEC/CAB du 21 mars 2011 ouvrant un Répertoire National des Établissements (RNE) |
| Couverture | **Secondaire général uniquement.** Aucune source MINESEC pour le secondaire technique identifiée à ce stade |
| Colonnes par ligne | Nom Établissement, Localité, Cycles, Sous Système, Matricule |
| Région/Département/Arrondissement | Disponibles comme **critères de filtre**, absents des lignes du tableau — voir `FIELD_MAPPING.md` §2 |
| Pagination | Paramètre `limitstart13`, environ 98 pages au moment de la consultation (2026-08-07) |
| `robots.txt` | **Absent** (404) — aucune restriction déclarée sur l'accès automatisé |
| Mentions légales visibles | "Copyright © 2020 by MINESEC, Tous droits réservés" en pied de page — pas de clause anti-scraping explicite, mais une réutilisation à grande échelle mérite une confirmation directe auprès du ministère avant mise en production (recommandation, pas un blocage technique) |
| **Accessibilité technique depuis cet environnement** | **Timeout systématique** en `curl` direct depuis le sandbox d'exécution de cette mission (connexion TLS établie, puis aucune réponse HTTP reçue après 15s), alors que la connectivité internet générale du sandbox fonctionne (test sur google.com : succès). L'outil de consultation web de cette session (WebFetch) a néanmoins pu récupérer le contenu. **Cause probable : rendu serveur Joomla lourd sur cette page précise (résultats paginés dynamiques), pas un blocage anti-bot actif — à confirmer par un test depuis un réseau différent avant tout crawl réel.** |
| Adaptateur | `scripts/school-registry/sources/minesec.ts` — fonctionnel, testé contre une fixture locale (voir `IMPORT_RUNBOOK.md`). **Les sélecteurs de parsing HTML sont un best-effort basé sur la structure Joomla standard, pas verifiés contre le HTML brut réel** (l'accès direct ayant échoué depuis cet environnement) — à valider avant un premier crawl réel |

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
