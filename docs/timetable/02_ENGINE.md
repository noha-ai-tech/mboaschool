# 02 — Moteur (Phases 2, 3, 5, 6, 7, 10)

## Structure pédagogique (Phase 2)

`establishments → annees_scolaires → trimestres → sections (Mission 04) → classes → matieres (via
enseignant_matieres) → enseignants → salles → creneaux_horaires`. Toutes les nouvelles tables sont additives
(migration `0010_timetable_engine.sql`) — la colonne texte `emplois_du_temps.annee_scolaire` existante n'est pas
retirée, `annee_scolaire_id`/`salle_id` s'ajoutent en `nullable`. Le code déjà en production (génération, 4 vues
existantes) fonctionne sans modification même si ces nouveaux champs restent vides.

**Réutilisabilité** : chaque niveau (année scolaire, trimestre, salle) est une table indépendante scopée par
établissement, réutilisable d'une année sur l'autre sans duplication de structure.

## Vues (Phase 3)

| Vue demandée | Statut | Détail |
|---|---|---|
| Établissement | Déjà existante ("Globale") | Non modifiée |
| Enseignant | Déjà existante ("Individuelle") | Non modifiée |
| Classe | Déjà existante ("Par classe") | Non modifiée |
| Matière | **Nouvelle** | Distincte de la vue "Département" déjà existante (qui groupe par département disciplinaire, pas par matière individuelle) |
| Salle | **Nouvelle** | Nécessite que `emplois_du_temps.salle_id` soit renseigné — l'algorithme de génération (`src/lib/timetable/generate.ts`) n'assigne pas encore de salle automatiquement (non modifié, voir `01_ARCHITECTURE.md`) ; l'assignation reste manuelle pour l'instant |

Les 6 vues partagent toutes le même composant d'affichage (`GrilleEmploiDuTemps`, inchangé) — cohérent avec
"toutes les vues utilisent le même moteur".

## Publication (Phase 5) — comportement corrigé

**Avant cette mission** : `POST /api/timetable/generate` supprimait (`DELETE`) l'emploi du temps existant avant
d'insérer le nouveau. **Après cette mission** :

```
Génération → INSERT nouvelles lignes (statut='brouillon', version=N+1, est_actif=false)
                     │
                     ▼ (le brouillon coexiste avec la version publiée, sans la toucher)
Publication (POST /api/timetable/publish)
   1. UPDATE version active existante → est_actif=false, statut='archive'  (JAMAIS supprimée)
   2. UPDATE brouillon le plus récent → est_actif=true, statut='publie', publie_le, publie_par
```

Les 4 vues existantes (+ les 2 nouvelles) filtrent désormais `est_actif = true` — elles n'affichent que la
version publiée, jamais un brouillon en cours de préparation. L'historique complet (toutes les versions
`est_actif = false`) reste interrogeable en base pour un futur écran d'historique (non construit dans cette
mission — la donnée existe, l'interface de consultation de l'historique reste à faire).

**Contraintes d'unicité** : les contraintes `unique (classe, créneau, année)` et `unique (enseignant, créneau,
année)` de la migration 0001 sont remplacées par des **index uniques partiels** (`where est_actif`), ce qui
permet à plusieurs versions historiques du même créneau de coexister sans violer l'unicité — seule la version
active est contrainte à l'unicité.

## Remplacements (Phase 6) — architecture uniquement

Table `remplacements` : `absence_declaree → propose → valide` (ou `refuse`/`annule`), avec traçabilité complète
(`propose_par`, `propose_le`, `valide_par`, `valide_le`). Page `/pro/remplacements` : liste en lecture seule.

**Non construit, volontairement** (conforme à "architecture uniquement") : algorithme de recherche
d'enseignant disponible (nécessiterait de croiser `enseignant_disponibilites`, `enseignant_indisponibilites`,
matières enseignées et charge horaire déjà planifiée — logique non triviale à concevoir avec soin), formulaire
de déclaration d'absence, notification du remplaçant proposé.

## Calcul des heures (Phase 7)

Vue SQL `vue_heures_realisees` (voir migration, section 5) — rapproche `emplois_du_temps` (prévu) et
`pointages` (réalisé) par enseignant + jour de la semaine. Produit : heures prévues, heures effectuées, annulé
(aucun pointage d'arrivée trouvé), retard (arrivée >10 min après le créneau), heures supplémentaires (surplus
au-delà du créneau prévu).

**Limite assumée, documentée honnêtement** : le rapprochement se fait par **jour de la semaine récurrent**
(`extract(dow from ...)`), pas par date calendaire précise — un enseignant qui pointe un mardi est rapproché de
*tous* ses créneaux du mardi, sans distinguer la semaine exacte. C'est cohérent avec le fait que
`emplois_du_temps` lui-même n'a pas de date précise (seulement `jour_semaine` récurrent, migration 0001,
inchangée) — corriger cette limite structurellement nécessiterait de faire évoluer `emplois_du_temps` vers des
séances datées précisément, un changement plus large que le périmètre de cette mission (qui interdit
explicitement de développer notes/élèves/paie, domaines qui bénéficieraient d'une telle précision). Documenté
comme point d'attention avant de brancher cette vue sur un futur moteur de paie réel.

## IA (Phase 10) — préparation uniquement, rien construit

Aucune table, aucune route, aucun code lié à l'IA. Points d'intégration identifiés pour une mission future :

- **Génération automatique** : `src/lib/timetable/generate.ts` a déjà une interface d'entrée/sortie typée
  (`GenerationInput`/`GenerationResult`, `src/lib/timetable/types.ts`) — un algorithme piloté par IA pourrait
  implémenter la même interface sans changer le reste du système (routes, vues).
- **Optimisation** : la vue `vue_heures_realisees` et les contraintes (Phase 4) fournissent déjà les signaux
  (heures manquantes, retards, heures sup) qu'une optimisation future utiliserait.
- **Détection de conflits** : les index uniques partiels (Phase 5) détectent déjà les conflits *au moment de
  l'écriture* — une détection *avant* génération (proactive) reste à construire.
- **Suggestions** : nécessiterait une nouvelle table de suggestions non créée ici, volontairement, pour ne pas
  anticiper un schéma sans besoin fonctionnel validé.
