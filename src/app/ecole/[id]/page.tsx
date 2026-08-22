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
  FileText,
  Bell,
  Wifi,
  Bus,
  Utensils,
  Monitor,
  ShieldCheck,
  MessageCircle,
  ClipboardList,
  GraduationCap,
  School,
  AlertCircle,
  BookOpen,
  Download,
  FlaskConical,
  Dumbbell,
  BedDouble,
  HeartPulse,
  UserCheck,
  Share2,
  Navigation as NavigationIcon,
} from "lucide-react";
import { SiteHeader, SiteHeaderSpacer } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { SchoolHeroCarousel, type SchoolHeroSlide } from "@/components/school/SchoolHeroCarousel";
import { SchoolGallery } from "@/components/school/SchoolGallery";
import { getPrimaryPublicBadge, resolveEstablishmentTrustState, trustInputFromEstablishmentRow } from "@/lib/trust/resolveEstablishmentTrustState";

// Correspond aux colonnes réelles de la table infrastructures
const INFRA_LABELS: Record<string, { label: string; icon: React.ElementType }> = {
  library:      { label: "Bibliothèque",      icon: BookOpen },
  laboratory:   { label: "Laboratoire",       icon: FlaskConical },
  computer_room:{ label: "Salle informatique",icon: Monitor },
  sports_field: { label: "Terrain de sport",  icon: Dumbbell },
  canteen:      { label: "Cantine scolaire",  icon: Utensils },
  boarding:     { label: "Internat",          icon: BedDouble },
  transport:    { label: "Transport scolaire",icon: Bus },
  security:     { label: "Sécurité",          icon: ShieldCheck },
  wifi:         { label: "Connexion Wi-Fi",   icon: Wifi },
  infirmary:    { label: "Infirmerie",        icon: HeartPulse },
};

// Frais fixes de la table fees (une ligne par école)
const FEE_COLS: { key: string; label: string }[] = [
  { key: "registration_fee", label: "Inscription" },
  { key: "tuition_fee",      label: "Scolarité" },
  { key: "transport_fee",    label: "Transport" },
  { key: "canteen_fee",      label: "Cantine" },
  { key: "uniform_fee",      label: "Uniforme" },
  { key: "exam_fee",         label: "Examens" },
  { key: "other_fees",       label: "Autres frais" },
];

const DOC_TYPE_LABELS: Record<string, string> = {
  fiche:       "Fiche de renseignements",
  inscription: "Fiche d'inscription",
  fournitures: "Liste des fournitures",
  reglement:   "Règlement intérieur",
  calendrier:  "Calendrier scolaire",
  autre:       "Document",
};

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

  const infraItems = Object.keys(INFRA_LABELS).filter((k) => infra?.[k] === true);
  const isPremium = school.subscription_plan === "premium";
  // SPRINT REGISTRY-NATIONAL-A.1 — résolveur central unique (src/lib/trust).
  // Contexte public (client anon) : jamais d'accès à
  // establishment_registry_identifiers (RLS platform_admin only), donc
  // official_verification ne peut jamais dépasser OFFICIAL_SOURCE_FOUND ici
  // — c'est un sous-ensemble sûr et conservateur du calcul complet, jamais
  // un badge "officiellement vérifié" inventé côté client.
  const trustState = resolveEstablishmentTrustState(trustInputFromEstablishmentRow(school));
  const trustBadge = getPrimaryPublicBadge(trustState);
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
        trustBadge={trustBadge}
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
          <GeneralTab school={school} fees={fees} infra={infra} infraItems={infraItems} />

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

function ContactRow({ icon: Icon, label, value, href }: { icon: React.ElementType; label: string; value: string; href?: string }) {
  const content = (
    <div className="flex items-start gap-3">
      <Icon size={15} className="text-text-secondary mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p className="text-xs text-text-secondary">{label}</p>
        <p className="text-sm font-semibold text-text-primary truncate">{value}</p>
      </div>
    </div>
  );
  if (!href) return content;
  return (
    <a href={href} target={href.startsWith("http") ? "_blank" : undefined} rel={href.startsWith("http") ? "noopener noreferrer" : undefined} className="hover:opacity-80 transition-opacity duration-base">
      {content}
    </a>
  );
}

function GeneralTab({ school, fees, infra, infraItems }: {
  school: any;
  fees: any | null;
  infra: any | null;
  infraItems: string[];
}) {
  const feeRows = fees
    ? FEE_COLS.filter((f) => fees[f.key] && Number(fees[f.key]) > 0)
    : [];
  const currency = fees?.currency ?? "FCFA";

  return (
    <div className="space-y-5">
      <div id="presentation" className="bg-white border border-border rounded-card p-6 scroll-mt-20">
        <h2 className="font-bold text-sm mb-4">Présentation</h2>
        <p className="text-text-secondary text-sm leading-relaxed">
          {school.description || "Aucune description disponible pour le moment."}
        </p>
        <div className="grid sm:grid-cols-2 gap-3 mt-6">
          {[
            { label: "Catégorie", value: school.main_category },
            { label: "Ville",     value: school.city },
            { label: "Quartier",  value: school.neighborhood },
            { label: "Téléphone", value: school.phone },
          ].filter((r) => r.value).map((row) => (
            <div key={row.label} className="bg-muted rounded-xl p-4">
              <p className="text-[10px] font-semibold text-text-secondary uppercase tracking-wider">{row.label}</p>
              <p className="font-bold text-text-primary mt-1 text-sm">{row.value}</p>
            </div>
          ))}
        </div>
      </div>

      <div id="tarifs" className="bg-white border border-border rounded-card p-6 scroll-mt-20">
        <h2 className="font-bold text-sm mb-4">Tarifs</h2>
        {feeRows.length === 0 ? (
          <p className="text-sm text-text-secondary">Tarifs non renseignés par l&apos;établissement.</p>
        ) : (
          <div className="divide-y divide-border">
            {feeRows.map((f) => (
              <div key={f.key} className="flex items-center justify-between py-3">
                <span className="text-sm text-text-secondary">{f.label}</span>
                <span className="text-sm font-bold text-text-primary">
                  {Number(fees[f.key]).toLocaleString("fr-FR")} {currency}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div id="infrastructures" className="bg-white border border-border rounded-card p-6 scroll-mt-20">
        <h2 className="font-bold text-sm mb-4">Infrastructures</h2>
        {infraItems.length === 0 ? (
          <p className="text-sm text-text-secondary">Infrastructures non renseignées par l&apos;établissement.</p>
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">
            {infraItems.map((key) => {
              const item = INFRA_LABELS[key];
              const Icon = item.icon;
              return (
                <div key={key} className="flex items-center gap-3 bg-muted rounded-xl p-3">
                  <Icon size={15} className="text-primary shrink-0" />
                  <span className="text-sm font-semibold text-text-primary">{item.label}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function DocumentsTab({ docs }: { docs: any[] }) {
  return (
    <div className="space-y-3">
      {docs.map((doc) => {
        const typeLabel = DOC_TYPE_LABELS[doc.type] ?? doc.type;
        return (
          <div key={doc.id} className="bg-white border border-border rounded-card p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center shrink-0">
              <FileText size={16} className="text-text-secondary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm text-text-primary truncate">{doc.name}</p>
              <p className="text-xs text-text-secondary mt-0.5">{typeLabel}</p>
            </div>
            <a
              href={doc.url}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 flex items-center gap-1.5 text-xs font-bold text-primary border border-primary/30 bg-primary-light px-3 py-1.5 rounded-lg hover:bg-primary/10 transition-colors duration-base"
            >
              <Download size={12} />
              Télécharger
            </a>
          </div>
        );
      })}
    </div>
  );
}

function AnnouncementsTab({ schoolId }: { schoolId: string }) {
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("school_announcements")
      .select("*")
      .eq("establishment_id", schoolId)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (data) setAnnouncements(data);
        setLoading(false);
      });
  }, [schoolId]);

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2].map((i) => (
          <div key={i} className="h-24 bg-white border border-border rounded-card animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {announcements.length === 0 ? (
        <div className="bg-white border border-border rounded-card py-14 text-center">
          <Bell size={28} className="mx-auto text-text-secondary/30 mb-4" />
          <p className="text-sm text-text-secondary">Aucune actualité publiée.</p>
        </div>
      ) : (
        announcements.map((a) => (
          <div key={a.id} className={`bg-white border rounded-card p-5 ${a.is_important ? "border-danger/30" : "border-border"}`}>
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              {a.is_important && (
                <span className="flex items-center gap-1 text-[10px] font-bold text-danger bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
                  <AlertCircle size={9} /> Important
                </span>
              )}
              <span className="text-[10px] text-text-secondary font-medium">
                {new Date(a.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
              </span>
            </div>
            <h3 className="font-bold text-text-primary mb-1">{a.title}</h3>
            <p className="text-sm text-text-secondary leading-relaxed">{a.content}</p>
          </div>
        ))
      )}
    </div>
  );
}

function ParentTab({ schoolId }: { schoolId: string }) {
  const cards = [
    { icon: ClipboardList, title: "Dossier de l'enfant",  text: "Statut d'admission, pièces manquantes, décision de l'école." },
    { icon: GraduationCap,  title: "Classe assignée",     text: "Classe, enseignant, annonces et documents de classe." },
    { icon: Bell,           title: "Messages école",      text: "Communiqués, rappels, réunions et urgences." },
    { icon: FileText,       title: "Documents & frais",   text: "Reçus, frais à payer, calendrier et documents scolaires." },
  ];

  return (
    <div id="admissions" className="bg-accent text-white rounded-card p-6 scroll-mt-20">
      <h2 className="font-black text-2xl mb-2">Admissions</h2>
      <p className="text-white/60 text-sm mb-6 leading-relaxed">
        Préinscrivez votre enfant en ligne. Une fois le dossier accepté, cet
        espace devient le lien entre le parent, l&apos;élève et l&apos;école.
      </p>
      <div className="grid sm:grid-cols-2 gap-3 mb-6">
        {cards.map(({ icon: Icon, title, text }) => (
          <div key={title} className="bg-white/5 rounded-xl p-4 border border-white/8">
            <Icon size={15} className="text-primary-light mb-3" />
            <h3 className="font-bold text-sm text-white mb-1">{title}</h3>
            <p className="text-xs text-white/60 leading-relaxed">{text}</p>
          </div>
        ))}
      </div>
      <Link
        href={`/preinscription?ecole=${schoolId}`}
        className="inline-block bg-[#FCD116] text-[#0A0A0A] px-5 py-2.5 rounded-card text-sm font-bold hover:bg-[#FCD116]/90 transition-colors duration-base"
      >
        Préinscrire mon enfant
      </Link>
    </div>
  );
}
