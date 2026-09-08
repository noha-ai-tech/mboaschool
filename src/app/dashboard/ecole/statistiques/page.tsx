"use client";

import { useEffect, useState } from "react";
import { ClipboardList, CalendarDays, TrendingUp } from "lucide-react";
import { useSchool } from "@/lib/useSchool";
import { supabase } from "@/lib/supabase";
import { SchoolAdminPageHeader } from "@/components/school-admin/ui/PageHeader";
import { SchoolAdminStatCard } from "@/components/school-admin/ui/StatCard";
import { SchoolAdminSectionCard } from "@/components/school-admin/ui/Card";
import { SchoolAdminAlert, SchoolAdminEmptyState, SchoolAdminLoadingState } from "@/components/school-admin/ui/Feedback";

type ApplicationDate = { created_at: string };

export default function StatistiquesPage() {
  const { school, loading: schoolLoading } = useSchool();
  const [applications, setApplications] = useState<ApplicationDate[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (!school) { setLoading(false); return; } let current = true; setLoading(true); setError(null); supabase.from("applications").select("created_at").eq("establishment_id", school.id).order("created_at", { ascending: true }).then(({ data, error: loadError }) => { if (!current) return; if (loadError) setError("Impossible de charger les statistiques de préinscription."); else setApplications((data ?? []) as ApplicationDate[]); setLoading(false); }); return () => { current = false; }; }, [school]);
  if (schoolLoading) return <SchoolAdminLoadingState label="Chargement des statistiques" />; if (!school) return null;

  const now = new Date(); const day = 86_400_000;
  const last30Days = applications.filter(({ created_at }) => (now.getTime() - new Date(created_at).getTime()) / day <= 30).length;
  const previous30Days = applications.filter(({ created_at }) => { const age = (now.getTime() - new Date(created_at).getTime()) / day; return age > 30 && age <= 60; }).length;
  const trend = last30Days - previous30Days;
  const weeks = Array.from({ length: 8 }, (_, index) => { const weeksAgo = 7 - index; const start = new Date(now.getTime() - weeksAgo * 7 * day); const end = new Date(start.getTime() + 7 * day); return { label: start.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" }), count: applications.filter(({ created_at }) => { const date = new Date(created_at); return date >= start && date < end; }).length }; });
  const maxWeekCount = Math.max(1, ...weeks.map(({ count }) => count));

  return <div className="mx-auto max-w-5xl">
    <SchoolAdminPageHeader eyebrow="Pilotage" title="Statistiques des préinscriptions" description="Ces chiffres utilisent exclusivement les dates de création des préinscriptions de l’établissement actif." />
    {error ? <SchoolAdminAlert tone="danger">{error}</SchoolAdminAlert> : null}
    {loading ? <SchoolAdminLoadingState label="Chargement des préinscriptions" /> : <>
      <div className="grid gap-4 sm:grid-cols-3">
        <SchoolAdminStatCard label="Préinscriptions au total" value={applications.length} icon={<ClipboardList size={20} />} detail="Toutes les périodes disponibles" />
        <SchoolAdminStatCard label="30 derniers jours" value={last30Days} icon={<CalendarDays size={20} />} detail="Préinscriptions créées sur la période" />
        <SchoolAdminStatCard label="Évolution sur 30 jours" value={trend > 0 ? `+${trend}` : trend} icon={<TrendingUp size={20} />} detail={`Comparaison avec les 30 jours précédents (${previous30Days})`} tone={trend < 0 ? "warning" : trend === 0 ? "neutral" : "primary"} />
      </div>
      <div className="mt-5"><SchoolAdminSectionCard title="Préinscriptions par semaine" description="Répartition réelle sur les huit dernières semaines.">
        {applications.length === 0 ? <SchoolAdminEmptyState title="Aucune préinscription" description="Aucune date de création n’est disponible pour établir une tendance." /> : <div role="img" aria-label={`Graphique des préinscriptions par semaine. ${weeks.map(({ label, count }) => `${label} : ${count}`).join(", ")}`}>
          <div className="flex h-44 items-end gap-2 sm:gap-4" aria-hidden="true">{weeks.map(({ label, count }) => <div key={label} className="flex h-full min-w-0 flex-1 flex-col justify-end gap-2"><span className="text-center text-xs font-bold text-[var(--school-admin-text)]">{count}</span><div className="min-h-[2px] rounded-t-md bg-[var(--school-admin-primary)] motion-reduce:transition-none" style={{ height: `${(count / maxWeekCount) * 100}%` }} /><span className="truncate text-center text-[10px] text-[var(--school-admin-text-muted)]">{label}</span></div>)}</div>
          <ul className="sr-only">{weeks.map(({ label, count }) => <li key={label}>{label} : {count} préinscription{count > 1 ? "s" : ""}</li>)}</ul>
        </div>}
      </SchoolAdminSectionCard></div>
      <div className="mt-5"><SchoolAdminAlert tone="info" title="Périmètre des données">Aucune mesure de visites, de contacts, de pages vues, de conversion ou de popularité n’est disponible. Aucun chiffre de ce type n’est affiché.</SchoolAdminAlert></div>
    </>}
  </div>;
}
