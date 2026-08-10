"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useSchool } from "@/lib/useSchool";
import { admissionStatusConfig } from "@/lib/admissions/status";
import {
  ClipboardList,
  GraduationCap,
  CheckCircle,
  ArrowRight,
  School,
  Lock,
  Sparkles,
  Gauge,
  Bell,
  FileText,
  ImageIcon,
  CreditCard,
} from "lucide-react";

export default function DashboardEcoleHome() {
  const { school, loading: schoolLoading } = useSchool();
  const [applications, setApplications] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [profile, setProfile] = useState<{
    logo_url: string | null;
    description: string | null;
    fees: any | null;
    infra: any | null;
    imageCount: number;
    latestAnnouncement: string | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!school) return;
    loadData(school.id);
  }, [school]);

  async function loadData(schoolId: string) {
    setLoading(true);
    const [{ data: apps }, { data: cls }, estRes, feesRes, infraRes, imagesRes, annRes] = await Promise.all([
      supabase
        .from("applications")
        .select("id, student_first_name, student_last_name, full_student_name, parent_name, desired_level, admission_status, created_at")
        .eq("establishment_id", schoolId)
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("classes")
        .select("id, name, level, teacher_name")
        .eq("establishment_id", schoolId)
        .order("created_at", { ascending: false }),
      supabase.from("establishments").select("logo_url, description").eq("id", schoolId).single(),
      supabase.from("fees").select("tuition_fee, registration_fee").eq("establishment_id", schoolId).maybeSingle(),
      supabase.from("infrastructures").select("*").eq("establishment_id", schoolId).maybeSingle(),
      supabase.from("school_images").select("id", { count: "exact", head: true }).eq("establishment_id", schoolId),
      supabase
        .from("school_announcements")
        .select("created_at")
        .eq("establishment_id", schoolId)
        .order("created_at", { ascending: false })
        .limit(1),
    ]);
    if (apps) setApplications(apps);
    if (cls) setClasses(cls);
    setProfile({
      logo_url: estRes.data?.logo_url ?? null,
      description: estRes.data?.description ?? null,
      fees: feesRes.data ?? null,
      infra: infraRes.data ?? null,
      imageCount: imagesRes.count ?? 0,
      latestAnnouncement: annRes.data?.[0]?.created_at ?? null,
    });
    setLoading(false);
  }

  const pending = applications.filter((a) =>
    ["submitted", "in_review", "documents_required", "interview", "waitlisted"].includes(a.admission_status)
  ).length;
  const accepted = applications.filter((a) => a.admission_status === "accepted").length;

  // Checklist de complétion du profil (Mission 03, Phase 4) — chaque tâche
  // reflète une donnée réellement vérifiée, jamais un pourcentage inventé.
  const checklist = school && profile ? [
    { label: "Ajouter un logo", done: !!profile.logo_url, href: "/dashboard/ecole/centre-documentaire" },
    { label: "Ajouter des photos", done: profile.imageCount > 0, href: "/dashboard/ecole/galerie" },
    { label: "Renseigner les frais", done: !!(profile.fees?.tuition_fee || profile.fees?.registration_fee), href: "/dashboard/ecole/frais" },
    { label: "Compléter les infrastructures", done: !!profile.infra && Object.entries(profile.infra).some(([k, v]) => v === true && k !== "id"), href: "/dashboard/ecole/infrastructure" },
    { label: "Publier une annonce", done: !!profile.latestAnnouncement, href: "/dashboard/ecole/annonces" },
    { label: "Ajouter les contacts", done: !!(school.phone || school.email), href: "/dashboard/ecole/parametres" },
    { label: "Compléter la description", done: !!profile.description && profile.description.length > 20, href: "/dashboard/ecole/parametres" },
  ] : [];
  const completionPct = checklist.length > 0
    ? Math.round((checklist.filter((c) => c.done).length / checklist.length) * 100)
    : 0;

  if (schoolLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 bg-white rounded-xl w-1/3" />
        <div className="grid grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <div key={i} className="h-24 bg-white rounded-xl" />)}
        </div>
      </div>
    );
  }

  if (!school) {
    return (
      <div className="max-w-md mx-auto text-center py-20">
        <div className="w-14 h-14 rounded-2xl bg-white border border-[#ebebeb] flex items-center justify-center mx-auto mb-5">
          <School size={24} className="text-slate-400" />
        </div>
        <h2 className="text-xl font-bold mb-2">Aucun établissement lié</h2>
        <p className="text-slate-500 text-sm mb-6">
          Votre compte n'est pas encore associé à un établissement. Contactez l'administrateur de la plateforme.
        </p>
        <Link href="/" className="text-sm font-semibold text-emerald-700 hover:underline">
          Retour à l'accueil
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-5xl">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-2">
          <p className="text-xs font-semibold tracking-widest uppercase text-slate-400">Tableau de bord</p>
          {school.is_verified && (
            <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
              <CheckCircle size={9} /> Vérifié
            </span>
          )}
        </div>
        <h1 className="text-3xl font-black tracking-tight text-[#0a0a0a]">{school.name}</h1>
        <p className="text-slate-500 text-sm mt-1">{school.city} · {school.main_category}</p>
      </div>

      {/* KPI — 4 maximum, données réelles uniquement (Design Freeze V1, Section 8) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-white border border-border rounded-card p-5">
          <ClipboardList size={18} className="text-primary mb-3" />
          <p className="text-3xl font-extrabold text-text-primary">{loading ? "—" : pending}</p>
          <p className="text-xs text-text-secondary font-medium mt-1">Admissions en attente</p>
        </div>
        <div className="bg-white border border-border rounded-card p-5">
          <Gauge size={18} className="text-primary mb-3" />
          <p className="text-3xl font-extrabold text-text-primary">{loading ? "—" : `${completionPct}%`}</p>
          <p className="text-xs text-text-secondary font-medium mt-1">Profil complété</p>
        </div>
        <div className="bg-white border border-border rounded-card p-5">
          <GraduationCap size={18} className="text-primary mb-3" />
          <p className="text-3xl font-extrabold text-text-primary">{loading ? "—" : classes.length}</p>
          <p className="text-xs text-text-secondary font-medium mt-1">Classes</p>
        </div>
        <div className="bg-white border border-border rounded-card p-5">
          <CheckCircle size={18} className="text-primary mb-3" />
          <p className="text-3xl font-extrabold text-text-primary">{loading ? "—" : accepted}</p>
          <p className="text-xs text-text-secondary font-medium mt-1">Admissions acceptées</p>
        </div>
      </div>

      {/* Checklist de complétion */}
      {!loading && checklist.some((c) => !c.done) && (
        <div className="bg-white border border-[#ebebeb] rounded-2xl p-5 mb-8">
          <div className="flex items-center justify-between mb-4">
            <p className="font-bold text-sm">Complétez votre fiche</p>
            <span className="text-xs font-bold text-emerald-700">{completionPct}%</span>
          </div>
          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden mb-4">
            <div className="h-full bg-emerald-500 transition-all" style={{ width: `${completionPct}%` }} />
          </div>
          <div className="grid sm:grid-cols-2 gap-2">
            {checklist.filter((c) => !c.done).map((c) => (
              <Link
                key={c.label}
                href={c.href}
                className="flex items-center justify-between px-3 py-2 rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition-colors border border-slate-100"
              >
                {c.label}
                <ArrowRight size={13} className="text-slate-300" />
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Module Pro */}
      {school.forfait === "pro" ? (
        <Link
          href="/pro/emplois-du-temps"
          className="flex items-center justify-between mb-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-6 py-4 hover:bg-emerald-100 transition-colors"
        >
          <div className="flex items-center gap-3">
            <Sparkles size={18} className="text-emerald-600" />
            <div>
              <p className="text-sm font-bold text-emerald-900">Écoles237 Pro</p>
              <p className="text-xs text-emerald-700">Emplois du temps · Pointage · Messagerie interne</p>
            </div>
          </div>
          <ArrowRight size={16} className="text-emerald-600 shrink-0" />
        </Link>
      ) : (
        <div className="flex items-start justify-between mb-6 rounded-2xl border border-[#ebebeb] bg-white px-6 py-4">
          <div className="flex items-start gap-3">
            <Lock size={18} className="text-slate-300 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-bold text-[#0a0a0a]">Écoles237 Pro</p>
              <p className="text-xs text-slate-400 mt-0.5">
                Emplois du temps, pointage des enseignants et messagerie interne.
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Contactez-nous pour activer le <strong className="text-slate-600">forfait Pro</strong>.
              </p>
            </div>
          </div>
          <span className="shrink-0 text-[10px] font-bold tracking-wide uppercase bg-slate-100 text-slate-400 px-2.5 py-1 rounded-full ml-4">
            Pro
          </span>
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Recent applications */}
        <div className="lg:col-span-2 bg-white border border-[#ebebeb] rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#ebebeb]">
            <h2 className="font-bold text-sm">Dernières préinscriptions</h2>
            <Link href="/dashboard/ecole/admissions" className="text-xs font-semibold text-emerald-700 hover:text-emerald-600 flex items-center gap-1">
              Voir tout <ArrowRight size={12} />
            </Link>
          </div>

          {loading ? (
            <div className="p-6 space-y-3">
              {[1,2,3].map(i => <div key={i} className="h-12 bg-slate-50 rounded-lg animate-pulse" />)}
            </div>
          ) : applications.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <ClipboardList size={28} className="mx-auto text-slate-200 mb-3" />
              <p className="text-sm text-slate-400">Aucune préinscription reçue</p>
            </div>
          ) : (
            <div className="divide-y divide-[#f5f5f5]">
              {applications.slice(0, 6).map((app) => {
                const name = app.full_student_name || `${app.student_first_name ?? ""} ${app.student_last_name ?? ""}`.trim() || "—";
                const s = admissionStatusConfig(app.admission_status);
                return (
                  <div key={app.id} className="flex items-center justify-between px-6 py-3.5 hover:bg-slate-50/50 transition-colors">
                    <div className="min-w-0">
                      <p className="font-semibold text-sm text-[#0a0a0a] truncate">{name}</p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Parent : {app.parent_name ?? "—"} · {app.desired_level ?? "Niveau non précisé"}
                      </p>
                    </div>
                    <span className={`ml-4 shrink-0 text-[10px] font-bold px-2.5 py-1 rounded-full border ${s.cls}`}>
                      {s.label}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right column */}
        <div className="space-y-4">
          {/* Classes */}
          <div className="bg-white border border-[#ebebeb] rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#ebebeb]">
              <h2 className="font-bold text-sm">Classes</h2>
              <Link href="/dashboard/ecole/classes" className="text-xs font-semibold text-emerald-700 hover:text-emerald-600 flex items-center gap-1">
                Gérer <ArrowRight size={12} />
              </Link>
            </div>
            <div className="p-4">
              {loading ? (
                <div className="h-8 bg-slate-50 rounded-lg animate-pulse" />
              ) : classes.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-3">Aucune classe créée</p>
              ) : (
                <div className="space-y-2">
                  {classes.slice(0, 4).map((c) => (
                    <div key={c.id} className="flex items-center justify-between py-1.5">
                      <div>
                        <p className="text-sm font-semibold">{c.name}</p>
                        <p className="text-xs text-slate-400">{c.level}</p>
                      </div>
                      <GraduationCap size={14} className="text-slate-300" />
                    </div>
                  ))}
                  {classes.length > 4 && (
                    <p className="text-xs text-slate-400 pt-1">+{classes.length - 4} autres</p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Quick links */}
          <div className="bg-white border border-[#ebebeb] rounded-2xl p-4 space-y-1">
            <p className="text-[10px] font-semibold tracking-widest uppercase text-slate-400 px-2 mb-3">Accès rapide</p>
            {[
              { href: "/dashboard/ecole/annonces", label: "Publier une annonce", icon: Bell },
              { href: "/dashboard/ecole/documents", label: "Ajouter un document", icon: FileText },
              { href: "/dashboard/ecole/galerie", label: "Galerie photos", icon: ImageIcon },
              { href: "/dashboard/ecole/paiements", label: "Suivre les paiements", icon: CreditCard },
            ].map((l) => {
              const Icon = l.icon;
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  className="flex items-center gap-3 px-2 py-2.5 rounded-lg text-sm text-slate-600 hover:text-[#0a0a0a] hover:bg-slate-50 transition-colors"
                >
                  <Icon size={15} className="text-slate-400" />
                  {l.label}
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
