"use client";

import { useState } from "react";
import Image from "next/image";
import { ImageIcon, X, ChevronLeft, ChevronRight } from "lucide-react";

export type SchoolGalleryImage = { id: string; url: string; caption?: string | null };

// Galerie de la fiche établissement — masonry en colonnes CSS sur desktop
// (pas de librairie), défilement horizontal compact sur mobile, lightbox
// avec navigation. Photos réelles uniquement.
export function SchoolGallery({ images }: { images: SchoolGalleryImage[] }) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  if (images.length === 0) {
    return (
      <div className="bg-white border border-border rounded-card py-16 text-center">
        <ImageIcon size={28} className="mx-auto text-text-secondary/30 mb-4" />
        <p className="text-sm text-text-secondary">Aucune photo publiée.</p>
      </div>
    );
  }

  return (
    <>
      {/* Mobile — défilement horizontal compact */}
      <div className="flex sm:hidden gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {images.map((img, i) => (
          <button
            key={img.id}
            onClick={() => setLightboxIndex(i)}
            className="relative w-40 h-40 rounded-[14px] overflow-hidden bg-muted shrink-0"
          >
            <Image src={img.url} alt={img.caption ?? ""} fill sizes="160px" className="object-cover" />
          </button>
        ))}
      </div>

      {/* Desktop — masonry en colonnes CSS */}
      <div className="hidden sm:block columns-2 lg:columns-3 gap-4 [column-fill:balance]">
        {images.map((img, i) => (
          <button
            key={img.id}
            onClick={() => setLightboxIndex(i)}
            className="group relative block w-full mb-4 break-inside-avoid rounded-[16px] overflow-hidden bg-muted border border-border hover:border-text-secondary/30 transition-colors duration-base"
          >
            <Image
              src={img.url}
              alt={img.caption ?? ""}
              width={480}
              height={360}
              sizes="(max-width: 1024px) 50vw, 33vw"
              className="w-full h-auto object-cover group-hover:scale-[1.02] transition-transform duration-base"
            />
            {img.caption && (
              <p className="text-xs text-white bg-black/50 px-3 py-2 absolute bottom-0 inset-x-0">{img.caption}</p>
            )}
          </button>
        ))}
      </div>

      {lightboxIndex !== null && (
        <div
          className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center p-4"
          onClick={() => setLightboxIndex(null)}
        >
          <button
            onClick={() => setLightboxIndex(null)}
            aria-label="Fermer"
            className="absolute top-5 right-5 w-10 h-10 flex items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors duration-base"
          >
            <X size={20} />
          </button>

          {images.length > 1 && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); setLightboxIndex((i) => (i === null ? 0 : (i - 1 + images.length) % images.length)); }}
                aria-label="Photo précédente"
                className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors duration-base"
              >
                <ChevronLeft size={20} />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setLightboxIndex((i) => (i === null ? 0 : (i + 1) % images.length)); }}
                aria-label="Photo suivante"
                className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors duration-base"
              >
                <ChevronRight size={20} />
              </button>
            </>
          )}

          <div className="relative max-w-4xl w-full h-[80vh]" onClick={(e) => e.stopPropagation()}>
            <Image
              src={images[lightboxIndex].url}
              alt={images[lightboxIndex].caption ?? "Photo agrandie"}
              fill
              sizes="90vw"
              className="object-contain"
            />
          </div>
        </div>
      )}
    </>
  );
}
