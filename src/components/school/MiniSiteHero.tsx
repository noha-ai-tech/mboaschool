"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Phone, MessageCircle, Navigation as NavigationIcon, Globe, ClipboardList, CheckCircle2, Crown } from "lucide-react";
import type { SchoolHeroSlide } from "@/components/school/SchoolHeroCarousel";

// PUBLIC-SITE-01 §4A — mini-site hero. Deliberately a NEW component rather
// than a rewrite of SchoolHeroCarousel (still used by the CMS live editor +
// draft Preview, out of scope for this mission — §10/§16). Reuses the same
// resolved slide list, just a different overlay layout (headline + quick
// contact card instead of the directory-style back-link/category chips).
const FALLBACK_HEADLINE = "Former aujourd'hui les leaders de demain";

export function MiniSiteHero({
  slides,
  name,
  description,
  admissionsOpen,
  admissionYearLabel,
  preinscriptionHref,
  phone,
  whatsapp,
  mapsHref,
  website,
  onDiscoverClick,
  trustBadge,
  premium,
}: {
  slides: SchoolHeroSlide[];
  name: string;
  description: string | null;
  admissionsOpen: boolean;
  admissionYearLabel: string | null;
  preinscriptionHref: string;
  phone: string | null;
  whatsapp: string | null;
  mapsHref: string | null;
  website: string | null;
  onDiscoverClick: () => void;
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

  return (
    <section className="relative bg-accent text-white overflow-hidden">
      <div className="relative h-[440px] lg:h-[520px]">
        {slides.map((slide, i) => (
          <div key={slide.id} aria-hidden={i !== active} className={`absolute inset-0 transition-opacity duration-slow ease-out ${i === active ? "opacity-100" : "opacity-0"}`}>
            <Image src={slide.image} alt="" fill priority={i === 0} sizes="100vw" className="object-cover" />
          </div>
        ))}
        {slides.length === 0 && (
          <div className="absolute inset-0 bg-[linear-gradient(135deg,#052015_0%,#083D2A_55%,#0A5C3C_100%)]" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-black/20 pointer-events-none" />

        <div className="relative z-10 max-w-[1280px] mx-auto px-4 lg:px-6 h-full flex flex-col lg:flex-row lg:items-end gap-6 pb-10">
          <div className="flex-1 pt-16 lg:pt-0">
            {(trustBadge || premium) && (
              <div className="flex items-center gap-2 flex-wrap mb-3">
                {trustBadge && (
                  <span className="flex items-center gap-1 text-[10px] font-semibold text-white bg-white/15 border border-white/20 px-2 py-0.5 rounded-full">
                    <CheckCircle2 size={9} /> {trustBadge.label}
                  </span>
                )}
                {premium && (
                  <span className="flex items-center gap-1 text-[10px] font-bold text-[#0A0A0A] bg-[#FCD116] px-2 py-0.5 rounded-full">
                    <Crown size={9} /> Premium
                  </span>
                )}
              </div>
            )}
            <h1 className="text-2xl md:text-4xl font-black tracking-tight leading-tight mb-3 max-w-[560px]">
              {name || FALLBACK_HEADLINE}
            </h1>
            {description ? (
              <p className="text-sm md:text-base text-white/75 max-w-[520px] leading-relaxed mb-5 line-clamp-2">{description}</p>
            ) : (
              <p className="text-sm md:text-base text-white/75 max-w-[520px] leading-relaxed mb-5">{FALLBACK_HEADLINE}</p>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={onDiscoverClick}
                className="inline-flex items-center h-11 px-6 rounded-card bg-white text-accent text-sm font-bold hover:bg-white/90 transition-colors duration-base"
              >
                Découvrir notre établissement
              </button>
              {admissionsOpen && (
                <Link
                  href={preinscriptionHref}
                  className="inline-flex items-center h-11 px-6 rounded-card bg-gradient-to-r from-primary to-primary-dark text-white text-sm font-bold hover:shadow-elevation-2 transition-all duration-base"
                >
                  <ClipboardList size={15} className="mr-2" />
                  {admissionYearLabel ? `Admissions ouvertes ${admissionYearLabel}` : "Admissions ouvertes"}
                </Link>
              )}
            </div>
          </div>

          {quickActions.length > 0 && (
            <div className="lg:w-[260px] shrink-0 bg-white/10 backdrop-blur-md border border-white/15 rounded-card p-4">
              <p className="text-[10px] font-bold tracking-widest uppercase text-white/60 mb-3">Contact rapide</p>
              <div className="space-y-2">
                {quickActions.map((action) => (
                  <a
                    key={action.label}
                    href={action.href}
                    target={action.external ? "_blank" : undefined}
                    rel={action.external ? "noopener noreferrer" : undefined}
                    className="flex items-center gap-2.5 bg-white/10 hover:bg-white/20 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors duration-base"
                  >
                    <action.icon size={14} className="shrink-0" />
                    {action.label}
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
