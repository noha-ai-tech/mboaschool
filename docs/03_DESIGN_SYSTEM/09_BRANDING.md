# 09 — Branding & Design Language

## Logos officiels

Trois fichiers, et seulement trois, constituent désormais l'identité de
marque (Mission "Branding Final V1") :

| Fichier | Usage exclusif |
|---|---|
| `public/branding/logo-light.png` | Toute surface claire (Background/Surface) — variant par défaut du composant `Logo` |
| `public/branding/logo-dark.png` | Toute surface sombre (Accent) — sidebars, header Pro/Enseignant, footer, panneau gauche connexion |
| `public/branding/favicon.png` | Onglet navigateur, `manifest.webmanifest`, icônes Apple Touch — jamais affiché en grand format dans une page |

Aucun autre logo n'existe. Les anciens pictogrammes codés en dur (blocs de
couleur + icône `School` de lucide-react) ont été entièrement retirés du
dépôt lors des missions de branding précédentes — ce document n'autorise
aucune réapparition de cette pratique.

### Règles d'usage du logo

- Toujours via le composant `Logo` (`variant`/`size`/`priority`/
  `className`) — jamais un import direct de fichier image en dehors de ce
  composant (règle déjà en vigueur, reconduite ici comme référence
  permanente).
- Espace de respiration minimum autour du logo : `space-3` (12px) sur tous
  les côtés — jamais collé à un bord d'écran ou à un autre élément.
- Ne jamais recolorer, faire pivoter, étirer disproportionnellement ou
  ajouter un effet (ombre portée, contour) au logo — les deux fichiers
  fournis couvrent déjà les deux contextes (clair/sombre).
- Taille minimale lisible : `sm` (voir `04_COMPONENTS.md` échelle Logo) —
  en dessous, utiliser le favicon seul plutôt que de réduire le logo
  horizontal jusqu'à l'illisibilité.

## Icônes

**Lucide** (déjà la seule librairie d'icônes utilisée dans tout le dépôt)
reste la référence officielle — cohérence totale déjà acquise, aucune
seconde librairie ne doit être introduite (évite le mélange de styles de
traits qui trahirait immédiatement un manque de rigueur visuelle).

- Épaisseur de trait : `1.5` par défaut (`strokeWidth`), `2` uniquement
  pour les icônes de très petite taille (≤ 14px) où un trait plus fin
  devient difficile à percevoir.
- Tailles standard : `12 / 14 / 16 / 18 / 20 / 24px` — jamais une taille
  arbitraire hors de cette échelle.
- Couleur : toujours héritée du texte environnant (`currentColor`) sauf
  usage sémantique explicite (icône Danger en rouge, par exemple).

## Illustrations

Aucune illustration custom n'existe actuellement dans le produit. Si des
illustrations sont introduites (états vides, onboarding), elles doivent :
- Utiliser exclusivement la palette officielle (`02_COLOR_SYSTEM.md`) —
  jamais une illustration stock avec des couleurs hors-marque.
- Rester géométriques/épurées (cohérent avec le logo lui-même), jamais
  photo-réalistes ou en dégradé complexe.
- Être un luxe, jamais une nécessité fonctionnelle — un état vide reste
  compréhensible sans elles (voir ci-dessous).

## États d'interface (empty / loading / success / error)

### Empty state
Icône Lucide 32px dans un cercle `Muted`, message court en Text Secondary
("Aucun établissement trouvé"), action de récupération si pertinente
("Ajouter un établissement") — jamais un simple texte seul sans structure
visuelle, jamais une illustration disproportionnée par rapport à
l'importance réelle de l'écran.

### Loading
`Skeleton` (voir `04_COMPONENTS.md`) pour tout contenu dont la structure
finale est connue à l'avance (liste, carte, tableau). Spinner (16-20px,
Primary) réservé aux actions ponctuelles courtes (soumission de formulaire,
bouton en cours de traitement) — jamais un spinner pour un chargement de
page complète, toujours un Skeleton.

### Success
Icône `CheckCircle2` (déjà largement utilisée dans le produit), couleur
Success, jamais accompagnée d'une animation "confetti" ou similaire —
cohérent avec le principe "calme, jamais bruyant" (`01_DESIGN_PRINCIPLES.md`).
Confirmation par Toast pour une action ponctuelle, par Alert inline pour un
état durable (ex. badge "Vérifié" sur une fiche école).

### Error
Icône `XCircle` ou `AlertTriangle`, couleur Danger. Un message d'erreur
explique toujours *quoi faire*, jamais seulement *ce qui a échoué* — "Le
numéro de téléphone doit contenir 9 chiffres" plutôt que "Erreur de
validation". Erreur réseau/serveur : message générique rassurant ("Une
erreur est survenue, réessayez dans un instant") jamais un message
technique brut exposé à l'utilisateur.

## Ton et voix

- Français uniquement, vouvoiement systématique (déjà la pratique en place
  dans tout le produit).
- Phrases courtes, verbes d'action pour les boutons ("Envoyer la
  préinscription", jamais "Soumission du formulaire").
- Jamais d'humour ou de familiarité dans les messages système — le sujet
  (scolarité, argent, données d'enfants) impose un ton posé en toute
  circonstance, y compris dans les messages d'erreur.
