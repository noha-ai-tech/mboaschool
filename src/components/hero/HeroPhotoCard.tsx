"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight } from "lucide-react";

// Carte photo du Hero (Landing V7) — bloc carré/rectangulaire séparé du bloc
// recherche uniquement par la couleur (fond vert entre les deux), pas de
// courbe organique. Volontairement SANS badge/nom/CTA superposé : ces photos
// ne prétendent représenter aucun établissement précis (contrairement à
// l'ancien carrousel "à la une") — simple illustration réelle de la
// plateforme, jamais une photo inventée.
export type HeroPhoto = { id: string; url: string };

export function HeroPhotoCard({ photos }: { photos: HeroPhoto[] }) {
  const [active, setActive] = useState(0);
  const [failed, setFailed] = useState<Set<string>>(new Set());

  const usable = photos.filter((p) => !failed.has(p.id));

  useEffect(() => {
    if (usable.length <= 1) return;
    const timer = setInterval(() => setActive((i) => (i + 1) % usable.length), 6000);
    return () => clearInterval(timer);
  }, [usable.length]);

  useEffect(() => {
    if (active >= usable.length) setActive(0);
  }, [usable.length, active]);

  function go(delta: number) {
    if (usable.length === 0) return;
    setActive((i) => (i + delta + usable.length) % usable.length);
  }

  return (
    <div className="relative w-full h-full min-h-[280px] rounded-[22px] overflow-hidden bg-gradient-to-br from-[#0d4d34] to-[#083A28]">
      {usable.length === 0 ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <p className="text-xs font-semibold uppercase tracking-wider text-white/50">Photos à venir</p>
        </div>
      ) : (
        usable.map((photo, i) => (
          <div key={photo.id} className={`absolute inset-0 transition-opacity duration-slow ${i === active ? "opacity-100" : "opacity-0"}`}>
            <Image
              src={photo.url}
              alt=""
              fill
              priority={i === 0}
              sizes="(max-width: 1024px) 100vw, 55vw"
              onError={() => setFailed((prev) => new Set(prev).add(photo.id))}
              className="object-cover"
            />
          </div>
        ))
      )}

      {usable.length > 1 && (
        <>
          <button
            onClick={() => go(-1)}
            aria-label="Photo précédente"
            className="absolute left-3 top-1/2 -translate-y-1/2 z-10 w-9 h-9 flex items-center justify-center rounded-full bg-white/90 text-[#0a0a0a] hover:bg-white transition-colors duration-base"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            onClick={() => go(1)}
            aria-label="Photo suivante"
            className="absolute right-3 top-1/2 -translate-y-1/2 z-10 w-9 h-9 flex items-center justify-center rounded-full bg-white/90 text-[#0a0a0a] hover:bg-white transition-colors duration-base"
          >
            <ChevronRight size={16} />
          </button>
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5 z-10">
            {usable.map((photo, i) => (
              <button
                key={photo.id}
                onClick={() => setActive(i)}
                aria-label={`Photo ${i + 1}`}
                className={`h-2 rounded-full transition-all duration-base ${i === active ? "w-6 bg-white" : "w-2 bg-white/50 hover:bg-white/70"}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
