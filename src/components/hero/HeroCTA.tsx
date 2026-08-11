"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";

// Bouton/CTA du Hero — deux usages : "solid" (bouton pleine largeur, dégradé
// vert, utilisé par HeroSearch) et "link" (lien discret avec flèche, utilisé
// par HeroSlide, sur fond photo/dégradé sombre donc toujours en blanc).
export function HeroCTA({
  href,
  children,
  tone = "solid",
}: {
  href: string;
  children: React.ReactNode;
  tone?: "solid" | "light";
}) {
  if (tone === "solid") {
    return (
      <Link
        href={href}
        className="group inline-flex items-center justify-center gap-2 w-full h-12 rounded-card bg-gradient-to-r from-primary to-primary-dark text-white font-semibold text-sm hover:shadow-elevation-2 hover:-translate-y-0.5 transition-all duration-base"
      >
        {children}
        <ArrowRight size={16} className="group-hover:translate-x-0.5 transition-transform duration-base" />
      </Link>
    );
  }

  return (
    <Link
      href={href}
      className="group inline-flex items-center gap-2 text-sm font-semibold text-white hover:opacity-80 transition-opacity duration-base"
    >
      {children}
      <ArrowRight size={15} className="group-hover:translate-x-0.5 transition-transform duration-base" />
    </Link>
  );
}
