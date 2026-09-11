"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

// TIMESHEET-01 (mission §19) — l'enseignant ne modifie jamais un pointage
// brut directement : il soumet une demande de correction, conservée telle
// quelle (raw record jamais touché) jusqu'à revue par le propriétaire.
// Écriture RLS directe (timesheet_corrections_teacher_create), jamais une
// RPC : aucune logique métier sensible n'est en jeu ici, seulement la
// création d'une proposition scoée à l'auteur lui-même.

const TYPES: { value: string; label: string }[] = [
  { value: "missing_check_out", label: "J'ai oublié de pointer mon départ" },
  { value: "missing_check_in", label: "J'ai oublié de pointer mon arrivée" },
  { value: "adjust_time", label: "Une heure est incorrecte" },
];

export function CorrectionRequestForm({ enseignantId, establishmentId }: { enseignantId: string; establishmentId: string }) {
  const [open, setOpen] = useState(false);
  const [correctionType, setCorrectionType] = useState(TYPES[0].value);
  const [proposedTime, setProposedTime] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!proposedTime || !reason.trim()) return;
    setSubmitting(true);
    setFeedback(null);

    const today = new Date().toISOString().slice(0, 10);
    const proposedIso = new Date(`${today}T${proposedTime}:00`).toISOString();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setFeedback({ kind: "error", text: "Session expirée — reconnectez-vous." });
      setSubmitting(false);
      return;
    }

    const { error } = await supabase.from("timesheet_corrections").insert({
      establishment_id: establishmentId,
      enseignant_id: enseignantId,
      correction_type: correctionType,
      target_date: today,
      proposed_type: correctionType === "missing_check_in" ? "arrivee" : "depart",
      proposed_time: proposedIso,
      reason: reason.trim(),
      requested_by: user.id,
    });

    if (error) {
      setFeedback({ kind: "error", text: error.message });
    } else {
      setFeedback({ kind: "success", text: "Demande envoyée — en attente de validation." });
      setReason("");
      setProposedTime("");
      setOpen(false);
    }
    setSubmitting(false);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Signaler un oubli de pointage"
        className="w-full h-11 rounded-card border border-border bg-white text-sm font-semibold text-text-primary hover:border-primary transition-colors duration-base"
      >
        Signaler un oubli de pointage
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="bg-white border border-border rounded-card p-5">
      <p className="text-sm font-bold text-text-primary mb-3">Demande de correction</p>

      {feedback && (
        <div className={`rounded-[10px] px-4 py-3 text-sm font-medium mb-3 ${feedback.kind === "error" ? "bg-red-50 border border-red-200 text-red-700" : "bg-emerald-50 border border-emerald-200 text-emerald-700"}`}>
          {feedback.text}
        </div>
      )}

      <label htmlFor="correction-type" className="block text-xs font-semibold text-text-secondary mb-1.5">
        Type
      </label>
      <select
        id="correction-type"
        value={correctionType}
        onChange={(e) => setCorrectionType(e.target.value)}
        className="w-full h-10 rounded-lg border border-border px-3 text-sm mb-3"
      >
        {TYPES.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </select>

      <label htmlFor="correction-time" className="block text-xs font-semibold text-text-secondary mb-1.5">
        Heure proposée
      </label>
      <input
        id="correction-time"
        type="time"
        value={proposedTime}
        onChange={(e) => setProposedTime(e.target.value)}
        required
        className="w-full h-10 rounded-lg border border-border px-3 text-sm mb-3"
      />

      <label htmlFor="correction-reason" className="block text-xs font-semibold text-text-secondary mb-1.5">
        Raison
      </label>
      <textarea
        id="correction-reason"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        required
        rows={2}
        placeholder="ex. oubli de pointage"
        className="w-full rounded-lg border border-border px-3 py-2 text-sm mb-4"
      />

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="flex-1 h-11 rounded-card border border-border text-sm font-semibold text-text-secondary"
        >
          Annuler
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="flex-1 h-11 rounded-card bg-primary text-white text-sm font-bold disabled:opacity-60"
        >
          {submitting ? "Envoi…" : "Envoyer"}
        </button>
      </div>
    </form>
  );
}
