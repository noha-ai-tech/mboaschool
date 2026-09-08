import Link from "next/link";
import { Logo } from "@/components/branding/Logo";

// Footer public partagé — toutes les pages publiques et d'authentification
// l'utilisent tel quel (jamais un footer dupliqué/différent par page). Deux
// zones de couleur : vert très sombre (nav), noir-vert profond (copyright).
//
// Icônes réseaux sociaux : aucun compte réel n'existe encore côté produit —
// affichées à titre décoratif (pas de <a href> pointant vers une URL
// inventée) plutôt que de fabriquer des liens morts.
// TODO(Aurélie/Eddy) : remplacer par les vraies URLs (Instagram, TikTok,
// LinkedIn…) dès qu'elles existent, et transformer ces spans en vrais liens.
const SOCIAL_PLACEHOLDERS = [
  { id: "linkedin", initials: "in" },
  { id: "tiktok", initials: "tt" },
  { id: "instagram", initials: "ig" },
];

// Colonne "Légal" : Mentions légales / Confidentialité n'ont pas encore de
// page réelle dans le produit — plutôt que de créer un lien mort, elles
// restent en texte simple jusqu'à ce que ces pages existent.
// TODO(Aurélie) : créer /mentions-legales et /confidentialite, puis
// remplacer ces <span> par des <Link>.
const LEGAL_LINKS = ["Mentions légales", "Confidentialité"];

export function SiteFooter() {
  return (
    <>
      <footer className="bg-[#0B3B2E] text-white">
        <div className="max-w-[1520px] mx-auto px-[18px] py-16 grid md:grid-cols-5 gap-10">
          <div className="md:col-span-2">
            <Link href="/" className="inline-block">
              <Logo variant="dark" />
            </Link>
            <p className="text-white/50 text-sm mt-4 leading-relaxed max-w-[280px]">
              L&apos;annuaire scolaire de référence au Cameroun. Trouvez, comparez et pré-inscrivez votre enfant en
              toute confiance.
            </p>
            <div className="flex items-center gap-2.5 mt-5">
              {SOCIAL_PLACEHOLDERS.map((s) => (
                <span
                  key={s.id}
                  aria-hidden="true"
                  className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center text-xs font-bold text-white/60"
                >
                  {s.initials}
                </span>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold tracking-wider uppercase text-[#F2AE1F]/80 mb-4">Navigation</p>
            <div className="space-y-2.5">
              <Link href="/" className="block text-sm text-white/60 hover:text-white transition-colors duration-base">Accueil</Link>
              <Link href="/recherche" className="block text-sm text-white/60 hover:text-white transition-colors duration-base">Toutes les écoles</Link>
              <Link href="/qui-sommes-nous" className="block text-sm text-white/60 hover:text-white transition-colors duration-base">À propos</Link>
              <Link href="/contact" className="block text-sm text-white/60 hover:text-white transition-colors duration-base">Contact</Link>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold tracking-wider uppercase text-[#F2AE1F]/80 mb-4">Établissements</p>
            <div className="space-y-2.5">
              <Link href="/auth/inscription" className="block text-sm text-white/60 hover:text-white transition-colors duration-base">Inscrire mon école</Link>
              <Link href="/dashboard/ecole" className="block text-sm text-white/60 hover:text-white transition-colors duration-base">Espace établissement</Link>
              <Link href="/preinscription" className="block text-sm text-white/60 hover:text-white transition-colors duration-base">Pré-inscription en ligne</Link>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold tracking-wider uppercase text-[#F2AE1F]/80 mb-4">Légal</p>
            <div className="space-y-2.5">
              {LEGAL_LINKS.map((label) => (
                <span key={label} className="block text-sm text-white/40">{label}</span>
              ))}
            </div>
          </div>
        </div>
      </footer>

      <div className="bg-[#08251B]">
        <div className="max-w-[1520px] mx-auto px-[18px] py-5 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-white/40">
          <p>© {new Date().getFullYear()} Écoles237. Tous droits réservés.</p>
          <span
            aria-hidden="true"
            className="w-14 h-1 rounded-full bg-gradient-to-r from-[#1F8A5D] via-[#C8202F] to-[#F2AE1F] opacity-80"
          />
        </div>
      </div>
    </>
  );
}
