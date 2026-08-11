"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowRight } from "lucide-react";

// Carte catégorie — icône premium plutôt que photo (aucune photo dédiée à
// une catégorie n'existe/n'est fiable de façon réaliste ; l'icône évite
// aussi toute dépendance à une photo d'établissement réel qui pourrait
// changer ou manquer).
export function CategoryCard({
  href,
  label,
  description,
  count,
  loading,
  icon: Icon,
}: {
  href: string;
  label: string;
  description: string;
  count: number;
  loading: boolean;
  icon: LucideIcon;
}) {
  return (
    <Link
      href={href}
      className="group shrink-0 w-[72%] sm:w-auto snap-start bg-white rounded-[18px] border border-border p-5 shadow-elevation-1 hover:shadow-elevation-2 hover:-translate-y-0.5 transition-all duration-base text-center flex flex-col items-center"
    >
      <div className="w-14 h-14 rounded-full bg-primary-light flex items-center justify-center mb-3 group-hover:bg-primary transition-colors duration-base">
        <Icon size={24} className="text-primary group-hover:text-white transition-colors duration-base" />
      </div>
      <div className="flex items-center gap-1.5">
        <p className="font-bold text-sm text-text-primary">{label}</p>
        <ArrowRight size={12} className="text-text-secondary group-hover:text-primary group-hover:translate-x-0.5 transition-all duration-base" aria-hidden="true" />
      </div>
      <p className="text-xs text-text-secondary mt-0.5">{description}</p>
      <p className="text-xs text-text-secondary/70 mt-1.5">
        {loading ? "—" : `${count} établissement${count !== 1 ? "s" : ""}`}
      </p>
    </Link>
  );
}
