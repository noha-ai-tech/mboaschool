import type { HeroPhoto } from "@/components/hero/HeroPhotoCard";

// Photos réelles fournies pour le panneau Hero (déposées dans public/hero/).
// Source unique — réutilisée par la Landing (src/app/page.tsx) et les pages
// d'authentification (AuthBranding) plutôt que dupliquée ou remplacée par
// une photo de banque d'images : voir references/anti-ai-tells.md du skill
// de design (jamais de stock/IA, uniquement de vraies photos déjà fournies
// pour la plateforme).
export const HERO_PHOTOS: HeroPhoto[] = [
  { id: "hero-1", url: "/hero/ecole%20vu%20de%20haut.png" },
  { id: "hero-2", url: "/hero/cours%20ecole.png" },
  { id: "hero-3", url: "/hero/lab.png" },
];
