"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useShowcasePhotos } from "@/lib/useShowcasePhotos";

// Panneau de branding partagé par les pages d'authentification (Connexion,
// Mot de passe oublié…). Contenu volontairement minimal (logo, phrase
// courte, carrousel) — pas de texte marketing superflu. Photos réelles
// uniquement, chargées depuis de vrais établissements vérifiés/mis en avant
// (Supabase, lecture seule). Repli élégant, jamais une image stock/IA, si
// aucune photo réelle n'est disponible. Maximum 3 slides.
export function AuthBranding({
  tagline = "La plateforme numérique des établissements scolaires du Cameroun.",
}: {
  tagline?: string;
}) {
  const photos = useShowcasePhotos(3);
  const [active, setActive] = useState(0);
  const [failed, setFailed] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (photos.length <= 1) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) return;
    const timer = setInterval(() => setActive((i) => (i + 1) % photos.length), 6000);
    return () => clearInterval(timer);
  }, [photos.length]);

  return (
    <div className="relative hidden lg:flex lg:w-[44%] flex-col justify-between bg-[#06231A] text-white overflow-hidden p-10">
      {/* Carrousel photo — en fond, seule la 1ère image est prioritaire.
          Le dégradé reste toujours présent en base : si une photo échoue
          (lien source cassé), elle ne fait que révéler le dégradé, jamais
          un vide. */}
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-[linear-gradient(135deg,#052015_0%,#083D2A_55%,#0A5C3C_100%)]" />
        {photos.map((photo, i) => (
          !failed.has(photo.id) && (
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
                onError={() => setFailed((prev) => new Set(prev).add(photo.id))}
              />
            </div>
          )
        ))}
        <div className="absolute inset-0 bg-gradient-to-t from-[#06231A] via-[#06231A]/70 to-[#06231A]/30" />
      </div>

      {/* Pas de logo ici : déjà affiché dans AuthHeader au-dessus — un seul
          logo par page plutôt qu'un doublon dans ce panneau. */}
      <div className="relative z-10 flex flex-col gap-6">
        <p className="text-white/70 text-sm leading-relaxed max-w-[320px]">{tagline}</p>
      </div>

      {photos.length > 1 && (
        <div className="relative z-10 flex gap-1.5">
          {photos.map((photo, i) => (
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
