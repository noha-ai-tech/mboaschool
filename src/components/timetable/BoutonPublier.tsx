"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function BoutonPublier({ anneeScolaire, hasBrouillon }: { anneeScolaire: string; hasBrouillon: boolean }) {
  const router = useRouter();
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function publier() {
    setEnCours(true);
    setErreur(null);
    try {
      const res = await fetch("/api/timetable/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ anneeScolaire }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErreur(data.error ?? "Echec de la publication");
        return;
      }
      router.refresh();
    } catch {
      setErreur("Erreur reseau");
    } finally {
      setEnCours(false);
    }
  }

  if (!hasBrouillon) return null;

  return (
    <div>
      <button
        onClick={publier}
        disabled={enCours}
        className="rounded-md border border-[#007A3D] text-[#007A3D] px-4 py-2 text-sm font-medium disabled:opacity-60 hover:bg-emerald-50 transition-colors"
      >
        {enCours ? "Publication..." : "Publier le brouillon"}
      </button>
      {erreur && <p className="mt-2 text-sm text-red-600">{erreur}</p>}
    </div>
  );
}
