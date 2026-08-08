# 02 — Présence (Phases 2, 3)

## Pointage (Phase 2)

**La V1 demandée ("Code personnel sécurisé") est déjà entièrement satisfaite par l'existant** — `pointages`
(migration `0002_presence.sql`), mode kiosque (`/pro/pointage/kiosque`), identification par `code_pointage` (4
chiffres, unique par établissement). **Rien n'a été construit ni modifié pour cette phase.**

### Méthodes futures — préparation documentaire uniquement

| Méthode | Statut |
|---|---|
| Code PIN | Déjà en production (`code_pointage`) |
| QR Code | Non construit — pourrait réutiliser le même point d'entrée `/api/pointage/enregistrer` avec un `code_pointage` encodé dans le QR plutôt que saisi manuellement ; aucun changement de schéma nécessaire pour cette évolution |
| Application mobile | Non construite — nécessiterait une application native ou PWA distincte, hors périmètre technique de ce dépôt Next.js web |
| Badge NFC | Non construit — nécessiterait un lecteur matériel et un identifiant NFC par personne (nouvelle colonne sur `enseignants`/`staff_members`), non ajouté |
| Reconnaissance faciale | Non construite — nécessiterait un service de reconnaissance tiers, hors périmètre et sensible (données biométriques) ; à ne pas construire sans cadrage RGPD/légal explicite du fondateur |

## Présences (Phase 3)

| Élément demandé | Statut |
|---|---|
| Arrivée / Départ | Terminé — `pointages.type` (`arrivee`/`depart`, migration 0002) |
| Retard | Terminé — `vue_heures_realisees.en_retard` (Mission 05), seuil désormais **configurable** (`payroll_config.seuil_retard_minutes`, cette mission — remplace le seuil de 10 minutes codé en dur) |
| Absence | **Nouveau** — table `absences`, `type = 'absence'` |
| Congé | **Nouveau** — même table, `type = 'conge'` |
| Mission | **Nouveau** — même table, `type = 'mission'` |
| Justification | **Nouveau** — `absences.motif` (texte) + `absences.justification_document_path` (fichier, réutilise le pattern de bucket privé déjà validé pour `staff-documents`/`claim-documents`, pas un nouveau bucket créé dans cette migration — voir note ci-dessous) |
| Historique | Terminé pour les pointages (table append-only) ; nouveau pour les absences (`absences.statut` : `declaree`/`justifiee`/`refusee`, sans suppression) |

### Note sur le stockage des justificatifs

`absences.justification_document_path` est une colonne texte préparée pour accueillir un chemin de fichier — **aucun
bucket Storage dédié ni policy associée n'a été ajouté dans cette migration** (contrairement à `staff-documents`,
Mission 04). Un justificatif d'absence pourrait être uploadé vers le bucket `staff-documents` déjà existant (le
membre du personnel concerné y a déjà les droits nécessaires) sans nouvelle policy — choix laissé à
l'implémentation de l'interface d'upload, non construite dans cette mission (le formulaire actuel,
`FormulaireAbsence`, ne gère que les métadonnées texte, pas l'upload d'un fichier).

## Page construite

`/pro/absences` — déclaration (formulaire simple : personnel, type, dates, motif) et liste. Alimente directement
le moteur de paie (Phase 4/6) — voir `03_PAYROLL_ENGINE.md` pour la façon dont les absences influencent (ou non,
dans cette première version) le calcul.

**Limite assumée** : le moteur de calcul de paie (`src/lib/payroll/calculate.ts`) ne lit **pas encore**
`absences` — il se base uniquement sur `vue_heures_realisees` (prévu vs pointé). Une absence déclarée et
justifiée n'ajuste donc pas automatiquement le salaire de base aujourd'hui ; elle doit être traduite
manuellement en retenue si nécessaire (voir `03_PAYROLL_ENGINE.md` §"Ce que le moteur ne fait pas encore").
Documenté honnêtement plutôt que masqué.
