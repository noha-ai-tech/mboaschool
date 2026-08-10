# 05 — Layout

## Système d'espacement

Grille à 12 paliers, base 4px. Toute marge/padding/gap de l'application doit
utiliser une de ces valeurs — plus aucun espacement "au jugé".

| Token | Valeur | Usage typique |
|---|---|---|
| `space-1` | 4px | Espace entre une icône et son texte |
| `space-2` | 8px | Espace entre éléments très proches (badge + texte) |
| `space-3` | 12px | Padding interne d'un petit composant (Badge, Chip) |
| `space-4` | 16px | Padding d'un Input, gap entre champs de formulaire |
| `space-5` | 20px | Gap entre cartes dans une grille dense |
| `space-6` | 24px | Padding d'une Card desktop, gap de section |
| `space-8` | 32px | Marge entre blocs majeurs d'une page |
| `space-10` | 40px | Marge verticale entre sections de dashboard |
| `space-12` | 48px | Padding d'un Hero, marge de section marketing |
| `space-16` | 64px | Séparation entre grandes sections de page publique |
| `space-20` | 80px | Padding vertical de section marketing (desktop) |
| `space-24` | 96px | Padding vertical d'un Hero pleine page |

Règle : jamais deux valeurs à moins de 4px l'une de l'autre utilisées pour
le même rôle sur deux pages différentes (ex. `padding: 22px` sur une page et
`24px` sur une autre pour la même Card — verrouillé par `space-6`).

## Grille de page

- **Conteneur max** : `1280px` (`max-w-screen-xl`, déjà utilisé sur
  l'accueil — conservé comme référence unique).
- **Conteneur dashboard** : `1152px` (`max-w-6xl`, déjà utilisé sur les
  dashboards Pro/Admin — conservé).
- **Marges latérales** : `space-5` (20px) mobile, `space-6` (24px) tablette,
  auto au-delà du conteneur max sur desktop.
- **Colonnes** : grille 12 colonnes desktop, 4 colonnes tablette, 1 colonne
  mobile (voir `07_RESPONSIVE.md` pour les points de bascule).

## Architecture des dashboards (Phase 6)

### Principe directeur : un cockpit, pas un ERP

Le test de référence pour toute nouvelle vue dashboard : **un directeur
doit comprendre l'état de son école en moins de 5 secondes**, sans lire un
seul mot. Si une information nécessite un paragraphe pour être comprise,
elle n'a pas sa place au premier niveau du dashboard.

Structure commune aux 4 dashboards (Admin, École, Enseignant, Parent) :

```
┌─────────────────────────────────────────────┐
│ Bandeau contexte (qui je suis, où je suis)   │  space-6
├─────────────────────────────────────────────┤
│ Rangée de Metric / StatCard (≤ 4)            │  space-6
├───────────────────────┬───────────────────────┤
│ Widget principal       │ Colonne latérale      │
│ (timeline / liste      │ (Quick Actions +      │
│  prioritaire)          │  ChartCard ou alerte) │
│                        │                       │
└───────────────────────┴───────────────────────┘
```

Jamais plus de **4 StatCard** en première rangée (au-delà, aucune ne
ressort — contradiction directe avec le principe des 5 secondes). Le reste
de l'information est accessible en un clic, pas empilé sur l'écran
d'accueil.

### Dashboard Admin (Platform Operating Center)

- **StatCards** : écoles référencées, demandes en attente, admissions du
  mois, tickets ouverts — les 4 chiffres qui déclenchent une action, pas
  un inventaire complet (les 8 KPI actuels de Mission 08 migrent vers une
  page Statistiques dédiée, déjà existante).
- **Widget principal** : timeline des dernières actions sensibles (fusion
  visuelle du Journal d'audit et des demandes de vérification récentes).
- **Quick Actions** : "Vérifier une école", "Voir les tickets", "Ajouter un
  administrateur" — jamais plus de 3.

### Dashboard École

- **StatCards** : admissions en attente, taux de complétion du profil,
  élèves actifs, prochaine échéance (abonnement ou paie).
- **Widget principal** : liste priorisée ("à traiter aujourd'hui") plutôt
  que la liste chronologique brute actuelle — mélange admissions urgentes +
  tickets + rappels CRM en une seule file triée par urgence.
- **Quick Actions** : "Préinscrire un élève" (lien direct), "Publier une
  annonce", "Voir mon équipe".

### Dashboard Enseignant

- **StatCards** : heures de la semaine, prochain cours, présences du jour,
  dernier bulletin de paie disponible.
- **Widget principal** : timeline de la journée (créneaux + présences),
  pas un tableau — un enseignant consulte son espace entre deux cours,
  souvent sur mobile.
- **Quick Actions** : "Pointer ma présence", "Voir mes classes".

### Dashboard Parent (nouveau — n'existe pas encore dans le produit)

- Actuellement, le suivi parent se limite à `/suivi-admission` (sans
  compte). Ce dashboard est une évolution future documentée pour mémoire
  (voir `10_UI_ROADMAP.md`) : StatCard unique par enfant suivi (statut de
  la demande), timeline des échanges avec l'école, jamais de jargon
  administratif (statuts reformulés en langage parent, pas
  `documents_required` mais "Il manque un document").

## Élévation (référence pour Card/Modal)

| Token | Ombre | Usage |
|---|---|---|
| `elevation-0` | Aucune, bordure `Border` seule | Card au repos |
| `elevation-1` | `0 2px 8px rgba(10,15,13,0.06)` | Card au hover, Dropdown |
| `elevation-2` | `0 8px 24px rgba(10,15,13,0.10)` | Modal, Drawer, Toast |
| `elevation-3` | `0 16px 48px rgba(10,15,13,0.14)` | Élément en cours de drag (réservé, non utilisé actuellement) |

Toutes dérivées de la couleur `Accent` (`#0A0F0D`) à faible opacité plutôt
que d'un noir neutre — cohérent avec `02_COLOR_SYSTEM.md`.
