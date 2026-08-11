"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ChevronLeft, ChevronRight, MapPin, CheckCircle2, Crown, ArrowLeft, ArrowRight } from "lucide-react";

export type SchoolHeroSlide = {
  id: string;
  image: string;
};

// Carrousel Hero de la fiche établissement — propre à chaque école (photos
// réelles uniquement : cover + galerie). Jamais de contenu générique.
export function SchoolHeroCarousel({
  slides,
  name,
  city,
  neighborhood,
  category,
  verified,
  premium,
  preinscriptionHref,
  backHref,
  backLabel,
}: {
  slides: SchoolHeroSlide[];
  name: string;
  city: string | null;
  neighborhood: string | null;
  category: string | null;
  verified: boolean;
  premium: boolean;
  preinscriptionHref: string;
  backHref: string;
  backLabel: string;
}) {
  const [active, setActive] = useState(0);
  const [failed, setFailed] = useState<Set<string>>(new Set());
  const touchStartX = useRef<number | null>(null);
  const visible = slides.filter((s) => !failed.has(s.id));

  useEffect(() => {
    if (active >= visible.length) setActive(0);
  }, [visible.length, active]);

  useEffect(() => {
    if (visible.length <= 1) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) return;
    const timer = setInterval(() => setActive((i) => (i + 1) % visible.length), 5000);
    return () => clearInterval(timer);
  }, [visible.length]);

  const go = (i: number) => visible.length > 0 && setActive(((i % visible.length) + visible.length) % visible.length);

  return (
    <section
      className="relative h-[500px] lg:h-[560px] bg-accent text-white overflow-hidden"
      onTouchStart={(e) => { touchStartX.current = e.touches[0].clientX; }}
      onTouchEnd={(e) => {
        if (touchStartX.current === null) return;
        const delta = e.changedTouches[0].clientX - touchStartX.current;
        if (delta < -40) go(active + 1);
        if (delta > 40) go(active - 1);
        touchStartX.current = null;
      }}
    >
      {visible.map((slide, i) => (
        <div key={slide.id} aria-hidden={i !== active} className={`absolute inset-0 transition-opacity duration-slow ease-out ${i === active ? "opacity-100" : "opacity-0"}`}>
          <Image
            src={slide.image}
            alt=""
            fill
            priority={i === 0}
            sizes="100vw"
            className="object-cover"
            onError={() => setFailed((prev) => new Set(prev).add(slide.id))}
          />
        </div>
      ))}
      {visible.length === 0 && (
        <div className="absolute inset-0 bg-[linear-gradient(135deg,#052015_0%,#083D2A_55%,#0A5C3C_100%)]" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-black/15 pointer-events-none" />

      <div className="relative z-10 max-w-[1520px] mx-auto px-[18px] h-full flex flex-col">
        <div className="pt-24 shrink-0">
          <Link href={backHref} className="inline-flex items-center gap-2 text-sm font-semibold text-white/70 hover:text-white transition-colors duration-base">
            <ArrowLeft size={15} />
            {backLabel}
          </Link>
        </div>

        <div className="flex-1" />

        <div className="pb-10">
          <div className="flex items-center gap-2 flex-wrap mb-3">
            {category && (
              <span className="text-[10px] font-bold tracking-widest uppercase text-primary-light">{category}</span>
            )}
            {verified && (
              <span className="flex items-center gap-1 text-[10px] font-semibold text-white bg-white/15 border border-white/20 px-2 py-0.5 rounded-full">
                <CheckCircle2 size={9} /> Vérifié
              </span>
            )}
            {premium && (
              <span className="flex items-center gap-1 text-[10px] font-bold text-[#0A0A0A] bg-[#FCD116] px-2 py-0.5 rounded-full">
                <Crown size={9} /> Premium
              </span>
            )}
          </div>

          <h1 className="text-3xl md:text-5xl font-black tracking-tight mb-3 leading-none">{name}</h1>

          {city && (
            <p className="flex items-center gap-1.5 text-sm text-white/70 mb-6">
              <MapPin size={13} />
              {city}{neighborhood ? `, ${neighborhood}` : ""}
            </p>
          )}

          <Link
            href={preinscriptionHref}
            className="inline-flex items-center gap-2 h-11 px-6 rounded-card bg-gradient-to-r from-primary to-primary-dark text-white text-sm font-bold hover:shadow-elevation-2 transition-all duration-base"
          >
            Préinscrire mon enfant
            <ArrowRight size={15} />
          </Link>
        </div>
      </div>

      {visible.length > 1 && (
        <>
          <button onClick={() => go(active - 1)} aria-label="Photo précédente" className="absolute left-4 top-1/2 -translate-y-1/2 z-20 w-10 h-10 flex items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 backdrop-blur-sm transition-colors duration-base">
            <ChevronLeft size={18} />
          </button>
          <button onClick={() => go(active + 1)} aria-label="Photo suivante" className="absolute right-4 top-1/2 -translate-y-1/2 z-20 w-10 h-10 flex items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 backdrop-blur-sm transition-colors duration-base">
            <ChevronRight size={18} />
          </button>
          <div className="absolute bottom-6 right-6 flex gap-1.5 z-20">
            {visible.map((slide, i) => (
              <button
                key={slide.id}
                onClick={() => go(i)}
                aria-label={`Photo ${i + 1}`}
                className={`h-1.5 rounded-full transition-all duration-base ${i === active ? "w-5 bg-white" : "w-1.5 bg-white/40 hover:bg-white/70"}`}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
