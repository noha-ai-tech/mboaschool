"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

// Panneau photo du Hero (Landing V6) — séparation courbe organique avec le
// panneau vert foncé, façon maquette. Volontairement SANS badge/nom/CTA
// superposé : contrairement à l'ancien carrousel (HeroSlide), ces photos ne
// prétendent représenter aucun établissement précis — ce sont de vraies
// photos d'établissements réels de la plateforme (mêmes sources que "À la
// une"), affichées ici comme illustration générale de la plateforme, jamais
// une fausse photo générique ni un établissement nommé à tort.
export type HeroPhoto = { id: string; url: string };

export function HeroCurvedPhoto({ photos }: { photos: HeroPhoto[] }) {
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

  return (
    <div className="relative w-full h-full min-h-[280px] lg:min-h-0">
      {/* Courbe organique : appliquée au conteneur photo, objectBoundingBox
          donc entièrement responsive (0..1 = pourcentage de la boîte). */}
      <svg width="0" height="0" aria-hidden="true">
        <clipPath id="hero-curve" clipPathUnits="objectBoundingBox">
          <path d="M0.16,0 C0.02,0.32 0.26,0.60 0.13,1 L1,1 L1,0 Z" />
        </clipPath>
      </svg>

      <div
        className="absolute inset-0 overflow-hidden hidden lg:block"
        style={{ clipPath: "url(#hero-curve)" }}
      >
        {usable.length === 0 ? (
          <div className="absolute inset-0 bg-gradient-to-br from-[#0d4d34] to-[#083A28]" />
        ) : (
          usable.map((photo, i) => (
            <div key={photo.id} className={`absolute inset-0 transition-opacity duration-slow ${i === active ? "opacity-100" : "opacity-0"}`}>
              <Image
                src={photo.url}
                alt=""
                fill
                priority={i === 0}
                sizes="45vw"
                onError={() => setFailed((prev) => new Set(prev).add(photo.id))}
                className="object-cover"
              />
            </div>
          ))
        )}
      </div>

      {/* Mobile/tablette : pas de courbe (complexité inutile en pleine largeur), photo rectangulaire arrondie en haut. */}
      <div className="absolute inset-0 overflow-hidden rounded-t-[28px] lg:hidden">
        {usable.length === 0 ? (
          <div className="absolute inset-0 bg-gradient-to-br from-[#0d4d34] to-[#083A28]" />
        ) : (
          <Image
            src={usable[active]?.url ?? usable[0].url}
            alt=""
            fill
            sizes="100vw"
            onError={() => setFailed((prev) => new Set(prev).add(usable[active]?.id ?? usable[0].id))}
            className="object-cover"
          />
        )}
      </div>

      {usable.length > 1 && (
        <div className="absolute bottom-5 left-1/2 -translate-x-1/2 lg:left-auto lg:translate-x-0 lg:right-8 flex gap-1.5 z-10">
          {usable.map((photo, i) => (
            <button
              key={photo.id}
              onClick={() => setActive(i)}
              aria-label={`Photo ${i + 1}`}
              className={`h-2 rounded-full transition-all duration-base ${i === active ? "w-6 bg-white" : "w-2 bg-white/50 hover:bg-white/70"}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
