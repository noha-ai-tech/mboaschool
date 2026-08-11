"use client";

// Vue d'ensemble — Centre National de Pilotage (Sprint K, V5).
// Uniquement des données réelles. Deux entités existantes dans le dépôt
// (public.applications = préinscriptions/admissions, public.profiles =
// utilisateurs) n'ont AUCUNE policy RLS platform_admin (confirmé dans
// 0012_admissions_v1.sql et 0014_rc1_security_fixes.sql : seules "Parents
// can read own applications" et "Users can read own profile" existent).
// Une lecture admin de ces tables retournerait donc un total tronqué,
// silencieusement faux. Cette page ne les interroge pas — "Utilisateurs"
// et "Admissions" restent hors de la Vue d'ensemble et du Registre tant
// qu'une migration RLS dédiée n'est pas validée par Eddy (hors périmètre
// Sprint K : "ne pas modifier RLS").
//
// Sources réelles utilisées ici : establishments, establishment_claims,
// subscriptions, support_tickets, platform_payments, platform_audit_log —
// toutes dotées d'une policy platform_admin confirmée (migrations 0007,
// 0008, 0013).

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  ShieldCheck, School, CheckCircle2, Crown, ClipboardCheck, CreditCard,
  LifeBuoy, AlertTriangle, Wallet, FileWarning, ArrowRight, TrendingUp,
  MapPin, Users2, BarChart3, History,
} from "lucide-react";

type Kpis = {
  schools: number;
  verifiedSchools: number;
  proSchools: number;
  pendingClaims: number;
  activeSubscriptions: number;
  openTickets: number;
};

type ActionItem = { label: string; count: number; href: string; icon: React.ElementType; tone: string };

export default function AdminDashboardPage() {
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [incompleteCount, setIncompleteCount] = useState(0);
  const [blockedPayments, setBlockedPayments] = useState(0);
  const [recentClaims, setRecentClaims] = useState<any[]>([]);
  const [recentTickets, setRecentTickets] = useState<any[]>([]);
  const [recentLogs, setRecentLogs] = useState<any[]>([]);
  const [subsByPlan, setSubsByPlan] = useState<Record<string, number>>({});
  const [regionTop, setRegionTop] = useState<{ region: string; count: number }[]>([]);
  const [months, setMonths] = useState<{ label: string; schools: number; subs: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);

    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
    sixMonthsAgo.setDate(1);

    const [
      schoolsRes, verifiedRes, proRes, claimsRes, subsActiveRes, ticketsOpenRes,
      incompleteRes, paymentsBlockedRes,
      claimsRecentRes, ticketsRecentRes, logsRes, subsAllRes, regionRes,
      schoolsTrendRes, subsTrendRes,
    ] = await Promise.all([
      supabase.from("establishments").select("id", { count: "exact", head: true }),
      supabase.from("establishments").select("id", { count: "exact", head: true }).eq("is_verified", true),
      supabase.from("establishments").select("id", { count: "exact", head: true }).eq("forfait", "pro"),
      supabase.from("establishment_claims").select("id", { count: "exact", head: true }).eq("status", "new"),
      supabase.from("subscriptions").select("id", { count: "exact", head: true }).eq("status", "active"),
      supabase.from("support_tickets").select("id", { count: "exact", head: true }).eq("status", "ouvert"),
      supabase.from("establishments").select("id", { count: "exact", head: true })
        .or("description.is.null,phone.is.null,cover_image_url.is.null"),
      supabase.from("platform_payments").select("id", { count: "exact", head: true }).eq("status", "failed"),
      supabase.from("establishment_claims")
        .select("id, status, first_name, last_name, created_at, establishments(name, city)")
        .order("created_at", { ascending: false }).limit(5),
      supabase.from("support_tickets")
        .select("id, subject, status, created_at, establishments(name)")
        .order("created_at", { ascending: false }).limit(5),
      supabase.from("platform_audit_log")
        .select("id, action, target_type, created_at, profiles(full_name)")
        .order("created_at", { ascending: false }).limit(5),
      supabase.from("subscriptions").select("plan"),
      supabase.from("establishments").select("region"),
      supabase.from("establishments").select("created_at").gte("created_at", sixMonthsAgo.toISOString()),
      supabase.from("subscriptions").select("created_at").gte("created_at", sixMonthsAgo.toISOString()),
    ]);

    setKpis({
      schools: schoolsRes.count ?? 0,
      verifiedSchools: verifiedRes.count ?? 0,
      proSchools: proRes.count ?? 0,
      pendingClaims: claimsRes.count ?? 0,
      activeSubscriptions: subsActiveRes.count ?? 0,
      openTickets: ticketsOpenRes.count ?? 0,
    });
    setIncompleteCount(incompleteRes.count ?? 0);
    setBlockedPayments(paymentsBlockedRes.count ?? 0);
    setRecentClaims(claimsRecentRes.data ?? []);
    setRecentTickets(ticketsRecentRes.data ?? []);
    setRecentLogs(logsRes.data ?? []);

    const planCounts: Record<string, number> = {};
    (subsAllRes.data ?? []).forEach((s: any) => { planCounts[s.plan] = (planCounts[s.plan] ?? 0) + 1; });
    setSubsByPlan(planCounts);

    const regionCounts = new Map<string, number>();
    (regionRes.data ?? []).forEach((s: any) => {
      const key = s.region || "Non précisée";
      regionCounts.set(key, (regionCounts.get(key) ?? 0) + 1);
    });
    setRegionTop(Array.from(regionCounts, ([region, count]) => ({ region, count })).sort((a, b) => b.count - a.count).slice(0, 4));

    const now = new Date();
    const buckets: { label: string; schools: number; subs: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      buckets.push({
        label: monthStart.toLocaleDateString("fr-FR", { month: "short" }),
        schools: (schoolsTrendRes.data ?? []).filter((s: any) => { const d = new Date(s.created_at); return d >= monthStart && d < monthEnd; }).length,
        subs: (subsTrendRes.data ?? []).filter((s: any) => { const d = new Date(s.created_at); return d >= monthStart && d < monthEnd; }).length,
      });
    }
    setMonths(buckets);

    setLoading(false);
  }

  const cards = kpis ? [
    { label: "Établissements", value: kpis.schools, icon: School },
    { label: "Établissements vérifiés", value: kpis.verifiedSchools, icon: CheckCircle2 },
    { label: "Écoles Pro", value: kpis.proSchools, icon: Crown },
    { label: "Revendications en attente", value: kpis.pendingClaims, icon: ClipboardCheck },
    { label: "Abonnements actifs", value: kpis.activeSubscriptions, icon: CreditCard },
    { label: "Tickets support ouverts", value: kpis.openTickets, icon: LifeBuoy },
  ] : [];

  const actions: ActionItem[] = kpis ? [
    { label: "Revendications à vérifier", count: kpis.pendingClaims, href: "/dashboard/admin/verifications", icon: ClipboardCheck, tone: "text-orange-600 bg-orange-50" },
    { label: "Tickets support ouverts", count: kpis.openTickets, href: "/dashboard/admin/support", icon: LifeBuoy, tone: "text-blue-600 bg-blue-50" },
    { label: "Paiements bloqués", count: blockedPayments, href: "/dashboard/admin/paiements", icon: Wallet, tone: "text-red-600 bg-red-50" },
    { label: "Établissements incomplets", count: incompleteCount, href: "/dashboard/admin/ecoles", icon: FileWarning, tone: "text-slate-600 bg-slate-100" },
  ] : [];

  const totalSubs = Object.values(subsByPlan).reduce((a, b) => a + b, 0);
  const maxSchools = Math.max(1, ...months.map((m) => m.schools));
  const maxSubs = Math.max(1, ...months.map((m) => m.subs));

  return (
    <div>
      <div className="flex items-center gap-3 mb-8">
        <ShieldCheck size={20} className="text-emerald-600" />
        <div>
          <p className="text-xs font-semibold tracking-widest uppercase text-slate-400">Centre national de pilotage</p>
          <h1 className="text-3xl font-black tracking-tight text-text-primary">Vue d&apos;ensemble</h1>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        {loading || !kpis ? (
          [...Array(6)].map((_, i) => <div key={i} className="h-24 bg-white border border-border rounded-xl animate-pulse" />)
        ) : (
          cards.map((c) => {
            const Icon = c.icon;
            return (
              <div key={c.label} className="bg-white border border-border rounded-xl p-5">
                <Icon size={16} className="text-emerald-600 mb-2" />
                <p className="text-3xl font-black text-text-primary">{c.value}</p>
                <p className="text-xs text-slate-400 font-semibold mt-1">{c.label}</p>
              </div>
            );
          })
        )}
      </div>

      <div className="grid lg:grid-cols-3 gap-6 mb-6">
        {/* Actions à traiter */}
        <div className="lg:col-span-1 bg-white border border-border rounded-2xl overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-4 border-b border-border">
            <AlertTriangle size={14} className="text-orange-500" />
            <p className="text-sm font-bold text-text-primary">Actions à traiter</p>
          </div>
          {loading ? (
            <div className="p-5 space-y-3">{[1, 2, 3, 4].map((i) => <div key={i} className="h-8 bg-slate-50 rounded animate-pulse" />)}</div>
          ) : (
            <div className="divide-y divide-slate-50">
              {actions.map((a) => {
                const Icon = a.icon;
                return (
                  <Link key={a.label} href={a.href} className="flex items-center gap-3 px-5 py-3.5 hover:bg-slate-50/50 transition-colors">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${a.tone}`}>
                      <Icon size={14} />
                    </div>
                    <p className="text-sm font-medium text-text-primary flex-1">{a.label}</p>
                    <span className="text-sm font-black text-text-primary">{a.count}</span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* Croissance */}
        <div className="lg:col-span-2 bg-white border border-border rounded-2xl p-6">
          <p className="text-xs font-bold tracking-widest uppercase text-slate-400 mb-5 flex items-center gap-1.5">
            <TrendingUp size={12} /> Évolution de la plateforme (6 derniers mois)
          </p>
          {loading ? (
            <div className="h-32 bg-slate-50 rounded animate-pulse" />
          ) : (
            <>
              <div className="flex items-end gap-4 h-32">
                {months.map((m) => (
                  <div key={m.label} className="flex-1 flex flex-col items-center gap-1.5">
                    <div className="w-full flex items-end gap-1 h-24">
                      <div className="flex-1 bg-emerald-100 rounded-t" style={{ height: `${(m.schools / maxSchools) * 100}%` }} title={`${m.schools} établissements`} />
                      <div className="flex-1 bg-blue-100 rounded-t" style={{ height: `${(m.subs / maxSubs) * 100}%` }} title={`${m.subs} abonnements`} />
                    </div>
                    <p className="text-[10px] text-slate-400 capitalize">{m.label}</p>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-4 mt-4 text-[11px] text-slate-500">
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 bg-emerald-100 rounded-sm" /> Établissements référencés</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 bg-blue-100 rounded-sm" /> Abonnements créés</span>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6 mb-6">
        {/* Revendications récentes */}
        <div className="bg-white border border-border rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <p className="text-sm font-bold text-text-primary">Revendications récentes</p>
            <Link href="/dashboard/admin/verifications" className="text-xs font-semibold text-emerald-700 hover:text-emerald-600">Voir tout</Link>
          </div>
          {loading ? (
            <div className="p-5 space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-8 bg-slate-50 rounded animate-pulse" />)}</div>
          ) : recentClaims.length === 0 ? (
            <div className="py-10 text-center"><p className="text-xs text-slate-400">Aucune revendication</p></div>
          ) : (
            <div className="divide-y divide-slate-50">
              {recentClaims.map((c) => (
                <div key={c.id} className="px-5 py-3">
                  <p className="text-sm font-semibold text-text-primary truncate">{c.establishments?.name ?? "—"}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{c.establishments?.city ?? "—"} · {c.first_name} {c.last_name}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Support récents */}
        <div className="bg-white border border-border rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <p className="text-sm font-bold text-text-primary">Tickets support récents</p>
            <Link href="/dashboard/admin/support" className="text-xs font-semibold text-emerald-700 hover:text-emerald-600">Voir tout</Link>
          </div>
          {loading ? (
            <div className="p-5 space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-8 bg-slate-50 rounded animate-pulse" />)}</div>
          ) : recentTickets.length === 0 ? (
            <div className="py-10 text-center"><p className="text-xs text-slate-400">Aucun ticket</p></div>
          ) : (
            <div className="divide-y divide-slate-50">
              {recentTickets.map((t) => (
                <div key={t.id} className="px-5 py-3">
                  <p className="text-sm font-semibold text-text-primary truncate">{t.subject}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{t.establishments?.name ?? "—"}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Abonnements par plan */}
        <div className="bg-white border border-border rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <p className="text-sm font-bold text-text-primary">Abonnements par plan</p>
            <Link href="/dashboard/admin/abonnements" className="text-xs font-semibold text-emerald-700 hover:text-emerald-600">Voir tout</Link>
          </div>
          {loading ? (
            <div className="p-5 space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-8 bg-slate-50 rounded animate-pulse" />)}</div>
          ) : totalSubs === 0 ? (
            <div className="py-10 text-center"><p className="text-xs text-slate-400">Aucun abonnement enregistré</p></div>
          ) : (
            <div className="p-5 space-y-2.5">
              {Object.entries(subsByPlan).sort((a, b) => b[1] - a[1]).map(([plan, count]) => (
                <div key={plan} className="flex items-center gap-3">
                  <p className="text-xs text-slate-500 w-20 truncate capitalize">{plan}</p>
                  <div className="flex-1 bg-slate-50 rounded-full h-2">
                    <div className="bg-emerald-500 h-2 rounded-full" style={{ width: `${(count / totalSubs) * 100}%` }} />
                  </div>
                  <p className="text-xs font-bold text-slate-600 w-6 text-right">{count}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6 mb-8">
        {/* Carte nationale (résumé) */}
        <div className="bg-white border border-border rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <p className="text-sm font-bold text-text-primary flex items-center gap-1.5"><MapPin size={13} /> Répartition régionale</p>
            <Link href="/dashboard/admin/carte" className="text-xs font-semibold text-emerald-700 hover:text-emerald-600">Voir la carte</Link>
          </div>
          {loading ? (
            <div className="p-5 space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-6 bg-slate-50 rounded animate-pulse" />)}</div>
          ) : regionTop.length === 0 ? (
            <div className="py-10 text-center"><p className="text-xs text-slate-400">Aucune donnée régionale</p></div>
          ) : (
            <div className="p-5 space-y-2.5">
              {regionTop.map((r) => (
                <div key={r.region} className="flex items-center gap-3">
                  <p className="text-xs text-slate-500 w-24 truncate">{r.region}</p>
                  <div className="flex-1 bg-slate-50 rounded-full h-2">
                    <div className="bg-emerald-500 h-2 rounded-full" style={{ width: `${kpis ? (r.count / kpis.schools) * 100 : 0}%` }} />
                  </div>
                  <p className="text-xs font-bold text-slate-600 w-6 text-right">{r.count}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Logs récents */}
        <div className="lg:col-span-2 bg-white border border-border rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <p className="text-sm font-bold text-text-primary flex items-center gap-1.5"><History size={13} /> Activité récente</p>
            <Link href="/dashboard/admin/audit" className="text-xs font-semibold text-emerald-700 hover:text-emerald-600">Voir les logs</Link>
          </div>
          {loading ? (
            <div className="p-5 space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-8 bg-slate-50 rounded animate-pulse" />)}</div>
          ) : recentLogs.length === 0 ? (
            <div className="py-10 text-center"><p className="text-xs text-slate-400">Aucune entrée — aucune action sensible enregistrée pour l&apos;instant</p></div>
          ) : (
            <div className="divide-y divide-slate-50">
              {recentLogs.map((l) => (
                <div key={l.id} className="flex items-center gap-4 px-5 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text-primary truncate">{l.action}</p>
                    <p className="text-xs text-slate-400">Par {l.profiles?.full_name ?? "—"}</p>
                  </div>
                  <span className="text-xs text-slate-400 shrink-0">
                    {new Date(l.created_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Actions rapides */}
      <div>
        <p className="text-xs font-bold tracking-widest uppercase text-slate-400 mb-3">Actions rapides</p>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { href: "/dashboard/admin/ecoles", label: "Établissements", icon: School },
            { href: "/dashboard/admin/verifications", label: "Revendications", icon: ClipboardCheck },
            { href: "/dashboard/admin/support", label: "Support", icon: LifeBuoy },
            { href: "/dashboard/admin/statistiques", label: "Rapports", icon: BarChart3 },
            { href: "/dashboard/admin/carte", label: "Carte nationale", icon: Users2 },
          ].map((a) => {
            const Icon = a.icon;
            return (
              <Link key={a.href} href={a.href} className="flex flex-col items-center gap-2 bg-white border border-border rounded-2xl p-4 hover:border-emerald-300 hover:bg-emerald-50/30 transition-colors text-center">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center">
                  <Icon size={16} className="text-emerald-600" />
                </div>
                <p className="text-xs font-semibold text-text-primary">{a.label}</p>
                <ArrowRight size={10} className="text-slate-300" />
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
