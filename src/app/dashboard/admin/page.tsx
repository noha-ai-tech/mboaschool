"use client";

// Vue d'ensemble du Platform Operating Center (Mission 08, Phase 3).
// Uniquement des cartes KPI calculées depuis des données réelles — aucun
// chiffre inventé. La gestion des établissements (recherche/filtres/tri/
// actions) est désormais sur /dashboard/admin/ecoles (Phase 4) ; cette page
// ne montre qu'un aperçu des dernières écoles référencées.

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  School, ShieldCheck, ClipboardCheck, ClipboardList, GraduationCap,
  Users, FileText, ArrowRight, MapPin, CheckCircle2, Crown,
} from "lucide-react";

type Kpis = {
  schools: number;
  verifiedSchools: number;
  proSchools: number;
  pendingClaims: number;
  admissions: number;
  teachers: number;
  users: number;
  preregistrations: number;
};

export default function AdminDashboardPage() {
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [recentSchools, setRecentSchools] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const [
      schoolsRes, verifiedRes, proRes, claimsRes,
      admissionsRes, teachersRes, usersRes, preregRes, recentRes,
    ] = await Promise.all([
      supabase.from("establishments").select("id", { count: "exact", head: true }),
      supabase.from("establishments").select("id", { count: "exact", head: true }).eq("is_verified", true),
      supabase.from("establishments").select("id", { count: "exact", head: true }).eq("forfait", "pro"),
      supabase.from("establishment_claims").select("id", { count: "exact", head: true }).eq("status", "new"),
      supabase.from("applications").select("id", { count: "exact", head: true }).eq("admission_status", "accepted"),
      supabase.from("enseignants").select("id", { count: "exact", head: true }),
      supabase.from("profiles").select("id", { count: "exact", head: true }),
      supabase.from("applications").select("id", { count: "exact", head: true }),
      supabase.from("establishments")
        .select("id, name, city, main_category, is_verified, forfait, created_at")
        .order("created_at", { ascending: false })
        .limit(6),
    ]);

    setKpis({
      schools: schoolsRes.count ?? 0,
      verifiedSchools: verifiedRes.count ?? 0,
      proSchools: proRes.count ?? 0,
      pendingClaims: claimsRes.count ?? 0,
      admissions: admissionsRes.count ?? 0,
      teachers: teachersRes.count ?? 0,
      users: usersRes.count ?? 0,
      preregistrations: preregRes.count ?? 0,
    });
    if (recentRes.data) setRecentSchools(recentRes.data);
    setLoading(false);
  }

  const cards = kpis ? [
    { label: "Écoles référencées", value: kpis.schools, icon: School },
    { label: "Écoles vérifiées", value: kpis.verifiedSchools, icon: CheckCircle2 },
    { label: "Écoles Pro", value: kpis.proSchools, icon: Crown },
    { label: "Demandes de vérification", value: kpis.pendingClaims, icon: ClipboardCheck },
    { label: "Admissions acceptées", value: kpis.admissions, icon: GraduationCap },
    { label: "Enseignants", value: kpis.teachers, icon: Users },
    { label: "Utilisateurs", value: kpis.users, icon: Users },
    { label: "Préinscriptions", value: kpis.preregistrations, icon: FileText },
  ] : [];

  return (
    <div>
      <div className="flex items-center gap-3 mb-8">
        <ShieldCheck size={20} className="text-emerald-600" />
        <div>
          <p className="text-xs font-semibold tracking-widest uppercase text-slate-400">Plateforme</p>
          <h1 className="text-3xl font-black tracking-tight text-[#0a0a0a]">Vue d&apos;ensemble</h1>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {loading || !kpis ? (
          [...Array(8)].map((_, i) => <div key={i} className="h-24 bg-white border border-[#ebebeb] rounded-xl animate-pulse" />)
        ) : (
          cards.map((c) => {
            const Icon = c.icon;
            return (
              <div key={c.label} className="bg-white border border-[#ebebeb] rounded-xl p-5">
                <Icon size={16} className="text-emerald-600 mb-2" />
                <p className="text-3xl font-black text-[#0a0a0a]">{c.value}</p>
                <p className="text-xs text-slate-400 font-semibold mt-1">{c.label}</p>
              </div>
            );
          })
        )}
      </div>

      <div className="bg-white border border-[#ebebeb] rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#ebebeb]">
          <p className="text-sm font-bold">Établissements récemment référencés</p>
          <Link href="/dashboard/admin/ecoles" className="text-xs font-semibold text-emerald-700 hover:text-emerald-600 flex items-center gap-1">
            Gérer les établissements <ArrowRight size={12} />
          </Link>
        </div>
        {loading ? (
          <div className="divide-y divide-[#f5f5f5]">
            {[1, 2, 3].map((i) => <div key={i} className="h-16 animate-pulse" />)}
          </div>
        ) : recentSchools.length === 0 ? (
          <div className="py-16 text-center">
            <School size={28} className="mx-auto text-slate-200 mb-3" />
            <p className="text-sm text-slate-400">Aucun établissement</p>
          </div>
        ) : (
          <div className="divide-y divide-[#f5f5f5]">
            {recentSchools.map((s) => (
              <Link
                key={s.id}
                href={`/dashboard/admin/ecoles/${s.id}`}
                className="flex items-center gap-4 px-6 py-4 hover:bg-slate-50/50 transition-colors"
              >
                <div className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
                  <School size={16} className="text-emerald-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-sm text-[#0a0a0a] truncate">{s.name}</p>
                    {s.is_verified && <CheckCircle2 size={13} className="text-emerald-500 shrink-0" />}
                    {s.forfait === "pro" && (
                      <span className="flex items-center gap-1 text-[10px] font-bold text-yellow-700 bg-yellow-50 border border-yellow-200 px-1.5 py-0.5 rounded-full shrink-0">
                        <Crown size={8} /> Pro
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
                    <MapPin size={10} /> {s.city || "—"} · {s.main_category || "—"}
                  </p>
                </div>
                <span className="text-xs text-slate-400 shrink-0">
                  {new Date(s.created_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
