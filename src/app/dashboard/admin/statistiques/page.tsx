"use client";

// Statistiques plateforme (Mission 08, Phase 10) — uniquement des données
// réelles, jamais un chiffre inventé. Distinct de la vue d'ensemble (Phase 3,
// KPI immédiats) : ici, tendances et répartitions.

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { BarChart3, TrendingUp, MapPin, Building2 } from "lucide-react";

export default function AdminStatistiquesPage() {
  const [loading, setLoading] = useState(true);
  const [schools, setSchools] = useState<any[]>([]);
  const [applications, setApplications] = useState<{ created_at: string }[]>([]);
  const [usersCount, setUsersCount] = useState(0);

  useEffect(() => {
    async function load() {
      const [schoolsRes, appsRes, usersRes] = await Promise.all([
        supabase.from("establishments").select("region, ownership_type, verification_status, created_at"),
        supabase.from("applications").select("created_at"),
        supabase.from("profiles").select("id", { count: "exact", head: true }),
      ]);
      if (schoolsRes.data) setSchools(schoolsRes.data);
      if (appsRes.data) setApplications(appsRes.data);
      setUsersCount(usersRes.count ?? 0);
      setLoading(false);
    }
    load();
  }, []);

  const now = new Date();
  const months: { label: string; schools: number; admissions: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    months.push({
      label: monthStart.toLocaleDateString("fr-FR", { month: "short" }),
      schools: schools.filter((s) => { const d = new Date(s.created_at); return d >= monthStart && d < monthEnd; }).length,
      admissions: applications.filter((a) => { const d = new Date(a.created_at); return d >= monthStart && d < monthEnd; }).length,
    });
  }
  const maxSchools = Math.max(1, ...months.map((m) => m.schools));
  const maxAdmissions = Math.max(1, ...months.map((m) => m.admissions));

  const activeSchools = schools.filter((s) => ["active", "verified"].includes(s.verification_status)).length;

  const byRegion = Array.from(
    schools.reduce((map, s) => {
      const key = s.region || "Non précisée";
      map.set(key, (map.get(key) ?? 0) + 1);
      return map;
    }, new Map<string, number>())
  ).sort((a, b) => b[1] - a[1]);

  const byOwnership = Array.from(
    schools.reduce((map, s) => {
      const key = s.ownership_type || "Non précisé";
      map.set(key, (map.get(key) ?? 0) + 1);
      return map;
    }, new Map<string, number>())
  ).sort((a, b) => b[1] - a[1]);

  if (loading) {
    return <div className="space-y-4">{[1, 2, 3].map((i) => <div key={i} className="h-32 bg-white border border-[#ebebeb] rounded-2xl animate-pulse" />)}</div>;
  }

  return (
    <div>
      <div className="mb-8 flex items-center gap-3">
        <BarChart3 size={20} className="text-emerald-600" />
        <div>
          <p className="text-xs font-semibold tracking-widest uppercase text-slate-400">Plateforme</p>
          <h1 className="text-3xl font-black tracking-tight text-[#0a0a0a]">Statistiques</h1>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Écoles au total" value={schools.length} />
        <StatCard label="Établissements actifs" value={activeSchools} />
        <StatCard label="Utilisateurs" value={usersCount} />
        <StatCard label="Admissions (total)" value={applications.length} />
      </div>

      {/* Croissance */}
      <div className="bg-white border border-[#ebebeb] rounded-2xl p-6 mb-6">
        <p className="text-xs font-bold tracking-widest uppercase text-slate-400 mb-5 flex items-center gap-1.5">
          <TrendingUp size={12} /> Croissance (6 derniers mois)
        </p>
        <div className="flex items-end gap-4 h-32">
          {months.map((m) => (
            <div key={m.label} className="flex-1 flex flex-col items-center gap-1.5">
              <div className="w-full flex items-end gap-1 h-24">
                <div className="flex-1 bg-emerald-100 rounded-t" style={{ height: `${(m.schools / maxSchools) * 100}%` }} title={`${m.schools} écoles`} />
                <div className="flex-1 bg-blue-100 rounded-t" style={{ height: `${(m.admissions / maxAdmissions) * 100}%` }} title={`${m.admissions} admissions`} />
              </div>
              <p className="text-[10px] text-slate-400 capitalize">{m.label}</p>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-4 mt-4 text-[11px] text-slate-500">
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 bg-emerald-100 rounded-sm" /> Écoles référencées</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 bg-blue-100 rounded-sm" /> Admissions</span>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-6">
        {/* Répartition par région */}
        <div className="bg-white border border-[#ebebeb] rounded-2xl p-6">
          <p className="text-xs font-bold tracking-widest uppercase text-slate-400 mb-4 flex items-center gap-1.5">
            <MapPin size={12} /> Répartition par région
          </p>
          {byRegion.length === 0 ? <p className="text-sm text-slate-400">Aucune donnée</p> : (
            <div className="space-y-2">
              {byRegion.map(([region, count]) => (
                <div key={region} className="flex items-center gap-3">
                  <p className="text-xs text-slate-500 w-28 truncate">{region}</p>
                  <div className="flex-1 bg-slate-50 rounded-full h-2">
                    <div className="bg-emerald-500 h-2 rounded-full" style={{ width: `${(count / schools.length) * 100}%` }} />
                  </div>
                  <p className="text-xs font-bold text-slate-600 w-6 text-right">{count}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Répartition public/privé */}
        <div className="bg-white border border-[#ebebeb] rounded-2xl p-6">
          <p className="text-xs font-bold tracking-widest uppercase text-slate-400 mb-4 flex items-center gap-1.5">
            <Building2 size={12} /> Répartition public / privé
          </p>
          {byOwnership.length === 0 ? <p className="text-sm text-slate-400">Aucune donnée</p> : (
            <div className="space-y-2">
              {byOwnership.map(([type, count]) => (
                <div key={type} className="flex items-center gap-3">
                  <p className="text-xs text-slate-500 w-28 truncate capitalize">{type}</p>
                  <div className="flex-1 bg-slate-50 rounded-full h-2">
                    <div className="bg-blue-500 h-2 rounded-full" style={{ width: `${(count / schools.length) * 100}%` }} />
                  </div>
                  <p className="text-xs font-bold text-slate-600 w-6 text-right">{count}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white border border-[#ebebeb] rounded-xl p-5">
      <p className="text-3xl font-black text-[#0a0a0a]">{value}</p>
      <p className="text-xs text-slate-400 font-semibold mt-1">{label}</p>
    </div>
  );
}
