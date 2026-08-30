"use client";

import { useState } from "react";
import { Mail, Check, Loader2 } from "lucide-react";

type State = "idle" | "loading" | "success" | "error";

export function BoutonInviter({ enseignantId, establishmentId }: { enseignantId: string; establishmentId: string }) {
  const [state, setState] = useState<State>("idle");
  const [message, setMessage] = useState("");

  async function handleClick() {
    setState("loading");
    try {
      const res = await fetch(`/api/enseignants/${enseignantId}/inviter`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestedEstablishmentId: establishmentId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error ?? "Erreur inattendue");
        setState("error");
      } else {
        setMessage(data.message ?? "Invitation envoyée");
        setState("success");
      }
    } catch {
      setMessage("Erreur réseau");
      setState("error");
    }
  }

  if (state === "success") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700">
        <Check size={13} />
        Envoyée
      </span>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={handleClick}
        disabled={state === "loading"}
        className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold bg-[#007A3D] text-white hover:bg-[#006030] disabled:opacity-60 transition-colors"
      >
        {state === "loading" ? (
          <Loader2 size={12} className="animate-spin" />
        ) : (
          <Mail size={12} />
        )}
        {state === "loading" ? "Envoi…" : "Inviter"}
      </button>
      {state === "error" && (
        <span className="text-xs text-red-600 max-w-[180px] text-right leading-tight">
          {message}
        </span>
      )}
    </div>
  );
}
