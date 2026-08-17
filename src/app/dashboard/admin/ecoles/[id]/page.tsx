"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  ArrowLeft,
  School,
  Save,
  CheckCircle2,
  Crown,
  ExternalLink,
  ShieldCheck,
  ShieldOff,
  RotateCcw,
  Loader2,
  Users2,
  History,
  CreditCard,
} from "lucide-react";
import { joinWithSeparator } from "@/lib/formatSchoolLocation";

const CATEGORIES = ["garderie", "primaire", "secondaire", "superieur", "autres"];
const PLANS = ["free", "standard", "premium", "business"];

const VERIFICATION_LABELS: Record<string, { label: string; cls: string }> = {
  referenced:      { label: "Référencée",   cls: "text-slate-600 bg-slate-100 border-slate-200" },
  claim_requested: { label: "Revendication", cls: "text-blue-700 bg-blue-50 border-blue-200" },
  under_review:    { label: "En analyse",   cls: "text-orange-700 bg-orange-50 border-orange-200" },
  verified:        { label: "Vérifiée",     cls: "text-emerald-700 bg-emerald-50 border-emerald-200" },
  active:          { label: "Active",       cls: "text-emerald-700 bg-emerald-50 border-emerald-200" },
  suspended:       { label: "Suspendue",    cls: "text-red-700 bg-red-50 border-red-200" },
};

const CRM_STATUSES = ["prospect", "contacte", "demonstration", "essai", "client", "suspendu", "resilie"];
const CRM_LABELS: Record<string, string> = {
  prospect: "Prospect", contacte: "Contacté", demonstration: "Démonstration",
  essai: "Essai", client: "Client", suspendu: "Suspendu", resilie: "Résilié",
};

export default function AdminSchoolPage() {
  const params = useParams();
  const id = params.id as string;

  const [school, setSchool] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: "",
    city: "",
    main_category: "",
    description: "",
    phone: "",
    subscription_plan: "free",
    is_verified: false,
    is_featured: false,
  });

  const [stats, setStats] = useState({ classes: 0, teachers: 0, applications: 0 });
  const [auditLog, setAuditLog] = useState<any[]>([]);
  const [crm, setCrm] = useState<{ status: string; next_followup_date: string | null } | null>(null);
  const [crmNotes, setCrmNotes] = useState<any[]>([]);
  const [subscriptions, setSubscriptions] = useState<any[]>([]);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [newNote, setNewNote] = useState("");

  useEffect(() => {
    load();
    loadSidebarData();
  }, [id]);

  async function load() {
    const { data } = await supabase
      .from("establishments")
      .select("*")
      .eq("id", id)
      .single();

    if (data) {
      setSchool(data);
      setForm({
        name: data.name ?? "",
        city: data.city ?? "",
        main_category: data.main_category ?? "",
        description: data.description ?? "",
        phone: data.phone ?? "",
        subscription_plan: data.subscription_plan ?? "free",
        is_verified: data.is_verified ?? false,
        is_featured: data.is_featured ?? false,
      });
    }
    setLoading(false);
  }

  async function loadSidebarData() {
    const [classesRes, teachersRes, appsRes, auditRes, crmRes, notesRes, subsRes] = await Promise.all([
      supabase.from("classes").select("id", { count: "exact", head: true }).eq("establishment_id", id),
      supabase.from("enseignants").select("id", { count: "exact", head: true }).eq("establishment_id", id),
      supabase.from("applications").select("id", { count: "exact", head: true }).eq("establishment_id", id),
      supabase.from("platform_audit_log").select("*").eq("target_id", id).order("created_at", { ascending: false }).limit(10),
      supabase.from("establishment_crm").select("status, next_followup_date").eq("establishment_id", id).maybeSingle(),
      supabase.from("crm_notes").select("*").eq("establishment_id", id).order("created_at", { ascending: false }).limit(5),
      supabase.from("subscriptions").select("*").eq("establishment_id", id).order("created_at", { ascending: false }).limit(5),
    ]);
    setStats({
      classes: classesRes.count ?? 0,
      teachers: teachersRes.count ?? 0,
      applications: appsRes.count ?? 0,
    });
    if (auditRes.data) setAuditLog(auditRes.data);
    if (crmRes.data) setCrm(crmRes.data);
    if (notesRes.data) setCrmNotes(notesRes.data);
    if (subsRes.data) setSubscriptions(subsRes.data);
  }

  async function runAction(action: "verifier" | "suspendre" | "reactiver") {
    setActionBusy(action);
    setActionError(null);
    const res = await fetch(`/api/admin/ecoles/${id}/${action}`, { method: "POST" });
    const body = await res.json().catch(() => ({}));
    setActionBusy(null);
    if (!res.ok) {
      setActionError(body.error ?? "Échec de l'action");
      return;
    }
    await Promise.all([load(), loadSidebarData()]);
  }

  async function changePlan(plan: string) {
    setActionBusy("plan");
    setActionError(null);
    const res = await fetch(`/api/admin/ecoles/${id}/plan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan }),
    });
    const body = await res.json().catch(() => ({}));
    setActionBusy(null);
    if (!res.ok) {
      setActionError(body.error ?? "Échec du changement d'offre");
      return;
    }
    await Promise.all([load(), loadSidebarData()]);
  }

  async function changeCrmStatus(status: string) {
    setActionBusy("crm");
    await supabase.from("establishment_crm").upsert(
      { establishment_id: id, status, updated_at: new Date().toISOString() },
      { onConflict: "establishment_id" }
    );
    setActionBusy(null);
    await loadSidebarData();
  }

  async function addCrmNote() {
    if (!newNote.trim()) return;
    setActionBusy("note");
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("crm_notes").insert({ establishment_id: id, author_id: user?.id, comment: newNote.trim() });
    setNewNote("");
    setActionBusy(null);
    await loadSidebarData();
  }

  async function save(e: { preventDefault(): void }) {
    e.preventDefault();
    setSaving(true);
    setSaveError(null);
    const { error } = await supabase
      .from("establishments")
      .update(form)
      .eq("id", id);
    setSaving(false);
    if (!error) {
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      load();
    } else {
      setSaveError(error.message);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f9f7f2] p-8 animate-pulse">
        <div className="max-w-4xl space-y-4">
          <div className="h-5 w-24 bg-slate-200 rounded" />
          <div className="h-8 w-64 bg-slate-200 rounded" />
          <div className="h-96 bg-white border border-[#ebebeb] rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!school) {
    return (
      <div className="min-h-screen bg-[#f9f7f2] flex items-center justify-center">
        <div className="text-center">
          <p className="text-slate-400">Établissement introuvable.</p>
          <Link href="/dashboard/admin" className="text-sm text-emerald-700 font-semibold mt-2 block">
            ← Retour
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f9f7f2] p-6 lg:p-8">
      <div className="max-w-4xl">

        {/* Back */}
        <Link
          href="/dashboard/admin"
          className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-[#0a0a0a] transition-colors mb-6"
        >
          <ArrowLeft size={15} />
          Administration
        </Link>

        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <p className="text-xs font-semibold tracking-widest uppercase text-slate-400">
                Établissement
              </p>
              {school.is_verified && (
                <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                  <CheckCircle2 size={9} /> Vérifié
                </span>
              )}
              {school.subscription_plan === "premium" && (
                <span className="flex items-center gap-1 text-[10px] font-bold text-yellow-700 bg-yellow-50 border border-yellow-200 px-2 py-0.5 rounded-full">
                  <Crown size={9} /> Premium
                </span>
              )}
            </div>
            <h1 className="text-3xl font-black tracking-tight text-[#0a0a0a]">{school.name}</h1>
            <p className="text-slate-500 text-sm mt-1">{joinWithSeparator(school.city, school.main_category)}</p>
          </div>

          <Link
            href={`/ecole/${id}`}
            target="_blank"
            className="flex items-center gap-2 text-xs font-semibold text-slate-500 border border-[#ddd] px-3 py-2 rounded-xl hover:border-[#aaa] transition-colors shrink-0"
          >
            <ExternalLink size={13} />
            Page publique
          </Link>
        </div>

        <div className="grid lg:grid-cols-[1fr_260px] gap-6">

          {/* Form */}
          <form onSubmit={save} className="space-y-5">
            <div className="bg-white border border-[#ebebeb] rounded-2xl p-6">
              <h2 className="font-bold text-sm mb-5">Informations principales</h2>

              <div className="grid sm:grid-cols-2 gap-4">
                <FormField label="Nom de l'établissement">
                  <input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    required
                  />
                </FormField>

                <FormField label="Ville">
                  <input
                    value={form.city}
                    onChange={(e) => setForm({ ...form, city: e.target.value })}
                  />
                </FormField>

                <FormField label="Catégorie">
                  <select
                    value={form.main_category}
                    onChange={(e) => setForm({ ...form, main_category: e.target.value })}
                  >
                    <option value="">— Choisir —</option>
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                    ))}
                  </select>
                </FormField>

                <FormField label="Téléphone">
                  <input
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    placeholder="+237 6XX XXX XXX"
                  />
                </FormField>
              </div>

              <FormField label="Description" className="mt-4">
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={4}
                  placeholder="Présentation de l'établissement…"
                />
              </FormField>
            </div>

            <div className="bg-white border border-[#ebebeb] rounded-2xl p-6">
              <h2 className="font-bold text-sm mb-5">Plan & statut</h2>

              <FormField label="Plan d'abonnement">
                <select
                  value={form.subscription_plan}
                  onChange={(e) => setForm({ ...form, subscription_plan: e.target.value })}
                >
                  {PLANS.map((p) => (
                    <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                  ))}
                </select>
              </FormField>

              <div className="flex flex-col gap-3 mt-4">
                <Toggle
                  label="École vérifiée"
                  description="Affiche le badge de vérification sur la fiche publique"
                  checked={form.is_verified}
                  onChange={(v) => setForm({ ...form, is_verified: v })}
                />
                <Toggle
                  label="Mise en avant (sponsorisé)"
                  description="Affiche le badge Sponsorisé et remonte dans les résultats"
                  checked={form.is_featured}
                  onChange={(v) => setForm({ ...form, is_featured: v })}
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={saving}
                className="flex items-center gap-2 bg-[#0a0a0a] text-white px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-slate-800 transition-colors disabled:opacity-50"
              >
                {saving
                  ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  : <Save size={15} />}
                Enregistrer
              </button>

              {saved && (
                <span className="flex items-center gap-1.5 text-sm text-emerald-700 font-semibold">
                  <CheckCircle2 size={15} />
                  Modifications sauvegardées
                </span>
              )}

              {saveError && (
                <span className="text-sm text-red-600 font-semibold">
                  Échec de l&apos;enregistrement : {saveError}
                </span>
              )}
            </div>
          </form>

          {/* Sidebar */}
          <aside className="space-y-4">
            <div className="bg-white border border-[#ebebeb] rounded-2xl p-5">
              <p className="text-[10px] font-semibold tracking-widest uppercase text-slate-400 mb-4">
                Accès rapides
              </p>
              <div className="space-y-1">
                {[
                  { href: `/ecole/${id}`, label: "Page publique", icon: School },
                ].map((l) => {
                  const Icon = l.icon;
                  return (
                    <Link
                      key={l.label}
                      href={l.href}
                      className="flex items-center gap-3 px-2 py-2 rounded-lg text-sm text-slate-600 hover:text-[#0a0a0a] hover:bg-slate-50 transition-colors"
                    >
                      <Icon size={14} className="text-slate-400" />
                      {l.label}
                    </Link>
                  );
                })}
              </div>
            </div>

            <div className="bg-[#0a0f0d] text-white rounded-2xl p-5">
              <p className="text-[10px] font-semibold tracking-widest uppercase text-emerald-400 mb-2">
                Plan actuel
              </p>
              <p className="text-2xl font-black capitalize">{form.subscription_plan}</p>
              <p className="text-xs text-slate-400 mt-1">
                {form.subscription_plan === "free" ? "Fonctionnalités de base" :
                 form.subscription_plan === "premium" ? "Toutes les fonctionnalités" :
                 "Fonctionnalités avancées"}
              </p>
            </div>

            {/* Statut de vérification + actions (Phase 4) */}
            <div className="bg-white border border-[#ebebeb] rounded-2xl p-5">
              <p className="text-[10px] font-semibold tracking-widest uppercase text-slate-400 mb-3">
                Statut de vérification
              </p>
              {(() => {
                const st = VERIFICATION_LABELS[school.verification_status ?? "referenced"];
                return (
                  <span className={`inline-block text-xs font-bold px-3 py-1.5 rounded-full border mb-4 ${st.cls}`}>
                    {st.label}
                  </span>
                );
              })()}
              {actionError && <p className="text-xs text-red-600 font-semibold mb-3">{actionError}</p>}
              <div className="flex flex-col gap-2">
                {!["verified", "active", "suspended"].includes(school.verification_status) && (
                  <button
                    onClick={() => runAction("verifier")}
                    disabled={actionBusy !== null}
                    className="flex items-center justify-center gap-2 text-xs font-bold text-emerald-700 border border-emerald-200 bg-emerald-50 px-3 py-2 rounded-lg hover:bg-emerald-100 transition-colors disabled:opacity-50"
                  >
                    {actionBusy === "verifier" ? <Loader2 size={13} className="animate-spin" /> : <ShieldCheck size={13} />} Vérifier
                  </button>
                )}
                {school.verification_status === "suspended" ? (
                  <button
                    onClick={() => runAction("reactiver")}
                    disabled={actionBusy !== null}
                    className="flex items-center justify-center gap-2 text-xs font-bold text-emerald-700 border border-emerald-200 bg-emerald-50 px-3 py-2 rounded-lg hover:bg-emerald-100 transition-colors disabled:opacity-50"
                  >
                    {actionBusy === "reactiver" ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />} Réactiver
                  </button>
                ) : (
                  <button
                    onClick={() => { if (confirm("Suspendre cet établissement ?")) runAction("suspendre"); }}
                    disabled={actionBusy !== null}
                    className="flex items-center justify-center gap-2 text-xs font-bold text-red-600 border border-red-200 bg-white px-3 py-2 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
                  >
                    {actionBusy === "suspendre" ? <Loader2 size={13} className="animate-spin" /> : <ShieldOff size={13} />} Suspendre
                  </button>
                )}
              </div>
            </div>

            {/* Statistiques réelles */}
            <div className="bg-white border border-[#ebebeb] rounded-2xl p-5">
              <p className="text-[10px] font-semibold tracking-widest uppercase text-slate-400 mb-3">Statistiques</p>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-lg font-black text-[#0a0a0a]">{stats.classes}</p>
                  <p className="text-[10px] text-slate-400">Classes</p>
                </div>
                <div>
                  <p className="text-lg font-black text-[#0a0a0a]">{stats.teachers}</p>
                  <p className="text-[10px] text-slate-400">Enseignants</p>
                </div>
                <div>
                  <p className="text-lg font-black text-[#0a0a0a]">{stats.applications}</p>
                  <p className="text-[10px] text-slate-400">Admissions</p>
                </div>
              </div>
            </div>

            {/* CRM (Phase 5) */}
            <div className="bg-white border border-[#ebebeb] rounded-2xl p-5">
              <p className="text-[10px] font-semibold tracking-widest uppercase text-slate-400 mb-3 flex items-center gap-1.5">
                <Users2 size={11} /> CRM commercial
              </p>
              <select
                value={crm?.status ?? "prospect"}
                onChange={(e) => changeCrmStatus(e.target.value)}
                disabled={actionBusy !== null}
                className="w-full border border-[#ddd] rounded-xl px-3 py-2 text-sm bg-white mb-3"
              >
                {CRM_STATUSES.map((s) => <option key={s} value={s}>{CRM_LABELS[s]}</option>)}
              </select>
              <div className="space-y-2 mb-3 max-h-32 overflow-y-auto">
                {crmNotes.length === 0 ? (
                  <p className="text-xs text-slate-400">Aucun historique.</p>
                ) : crmNotes.map((n) => (
                  <p key={n.id} className="text-xs text-slate-500 border-b border-[#f5f5f5] pb-1.5 last:border-0">
                    {n.comment}
                    <span className="block text-[10px] text-slate-300">
                      {new Date(n.created_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}
                    </span>
                  </p>
                ))}
              </div>
              <div className="flex gap-1.5">
                <input
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder="Ajouter un commentaire…"
                  className="flex-1 border border-[#ddd] rounded-lg px-2.5 py-1.5 text-xs"
                />
                <button
                  onClick={addCrmNote}
                  disabled={actionBusy !== null}
                  className="text-xs font-bold text-white bg-[#0a0a0a] px-2.5 rounded-lg hover:bg-slate-800 disabled:opacity-50"
                >
                  +
                </button>
              </div>
            </div>

            {/* Abonnements (Phase 6) */}
            <div className="bg-white border border-[#ebebeb] rounded-2xl p-5">
              <p className="text-[10px] font-semibold tracking-widest uppercase text-slate-400 mb-3 flex items-center gap-1.5">
                <CreditCard size={11} /> Offre commerciale
              </p>
              <div className="flex gap-1.5 flex-wrap mb-3">
                {(["decouverte", "verifiee", "pro"] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => changePlan(p)}
                    disabled={actionBusy !== null}
                    className="text-xs font-semibold border border-[#ddd] px-2.5 py-1.5 rounded-lg hover:border-[#aaa] transition-colors disabled:opacity-50 capitalize"
                  >
                    {p}
                  </button>
                ))}
              </div>
              {subscriptions.length === 0 ? (
                <p className="text-xs text-slate-400">Aucun historique d&apos;abonnement.</p>
              ) : (
                <div className="space-y-1.5">
                  {subscriptions.map((s) => (
                    <div key={s.id} className="text-xs text-slate-500 flex justify-between">
                      <span className="capitalize font-semibold text-slate-600">{s.plan}</span>
                      <span>{new Date(s.started_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "2-digit" })}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Historique (audit log, Phase 9) */}
            <div className="bg-white border border-[#ebebeb] rounded-2xl p-5">
              <p className="text-[10px] font-semibold tracking-widest uppercase text-slate-400 mb-3 flex items-center gap-1.5">
                <History size={11} /> Historique
              </p>
              {auditLog.length === 0 ? (
                <p className="text-xs text-slate-400">Aucune action enregistrée.</p>
              ) : (
                <div className="space-y-2">
                  {auditLog.map((a) => (
                    <div key={a.id} className="text-xs text-slate-500 border-b border-[#f5f5f5] pb-1.5 last:border-0">
                      <span className="font-semibold text-slate-600">{a.action}</span>
                      <span className="block text-[10px] text-slate-300">
                        {new Date(a.created_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "2-digit" })}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

function FormField({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
        {label}
      </label>
      <div className="[&_input]:w-full [&_input]:border [&_input]:border-[#ddd] [&_input]:rounded-xl [&_input]:px-4 [&_input]:py-2.5 [&_input]:text-sm [&_input]:bg-white [&_input]:placeholder-slate-400 [&_input]:focus:outline-none [&_input]:focus:border-[#0a0a0a] [&_input]:transition-colors [&_select]:w-full [&_select]:border [&_select]:border-[#ddd] [&_select]:rounded-xl [&_select]:px-4 [&_select]:py-2.5 [&_select]:text-sm [&_select]:bg-white [&_select]:focus:outline-none [&_select]:focus:border-[#0a0a0a] [&_select]:transition-colors [&_textarea]:w-full [&_textarea]:border [&_textarea]:border-[#ddd] [&_textarea]:rounded-xl [&_textarea]:px-4 [&_textarea]:py-2.5 [&_textarea]:text-sm [&_textarea]:bg-white [&_textarea]:placeholder-slate-400 [&_textarea]:focus:outline-none [&_textarea]:focus:border-[#0a0a0a] [&_textarea]:transition-colors [&_textarea]:resize-none">
        {children}
      </div>
    </div>
  );
}

function Toggle({ label, description, checked, onChange }: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start gap-3 py-3 border-t border-[#f5f5f5] first:border-t-0">
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`mt-0.5 w-9 h-5 rounded-full relative transition-colors shrink-0 ${checked ? "bg-emerald-600" : "bg-slate-200"}`}
      >
        <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${checked ? "translate-x-4" : "translate-x-0.5"}`} />
      </button>
      <div>
        <p className="text-sm font-semibold text-[#0a0a0a]">{label}</p>
        <p className="text-xs text-slate-400 mt-0.5">{description}</p>
      </div>
    </div>
  );
}
