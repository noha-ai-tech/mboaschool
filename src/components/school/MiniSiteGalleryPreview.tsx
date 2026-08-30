"use client";

import Image from "next/image";
import { ImageIcon } from "lucide-react";

// PUBLIC-SITE-01 §4G — compact homepage gallery teaser. Reuses the exact
// live `school_images` rows already fetched by the page (never a separate
// query) — no image "category" column exists yet (audited: school_images
// only has url/caption/status), so per the mission's explicit instruction
// this stays a flat horizontal strip rather than a categorized gallery
// architecture.
export function MiniSiteGalleryPreview({
  images,
  onSeeAllClick,
}: {
  images: { id: string; url: string; caption?: string | null }[];
  onSeeAllClick: () => void;
}) {
  if (images.length === 0) return null;

  return (
    <div id="galerie-preview" className="bg-white border border-border rounded-card p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-bold text-sm flex items-center gap-2">
          <ImageIcon size={15} className="text-primary" /> Aperçu de l&apos;établissement
        </h2>
        <button onClick={onSeeAllClick} className="text-xs font-bold text-primary hover:opacity-80 transition-opacity duration-base">
          Voir la galerie →
        </button>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {images.slice(0, 10).map((img) => (
          <button
            key={img.id}
            onClick={onSeeAllClick}
            className="relative w-36 h-28 rounded-xl overflow-hidden bg-muted shrink-0"
          >
            <Image src={img.url} alt={img.caption ?? ""} fill sizes="144px" className="object-cover" />
          </button>
        ))}
      </div>
    </div>
  );
}
