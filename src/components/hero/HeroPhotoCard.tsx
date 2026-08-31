"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight } from "lucide-react";

// Carte photo du Hero — photos réelles de la plateforme (public/hero/),
// jamais un établissement précis (pas de badge/nom/CTA superposé sur les
// photos elles-mêmes). Deux usages :
// - variant="card" (par défaut) : bloc autonome avec ses propres coins
//   arrondis et son propre fond de repli.
// - variant="background" : plein cadre derrière le contenu du Hero (titre,
//   carte de recherche) — ajoute le dégradé vert de lisibilité prévu par le
//   design system, sans coins arrondis ni fond de repli propres (le parent
//   gère l'arrondi via son propre overflow-hidden).
// Dans les deux cas : fondu entre les photos (jamais de coupe brutale),
// léger zoom continu ("Ken Burns") sur la photo affichée, navigation
// manuelle (flèches + points) en plus de l'auto-défilement — voir
// references/public-components.md du skill de design.
export type HeroPhoto = { id: string; url: string };

export function HeroPhotoCard({
  photos,
  variant = "card",
}: {
  photos: HeroPhoto[];
  variant?: "card" | "background";
}) {
  const [active, setActive] = useState(0);
  const [failed, setFailed] = useState<Set<string>>(new Set());

  const usable = photos.filter((p) => !failed.has(p.id));
  const isBackground = variant === "background";

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
    <div
      className={`relative w-full h-full min-h-[280px] overflow-hidden bg-gradient-to-br from-[#0d4d34] to-[#083A28] ${
        isBackground ? "" : "rounded-[22px]"
      }`}
    >
      {usable.length === 0 ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <p className="text-xs font-semibold uppercase tracking-wider text-white/50">Photos à venir</p>
        </div>
      ) : (
        usable.map((photo, i) => (
          <div
            key={photo.id}
            className={`absolute inset-0 transition-opacity duration-[1100ms] ${i === active ? "opacity-100" : "opacity-0"}`}
          >
            <div className={`absolute inset-0 ${i === active ? "animate-hero-kenburns" : ""}`}>
              <Image
                src={photo.url}
                alt=""
                fill
                priority={i === 0}
                sizes={isBackground ? "100vw" : "(max-width: 1024px) 100vw, 55vw"}
                onError={() => setFailed((prev) => new Set(prev).add(photo.id))}
                className="object-cover"
              />
            </div>
          </div>
        ))
      )}

      {/* Dégradé de lisibilité — uniquement en usage plein cadre derrière du
          texte, jamais sur le petit bloc photo autonome de la page catégorie. */}
      {isBackground && (
        <div
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none bg-[linear-gradient(105deg,rgba(6,37,27,0.90)_0%,rgba(6,37,27,0.62)_42%,rgba(6,37,27,0.08)_75%)]"
        />
      )}

      {usable.length > 1 && (
        <>
          <button
            onClick={() => go(-1)}
            aria-label="Photo précédente"
            className="absolute left-3 top-1/2 -translate-y-1/2 z-10 w-9 h-9 flex items-center justify-center rounded-full bg-white/90 text-[#0B3B2E] hover:bg-white transition-colors duration-base"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            onClick={() => go(1)}
            aria-label="Photo suivante"
            className="absolute right-3 top-1/2 -translate-y-1/2 z-10 w-9 h-9 flex items-center justify-center rounded-full bg-white/90 text-[#0B3B2E] hover:bg-white transition-colors duration-base"
          >
            <ChevronRight size={16} />
          </button>
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5 z-10">
            {usable.map((photo, i) => (
              <button
                key={photo.id}
                onClick={() => setActive(i)}
                aria-label={`Photo ${i + 1}`}
                className={`h-2 rounded-full transition-all duration-base ${i === active ? "w-6 bg-[#F2AE1F]" : "w-2 bg-white/50 hover:bg-white/70"}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
