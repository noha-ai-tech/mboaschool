"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  Phone,
  Globe,
  MessageCircle,
  ClipboardList,
  School,
  UserCheck,
  Share2,
  Navigation as NavigationIcon,
} from "lucide-react";
import { SiteHeader, SiteHeaderSpacer } from "@/components/layout/SiteHeader";
import { AnnouncementTicker } from "@/components/hero/AnnouncementTicker";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { useSiteTickerItems } from "@/lib/useSiteTickerItems";
import { SchoolHeroCarousel } from "@/components/school/SchoolHeroCarousel";
import type { AdmissionsConfig } from "@/components/school/ParentTab";
import { resolveSectionConfig } from "@/lib/schoolPage/sections";
import { buildSchoolPageSections, type SchoolPageViewModel } from "@/components/school/SchoolPageSections";

// SYNC-03 — conflict between origin/main (REGISTRY-NATIONAL-A.1's central
// trust-badge resolver, kills the ambiguous raw "Vérifié" boolean) and this
// branch's CMS-F.4 shared-renderer extraction. Combined both, same
// reasoning as origin/main's own earlier equivalent reconciliation
// (reports/release/release-integration-a-conflict-resolution.csv): neither
// intent required removing the other's work. trustBadge/resolveEstablishment
// TrustState stay exactly as Registry wrote them; the individual
// GeneralTab/DocumentsTab/AnnouncementsTab/ParentTab/ContactRow/SchoolGallery
// imports from main's older version are dropped as genuinely unused now —
// buildSchoolPageSections (CMS-F.4) already renders all of them internally.
//
// CMS-F.4 — la logique de rendu des sections (ordre, règles "section
// vide", contenu de chaque bloc) vit désormais dans
// src/components/school/SchoolPageSections.tsx, PARTAGÉE avec l'Aperçu du
// brouillon (src/app/dashboard/ecole/etablissement/preview/page.tsx) —
// cette page ne fait plus que fournir les données LIVE et le viewmodel.
// CMS-C §10 : l'ordre par défaut (quand school_page_sections est vide/
// partielle) reste celui de src/lib/schoolPage/sections.ts, inchangé.

export default function SchoolPage() {
  const params = useParams();
  const id = params.id as string;
  const tickerItems = useSiteTickerItems();

  const [school, setSchool]     = useState<any>(null);
  const [fees, setFees]         = useState<any | null>(null);
  const [infra, setInfra]       = useState<any | null>(null);
  const [images, setImages]     = useState<any[]>([]);
  const [docsList, setDocsList] = useState<any[]>([]);
  const [sectionRows, setSectionRows] = useState<{ section_key: string; position: number; is_visible: boolean }[]>([]);
  const [admissionsConfig, setAdmissionsConfig] = useState<AdmissionsConfig | null>(null);
  const [newsCount, setNewsCount] = useState<number | null>(null); // null = pas encore chargé, jamais masqué avant de savoir
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    async function load() {
      const [
        { data: schoolData },
        { data: feesData },
        { data: infraData },
        { data: imagesData },
        { data: docsData },
        { data: sectionsData },
        { data: admissionsData },
      ] = await Promise.all([
        supabase.from("establishments").select("*").eq("id", id).single(),
        supabase.from("fees").select("*").eq("establishment_id", id).maybeSingle(),
        supabase.from("infrastructures").select("*").eq("establishment_id", id).maybeSingle(),
        // CMS-F.6 — filtre status='live' explicite côté application, en
        // défense en profondeur AVEC la policy RLS publique (migration
        // 0029, PRÉPARÉE NON EXÉCUTÉE) : tant que 0029 n'est pas exécutée,
        // ce filtre applicatif reste la SEULE protection empêchant une
        // photo draft_pending_add d'apparaître publiquement.
        supabase.from("school_images").select("*").eq("establishment_id", id).eq("status", "live").order("created_at", { ascending: false }),
        supabase.from("school_documents").select("*").eq("establishment_id", id).order("created_at", { ascending: false }),
        supabase.from("school_page_sections").select("section_key, position, is_visible").eq("establishment_id", id),
        // admissions_config (migration 0025, préparée mais NON exécutée) —
        // 0 ligne = comportement actuel inchangé (mission CMS-D.1 §6), pas
        // de traitement spécial requis : data reste null, ParentTab garde
        // son comportement par défaut.
        supabase.from("admissions_config").select("is_open, levels, conditions, required_documents, period_start, period_end, additional_info").eq("establishment_id", id).maybeSingle(),
      ]);

      if (schoolData) setSchool(schoolData);
      if (feesData)   setFees(feesData);
      if (infraData)  setInfra(infraData);
      if (imagesData) setImages(imagesData);
      if (docsData)   setDocsList(docsData);
      if (sectionsData) setSectionRows(sectionsData);
      if (admissionsData) setAdmissionsConfig(admissionsData as AdmissionsConfig);
      setLoading(false);
    }
    load();
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#ECECEA]">
        <SiteHeader />
        <SiteHeaderSpacer />
        <AnnouncementTicker items={tickerItems} />
        <div className="h-[500px] bg-accent animate-pulse" />
        <div className="max-w-[1520px] mx-auto px-[18px] py-10 grid lg:grid-cols-[1fr_300px] gap-8">
          <div className="space-y-4">
            <div className="h-10 w-48 bg-white rounded" />
            <div className="h-64 bg-white border border-border rounded-card" />
          </div>
          <div className="h-40 bg-white border border-border rounded-card" />
        </div>
      </div>
    );
  }

  if (!school) {
    return (
      <div className="min-h-screen bg-[#ECECEA] flex flex-col">
        <SiteHeader />
        <SiteHeaderSpacer />
        <AnnouncementTicker items={tickerItems} />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <School size={40} className="mx-auto text-text-secondary/30 mb-4" />
            <p className="text-text-secondary font-semibold">Établissement introuvable.</p>
            <Link href="/" className="text-sm text-primary font-semibold mt-3 block">← Retour à l&apos;annuaire</Link>
          </div>
        </div>
        <SiteFooter />
      </div>
    );
  }

  const isPremium = school.subscription_plan === "premium";
  // SPRINT REGISTRY-NATIONAL-A.1 — résolveur central unique (src/lib/trust).
  // Contexte public (client anon) : jamais d'accès à
  // establishment_registry_identifiers (RLS platform_admin only), donc
  // official_verification ne peut jamais dépasser OFFICIAL_SOURCE_FOUND ici
  // — c'est un sous-ensemble sûr et conservateur du calcul complet, jamais
  // un badge "officiellement vérifié" inventé côté client.
  const preinscriptionHref = `/preinscription?ecole=${school.id}`;
  const hasLocation = !!(school.latitude && school.longitude);
  const mapsHref = hasLocation ? `https://www.google.com/maps?q=${school.latitude},${school.longitude}` : null;

  // CMS-C §10/§11/§12 — configuration réelle (school_page_sections), avec
  // repli sur l'ordre canonique par défaut quand l'école n'a encore rien
  // personnalisé (aucune ligne en base). is_visible=false ne supprime
  // jamais les données sous-jacentes, seulement leur rendu ici (§11).
  const sectionConfig = resolveSectionConfig(sectionRows);

  // CMS-F.4 — viewmodel LIVE (toutes les valeurs viennent directement de
  // `school`, jamais du brouillon : la fiche publique ne lit jamais
  // school_page_drafts, voir l'audit du rapport).
  const viewModel: SchoolPageViewModel = {
    id: school.id,
    name: school.name,
    main_category: school.main_category,
    city: school.city,
    neighborhood: school.neighborhood,
    is_verified: !!school.is_verified,
    subscription_plan: school.subscription_plan,
    cover_image_url: school.cover_image_url,
    hero_mode: school.hero_mode ?? null,
    description: school.description,
    phone: school.phone,
    email: school.email,
    website: school.website,
    address: school.address,
    latitude: school.latitude,
    longitude: school.longitude,
  };

  const { visibleSections, sectionNav, heroSlides } = buildSchoolPageSections({
    school: viewModel,
    fees,
    infra,
    images,
    docsList,
    admissionsConfig,
    sectionConfig,
    newsCount,
    onNewsCountChange: setNewsCount,
  });

  function scrollToId(anchor: string) {
    document.getElementById(anchor)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="min-h-screen bg-[#ECECEA]">
      <SiteHeader />
      <SiteHeaderSpacer />
      <AnnouncementTicker items={tickerItems} />

      <SchoolHeroCarousel
        slides={heroSlides}
        name={school.name}
        city={school.city}
        neighborhood={school.neighborhood}
        category={school.main_category}
        trustBadge={null}
        premium={isPremium}
        preinscriptionHref={preinscriptionHref}
        backHref="/"
        backLabel="Annuaire"
      />

      {/* Actions rapides — uniquement celles réellement disponibles */}
      <div className="bg-white border-b border-border">
        <div className="max-w-[1520px] mx-auto px-[18px] py-3 flex items-center gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <QuickAction href={preinscriptionHref} icon={ClipboardList} label="Préinscription" primary />
          {school.phone && <QuickAction href={`tel:${school.phone}`} icon={Phone} label="Téléphone" />}
          {school.website && <QuickAction href={school.website} icon={Globe} label="Site web" external />}
          {mapsHref && <QuickAction href={mapsHref} icon={NavigationIcon} label="Itinéraire" external />}
          <ShareAction schoolName={school.name} />
        </div>
      </div>

      {/* Navigation sticky — ancres, tout reste sur la même page */}
      <div className="border-b border-border bg-white sticky top-0 z-30 overflow-x-auto">
        <div className="max-w-[1520px] mx-auto px-[18px]">
          <div className="flex gap-0 whitespace-nowrap">
            {sectionNav.map((item) => (
              <button
                key={item.id}
                onClick={() => scrollToId(item.id)}
                className="px-5 py-3.5 text-sm font-semibold border-b-2 border-transparent text-text-secondary hover:text-text-primary hover:border-border transition-colors duration-fast shrink-0"
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-[1520px] mx-auto px-[18px] py-8 grid lg:grid-cols-[1fr_300px] gap-8 items-start">

        <div className="space-y-5 pb-16 lg:pb-0">
          {visibleSections.map((c) => (
            <div key={c.key}>{c.node}</div>
          ))}
        </div>

        {/* Sidebar */}
        <aside className="space-y-4 lg:sticky lg:top-[73px]">
          <div className="bg-white border border-border rounded-card p-5">
            <p className="text-xs font-bold tracking-widest uppercase text-text-secondary mb-4">Intéressé ?</p>
            <Link
              href={preinscriptionHref}
              className="block w-full text-center bg-gradient-to-r from-primary to-primary-dark text-white py-3 rounded-card text-sm font-bold hover:shadow-elevation-1 transition-all duration-base"
            >
              Préinscrire mon enfant
            </Link>
            <p className="text-[11px] text-text-secondary text-center mt-2">Gratuit · Sans engagement</p>
          </div>

          {school.phone && (
            <div className="bg-white border border-border rounded-card p-5">
              <p className="text-xs font-bold tracking-widest uppercase text-text-secondary mb-4">Contact rapide</p>
              <p className="text-sm font-semibold text-text-primary mb-3 flex items-center gap-2">
                <Phone size={13} className="text-text-secondary" />
                {school.phone}
              </p>
              <a
                href={`https://wa.me/${school.phone?.replace(/\D/g, "")}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full border border-text-primary text-text-primary py-2.5 rounded-card text-sm font-bold hover:bg-text-primary hover:text-white transition-colors duration-base"
              >
                <MessageCircle size={14} />
                WhatsApp
              </a>
            </div>
          )}

          {!school.owner_id && (
            <div className="bg-white border border-border rounded-card p-5">
              <p className="text-xs font-bold tracking-widest uppercase text-text-secondary mb-3 flex items-center gap-2">
                <UserCheck size={12} /> Vous représentez cet établissement ?
              </p>
              <p className="text-xs text-text-secondary mb-3 leading-relaxed">
                Revendiquez cette page pour la gérer vous-même : modifier les informations, publier des photos,
                traiter les préinscriptions.
              </p>
              <Link
                href={`/revendiquer/${school.id}`}
                className="block w-full text-center border border-text-primary text-text-primary py-2.5 rounded-card text-sm font-bold hover:bg-text-primary hover:text-white transition-colors duration-base"
              >
                C&apos;est mon établissement
              </Link>
            </div>
          )}
        </aside>
      </div>

      <SiteFooter />

      {/* CTA sticky mobile */}
      <div className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-border p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <Link
          href={preinscriptionHref}
          className="block w-full text-center bg-gradient-to-r from-primary to-primary-dark text-white py-3 rounded-card text-sm font-bold"
        >
          Préinscrire mon enfant
        </Link>
      </div>
      <div className="lg:hidden h-20" aria-hidden="true" />
    </div>
  );
}

function QuickAction({
  href, icon: Icon, label, primary = false, external = false,
}: {
  href: string; icon: React.ElementType; label: string; primary?: boolean; external?: boolean;
}) {
  return (
    <a
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer" : undefined}
      className={`shrink-0 inline-flex items-center gap-1.5 h-9 px-3.5 rounded-card text-xs font-semibold transition-colors duration-base ${
        primary
          ? "bg-gradient-to-r from-primary to-primary-dark text-white"
          : "border border-border text-text-secondary hover:text-text-primary hover:border-text-secondary"
      }`}
    >
      <Icon size={13} />
      {label}
    </a>
  );
}

function ShareAction({ schoolName }: { schoolName: string }) {
  const [shared, setShared] = useState(false);

  async function share() {
    const url = typeof window !== "undefined" ? window.location.href : "";
    if (navigator.share) {
      try { await navigator.share({ title: schoolName, url }); } catch { /* annulé par l'utilisateur */ }
      return;
    }
    await navigator.clipboard.writeText(url);
    setShared(true);
    setTimeout(() => setShared(false), 2000);
  }

  return (
    <button
      onClick={share}
      className="shrink-0 inline-flex items-center gap-1.5 h-9 px-3.5 rounded-card text-xs font-semibold border border-border text-text-secondary hover:text-text-primary hover:border-text-secondary transition-colors duration-base"
    >
      <Share2 size={13} />
      {shared ? "Lien copié" : "Partager"}
    </button>
  );
}

