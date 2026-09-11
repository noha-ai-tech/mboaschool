"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

// TIMESHEET-01 — revue directeur des demandes de correction. N'écrit
// jamais le pointage brut : seule la ligne timesheet_corrections change de
// statut (approved/rejected), scopée par RLS (timesheet_corrections_owner_manage)
// à l'établissement actif — une tentative sur une correction étrangère
// affecte 0 ligne, jamais une erreur silencieuse masquée.

type Correction = {
  id: string;
  enseignant_id: string;
  enseignantNom: string;
  correction_type: string;
  target_date: string;
  proposed_type: string | null;
  proposed_time: string;
  reason: string;
  requested_at: string;
};

const TYPE_LABEL: Record<string, string> = {
  missing_check_in: "Arrivée manquante",
  missing_check_out: "Départ manquant",
  adjust_time: "Heure à corriger",
};

export function CorrectionReviewList({ corrections }: { corrections: Correction[] }) {
  const [items, setItems] = useState(corrections);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function review(id: string, status: "approved" | "rejected") {
    setBusyId(id);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    await supabase
      .from("timesheet_corrections")
      .update({ status, reviewed_by: user?.id, reviewed_at: new Date().toISOString() })
      .eq("id", id);
    setItems((prev) => prev.filter((c) => c.id !== id));
    setBusyId(null);
  }

  if (items.length === 0) return null;

  return (
    <div className="bg-white border border-[var(--school-admin-border)] rounded-[var(--school-admin-radius-card)] divide-y divide-[var(--school-admin-border)] overflow-hidden">
      {items.map((c) => (
        <div key={c.id} className="p-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-[var(--school-admin-text)]">{c.enseignantNom}</p>
            <p className="text-xs text-[var(--school-admin-text-muted)]">
              {TYPE_LABEL[c.correction_type] ?? c.correction_type} · {new Date(c.target_date).toLocaleDateString("fr-FR")} ·{" "}
              proposé {new Date(c.proposed_time).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
            </p>
            <p className="text-xs text-[var(--school-admin-text-muted)] mt-0.5">« {c.reason} »</p>
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              type="button"
              onClick={() => review(c.id, "rejected")}
              disabled={busyId === c.id}
              aria-label={`Rejeter la correction de ${c.enseignantNom}`}
              className="h-9 px-3 rounded-lg border border-[var(--school-admin-border-strong)] text-xs font-semibold text-[var(--school-admin-text-muted)] disabled:opacity-60"
            >
              Rejeter
            </button>
            <button
              type="button"
              onClick={() => review(c.id, "approved")}
              disabled={busyId === c.id}
              aria-label={`Approuver la correction de ${c.enseignantNom}`}
              className="h-9 px-3 rounded-lg bg-[var(--school-admin-primary)] text-white text-xs font-bold disabled:opacity-60"
            >
              {busyId === c.id ? "…" : "Approuver"}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
