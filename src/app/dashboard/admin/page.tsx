"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  School,
  MapPin,
  Search,
  Plus,
  CheckCircle2,
  Crown,
  ArrowRight,
  LogOut,
  ShieldCheck,
  LayoutDashboard,
  ClipboardCheck,
} from "lucide-react";

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5">
      <div className="relative w-8 h-8 flex items-center justify-center shrink-0">
        <div className="absolute inset-0 flex">
          <span className="flex-1 bg-emerald-600 rounded-l-md" />
          <span className="flex-1 bg-red-500" />
          <span className="flex-1 bg-yellow-400 rounded-r-md" />
        </div>
        <School size={15} className="relative z-10 text-white" />
      </div>
      <span className="text-lg font-black tracking-tight text-white">
        Écoles<span className="text-emerald-400">237</span>
      </span>
    </Link>
  );
}

async function handleSignOut() {
  await supabase.auth.signOut();
  window.location.href = "/";
}

export default function AdminDashboardPage() {
  const [schools, setSchools] = useState<any[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("establishments")
      .select("id, name, city, main_category, is_verified, is_featured, subscription_plan, created_at")
      .order("created_at", { ascending: false });
    if (data) setSchools(data);
    setLoading(false);
  }

  const filtered = schools.filter((s) => {
    if (!query) return true;
    return `${s.name} ${s.city} ${s.main_category}`.toLowerCase().includes(query.toLowerCase());
  });

  const stats = [
    { label: "Établissements", value: schools.length },
    { label: "Premium", value: schools.filter((s) => s.subscription_plan === "premium").length },
    { label: "Vérifiés", value: schools.filter((s) => s.is_verified).length },
    { label: "Sponsorisés", value: schools.filter((s) => s.is_featured).length },
  ];

  return (
    <div className="min-h-screen bg-[#f9f7f2] flex">

      {/* Sidebar */}
      <aside className="hidden lg:flex flex-col w-[200px] shrink-0 bg-[#0a0f0d] fixed inset-y-0 left-0 z-40">
        <div className="px-5 py-5 border-b border-white/8">
          <Logo />
        </div>

        <div className="px-3 py-4 flex-1">
          <p className="text-[10px] font-semibold tracking-widest uppercase text-slate-500 px-3 mb-3">
            Administration
          </p>
          <Link
            href="/dashboard/admin"
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium bg-emerald-600/20 text-emerald-400"
          >
            <LayoutDashboard size={16} />
            Vue d'ensemble
          </Link>
          <Link
            href="/dashboard/admin/verifications"
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
          >
            <ClipboardCheck size={16} />
            Vérifications
          </Link>
        </div>

        <div className="px-3 py-4 border-t border-white/8">
          <button
            onClick={handleSignOut}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-400 hover:text-white hover:bg-white/5 transition-colors w-full"
          >
            <LogOut size={16} />
            Se déconnecter
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 lg:ml-[200px] p-6 lg:p-8">
        <div className="max-w-6xl">

          {/* Header */}
          <div className="flex items-center gap-3 mb-8">
            <ShieldCheck size={20} className="text-emerald-600" />
            <div>
              <p className="text-xs font-semibold tracking-widest uppercase text-slate-400">
                Plateforme
              </p>
              <h1 className="text-3xl font-black tracking-tight text-[#0a0a0a]">
                Administration globale
              </h1>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {stats.map((s) => (
              <div key={s.label} className="bg-white border border-[#ebebeb] rounded-xl p-5">
                <p className="text-3xl font-black text-[#0a0a0a]">{s.value}</p>
                <p className="text-xs text-slate-400 font-semibold mt-1">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Toolbar */}
          <div className="flex items-center gap-3 mb-6">
            <div className="flex-1 flex items-center gap-3 bg-white border border-[#ebebeb] rounded-xl px-4 py-2.5 focus-within:border-[#aaa] transition-colors">
              <Search size={15} className="text-slate-400 shrink-0" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Rechercher par nom, ville, catégorie…"
                className="bg-transparent outline-none text-sm flex-1 placeholder-slate-400"
              />
            </div>
            <button className="flex items-center gap-2 bg-[#0a0a0a] text-white px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-slate-800 transition-colors shrink-0">
              <Plus size={16} />
              Ajouter
            </button>
          </div>

          {/* Schools table */}
          <div className="bg-white border border-[#ebebeb] rounded-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-[#ebebeb]">
              <p className="text-sm font-semibold">
                {loading ? "Chargement…" : <><span className="text-emerald-600">{filtered.length}</span> établissement{filtered.length !== 1 ? "s" : ""}</>}
              </p>
            </div>

            {loading ? (
              <div className="divide-y divide-[#f5f5f5]">
                {[1,2,3,4,5].map(i => (
                  <div key={i} className="flex items-center gap-4 px-6 py-4 animate-pulse">
                    <div className="w-9 h-9 bg-slate-100 rounded-xl shrink-0" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 bg-slate-100 rounded w-1/3" />
                      <div className="h-3 bg-slate-50 rounded w-1/4" />
                    </div>
                    <div className="h-8 w-20 bg-slate-100 rounded-xl" />
                  </div>
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-16 text-center">
                <School size={28} className="mx-auto text-slate-200 mb-3" />
                <p className="text-sm text-slate-400">Aucun établissement trouvé</p>
              </div>
            ) : (
              <div className="divide-y divide-[#f5f5f5]">
                {filtered.map((school) => (
                  <div
                    key={school.id}
                    className="flex items-center gap-4 px-6 py-4 hover:bg-slate-50/50 transition-colors"
                  >
                    {/* Icon */}
                    <div className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
                      <School size={16} className="text-emerald-600" />
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-sm text-[#0a0a0a] truncate">{school.name}</p>
                        {school.is_verified && (
                          <CheckCircle2 size={13} className="text-emerald-500 shrink-0" />
                        )}
                        {school.subscription_plan === "premium" && (
                          <span className="flex items-center gap-1 text-[10px] font-bold text-yellow-700 bg-yellow-50 border border-yellow-200 px-1.5 py-0.5 rounded-full shrink-0">
                            <Crown size={8} /> Premium
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
                        <MapPin size={10} />
                        {school.city || "—"} · {school.main_category || "—"}
                      </p>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 shrink-0">
                      <Link
                        href={`/ecole/${school.id}`}
                        className="text-xs font-semibold text-slate-500 hover:text-[#0a0a0a] px-3 py-1.5 rounded-lg border border-[#e5e5e5] hover:border-[#aaa] transition-colors"
                      >
                        Page
                      </Link>
                      <Link
                        href={`/dashboard/admin/ecoles/${school.id}`}
                        className="flex items-center gap-1.5 text-xs font-semibold bg-[#0a0a0a] text-white px-3 py-1.5 rounded-lg hover:bg-slate-800 transition-colors"
                      >
                        Gérer <ArrowRight size={11} />
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
