# Branding Écoles237

Ce dossier doit contenir exactement deux fichiers, fournis par Eddy (aucun
outil de génération d'image n'est disponible pour les créer automatiquement) :

- **`logo.png`** — logo horizontal officiel (E noir, "237" vert/jaune/rouge).
  Utilisé par `src/components/branding/Logo.tsx` partout dans l'application
  (header, sidebars, footer, pages d'authentification, pages publiques).
- **`favicon.png`** — icône officielle (carrée). Utilisée par
  `src/components/branding/Favicon.tsx`, ainsi que par les métadonnées
  `icons`/`manifest` (`src/app/layout.tsx`, `src/app/manifest.ts`).

Tout le code de l'application référence déjà ces deux chemins exacts
(`/branding/logo.png`, `/branding/favicon.png`) — il suffit de déposer les
fichiers ici, aucune modification de code n'est nécessaire.

Supprimez ce README une fois les deux fichiers en place (il n'est pas requis
par l'application, seulement documentaire).
