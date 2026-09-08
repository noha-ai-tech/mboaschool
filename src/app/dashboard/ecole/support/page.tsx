"use client";

import { useCallback, useEffect, useState } from "react";
import { LifeBuoy, Plus, Send, BookOpen } from "lucide-react";
import { useSchool } from "@/lib/useSchool";
import { supabase } from "@/lib/supabase";
import { SchoolAdminPageHeader } from "@/components/school-admin/ui/PageHeader";
import { SchoolAdminButton } from "@/components/school-admin/ui/Button";
import { SchoolAdminStatusBadge, type SchoolAdminStatusTone } from "@/components/school-admin/ui/Badge";
import { SchoolAdminSectionCard } from "@/components/school-admin/ui/Card";
import { SchoolAdminAlert, SchoolAdminEmptyState, SchoolAdminLoadingState, SchoolAdminSkeleton } from "@/components/school-admin/ui/Feedback";
import { SchoolAdminFormField, SchoolAdminInput, SchoolAdminTextarea } from "@/components/school-admin/ui/FormControls";
import { SchoolAdminDialog, SchoolAdminDrawer } from "@/components/school-admin/ui/Overlay";

type Ticket = { id: string; subject: string; status: string; updated_at: string };
type TicketMessage = { id: string; body: string; created_at: string };
const STATUS_LABELS: Record<string, { label: string; tone: SchoolAdminStatusTone }> = {
  ouvert: { label: "Ouvert", tone: "info" }, en_cours: { label: "En cours", tone: "warning" },
  en_attente: { label: "En attente", tone: "warning" }, resolu: { label: "Résolu", tone: "success" }, ferme: { label: "Fermé", tone: "neutral" },
};

export default function SupportPage() {
  const { school, loading: schoolLoading } = useSchool();
  const [tickets, setTickets] = useState<Ticket[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false); const [subject, setSubject] = useState(""); const [description, setDescription] = useState(""); const [submitting, setSubmitting] = useState(false);
  const [selected, setSelected] = useState<Ticket | null>(null); const [messages, setMessages] = useState<TicketMessage[]>([]); const [messagesLoading, setMessagesLoading] = useState(false);
  const [reply, setReply] = useState(""); const [replying, setReplying] = useState(false); const [feedback, setFeedback] = useState<string | null>(null);

  const load = useCallback(async () => { if (!school) return; setLoading(true); setError(null); const { data, error: loadError } = await supabase.from("support_tickets").select("*").eq("establishment_id", school.id).order("updated_at", { ascending: false }); if (loadError) setError("Impossible de charger les tickets de cet établissement."); else setTickets((data ?? []) as Ticket[]); setLoading(false); }, [school]);
  useEffect(() => { if (!school) { setLoading(false); return; } void load(); }, [load, school]);
  async function createTicket(event: React.FormEvent) { event.preventDefault(); if (!subject.trim() || !school || submitting) return; setSubmitting(true); setError(null); const { data: { user } } = await supabase.auth.getUser(); const { data: ticket, error: ticketError } = await supabase.from("support_tickets").insert({ establishment_id: school.id, created_by: user?.id, subject: subject.trim() }).select("id").single(); if (ticketError || !ticket) { setError("Le ticket n’a pas pu être créé."); setSubmitting(false); return; } if (description.trim()) { const { error: messageError } = await supabase.from("support_ticket_messages").insert({ ticket_id: ticket.id, author_id: user?.id, body: description.trim() }); if (messageError) setError("Le ticket a été créé, mais son premier message n’a pas pu être ajouté."); } setSubject(""); setDescription(""); setSubmitting(false); setShowForm(false); setFeedback("Ticket créé."); await load(); }
  async function openTicket(ticket: Ticket) { if (!tickets.some(({ id }) => id === ticket.id)) return; setSelected(ticket); setMessages([]); setMessagesLoading(true); setError(null); const { data, error: messageError } = await supabase.from("support_ticket_messages").select("*").eq("ticket_id", ticket.id).order("created_at", { ascending: true }); if (messageError) setError("Impossible de charger la conversation."); else setMessages((data ?? []) as TicketMessage[]); setMessagesLoading(false); }
  async function sendReply(event: React.FormEvent) { event.preventDefault(); if (!reply.trim() || !selected || replying) return; setReplying(true); setError(null); const { data: { user } } = await supabase.auth.getUser(); const { error: messageError } = await supabase.from("support_ticket_messages").insert({ ticket_id: selected.id, author_id: user?.id, body: reply.trim() }); if (messageError) { setError("Le message n’a pas pu être envoyé."); setReplying(false); return; } await supabase.from("support_tickets").update({ updated_at: new Date().toISOString() }).eq("id", selected.id); setReply(""); setFeedback("Message envoyé."); await openTicket(selected); setReplying(false); }
  if (schoolLoading) return <SchoolAdminLoadingState label="Chargement du support" />;

  return <div className="mx-auto max-w-5xl">
    <SchoolAdminPageHeader eyebrow="Assistance" title="Support" description="Créez un ticket et suivez les réponses de l’équipe Écoles237 pour l’établissement actif." actions={<SchoolAdminButton leadingIcon={<Plus size={16} aria-hidden="true" />} onClick={() => setShowForm(true)}>Nouveau ticket</SchoolAdminButton>} />
    {error ? <div className="mb-4"><SchoolAdminAlert tone="danger">{error}</SchoolAdminAlert></div> : null}<div className="sr-only" role="status" aria-live="polite">{feedback}</div>
    <SchoolAdminSectionCard title="Tickets de l’établissement" description="Les tickets les plus récemment mis à jour apparaissent en premier.">
      {loading ? <div className="space-y-3" role="status" aria-label="Chargement des tickets"><SchoolAdminSkeleton className="h-16" label="" /><SchoolAdminSkeleton className="h-16" label="" /></div> : tickets.length === 0 ? <SchoolAdminEmptyState icon={<LifeBuoy size={22} />} title="Aucun ticket" description="Créez un ticket lorsque vous avez besoin d’aide." action={<SchoolAdminButton onClick={() => setShowForm(true)}>Créer un ticket</SchoolAdminButton>} /> : <div className="divide-y divide-[var(--school-admin-border)]">{tickets.map((ticket) => { const status = STATUS_LABELS[ticket.status] ?? { label: ticket.status, tone: "neutral" as const }; return <button key={ticket.id} type="button" onClick={() => void openTicket(ticket)} className="flex min-h-16 w-full items-center gap-3 px-2 py-3 text-left transition hover:bg-[var(--school-admin-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--school-admin-focus)] motion-reduce:transition-none"><span className="min-w-0 flex-1 truncate text-sm font-bold text-[var(--school-admin-text)]">{ticket.subject}</span><SchoolAdminStatusBadge label={status.label} tone={status.tone} /></button>; })}</div>}
    </SchoolAdminSectionCard>
    <div className="mt-5"><SchoolAdminSectionCard title="Guides d’utilisation" description="Cette ressource n’est pas encore disponible."><div className="flex items-center gap-3 text-[var(--school-admin-text-muted)]"><BookOpen size={20} aria-hidden="true" /><SchoolAdminStatusBadge label="Bientôt disponible" /></div></SchoolAdminSectionCard></div>

    <SchoolAdminDialog open={showForm} onClose={() => !submitting && setShowForm(false)} closeOnBackdrop={!submitting} title="Créer un ticket" description="Décrivez votre question pour l’établissement actif."><form id="new-support-ticket" onSubmit={createTicket} className="space-y-4"><SchoolAdminFormField id="ticket-subject" label="Sujet" required><SchoolAdminInput value={subject} onChange={(e) => setSubject(e.target.value)} /></SchoolAdminFormField><SchoolAdminFormField id="ticket-description" label="Message"><SchoolAdminTextarea value={description} onChange={(e) => setDescription(e.target.value)} /></SchoolAdminFormField><div className="flex justify-end gap-2"><SchoolAdminButton variant="ghost" onClick={() => setShowForm(false)} disabled={submitting}>Annuler</SchoolAdminButton><SchoolAdminButton type="submit" loading={submitting}>Créer le ticket</SchoolAdminButton></div></form></SchoolAdminDialog>

    <SchoolAdminDrawer open={selected !== null} onClose={() => !replying && setSelected(null)} closeOnBackdrop={!replying} title={selected?.subject ?? "Conversation du ticket"} description={selected ? `Statut : ${(STATUS_LABELS[selected.status] ?? { label: selected.status }).label}` : undefined}>
      <div className="flex min-h-full flex-col"><div className="min-h-48 flex-1 space-y-3" aria-live="polite" aria-label="Messages du ticket">{messagesLoading ? <SchoolAdminSkeleton className="h-24" label="Chargement de la conversation" /> : messages.length === 0 ? <SchoolAdminEmptyState title="Aucun message" description="La conversation de ce ticket est vide." /> : messages.map((message) => <article key={message.id} className="rounded-[var(--school-admin-radius-control)] bg-[var(--school-admin-surface-muted)] p-4"><p className="whitespace-pre-wrap text-sm text-[var(--school-admin-text)]">{message.body}</p><time dateTime={message.created_at} className="mt-2 block text-xs text-[var(--school-admin-text-muted)]">{new Date(message.created_at).toLocaleString("fr-FR")}</time></article>)}</div><form onSubmit={sendReply} className="sticky bottom-0 mt-5 space-y-3 border-t border-[var(--school-admin-border)] bg-[var(--school-admin-surface)] pt-4"><SchoolAdminFormField id="ticket-reply" label="Ajouter un message"><SchoolAdminInput value={reply} onChange={(e) => setReply(e.target.value)} /></SchoolAdminFormField><div className="flex justify-end"><SchoolAdminButton type="submit" loading={replying} disabled={!reply.trim()} leadingIcon={<Send size={15} aria-hidden="true" />}>Envoyer</SchoolAdminButton></div></form></div>
    </SchoolAdminDrawer>
  </div>;
}
