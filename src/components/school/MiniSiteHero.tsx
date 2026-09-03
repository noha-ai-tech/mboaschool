"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Phone, MessageCircle, Navigation as NavigationIcon, Globe, CheckCircle2, Crown, ArrowRight } from "lucide-react";
import type { SchoolHeroSlide } from "@/components/school/SchoolHeroCarousel";

// PUBLIC-SITE-01 §4A — mini-site hero. Deliberately a NEW component rather
// than a rewrite of SchoolHeroCarousel (still used by the CMS live editor +
// draft Preview, out of scope for this mission — §10/§16). Reuses the same
// resolved slide list, just a different overlay layout (headline + quick
// contact card instead of the directory-style back-link/category chips).
//
// PUBLIC-SITE-02 §9 — no fabricated marketing copy. Only real,
// school-provided data is ever shown: `name` (always present), `motto`
// (CMS-editable `devise`, PUBLIC-SITE-02), `description` (CMS-editable
// presentation). When motto and description are both absent, the hero
// simply shows the name alone — a neutral layout, never invented text.
//
// GUYSKULL-06C §9 — the secondary CTA is deliberately a neutral navigation
// link ("Formations & admissions" → the admissions view), never a bold
// "Admissions ouvertes" claim derived from a demo/default toggle. The
// actual is_open-aware messaging still lives inside the admissions
// preview card and the Formations & Admissions page, where there's room
// for the right context — not shouted from the hero.
export function MiniSiteHero({
  slides,
  name,
  motto,
  description,
  phone,
  whatsapp,
  mapsHref,
  website,
  discoverHref,
  admissionsHref,
  showAdmissionsCta,
  trustBadge,
  premium,
}: {
  slides: SchoolHeroSlide[];
  name: string;
  motto?: string | null;
  description: string | null;
  phone: string | null;
  whatsapp: string | null;
  mapsHref: string | null;
  website: string | null;
  /** GUYSKULL-05 — a real route (L'établissement view), not a client-state callback. */
  discoverHref: string;
  /** GUYSKULL-06C — a real route (Formations & Admissions view), replacing the old is_open-derived preinscription CTA. */
  admissionsHref: string;
  showAdmissionsCta: boolean;
  trustBadge?: { label: string } | null;
  premium?: boolean;
}) {
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (slides.length <= 1) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) return;
    const timer = setInterval(() => setActive((i) => (i + 1) % slides.length), 6000);
    return () => clearInterval(timer);
  }, [slides.length]);

  const quickActions = [
    phone ? { icon: Phone, label: "Appeler", href: `tel:${phone}`, external: false } : null,
    whatsapp ? { icon: MessageCircle, label: "WhatsApp", href: `https://wa.me/${whatsapp.replace(/\D/g, "")}`, external: true } : null,
    mapsHref ? { icon: NavigationIcon, label: "Itinéraire", href: mapsHref, external: true } : null,
    website ? { icon: Globe, label: "Site officiel", href: website, external: true } : null,
  ].filter(Boolean) as { icon: typeof Phone; label: string; href: string; external: boolean }[];

  // GUYSKULL-06C §10 — adaptive contact card: a single action gets a
  // compact one-line treatment instead of a half-empty full card.
  const isCompactContact = quickActions.length === 1;

  return (
    <section className="relative text-white" style={{ background: "var(--school-primary-dark, #0A0F0D)" }}>
      <div className="relative h-[500px] lg:h-[620px] overflow-hidden">
        {slides.map((slide, i) => (
          <div key={slide.id} aria-hidden={i !== active} className={`absolute inset-0 transition-opacity duration-slow ease-out ${i === active ? "opacity-100" : "opacity-0"}`}>
            <Image src={slide.image} alt="" fill priority={i === 0} sizes="100vw" className="object-cover" />
          </div>
        ))}
        {slides.length === 0 && (
          <div className="absolute inset-0 bg-[linear-gradient(135deg,#052015_0%,#083D2A_55%,#0A5C3C_100%)]" />
        )}
        {/* GUYSKULL-06C §6 — directional overlay: strong behind the text on
            the left, progressively transparent toward the right so the
            architecture and natural light stay visible, plus a soft
            bottom gradient for the transition into the content below. */}
        <div className="absolute inset-0 bg-gradient-to-r from-black/75 via-black/35 to-black/5 pointer-events-none" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent pointer-events-none" />

        <div className="relative z-10 max-w-[1280px] mx-auto px-4 lg:px-6 h-full flex flex-col lg:flex-row lg:items-end gap-6 pb-10 lg:pb-28">
          <div className="flex-1 pt-16 lg:pt-0">
            {(trustBadge || premium) && (
              <div className="flex items-center gap-2 flex-wrap mb-4">
                {trustBadge && (
                  <span className="flex items-center gap-1 text-[10px] font-medium text-white/70">
                    <CheckCircle2 size={10} className="text-white/60" /> {trustBadge.label}
                  </span>
                )}
                {premium && (
                  <span className="flex items-center gap-1 text-[10px] font-bold text-[#0A0A0A] bg-[#FCD116] px-2 py-0.5 rounded-full">
                    <Crown size={9} /> Premium
                  </span>
                )}
              </div>
            )}
            <h1 className="text-4xl md:text-5xl lg:text-[3.4rem] font-black tracking-tight leading-[1.05] mb-3 max-w-[620px] text-balance">
              {name}
            </h1>
            {motto && (
              <p className="text-base md:text-lg text-white/85 italic max-w-[520px] leading-snug mb-2.5">{motto}</p>
            )}
            {description && (
              <p className="text-sm md:text-[15px] text-white/70 max-w-[480px] leading-relaxed mb-6 line-clamp-2">{description}</p>
            )}
            {!motto && !description && <div className="mb-6" />}
            <div className="flex flex-wrap items-center gap-3">
              <Link
                href={discoverHref}
                className="inline-flex items-center h-12 px-6 rounded-card bg-white text-accent text-sm font-bold hover:bg-white/90 hover:-translate-y-0.5 transition-all duration-base"
              >
                Découvrir l&apos;établissement
              </Link>
              {showAdmissionsCta && (
                <Link
                  href={admissionsHref}
                  className="group inline-flex items-center h-12 px-6 rounded-card border border-white/35 text-white text-sm font-bold hover:bg-white/10 hover:-translate-y-0.5 transition-all duration-base"
                >
                  Formations &amp; admissions
                  <ArrowRight size={15} className="ml-2 transition-transform duration-base group-hover:translate-x-0.5" />
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* GUYSKULL-06 §5 / GUYSKULL-06C §10 — pulled up out of the photo's
          own clipped box so it visually straddles the hero/content
          boundary on desktop; on mobile it stacks below in normal flow.
          Adaptive sizing: a lone action gets a compact single-line card
          instead of a near-empty full panel. */}
      {quickActions.length > 0 && (
        <div className="relative max-w-[1280px] mx-auto px-4 lg:px-6">
          <div
            className={`lg:absolute lg:right-6 w-full lg:w-auto -mt-6 lg:mt-0 mb-6 lg:mb-0 text-text-primary shadow-elevation-3 border border-border rounded-card ${
              isCompactContact ? "lg:-top-8 lg:w-auto p-2" : "lg:-top-20 lg:w-[280px] p-5"
            }`}
            style={{ backgroundColor: "var(--school-surface, #ffffff)" }}
          >
            {!isCompactContact && (
              <p className="text-[10px] font-bold tracking-widest uppercase mb-3" style={{ color: "var(--school-accent-gold, #C9A24B)" }}>Contact rapide</p>
            )}
            <div className={isCompactContact ? "" : "space-y-2"}>
              {quickActions.map((action) => (
                <a
                  key={action.label}
                  href={action.href}
                  target={action.external ? "_blank" : undefined}
                  rel={action.external ? "noopener noreferrer" : undefined}
                  className={`flex items-center gap-2.5 text-sm font-semibold text-text-primary transition-colors duration-base hover:bg-muted ${
                    isCompactContact ? "rounded-lg px-4 py-2.5" : "rounded-lg px-3 py-2.5"
                  }`}
                  style={isCompactContact ? undefined : { border: "1px solid var(--school-border, #E8E6E1)" }}
                >
                  <action.icon size={14} className="shrink-0" style={{ color: "var(--school-primary, #0F2A4A)" }} />
                  {action.label}
                </a>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
