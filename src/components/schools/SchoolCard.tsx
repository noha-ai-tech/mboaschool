"use client";

import Link from "next/link";
import { useState } from "react";
import { CheckCircle2, Heart } from "lucide-react";
import { formatQuartierCity } from "@/lib/formatSchoolLocation";
import { TRUST_BADGE_LABELS } from "@/lib/trust/resolveEstablishmentTrustState";

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
  /** SPRINT REGISTRY-NATIONAL-A.1 — dérivé de `establishments.is_verified`
   * (PLATFORM_VERIFIED uniquement, jamais une preuve ministérielle). Le
   * libellé affiché vient de TRUST_BADGE_LABELS.PLATFORM_VERIFIED — ne
   * jamais réafficher le mot nu "Vérifié" ici. */
  verified: boolean;
  isFeatured: boolean;
  isClaimed: boolean;
};

// Vignette en bloc de couleur de marque — jamais une photo d'établissement
// non vérifiée visuellement (beaucoup de photos réelles sont absentes ou de
// qualité inégale), ni un aplat gris générique. Palette qui tourne par
// position dans le carrousel, uniquement décorative (ne prétend rien sur
// l'établissement) — mêmes teintes que la maquette de référence.
const THUMBNAIL_TONES: [string, string][] = [
  ["#2E7A5A", "#0B3B2E"],
  ["#3C6E8F", "#0B3B2E"],
  ["#8C6A2E", "#0B3B2E"],
  ["#5C3E7A", "#0B3B2E"],
];

export function SchoolCard({ school, toneIndex = 0 }: { school: FeaturedSchool; toneIndex?: number }) {
  const href = school.isClaimed ? `/ecole/${school.id}` : `/auth/inscription?ecole=${school.id}`;
  const [liked, setLiked] = useState(false);
  const [tone1, tone2] = THUMBNAIL_TONES[toneIndex % THUMBNAIL_TONES.length];

  return (
    <Link
      href={href}
      className="group block bg-white rounded-[18px] overflow-hidden border border-[#E7E0D7] shadow-[0_8px_24px_-14px_rgba(11,59,46,0.2)] hover:shadow-[0_16px_34px_-14px_rgba(11,59,46,0.26)] hover:-translate-y-0.5 transition-all duration-base"
    >
      <div
        className="relative aspect-[16/10] overflow-hidden"
        style={{ background: `linear-gradient(150deg, ${tone1}, ${tone2})` }}
      >
        {/* Empilés verticalement (pas côte à côte) : quand un établissement
            cumule les deux badges, un alignement horizontal les serre l'un
            contre l'autre jusqu'à les rogner sur les cartes étroites. */}
        <div className="absolute top-2.5 left-2.5 right-11 flex flex-col items-start gap-1.5">
          {school.isFeatured && (
            <span className="bg-[#F2AE1F] text-[#0B3B2E] text-[10px] font-black px-2 py-1 rounded-full tracking-wide whitespace-nowrap">
              À la une
            </span>
          )}
          {school.verified && (
            <span className="inline-flex items-center gap-1 whitespace-nowrap bg-white/90 backdrop-blur-sm text-[#0B3B2E] text-[9px] font-bold px-2 py-1 rounded-full">
              <CheckCircle2 size={10} className="shrink-0" /> {TRUST_BADGE_LABELS.PLATFORM_VERIFIED}
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setLiked((v) => !v); }}
          aria-label={liked ? "Retirer des favoris" : "Ajouter aux favoris"}
          aria-pressed={liked}
          className="absolute top-2.5 right-2.5 w-8 h-8 flex items-center justify-center rounded-full bg-white/85 backdrop-blur-sm text-[#5A695F] hover:text-red-500 transition-colors duration-base"
        >
          <Heart size={14} className={liked ? "fill-red-500 text-red-500" : ""} />
        </button>
      </div>

      <div className="p-3.5">
        <p className="font-bold text-sm leading-snug line-clamp-1 text-[#132019]">{school.name}</p>
        {(() => {
          const location = formatQuartierCity(school.quartier, school.city);
          return location ? <p className="text-xs text-[#5A695F] mt-1">{location}</p> : null;
        })()}
        {(school.category || school.subcategory) && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {school.category && (
              <span className="text-[10px] font-semibold bg-[#F4F3EF] text-[#5A695F] px-2 py-0.5 rounded-full capitalize">
                {school.category}
              </span>
            )}
            {school.subcategory && (
              <span className="text-[10px] font-semibold bg-[#F4F3EF] text-[#5A695F] px-2 py-0.5 rounded-full">
                {school.subcategory}
              </span>
            )}
          </div>
        )}
      </div>
    </Link>
  );
}
