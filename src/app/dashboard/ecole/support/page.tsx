"use client";

// Support (Mission 03 placeholder, câblé en Mission 08 Phase 8). Une école
// peut désormais ouvrir un vrai ticket (support_tickets, migration 0013) et
// suivre les réponses de l'équipe Écoles237. RLS : l'école ne voit et
// n'écrit que sur ses propres tickets (owner_id), jamais ceux d'une autre
// école — même pattern que le reste du dépôt.

import { useEffect, useState } from "react";
import { useSchool } from "@/lib/useSchool";
import { supabase } from "@/lib/supabase";
import { LifeBuoy, Plus, X, Send, Mail, BookOpen } from "lucide-react";

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  ouvert:     { label: "Ouvert",     cls: "text-blue-700 bg-blue-50 border-blue-200" },
  en_cours:   { label: "En cours",   cls: "text-orange-700 bg-orange-50 border-orange-200" },
  en_attente: { label: "En attente", cls: "text-purple-700 bg-purple-50 border-purple-200" },
  resolu:     { label: "Résolu",     cls: "text-emerald-700 bg-emerald-50 border-emerald-200" },
  ferme:      { label: "Fermé",      cls: "text-slate-500 bg-slate-100 border-slate-200" },
};

export default function SupportPage() {
  const { school, loading: schoolLoading } = useSchool();
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [selected, setSelected] = useState<any | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [reply, setReply] = useState("");

  useEffect(() => {
    if (!school) return;
    load();
  }, [school]);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("support_tickets")
      .select("*")
      .eq("establishment_id", school!.id)
      .order("updated_at", { ascending: false });
    if (data) setTickets(data);
    setLoading(false);
  }

  async function createTicket(e: { preventDefault(): void }) {
    e.preventDefault();
    if (!subject.trim()) return;
    setSubmitting(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { data: ticket } = await supabase
      .from("support_tickets")
      .insert({ establishment_id: school!.id, created_by: user?.id, subject: subject.trim() })
      .select("id")
      .single();
    if (ticket && description.trim()) {
      await supabase.from("support_ticket_messages").insert({ ticket_id: ticket.id, author_id: user?.id, body: description.trim() });
    }
    setSubject("");
    setDescription("");
    setSubmitting(false);
    setShowForm(false);
    load();
  }

  async function openTicket(t: any) {
    setSelected(t);
    const { data } = await supabase.from("support_ticket_messages").select("*").eq("ticket_id", t.id).order("created_at", { ascending: true });
    setMessages(data ?? []);
  }

  async function sendReply() {
    if (!reply.trim() || !selected) return;
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("support_ticket_messages").insert({ ticket_id: selected.id, author_id: user?.id, body: reply.trim() });
    await supabase.from("support_tickets").update({ updated_at: new Date().toISOString() }).eq("id", selected.id);
    setReply("");
    openTicket(selected);
  }

  if (schoolLoading) return <div className="max-w-2xl h-64 bg-white rounded-2xl animate-pulse" />;

  return (
    <div className="max-w-2xl">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold tracking-widest uppercase text-slate-400 mb-1">Dashboard</p>
          <h1 className="text-3xl font-black tracking-tight text-[#0a0a0a]">Support</h1>
          <p className="text-slate-500 text-sm mt-1">Une question sur votre compte ou votre fiche ? Ouvrez un ticket.</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-emerald-700 transition-colors shrink-0"
        >
          <Plus size={15} /> Nouveau ticket
        </button>
      </div>

      {showForm && (
        <form onSubmit={createTicket} className="bg-white border border-[#ebebeb] rounded-2xl p-6 mb-6 space-y-3">
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            required
            placeholder="Sujet de votre demande"
            className="w-full border border-[#ddd] rounded-xl px-4 py-2.5 text-sm"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            placeholder="Décrivez votre problème ou votre question…"
            className="w-full border border-[#ddd] rounded-xl px-4 py-2.5 text-sm resize-none"
          />
          <div className="flex gap-2">
            <button type="submit" disabled={submitting} className="bg-[#0a0a0a] text-white px-4 py-2 rounded-xl text-sm font-bold disabled:opacity-50">
              {submitting ? "Envoi…" : "Envoyer"}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="border border-[#ddd] px-4 py-2 rounded-xl text-sm font-semibold">
              Annuler
            </button>
          </div>
        </form>
      )}

      <div className="bg-white border border-[#ebebeb] rounded-2xl overflow-hidden mb-4">
        {loading ? (
          <div className="divide-y divide-[#f5f5f5]">{[1, 2].map((i) => <div key={i} className="h-14 animate-pulse" />)}</div>
        ) : tickets.length === 0 ? (
          <div className="py-12 text-center">
            <LifeBuoy size={24} className="mx-auto text-slate-200 mb-2" />
            <p className="text-sm text-slate-400">Aucun ticket ouvert</p>
          </div>
        ) : (
          <div className="divide-y divide-[#f5f5f5]">
            {tickets.map((t) => {
              const s = STATUS_LABELS[t.status];
              return (
                <div key={t.id} onClick={() => openTicket(t)} className="flex items-center gap-3 px-5 py-3.5 hover:bg-slate-50/50 transition-colors cursor-pointer">
                  <p className="flex-1 text-sm font-semibold text-[#0a0a0a] truncate">{t.subject}</p>
                  <span className={`text-[10px] font-bold px-2 py-1 rounded-full border ${s.cls}`}>{s.label}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="bg-white border border-dashed border-slate-200 rounded-2xl p-5">
          <Mail size={18} className="text-slate-300 mb-2" />
          <p className="font-bold text-sm text-slate-400">Contacter l&apos;équipe</p>
          <p className="text-xs text-slate-400 mt-1">Utilisez le bouton &quot;Nouveau ticket&quot; ci-dessus.</p>
        </div>
        <div className="bg-white border border-dashed border-slate-200 rounded-2xl p-5">
          <BookOpen size={18} className="text-slate-300 mb-2" />
          <p className="font-bold text-sm text-slate-400">Guides d&apos;utilisation</p>
          <p className="text-xs text-slate-400 mt-1">Bientôt disponible.</p>
        </div>
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="flex-1 bg-black/30" onClick={() => setSelected(null)} />
          <div className="w-full max-w-md bg-white h-full overflow-y-auto shadow-2xl flex flex-col">
            <div className="flex items-center justify-between px-6 py-5 border-b border-[#ebebeb] shrink-0">
              <h2 className="font-black text-lg text-[#0a0a0a] truncate pr-4">{selected.subject}</h2>
              <button onClick={() => setSelected(null)} aria-label="Fermer"><X size={20} className="text-slate-400 hover:text-[#0a0a0a]" /></button>
            </div>
            <div className="flex-1 px-6 py-4 space-y-3 overflow-y-auto">
              {messages.length === 0 ? (
                <p className="text-xs text-slate-400">Aucun message pour l&apos;instant.</p>
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
                placeholder="Ajouter un message…"
                className="flex-1 border border-[#ddd] rounded-xl px-3 py-2 text-sm"
              />
              <button onClick={sendReply} aria-label="Envoyer" className="bg-[#0a0a0a] text-white px-3 rounded-xl">
                <Send size={15} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
