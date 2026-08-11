"use client";

import Link from "next/link";
import Image from "next/image";

export type SchoolBannerData = {
  image: string;
  title: string;
  description?: string | null;
  ctaLabel?: string;
  ctaHref?: string;
};

// Bannière Premium — UI préparée pour les établissements Premium (image,
// titre, description, CTA), sans logique métier Premium codée ici. Reste
// invisible tant qu'aucune donnée réelle n'est fournie : jamais de contenu
// promotionnel inventé pour un établissement qui n'a rien publié.
export function SchoolBanner({ data }: { data: SchoolBannerData | null }) {
  if (!data) return null;

  return (
    <div className="relative overflow-hidden rounded-card bg-accent text-white">
      <div className="absolute inset-0">
        <Image src={data.image} alt="" fill sizes="(max-width: 1024px) 100vw, 60vw" className="object-cover opacity-40" />
      </div>
      <div className="relative p-6">
        <p className="font-bold text-lg mb-1.5">{data.title}</p>
        {data.description && <p className="text-sm text-white/75 leading-relaxed mb-4">{data.description}</p>}
        {data.ctaLabel && data.ctaHref && (
          <Link
            href={data.ctaHref}
            className="inline-flex items-center gap-2 h-10 px-4 rounded-card bg-[#FCD116] text-[#0A0A0A] text-sm font-bold hover:bg-[#FCD116]/90 transition-colors duration-base"
          >
            {data.ctaLabel}
          </Link>
        )}
      </div>
    </div>
  );
}
