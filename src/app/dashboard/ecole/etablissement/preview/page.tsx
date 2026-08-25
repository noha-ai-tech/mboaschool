"use client";

// CMS-F.4 — Aperçu privé et authentifié du brouillon (school_page_drafts).
// Réutilise la MÊME logique de rendu que la fiche publique
// (buildSchoolPageSections, src/components/school/SchoolPageSections.tsx)
// — aucun second renderer indépendant, seule la SOURCE des données change
// (mission §1/§16). L'établissement prévisualisé est toujours celui résolu
// côté serveur par /api/school-page/preview (authorizeSchoolMutation() →
// getActiveEstablishment(), même moteur que le reste du CMS) : cette page
// n'envoie et ne lit aucun id d'établissement depuis l'URL — impossible de
// prévisualiser une autre école via un paramètre.
//
// Garde de génération de requête (loadRequestIdRef), même discipline que
// CMS-F.3 : une réponse tardive après un changement d'école active est
// ignorée plutôt que d'écraser l'aperçu déjà affiché.

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useSchool } from "@/lib/useSchool";
import { SchoolHeroCarousel } from "@/components/school/SchoolHeroCarousel";
import type { AdmissionsConfig } from "@/components/school/ParentTab";
import { resolveSectionConfig } from "@/lib/schoolPage/sections";
import { buildSchoolPageSections, type SchoolPageViewModel } from "@/components/school/SchoolPageSections";
import type { SchoolPageDraftPayload } from "@/lib/schoolPage/draftPayload";

type PreviewData = {
  establishment: {
    id: string;
    name: string;
    main_category: string | null;
    city: string | null;
    neighborhood: string | null;
    is_verified: boolean;
    subscription_plan: string | null;
    cover_image_url: string | null;
    latitude: number | null;
    longitude: number | null;
  };
  images: { id: string; url: string; caption: string | null }[];
  documents: any[];
  admissionsIsOpen: boolean;
  draft: SchoolPageDraftPayload;
};

export default function PreviewDraftPage() {
  const { school: activeSchool, user, loading: schoolLoading } = useSchool();
  const [data, setData] = useState<PreviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newsCount, setNewsCount] = useState<number | null>(null);
  const loadRequestIdRef = useRef(0);

  useEffect(() => {
    async function load() {
      const requestId = ++loadRequestIdRef.current;

      if (schoolLoading) return;
      if (!user || !activeSchool) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      setData(null);
      setNewsCount(null);

      try {
        const res = await fetch("/api/school-page/preview");
        const json = await res.json().catch(() => ({}));
        if (loadRequestIdRef.current !== requestId) return; // école déjà changée depuis
        if (!res.ok) throw new Error(json.error ?? `Erreur ${res.status}`);
        setData(json as PreviewData);
      } catch (e) {
        if (loadRequestIdRef.current !== requestId) return;
        setError(e instanceof Error ? e.message : "Échec du chargement de l'aperçu");
      } finally {
        if (loadRequestIdRef.current === requestId) setLoading(false);
      }
    }
    load();
  }, [activeSchool, user, schoolLoading]);

  if (schoolLoading || loading) {
    return (
      <div className="max-w-3xl space-y-4 animate-pulse">
        <div className="h-8 bg-white rounded-xl w-1/3" />
        <div className="h-64 bg-white border border-border rounded-card" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="max-w-md">
        <p className="font-bold text-lg mb-2">Connexion requise</p>
        <p className="text-sm text-text-secondary mb-4">Connectez-vous pour prévisualiser la page de votre établissement.</p>
        <Link href="/auth/connexion" className="inline-flex h-10 items-center px-4 rounded-card bg-primary text-white text-sm font-bold">
          Se connecter
        </Link>
      </div>
    );
  }

  if (!activeSchool) {
    return (
      <div className="max-w-md">
        <p className="font-bold text-lg mb-2">Aucun établissement lié à votre compte</p>
        <Link href="/dashboard/ecole/onboarding" className="inline-flex h-10 items-center px-4 rounded-card bg-primary text-white text-sm font-bold">
          Lier mon établissement
        </Link>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-md">
        <p className="font-bold text-lg mb-2 text-danger">Aperçu indisponible</p>
        <p className="text-sm text-text-secondary mb-4">{error ?? "Erreur inconnue"}</p>
        <Link href="/dashboard/ecole/etablissement" className="inline-flex h-10 items-center px-4 rounded-card bg-primary text-white text-sm font-bold">
          ← Retour à l&apos;éditeur
        </Link>
      </div>
    );
  }

  const { establishment, images, documents, admissionsIsOpen, draft } = data;

  // CMS-F.4 §11 — is_open vient LIVE, tout le reste du modèle Admissions
  // vient du brouillon. is_open n'est jamais lu depuis draft.admissions
  // (qui ne le contient d'ailleurs jamais — validé côté serveur).
  const admissionsConfig: AdmissionsConfig = {
    is_open: admissionsIsOpen,
    levels: draft.admissions.levels,
    conditions: draft.admissions.conditions,
    required_documents: draft.admissions.required_documents,
    period_start: draft.admissions.period_start,
    period_end: draft.admissions.period_end,
    additional_info: draft.admissions.additional_info,
  };

  // CMS-F.6 — `images` est désormais la Galerie EFFECTIVE déjà calculée
  // côté serveur par /api/school-page/preview (live moins gallery.
  // remove_ids, plus draft_pending_add) : cette page ne fait que
  // transmettre la liste reçue, aucun calcul dupliqué ici. Le Hero dérive
  // de la même liste via SchoolPageSections — aucun traitement séparé
  // nécessaire.
  const viewModel: SchoolPageViewModel = {
    id: establishment.id,
    name: establishment.name,
    main_category: establishment.main_category,
    city: draft.contact.city,
    neighborhood: establishment.neighborhood,
    is_verified: establishment.is_verified,
    subscription_plan: establishment.subscription_plan,
    cover_image_url: establishment.cover_image_url,
    hero_mode: draft.hero_mode,
    description: draft.presentation.description,
    phone: draft.contact.phone,
    email: draft.contact.email,
    website: draft.contact.website,
    address: draft.contact.address,
    latitude: establishment.latitude,
    longitude: establishment.longitude,
  };

  const sectionConfig = resolveSectionConfig(draft.sections);

  const { visibleSections, sectionNav, heroSlides } = buildSchoolPageSections({
    school: viewModel,
    fees: { ...draft.pricing, currency: "FCFA" },
    infra: draft.infrastructure,
    images,
    docsList: documents,
    admissionsConfig,
    sectionConfig,
    newsCount,
    onNewsCountChange: setNewsCount,
  });

  return (
    <div className="-m-6 lg:-m-8 min-h-screen bg-[#ECECEA]">
      {/* Bandeau privé — §18 : jamais confondre avec la page publique réelle */}
      <div className="sticky top-0 z-40 bg-[#0A0A0A] text-white">
        <div className="max-w-[1520px] mx-auto px-[18px] h-14 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-xs font-bold tracking-widest uppercase text-primary-light">Aperçu du brouillon</span>
            <span className="text-white/50 text-xs hidden sm:inline truncate">Cette version n&apos;est pas encore publique.</span>
          </div>
          <Link
            href="/dashboard/ecole/etablissement"
            className="flex items-center gap-1.5 text-xs font-semibold text-white/80 hover:text-white transition-colors duration-fast shrink-0"
          >
            <ArrowLeft size={13} />
            Retour à l&apos;éditeur
          </Link>
        </div>
      </div>

      <SchoolHeroCarousel
        slides={heroSlides}
        name={viewModel.name}
        city={viewModel.city}
        neighborhood={viewModel.neighborhood}
        category={viewModel.main_category}
        verified={!!viewModel.is_verified}
        premium={viewModel.subscription_plan === "premium"}
        preinscriptionHref="#"
        backHref="/dashboard/ecole/etablissement"
        backLabel="Retour à l'éditeur"
      />

      {sectionNav.length > 0 && (
        <div className="border-b border-border bg-white sticky top-14 z-30 overflow-x-auto">
          <div className="max-w-[1520px] mx-auto px-[18px]">
            <div className="flex gap-0 whitespace-nowrap">
              {sectionNav.map((item) => (
                <button
                  key={item.id}
                  onClick={() => document.getElementById(item.id)?.scrollIntoView({ behavior: "smooth", block: "start" })}
                  className="px-5 py-3.5 text-sm font-semibold border-b-2 border-transparent text-text-secondary hover:text-text-primary hover:border-border transition-colors duration-fast shrink-0"
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="max-w-[1520px] mx-auto px-[18px] py-8 pb-16 space-y-5">
        {visibleSections.map((c) => (
          <div key={c.key}>{c.node}</div>
        ))}
        {visibleSections.length === 0 && (
          <p className="text-center text-sm text-text-secondary py-16">Toutes les sections sont masquées dans le brouillon.</p>
        )}
      </div>
    </div>
  );
}
