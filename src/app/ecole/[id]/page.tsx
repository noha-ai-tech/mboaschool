"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  MapPin,
  Phone,
  FileText,
  Bell,
  Building2,
  Wifi,
  Bus,
  Utensils,
  Monitor,
  ShieldCheck,
  MessageCircle,
  Clock3,
  GraduationCap,
  ClipboardList,
  CheckCircle2,
  Crown,
  ArrowLeft,
  School,
  AlertCircle,
  BookOpen,
  ImageIcon,
  Download,
  FlaskConical,
  Dumbbell,
  BedDouble,
  HeartPulse,
  UserCheck,
} from "lucide-react";

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
  const [activeSlide, setActiveSlide] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  const heroImages = useMemo(() => {
    if (images.length > 0) return images.map((img: any) => img.url as string);
    if (school?.cover_image_url) return [school.cover_image_url as string];
    return [] as string[];
  }, [images, school?.cover_image_url]);

  useEffect(() => {
    if (heroImages.length <= 1) return;
    timerRef.current = setInterval(() => {
      setActiveSlide((prev) => (prev + 1) % heroImages.length);
    }, 5000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [heroImages.length]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f9f7f2]">
        <div className="h-[380px] bg-[#0a0f0d] animate-pulse" />
        <div className="max-w-6xl mx-auto px-4 py-10 grid lg:grid-cols-[1fr_300px] gap-8">
          <div className="space-y-4">
            <div className="h-10 w-48 bg-slate-200 rounded" />
            <div className="h-64 bg-white border border-[#ebebeb] rounded-2xl" />
          </div>
          <div className="h-40 bg-white border border-[#ebebeb] rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!school) {
    return (
      <div className="min-h-screen bg-[#f9f7f2] flex items-center justify-center">
        <div className="text-center">
          <School size={40} className="mx-auto text-slate-300 mb-4" />
          <p className="text-slate-400 font-semibold">Établissement introuvable.</p>
          <Link href="/" className="text-sm text-emerald-700 font-semibold mt-3 block">
            ← Retour à l'annuaire
          </Link>
        </div>
      </div>
    );
  }

  function goToSlide(i: number) {
    setActiveSlide(i);
    if (timerRef.current) clearInterval(timerRef.current);
    if (heroImages.length > 1) {
      timerRef.current = setInterval(() => {
        setActiveSlide((prev) => (prev + 1) % heroImages.length);
      }, 5000);
    }
  }

  const infraItems = Object.keys(INFRA_LABELS).filter((k) => infra?.[k] === true);

  // Ancres de navigation — la barre sticky ne change jamais de page,
  // elle fait défiler jusqu'à la section correspondante (voir les id=
  // posés sur chaque section plus bas).
  const sectionNav = [
    { id: "presentation",     label: "Présentation" },
    { id: "admissions",       label: "Admissions" },
    { id: "frais",            label: "Frais" },
    { id: "infrastructures",  label: "Infrastructures" },
    { id: "galerie",          label: "Galerie" },
    { id: "localisation",     label: "Localisation" },
  ];

  return (
    <div className="min-h-screen bg-[#f9f7f2]">

      {/* Hero — carrousel */}
      <section className="relative min-h-[280px] h-[60vh] bg-[#0a0f0d] text-white overflow-hidden">

        {/* Slides */}
        {heroImages.map((src, i) => (
          <img
            key={src}
            src={src}
            alt=""
            loading={i === 0 ? "eager" : "lazy"}
            className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-700 ${
              i === activeSlide ? "opacity-100" : "opacity-0"
            }`}
          />
        ))}

        {/* Overlay : fort en bas pour lisibilité, léger en haut */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-black/15 pointer-events-none" />

        {/* Contenu positionné en bas */}
        <div className="relative z-10 max-w-6xl mx-auto px-4 h-full flex flex-col">

          {/* Lien retour en haut */}
          <div className="pt-6 shrink-0">
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-sm font-semibold text-white/60 hover:text-white transition-colors"
            >
              <ArrowLeft size={15} />
              Annuaire
            </Link>
          </div>

          {/* Pousse le texte vers le bas */}
          <div className="flex-1" />

          {/* Texte + badges + dots */}
          <div className="pb-8">
            <div className="flex items-center gap-2 flex-wrap mb-3">
              <span className="text-[10px] font-bold tracking-widest uppercase text-emerald-400">
                {school.main_category || "Établissement"}
              </span>
              {school.is_verified && (
                <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-300 bg-emerald-900/50 border border-emerald-800 px-2 py-0.5 rounded-full">
                  <CheckCircle2 size={9} /> Vérifié
                </span>
              )}
              {school.subscription_plan === "premium" && (
                <span className="flex items-center gap-1 text-[10px] font-bold text-yellow-300 bg-yellow-900/30 border border-yellow-800 px-2 py-0.5 rounded-full">
                  <Crown size={9} /> Premium
                </span>
              )}
            </div>

            <h1 className="text-4xl md:text-6xl font-black tracking-tight mb-3 leading-none">
              {school.name}
            </h1>

            <div className="flex flex-wrap items-center gap-4 text-sm text-white/70">
              {school.city && (
                <span className="flex items-center gap-1.5">
                  <MapPin size={13} />
                  {school.city}{school.neighborhood ? `, ${school.neighborhood}` : ""}
                </span>
              )}
              {school.phone && (
                <span className="flex items-center gap-1.5">
                  <Phone size={13} />
                  {school.phone}
                </span>
              )}
            </div>

            {/* Points de navigation — visibles seulement si plusieurs images */}
            {heroImages.length > 1 && (
              <div className="flex items-center gap-2 mt-5">
                {heroImages.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => goToSlide(i)}
                    aria-label={`Photo ${i + 1}`}
                    className={`rounded-full transition-all duration-300 ${
                      i === activeSlide
                        ? "w-5 h-1.5 bg-white"
                        : "w-1.5 h-1.5 bg-white/40 hover:bg-white/70"
                    }`}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Navigation sticky — ancres vers les sections ci-dessous, tout reste sur la même page */}
      <div className="border-b border-border bg-white sticky top-0 z-30 overflow-x-auto">
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex gap-0 whitespace-nowrap">
            {sectionNav.map((item) => (
              <button
                key={item.id}
                onClick={() => document.getElementById(item.id)?.scrollIntoView({ behavior: "smooth", block: "start" })}
                className="px-5 py-3.5 text-sm font-semibold border-b-2 border-transparent text-slate-500 hover:text-[#0a0a0a] hover:border-slate-200 transition-colors duration-fast shrink-0"
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Contenu — toutes les sections empilées, jamais dispersées sur d'autres pages */}
      <div className="max-w-6xl mx-auto px-4 py-8 grid lg:grid-cols-[1fr_300px] gap-8 items-start">

        <div className="space-y-5 pb-16 lg:pb-0">
          <GeneralTab school={school} fees={fees} infra={infra} infraItems={infraItems} />

          <div id="galerie" className="scroll-mt-20">
            <h2 className="font-bold text-sm mb-3 px-1">Galerie{images.length > 0 ? ` (${images.length})` : ""}</h2>
            <GalerieTab images={images} />
          </div>

          {docsList.length > 0 && (
            <div id="documents" className="scroll-mt-20">
              <h2 className="font-bold text-sm mb-3 px-1">Documents ({docsList.length})</h2>
              <DocumentsTab docs={docsList} />
            </div>
          )}

          <div id="annonces" className="scroll-mt-20">
            <h2 className="font-bold text-sm mb-3 px-1">Annonces</h2>
            <AnnouncementsTab schoolId={id} />
          </div>

          <div id="localisation" className="bg-white border border-border rounded-card p-6 scroll-mt-20">
            <h2 className="font-bold text-sm mb-4">Localisation</h2>
            {school.city || school.neighborhood || school.address ? (
              <>
                <p className="text-sm text-slate-600 mb-4">
                  {[school.address, school.neighborhood, school.city].filter(Boolean).join(", ")}
                </p>
                {school.latitude && school.longitude && (
                  <a
                    href={`https://www.google.com/maps?q=${school.latitude},${school.longitude}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline"
                  >
                    <MapPin size={14} /> Voir sur la carte
                  </a>
                )}
              </>
            ) : (
              <p className="text-sm text-slate-400">Localisation non renseignée par l&apos;établissement.</p>
            )}
          </div>

          <ParentTab schoolId={id} />
        </div>

        {/* Sidebar */}
        <aside className="space-y-4 lg:sticky lg:top-[53px]">
          <div className="bg-white border border-[#ebebeb] rounded-2xl p-5">
            <p className="text-xs font-bold tracking-widest uppercase text-slate-400 mb-4">Intéressé ?</p>
            <Link
              href={`/preinscription?ecole=${school.id}`}
              className="block w-full text-center bg-[#0a0a0a] text-white py-3 rounded-xl text-sm font-bold hover:bg-slate-800 transition-colors"
            >
              Préinscrire mon enfant
            </Link>
            <p className="text-[11px] text-slate-400 text-center mt-2">Gratuit · Sans engagement</p>
          </div>

          <div className="bg-white border border-[#ebebeb] rounded-2xl p-5">
            <p className="text-xs font-bold tracking-widest uppercase text-slate-400 mb-4">Contact</p>
            {school.phone ? (
              <>
                <p className="text-sm font-semibold text-[#0a0a0a] mb-3 flex items-center gap-2">
                  <Phone size={13} className="text-slate-400" />
                  {school.phone}
                </p>
                <a
                  href={`https://wa.me/${school.phone?.replace(/\D/g, "")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full border border-[#0a0a0a] text-[#0a0a0a] py-2.5 rounded-xl text-sm font-bold hover:bg-[#0a0a0a] hover:text-white transition-colors"
                >
                  <MessageCircle size={14} />
                  WhatsApp
                </a>
              </>
            ) : (
              <p className="text-sm text-slate-400">Téléphone non renseigné.</p>
            )}
          </div>

          <div className="bg-white border border-[#ebebeb] rounded-2xl p-5">
            <p className="text-xs font-bold tracking-widest uppercase text-slate-400 mb-4 flex items-center gap-2">
              <Clock3 size={11} /> Horaires
            </p>
            <p className="text-sm text-slate-600">Lundi – Vendredi</p>
            <p className="text-lg font-black text-[#0a0a0a] mt-1">07h30 – 17h00</p>
          </div>

          {!school.owner_id && (
            <div className="bg-white border border-[#ebebeb] rounded-2xl p-5">
              <p className="text-xs font-bold tracking-widest uppercase text-slate-400 mb-3 flex items-center gap-2">
                <UserCheck size={12} /> Vous représentez cet établissement ?
              </p>
              <p className="text-xs text-slate-500 mb-3 leading-relaxed">
                Revendiquez cette page pour la gérer vous-même : modifier les informations, publier des photos,
                traiter les préinscriptions.
              </p>
              <Link
                href={`/revendiquer/${school.id}`}
                className="block w-full text-center border border-[#0a0a0a] text-[#0a0a0a] py-2.5 rounded-xl text-sm font-bold hover:bg-[#0a0a0a] hover:text-white transition-colors"
              >
                C&apos;est mon établissement
              </Link>
            </div>
          )}
        </aside>
      </div>

      {/* CTA sticky mobile — la préinscription reste accessible sans remonter en haut de page */}
      <div className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-border p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <Link
          href={`/preinscription?ecole=${school.id}`}
          className="block w-full text-center bg-[#0A0A0A] text-white py-3 rounded-[10px] text-sm font-bold"
        >
          Préinscrire mon enfant
        </Link>
      </div>
      <div className="lg:hidden h-20" aria-hidden="true" />
    </div>
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
        <p className="text-slate-600 text-sm leading-relaxed">
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
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{row.label}</p>
              <p className="font-bold text-[#0a0a0a] mt-1 text-sm">{row.value}</p>
            </div>
          ))}
        </div>
      </div>

      <div id="frais" className="bg-white border border-border rounded-card p-6 scroll-mt-20">
        <h2 className="font-bold text-sm mb-4">Frais de scolarité</h2>
        {feeRows.length === 0 ? (
          <p className="text-sm text-slate-400">Frais non renseignés par l'établissement.</p>
        ) : (
          <div className="divide-y divide-[#f5f5f5]">
            {feeRows.map((f) => (
              <div key={f.key} className="flex items-center justify-between py-3">
                <span className="text-sm text-slate-600">{f.label}</span>
                <span className="text-sm font-bold text-[#0a0a0a]">
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
          <p className="text-sm text-slate-400">Infrastructures non renseignées par l&apos;établissement.</p>
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">
            {infraItems.map((key) => {
              const item = INFRA_LABELS[key];
              const Icon = item.icon;
              return (
                <div key={key} className="flex items-center gap-3 bg-muted rounded-xl p-3">
                  <Icon size={15} className="text-primary shrink-0" />
                  <span className="text-sm font-semibold text-[#0a0a0a]">{item.label}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function GalerieTab({ images }: { images: any[] }) {
  const [lightbox, setLightbox] = useState<string | null>(null);

  if (images.length === 0) {
    return (
      <div className="bg-white border border-[#ebebeb] rounded-2xl py-16 text-center">
        <ImageIcon size={28} className="mx-auto text-slate-200 mb-4" />
        <p className="text-sm text-slate-400">Aucune photo publiée.</p>
      </div>
    );
  }

  return (
    <>
      <div className="grid sm:grid-cols-2 gap-4">
        {images.map((img) => (
          <button
            key={img.id}
            onClick={() => setLightbox(img.url)}
            className="group bg-white border border-[#ebebeb] rounded-2xl overflow-hidden text-left hover:border-[#ccc] transition-colors"
          >
            <img
              src={img.url}
              alt={img.caption ?? "Photo"}
              className="w-full aspect-[4/3] object-cover group-hover:scale-[1.02] transition-transform duration-300"
            />
            {img.caption && (
              <p className="text-xs text-slate-500 px-4 py-3">{img.caption}</p>
            )}
          </button>
        ))}
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          <img
            src={lightbox}
            alt="Photo agrandie"
            className="max-w-full max-h-[90vh] rounded-xl object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}

function DocumentsTab({ docs }: { docs: any[] }) {
  if (docs.length === 0) {
    return (
      <div className="bg-white border border-[#ebebeb] rounded-2xl py-16 text-center">
        <FileText size={28} className="mx-auto text-slate-200 mb-4" />
        <p className="text-sm text-slate-400">Aucun document disponible.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {docs.map((doc) => {
        const typeLabel = DOC_TYPE_LABELS[doc.type] ?? doc.type;
        return (
          <div
            key={doc.id}
            className="bg-white border border-[#ebebeb] rounded-2xl p-4 flex items-center gap-4"
          >
            <div className="w-10 h-10 rounded-xl bg-slate-50 border border-[#ebebeb] flex items-center justify-center shrink-0">
              <FileText size={16} className="text-slate-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm text-[#0a0a0a] truncate">{doc.name}</p>
              <p className="text-xs text-slate-400 mt-0.5">{typeLabel}</p>
            </div>
            <a
              href={doc.url}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 flex items-center gap-1.5 text-xs font-bold text-emerald-700 border border-emerald-200 bg-emerald-50 px-3 py-1.5 rounded-lg hover:bg-emerald-100 transition-colors"
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
          <div key={i} className="h-24 bg-white border border-[#ebebeb] rounded-2xl animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {announcements.length === 0 ? (
        <div className="bg-white border border-[#ebebeb] rounded-2xl py-14 text-center">
          <Bell size={28} className="mx-auto text-slate-200 mb-4" />
          <p className="text-sm text-slate-400">Aucune annonce publiée.</p>
        </div>
      ) : (
        announcements.map((a) => (
          <div
            key={a.id}
            className={`bg-white border rounded-2xl p-5 ${a.is_important ? "border-red-200" : "border-[#ebebeb]"}`}
          >
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              {a.is_important && (
                <span className="flex items-center gap-1 text-[10px] font-bold text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
                  <AlertCircle size={9} /> Important
                </span>
              )}
              <span className="text-[10px] text-slate-400 font-medium">
                {new Date(a.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
              </span>
            </div>
            <h3 className="font-bold text-[#0a0a0a] mb-1">{a.title}</h3>
            <p className="text-sm text-slate-500 leading-relaxed">{a.content}</p>
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
      <p className="text-slate-400 text-sm mb-6 leading-relaxed">
        Préinscrivez votre enfant en ligne. Une fois le dossier accepté, cet
        espace devient le lien entre le parent, l'élève et l'école.
      </p>
      <div className="grid sm:grid-cols-2 gap-3 mb-6">
        {cards.map(({ icon: Icon, title, text }) => (
          <div key={title} className="bg-white/5 rounded-xl p-4 border border-white/8">
            <Icon size={15} className="text-emerald-400 mb-3" />
            <h3 className="font-bold text-sm text-white mb-1">{title}</h3>
            <p className="text-xs text-slate-400 leading-relaxed">{text}</p>
          </div>
        ))}
      </div>
      <Link
        href={`/preinscription?ecole=${schoolId}`}
        className="inline-block bg-yellow-400 text-black px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-yellow-300 transition-colors"
      >
        Préinscrire mon enfant
      </Link>
    </div>
  );
}
