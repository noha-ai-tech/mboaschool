"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { HeroSlide, type HeroSlideData } from "./HeroSlide";

// Carrousel Hero — autoplay 6s, pause au survol/focus/onglet masqué, respecte
// prefers-reduced-motion, navigation clavier (flèches) et tactile (swipe).
export function HeroCarousel({ slides }: { slides: HeroSlideData[] }) {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchStartX = useRef<number | null>(null);

  useEffect(() => {
    if (active >= slides.length) setActive(0);
  }, [slides.length, active]);

  useEffect(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion || paused || slides.length <= 1) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") {
        setActive((i) => (i + 1) % slides.length);
      }
    }, 6000);
    return () => clearInterval(timer);
  }, [paused, slides.length]);

  // Repli premium si aucune école réelle avec photo n'est disponible —
  // jamais un vide, jamais un rectangle de couleur sans contenu (§18).
  if (slides.length === 0) {
    return (
      <div className="relative w-full min-h-[420px] lg:min-h-0 h-full rounded-card overflow-hidden bg-[linear-gradient(135deg,#052015_0%,#083D2A_55%,#0A5C3C_100%)] flex items-end p-8 lg:p-10">
        <div className="text-white max-w-md">
          <p className="text-xs font-semibold uppercase tracking-wider mb-2 text-white/70">Écoles237</p>
          <h2 className="text-2xl font-bold leading-tight">De nouveaux établissements arrivent bientôt.</h2>
        </div>
      </div>
    );
  }

  const go = (i: number) => setActive(((i % slides.length) + slides.length) % slides.length);

  return (
    <div
      className="relative w-full min-h-[420px] lg:min-h-0 rounded-card overflow-hidden"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") go(active + 1);
        if (e.key === "ArrowLeft") go(active - 1);
      }}
      onTouchStart={(e) => { touchStartX.current = e.touches[0].clientX; }}
      onTouchEnd={(e) => {
        if (touchStartX.current === null) return;
        const delta = e.changedTouches[0].clientX - touchStartX.current;
        if (delta < -40) go(active + 1);
        if (delta > 40) go(active - 1);
        touchStartX.current = null;
      }}
    >
      {slides.map((slide, i) => (
        <HeroSlide key={slide.id} slide={slide} active={i === active} priority={i === 0} />
      ))}

      {slides.length > 1 && (
        <>
          <button
            onClick={() => go(active - 1)}
            aria-label="Diapositive précédente"
            className="absolute left-3 top-1/2 -translate-y-1/2 z-20 w-9 h-9 flex items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25 transition-colors duration-base backdrop-blur-sm"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            onClick={() => go(active + 1)}
            aria-label="Diapositive suivante"
            className="absolute right-3 top-1/2 -translate-y-1/2 z-20 w-9 h-9 flex items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25 transition-colors duration-base backdrop-blur-sm"
          >
            <ChevronRight size={16} />
          </button>
          <div className="absolute top-5 right-5 flex gap-1.5 z-20">
            {slides.map((slide, i) => (
              <button
                key={slide.id}
                onClick={() => go(i)}
                className={`h-1.5 rounded-full transition-all duration-base ${i === active ? "w-6 bg-white" : "w-1.5 bg-white/40 hover:bg-white/60"}`}
                aria-label={`Aller à la diapositive ${i + 1}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
