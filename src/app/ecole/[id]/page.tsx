"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  MapPin,
  Phone,
  Mail,
  Globe,
  MessageCircle,
  ClipboardList,
  School,
  UserCheck,
  Share2,
  Navigation as NavigationIcon,
} from "lucide-react";
import { SiteHeader, SiteHeaderSpacer } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { SchoolHeroCarousel, type SchoolHeroSlide } from "@/components/school/SchoolHeroCarousel";
import { SchoolGallery } from "@/components/school/SchoolGallery";
import { GeneralTab } from "@/components/school/GeneralTab";
import { DocumentsTab } from "@/components/school/DocumentsTab";
import { AnnouncementsTab } from "@/components/school/AnnouncementsTab";
import { ParentTab } from "@/components/school/ParentTab";
import { ContactRow } from "@/components/school/ContactRow";

export default function SchoolPage() {
  const params = useParams();
  const id = params.id as string;

  const [school, setSchool]     = useState<any>(null);
  const [fees, setFees]         = useState<any | null>(null);
  const [infra, setInfra]       = useState<any | null>(null);
  const [images, setImages]     = useState<any[]>([]);
  const [docsList, setDocsList] = useState<any[]>([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    async function load() {
      const [
        { data: schoolData },
        { data: feesData },
        { data: infraData },
        { data: imagesData },
        { data: docsData },
      ] = await Promise.all([
        supabase.from("establishments").select("*").eq("id", id).single(),
        supabase.from("fees").select("*").eq("establishment_id", id).maybeSingle(),
        supabase.from("infrastructures").select("*").eq("establishment_id", id).maybeSingle(),
        supabase.from("school_images").select("*").eq("establishment_id", id).order("created_at", { ascending: false }),
        supabase.from("school_documents").select("*").eq("establishment_id", id).order("created_at", { ascending: false }),
      ]);

      if (schoolData) setSchool(schoolData);
      if (feesData)   setFees(feesData);
      if (infraData)  setInfra(infraData);
      if (imagesData) setImages(imagesData);
      if (docsData)   setDocsList(docsData);
      setLoading(false);
    }
    load();
  }, [id]);

  const heroSlides = useMemo<SchoolHeroSlide[]>(() => {
    if (images.length > 0) return images.map((img: any) => ({ id: img.id, image: img.url as string }));
    if (school?.cover_image_url) return [{ id: "cover", image: school.cover_image_url as string }];
    return [];
  }, [images, school?.cover_image_url]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#ECECEA]">
        <SiteHeader />
        <SiteHeaderSpacer />
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
  const preinscriptionHref = `/preinscription?ecole=${school.id}`;
  const address = [school.address, school.neighborhood, school.city].filter(Boolean).join(", ");
  const hasLocation = !!(school.latitude && school.longitude);
  const mapsHref = hasLocation ? `https://www.google.com/maps?q=${school.latitude},${school.longitude}` : null;

  // Ancres — uniquement les sections qui affichent réellement du contenu
  // (pas d'ancre "Avis"/"FAQ"/"Résultats" : aucune donnée réelle derrière).
  const sectionNav = [
    { id: "presentation",    label: "Présentation" },
    { id: "admissions",      label: "Admissions" },
    { id: "tarifs",          label: "Tarifs" },
    { id: "infrastructures", label: "Infrastructures" },
    { id: "galerie",         label: "Galerie" },
    { id: "actualites",      label: "Actualités" },
    ...(docsList.length > 0 ? [{ id: "documents", label: "Documents" }] : []),
    { id: "contact",         label: "Contact" },
  ];

  function scrollToId(anchor: string) {
    document.getElementById(anchor)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="min-h-screen bg-[#ECECEA]">
      <SiteHeader />

      <SchoolHeroCarousel
        slides={heroSlides}
        name={school.name}
        city={school.city}
        neighborhood={school.neighborhood}
        category={school.main_category}
        verified={!!school.is_verified}
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
          <GeneralTab school={school} fees={fees} infra={infra} />

          <div id="galerie" className="scroll-mt-20">
            <h2 className="font-bold text-sm mb-3 px-1">Galerie{images.length > 0 ? ` (${images.length})` : ""}</h2>
            <SchoolGallery images={images.map((img: any) => ({ id: img.id, url: img.url, caption: img.caption }))} />
          </div>

          {docsList.length > 0 && (
            <div id="documents" className="scroll-mt-20">
              <h2 className="font-bold text-sm mb-3 px-1">Documents ({docsList.length})</h2>
              <DocumentsTab docs={docsList} />
            </div>
          )}

          <div id="actualites" className="scroll-mt-20">
            <h2 className="font-bold text-sm mb-3 px-1">Actualités</h2>
            <AnnouncementsTab schoolId={id} />
          </div>

          <div id="contact" className="bg-white border border-border rounded-card p-6 scroll-mt-20">
            <h2 className="font-bold text-sm mb-4">Contact</h2>
            {!school.phone && !school.email && !address ? (
              <p className="text-sm text-text-secondary">Coordonnées non renseignées par l&apos;établissement.</p>
            ) : (
              <div className="grid sm:grid-cols-2 gap-4">
                {school.phone && (
                  <ContactRow icon={Phone} label="Téléphone" value={school.phone} href={`tel:${school.phone}`} />
                )}
                {school.email && (
                  <ContactRow icon={Mail} label="Email" value={school.email} href={`mailto:${school.email}`} />
                )}
                {address && (
                  <ContactRow icon={MapPin} label="Adresse" value={address} href={mapsHref ?? undefined} />
                )}
                {school.website && (
                  <ContactRow icon={Globe} label="Site web" value={school.website} href={school.website} />
                )}
              </div>
            )}
            {mapsHref && (
              <a
                href={mapsHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 mt-4 text-sm font-semibold text-primary hover:opacity-80 transition-opacity duration-base"
              >
                <MapPin size={14} /> Voir sur la carte
              </a>
            )}
          </div>

          <ParentTab schoolId={id} />
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

