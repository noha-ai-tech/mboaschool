"use client";

import { useEffect, useState, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { BookOpen, Building2, Camera, CheckCircle2, ChevronLeft, ChevronRight, GraduationCap, Heart, Mail, MapPin, MessageCircle, Phone, Trophy } from "lucide-react";
import type { MiniSiteRendererData } from "@/lib/schoolPage/miniSiteData";
import { computeMiniSiteFlags } from "@/lib/schoolPage/miniSiteData";
import { buildMiniSiteViewHref, type MiniSiteViewKey } from "@/lib/schoolPage/miniSiteViews";
import { categories } from "@/lib/categories";
import { computeAllHeroSlides, resolveHeroSlides, type HeroMode } from "@/lib/school/heroMode";
import { schoolMonogram } from "@/lib/school/schoolMonogram";
import { getPrimaryPublicBadge, resolveEstablishmentTrustState, trustInputFromEstablishmentRow } from "@/lib/trust/resolveEstablishmentTrustState";
import { StructuredPricing } from "./StructuredPricing";
import { SchoolGallery } from "./SchoolGallery";
import { MiniSiteResultsPreview } from "./MiniSiteResultsPreview";
import { AnnouncementsTab } from "./AnnouncementsTab";
import { DocumentDownloadCtas } from "./DocumentDownloadCtas";
import { INFRA_LABELS } from "./GeneralTab";

const navigation: { label: string; view: MiniSiteViewKey; anchor?: string }[] = [
  { label: "Accueil", view: "accueil" },
  { label: "À propos", view: "etablissement" },
  { label: "Programmes", view: "admissions", anchor: "programmes" },
  { label: "Frais de scolarité", view: "admissions", anchor: "frais" },
  { label: "Vie scolaire", view: "vie", anchor: "vie-scolaire" },
  { label: "Résultats", view: "vie", anchor: "performances" },
  { label: "Galerie", view: "galerie", anchor: "photos" },
  { label: "Actualités", view: "vie", anchor: "actualites" },
  { label: "Contact", view: "galerie", anchor: "contact" },
];

function Section({ id, title, icon, children }: { id: string; title: string; icon?: ReactNode; children: ReactNode }) {
  return <section id={id} className="scroll-mt-40 rounded-2xl bg-white p-5 shadow-sm sm:p-6">
    <h2 className="mb-5 flex items-center gap-3 text-xl font-extrabold sm:text-2xl">{icon}{title}</h2>
    {children}
  </section>;
}

function Pending({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-5 text-sm leading-6 text-slate-500">{children}</p>;
}

/** One composition for every school and the CMS draft preview; content is always supplied by the caller. */
export function SchoolShowcase({ data, baseHref, activeView = "accueil" }: { data: MiniSiteRendererData; baseHref: string; activeView?: MiniSiteViewKey }) {
  const school = data.establishment;
  const flags = computeMiniSiteFlags(data);
  const visible = (key: string) => data.sectionConfig.find((section) => section.key === key)?.is_visible ?? true;
  const categoryLabel = categories.find((category) => category.key === school.main_category)?.label ?? null;
  const location = [school.neighborhood, school.city].filter(Boolean).join(", ");
  const slides = resolveHeroSlides(computeAllHeroSlides(data.images, school.cover_image_url), school.hero_mode as HeroMode | null);
  const [activeHero, setActiveHero] = useState(0);
  const [favorite, setFavorite] = useState(false);
  const photoIndex = activeHero % Math.max(slides.length, 1);
  const badge = getPrimaryPublicBadge(resolveEstablishmentTrustState(trustInputFromEstablishmentRow(school)));
  const home = activeView === "accueil";
  const levels = data.admissionsConfig?.levels ?? [];
  const mapsHref = school.latitude != null && school.longitude != null
    ? `https://www.google.com/maps?q=${school.latitude},${school.longitude}` : null;
  const canApply = data.mode === "public" && flags.showAdmissions && flags.admissionsOpen;

  useEffect(() => {
    setActiveHero(0);
    setFavorite(false);
  }, [school.id]);
  useEffect(() => {
    if (slides.length < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => setActiveHero((index) => (index + 1) % slides.length), 5500);
    return () => window.clearInterval(timer);
  }, [slides.length]);

  const applyButton = canApply
    ? <Link href={data.preinscriptionHref} className="flex min-h-12 items-center justify-center rounded-xl bg-emerald-600 px-4 py-3 text-center font-bold text-white">Préinscrire mon enfant</Link>
    : <p className="rounded-xl bg-slate-100 px-4 py-3 text-center text-sm text-slate-600">{data.mode === "preview" ? "Préinscription indisponible dans l’aperçu" : "Admissions actuellement fermées"}</p>;

  const presentation = <Section id="presentation" title="Présentation" icon={<BookOpen className="shrink-0 text-blue-600" />}>
    <div className="grid gap-6 xl:grid-cols-[1fr_240px]">
      <div>
        {school.description ? <p className="whitespace-pre-wrap leading-7 text-slate-600">{school.description}</p> : <Pending>La présentation de l’établissement sera disponible prochainement.</Pending>}
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {[{ label: "Catégorie", value: categoryLabel }, { label: "Ville", value: school.city }, { label: "Année de création", value: school.founding_year }, { label: "Élèves", value: school.student_count }, { label: "Enseignants", value: school.teacher_count }].filter((item) => item.value != null && item.value !== "").map((item) => <div key={item.label} className="rounded-xl border border-slate-100 p-4"><p className="text-xs text-slate-500">{item.label}</p><p className="mt-1 font-bold">{item.value}</p></div>)}
        </div>
      </div>
      <div className="rounded-2xl bg-gradient-to-br from-blue-50 to-sky-100 p-6">
        <h3 className="font-bold">Notre mission</h3>
        <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-600">{school.mission || "La mission de l’établissement sera présentée ici."}</p>
      </div>
    </div>
    {!home && <div className="mt-6 grid gap-4 sm:grid-cols-2">{[{ title: "Notre histoire", text: school.history }, { title: "Notre vision", text: school.vision }].map((item) => <article key={item.title} className="rounded-xl bg-slate-50 p-5"><h3 className="font-bold">{item.title}</h3><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-500">{item.text || "Informations à venir."}</p></article>)}</div>}
  </Section>;

  const programmes = <Section id="programmes" title="Programmes et niveaux" icon={<GraduationCap className="shrink-0 text-emerald-600" />}>
    {levels.length > 0 ? <div className="grid gap-3 sm:grid-cols-2">{levels.map((level, index) => <article key={`${level}-${index}`} className={`rounded-2xl p-5 ${index % 2 ? "bg-blue-50 text-blue-700" : "bg-emerald-50 text-emerald-700"}`}><h3 className="font-bold">{level}</h3></article>)}</div> : <Pending>Les programmes et niveaux proposés seront précisés par l’établissement.</Pending>}
    {!home && <div id="admissions" className="mt-6 space-y-4 scroll-mt-40">
      <h3 className="text-lg font-bold">Admissions</h3>
      {data.admissionsConfig?.conditions && <p className="whitespace-pre-wrap text-sm leading-6 text-slate-600">{data.admissionsConfig.conditions}</p>}
      {(data.admissionsConfig?.period_start || data.admissionsConfig?.period_end) && <p className="text-sm text-slate-600">Période : {data.admissionsConfig.period_start || "à préciser"} → {data.admissionsConfig.period_end || "à préciser"}</p>}
      <h3 className="font-bold">Pièces à fournir</h3>
      {data.admissionsConfig?.required_documents.length ? <ul className="list-inside list-disc text-sm leading-7 text-slate-600">{data.admissionsConfig.required_documents.map((document, index) => <li key={`${document}-${index}`}>{document}</li>)}</ul> : <p className="text-sm text-slate-500">La liste des pièces sera précisée par l’établissement.</p>}
      {data.admissionsConfig?.additional_info && <p className="whitespace-pre-wrap text-sm text-slate-600">{data.admissionsConfig.additional_info}</p>}
      {applyButton}
    </div>}
  </Section>;

  const pricing = <Section id="frais" title="Frais de scolarité">{flags.showPricing && data.fees ? <StructuredPricing pricing={data.fees} documents={flags.showDocuments ? data.docsList : []} /> : <Pending>Les frais de scolarité ne sont pas encore publiés.</Pending>}</Section>;
  const gallery = <Section id="photos" title="Galerie photos" icon={<Camera className="shrink-0 text-blue-600" />}><SchoolGallery images={home ? data.images.slice(0, 6) : data.images} />{home && data.images.length > 6 && <Link href={`${buildMiniSiteViewHref(baseHref, "galerie")}#photos`} className="mt-4 inline-block text-sm font-bold text-blue-600">Voir toutes les photos →</Link>}</Section>;
  const results = <Section id="performances" title="Résultats et performances" icon={<Trophy className="shrink-0 text-emerald-600" />}>{data.results.length > 0 || !!data.ranking ? <MiniSiteResultsPreview category={school.main_category} results={data.results} ranking={data.ranking} /> : <Pending>Les résultats de l’établissement seront affichés lorsqu’ils seront publiés.</Pending>}</Section>;
  const infrastructure = <Section id="vie-scolaire" title="Vie scolaire et équipements" icon={<Building2 className="shrink-0 text-blue-600" />}>{flags.infraItems.length ? <div className="grid gap-3 sm:grid-cols-2">{flags.infraItems.map((key) => { const item = INFRA_LABELS[key]; const Icon = item.icon; return <div key={key} className="flex items-center gap-3 rounded-xl bg-blue-50 p-4"><Icon size={20} className="text-blue-600" /><span className="font-semibold">{item.label}</span></div>; })}</div> : <Pending>Les équipements et la vie scolaire seront présentés ici.</Pending>}</Section>;
  const news = <Section id="actualites" title="Actualités"><AnnouncementsTab key={school.id} schoolId={school.id} /></Section>;
  const documents = <Section id="documents" title="Documents">{flags.showDocuments ? <DocumentDownloadCtas documents={data.docsList} /> : <Pending>Aucun document public n’est disponible pour le moment.</Pending>}</Section>;
  const contact = <Section id="contact" title="Contact"><div className="space-y-4 text-sm text-slate-600">
    <p>{[school.address, location].filter(Boolean).join(", ") || "Adresse à venir."}</p>
    {school.phone ? <a href={`tel:${school.phone}`} className="flex items-center gap-2 font-semibold text-emerald-700"><Phone size={17} />{school.phone}</a> : <p>Téléphone à venir.</p>}
    {school.email && <a href={`mailto:${school.email}`} className="flex items-center gap-2 break-all text-blue-600"><Mail size={17} />{school.email}</a>}
  </div></Section>;

  // The CMS determines both visibility and ordering; empty published sections retain their template slots.
  const blocks: Record<string, ReactNode> = { presentation, admissions: programmes, pricing, infrastructure, gallery, news, documents, contact };
  const keys = home ? ["presentation", "admissions", "pricing", "gallery"] : activeView === "etablissement" ? ["presentation", "infrastructure"] : activeView === "admissions" ? ["admissions", "pricing", "documents"] : activeView === "vie" ? ["infrastructure", "news"] : ["gallery", "documents", "contact"];
  const orderedKeys = [...data.sectionConfig.map((section) => section.key), ...keys].filter((key, index, all) => all.indexOf(key) === index && keys.includes(key) && visible(key));

  return <div className="bg-[#f8fafc] text-[#102750]">
    <section className="relative overflow-hidden bg-gradient-to-br from-[#052d64] via-[#07539b] to-[#102750]">
      {slides.map((slide, index) => <Image key={slide.id} src={slide.image} alt={index === photoIndex ? school.name : ""} fill priority={index === 0} sizes="100vw" className={`object-cover transition-opacity duration-700 ${index === photoIndex ? "opacity-100" : "opacity-0"}`} />)}
      <div className="absolute inset-0 bg-gradient-to-r from-[#052d64]/85 via-[#07539b]/55 to-[#052d64]/20" />
      <div className="relative mx-auto flex min-h-[390px] max-w-[1440px] items-end gap-8 px-5 pb-16 pt-24 lg:px-8">
        <div className="relative hidden h-48 w-48 shrink-0 items-center justify-center overflow-hidden rounded-[34px] border-4 border-white bg-white text-5xl font-black text-[#102750] shadow-2xl md:flex">
          {school.logo_url ? <Image src={school.logo_url} alt={`Logo ${school.name}`} fill sizes="192px" className="object-contain p-3" /> : schoolMonogram(school.name)}
        </div>
        <div className="min-w-0 flex-1 text-white">
          <h1 className="break-words text-3xl font-extrabold tracking-tight md:text-5xl">{school.name}</h1>
          {school.motto && <p className="mt-2 text-lg">{school.motto}</p>}
          {categoryLabel && <p className="mt-5 inline-flex rounded-lg bg-white px-3 py-2 text-xs font-bold text-[#102750]">{categoryLabel}</p>}
          <div className="mt-5 flex flex-wrap items-center gap-4 text-sm font-semibold">
            {location && <span className="inline-flex items-center gap-2"><MapPin size={17} />{location}</span>}
            {badge && <span className="inline-flex items-center gap-2 rounded-lg bg-emerald-100 px-3 py-2 text-emerald-700"><CheckCircle2 size={17} />{badge.label}</span>}
          </div>
        </div>
        <button type="button" onClick={() => setFavorite((value) => !value)} aria-pressed={favorite} className="absolute right-5 top-5 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-bold text-[#102750] shadow"><Heart size={17} className={favorite ? "fill-rose-500 text-rose-500" : ""} />{favorite ? "Ajouté aux favoris" : "Ajouter aux favoris"}</button>
        {slides.length > 1 && <div className="absolute bottom-4 right-5 flex items-center gap-2"><button type="button" aria-label="Photo précédente" onClick={() => setActiveHero((photoIndex - 1 + slides.length) % slides.length)} className="rounded-full bg-white p-2.5"><ChevronLeft size={20} /></button><span className="rounded-full bg-black/30 px-3 py-2 text-xs text-white">{photoIndex + 1} / {slides.length}</span><button type="button" aria-label="Photo suivante" onClick={() => setActiveHero((photoIndex + 1) % slides.length)} className="rounded-full bg-white p-2.5"><ChevronRight size={20} /></button></div>}
      </div>
    </section>
    <nav aria-label="Sections de l’établissement" className={`${data.mode === "public" ? "sticky top-[72px]" : ""} z-30 overflow-x-auto border-b border-slate-200 bg-white shadow-sm`}>
      <div className="mx-auto flex w-max min-w-full max-w-[1440px] px-4">{navigation.map((item, index) => <Link key={item.label} href={`${buildMiniSiteViewHref(baseHref, item.view)}${item.anchor ? `#${item.anchor}` : ""}`} aria-current={activeView === item.view && navigation.findIndex((entry) => entry.view === item.view) === index ? "page" : undefined} className={`flex h-14 shrink-0 items-center border-b-2 px-4 text-sm font-bold ${activeView === item.view ? "border-blue-600 text-blue-700" : "border-transparent text-slate-700 hover:text-blue-700"}`}>{item.label}</Link>)}</div>
    </nav>
    <div className="mx-auto grid max-w-[1440px] gap-6 px-5 py-7 lg:grid-cols-[minmax(0,1fr)_330px] lg:px-8">
      <div className="min-w-0 space-y-7">
        {orderedKeys.map((key) => <div key={key}>{blocks[key]}</div>)}
        {(home || activeView === "vie") && visible("admissions") && results}
        {orderedKeys.length === 0 && <Pending>Cette rubrique sera disponible prochainement.</Pending>}
      </div>
      <aside className="min-w-0 space-y-4 lg:sticky lg:top-36 lg:self-start">
        {(flags.showAdmissions || flags.showContact) && <div className="rounded-2xl bg-white p-4 shadow-sm">
          {flags.showAdmissions && applyButton}
          {flags.showContact && school.phone && <a href={`tel:${school.phone}`} className="mt-2 flex min-h-11 items-center justify-center gap-2 rounded-xl border p-3 text-sm font-bold"><Phone className="text-emerald-600" size={17} />Contacter l’établissement</a>}
          {flags.showContact && school.whatsapp && <a href={`https://wa.me/${school.whatsapp.replace(/\D/g, "")}`} className="mt-2 flex min-h-11 items-center justify-center gap-2 rounded-xl border p-3 text-sm font-bold"><MessageCircle className="text-emerald-600" size={17} />Écrire sur WhatsApp</a>}
        </div>}
        <Section id="informations-pratiques" title="Informations pratiques" icon={<Building2 size={20} className="shrink-0 text-emerald-600" />}>
          <dl className="space-y-4 text-sm">{[{ label: "Catégorie", value: categoryLabel }, { label: "Localisation", value: location }, ...(flags.showContact ? [{ label: "Téléphone", value: school.phone }, { label: "Email", value: school.email }] : [])].map((item) => <div key={item.label}><dt className="font-bold">{item.label}</dt><dd className="mt-1 break-words text-slate-500">{item.value || "À venir"}</dd></div>)}</dl>
        </Section>
        {flags.showContact && <Section id="localisation" title="Localisation" icon={<MapPin size={20} className="text-emerald-600" />}>
          <div className="rounded-xl bg-blue-50 p-6 text-center"><MapPin size={30} className="mx-auto text-blue-600" /><p className="mt-3 text-sm font-semibold">{[school.address, location].filter(Boolean).join(", ") || "Adresse à venir"}</p>{mapsHref ? <a href={mapsHref} target="_blank" rel="noopener noreferrer" className="mt-4 inline-block text-sm font-bold text-blue-600">Ouvrir la carte →</a> : <p className="mt-2 text-xs text-slate-500">La position sur la carte sera ajoutée par l’établissement.</p>}</div>
        </Section>}
      </aside>
    </div>
  </div>;
}
