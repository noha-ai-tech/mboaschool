"use client";

import Link from "next/link";

// Bloc "Pour les établissements" — vert profond Écoles237, motif géométrique
// très discret (3-6% opacité), jamais une bannière publicitaire agressive.
export function PromotionCard({
  eyebrow,
  title,
  description,
  ctaLabel,
  ctaHref,
}: {
  eyebrow: string;
  title: string;
  description: string;
  ctaLabel: string;
  ctaHref: string;
}) {
  return (
    <div className="relative overflow-hidden bg-gradient-to-br from-primary to-primary-dark text-white rounded-[20px] p-5">
      <svg
        aria-hidden="true"
        className="absolute inset-0 w-full h-full opacity-[0.05] pointer-events-none"
        preserveAspectRatio="xMidYMid slice"
      >
        <pattern id="promo-card-motif" width="40" height="40" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="40" height="40" fill="none" />
          <path d="M20 0 L40 20 L20 40 L0 20 Z" fill="none" stroke="currentColor" strokeWidth="1" />
        </pattern>
        <rect width="100%" height="100%" fill="url(#promo-card-motif)" />
      </svg>

      <div className="relative">
        <p className="text-xs font-semibold tracking-wider uppercase text-[#FCD116] mb-3">{eyebrow}</p>
        <p className="font-bold text-lg leading-snug mb-2">{title}</p>
        <p className="text-sm text-white/75 leading-relaxed mb-4">{description}</p>
        <Link
          href={ctaHref}
          className="flex items-center justify-center gap-2 w-full bg-white text-primary px-4 py-2.5 rounded-[10px] text-sm font-bold hover:bg-white/90 transition-colors duration-base"
        >
          {ctaLabel}
        </Link>
      </div>
    </div>
  );
}
