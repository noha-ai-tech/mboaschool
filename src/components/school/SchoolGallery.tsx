"use client";

import { useState } from "react";
import Image from "next/image";
import { ImageIcon, X, ChevronLeft, ChevronRight } from "lucide-react";
import { groupSchoolGalleryImages } from "@/lib/school/galleryGroups";

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

  const groups = groupSchoolGalleryImages(images);
  const imageIndexById = new Map(images.map((image, index) => [image.id, index]));

  return (
    <>
      <div className="grid gap-6 sm:grid-cols-2">
        {groups.map((group) => (
          <section key={group.key} className="rounded-[16px] border border-border bg-white p-3 sm:p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-sm font-bold text-text-primary">{group.label}</h3>
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-text-secondary">{group.images.length}</span>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              {group.images.map((img) => (
                <button
                  key={img.id}
                  onClick={() => setLightboxIndex(imageIndexById.get(img.id) ?? 0)}
                  className="group relative aspect-[4/3] overflow-hidden rounded-[12px] bg-muted border border-border hover:border-text-secondary/30 transition-colors duration-base"
                >
                  <Image
                    src={img.url}
                    alt={img.caption ?? group.label}
                    fill
                    sizes="(max-width: 640px) 45vw, (max-width: 1024px) 24vw, 20vw"
                    className="object-cover group-hover:scale-[1.02] transition-transform duration-base"
                  />
                </button>
              ))}
            </div>
          </section>
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
