"use client";

// Support (Mission 08, Phase 8) — gestion des tickets ouverts par les
// établissements. RLS platform_admin réelle (migration 0013, table
// support_tickets/support_ticket_messages) : pas de contournement admin
// client nécessaire ici.

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { LifeBuoy, X, Send } from "lucide-react";

const STATUSES: { value: string; label: string; cls: string }[] = [
  { value: "ouvert",     label: "Ouvert",     cls: "text-blue-700 bg-blue-50 border-blue-200" },
  { value: "en_cours",   label: "En cours",   cls: "text-orange-700 bg-orange-50 border-orange-200" },
  { value: "en_attente", label: "En attente", cls: "text-purple-700 bg-purple-50 border-purple-200" },
  { value: "resolu",     label: "Résolu",     cls: "text-emerald-700 bg-emerald-50 border-emerald-200" },
  { value: "ferme",      label: "Fermé",      cls: "text-slate-500 bg-slate-100 border-slate-200" },
];

function statusConfig(s: string) {
  return STATUSES.find((x) => x.value === s) ?? STATUSES[0];
}

export default function AdminSupportPage() {
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState<any | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("support_tickets")
      .select("*, establishments(name, city)")
      .order("updated_at", { ascending: false });
    if (data) setTickets(data);
    setLoading(false);
  }

  async function openTicket(t: any) {
    setSelected(t);
    const { data } = await supabase
      .from("support_ticket_messages")
      .select("*")
      .eq("ticket_id", t.id)
      .order("created_at", { ascending: true });
    setMessages(data ?? []);
  }

  async function changeStatus(id: string, status: string) {
    setBusy(true);
    await supabase.from("support_tickets").update({ status, updated_at: new Date().toISOString() }).eq("id", id);
    setBusy(false);
    setTickets((prev) => prev.map((t) => (t.id === id ? { ...t, status } : t)));
    if (selected?.id === id) setSelected((prev: any) => ({ ...prev, status }));
  }

  async function sendReply() {
    if (!reply.trim() || !selected) return;
    setBusy(true);
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("support_ticket_messages").insert({ ticket_id: selected.id, author_id: user?.id, body: reply.trim() });
    await supabase.from("support_tickets").update({ updated_at: new Date().toISOString() }).eq("id", selected.id);
    setReply("");
    setBusy(false);
    openTicket(selected);
  }

  const filtered = filter === "all" ? tickets : tickets.filter((t) => t.status === filter);
  const counts = STATUSES.reduce((acc, s) => {
    acc[s.value] = tickets.filter((t) => t.status === s.value).length;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div>
      <div className="mb-8 flex items-center gap-3">
        <LifeBuoy size={20} className="text-emerald-600" />
        <div>
          <p className="text-xs font-semibold tracking-widest uppercase text-slate-400">Plateforme</p>
          <h1 className="text-3xl font-black tracking-tight text-[#0a0a0a]">Support</h1>
        </div>
      </div>

      <div className="flex gap-1.5 flex-wrap mb-5">
        <button onClick={() => setFilter("all")} className={`px-3 py-2 rounded-xl text-xs font-bold border ${filter === "all" ? "bg-[#0a0a0a] text-white border-[#0a0a0a]" : "bg-white text-slate-500 border-[#e5e5e5]"}`}>
          Tous <span className="ml-1.5 opacity-60">{tickets.length}</span>
        </button>
        {STATUSES.map((s) => (
          <button key={s.value} onClick={() => setFilter(s.value)} className={`px-3 py-2 rounded-xl text-xs font-bold border ${filter === s.value ? "bg-[#0a0a0a] text-white border-[#0a0a0a]" : "bg-white text-slate-500 border-[#e5e5e5]"}`}>
            {s.label} <span className="ml-1.5 opacity-60">{counts[s.value] ?? 0}</span>
          </button>
        ))}
      </div>

      <div className="bg-white border border-[#ebebeb] rounded-2xl overflow-hidden">
        {loading ? (
          <div className="divide-y divide-[#f5f5f5]">{[1, 2, 3].map((i) => <div key={i} className="h-16 animate-pulse" />)}</div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center"><LifeBuoy size={28} className="mx-auto text-slate-200 mb-3" /><p className="text-sm text-slate-400">Aucun ticket</p></div>
        ) : (
          <div className="divide-y divide-[#f5f5f5]">
            {filtered.map((t) => {
              const s = statusConfig(t.status);
              return (
                <div key={t.id} onClick={() => openTicket(t)} className="flex items-center gap-4 px-6 py-4 hover:bg-slate-50/50 transition-colors cursor-pointer">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-[#0a0a0a] truncate">{t.subject}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{t.establishments?.name ?? "—"} · {t.establishments?.city ?? "—"}</p>
                  </div>
                  <span className={`shrink-0 text-[10px] font-bold px-2.5 py-1 rounded-full border ${s.cls}`}>{s.label}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="flex-1 bg-black/30" onClick={() => setSelected(null)} />
          <div className="w-full max-w-md bg-white h-full overflow-y-auto shadow-2xl flex flex-col">
            <div className="flex items-center justify-between px-6 py-5 border-b border-[#ebebeb] shrink-0">
              <h2 className="font-black text-lg text-[#0a0a0a] truncate pr-4">{selected.subject}</h2>
              <button onClick={() => setSelected(null)}><X size={20} className="text-slate-400 hover:text-[#0a0a0a]" /></button>
            </div>
            <div className="px-6 py-4 border-b border-[#ebebeb]">
              <p className="text-xs text-slate-400 mb-2">{selected.establishments?.name}</p>
              <div className="flex gap-1.5 flex-wrap">
                {STATUSES.map((s) => (
                  <button
                    key={s.value}
                    disabled={busy}
                    onClick={() => changeStatus(selected.id, s.value)}
                    className={`text-xs font-bold px-2.5 py-1 rounded-lg border transition-all ${selected.status === s.value ? `${s.cls} ring-2 ring-offset-1 ring-current` : "bg-white text-slate-400 border-[#e5e5e5]"}`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex-1 px-6 py-4 space-y-3 overflow-y-auto">
              {messages.length === 0 ? (
                <p className="text-xs text-slate-400">Aucun message.</p>
              ) : messages.map((m) => (
                <div key={m.id} className="bg-slate-50 rounded-xl p-3">
                  <p className="text-sm text-slate-700 whitespace-pre-wrap">{m.body}</p>
                  <p className="text-[10px] text-slate-400 mt-1">{new Date(m.created_at).toLocaleString("fr-FR")}</p>
                </div>
              ))}
            </div>
            <div className="px-6 py-4 border-t border-[#ebebeb] shrink-0 flex gap-2">
              <input
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                placeholder="Répondre…"
                className="flex-1 border border-[#ddd] rounded-xl px-3 py-2 text-sm"
              />
              <button onClick={sendReply} disabled={busy} className="bg-[#0a0a0a] text-white px-3 rounded-xl disabled:opacity-50">
                <Send size={15} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
