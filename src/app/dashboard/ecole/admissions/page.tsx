"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useSchool } from "@/lib/useSchool";
import { admissionStatusConfig, availableActions, type AdmissionStatus } from "@/lib/admissions/status";
import { dispatchAdmissionNotification, type AdmissionNotificationEvent } from "@/lib/notifications/admissionNotifications";
import { SchoolAdminPageHeader } from "@/components/school-admin/ui/PageHeader";
import { SchoolAdminStatCard } from "@/components/school-admin/ui/StatCard";
import { SchoolAdminFilterBar } from "@/components/school-admin/ui/FilterBar";
import { SchoolAdminInput, SchoolAdminSelect, SchoolAdminTextarea } from "@/components/school-admin/ui/FormControls";
import { SchoolAdminStatusBadge } from "@/components/school-admin/ui/Badge";
import { SchoolAdminButton } from "@/components/school-admin/ui/Button";
import { SchoolAdminDrawer } from "@/components/school-admin/ui/Overlay";
import { SchoolAdminResponsiveTable } from "@/components/school-admin/ui/ResponsiveTable";
import { SchoolAdminEmptyState, SchoolAdminLoadingState, SchoolAdminSkeleton } from "@/components/school-admin/ui/Feedback";
import {
  ClipboardList,
  Search,
  X,
  CheckCircle2,
  Clock,
  TrendingUp,
  Eye,
  Phone,
  Mail,
  GraduationCap,
  MessageSquare,
  School,
  History,
  Copy,
  Check,
} from "lucide-react";

const PIPELINE_COLUMNS: { value: AdmissionStatus; label: string }[] = [
  { value: "submitted", label: "Nouvelles" },
  { value: "in_review", label: "En analyse" },
  { value: "documents_required", label: "Documents requis" },
  { value: "interview", label: "Entretien" },
  { value: "waitlisted", label: "Liste d'attente" },
  { value: "accepted", label: "Acceptées" },
  { value: "rejected", label: "Refusées" },
];

export default function AdmissionsPage() {
  const { school, loading: schoolLoading } = useSchool();
  const [apps, setApps] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [levelFilter, setLevelFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<any | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [updating, setUpdating] = useState(false);
  const [note, setNote] = useState("");
  const [parentMessage, setParentMessage] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!school) return;
    load();
  }, [school]);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("applications")
      .select("*")
      .eq("establishment_id", school!.id)
      .order("created_at", { ascending: false });
    if (data) setApps(data);
    setLoading(false);
  }

  async function openDetail(app: any) {
    setSelected(app);
    setNote(app.notes ?? "");
    setParentMessage(app.parent_message ?? "");
    setHistory([]);
    const { data } = await supabase
      .from("admissions_history")
      .select("*")
      .eq("application_id", app.id)
      .order("created_at", { ascending: false });
    if (data) setHistory(data);
  }

  const NOTIFICATION_EVENT_BY_STATUS: Partial<Record<AdmissionStatus, AdmissionNotificationEvent>> = {
    in_review: "admission_in_review",
    documents_required: "admission_documents_required",
    interview: "admission_interview",
    accepted: "admission_accepted",
    waitlisted: "admission_waitlisted",
    rejected: "admission_rejected",
  };

  async function changeStatus(id: string, admission_status: AdmissionStatus, app: any) {
    setUpdating(true);
    const { error } = await supabase.from("applications").update({ admission_status }).eq("id", id);
    setUpdating(false);
    if (!error) {
      setApps((prev) => prev.map((a) => (a.id === id ? { ...a, admission_status } : a)));
      if (selected?.id === id) {
        setSelected((prev: any) => ({ ...prev, admission_status }));
        openDetail({ ...selected, admission_status });
      }
      const event = NOTIFICATION_EVENT_BY_STATUS[admission_status];
      if (event) {
        dispatchAdmissionNotification({
          event,
          applicationId: id,
          establishmentName: school?.name ?? "établissement",
          studentName: app.full_student_name ?? `${app.student_first_name ?? ""} ${app.student_last_name ?? ""}`.trim(),
          parentPhone: app.parent_phone ?? "",
          parentMessage: app.parent_message ?? undefined,
        });
      }
    }
  }

  async function saveNote(id: string) {
    setUpdating(true);
    await supabase.from("applications").update({ notes: note }).eq("id", id);
    setUpdating(false);
    setApps((prev) => prev.map((a) => (a.id === id ? { ...a, notes: note } : a)));
  }

  async function saveParentMessage(id: string) {
    setUpdating(true);
    await supabase.from("applications").update({ parent_message: parentMessage }).eq("id", id);
    setUpdating(false);
    setApps((prev) => prev.map((a) => (a.id === id ? { ...a, parent_message: parentMessage } : a)));
  }

  async function copyCode(code: string) {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const levels = useMemo(
    () => Array.from(new Set(apps.map((a) => a.desired_level).filter(Boolean))).sort(),
    [apps]
  );

  const filtered = apps.filter((a) => {
    if (filter !== "all" && a.admission_status !== filter) return false;
    if (levelFilter !== "all" && a.desired_level !== levelFilter) return false;
    if (query) {
      const q = query.toLowerCase();
      const name = (a.full_student_name ?? `${a.student_first_name ?? ""} ${a.student_last_name ?? ""}`).toLowerCase();
      const parent = (a.parent_name ?? "").toLowerCase();
      if (!name.includes(q) && !parent.includes(q)) return false;
    }
    return true;
  });

  const counts = PIPELINE_COLUMNS.reduce((acc, col) => {
    acc[col.value] = apps.filter((a) => a.admission_status === col.value).length;
    return acc;
  }, {} as Record<string, number>);

  // Statistiques réelles (Phase 13) — jamais un chiffre inventé.
  const now = new Date();
  const demandesCeMois = apps.filter((a) => {
    const d = new Date(a.created_at);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;
  const enAttente = apps.filter((a) =>
    ["submitted", "in_review", "documents_required", "interview", "waitlisted"].includes(a.admission_status)
  ).length;
  const decidees = apps.filter((a) => a.admission_status === "accepted" || a.admission_status === "rejected").length;
  const tauxAcceptation = decidees > 0
    ? `${Math.round((apps.filter((a) => a.admission_status === "accepted").length / decidees) * 100)}%`
    : "—";

  if (schoolLoading) return <SchoolAdminLoadingState label="Chargement des admissions" />;

  return (
    <div className="mx-auto max-w-7xl">
      <SchoolAdminPageHeader
        eyebrow="Admissions"
        title="Suivi des candidatures"
        description="Recherchez un dossier, suivez son avancement et contactez les responsables depuis un espace unique."
        context={school ? <p className="text-sm font-medium text-[var(--school-admin-text-muted)]">Établissement : {school.name}</p> : undefined}
      />

      {/* Statistiques réelles */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <SchoolAdminStatCard icon={<ClipboardList size={19} />} label="Demandes reçues" value={apps.length} tone="neutral" />
        <SchoolAdminStatCard icon={<Clock size={19} />} label="Ce mois-ci" value={demandesCeMois} tone="neutral" />
        <SchoolAdminStatCard icon={<CheckCircle2 size={19} />} label="Acceptées" value={counts.accepted ?? 0} />
        <SchoolAdminStatCard icon={<Clock size={19} />} label="En attente" value={enAttente} tone="warning" />
        <SchoolAdminStatCard icon={<TrendingUp size={19} />} label="Taux d’acceptation" value={tauxAcceptation} detail={decidees === 0 ? "Aucune décision disponible" : "Calculé sur les dossiers décidés"} />
      </div>

      {/* Toolbar */}
      <SchoolAdminFilterBar className="mb-5">
        <div className="relative min-w-0 flex-1 sm:min-w-64">
          <SchoolAdminInput
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher par élève ou parent…"
            aria-label="Rechercher par élève ou parent"
            leadingIcon={<Search size={16} />}
            className={query ? "pr-11" : ""}
          />
          {query && (
            <button type="button" onClick={() => setQuery("")} aria-label="Effacer la recherche" className="absolute inset-y-0 right-1 flex w-10 items-center justify-center rounded-lg text-[var(--school-admin-text-muted)] hover:text-[var(--school-admin-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--school-admin-focus)]">
              <X size={15} aria-hidden="true" />
            </button>
          )}
        </div>

        {levels.length > 0 && (
          <SchoolAdminSelect
            value={levelFilter}
            onChange={(e) => setLevelFilter(e.target.value)}
            aria-label="Filtrer par niveau"
            className="sm:w-52"
          >
            <option value="all">Tous les niveaux</option>
            {levels.map((l) => <option key={l} value={l}>{l}</option>)}
          </SchoolAdminSelect>
        )}
      </SchoolAdminFilterBar>

      {/* Colonnes du pipeline */}
      <div className="flex gap-1.5 flex-wrap mb-5">
        <button
          onClick={() => setFilter("all")}
          aria-pressed={filter === "all"}
          className={`min-h-10 rounded-xl border px-3 py-2 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--school-admin-focus)] ${
            filter === "all" ? "border-[var(--school-admin-primary)] bg-[var(--school-admin-primary)] text-white" : "border-[var(--school-admin-border)] bg-[var(--school-admin-surface)] text-[var(--school-admin-text-muted)] hover:border-[var(--school-admin-primary)]"
          }`}
        >
          Toutes <span className="ml-1.5 opacity-60">{apps.length}</span>
        </button>
        {PIPELINE_COLUMNS.map((col) => (
          <button
            key={col.value}
            onClick={() => setFilter(col.value)}
            aria-pressed={filter === col.value}
            className={`min-h-10 rounded-xl border px-3 py-2 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--school-admin-focus)] ${
              filter === col.value ? "border-[var(--school-admin-primary)] bg-[var(--school-admin-primary)] text-white" : "border-[var(--school-admin-border)] bg-[var(--school-admin-surface)] text-[var(--school-admin-text-muted)] hover:border-[var(--school-admin-primary)]"
            }`}
          >
            {col.label} <span className="ml-1.5 opacity-60">{counts[col.value] ?? 0}</span>
          </button>
        ))}
      </div>

      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold text-[var(--school-admin-text)]" aria-live="polite">
          {loading ? "Chargement…" : <><span className="text-[var(--school-admin-primary)]">{filtered.length}</span> dossier{filtered.length !== 1 ? "s" : ""}</>}
        </p>
      </div>

      {loading ? (
        <div className="space-y-2" role="status" aria-label="Chargement des dossiers">
          {[1, 2, 3, 4].map((i) => <SchoolAdminSkeleton key={i} className="h-16" label={i === 1 ? "Chargement des dossiers" : ""} />)}
        </div>
      ) : filtered.length === 0 ? (
        <SchoolAdminEmptyState title="Aucun dossier trouvé" description="Modifiez la recherche ou les filtres pour afficher d’autres candidatures." icon={<ClipboardList size={24} />} />
      ) : (
        <>
          <SchoolAdminResponsiveTable label="Liste des dossiers d’admission" className="hidden md:block">
            <table className="w-full min-w-[760px] border-collapse text-left text-sm">
              <thead className="bg-[var(--school-admin-surface-muted)] text-xs uppercase tracking-wide text-[var(--school-admin-text-muted)]">
                <tr><th scope="col" className="px-5 py-3 font-semibold">Élève</th><th scope="col" className="px-5 py-3 font-semibold">Responsable</th><th scope="col" className="px-5 py-3 font-semibold">Niveau</th><th scope="col" className="px-5 py-3 font-semibold">Réception</th><th scope="col" className="px-5 py-3 font-semibold">Statut</th><th scope="col" className="px-5 py-3"><span className="sr-only">Actions</span></th></tr>
              </thead>
              <tbody className="divide-y divide-[var(--school-admin-border)]">
                {filtered.map((app) => {
                  const name = studentName(app);
                  const status = admissionStatusConfig(app.admission_status);
                  return <tr key={app.id} className="hover:bg-[var(--school-admin-surface-muted)]">
                    <th scope="row" className="px-5 py-4 font-semibold text-[var(--school-admin-text)]">{name}</th>
                    <td className="px-5 py-4 text-[var(--school-admin-text-muted)]">{app.parent_name ?? "—"}<span className="block text-xs">{app.parent_phone ?? "Téléphone indisponible"}</span></td>
                    <td className="px-5 py-4 text-[var(--school-admin-text-muted)]">{app.desired_level ?? "Non précisé"}</td>
                    <td className="px-5 py-4 text-[var(--school-admin-text-muted)]">{new Date(app.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}</td>
                    <td className="px-5 py-4"><SchoolAdminStatusBadge tone={statusTone(app.admission_status)} label={status.label} /></td>
                    <td className="px-5 py-4 text-right"><SchoolAdminButton variant="ghost" size="sm" onClick={() => openDetail(app)} leadingIcon={<Eye size={15} aria-hidden="true" />}>Ouvrir</SchoolAdminButton></td>
                  </tr>;
                })}
              </tbody>
            </table>
          </SchoolAdminResponsiveTable>

          <div className="space-y-3 md:hidden" aria-label="Liste des dossiers d’admission">
            {filtered.map((app) => {
              const name = studentName(app);
              const status = admissionStatusConfig(app.admission_status);
              return <button key={app.id} type="button" onClick={() => openDetail(app)} className="w-full rounded-[var(--school-admin-radius-card)] border border-[var(--school-admin-border)] bg-[var(--school-admin-surface)] p-4 text-left shadow-[var(--school-admin-shadow-sm)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--school-admin-focus)]">
                <span className="flex items-start justify-between gap-3"><span className="min-w-0"><span className="block truncate text-sm font-bold text-[var(--school-admin-text)]">{name}</span><span className="mt-1 block text-xs text-[var(--school-admin-text-muted)]">{app.parent_name ?? "Responsable non précisé"} · {app.desired_level ?? "Niveau non précisé"}</span></span><SchoolAdminStatusBadge tone={statusTone(app.admission_status)} label={status.label} /></span>
                <span className="mt-3 flex items-center justify-between border-t border-[var(--school-admin-border)] pt-3 text-xs text-[var(--school-admin-text-muted)]"><span>Reçu le {new Date(app.created_at).toLocaleDateString("fr-FR")}</span><span className="inline-flex items-center gap-1 font-semibold text-[var(--school-admin-primary)]">Voir le dossier <Eye size={14} aria-hidden="true" /></span></span>
              </button>;
            })}
          </div>
        </>
      )}

      {/* Detail drawer */}
      <SchoolAdminDrawer
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title="Dossier d’admission"
        description={selected ? studentName(selected) : undefined}
      >
        {selected && <div className="space-y-7">

              {/* Actions (transitions de statut) */}
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Statut actuel</p>
                <SchoolAdminStatusBadge tone={statusTone(selected.admission_status)} label={admissionStatusConfig(selected.admission_status).label} />

                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mt-4 mb-2">Actions</p>
                <div className="flex gap-2 flex-wrap">
                  {availableActions(selected.admission_status).map((action) => (
                    <SchoolAdminButton
                      key={action.to}
                      loading={updating}
                      variant="outline"
                      size="sm"
                      onClick={() => changeStatus(selected.id, action.to, selected)}
                    >
                      {action.label}
                    </SchoolAdminButton>
                  ))}
                  {availableActions(selected.admission_status).length === 0 && (
                    <p className="text-xs text-slate-400">Statut final — aucune action disponible.</p>
                  )}
                </div>
              </div>

              {/* Code de suivi */}
              {selected.tracking_code && (
                <Section title="Code de suivi" icon={ClipboardList}>
                  <div className="flex items-center gap-2">
                    <p className="font-mono font-bold text-sm tracking-wider">{selected.tracking_code}</p>
                    <button type="button" onClick={() => copyCode(selected.tracking_code)} aria-label={copied ? "Code copié" : "Copier le code de suivi"} className="flex h-10 w-10 items-center justify-center rounded-lg text-[var(--school-admin-text-muted)] hover:bg-[var(--school-admin-surface-muted)] hover:text-[var(--school-admin-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--school-admin-focus)]">
                      {copied ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
                    </button>
                  </div>
                </Section>
              )}

              {/* Enfant */}
              <Section title="Enfant" icon={GraduationCap}>
                <Row label="Nom complet" value={selected.full_student_name ?? `${selected.student_first_name ?? ""} ${selected.student_last_name ?? ""}`.trim()} />
                <Row label="Date de naissance" value={selected.student_birth_date ? new Date(selected.student_birth_date).toLocaleDateString("fr-FR") : (selected.student_age ? `${selected.student_age} ans` : "—")} />
                <Row label="Niveau souhaité" value={selected.desired_level ?? "—"} />
                <Row label="Ancienne école" value={selected.previous_school ?? "—"} />
              </Section>

              {/* Responsable */}
              <Section title="Responsable" icon={School}>
                <Row label="Nom" value={selected.parent_name ?? "—"} />
                {selected.parent_phone && (
                  <a href={`tel:${selected.parent_phone}`} className="flex items-center gap-2 py-2 text-sm text-emerald-700 font-semibold hover:underline">
                    <Phone size={13} /> {selected.parent_phone}
                  </a>
                )}
                {selected.parent_email && (
                  <a href={`mailto:${selected.parent_email}`} className="flex items-center gap-2 py-2 text-sm text-emerald-700 font-semibold hover:underline">
                    <Mail size={13} /> {selected.parent_email}
                  </a>
                )}
              </Section>

              {/* Demande */}
              <Section title="Demande" icon={ClipboardList}>
                <Row label="Date de réception" value={new Date(selected.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })} />
                {selected.message && (
                  <div className="pt-2">
                    <p className="text-xs text-slate-400 mb-1">Message du parent</p>
                    <p className="text-sm text-slate-600 leading-relaxed">{selected.message}</p>
                  </div>
                )}
              </Section>

              {/* Historique */}
              {history.length > 0 && (
                <Section title="Historique" icon={History}>
                  <div className="space-y-2">
                    {history.map((h) => (
                      <div key={h.id} className="flex items-center justify-between text-xs">
                        <span className="text-slate-500">
                          {h.from_status ? `${admissionStatusConfig(h.from_status).label} → ` : "Dossier reçu — "}
                          <span className="font-semibold text-slate-700">{admissionStatusConfig(h.to_status).label}</span>
                        </span>
                        <span className="text-slate-400">
                          {new Date(h.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
                        </span>
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              {/* Message au parent (public, visible sur /suivi-admission) */}
              <Section title="Message au parent (visible publiquement)" icon={MessageSquare}>
                <SchoolAdminTextarea
                  value={parentMessage}
                  onChange={(e) => setParentMessage(e.target.value)}
                  rows={3}
                  aria-label="Message visible par le parent"
                  placeholder="Message visible par le parent sur la page de suivi…"
                />
                <SchoolAdminButton
                  onClick={() => saveParentMessage(selected.id)}
                  loading={updating}
                  variant="secondary"
                  size="sm"
                  className="mt-2"
                >
                  Sauvegarder le message
                </SchoolAdminButton>
              </Section>

              {/* Note interne (jamais visible du parent) */}
              <Section title="Note interne (jamais visible du parent)" icon={MessageSquare}>
                <SchoolAdminTextarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  aria-label="Note interne"
                  placeholder="Notes visibles uniquement par votre équipe…"
                />
                <SchoolAdminButton
                  onClick={() => saveNote(selected.id)}
                  loading={updating}
                  variant="outline"
                  size="sm"
                  className="mt-2"
                >
                  Sauvegarder la note
                </SchoolAdminButton>
              </Section>
        </div>}
      </SchoolAdminDrawer>
    </div>
  );
}

function Section({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
        <Icon size={11} /> {title}
      </p>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-[#f5f5f5] last:border-0">
      <span className="text-xs text-slate-400">{label}</span>
      <span className="text-sm font-semibold text-[#0a0a0a] text-right max-w-[60%] truncate">{value || "—"}</span>
    </div>
  );
}

function statusTone(status: string): "success" | "warning" | "danger" | "info" | "neutral" {
  if (status === "accepted") return "success";
  if (status === "rejected") return "danger";
  if (["documents_required", "interview", "waitlisted"].includes(status)) return "warning";
  if (status === "in_review") return "info";
  return "neutral";
}

function studentName(app: any) {
  return app.full_student_name || `${app.student_first_name ?? ""} ${app.student_last_name ?? ""}`.trim() || "Élève";
}
