"use client";

// OFFLINE-01 Phase 13 — composant partagé d'état de synchronisation.
// Jamais "Enregistré" si la donnée n'est enregistrée nulle part : chaque
// état a un libellé explicite distinguant local vs confirmé serveur.

import { Wifi, WifiOff, Loader2, CheckCircle2, AlertTriangle, RefreshCw } from "lucide-react";
import { useSyncStatus, type DisplaySyncState } from "@/lib/offline/useSyncStatus";

const CONFIG: Record<DisplaySyncState, { label: string; icon: typeof Wifi; className: string }> = {
  online: { label: "Synchronisé", icon: CheckCircle2, className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  offline: { label: "Enregistré sur cet appareil", icon: WifiOff, className: "bg-slate-100 text-slate-600 border-slate-200" },
  pending: { label: "Synchronisation en attente", icon: Wifi, className: "bg-amber-50 text-amber-700 border-amber-200" },
  syncing: { label: "Synchronisation…", icon: Loader2, className: "bg-blue-50 text-blue-700 border-blue-200" },
  error: { label: "Échec de synchronisation", icon: AlertTriangle, className: "bg-red-50 text-red-700 border-red-200" },
  conflict: { label: "Conflit à résoudre", icon: AlertTriangle, className: "bg-orange-50 text-orange-700 border-orange-200" },
};

function formatTimestamp(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  return date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

export function SyncStatus({ className = "" }: { className?: string }) {
  const { state, pendingCount, lastSyncAt, retry } = useSyncStatus();
  const config = CONFIG[state];
  const Icon = config.icon;
  const timestamp = formatTimestamp(lastSyncAt);

  return (
    <div
      role="status"
      aria-live="polite"
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${config.className} ${className}`}
    >
      <Icon size={13} className={state === "syncing" ? "animate-spin" : ""} aria-hidden="true" />
      <span>{config.label}</span>
      {(state === "pending" || state === "syncing") && pendingCount > 0 && (
        <span className="rounded-full bg-white/60 px-1.5 py-0.5 text-[10px]">{pendingCount}</span>
      )}
      {state === "online" && timestamp && <span className="text-[10px] font-normal opacity-70">Dernière synchronisation : {timestamp}</span>}
      {(state === "error" || state === "conflict") && (
        <button
          type="button"
          onClick={retry}
          className="ml-1 inline-flex items-center gap-1 rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-bold hover:bg-white transition-colors"
        >
          <RefreshCw size={10} aria-hidden="true" />
          Réessayer
        </button>
      )}
    </div>
  );
}
