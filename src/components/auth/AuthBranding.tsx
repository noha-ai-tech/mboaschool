"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { HERO_PHOTOS } from "@/lib/heroPhotos";

// Panneau de branding partagé par les pages d'authentification (Connexion,
// Créer un compte, Mot de passe oublié…). Contenu volontairement minimal
// (photo + accroche courte, pas de texte marketing superflu). Mêmes vraies
// photos que le Hero de l'accueil (public/hero/, voir src/lib/heroPhotos.ts)
// — jamais une photo de banque d'images (l'ancienne version de ce panneau
// lisait les photos "showcase" des établissements côté Supabase, qui peuvent
// contenir un cover_image_url de secours non vérifié ; ces photos de la
// plateforme elle-même sont garanties réelles et déjà utilisées ailleurs).
export function AuthBranding({
  tagline = "La plateforme numérique des établissements scolaires du Cameroun.",
}: {
  tagline?: string;
}) {
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (HERO_PHOTOS.length <= 1) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) return;
    const timer = setInterval(() => setActive((i) => (i + 1) % HERO_PHOTOS.length), 6000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="relative hidden lg:flex lg:w-[44%] items-center justify-center overflow-hidden bg-[#0B3B2E]">
      <div className="absolute inset-0">
        {HERO_PHOTOS.map((photo, i) => (
          <div
            key={photo.id}
            aria-hidden={i !== active}
            className={`absolute inset-0 transition-opacity duration-slow ease-out ${i === active ? "opacity-100" : "opacity-0"}`}
          >
            <Image
              src={photo.url}
              alt=""
              fill
              priority={i === 0}
              sizes="44vw"
              loading={i === 0 ? undefined : "lazy"}
              className={`object-cover ${i === active ? "animate-hero-zoom motion-reduce:animate-none" : ""}`}
            />
          </div>
        ))}
        {/* Dégradé de lisibilité — vert profond de marque, exact comme prévu
            pour les panneaux de branding d'authentification. */}
        <div
          aria-hidden="true"
          className="absolute inset-0"
          style={{ background: "linear-gradient(135deg, rgba(6,37,27,0.85) 0%, rgba(6,37,27,0.4) 100%)" }}
        />
      </div>

      {/* Pas de logo ici : déjà affiché dans SiteHeader au-dessus — un seul
          logo par page plutôt qu'un doublon dans ce panneau. */}
      <p className="relative z-10 max-w-[360px] px-8 text-center font-[family-name:var(--font-fraunces)] text-[28px] leading-snug font-semibold text-white">
        {tagline}
      </p>

      {HERO_PHOTOS.length > 1 && (
        <div className="absolute z-10 bottom-8 left-1/2 -translate-x-1/2 flex gap-1.5">
          {HERO_PHOTOS.map((photo, i) => (
            <button
              key={photo.id}
              onClick={() => setActive(i)}
              aria-label={`Voir la photo ${i + 1}`}
              className={`h-1.5 rounded-full transition-all duration-base ${i === active ? "w-6 bg-white" : "w-1.5 bg-white/40 hover:bg-white/60"}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
