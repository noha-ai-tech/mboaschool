"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useSchool } from "@/lib/useSchool";
import { admissionStatusConfig } from "@/lib/admissions/status";
import { joinWithSeparator } from "@/lib/formatSchoolLocation";
import { TRUST_BADGE_LABELS } from "@/lib/trust/resolveEstablishmentTrustState";
import {
  ClipboardList,
  GraduationCap,
  CheckCircle,
  ArrowRight,
  School,
  Sparkles,
  Gauge,
  Bell,
  FileText,
  ImageIcon,
  CreditCard,
  Clock3,
  CalendarDays,
  AlertCircle,
} from "lucide-react";

const ANNEE_SCOLAIRE_COURANTE = "2026-2027";

const PAIE_STATUT_LABELS: Record<string, string> = {
  brouillon: "Brouillon",
  valide_rh: "Validé RH",
  valide_direction: "Validé Direction",
  paie_validee: "Paie validée",
};

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
  const [pro, setPro] = useState<{
    teacherCount: number;
    clockedInToday: number;
    scheduledClasses: number;
    paieCounts: Record<string, number>;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!school) return;
    loadData(school.id, school.forfait === "pro");
  }, [school]);

  async function loadData(schoolId: string, isPro: boolean) {
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

    // Widgets Écoles237 Pro — uniquement si le forfait est réellement actif,
    // lecture seule sur les mêmes tables que le module Pro existant.
    if (isPro) {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);

      const [{ data: teachers }, { count: clockedCount }, { count: scheduleCount }, { data: bulletins }] = await Promise.all([
        supabase.from("enseignants").select("id").eq("etablissement_id", schoolId),
        supabase
          .from("pointages")
          .select("enseignant_id", { count: "exact", head: true })
          .eq("etablissement_id", schoolId)
          .gte("horodatage", startOfDay.toISOString()),
        supabase
          .from("emplois_du_temps")
          .select("classe_id", { count: "exact", head: true })
          .eq("etablissement_id", schoolId)
          .eq("annee_scolaire", ANNEE_SCOLAIRE_COURANTE),
        supabase.from("bulletins_paie").select("statut").eq("etablissement_id", schoolId),
      ]);

      const paieCounts: Record<string, number> = {};
      (bulletins ?? []).forEach((b: any) => { paieCounts[b.statut] = (paieCounts[b.statut] ?? 0) + 1; });

      setPro({
        teacherCount: teachers?.length ?? 0,
        clockedInToday: clockedCount ?? 0,
        scheduledClasses: scheduleCount ?? 0,
        paieCounts,
      });
    }

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
  const incomplete = checklist.filter((c) => !c.done);
  const completionPct = checklist.length > 0
    ? Math.round((checklist.filter((c) => c.done).length / checklist.length) * 100)
    : 0;

  // "À traiter" — uniquement des éléments réellement actionnables, jamais
  // une alerte inventée pour remplir l'écran.
  const attentionItems = !loading ? [
    ...(pending > 0 ? [{
      label: `${pending} admission${pending !== 1 ? "s" : ""} en attente`,
      href: "/dashboard/ecole/admissions",
    }] : []),
    ...((pro?.paieCounts.brouillon ?? 0) > 0 ? [{
      label: `${pro!.paieCounts.brouillon} bulletin${pro!.paieCounts.brouillon !== 1 ? "s" : ""} de paie en brouillon`,
      href: "/pro/paie",
    }] : []),
    ...(incomplete.length > 0 ? [{
      label: `Fiche établissement incomplète (${completionPct}%)`,
      href: incomplete[0].href,
    }] : []),
  ] : [];

  if (schoolLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 bg-white rounded-card w-1/3" />
        <div className="grid grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <div key={i} className="h-24 bg-white rounded-card" />)}
        </div>
      </div>
    );
  }

  if (!school) {
    return (
      <div className="max-w-md mx-auto text-center py-20">
        <div className="w-14 h-14 rounded-2xl bg-white border border-border flex items-center justify-center mx-auto mb-5">
          <School size={24} className="text-text-secondary" />
        </div>
        <h2 className="text-xl font-bold mb-2">Aucun établissement lié</h2>
        <p className="text-text-secondary text-sm mb-6">
          Votre compte n&apos;est pas encore associé à un établissement. Contactez l&apos;administrateur de la plateforme.
        </p>
        <Link href="/" className="text-sm font-semibold text-primary hover:underline">
          Retour à l&apos;accueil
        </Link>
      </div>
    );
  }

  const isPro = school.forfait === "pro";

  return (
    <div className="max-w-6xl">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <h1 className="text-2xl font-bold tracking-tight text-text-primary">{school.name}</h1>
          {school.is_verified && (
            <span className="flex items-center gap-1 text-[10px] font-semibold text-primary bg-primary-light border border-primary/20 px-2 py-0.5 rounded-full">
              <CheckCircle size={9} /> {TRUST_BADGE_LABELS.PLATFORM_VERIFIED}
            </span>
          )}
          {isPro && (
            <span className="flex items-center gap-1 text-[10px] font-bold text-[#0A0A0A] bg-[#FCD116] px-2 py-0.5 rounded-full">
              <Sparkles size={9} /> Pro
            </span>
          )}
        </div>
        <p className="text-text-secondary text-sm">{joinWithSeparator(school.city, school.main_category)}</p>
      </div>

      {/* KPI — 4 maximum, données réelles uniquement */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KpiCard icon={ClipboardList} value={loading ? "—" : pending} label="Admissions en attente" />
        <KpiCard icon={Gauge} value={loading ? "—" : `${completionPct}%`} label="Profil complété" />
        <KpiCard icon={GraduationCap} value={loading ? "—" : classes.length} label="Classes" />
        <KpiCard icon={CheckCircle} value={loading ? "—" : accepted} label="Admissions acceptées" />
      </div>

      {/* À traiter */}
      <div className="bg-white border border-border rounded-card p-5 mb-6">
        <p className="font-bold text-sm text-text-primary mb-3">À traiter</p>
        {loading ? (
          <div className="h-10 bg-muted rounded-lg animate-pulse" />
        ) : attentionItems.length === 0 ? (
          <p className="text-sm text-text-secondary">Rien ne nécessite votre attention.</p>
        ) : (
          <div className="space-y-1.5">
            {attentionItems.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className="flex items-center justify-between px-3 py-2.5 rounded-lg text-sm text-text-primary hover:bg-muted transition-colors duration-base"
              >
                <span className="flex items-center gap-2.5">
                  <AlertCircle size={14} className="text-warning shrink-0" />
                  {item.label}
                </span>
                <ArrowRight size={13} className="text-text-secondary shrink-0" />
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="grid lg:grid-cols-2 gap-5 mb-6">
        {/* Admissions */}
        <div className="bg-white border border-border rounded-card overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <h2 className="font-bold text-sm">Admissions récentes</h2>
            <Link href="/dashboard/ecole/admissions" className="text-xs font-semibold text-primary hover:opacity-80 flex items-center gap-1">
              Voir tout <ArrowRight size={12} />
            </Link>
          </div>
          {loading ? (
            <div className="p-5 space-y-3">
              {[1, 2, 3].map((i) => <div key={i} className="h-10 bg-muted rounded-lg animate-pulse" />)}
            </div>
          ) : applications.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <ClipboardList size={24} className="mx-auto text-text-secondary/30 mb-3" />
              <p className="text-sm text-text-secondary">Aucune préinscription reçue</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {applications.slice(0, 5).map((app) => {
                const name = app.full_student_name || `${app.student_first_name ?? ""} ${app.student_last_name ?? ""}`.trim() || "—";
                const s = admissionStatusConfig(app.admission_status);
                return (
                  <div key={app.id} className="flex items-center justify-between px-5 py-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-sm text-text-primary truncate">{name}</p>
                      <p className="text-xs text-text-secondary mt-0.5">
                        {app.desired_level ?? "Niveau non précisé"} · {new Date(app.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
                      </p>
                    </div>
                    <span className={`ml-4 shrink-0 text-[10px] font-bold px-2.5 py-1 rounded-full border ${s.cls}`}>{s.label}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Personnel / Présences */}
        {isPro ? (
          <div className="bg-white border border-border rounded-card overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h2 className="font-bold text-sm">Personnel aujourd&apos;hui</h2>
              <Link href="/pro/pointage/historique" className="text-xs font-semibold text-primary hover:opacity-80 flex items-center gap-1">
                Voir tout <ArrowRight size={12} />
              </Link>
            </div>
            <div className="p-5 flex items-center gap-6">
              <div>
                <p className="text-2xl font-extrabold text-text-primary">{loading || !pro ? "—" : pro.clockedInToday}</p>
                <p className="text-xs text-text-secondary mt-0.5">Pointés aujourd&apos;hui</p>
              </div>
              <div className="h-8 w-px bg-border" />
              <div>
                <p className="text-2xl font-extrabold text-text-primary">{loading || !pro ? "—" : pro.teacherCount}</p>
                <p className="text-xs text-text-secondary mt-0.5">Enseignants au total</p>
              </div>
            </div>
          </div>
        ) : (
          <ProLockedCard
            icon={Clock3}
            title="Personnel & présences"
            description="Suivez le pointage de vos enseignants en temps réel."
          />
        )}
      </div>

      <div className="grid lg:grid-cols-2 gap-5 mb-6">
        {/* Emploi du temps */}
        {isPro ? (
          <div className="bg-white border border-border rounded-card overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h2 className="font-bold text-sm">Emploi du temps</h2>
              <Link href="/pro/emplois-du-temps" className="text-xs font-semibold text-primary hover:opacity-80 flex items-center gap-1">
                Voir tout <ArrowRight size={12} />
              </Link>
            </div>
            <div className="p-5">
              <p className="text-2xl font-extrabold text-text-primary">{loading || !pro ? "—" : pro.scheduledClasses}</p>
              <p className="text-xs text-text-secondary mt-0.5">Classes avec un emploi du temps publié ({ANNEE_SCOLAIRE_COURANTE})</p>
            </div>
          </div>
        ) : (
          <ProLockedCard
            icon={CalendarDays}
            title="Emplois du temps"
            description="Créez et publiez les emplois du temps de vos classes."
          />
        )}

        {/* Paie */}
        {isPro ? (
          <div className="bg-white border border-border rounded-card overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h2 className="font-bold text-sm">Paie</h2>
              <Link href="/pro/paie" className="text-xs font-semibold text-primary hover:opacity-80 flex items-center gap-1">
                Voir tout <ArrowRight size={12} />
              </Link>
            </div>
            <div className="p-5">
              {loading || !pro || Object.keys(pro.paieCounts).length === 0 ? (
                <p className="text-sm text-text-secondary">Aucun bulletin de paie généré.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {Object.entries(pro.paieCounts).map(([statut, count]) => (
                    <span key={statut} className="text-xs font-semibold bg-muted text-text-primary px-2.5 py-1 rounded-full">
                      {count} {PAIE_STATUT_LABELS[statut] ?? statut}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <ProLockedCard
            icon={CreditCard}
            title="Paie"
            description="Calculez et validez la paie de votre personnel."
          />
        )}
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        {/* Profil établissement */}
        {!loading && incomplete.length > 0 && (
          <div className="bg-white border border-border rounded-card p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="font-bold text-sm text-text-primary">Votre fiche est complétée à {completionPct}%</p>
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden mb-4">
              <div className="h-full bg-primary transition-all" style={{ width: `${completionPct}%` }} />
            </div>
            <div className="space-y-1">
              {incomplete.slice(0, 2).map((c) => (
                <Link
                  key={c.label}
                  href={c.href}
                  className="flex items-center justify-between px-3 py-2 rounded-lg text-sm text-text-secondary hover:bg-muted hover:text-text-primary transition-colors duration-base"
                >
                  {c.label}
                  <ArrowRight size={13} className="text-text-secondary" />
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Quick actions */}
        <div className="bg-white border border-border rounded-card p-4">
          <p className="text-[10px] font-semibold tracking-widest uppercase text-text-secondary px-2 mb-2">Accès rapide</p>
          <div className="space-y-0.5">
            {[
              { href: "/dashboard/ecole/annonces", label: "Publier une annonce", icon: Bell },
              { href: "/dashboard/ecole/galerie", label: "Ajouter des photos", icon: ImageIcon },
              { href: "/dashboard/ecole/admissions", label: "Voir les admissions", icon: ClipboardList },
              { href: "/dashboard/ecole/etablissement", label: "Publier ma fiche", icon: FileText },
            ].map((l) => {
              const Icon = l.icon;
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  className="flex items-center gap-3 px-2 py-2.5 rounded-lg text-sm text-text-secondary hover:text-text-primary hover:bg-muted transition-colors duration-base"
                >
                  <Icon size={15} className="text-text-secondary" />
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

function KpiCard({ icon: Icon, value, label }: { icon: React.ElementType; value: React.ReactNode; label: string }) {
  return (
    <div className="bg-white border border-border rounded-[18px] p-5 shadow-[0_1px_2px_rgba(10,15,13,0.04)]">
      <Icon size={16} className="text-primary mb-3" />
      <p className="text-2xl font-extrabold text-text-primary">{value}</p>
      <p className="text-xs text-text-secondary font-medium mt-1">{label}</p>
    </div>
  );
}

function ProLockedCard({ icon: Icon, title, description }: { icon: React.ElementType; title: string; description: string }) {
  return (
    <div className="bg-white border border-border rounded-card p-5 flex items-start justify-between gap-4">
      <div className="flex items-start gap-3">
        <Icon size={18} className="text-text-secondary/40 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-bold text-text-primary">{title}</p>
          <p className="text-xs text-text-secondary mt-0.5">{description}</p>
          <p className="text-xs text-text-secondary mt-1">
            Contactez-nous pour activer le <strong className="text-text-primary">forfait Pro</strong>.
          </p>
        </div>
      </div>
      <span className="shrink-0 text-[10px] font-bold tracking-wide uppercase bg-muted text-text-secondary px-2.5 py-1 rounded-full">
        Pro
      </span>
    </div>
  );
}
