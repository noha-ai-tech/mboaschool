"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Fraunces, Plus_Jakarta_Sans } from "next/font/google";
import { supabase } from "@/lib/supabase";
import {
  ArrowLeft, MapPin, CheckCircle2, ArrowRight, School, Search, X, ChevronUp, ChevronDown,
} from "lucide-react";
import { CAT_META } from "./catMeta";
import { includesInsensitive } from "@/lib/textSearch";
import { TRUST_BADGE_LABELS } from "@/lib/trust/resolveEstablishmentTrustState";
import { formatQuartierCity } from "@/lib/formatSchoolLocation";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { SiteHeader, SiteHeaderSpacer } from "@/components/layout/SiteHeader";
import { AnnouncementTicker, type TickerItem } from "@/components/hero/AnnouncementTicker";
import { FeaturedSchoolsCarousel } from "@/components/schools/FeaturedSchoolsCarousel";
import { THUMBNAIL_TONES, type FeaturedSchool } from "@/components/schools/SchoolCard";
import { HERO_PHOTOS } from "@/lib/heroPhotos";

// Typographie de marque (skill ecoles237-design-system) — Fraunces pour les
// titres éditoriaux, scopée à cette page via variable CSS (voir même
// pattern déjà en place sur src/app/page.tsx), sans toucher au Manrope
// global du reste du site.
const fraunces = Fraunces({
  subsets: ["latin"],
  style: ["normal", "italic"],
  variable: "--font-fraunces",
  display: "swap",
});
const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-jakarta",
  display: "swap",
});

// ─── Carrousel des écoles mises en avant ────────────────────────────────────
//
// Volontairement pas un encart "publicitaire"/"sponsorisé" : une slide = une
// vraie école "mise en avant" dans cette catégorie (`establishments.is_featured`,
// le même signal que l'admin bascule sous le libellé "Mise en avant
// (sponsorisé)" — voir dashboard/admin/ecoles/[id]), avec le même libellé
// public "À la une" que partout ailleurs sur le site (SchoolCard, grille de
// la présente page) — jamais le mot "Sponsorisé", qui évoque à tort un
// emplacement publicitaire payant qui n'existe pas dans le produit.
// La photo vient de `school_images` (statut live) puis `cover_image_url` en
// repli, comme sur le reste du site (voir useShowcasePhotos) ; si aucune
// photo réelle n'existe encore pour cette école précise, le fond utilise une
// des vraies photos du Hero de l'accueil (src/lib/heroPhotos.ts, mêmes
// photos que le panneau d'authentification) plutôt qu'un aplat de couleur
// ou une image inventée — jamais une photo présentée comme LA photo de
// cette école, juste un fond de marque réel et cohérent avec le reste du
// site. La description vient du champ réel `establishments.description` ;
// à défaut, un texte factuel dérivé de données réelles (sous-catégorie +
// ville) — jamais un texte marketing inventé.
type FeaturedSlide = {
  id: string;
  schoolId: string;
  photoUrl: string | null;
  name: string;
  description: string;
};

function FeaturedCarousel({ slides }: { slides: FeaturedSlide[] }) {
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (slides.length < 2) return;
    const id = setInterval(() => setActive((v) => (v + 1) % slides.length), 4500);
    return () => clearInterval(id);
  }, [slides.length]);

  if (slides.length === 0) {
    return (
      <div className="relative flex-1 min-h-[220px] lg:min-h-[420px] rounded-[18px] overflow-hidden shadow-[0_18px_36px_-18px_rgba(11,59,46,0.3)]">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${HERO_PHOTOS[0].url})` }}
        />
        <div
          className="absolute inset-0"
          style={{ background: "linear-gradient(135deg, rgba(6,37,27,0.85) 0%, rgba(6,37,27,0.55) 100%)" }}
        />
        <div className="relative h-full flex flex-col items-center justify-center text-center p-8">
          <p className="text-xs font-bold uppercase tracking-wider text-[#F2AE1F] mb-2">À la une</p>
          <p className="text-sm text-white/85 max-w-[260px]">
            Aucune école mise en avant dans cette catégorie pour l&apos;instant.
          </p>
        </div>
      </div>
    );
  }

  const move = (dir: 1 | -1) => setActive((v) => (v + dir + slides.length) % slides.length);

  return (
    <div className="relative flex-1 min-h-[220px] lg:min-h-[420px] rounded-[18px] overflow-hidden shadow-[0_18px_36px_-18px_rgba(11,59,46,0.3)]">
      {slides.map((slide, i) => (
        <div
          key={slide.id}
          className="absolute inset-0 bg-cover bg-center transition-opacity duration-[900ms] ease-in-out"
          style={{
            backgroundImage: `url(${slide.photoUrl ?? HERO_PHOTOS[i % HERO_PHOTOS.length].url})`,
            opacity: i === active ? 1 : 0,
          }}
        >
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(0deg, rgba(6,37,27,0.92) 0%, rgba(6,37,27,0.6) 45%, rgba(6,37,27,0.15) 75%, transparent 100%)",
            }}
          />
          <div className="absolute inset-0 flex flex-col justify-end p-6">
            <span className="inline-flex w-fit items-center bg-[#F2AE1F] text-[#0B3B2E] text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-md mb-3">
              À la une
            </span>
            <h3 className="font-[family-name:var(--font-fraunces)] text-xl font-semibold text-white leading-tight mb-2">
              {slide.name}
            </h3>
            <p className="text-sm text-white/85 leading-relaxed mb-4 line-clamp-3">{slide.description}</p>
            <Link
              href={`/ecole/${slide.schoolId}`}
              className="inline-flex items-center gap-2 w-fit bg-white text-[#0B3B2E] text-sm font-bold px-4 py-2.5 rounded-[10px] hover:bg-[#F2AE1F] transition-colors duration-base"
            >
              Voir la fiche <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      ))}

      {slides.length > 1 && (
        <>
          <button
            onClick={() => move(-1)}
            aria-label="Précédent"
            className="absolute left-1/2 -translate-x-1/2 top-3 z-10 w-7 h-7 rounded-full bg-white/85 text-[#0B3B2E] flex items-center justify-center hover:bg-white transition-colors duration-base"
          >
            <ChevronUp size={14} />
          </button>
          <button
            onClick={() => move(1)}
            aria-label="Suivant"
            className="absolute left-1/2 -translate-x-1/2 bottom-3 z-10 w-7 h-7 rounded-full bg-white/85 text-[#0B3B2E] flex items-center justify-center hover:bg-white transition-colors duration-base"
          >
            <ChevronDown size={14} />
          </button>
          <div className="absolute top-12 right-3 z-10 flex flex-col gap-1.5">
            {slides.map((slide, i) => (
              <button
                key={slide.id}
                onClick={() => setActive(i)}
                aria-label={`Voir l'établissement mis en avant ${i + 1}`}
                className={`w-1.5 rounded-full transition-all duration-base ${i === active ? "h-4 bg-white" : "h-1.5 bg-white/50"}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────

function CategoryPageInner() {
  const { slug } = useParams() as { slug: string };
  const searchParams = useSearchParams();
  const router = useRouter();
  const activeSub = searchParams.get("sous") ?? "all";

  const meta = CAT_META[slug];
  const [schools, setSchools] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!meta) return;
    setLoading(true);
    supabase
      .from("establishments")
      .select(`
        id, name, main_category, sub_category, description,
        city, neighborhood, cover_image_url,
        is_verified, is_featured, is_claimed, subscription_plan,
        fees(registration_fee, tuition_fee),
        school_images(url)
      `)
      .eq("main_category", slug)
      // CMS-F.6 — ne remonter que les photos publiées (même filtre que
      // useShowcasePhotos), défense en profondeur avec la policy RLS.
      .eq("school_images.status", "live")
      .order("is_featured", { ascending: false })
      .then(({ data }) => {
        if (data) setSchools(data);
        setLoading(false);
      });
  }, [slug]);

  const featuredForCarousel: FeaturedSchool[] = useMemo(
    () =>
      schools
        .filter((s) => s.is_featured)
        .map((s) => ({
          id: s.id,
          name: s.name,
          city: s.city ?? null,
          quartier: s.neighborhood ?? null,
          category: s.sub_category ?? meta?.label ?? "",
          subcategory: "",
          image: s.cover_image_url ?? null,
          verified: !!s.is_verified,
          isFeatured: !!s.is_featured,
          isClaimed: s.is_claimed ?? true,
        })),
    [schools, meta]
  );

  // Une slide par vraie photo (pas juste une par école) : la plupart des
  // écoles mises en avant ont plusieurs photos publiées dans
  // `school_images`, c'est ce qui fait réellement défiler le carrousel
  // comme dans la maquette plutôt que de rester figé sur une seule image.
  const featuredSlides: FeaturedSlide[] = useMemo(
    () =>
      schools
        .filter((s) => s.is_featured)
        .flatMap((s) => {
          const location = formatQuartierCity(s.neighborhood, s.city);
          const description =
            (s.description as string | null)?.trim() ||
            `${s.sub_category ?? meta?.label ?? "Établissement"}${location ? ` à ${location}` : ""}.`;
          // Uniquement `school_images` (upload réel, modéré — statut "live")
          // — jamais `cover_image_url`, qui peut contenir une image de stock
          // sans rapport avec l'établissement (même logique que SchoolCard :
          // aucune "vraie photo" non vérifiable présentée comme telle).
          const livePhotos: string[] = (s.school_images ?? []).map((img: { url: string }) => img.url).filter(Boolean);
          const photoUrls: (string | null)[] = livePhotos.length > 0 ? livePhotos : [null];
          return photoUrls.map((photoUrl, j) => ({
            id: `${s.id}-${j}`,
            schoolId: s.id,
            photoUrl,
            name: s.name,
            description,
          }));
        }),
    [schools, meta]
  );

  if (!meta) {
    return (
      <div className="min-h-screen bg-[#FBF6F2]">
        <SiteHeader />
        <SiteHeaderSpacer />
        <div className="flex items-center justify-center py-24">
          <div className="text-center">
            <p className="text-[#5A695F] font-semibold">Catégorie introuvable.</p>
            <Link href="/" className="text-sm text-[#12543F] font-semibold mt-3 block">← Retour à l&apos;accueil</Link>
          </div>
        </div>
      </div>
    );
  }

  const { label, description, icon: CatIcon, subcategories } = meta;

  // Subcategory counts — combine predefined + DB values
  const dbSubcats = Array.from(new Set(schools.map((s) => s.sub_category).filter(Boolean)));
  const allSubcats = Array.from(new Set([...subcategories, ...dbSubcats]));

  const subcatCounts: Record<string, number> = {};
  allSubcats.forEach((sub) => {
    subcatCounts[sub] = schools.filter(
      (s) => (s.sub_category ?? "").toLowerCase() === sub.toLowerCase()
    ).length;
  });

  // "Mis en avant" = uniquement is_featured (signal commercial réel, distinct
  // de la vérification). Vérifié reste un badge indépendant affiché sur
  // n'importe quelle carte, organique ou mise en avant — jamais fusionnés
  // (voir docs/03_DESIGN_SYSTEM, hiérarchie commerciale organic/verified/sponsored).
  const featured = schools.filter((s) => s.is_featured);

  // Filtered list
  const filtered = schools.filter((s) => {
    if (activeSub !== "all" && (s.sub_category ?? "").toLowerCase() !== activeSub.toLowerCase()) return false;
    if (query && !includesInsensitive(`${s.name} ${s.city ?? ""} ${s.neighborhood ?? ""} ${s.sub_category ?? ""}`, query)) {
      return false;
    }
    return true;
  });

  // Bande d'annonces — même contrat que la Landing (src/app/page.tsx) :
  // chaque entrée est un vrai lien vers une école ou une page existante,
  // jamais un message inventé. Masquée automatiquement (voir
  // AnnouncementTicker) si aucune entrée réelle n'est disponible.
  const tickerItems: TickerItem[] = [];
  if (featured[0]) {
    tickerItems.push({
      id: "featured",
      label: `École à la une : ${featured[0].name}`,
      href: (featured[0].is_claimed ?? true) ? `/ecole/${featured[0].id}` : `/auth/inscription?ecole=${featured[0].id}`,
    });
  }
  if (!loading && schools.length > 0) {
    tickerItems.push({
      id: "count",
      label: `${schools.length} établissement${schools.length !== 1 ? "s" : ""} ${label.toLowerCase()} référencé${schools.length !== 1 ? "s" : ""}`,
      href: `/categorie/${slug}`,
    });
  }
  tickerItems.push({ id: "preinscription", label: "Préinscription en ligne", href: "/preinscription" });
  tickerItems.push({ id: "inscription", label: "Inscrire mon établissement", href: "/auth/inscription" });

  function setSubcat(sub: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (sub === "all") params.delete("sous");
    else params.set("sous", sub);
    router.replace(`/categorie/${slug}?${params.toString()}`);
  }

  return (
    <div className={`min-h-screen bg-[#FBF6F2] ${fraunces.variable} ${jakarta.variable}`}>
      <SiteHeader />
      <SiteHeaderSpacer />
      <AnnouncementTicker items={tickerItems} />

      <div className="max-w-[1520px] mx-auto px-[18px]">

        {/* ── FIL D'ARIANE ─────────────────────────────────────────── */}
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm font-semibold text-[#5A695F] hover:text-[#12543F] transition-colors duration-base pt-6"
        >
          <ArrowLeft size={15} /> Accueil
        </Link>

        {/* ── EN-TÊTE CATÉGORIE + CARROUSEL SPONSORISÉ ─────────────── */}
        <section className="pt-5 pb-10 flex flex-col lg:flex-row lg:items-center gap-7">
          <div className="flex gap-5 items-start lg:flex-[0_1_480px] min-w-0">
            <div className="shrink-0 w-16 h-16 rounded-2xl bg-gradient-to-br from-[#E9F5EE] to-[#DCEFE3] text-[#0B3B2E] flex items-center justify-center">
              <CatIcon size={28} />
            </div>
            <div>
              <p className="flex items-center gap-2.5 text-xs font-bold uppercase tracking-wider text-[#12543F] mb-2">
                <span aria-hidden="true" className="w-6 h-[3px] rounded-full bg-gradient-to-r from-[#1F8A5D] via-[#C8202F] to-[#F2AE1F]" />
                Catégorie
              </p>
              <h1 className="font-[family-name:var(--font-fraunces)] text-3xl md:text-4xl font-semibold text-[#132019] leading-tight mb-3">
                {label}
              </h1>
              <p className="text-sm text-[#5A695F] max-w-lg">{description}</p>
              <div className="flex items-center gap-5 mt-4 text-sm">
                <span>
                  <span className="font-[family-name:var(--font-fraunces)] text-[#132019] font-semibold text-xl">
                    {loading ? "—" : schools.length}
                  </span>
                  <span className="ml-1.5 text-[#5A695F]">établissement{schools.length !== 1 ? "s" : ""}</span>
                </span>
                {featured.length > 0 && (
                  <span className="inline-flex items-center gap-1.5 bg-[#FBEFD8] text-[#D6941A] text-xs font-bold px-2.5 py-1 rounded-full">
                    ★ {featured.length} mis en avant
                  </span>
                )}
              </div>
            </div>
          </div>

          <FeaturedCarousel slides={featuredSlides} />
        </section>

        {/* ── SOUS-CATÉGORIES ──────────────────────────────────────── */}
        <section className="pb-10">
          <h2 className="font-[family-name:var(--font-fraunces)] text-xl font-semibold text-[#132019] mb-5">
            Explorer par sous-catégorie
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3.5">
            <button
              onClick={() => setSubcat("all")}
              className={`flex flex-col items-start p-5 rounded-[16px] border text-left transition-colors duration-base ${
                activeSub === "all"
                  ? "bg-[#0B3B2E] text-white border-[#0B3B2E]"
                  : "bg-white border-[#E7E0D7] hover:border-[#12543F]"
              }`}
            >
              <span className={`font-[family-name:var(--font-fraunces)] text-2xl font-semibold ${activeSub === "all" ? "text-white" : "text-[#132019]"}`}>
                {loading ? "—" : schools.length}
              </span>
              <p className={`font-semibold text-sm mt-2 ${activeSub === "all" ? "text-white" : "text-[#132019]"}`}>Toutes</p>
              <p className={`text-xs mt-0.5 ${activeSub === "all" ? "text-white/60" : "text-[#5A695F]"}`}>
                école{schools.length !== 1 ? "s" : ""}
              </p>
            </button>

            {allSubcats.map((sub) => {
              const count = subcatCounts[sub] ?? 0;
              const active = activeSub === sub;
              return (
                <button
                  key={sub}
                  onClick={() => setSubcat(sub)}
                  className={`flex flex-col items-start p-5 rounded-[16px] border text-left transition-colors duration-base ${
                    active
                      ? "bg-[#0B3B2E] text-white border-[#0B3B2E]"
                      : "bg-white border-[#E7E0D7] hover:border-[#12543F]"
                  } ${count === 0 ? "opacity-50" : ""}`}
                >
                  <span className={`font-[family-name:var(--font-fraunces)] text-2xl font-semibold ${active ? "text-white" : "text-[#132019]"}`}>
                    {loading ? "—" : count}
                  </span>
                  <p className={`font-semibold text-sm mt-2 ${active ? "text-white" : "text-[#132019]"}`}>{sub}</p>
                  <p className={`text-xs mt-0.5 ${active ? "text-white/60" : "text-[#5A695F]"}`}>
                    école{count !== 1 ? "s" : ""}
                  </p>
                </button>
              );
            })}
          </div>
        </section>

        {/* ── ÉTABLISSEMENTS À DÉCOUVRIR (mis en avant) ────────────── */}
        {!loading && featuredForCarousel.length > 0 && (
          <section className="pb-10">
            <h2 className="font-[family-name:var(--font-fraunces)] text-xl font-semibold text-[#132019] mb-5">
              Établissements à découvrir
            </h2>
            <FeaturedSchoolsCarousel schools={featuredForCarousel} />
          </section>
        )}

        {/* ── LISTE DES ÉTABLISSEMENTS ──────────────────────────────── */}
        <section className="pb-16">
          <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
            <h2 className="font-[family-name:var(--font-fraunces)] text-xl font-semibold text-[#132019]">
              {activeSub === "all" ? "Tous les établissements" : activeSub}
              <span className="ml-2 text-sm font-medium text-[#5A695F]">
                ({loading ? "…" : filtered.length})
              </span>
            </h2>
            <div className="flex items-center gap-2 bg-white border border-[#E7E0D7] rounded-[11px] px-3.5 py-2.5 focus-within:border-[#12543F] transition-colors duration-base">
              <Search size={14} className="text-[#5A695F] shrink-0" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Rechercher…"
                className="bg-transparent outline-none text-sm w-40 placeholder-[#5A695F]/70 text-[#132019]"
              />
              {query && (
                <button onClick={() => setQuery("")} aria-label="Effacer la recherche">
                  <X size={13} className="text-[#5A695F]" />
                </button>
              )}
            </div>
          </div>

          {loading ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="h-64 bg-white border border-[#E7E0D7] rounded-[16px] animate-pulse" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="bg-white border border-[#E7E0D7] rounded-[16px] py-20 text-center">
              <School size={32} className="mx-auto text-[#E7E0D7] mb-4" />
              <p className="font-semibold text-[#5A695F] text-sm">Aucun établissement trouvé</p>
              {activeSub !== "all" && (
                <button onClick={() => setSubcat("all")} className="text-xs text-[#12543F] font-semibold mt-3 block mx-auto">
                  Voir tous les établissements →
                </button>
              )}
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {filtered.map((s, i) => {
                const tuition = s.fees?.[0]?.tuition_fee ?? 0;
                const isClaimed = s.is_claimed ?? true;
                const [tone1, tone2] = THUMBNAIL_TONES[i % THUMBNAIL_TONES.length];
                const href = isClaimed ? `/ecole/${s.id}` : `/auth/inscription?ecole=${s.id}`;
                const location = formatQuartierCity(s.neighborhood, s.city);
                return (
                  <Link
                    key={s.id}
                    href={href}
                    className="group bg-white border border-[#E7E0D7] rounded-[16px] overflow-hidden shadow-[0_8px_24px_-14px_rgba(11,59,46,0.2)] hover:shadow-[0_16px_34px_-14px_rgba(11,59,46,0.26)] hover:-translate-y-0.5 transition-all duration-base"
                  >
                    <div
                      className="relative h-40 overflow-hidden"
                      style={{ background: `linear-gradient(150deg, ${tone1}, ${tone2})` }}
                    >
                      <div className="absolute top-2.5 left-2.5 right-2.5 flex flex-col items-start gap-1.5">
                        {s.is_featured && (
                          <span className="bg-[#F2AE1F] text-[#0B3B2E] text-[10px] font-black px-2 py-1 rounded-full tracking-wide whitespace-nowrap">
                            À la une
                          </span>
                        )}
                        {s.is_verified && (
                          <span className="inline-flex items-center gap-1 whitespace-nowrap bg-white/90 backdrop-blur-sm text-[#0B3B2E] text-[9px] font-bold px-2 py-1 rounded-full">
                            <CheckCircle2 size={10} className="shrink-0" /> {TRUST_BADGE_LABELS.PLATFORM_VERIFIED}
                          </span>
                        )}
                        {!isClaimed && (
                          <span className="whitespace-nowrap bg-white/85 backdrop-blur-sm text-[#5A695F] text-[9px] font-bold px-2 py-1 rounded-full">
                            Non revendiquée
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="p-4">
                      <p className="font-bold text-[#132019] truncate">{s.name}</p>
                      {location && (
                        <p className="text-xs text-[#5A695F] mt-1 flex items-center gap-1">
                          <MapPin size={10} /> {location}
                        </p>
                      )}
                      {s.sub_category && (
                        <span className="inline-block mt-2 text-[10px] font-semibold text-[#5A695F] bg-[#F4F3EF] px-2 py-0.5 rounded-full">
                          {s.sub_category}
                        </span>
                      )}
                      <div className="flex items-center justify-between mt-3 pt-3 border-t border-[#F4F3EF]">
                        {tuition > 0 ? (
                          <p className="text-xs text-[#5A695F]">
                            <span className="font-bold text-[#132019]">{tuition.toLocaleString("fr-FR")}</span>
                            <span className="ml-1">FCFA/an</span>
                          </p>
                        ) : (
                          <p className="text-xs text-[#5A695F]">Frais non renseignés</p>
                        )}
                        <span className="text-xs font-semibold text-[#12543F] flex items-center gap-1 group-hover:gap-2 transition-all duration-base">
                          Voir <ArrowRight size={11} />
                        </span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      </div>

      <SiteFooter />
    </div>
  );
}

export default function CategoryPage() {
  return (
    <Suspense>
      <CategoryPageInner />
    </Suspense>
  );
}
