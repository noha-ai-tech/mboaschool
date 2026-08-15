"use client";

import Link from "next/link";
import { Logo } from "@/components/branding/Logo";
import { categories } from "@/lib/categories";

// Header des pages d'authentification — même grammaire visuelle que le
// header public (logo réel, noir profond, CTA vert) mais autonome : pas
// d'état de recherche/menu partagé avec la page d'accueil. La consigne
// autorise explicitement une navigation simplifiée ici plutôt que de
// dupliquer l'état complexe du header de la Landing.
export function AuthHeader() {
  return (
    <header className="bg-[#0A0A0A]">
      <div className="max-w-[1520px] mx-auto px-[18px] h-24 flex items-center gap-8">
        <Link href="/" className="shrink-0 flex items-center">
          <Logo variant="dark" size="lg" priority />
        </Link>

        <nav className="hidden lg:flex items-center gap-1 ml-4">
          {categories.map((cat) => (
            <Link
              key={cat.key}
              href={`/categorie/${cat.key}`}
              className="px-3 py-2 text-sm font-medium text-white/70 hover:text-white transition-colors duration-base"
            >
              {cat.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-4 ml-auto">
          <Link href="/auth/connexion" className="text-sm font-semibold text-white/80 hover:text-white transition-colors duration-base">
            Connexion
          </Link>
          <Link
            href="/auth/inscription"
            className="inline-flex items-center h-10 px-4 rounded-card bg-gradient-to-r from-primary to-primary-dark text-white text-sm font-semibold hover:shadow-elevation-1 transition-all duration-base"
          >
            Inscrire mon école
          </Link>
        </div>
      </div>
    </header>
  );
}
