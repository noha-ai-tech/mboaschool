"use client";

import { useState } from "react";
import { Play, Square } from "lucide-react";
import { enqueueMutation } from "@/lib/offline/outbox";
import { triggerManualSync } from "@/lib/offline/syncEngine";
import { getActiveSyncIdentity } from "@/lib/offline/syncIdentity";
import { SyncStatus } from "@/components/offline/SyncStatus";

// TIMESHEET-01 — check-in/checkout self-service, réutilisant le moteur
// OFFLINE-01/01.1/01.2/01.3 tel quel (aucun second moteur), même schéma
// que RollCall.tsx : chaque tap enqueue une mutation "staff_punch",
// sync_apply_staff_punch (SECURITY DEFINER) résout l'identité enseignant
// et horodate côté serveur — jamais l'heure de l'appareil comme vérité.

export function StaffPunch({
  establishmentId,
  initialCheckedInAt,
}: {
  establishmentId: string;
  initialCheckedInAt: string | null;
}) {
  const [checkedInAt, setCheckedInAt] = useState<string | null>(initialCheckedInAt);
  const [pending, setPending] = useState<"arrivee" | "depart" | null>(null);
  const [error, setError] = useState("");

  async function punch(type: "arrivee" | "depart") {
    const identity = getActiveSyncIdentity();
    if (!identity.userId) return;
    setError("");
    setPending(type);
    const deviceOccurredAtIso = new Date().toISOString();
    try {
      await enqueueMutation({
        entityType: "staff_punch",
        operation: "create",
        entityId: null,
        payload: { type, device_occurred_at: deviceOccurredAtIso },
        baseVersion: null,
        userId: identity.userId,
        establishmentId,
      });
      // Optimiste mais honnête : l'UI reflète l'action locale
      // immédiatement (SyncStatus indique déjà "en attente" tant que la
      // confirmation serveur n'est pas revenue — jamais une fausse
      // confirmation, Phase 13).
      setCheckedInAt(type === "arrivee" ? deviceOccurredAtIso : null);
    } catch (queueError) {
      setError(queueError instanceof Error ? queueError.message : "Échec de l'enregistrement local");
    } finally {
      setPending(null);
    }
    void triggerManualSync();
  }

  return (
    <div className="bg-white border border-border rounded-card p-5 mb-5">
      <div className="flex items-center justify-between gap-3 mb-3">
        <p className="text-xs font-semibold tracking-widest uppercase text-text-secondary">Présence</p>
        <SyncStatus />
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-[10px] px-4 py-3 text-sm font-medium mb-3">{error}</div>}

      {checkedInAt ? (
        <>
          <p className="flex items-center gap-2 text-sm font-semibold text-emerald-700 mb-3">
            <span className="w-2 h-2 rounded-full bg-emerald-500" aria-hidden="true" />
            Présent depuis {new Date(checkedInAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
          </p>
          <button
            type="button"
            onClick={() => punch("depart")}
            disabled={pending !== null}
            aria-label="Terminer ma journée"
            className="w-full h-12 flex items-center justify-center gap-2 rounded-card bg-red-50 border border-red-200 text-red-700 text-sm font-bold disabled:opacity-60 transition-opacity duration-base"
          >
            <Square size={15} aria-hidden="true" />
            {pending === "depart" ? "Enregistrement…" : "Terminer ma journée"}
          </button>
        </>
      ) : (
        <>
          <p className="flex items-center gap-2 text-sm font-semibold text-text-secondary mb-3">
            <span className="w-2 h-2 rounded-full bg-slate-300" aria-hidden="true" />
            Non pointé
          </p>
          <button
            type="button"
            onClick={() => punch("arrivee")}
            disabled={pending !== null}
            aria-label="Commencer ma journée"
            className="w-full h-12 flex items-center justify-center gap-2 rounded-card bg-gradient-to-r from-primary to-primary-dark text-white text-sm font-bold disabled:opacity-60 transition-opacity duration-base"
          >
            <Play size={15} aria-hidden="true" />
            {pending === "arrivee" ? "Enregistrement…" : "Commencer ma journée"}
          </button>
        </>
      )}
    </div>
  );
}
