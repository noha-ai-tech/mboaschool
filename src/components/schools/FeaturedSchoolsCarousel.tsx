"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { SchoolCard, type FeaturedSchool } from "./SchoolCard";

// Carrousel horizontal premium — scroll-snap natif (pas de librairie), swipe
// mobile natif, clavier via focus + flèches, boutons discrets, pagination en
// points synchronisée sur la position de scroll réelle. Masqué s'il n'y a
// aucun établissement réellement "à la une".
export function FeaturedSchoolsCarousel({ schools }: { schools: FeaturedSchool[] }) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || schools.length === 0) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const cardWidth = el.scrollWidth / schools.length;
        if (!cardWidth) return;
        const idx = Math.round(el.scrollLeft / cardWidth);
        setActive(Math.min(Math.max(idx, 0), schools.length - 1));
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [schools.length]);

  if (schools.length === 0) return null;

  const scrollBy = (dx: number) => scrollRef.current?.scrollBy({ left: dx, behavior: "smooth" });
  const scrollToIndex = (i: number) => {
    const el = scrollRef.current;
    if (!el) return;
    const cardWidth = el.scrollWidth / schools.length;
    el.scrollTo({ left: cardWidth * i, behavior: "smooth" });
  };

  return (
    <div>
      <div className="hidden sm:flex items-center justify-end gap-2 mb-3">
        <button
          onClick={() => scrollBy(-320)}
          aria-label="Défiler vers la gauche"
          className="w-8 h-8 rounded-full border border-[#E7E0D7] flex items-center justify-center text-[#5A695F] hover:text-[#132019] hover:bg-white transition-colors duration-base"
        >
          <ChevronLeft size={15} />
        </button>
        <button
          onClick={() => scrollBy(320)}
          aria-label="Défiler vers la droite"
          className="w-8 h-8 rounded-full border border-[#E7E0D7] flex items-center justify-center text-[#5A695F] hover:text-[#132019] hover:bg-white transition-colors duration-base"
        >
          <ChevronRight size={15} />
        </button>
      </div>

      <div
        ref={scrollRef}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") scrollBy(320);
          if (e.key === "ArrowLeft") scrollBy(-320);
        }}
        className="flex gap-4 overflow-x-auto snap-x snap-mandatory pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {schools.map((school, i) => (
          <div key={school.id} className="shrink-0 w-[85%] sm:w-[46%] md:w-[31%] lg:w-[23%] xl:w-[19%] snap-start">
            <SchoolCard school={school} toneIndex={i} />
          </div>
        ))}
      </div>

      {schools.length > 1 && (
        <div className="flex items-center justify-center gap-1.5 mt-4">
          {schools.map((school, i) => (
            <button
              key={school.id}
              onClick={() => scrollToIndex(i)}
              aria-label={`Voir l'établissement ${i + 1}`}
              className={`h-1.5 rounded-full transition-all duration-base ${i === active ? "w-5 bg-[#1F8A5D]" : "w-1.5 bg-[#E7E0D7] hover:bg-[#5A695F]/40"}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
