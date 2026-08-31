"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function BoutonGenerer({ anneeScolaire, establishmentId }: { anneeScolaire: string; establishmentId: string }) {
  const router = useRouter();
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function generer() {
    setEnCours(true);
    setErreur(null);
    try {
      const res = await fetch("/api/timetable/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ anneeScolaire, requestedEstablishmentId: establishmentId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErreur(data.error ?? "Échec de la génération");
        return;
      }
      router.refresh();
    } catch {
      setErreur("Erreur réseau — vérifie ta connexion et réessaie");
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div>
      <button
        onClick={generer}
        disabled={enCours}
        className="rounded-md bg-[#007A3D] px-4 py-2 text-white text-sm font-medium disabled:opacity-60"
      >
        {enCours ? "Génération en cours…" : "Générer l'emploi du temps"}
      </button>
      {erreur && <p className="mt-2 text-sm text-red-600">{erreur}</p>}
    </div>
  );
}
