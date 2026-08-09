"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useSchool } from "@/lib/useSchool";
import { admissionStatusConfig, availableActions, type AdmissionStatus } from "@/lib/admissions/status";
import { dispatchAdmissionNotification, type AdmissionNotificationEvent } from "@/lib/notifications/admissionNotifications";
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

  if (schoolLoading) return <Skeleton />;

  return (
    <div className="max-w-6xl">
      <div className="mb-8">
        <p className="text-xs font-semibold tracking-widest uppercase text-slate-400 mb-1">Dashboard</p>
        <h1 className="text-3xl font-black tracking-tight text-[#0a0a0a]">Admissions</h1>
      </div>

      {/* Statistiques réelles */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <StatCard icon={ClipboardList} label="Demandes reçues" value={apps.length} color="text-slate-500" />
        <StatCard icon={Clock} label="Ce mois-ci" value={demandesCeMois} color="text-blue-500" />
        <StatCard icon={CheckCircle2} label="Acceptées" value={counts.accepted ?? 0} color="text-emerald-500" />
        <StatCard icon={Clock} label="En attente" value={enAttente} color="text-yellow-500" />
        <StatCard icon={TrendingUp} label="Taux d'acceptation" value={tauxAcceptation} color="text-purple-500" />
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="flex items-center gap-2 bg-white border border-[#ebebeb] rounded-xl px-4 py-2.5 flex-1 focus-within:border-[#aaa] transition-colors">
          <Search size={14} className="text-slate-400 shrink-0" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher par élève ou parent…"
            className="bg-transparent outline-none text-sm flex-1 placeholder-slate-400"
          />
          {query && (
            <button onClick={() => setQuery("")}>
              <X size={13} className="text-slate-400 hover:text-slate-700" />
            </button>
          )}
        </div>

        {levels.length > 0 && (
          <select
            value={levelFilter}
            onChange={(e) => setLevelFilter(e.target.value)}
            className="border border-[#ebebeb] rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-[#aaa]"
          >
            <option value="all">Tous les niveaux</option>
            {levels.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        )}
      </div>

      {/* Colonnes du pipeline */}
      <div className="flex gap-1.5 flex-wrap mb-5">
        <button
          onClick={() => setFilter("all")}
          className={`px-3 py-2 rounded-xl text-xs font-bold border transition-colors ${
            filter === "all" ? "bg-[#0a0a0a] text-white border-[#0a0a0a]" : "bg-white text-slate-500 border-[#e5e5e5] hover:border-[#aaa]"
          }`}
        >
          Toutes <span className="ml-1.5 opacity-60">{apps.length}</span>
        </button>
        {PIPELINE_COLUMNS.map((col) => (
          <button
            key={col.value}
            onClick={() => setFilter(col.value)}
            className={`px-3 py-2 rounded-xl text-xs font-bold border transition-colors ${
              filter === col.value ? "bg-[#0a0a0a] text-white border-[#0a0a0a]" : "bg-white text-slate-500 border-[#e5e5e5] hover:border-[#aaa]"
            }`}
          >
            {col.label} <span className="ml-1.5 opacity-60">{counts[col.value] ?? 0}</span>
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white border border-[#ebebeb] rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-[#ebebeb]">
          <p className="text-sm font-semibold">
            {loading ? "Chargement…" : (
              <><span className="text-emerald-600">{filtered.length}</span> dossier{filtered.length !== 1 ? "s" : ""}</>
            )}
          </p>
        </div>

        {loading ? (
          <div className="divide-y divide-[#f5f5f5]">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-4 px-6 py-4 animate-pulse">
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-slate-100 rounded w-1/3" />
                  <div className="h-3 bg-slate-50 rounded w-1/4" />
                </div>
                <div className="h-6 w-20 bg-slate-100 rounded-full" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <ClipboardList size={28} className="mx-auto text-slate-200 mb-3" />
            <p className="text-sm text-slate-400">Aucun dossier trouvé</p>
          </div>
        ) : (
          <div className="divide-y divide-[#f5f5f5]">
            {filtered.map((app) => {
              const name = app.full_student_name
                ?? `${app.student_first_name ?? ""} ${app.student_last_name ?? ""}`.trim()
                ?? "—";
              const s = admissionStatusConfig(app.admission_status);
              return (
                <div
                  key={app.id}
                  className="flex items-center gap-4 px-6 py-4 hover:bg-slate-50/50 transition-colors cursor-pointer"
                  onClick={() => openDetail(app)}
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-[#0a0a0a] truncate">{name}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {app.parent_name ?? "—"} · {app.parent_phone ?? "—"} · {app.desired_level ?? "Niveau non précisé"} ·{" "}
                      {new Date(app.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
                    </p>
                  </div>
                  <span className={`shrink-0 text-[10px] font-bold px-2.5 py-1 rounded-full border ${s.cls}`}>
                    {s.label}
                  </span>
                  <Eye size={14} className="text-slate-300 shrink-0" />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Detail drawer */}
      {selected && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="flex-1 bg-black/30" onClick={() => setSelected(null)} />
          <div className="w-full max-w-md bg-white h-full overflow-y-auto shadow-2xl flex flex-col">

            <div className="flex items-center justify-between px-6 py-5 border-b border-[#ebebeb] shrink-0">
              <h2 className="font-black text-lg text-[#0a0a0a]">Dossier</h2>
              <button onClick={() => setSelected(null)}>
                <X size={20} className="text-slate-400 hover:text-[#0a0a0a]" />
              </button>
            </div>

            <div className="flex-1 px-6 py-5 space-y-6 overflow-y-auto">

              {/* Actions (transitions de statut) */}
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Statut actuel</p>
                <span className={`text-xs font-bold px-3 py-1.5 rounded-lg border ${admissionStatusConfig(selected.admission_status).cls}`}>
                  {admissionStatusConfig(selected.admission_status).label}
                </span>

                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mt-4 mb-2">Actions</p>
                <div className="flex gap-2 flex-wrap">
                  {availableActions(selected.admission_status).map((action) => (
                    <button
                      key={action.to}
                      disabled={updating}
                      onClick={() => changeStatus(selected.id, action.to, selected)}
                      className="text-xs font-bold px-3 py-1.5 rounded-lg border bg-white text-slate-600 border-[#e5e5e5] hover:border-[#0a0a0a] hover:text-[#0a0a0a] transition-colors disabled:opacity-50"
                    >
                      {action.label}
                    </button>
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
                    <button onClick={() => copyCode(selected.tracking_code)} className="text-slate-400 hover:text-[#0a0a0a]">
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
                <textarea
                  value={parentMessage}
                  onChange={(e) => setParentMessage(e.target.value)}
                  rows={3}
                  placeholder="Message visible par le parent sur la page de suivi…"
                  className="w-full border border-emerald-200 bg-emerald-50/30 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-emerald-400 transition-colors resize-none"
                />
                <button
                  onClick={() => saveParentMessage(selected.id)}
                  disabled={updating}
                  className="mt-2 text-xs font-bold text-emerald-700 border border-emerald-200 bg-emerald-50 px-3 py-1.5 rounded-lg hover:bg-emerald-100 transition-colors disabled:opacity-50"
                >
                  {updating ? "Sauvegarde…" : "Sauvegarder le message"}
                </button>
              </Section>

              {/* Note interne (jamais visible du parent) */}
              <Section title="Note interne (jamais visible du parent)" icon={MessageSquare}>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  placeholder="Notes visibles uniquement par votre équipe…"
                  className="w-full border border-[#ddd] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#0a0a0a] transition-colors resize-none"
                />
                <button
                  onClick={() => saveNote(selected.id)}
                  disabled={updating}
                  className="mt-2 text-xs font-bold text-slate-700 border border-[#ddd] bg-white px-3 py-1.5 rounded-lg hover:border-[#aaa] transition-colors disabled:opacity-50"
                >
                  {updating ? "Sauvegarde…" : "Sauvegarder la note"}
                </button>
              </Section>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }: { icon: React.ElementType; label: string; value: number | string; color: string }) {
  return (
    <div className="bg-white border border-[#ebebeb] rounded-xl p-4">
      <Icon size={15} className={`${color} mb-2`} />
      <p className="text-2xl font-black text-[#0a0a0a]">{value}</p>
      <p className="text-xs text-slate-400 font-semibold mt-0.5">{label}</p>
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

function Skeleton() {
  return (
    <div className="max-w-6xl space-y-6 animate-pulse">
      <div className="space-y-2">
        <div className="h-3 w-20 bg-slate-200 rounded" />
        <div className="h-8 w-36 bg-slate-200 rounded" />
      </div>
      <div className="grid grid-cols-5 gap-4">
        {[1, 2, 3, 4, 5].map((i) => <div key={i} className="h-24 bg-white border border-[#ebebeb] rounded-xl" />)}
      </div>
      <div className="h-10 bg-white border border-[#ebebeb] rounded-xl" />
      <div className="bg-white border border-[#ebebeb] rounded-2xl">
        {[1, 2, 3, 4].map((i) => <div key={i} className="h-16 border-b border-[#f5f5f5] last:border-0" />)}
      </div>
    </div>
  );
}
