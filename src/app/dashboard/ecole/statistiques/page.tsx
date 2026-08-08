"use client";

// Statistiques (Mission 03, Phase 5). Aucun système d'analyse de trafic
// (visiteurs, pages vues) n'existe dans ce dépôt — confirmé par l'audit
// précédent (aucun SDK de suivi dans les dépendances). Ces cartes affichent
// donc honnêtement "Non disponible" plutôt qu'un chiffre inventé. Seules les
// préinscriptions sont une donnée réelle (table `applications`).

import { useEffect, useState } from "react";
import { useSchool } from "@/lib/useSchool";
import { supabase } from "@/lib/supabase";
import { ClipboardList, Users, Eye, TrendingUp, MessageCircle } from "lucide-react";

export default function StatistiquesPage() {
  const { school, loading: schoolLoading } = useSchool();
  const [applications, setApplications] = useState<{ created_at: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!school) return;
    supabase
      .from("applications")
      .select("created_at")
      .eq("establishment_id", school.id)
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        setApplications(data ?? []);
        setLoading(false);
      });
  }, [school]);

  if (schoolLoading) return <div className="max-w-4xl h-64 bg-white rounded-2xl animate-pulse" />;
  if (!school) return null;

  const now = new Date();
  const last30Days = applications.filter(
    (a) => (now.getTime() - new Date(a.created_at).getTime()) / 86_400_000 <= 30
  ).length;

  // Regroupement par semaine sur les 8 dernières semaines — pour un aperçu
  // de tendance sans dépendance à une librairie de graphiques externe.
  const weeks: { label: string; count: number }[] = [];
  for (let i = 7; i >= 0; i--) {
    const weekStart = new Date(now.getTime() - i * 7 * 86_400_000);
    const weekEnd = new Date(weekStart.getTime() + 7 * 86_400_000);
    const count = applications.filter((a) => {
      const d = new Date(a.created_at);
      return d >= weekStart && d < weekEnd;
    }).length;
    weeks.push({ label: weekStart.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" }), count });
  }
  const maxWeekCount = Math.max(1, ...weeks.map((w) => w.count));

  return (
    <div className="max-w-4xl">
      <div className="mb-8">
        <p className="text-xs font-semibold tracking-widest uppercase text-slate-400 mb-1">Dashboard</p>
        <h1 className="text-3xl font-black tracking-tight text-[#0a0a0a]">Statistiques</h1>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        <StatCard icon={Eye} label="Visiteurs" value={null} note="Non disponible" />
        <StatCard icon={ClipboardList} label="Préinscriptions" value={applications.length} note="30 derniers jours" secondary={last30Days} />
        <StatCard icon={MessageCircle} label="Demandes de contact" value={applications.length} note="Total (préinscriptions)" />
        <StatCard icon={TrendingUp} label="Pages vues" value={null} note="Non disponible" />
        <StatCard icon={Users} label="Popularité" value={null} note="Non disponible" />
      </div>

      <div className="bg-white border border-[#ebebeb] rounded-2xl p-6">
        <p className="font-bold text-sm mb-1">Préinscriptions par semaine</p>
        <p className="text-xs text-slate-400 mb-5">8 dernières semaines — seule donnée mesurée aujourd&apos;hui.</p>
        {loading ? (
          <div className="h-32 bg-slate-50 rounded-lg animate-pulse" />
        ) : (
          <div className="flex items-end gap-3 h-32">
            {weeks.map((w) => (
              <div key={w.label} className="flex-1 flex flex-col items-center gap-2">
                <div
                  className="w-full bg-emerald-500 rounded-t-md min-h-[2px]"
                  style={{ height: `${(w.count / maxWeekCount) * 100}%` }}
                  title={`${w.count} préinscription(s)`}
                />
                <span className="text-[10px] text-slate-400">{w.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-4 bg-slate-50 border border-slate-200 rounded-2xl p-5">
        <p className="text-xs text-slate-500">
          <strong className="text-slate-700">Visiteurs, pages vues et popularité</strong> nécessitent un outil de
          suivi d&apos;audience (aucun n&apos;est connecté aujourd&apos;hui). L&apos;architecture de cette page est prête à les
          afficher dès qu&apos;une source de données sera branchée — aucun chiffre n&apos;est inventé en attendant.
        </p>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon, label, value, note, secondary,
}: {
  icon: React.ElementType; label: string; value: number | null; note: string; secondary?: number;
}) {
  return (
    <div className="bg-white border border-[#ebebeb] rounded-xl p-4">
      <Icon size={16} className="text-slate-400 mb-2" />
      <p className="text-2xl font-black text-[#0a0a0a]">
        {value === null ? <span className="text-slate-300 text-base font-semibold">—</span> : value}
      </p>
      <p className="text-[11px] text-slate-400 font-semibold mt-0.5">{label}</p>
      <p className="text-[10px] text-slate-300 mt-1">
        {note}
        {secondary !== undefined ? ` : ${secondary}` : ""}
      </p>
    </div>
  );
}
