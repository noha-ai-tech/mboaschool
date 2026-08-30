// Écran d'entrée "School Setup Intelligence" (Sprint L, V1 — squelette UI
// sans dépendance DB). Les deux modes d'import (Excel, documents) ne sont pas
// branchés : ils dépendent de la migration 0015 (staging) qui n'est ni
// exécutée ni validée, et pour le mode intelligent, d'une intégration IA qui
// n'existe pas encore dans le projet. La configuration manuelle, elle, est
// réelle dès aujourd'hui — elle renvoie vers les pages déjà fonctionnelles
// (classes, matières, salles, enseignants).
//
// Copie volontairement sobre (règle Sprint L §4/§47) : pas de "IA" en avant,
// le produit vend le résultat ("vous n'avez pas à tout recommencer"), pas la
// technologie derrière.

import Link from "next/link";
import { redirect } from "next/navigation";
import { FileSpreadsheet, FileText, Settings2, ArrowRight, Clock } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireActiveEstablishment } from "@/lib/supabase/activeEstablishment";
import { withEstablishmentQuery } from "@/lib/school/establishmentContext";

const MODES = [
  {
    key: "intelligent",
    icon: FileText,
    title: "Importer mes anciens documents",
    description: "Emploi du temps, liste du personnel, contrats — PDF, Word ou scans.",
    href: null,
    status: "Bientôt disponible",
  },
  {
    key: "structured",
    icon: FileSpreadsheet,
    title: "Importer un fichier Excel",
    description: "Un tableau structuré (enseignants, classes, matières, créneaux…).",
    href: null,
    status: "Bientôt disponible",
  },
  {
    key: "manual",
    icon: Settings2,
    title: "Configurer manuellement",
    description: "Créer vos classes, matières, salles et enseignants un par un.",
    href: "/pro/matieres",
    status: null,
  },
] as const;

export default async function ConfigurerEtablissementPage({ searchParams }: { searchParams: Promise<{ school?: string }> }) {
  const { school } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/connexion");
  const establishment = await requireActiveEstablishment(
    supabase,
    user.id,
    school,
    "/pro/configurer-etablissement"
  );
  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      <p className="text-xs font-semibold tracking-widest uppercase text-emerald-700 mb-2">
        Configurer mon établissement
      </p>
      <h1 className="text-2xl lg:text-3xl font-black text-[#0a0a0a] mb-3">
        Comment souhaitez-vous commencer ?
      </h1>
      <p className="text-sm text-slate-500 max-w-xl mb-10">
        Vous n&apos;avez pas à tout recréer depuis zéro. Reprenez l&apos;organisation que vous
        avez déjà, et ajustez seulement ce qui a changé.
      </p>

      <div className="grid sm:grid-cols-3 gap-4">
        {MODES.map((mode) => {
          const Icon = mode.icon;
          const content = (
            <>
              <div className="w-11 h-11 rounded-xl bg-emerald-50 flex items-center justify-center mb-4">
                <Icon size={20} className="text-emerald-700" />
              </div>
              <h2 className="font-bold text-[#0a0a0a] mb-1.5">{mode.title}</h2>
              <p className="text-xs text-slate-500 leading-relaxed mb-4">{mode.description}</p>
              {mode.status ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400">
                  <Clock size={12} />
                  {mode.status}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                  Commencer
                  <ArrowRight size={12} />
                </span>
              )}
            </>
          );

          if (!mode.href) {
            return (
              <div key={mode.key} className="bg-white border border-[#ebebeb] rounded-2xl p-6 opacity-70 cursor-not-allowed">
                {content}
              </div>
            );
          }
          return (
            <Link
              key={mode.key}
              href={withEstablishmentQuery(mode.href, establishment.id)}
              className="bg-white border border-[#ebebeb] rounded-2xl p-6 hover:border-emerald-300 hover:shadow-sm transition-all"
            >
              {content}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
