import Image from "next/image";
import { classifySchoolGalleryImage, type SchoolGalleryGroupKey } from "@/lib/school/galleryGroups";

// GUYSKULL-06 §9-12 / GUYSKULL-06C §21 — compact internal "hero-lite"
// banner for the 4 non-Accueil views, so each page reads as a real
// editorial school page instead of a bare white sheet of stacked cards.
// Deliberately shorter than the Accueil hero and consistent across all 4
// pages (min-height, not a fixed height, so a longer subtitle still fits).
// Generic: picks the first gallery image whose caption matches one of the
// requested group keys (the same caption-based classifier already used
// for the grouped gallery, GUYSKULL-05E) — falls back to no image, never a
// fabricated one, and never a Guyskull-specific string.
export function ViewBanner({
  eyebrow,
  title,
  subtitle,
  images,
  preferredGroups,
}: {
  eyebrow?: string | null;
  title: string;
  subtitle?: string | null;
  images: { id: string; url: string; caption?: string | null }[];
  /** Ordered preference — the first group with a match wins. */
  preferredGroups: SchoolGalleryGroupKey[];
}) {
  let bannerImage: { id: string; url: string; caption?: string | null } | null = null;
  for (const group of preferredGroups) {
    const match = images.find((img) => classifySchoolGalleryImage(img) === group);
    if (match) {
      bannerImage = match;
      break;
    }
  }
  if (!bannerImage && images.length > 0) bannerImage = images[0];

  return (
    <div className="relative overflow-hidden min-h-[240px] lg:min-h-[300px] flex items-end" style={{ background: "var(--school-primary-dark, #0A0F0D)" }}>
      {bannerImage && (
        <Image src={bannerImage.url} alt="" fill sizes="100vw" className="object-cover" priority={false} />
      )}
      <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/45 to-black/15" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
      <div className="relative z-10 max-w-[1280px] mx-auto px-4 lg:px-6 py-8 lg:py-10 w-full">
        {eyebrow && (
          <p className="text-[10px] font-bold tracking-widest uppercase mb-2" style={{ color: "var(--school-accent-gold, #C9A24B)" }}>
            {eyebrow}
          </p>
        )}
        <h1 className="text-3xl lg:text-4xl font-black tracking-tight text-white text-balance">{title}</h1>
        {subtitle && <p className="mt-2.5 text-sm lg:text-[15px] text-white/75 max-w-[560px] leading-relaxed">{subtitle}</p>}
      </div>
    </div>
  );
}
