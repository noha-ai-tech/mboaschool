"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";

export function PaieValidation({ bulletinId, statut, establishmentId }: { bulletinId: string; statut: string; establishmentId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function valider(etape: "valider-rh" | "valider-direction") {
    setBusy(true);
    setError("");
    const res = await fetch(`/api/payroll/${bulletinId}/${etape}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestedEstablishmentId: establishmentId }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setError(body.error ?? "Echec"); return; }
    router.refresh();
  }

  if (statut === "paie_validee") {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700">
        <CheckCircle2 size={14} /> Paie validée — visible par l&apos;enseignant
      </span>
    );
  }

  return (
    <div>
      {statut === "brouillon" && (
        <button onClick={() => valider("valider-rh")} disabled={busy} className="flex items-center gap-2 bg-[#0a0a0a] text-white px-4 py-2 rounded-xl text-sm font-bold disabled:opacity-50">
          {busy ? <Loader2 size={14} className="animate-spin" /> : null}
          Valider RH
        </button>
      )}
      {statut === "valide_rh" && (
        <button onClick={() => valider("valider-direction")} disabled={busy} className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-xl text-sm font-bold disabled:opacity-50">
          {busy ? <Loader2 size={14} className="animate-spin" /> : null}
          Valider Direction (publie à l&apos;enseignant)
        </button>
      )}
      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
    </div>
  );
}
