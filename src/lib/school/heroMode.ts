import type { SchoolHeroSlide } from "@/components/school/SchoolHeroCarousel";

// CMS-C.1 — logique de résolution du hero, partagée entre l'éditeur CMS
// (src/app/dashboard/ecole/etablissement/page.tsx) et le rendu public
// (src/app/ecole/[id]/page.tsx) pour qu'ils interprètent toujours
// establishments.hero_mode de la même façon (mission §7 : ne pas dupliquer
// la décision, sans sur-ingénierie — une simple fonction pure suffit).

export type HeroMode = "carousel" | "image" | "none";
export const HERO_MODES: readonly HeroMode[] = ["carousel", "image", "none"];
export const MAX_HERO_CAROUSEL_SLIDES = 5;

// Diapositives disponibles avant application du mode : la galerie si elle
// contient des photos, sinon le repli hérité cover_image_url — inchangé
// par rapport au comportement d'avant CMS-C.1.
export function computeAllHeroSlides(
  images: { id: string; url: string }[],
  coverImageUrl: string | null | undefined
): SchoolHeroSlide[] {
  if (images.length > 0) return images.map((img) => ({ id: img.id, image: img.url }));
  if (coverImageUrl) return [{ id: "cover", image: coverImageUrl }];
  return [];
}

// Applique le mode choisi. `mode` null/undefined (donnée pas encore
// chargée, ou colonne absente avant exécution de la migration) retombe sur
// "carousel" — limité à cinq images pour garder un hero court et lisible,
// tout en laissant la galerie complète disponible dans sa section dédiée.
// Il dégrade déjà gracieusement à 0/1 diapositive
// (SchoolHeroCarousel n'affiche les contrôles qu'à partir de 2), donc
// aucune régression visuelle pour les écoles existantes (mission §8).
export function resolveHeroSlides(
  allSlides: SchoolHeroSlide[],
  mode: HeroMode | null | undefined
): SchoolHeroSlide[] {
  const effective = mode ?? "carousel";
  if (effective === "none") return [];
  if (effective === "image") return allSlides.slice(0, 1);
  return allSlides.slice(0, MAX_HERO_CAROUSEL_SLIDES);
}
