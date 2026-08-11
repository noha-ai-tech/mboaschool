"use client";

import Link from "next/link";
import { Logo } from "@/components/branding/Logo";
import { Newsletter } from "@/components/landing/Newsletter";
import { categories } from "@/lib/categories";

// Footer public partagé — Landing V4 et pages d'authentification l'utilisent
// tel quel (jamais un footer dupliqué/différent par page). Deux zones de
// couleur : vert très sombre (nav + newsletter), noir profond (copyright).
// Support/Téléchargements/Contacts/Réseaux sociaux ne sont pas construits :
// aucune page d'aide, aucune app mobile, aucune adresse de contact ni compte
// social réels n'existent aujourd'hui dans le produit — mieux vaut l'absence
// qu'un lien mort ou inventé.
export function SiteFooter() {
  return (
    <>
      <footer className="bg-[#062018] text-white">
        <div className="max-w-[1520px] mx-auto px-[18px] py-16 grid md:grid-cols-5 gap-10">
          <div className="md:col-span-2">
            <Link href="/" className="inline-block">
              <Logo variant="dark" />
            </Link>
            <p className="text-white/50 text-sm mt-4 leading-relaxed max-w-[260px]">
              La plateforme camerounaise pour trouver et gérer un établissement scolaire.
            </p>
          </div>

          <div>
            <p className="text-xs font-semibold tracking-wider uppercase text-[#FCD116]/80 mb-4">Écoles</p>
            <div className="space-y-2.5">
              {categories.map((cat) => (
                <Link key={cat.key} href={`/categorie/${cat.key}`} className="block text-sm text-white/60 hover:text-white transition-colors duration-base">
                  {cat.label}
                </Link>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold tracking-wider uppercase text-[#FCD116]/80 mb-4">Parents</p>
            <div className="space-y-2.5">
              <Link href="/recherche" className="block text-sm text-white/60 hover:text-white transition-colors duration-base">Rechercher une école</Link>
              <Link href="/preinscription" className="block text-sm text-white/60 hover:text-white transition-colors duration-base">Préinscription en ligne</Link>
              <Link href="/suivi-admission" className="block text-sm text-white/60 hover:text-white transition-colors duration-base">Suivre mon dossier</Link>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold tracking-wider uppercase text-[#FCD116]/80 mb-4">Directeurs</p>
            <div className="space-y-2.5">
              <Link href="/auth/inscription" className="block text-sm text-white/60 hover:text-white transition-colors duration-base">Inscrire mon établissement</Link>
              <Link href="/auth/connexion" className="block text-sm text-white/60 hover:text-white transition-colors duration-base">Connexion</Link>
            </div>
          </div>
        </div>

        <div className="border-t border-white/10">
          <div className="max-w-[1520px] mx-auto px-[18px] py-10">
            <div className="max-w-sm">
              <Newsletter />
            </div>
          </div>
        </div>
      </footer>

      <div className="bg-[#0A0A0A]">
        <div className="max-w-[1520px] mx-auto px-[18px] py-5 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-white/40">
          <p>© {new Date().getFullYear()} Écoles237. Tous droits réservés.</p>
          <div className="flex items-center gap-4">
            <span>Confidentialité</span>
            <span>Conditions</span>
            <span>Cookies</span>
            <span className="flex items-center gap-1">
              Fait avec <span aria-hidden="true">❤️</span> au Cameroun
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
