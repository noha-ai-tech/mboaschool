"use client";

import Link from "next/link";

// Bloc "Pour les établissements" — vert profond Écoles237, dégradé uni,
// jamais une bannière publicitaire agressive.
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
    <div className="relative overflow-hidden bg-gradient-to-br from-[#12543F] to-[#0B3B2E] text-white rounded-[20px] p-5">
      <div className="relative">
        <p className="text-xs font-semibold tracking-wider uppercase text-[#F2AE1F] mb-3">{eyebrow}</p>
        <p className="font-[family-name:var(--font-fraunces)] font-semibold text-lg leading-snug mb-2">{title}</p>
        <p className="text-sm text-white/75 leading-relaxed mb-4">{description}</p>
        <Link
          href={ctaHref}
          className="flex items-center justify-center gap-2 w-full bg-white text-[#0B3B2E] px-4 py-2.5 rounded-[10px] text-sm font-bold hover:bg-white/90 transition-colors duration-base"
        >
          {ctaLabel}
        </Link>
      </div>
    </div>
  );
}
