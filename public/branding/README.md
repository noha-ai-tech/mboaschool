# Branding Écoles237

Ce dossier doit contenir exactement trois fichiers, fournis par Eddy (aucun
outil de génération d'image n'est disponible pour les créer automatiquement) :

- **`logo-light.png`** — logo horizontal officiel pour fonds clairs. Utilisé
  par `src/components/branding/Logo.tsx` (`variant="light"`, valeur par
  défaut) sur toutes les pages/en-têtes à fond clair.
- **`logo-dark.png`** — même logo, variante pour fonds sombres. Utilisé par
  `Logo.tsx` (`variant="dark"`) sur tous les en-têtes/sidebars à fond sombre
  (admin, école, pro, enseignant, footer de l'accueil, panneau gauche
  connexion).
- **`favicon.png`** — icône officielle (carrée). Utilisée par
  `src/components/branding/Favicon.tsx`, ainsi que par les métadonnées
  `icons`/`manifest` (`src/app/layout.tsx`, `src/app/manifest.ts`).

**`favicon.png` est déjà déposé.** Il manque encore `logo-light.png` et
`logo-dark.png` — tout le code les référence déjà aux chemins exacts
(`/branding/logo-light.png`, `/branding/logo-dark.png`), aucune modification
de code n'est nécessaire une fois les fichiers déposés ici.

Supprimez ce README une fois les trois fichiers en place (il n'est pas requis
par l'application, seulement documentaire).
