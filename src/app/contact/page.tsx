"use client";

// Page Contact (nav publique). Aucune coordonnée réelle (email/téléphone)
// n'existe aujourd'hui dans le produit ni dans les variables
// d'environnement — les cartes email/téléphone l'assument clairement
// ("Adresse dédiée à venir" / "Ligne directe à venir") plutôt que d'afficher
// une adresse ou un numéro inventés (choix confirmé explicitement plutôt
// que de reproduire les coordonnées placeholder de la maquette).
// RELEASE-CONSOLIDATION-08 §30 — reworded from a bare "Bientôt disponible"
// to something more specific, to avoid stacking the same generic label
// across the page; still no fabricated contact detail. Les vrais parcours
// déjà opérationnels (recherche, inscription d'établissement) sont mis en
// avant à la place, en plus des réseaux sociaux — mêmes placeholders
// décoratifs que le footer, aucun compte réel n'existe encore.
import Link from "next/link";
import { Fraunces } from "next/font/google";
import { Mail, Phone, Share2, Search, Building2 } from "lucide-react";
import { SiteHeader, SiteHeaderSpacer } from "@/components/layout/SiteHeader";
import { AnnouncementTicker } from "@/components/hero/AnnouncementTicker";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { useSiteTickerItems } from "@/lib/useSiteTickerItems";

const fraunces = Fraunces({
  subsets: ["latin"],
  style: ["normal", "italic"],
  variable: "--font-fraunces",
  display: "swap",
});

// Mêmes placeholders décoratifs que SiteFooter.tsx — aucun compte réel
// n'existe encore, donc pas de <a> pointant vers une URL inventée.
const SOCIAL_PLACEHOLDERS = [
  { id: "linkedin", initials: "in" },
  { id: "instagram", initials: "ig" },
  { id: "tiktok", initials: "tt" },
];

function TricolorBar() {
  return (
    <span
      aria-hidden="true"
      className="inline-block w-6 h-[3px] rounded-full bg-gradient-to-r from-[#1F8A5D] via-[#C8202F] to-[#F2AE1F]"
    />
  );
}

export default function ContactPage() {
  const tickerItems = useSiteTickerItems();

  return (
    <div className={`min-h-screen bg-[#FBF6F2] ${fraunces.variable}`}>
      <SiteHeader />
      <SiteHeaderSpacer />
      <AnnouncementTicker items={tickerItems} />

      {/* ── HERO ─────────────────────────────────────────────────────── */}
      <section className="max-w-[1240px] mx-auto px-[18px] pt-16 pb-2 text-center">
        <p className="flex items-center justify-center gap-2.5 text-xs font-bold uppercase tracking-wider text-[#12543F] mb-3.5">
          <TricolorBar /> Contact
        </p>
        <h1 className="font-[family-name:var(--font-fraunces)] text-4xl font-semibold text-[#132019] mb-3.5">
          Parlons-en
        </h1>
        <p className="text-[15px] text-[#5A695F] leading-relaxed max-w-[520px] mx-auto">
          Une question, un partenariat, une remarque ? Nos canaux de contact directs arrivent bientôt —
          en attendant, voici comment avancer selon votre besoin.
        </p>
      </section>

      {/* ── CANAUX ───────────────────────────────────────────────────── */}
      <section className="max-w-[1240px] mx-auto px-[18px] pt-12 pb-2">
        <div className="grid sm:grid-cols-3 gap-5">
          <div className="bg-white border border-[#E7E0D7] rounded-[18px] p-[30px_26px] text-center hover:-translate-y-1 hover:shadow-[0_22px_38px_-18px_rgba(11,59,46,0.22)] hover:border-transparent transition-all duration-base">
            <div className="w-[52px] h-[52px] rounded-[14px] mx-auto mb-[18px] flex items-center justify-center bg-gradient-to-br from-[#E9F5EE] to-[#DCEFE3] text-[#0B3B2E]">
              <Mail size={22} />
            </div>
            <h3 className="text-[15px] font-semibold text-[#132019] mb-1.5">Par email</h3>
            <p className="font-[family-name:var(--font-fraunces)] font-semibold text-base text-[#5A695F]">
              Adresse dédiée à venir
            </p>
          </div>

          <div className="bg-white border border-[#E7E0D7] rounded-[18px] p-[30px_26px] text-center hover:-translate-y-1 hover:shadow-[0_22px_38px_-18px_rgba(11,59,46,0.22)] hover:border-transparent transition-all duration-base">
            <div className="w-[52px] h-[52px] rounded-[14px] mx-auto mb-[18px] flex items-center justify-center bg-gradient-to-br from-[#FBEFD8] to-[#F6E3BC] text-[#D6941A]">
              <Phone size={22} />
            </div>
            <h3 className="text-[15px] font-semibold text-[#132019] mb-1.5">Par téléphone</h3>
            <p className="font-[family-name:var(--font-fraunces)] font-semibold text-base text-[#5A695F]">
              Ligne directe à venir
            </p>
          </div>

          <div className="bg-white border border-[#E7E0D7] rounded-[18px] p-[30px_26px] text-center hover:-translate-y-1 hover:shadow-[0_22px_38px_-18px_rgba(11,59,46,0.22)] hover:border-transparent transition-all duration-base">
            <div className="w-[52px] h-[52px] rounded-[14px] mx-auto mb-[18px] flex items-center justify-center bg-gradient-to-br from-[#FBE4E3] to-[#F6CFCE] text-[#C8202F]">
              <Share2 size={22} />
            </div>
            <h3 className="text-[15px] font-semibold text-[#132019] mb-3">Réseaux sociaux</h3>
            <p className="text-sm text-[#5A695F] mb-[18px]">Suivez l&apos;actualité Écoles237</p>
            <div className="flex items-center justify-center gap-2.5">
              {SOCIAL_PLACEHOLDERS.map((s) => (
                <span
                  key={s.id}
                  aria-hidden="true"
                  className="w-[42px] h-[42px] rounded-[11px] bg-[#F6F1E8] border border-[#E7E0D7] flex items-center justify-center text-xs font-bold text-[#5A695F]"
                >
                  {s.initials}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── FAQ ──────────────────────────────────────────────────────── */}
      <section className="max-w-[1240px] mx-auto px-[18px] py-16">
        <div className="text-center mb-9">
          <p className="flex items-center justify-center gap-2.5 text-xs font-bold uppercase tracking-wider text-[#12543F] mb-3.5">
            <TricolorBar /> Avant d&apos;écrire
          </p>
          <h2 className="font-[family-name:var(--font-fraunces)] text-2xl font-semibold text-[#132019]">
            Questions fréquentes
          </h2>
        </div>

        <div className="max-w-[760px] mx-auto flex flex-col gap-3.5">
          <div className="bg-white border border-[#E7E0D7] rounded-[14px] p-5">
            <h4 className="flex items-center gap-2.5 text-[15px] font-semibold text-[#132019] mb-1.5">
              <Search size={16} className="text-[#12543F] shrink-0" />
              Je cherche une école pour mon enfant, dois-je vous écrire ?
            </h4>
            <p className="text-[13.5px] text-[#5A695F] leading-relaxed pl-[26px]">
              Pas besoin de nous contacter pour ça : utilisez directement{" "}
              <Link href="/recherche" className="text-[#12543F] font-semibold">
                l&apos;annuaire de recherche
              </Link>
              , avec les filtres par ville, niveau et catégorie.
            </p>
          </div>

          <div className="bg-white border border-[#E7E0D7] rounded-[14px] p-5">
            <h4 className="flex items-center gap-2.5 text-[15px] font-semibold text-[#132019] mb-1.5">
              <Building2 size={16} className="text-[#12543F] shrink-0" />
              Je dirige un établissement, comment l&apos;inscrire ?
            </h4>
            <p className="text-[13.5px] text-[#5A695F] leading-relaxed pl-[26px]">
              Rendez-vous sur{" "}
              <Link href="/auth/inscription" className="text-[#12543F] font-semibold">
                « Inscrire mon école »
              </Link>{" "}
              dans le menu — vous pourrez créer et gérer votre fiche directement, sans passer par cette page.
            </p>
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
