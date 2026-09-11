"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

// TIMESHEET-01 — approbation hebdomadaire. Écrit une ligne immuable dans
// timesheet_approvals (jamais un UPDATE — voir la migration) : une
// ré-approbation de la même période insère une nouvelle ligne référençant
// l'ancienne via supersedes_approval_id, sans jamais réécrire l'historique.

type Summary = {
  enseignantId: string;
  nom: string;
  actualMinutes: number;
  alreadyApproved: number | null;
};

function fmt(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h${m.toString().padStart(2, "0")}`;
}

export function ApproveWeekForm({
  establishmentId,
  periodStart,
  periodEnd,
  summaries,
}: {
  establishmentId: string;
  periodStart: string;
  periodEnd: string;
  summaries: Summary[];
}) {
  const [approved, setApproved] = useState<Record<string, number>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [minutesOverride, setMinutesOverride] = useState<Record<string, string>>({});

  async function approve(s: Summary) {
    setBusyId(s.enseignantId);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const minutes = minutesOverride[s.enseignantId] !== undefined ? Number(minutesOverride[s.enseignantId]) : s.actualMinutes;

    await supabase.from("timesheet_approvals").insert({
      establishment_id: establishmentId,
      enseignant_id: s.enseignantId,
      period_start: periodStart,
      period_end: periodEnd,
      approved_minutes: minutes,
      approved_by: user?.id,
    });
    setApproved((prev) => ({ ...prev, [s.enseignantId]: minutes }));
    setBusyId(null);
  }

  return (
    <div className="bg-white border border-[var(--school-admin-border)] rounded-[var(--school-admin-radius-card)] divide-y divide-[var(--school-admin-border)] overflow-hidden">
      {summaries.map((s) => {
        const nowApproved = approved[s.enseignantId] ?? s.alreadyApproved;
        return (
          <div key={s.enseignantId} className="p-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-[var(--school-admin-text)]">{s.nom}</p>
              <p className="text-xs text-[var(--school-admin-text-muted)]">Pointé cette semaine : {fmt(s.actualMinutes)}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {nowApproved !== null && (
                <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 rounded-full px-3 py-1.5">Validé {fmt(nowApproved)}</span>
              )}
              <label className="sr-only" htmlFor={`minutes-${s.enseignantId}`}>
                Minutes à valider pour {s.nom}
              </label>
              <input
                id={`minutes-${s.enseignantId}`}
                type="number"
                min={0}
                defaultValue={s.actualMinutes}
                onChange={(e) => setMinutesOverride((prev) => ({ ...prev, [s.enseignantId]: e.target.value }))}
                className="w-20 h-9 rounded-lg border border-[var(--school-admin-border-strong)] px-2 text-xs text-right"
                aria-label={`Minutes à valider pour ${s.nom}`}
              />
              <button
                type="button"
                onClick={() => approve(s)}
                disabled={busyId === s.enseignantId}
                aria-label={`Valider les heures de ${s.nom}`}
                className="h-9 px-3 rounded-lg bg-[var(--school-admin-primary)] text-white text-xs font-bold disabled:opacity-60"
              >
                {busyId === s.enseignantId ? "…" : "Valider"}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
