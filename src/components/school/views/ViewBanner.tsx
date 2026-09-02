import Image from "next/image";
import { classifySchoolGalleryImage, type SchoolGalleryGroupKey } from "@/lib/school/galleryGroups";

// GUYSKULL-06 §9-12 — compact internal "hero-lite" banner for the 4
// non-Accueil views, so each page reads as a real editorial school page
// instead of a bare white sheet of stacked cards. Generic: picks the first
// gallery image whose caption matches one of the requested group keys (the
// same caption-based classifier already used for the grouped gallery,
// GUYSKULL-05E) — falls back to no image, never a fabricated one, and
// never a Guyskull-specific string.
export function ViewBanner({
  title,
  subtitle,
  images,
  preferredGroups,
}: {
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
    <div className="relative overflow-hidden" style={{ background: "var(--school-primary-dark, #0A0F0D)" }}>
      {bannerImage && (
        <>
          <Image src={bannerImage.url} alt="" fill sizes="100vw" className="object-cover opacity-45" priority={false} />
          <div className="absolute inset-0 bg-gradient-to-r from-black/75 via-black/55 to-black/35" />
        </>
      )}
      <div className="relative z-10 max-w-[1280px] mx-auto px-4 lg:px-6 py-10 lg:py-14">
        <h1 className="text-2xl lg:text-3xl font-black tracking-tight text-white">{title}</h1>
        {subtitle && <p className="mt-2 text-sm lg:text-base text-white/75 max-w-[560px] leading-relaxed">{subtitle}</p>}
      </div>
    </div>
  );
}
