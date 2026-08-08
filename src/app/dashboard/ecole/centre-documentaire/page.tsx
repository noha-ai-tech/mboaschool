"use client";

// Centre documentaire (Mission 03, Phase 7) — architecture uniquement pour
// les catégories qui n'ont pas encore de fonctionnalité dédiée (Brochures,
// Téléchargements). Documents administratifs et Photos affichent des
// compteurs réels et renvoient vers les pages existantes (inchangées) qui
// gèrent effectivement l'upload.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSchool } from "@/lib/useSchool";
import { supabase } from "@/lib/supabase";
import { FileText, ImageIcon, Image as LogoIcon, FolderDown, ArrowRight } from "lucide-react";

export default function CentreDocumentairePage() {
  const { school, loading: schoolLoading } = useSchool();
  const [docCount, setDocCount] = useState<number | null>(null);
  const [imageCount, setImageCount] = useState<number | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!school) return;
    supabase
      .from("school_documents")
      .select("id", { count: "exact", head: true })
      .eq("establishment_id", school.id)
      .then(({ count }) => setDocCount(count ?? 0));

    supabase
      .from("school_images")
      .select("id", { count: "exact", head: true })
      .eq("establishment_id", school.id)
      .then(({ count }) => setImageCount(count ?? 0));

    supabase
      .from("establishments")
      .select("logo_url")
      .eq("id", school.id)
      .single()
      .then(({ data }) => setLogoUrl(data?.logo_url ?? null));
  }, [school]);

  if (schoolLoading) {
    return <div className="max-w-3xl h-64 bg-white rounded-2xl animate-pulse" />;
  }
  if (!school) return null;

  return (
    <div className="max-w-3xl">
      <div className="mb-8">
        <p className="text-xs font-semibold tracking-widest uppercase text-slate-400 mb-1">Dashboard</p>
        <h1 className="text-3xl font-black tracking-tight text-[#0a0a0a]">Centre documentaire</h1>
        <p className="text-slate-500 text-sm mt-1">Tous les fichiers liés à votre établissement, au même endroit.</p>
      </div>

      <div className="grid sm:grid-cols-2 gap-4 mb-4">
        <Link
          href="/dashboard/ecole/documents"
          className="flex items-center justify-between bg-white border border-[#ebebeb] rounded-2xl p-5 hover:border-[#ccc] transition-colors"
        >
          <div className="flex items-center gap-3">
            <FileText size={18} className="text-slate-400" />
            <div>
              <p className="font-bold text-sm text-[#0a0a0a]">Documents administratifs</p>
              <p className="text-xs text-slate-400">{docCount === null ? "…" : `${docCount} document(s)`}</p>
            </div>
          </div>
          <ArrowRight size={14} className="text-slate-300" />
        </Link>

        <Link
          href="/dashboard/ecole/galerie"
          className="flex items-center justify-between bg-white border border-[#ebebeb] rounded-2xl p-5 hover:border-[#ccc] transition-colors"
        >
          <div className="flex items-center gap-3">
            <ImageIcon size={18} className="text-slate-400" />
            <div>
              <p className="font-bold text-sm text-[#0a0a0a]">Photos</p>
              <p className="text-xs text-slate-400">{imageCount === null ? "…" : `${imageCount} photo(s)`}</p>
            </div>
          </div>
          <ArrowRight size={14} className="text-slate-300" />
        </Link>
      </div>

      <div className="bg-white border border-[#ebebeb] rounded-2xl p-5 mb-4">
        <div className="flex items-center gap-3 mb-3">
          <LogoIcon size={18} className="text-slate-400" />
          <p className="font-bold text-sm text-[#0a0a0a]">Logo</p>
        </div>
        {logoUrl ? (
          <img src={logoUrl} alt="Logo de l'établissement" className="h-16 w-16 object-contain rounded-lg border border-slate-100" />
        ) : (
          <p className="text-xs text-slate-400">
            Aucun logo pour l&apos;instant. L&apos;ajout de logo n&apos;est pas encore disponible dans le formulaire —
            contactez le support pour en ajouter un manuellement en attendant.
          </p>
        )}
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="bg-white border border-dashed border-slate-200 rounded-2xl p-5">
          <div className="flex items-center gap-3 mb-1">
            <FolderDown size={18} className="text-slate-300" />
            <p className="font-bold text-sm text-slate-400">Brochures</p>
          </div>
          <p className="text-xs text-slate-400">Bientôt disponible.</p>
        </div>
        <div className="bg-white border border-dashed border-slate-200 rounded-2xl p-5">
          <div className="flex items-center gap-3 mb-1">
            <FolderDown size={18} className="text-slate-300" />
            <p className="font-bold text-sm text-slate-400">Téléchargements</p>
          </div>
          <p className="text-xs text-slate-400">Bientôt disponible.</p>
        </div>
      </div>
    </div>
  );
}
