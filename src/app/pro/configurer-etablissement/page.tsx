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
import { SchoolAdminPageHeader } from "@/components/school-admin/ui/PageHeader";
import { SchoolAdminCard } from "@/components/school-admin/ui/Card";
import { SchoolAdminStatusBadge } from "@/components/school-admin/ui/Badge";

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
    <div className="max-w-4xl mx-auto px-4 py-8 sm:px-6 sm:py-12">
      <SchoolAdminPageHeader eyebrow="Configurer mon établissement" title="Comment souhaitez-vous commencer ?" description="Reprenez l’organisation existante de votre établissement et ajustez uniquement ce qui a changé." />

      <div className="grid sm:grid-cols-3 gap-4">
        {MODES.map((mode) => {
          const Icon = mode.icon;
          const content = (
            <>
              <div className="w-11 h-11 rounded-xl bg-[var(--school-admin-primary-soft)] flex items-center justify-center mb-4">
                <Icon size={20} className="text-[var(--school-admin-primary)]" aria-hidden="true" />
              </div>
              <h2 className="font-bold text-[#0a0a0a] mb-1.5">{mode.title}</h2>
              <p className="text-xs text-slate-500 leading-relaxed mb-4">{mode.description}</p>
              {mode.status ? (
                <SchoolAdminStatusBadge label={mode.status} tone="neutral" icon={<Clock size={12} />} />
              ) : (
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                  Commencer
                  <ArrowRight size={12} aria-hidden="true" />
                </span>
              )}
            </>
          );

          if (!mode.href) {
            return (
              <SchoolAdminCard key={mode.key} aria-disabled="true" className="cursor-not-allowed">{content}</SchoolAdminCard>
            );
          }
          return (
            <Link
              key={mode.key}
              href={withEstablishmentQuery(mode.href, establishment.id)}
              className="block rounded-[var(--school-admin-radius-card)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--school-admin-focus)]"
            >
              <SchoolAdminCard variant="interactive" className="h-full">{content}</SchoolAdminCard>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
