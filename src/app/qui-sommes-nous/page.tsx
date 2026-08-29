"use client";

// Page "Qui sommes-nous" (nav publique). Contenu factuel sur ce que la
// plateforme fait réellement aujourd'hui — aucune date de création, aucun
// nom d'équipe/fondateur, aucun chiffre non vérifiable : rien de tout cela
// n'existe de façon fiable dans le produit, donc rien n'est inventé ici.
// Habillage aligné sur la maquette (skill ecoles237-design-system) : même
// hero éditorial, cartes fonctionnalités, section "Comment ça marche" en
// deux parcours (parents / établissements), bannière CTA de fermeture.
import Link from "next/link";
import { Fraunces } from "next/font/google";
import { ShieldCheck, Search, ClipboardList, Building2, ArrowRight } from "lucide-react";
import { SiteHeader, SiteHeaderSpacer } from "@/components/layout/SiteHeader";
import { AnnouncementTicker } from "@/components/hero/AnnouncementTicker";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { TRUST_BADGE_LABELS } from "@/lib/trust/resolveEstablishmentTrustState";
import { useSiteTickerItems } from "@/lib/useSiteTickerItems";

const fraunces = Fraunces({
  subsets: ["latin"],
  style: ["normal", "italic"],
  variable: "--font-fraunces",
  display: "swap",
});

type Tone = "green" | "gold" | "red";

const TONE_STYLES: Record<Tone, string> = {
  green: "bg-gradient-to-br from-[#E9F5EE] to-[#DCEFE3] text-[#0B3B2E]",
  gold: "bg-gradient-to-br from-[#FBEFD8] to-[#F6E3BC] text-[#D6941A]",
  red: "bg-gradient-to-br from-[#FBE4E3] to-[#F6CFCE] text-[#C8202F]",
};

const POINTS: { icon: typeof Search; tone: Tone; title: string; description: string }[] = [
  {
    icon: Search,
    tone: "green",
    title: "Un annuaire centralisé",
    description:
      "Écoles237 référence des établissements scolaires camerounais — garderies, écoles primaires, secondaires, établissements supérieurs et centres de formation — dans un seul répertoire consultable en ligne.",
  },
  {
    icon: ShieldCheck,
    tone: "gold",
    title: `Des établissements ${TRUST_BADGE_LABELS.PLATFORM_VERIFIED.replace("Vérifié", "vérifiés")}`,
    description:
      `Certaines fiches portent un badge « ${TRUST_BADGE_LABELS.PLATFORM_VERIFIED} » lorsque notre équipe a confirmé certaines informations directement auprès de l'établissement — une vérification interne à la plateforme, distincte d'un agrément ministériel.`,
  },
  {
    icon: ClipboardList,
    tone: "red",
    title: "La préinscription en ligne",
    description:
      "Les parents peuvent envoyer une demande de préinscription directement depuis la fiche d'un établissement, et suivre son statut avec un code de suivi.",
  },
  {
    icon: Building2,
    tone: "green",
    title: "Des outils pour les établissements",
    description:
      "Les directeurs peuvent revendiquer la fiche de leur établissement, la tenir à jour, et gérer les demandes d'admission depuis un espace dédié.",
  },
];

const PARENT_STEPS = [
  { title: "Recherchez", description: "Filtrez par ville, niveau et catégorie dans l'annuaire." },
  { title: "Comparez", description: `Consultez les fiches détaillées et le badge « ${TRUST_BADGE_LABELS.PLATFORM_VERIFIED} ».` },
  { title: "Pré-inscrivez", description: "Envoyez une demande et suivez-la avec un code de suivi." },
];

const OWNER_STEPS = [
  { title: "Revendiquez ou créez votre fiche", description: "Prenez le contrôle de votre présence sur Écoles237." },
  { title: "Tenez-la à jour", description: "Informations, catégories, coordonnées — à jour en continu." },
  { title: "Gérez les admissions", description: "Recevez et traitez les demandes depuis votre espace dédié." },
];

// Bandeau tricolore réduit — même motif que sur les autres pages publiques
// (accueil, catégorie) pour marquer les eyebrows de section.
function TricolorBar() {
  return (
    <span
      aria-hidden="true"
      className="inline-block w-6 h-[3px] rounded-full bg-gradient-to-r from-[#1F8A5D] via-[#C8202F] to-[#F2AE1F]"
    />
  );
}

export default function QuiSommesNousPage() {
  const tickerItems = useSiteTickerItems();

  return (
    <div className={`min-h-screen bg-[#FBF6F2] ${fraunces.variable}`}>
      <SiteHeader />
      <SiteHeaderSpacer />
      <AnnouncementTicker items={tickerItems} />

      {/* ── HERO ─────────────────────────────────────────────────────── */}
      <section className="max-w-[1240px] mx-auto px-[18px] pt-16 pb-11">
        <p className="flex items-center gap-2.5 text-xs font-bold uppercase tracking-wider text-[#12543F] mb-3.5">
          <TricolorBar /> Qui sommes-nous
        </p>
        <h1 className="font-[family-name:var(--font-fraunces)] text-3xl md:text-4xl font-semibold text-[#132019] leading-tight max-w-2xl mb-4">
          La plateforme numérique des établissements scolaires du Cameroun.
        </h1>
        <p className="text-base text-[#5A695F] leading-relaxed max-w-xl">
          Écoles237 aide les parents à trouver un établissement scolaire au Cameroun, et aide les
          établissements à se faire connaître et à gérer leurs admissions en ligne.
        </p>
      </section>

      {/* ── CARTES FONCTIONNALITÉS ───────────────────────────────────── */}
      <section className="max-w-[1240px] mx-auto px-[18px] pb-6">
        <div className="grid sm:grid-cols-2 gap-[18px]">
          {POINTS.map((p) => (
            <div
              key={p.title}
              className="bg-white border border-[#E7E0D7] rounded-[18px] p-[28px] hover:-translate-y-1 hover:shadow-[0_20px_34px_-18px_rgba(11,59,46,0.2)] hover:border-transparent transition-all duration-base"
            >
              <div className={`w-[46px] h-[46px] rounded-[13px] flex items-center justify-center mb-[18px] ${TONE_STYLES[p.tone]}`}>
                <p.icon size={20} />
              </div>
              <h2 className="font-semibold text-[17px] text-[#132019] mb-2">{p.title}</h2>
              <p className="text-sm text-[#5A695F] leading-relaxed">{p.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── COMMENT ÇA MARCHE ────────────────────────────────────────── */}
      <section className="max-w-[1240px] mx-auto px-[18px] py-16">
        <div className="max-w-xl mb-10">
          <p className="flex items-center gap-2.5 text-xs font-bold uppercase tracking-wider text-[#12543F] mb-3.5">
            <TricolorBar /> Fonctionnement
          </p>
          <h2 className="font-[family-name:var(--font-fraunces)] text-2xl font-semibold text-[#132019]">
            Comment ça marche
          </h2>
          <p className="text-sm text-[#5A695F] mt-2.5 leading-relaxed">
            Deux parcours simples, selon que vous cherchez une école ou que vous en dirigez une.
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          <div className="bg-white border border-[#E7E0D7] rounded-[20px] p-[28px]">
            <span className="inline-block text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-[#EEF6F1] text-[#12543F] mb-[14px]">
              Parents
            </span>
            <h3 className="font-[family-name:var(--font-fraunces)] text-lg font-semibold text-[#132019] mb-5">
              Trouver une école
            </h3>
            {PARENT_STEPS.map((s, i) => (
              <div key={s.title} className={`flex gap-[14px] ${i < PARENT_STEPS.length - 1 ? "mb-[18px]" : ""}`}>
                <span className="w-7 h-7 rounded-lg shrink-0 flex items-center justify-center font-[family-name:var(--font-fraunces)] font-semibold text-[13px] bg-[#EEF6F1] text-[#0B3B2E]">
                  {i + 1}
                </span>
                <div>
                  <h4 className="font-semibold text-sm text-[#132019] mb-0.5">{s.title}</h4>
                  <p className="text-[13px] text-[#5A695F] leading-relaxed">{s.description}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="bg-white border border-[#E7E0D7] rounded-[20px] p-[28px]">
            <span className="inline-block text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-[#FBEFD8] text-[#D6941A] mb-[14px]">
              Établissements
            </span>
            <h3 className="font-[family-name:var(--font-fraunces)] text-lg font-semibold text-[#132019] mb-5">
              Gérer votre établissement
            </h3>
            {OWNER_STEPS.map((s, i) => (
              <div key={s.title} className={`flex gap-[14px] ${i < OWNER_STEPS.length - 1 ? "mb-[18px]" : ""}`}>
                <span className="w-7 h-7 rounded-lg shrink-0 flex items-center justify-center font-[family-name:var(--font-fraunces)] font-semibold text-[13px] bg-[#FBEFD8] text-[#D6941A]">
                  {i + 1}
                </span>
                <div>
                  <h4 className="font-semibold text-sm text-[#132019] mb-0.5">{s.title}</h4>
                  <p className="text-[13px] text-[#5A695F] leading-relaxed">{s.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── BANNIÈRE CTA ─────────────────────────────────────────────── */}
      <section className="max-w-[1240px] mx-auto px-[18px] pb-16">
        <div className="relative overflow-hidden bg-gradient-to-br from-[#0B3B2E] to-[#12543F] rounded-[24px] p-9 md:p-11 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <span aria-hidden="true" className="absolute -top-16 -right-16 w-56 h-56 rounded-full bg-[#F2AE1F]/25 blur-3xl" />
          <div className="relative">
            <span aria-hidden="true" className="block w-6 h-[3px] rounded-full bg-gradient-to-r from-[#1F8A5D] via-[#C8202F] to-[#F2AE1F] mb-[14px]" />
            <h3 className="font-[family-name:var(--font-fraunces)] text-2xl font-semibold text-white max-w-[420px]">
              Prêt à rejoindre Écoles237 ?
            </h3>
            <p className="text-white/70 text-sm mt-2 max-w-[420px]">
              Que vous cherchiez une école ou que vous en dirigiez une, commencez dès maintenant.
            </p>
          </div>
          <div className="relative flex flex-wrap gap-3">
            <Link
              href="/recherche"
              className="inline-flex items-center gap-2 text-white border border-white/35 px-5 py-3 rounded-[11px] text-sm font-bold hover:bg-white/10 transition-colors duration-base"
            >
              Rechercher une école
            </Link>
            <Link
              href="/auth/inscription"
              className="inline-flex items-center gap-2 bg-[#F2AE1F] text-[#0B3B2E] px-5 py-3 rounded-[11px] text-sm font-bold hover:bg-[#D6941A] transition-colors duration-base"
            >
              Inscrire mon établissement <ArrowRight size={15} />
            </Link>
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
