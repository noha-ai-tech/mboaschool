"use client";

import { useState } from "react";
import Image from "next/image";
import { HeroCTA } from "./HeroCTA";

// Un slide = image réelle (établissement à la une, jamais de photo stock/IA).
// Champs alignés sur ce que porterait une future table Supabase dédiée
// (titre, description, cta, lien, type, sponsor…) pour permettre un
// pilotage par contenu plus tard sans changer ce composant.
export type HeroSlideData = {
  id: string;
  type: "school" | "product" | "cta";
  image?: string | null;
  gradientClassName?: string;
  badge?: string | null;
  eyebrow: string;
  title: string;
  text?: string | null;
  ctaLabel?: string;
  ctaHref?: string;
  sponsor?: string | null;
};

export function HeroSlide({
  slide,
  active,
  priority = false,
}: {
  slide: HeroSlideData;
  active: boolean;
  priority?: boolean;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const showImage = slide.image && !imgFailed;

  return (
    <div
      role="group"
      aria-roledescription="slide"
      aria-label={slide.title}
      aria-hidden={!active}
      className={`absolute inset-0 transition-opacity duration-slow ease-out ${
        active ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
      }`}
    >
      {showImage ? (
        <div className="absolute inset-0 overflow-hidden">
          <Image
            key={active ? `${slide.id}-active` : slide.id}
            src={slide.image as string}
            alt=""
            fill
            priority={priority}
            sizes="(max-width: 1024px) 100vw, 68vw"
            onError={() => setImgFailed(true)}
            className={`object-cover ${active ? "animate-hero-zoom motion-reduce:animate-none" : ""}`}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent" />
        </div>
      ) : (
        // Repli d'un slide dont la photo réelle est absente ou cassée :
        // jamais un aplat vide — un motif de marque discret (même grammaire
        // que HeroBackground, inversé pour un fond sombre) + un message
        // "Photo à venir" plutôt qu'une fausse photo d'établissement.
        <div className={`absolute inset-0 overflow-hidden ${slide.gradientClassName ?? "bg-accent"}`}>
          <svg aria-hidden="true" className="absolute inset-0 w-full h-full text-white opacity-[0.06]" preserveAspectRatio="xMidYMid slice">
            <pattern id={`hero-slide-texture-${slide.id}`} width="56" height="56" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="56" height="56" fill="none" />
              <path d="M28 0 L56 28 L28 56 L0 28 Z" fill="none" stroke="currentColor" strokeWidth="1" />
              <circle cx="28" cy="28" r="2.5" fill="currentColor" />
            </pattern>
            <rect width="100%" height="100%" fill={`url(#hero-slide-texture-${slide.id})`} />
          </svg>
          {slide.image && imgFailed && (
            <span className="absolute top-5 left-5 text-[10px] font-semibold uppercase tracking-wider text-white/50">
              Photo à venir
            </span>
          )}
        </div>
      )}

      <div className="relative z-10 h-full flex flex-col justify-end p-8 lg:p-10 text-white">
        <div className="max-w-md">
          {slide.badge && (
            <span className="inline-flex w-fit items-center bg-[#FCD116] text-[#0A0A0A] text-[10px] font-black px-2.5 py-1 rounded-full tracking-wide mb-3">
              {slide.badge}
            </span>
          )}
          <p className="text-xs font-semibold uppercase tracking-wider mb-2 text-white/70">{slide.eyebrow}</p>
          <h2 className="text-2xl lg:text-[28px] font-bold leading-tight mb-2">{slide.title}</h2>
          {slide.text && <p className="text-sm leading-relaxed text-white/80">{slide.text}</p>}
          {slide.ctaLabel && slide.ctaHref && (
            <div className="mt-4">
              <HeroCTA href={slide.ctaHref} tone="light">
                {slide.ctaLabel}
              </HeroCTA>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
