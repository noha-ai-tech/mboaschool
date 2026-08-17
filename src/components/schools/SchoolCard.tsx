"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { CheckCircle2, Heart } from "lucide-react";
import { formatQuartierCity } from "@/lib/formatSchoolLocation";

// Carte établissement "premium" — utilisée par le carrousel Établissements à
// la une. Volontairement plus légère que la carte des résultats principaux
// (hors périmètre) : uniquement les informations réelles et utiles. Aucune
// note ni avis (le champ n'existe pas côté données). Le cœur est un simple
// repli visuel local (jamais persisté, jamais présenté comme une vraie
// fonctionnalité "favoris" sauvegardée) — aucune logique métier inventée.
export type FeaturedSchool = {
  id: string;
  name: string;
  city: string | null;
  quartier: string | null;
  category: string;
  subcategory: string;
  image: string | null;
  verified: boolean;
  isFeatured: boolean;
  isClaimed: boolean;
};

export function SchoolCard({ school, priority = false }: { school: FeaturedSchool; priority?: boolean }) {
  const href = school.isClaimed ? `/ecole/${school.id}` : `/auth/inscription?ecole=${school.id}`;
  const [imgFailed, setImgFailed] = useState(false);
  const [liked, setLiked] = useState(false);
  const showImage = school.image && !imgFailed;

  return (
    <Link
      href={href}
      className="group block bg-white rounded-[18px] overflow-hidden border border-border shadow-elevation-1 hover:shadow-elevation-2 hover:-translate-y-0.5 transition-all duration-base"
    >
      <div className="relative aspect-[16/10] overflow-hidden bg-muted">
        {showImage ? (
          <Image
            src={school.image as string}
            alt={`Photo de ${school.name}`}
            fill
            priority={priority}
            sizes="(max-width: 640px) 85vw, (max-width: 1024px) 30vw, 22vw"
            className="object-cover group-hover:scale-[1.025] transition-transform duration-base"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-primary-light" aria-hidden="true">
            <span className="text-primary/30 text-lg font-black tracking-tight">237</span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent pointer-events-none" />

        <div className="absolute top-2.5 left-2.5 flex gap-1.5">
          {school.isFeatured && (
            <span className="bg-[#FCD116] text-[#0A0A0A] text-[10px] font-black px-2 py-1 rounded-full tracking-wide">
              À la une
            </span>
          )}
          {school.verified && (
            <span className="inline-flex items-center gap-1 bg-white/90 backdrop-blur-sm text-primary text-[10px] font-bold px-2 py-1 rounded-full">
              <CheckCircle2 size={10} /> Vérifié
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setLiked((v) => !v); }}
          aria-label={liked ? "Retirer des favoris" : "Ajouter aux favoris"}
          aria-pressed={liked}
          className="absolute top-2.5 right-2.5 w-8 h-8 flex items-center justify-center rounded-full bg-white/85 backdrop-blur-sm text-text-secondary hover:text-red-500 transition-colors duration-base"
        >
          <Heart size={14} className={liked ? "fill-red-500 text-red-500" : ""} />
        </button>
      </div>

      <div className="p-3.5">
        <p className="font-bold text-sm leading-snug line-clamp-1">{school.name}</p>
        {(() => {
          const location = formatQuartierCity(school.quartier, school.city);
          return location ? <p className="text-xs text-text-secondary mt-1">{location}</p> : null;
        })()}
        {(school.category || school.subcategory) && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {school.category && (
              <span className="text-[10px] font-semibold bg-muted text-text-secondary px-2 py-0.5 rounded-full capitalize">
                {school.category}
              </span>
            )}
            {school.subcategory && (
              <span className="text-[10px] font-semibold bg-muted text-text-secondary px-2 py-0.5 rounded-full">
                {school.subcategory}
              </span>
            )}
          </div>
        )}
      </div>
    </Link>
  );
}
