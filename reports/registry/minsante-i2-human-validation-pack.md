# MINSANTE-I.2 — Dossier de validation documentaire humaine

**Filière concernée :** Imagerie Médicale
**Sprint :** MINSANTE-I.2 (2026-08-21) — documentaire / READ-ONLY, périmètre strictement limité à cette filière
**Statut :** `HUMAN_VALIDATION_REQUIRED` (décision B — voir `minsante-i2-run-summary.json`)
**Aucune écriture en base de données. Aucun import staging. Aucune promotion.**

---

## 1. Source actuelle

- **Titre :** Liste des Écoles de Formation des Personnels Médico-Sanitaires Agréées du MINSANTE — 2025
- **URL :** `https://examen-national-special-minsante.cm/loadfile/L2hvbWUvZXhhbWVuL2NvbmNvdXJzZnJhbWV3b3JrL3N0b3JhZ2UvcGRmL3BhZ2VzL3Jlc3VsdGF0cy9MSVNURV9FQ09MRVNfQUdSRUVTX01JTlNBTlRFXzIwMjUucGRm`
- **SHA256 :** `26e68ab08092faa18e0fdf604e4ee6b93c229180ec9ea1f0d044f6b1a6a3946a` (revérifié fraîchement au démarrage de ce sprint — identique)
- **Autorité :** `PROBABLE_TIER_1` (domaine `examen-national-special-minsante.cm`, pas un sous-domaine direct de `minsante.cm`, mais renvoie explicitement vers `www.minsante.gov.cm` sur ses pages ; aucune page officielle `minsante.cm` republiant ce PDF précis n'a été trouvée à ce jour)
- **Section Imagerie Médicale dans le document :** pages 3-4, découpage exact par index d'item de flux de contenu (borne = item `FILIERE : ...` suivant), pas par page entière

## 2. Ce qui est demandé au MINSANTE

Deux questions distinctes, l'une découlant de l'autre :

### Question A — numérotation absente (défaut connu depuis MINSANTE-I)

> « Pouvez-vous confirmer que la liste 2025 comporte exactement **N** établissements agréés pour la filière Imagerie Médicale, et que cette liste est exhaustive au niveau national ? »

(N = voir §3 ci-dessous — **31 au minimum démontré**, pas 30.)

### Question B — NOUVELLE en I.2 : confirmation d'une fusion de lignes détectée

> « Le document PDF 2025, dans la section Imagerie Médicale / région Ouest, contient à la suite l'une de l'autre, sans saut de ligne suffisant pour les distinguer automatiquement, les deux mentions suivantes : "ÉCOLE DES SCIENCES DE LA SANTÉ DE L'INSTITUT SUPÉRIEUR DE BAFANG" et "ÉCOLE PRIVÉE DE FORMATION DES PERSONNELS DE SANTÉ FONDATION SAINT MAURICE DE BAFOUSSAM". Ces deux établissements figurent chacun séparément et normalement numérotés dans d'autres filières du même document (ex. Infirmiers, rangs 7 et 8, région Ouest). Pouvez-vous confirmer qu'il s'agit bien de DEUX établissements distincts agréés pour Imagerie Médicale (et non d'un seul établissement au nom composé) ? »

Cette seconde question a une réponse déjà **fortement corroborée en interne** (voir §4) mais reste soumise à confirmation humaine par prudence — ce sprint est read-only et ne modifie ni le parseur ni aucune donnée.

## 3. Explication du défaut de numérotation (rappel MINSANTE-I / I.1, inchangé)

Contrairement aux 9 autres filières du même document (désormais toutes `SAFE`), la section Imagerie Médicale ne contient **aucun numéro de ligne peint dans le flux de contenu PDF** — confirmé par analyse native exhaustive (texte, opérateurs `getOperatorList()`, annotations, arbre de structure taggé) : ce n'est pas un artefact d'extraction, c'est un défaut permanent du document source lui-même. Sans numérotation, il est impossible de prouver, à partir du seul document, que la reconstruction est complète — l'heuristique de séparation de lignes (écart Y) qui fonctionne pour les 9 autres filières n'a ici aucune vérité terrain à laquelle se comparer.

## 4. NOUVEAU EN I.2 — Découverte d'une fusion de lignes (défaut distinct et additionnel)

En plus du défaut de numérotation, ce sprint a découvert — par cross-référence **interne** au document pinné lui-même (aucune source externe nécessaire), avec une méthode **générique** (pas de chaîne de caractères câblée en dur) — qu'**une des 30 lignes reconstruites est en réalité la fusion de deux écoles distinctes** :

| | |
|---|---|
| Ligne fusionnée (séquence 29, région Ouest) | `ECOLE DES SCIENCES DE LA SANTE DE L'INSTITUT SUPERIEUR DE BAFANG ECOLE PRIVEE DE FORMATION DES PERSONNELS DE SANTE FONDATION SAINT MAURICE DE BAFOUSSAM` (151 caractères — près du double de la ligne la plus longue par ailleurs dans cette section) |
| École 1 (récupérée) | `ECOLE DES SCIENCES DE LA SANTE DE L'INSTITUT SUPERIEUR DE BAFANG` — vue, seule et complète, dans Analyses Médicales (rang 5), Infirmiers (rang 7), Kinésithérapie (rang 3), Odontostomatologie (rang 1), Sages-femmes/Maïeuticiens (rang 4) |
| École 2 (récupérée) | `ECOLE PRIVEE DE FORMATION DES PERSONNELS DE SANTE FONDATION SAINT MAURICE DE BAFOUSSAM` — vue, seule et complète, dans Infirmiers (rang 8, **immédiatement après** l'école 1 au rang 7, sans lacune de numérotation) |

**Mécanisme technique** (pour information, aucune ligne réelle n'a été modifiée) : le parseur distingue "nouvelle ligne" de "suite d'une ligne enroulée sur 2-3 lignes physiques" par un seuil d'écart Y (13.0pt — entre l'écart de continuation typique ~10.3-10.8pt et l'écart de nouvelle ligne typique ~15pt). Dans cette section précise, deux lignes physiquement séparées entre les deux écoles présentent un écart de continuation (10.3-10.8pt) au lieu de l'écart de nouvelle ligne habituel (~15pt) observé partout ailleurs — invisible sans les 5 autres occurrences numérotées de ces mêmes noms ailleurs dans le document pour trancher.

**Conséquence :** le nombre physique minimum démontré pour Imagerie Médicale est **31**, pas 30. Ce défaut est **distinct** du défaut de numérotation absente et n'avait été détecté ni par MINSANTE-I ni par MINSANTE-I.1 (leur analyse avait testé l'absence de numéro peint, pas le risque de fusion de lignes). Il ne remet pas en cause la fiabilité des 9 filières `SAFE` : celles-ci ont une numérotation source qui aurait révélé une telle fusion par un saut de numéro — c'est précisément l'absence de cette numérotation pour Imagerie Médicale qui a permis à cette fusion de passer inaperçue jusqu'ici.

**Il reste possible que d'autres fusions similaires existent ailleurs dans la section Imagerie Médicale sans avoir produit un nom anormalement long** (donc indétectables par la méthode utilisée ce sprint) — ceci renforce, plutôt qu'il ne diminue, le besoin de validation humaine directe auprès du MINSANTE.

## 5. Les 31 établissements (30 lignes reconstruites, dont 1 fusionnée = 31 physiques)

Répartition par région telle que reconstruite (après séparation de la ligne fusionnée) :

| Région | Écoles Imagerie Médicale |
|---|---|
| Adamaoua | 1 |
| Centre | 15 |
| Est | 1 |
| Extrême-Nord | 1 |
| Littoral | 8 |
| Nord | 1 |
| Nord-Ouest | 0 (confirmé, pas d'omission) |
| Ouest | 4 (3 reconstruites + 1 supplémentaire issue de la séparation de la ligne fusionnée) |
| Sud | 0 (confirmé, pas d'omission) |
| Sud-Ouest | 0 (confirmé, pas d'omission) |
| **Total** | **31** |

Liste complète (ordre d'extraction, région, nom tel qu'imprimé dans le PDF — noms d'établissements uniquement, aucune donnée personnelle) :

1. Adamaoua — ECOLE PRIVEE DE FORMATION DES PROFESSIONNELS DE LA SANTE DE MEIGANGA
2. Centre — CENTRE DE FORMATION DU PERSONNEL PARAMEDICAL (CFPP) DE YAOUNDE
3. Centre — ECOLE DES SCIENCES DE LA SANTE « LE PHENIX » DE SOA
4. Centre — ECOLE PRIVEE DE FORMATION DES PERSONNELS DE SANTE "MBIDA VALERIEN" D'OBALA
5. Centre — ECOLE PRIVEE DE RADIOLOGIE "DORCAS" DE YAOUNDE
6. Centre — ECOLE PRIVEE PARAMEDICALE DE BALAMBA
7. Centre — INSTITUT DE FORMATION DES PERSONNELS DE LA SANTE NAKOMA ACADEMY DE MBALMAYO
8. Centre — INSTITUT DE FORMATION DES PERSONNELS SPECIALISES EN SANTE (IFOPESS) - MFOU
9. Centre — INSTITUT DES SCIENCES DE LA SANTE "SAINT CHRISTOPHE" (ISSSC) D'EBOLMEDZOM - NKOABANG
10. Centre — INSTITUT DES SCIENCES MEDICALES DE YAOUNDE
11. Centre — INSTITUT PANAFRICAIN DE FORMATION PARAMEDICALE (IPAF-PM) DE YAOUNDE
12. Centre — INSTITUT PRIVE DE FORMATION DES PERSONNELS SANITAIRES SAINT JOEL DE YAOUNDE
13. Centre — INSTITUT PRIVE DE FORMATION MEDICO-SANITAIRE AGORA HEALTH LEKIE CENTRE D'ELIG-MFOMO
14. Centre — INSTITUT SUPERIEUR DE TECHNOLOGIE APPLIQUEE DE GESTION (ISTAG) DE YAOUNDE
15. Centre — INSTITUT SUPERIEUR DES SCIENCES DE LA SANTE DE ZALOM-MFOU
16. Centre — INSTITUT SUPERIEUR DES SCIENCES ET DES TECHNOLOGIES ISST LA SAPIENCE
17. Est — INSTITUT PRIVE FANG DE MESSAMENA
18. Extrême-Nord — INSTITUT DE FORMATION EN SANTE DE MAROUA
19. Littoral — COMPLEXE PRIVE DE FORMATION DU PERSONNEL MEDICO-SANITAIRE "ALPHA OMEGA" DE NDOUNGUE
20. Littoral — ECOLE DE FORMATION DES PERSONNELS DE SANTE FONDATION BOBUIN DE DOUALA
21. Littoral — ECOLE INTERNATIONALE PARAMEDICALE DE DOUALA (EPID)
22. Littoral — ECOLE PRIVEE "SANTE SANS FRONTIERE" DE LA SANAGA MARITIME D'EDEA
23. Littoral — ECOLE PRIVEE DE FORMATION DES PERSONNELS SANITAIRES (EFPSA) DE DOUALA
24. Littoral — ECOLE PRIVEE DE FORMATION DES PROFESSIONNELS DE SANTE DE BWANG DOUALA
25. Littoral — ECOLE PRIVEE FONDATION JEUGEUVOU FOWANG DE DOUALA
26. Littoral — INSTITUT DES SCIENCES DE LA SANTE INNOVANTES DE DOUALA
27. Nord — ECOLE DE FORMATION DES PERSONNELS DE SANTE DE GUIDER (EFOPSAG)
28. Ouest — ECOLE DES METIERS DE LA SANTE DE BAMOUGOUM
29a. Ouest — ECOLE DES SCIENCES DE LA SANTE DE L'INSTITUT SUPERIEUR DE BAFANG *(séparée de la ligne fusionnée, §4)*
29b. Ouest — ECOLE PRIVEE DE FORMATION DES PERSONNELS DE SANTE FONDATION SAINT MAURICE DE BAFOUSSAM *(séparée de la ligne fusionnée, §4)*
30. Ouest — INSTITUT DES SCIENCES MEDICO-SANITAIRES LES ARGUS DE BANDJOUN

*(Détail machine-lisible complet, y compris la ligne 29 non séparée telle que reconstruite par le parseur inchangé, dans `reports/registry/minsante-i2-imagerie-validation.json`.)*

## 6. Preuve de complétude recherchée (aucune trouvée ce sprint)

Formes de preuve acceptables (une seule suffit) :

- **A.** Total officiel explicite dans le document + réconciliation des 31 lignes
- **B.** Seconde liste officielle complète contenant exactement la même population
- **C.** Liste officielle régionale complète dont l'agrégation nationale couvre 10/10 régions et réconcilie les 31 lignes
- **D.** Décision/annexe officielle explicitement exhaustive
- **E.** Validation documentaire formelle MINSANTE avec nombre total explicite

**Aucune de ces 5 formes n'a été localisée** après recherche ciblée (variantes : Imagerie Médicale, radiologie, technicien médico-sanitaire, technicien en imagerie médicale, combinées avec MINSANTE/écoles agréées/concours/arrêté/liste écoles — détail complet dans `reports/registry/minsante-i2-source-search.json`). Une décision MINSANTE Tier 1 authentique a été trouvée et examinée (`TIM2022.pdf`, `minsante.cm`) mais s'est avérée être des résultats de concours 2022 sans aucune mention d'Imagerie Médicale — non pertinente.

**Formats de preuve acceptés pour une réponse humaine :**
- Arrêté ou décision MINSANTE signé(e), daté(e) 2025, mentionnant explicitement Imagerie Médicale
- Lettre officielle ou email institutionnel du MINSANTE (DRH ou service compétent)
- Décompte officiel communiqué directement (nombre total, par filière et/ou par région)
- Annexe officielle complémentaire à la liste 2025

## 7. Ce que ce sprint N'A PAS fait

- Aucune écriture en base de données (`establishments`, `establishment_import_staging`, `establishment_registry_identifiers` strictement inchangés)
- Aucun import staging des 30 ou 31 lignes
- Aucune promotion
- Aucune modification du parseur `minsante-a3-pdf-recovery@1` ni d'aucun parseur existant
- Aucune donnée personnelle conservée (0 correspondance PII sur les noms d'établissements, scan automatique)
- Aucun contact institutionnel inventé — ce dossier attend une transmission humaine directe au MINSANTE

---

*Généré automatiquement par `scripts/school-registry/minsante-i2-run.ts` (données factuelles : régions, noms, décompte, corroboration de fusion) — sprint MINSANTE-I.2, 2026-08-21. Push=NO, Deploy=NO.*
