"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Logo } from "@/components/branding/Logo";
import { useShowcasePhotos } from "@/lib/useShowcasePhotos";

const DEFAULT_BENEFITS = [
  "Gérez votre fiche établissement",
  "Recevez les préinscriptions",
  "Accédez aux outils de gestion",
];

// Panneau de branding du parcours revendication/inscription d'établissement.
// Même grammaire visuelle que AuthBranding (Connexion V3) : fond vert très
// sombre, carrousel photo réel en fond (max 3, jamais de stock/IA), aucune
// icône décorative. Titre/sous-titre/bénéfices configurables : la copie
// diffère selon qu'on est sur l'écran de choix ou sur la revendication
// d'un établissement déjà identifié.
export function ClaimBranding({
  title = "Votre établissement mérite une présence professionnelle.",
  subtitle = "Prenez le contrôle de votre fiche et accédez aux outils Écoles237.",
  benefits = DEFAULT_BENEFITS,
}: {
  title?: string;
  subtitle?: string;
  benefits?: string[];
}) {
  const photos = useShowcasePhotos(3);
  const [active, setActive] = useState(0);
  const [failed, setFailed] = useState<Set<string>>(new Set());
  const visiblePhotos = photos.filter((p) => !failed.has(p.id));

  useEffect(() => {
    if (active >= visiblePhotos.length) setActive(0);
  }, [visiblePhotos.length, active]);

  useEffect(() => {
    if (visiblePhotos.length <= 1) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) return;
    const timer = setInterval(() => setActive((i) => (i + 1) % visiblePhotos.length), 8000);
    return () => clearInterval(timer);
  }, [visiblePhotos.length]);

  return (
    <div className="relative hidden lg:flex lg:w-[44%] flex-col justify-between bg-[#06231A] text-white overflow-hidden p-10">
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-[linear-gradient(135deg,#052015_0%,#083D2A_55%,#0A5C3C_100%)]" />
        {visiblePhotos.map((photo, i) => (
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
              className="object-cover"
              onError={() => setFailed((prev) => new Set(prev).add(photo.id))}
            />
          </div>
        ))}
        <div className="absolute inset-0 bg-gradient-to-t from-[#06231A] via-[#06231A]/70 to-[#06231A]/30" />
      </div>

      <div className="relative z-10 flex flex-col gap-6">
        <Link href="/" className="inline-flex items-center">
          <Logo variant="dark" size="md" priority />
        </Link>
        <div>
          <h1 className="text-2xl font-bold leading-snug">{title}</h1>
          <p className="text-white/70 text-sm mt-2 max-w-[340px]">{subtitle}</p>
        </div>
      </div>

      <div className="relative z-10 flex flex-col gap-5">
        {visiblePhotos.length > 1 && (
          <div className="flex gap-1.5">
            {visiblePhotos.map((photo, i) => (
              <button
                key={photo.id}
                onClick={() => setActive(i)}
                aria-label={`Voir la photo ${i + 1}`}
                className={`h-1.5 rounded-full transition-all duration-base ${i === active ? "w-6 bg-white" : "w-1.5 bg-white/40 hover:bg-white/60"}`}
              />
            ))}
          </div>
        )}
        <ul className="space-y-2.5">
          {benefits.map((benefit) => (
            <li key={benefit} className="flex items-center gap-2.5 text-sm text-white/85">
              <span className="shrink-0 w-1 h-1 rounded-full bg-white" aria-hidden="true" />
              {benefit}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
