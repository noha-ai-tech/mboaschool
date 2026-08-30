"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Send, Loader2 } from "lucide-react";
import { withEstablishmentQuery } from "@/lib/school/establishmentContext";

export function FormulaireMessage({ departements, establishmentId }: { departements: string[]; establishmentId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [canal, setCanal] = useState<"global" | "departement">("global");
  const [departement, setDepartement] = useState(departements[0] ?? "");
  const [titre, setTitre] = useState("");
  const [contenu, setContenu] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      const res = await fetch("/api/messagerie/envoyer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titre,
          contenu,
          canal,
          departement_disciplinaire: canal === "departement" ? departement : undefined,
          requestedEstablishmentId: establishmentId,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Erreur inattendue");
        return;
      }

      // Réinitialisation + rechargement de la liste
      setTitre("");
      setContenu("");
      router.push(withEstablishmentQuery("/pro/messagerie?sent=1", establishmentId));
      router.refresh();
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-gray-200 bg-white p-6 flex flex-col gap-4"
    >
      <h2 className="text-sm font-semibold tracking-widest uppercase text-gray-400">
        Nouveau message
      </h2>

      {/* Sélecteur de canal */}
      <div>
        <label className="block text-xs font-semibold text-gray-500 mb-1.5">Canal</label>
        <div className="flex gap-2">
          {(["global", "departement"] as const).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCanal(c)}
              className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                canal === c
                  ? "bg-[#007A3D] text-white border-[#007A3D]"
                  : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
              }`}
            >
              {c === "global" ? "Global — tout l'établissement" : "Département disciplinaire"}
            </button>
          ))}
        </div>
      </div>

      {/* Sélecteur département — visible uniquement si canal = 'departement' */}
      {canal === "departement" && (
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1.5">
            Département
          </label>
          {departements.length > 0 ? (
            <select
              value={departement}
              onChange={(e) => setDepartement(e.target.value)}
              required
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              {departements.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          ) : (
            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Aucun département disciplinaire défini dans les matières de l&apos;établissement.
              Ajoutez-en depuis le tableau de bord avant d&apos;envoyer un message ciblé.
            </p>
          )}
        </div>
      )}

      {/* Titre */}
      <div>
        <label className="block text-xs font-semibold text-gray-500 mb-1.5">Titre</label>
        <input
          type="text"
          value={titre}
          onChange={(e) => setTitre(e.target.value)}
          required
          maxLength={200}
          placeholder="Objet du message…"
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white text-gray-900 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
      </div>

      {/* Contenu */}
      <div>
        <label className="block text-xs font-semibold text-gray-500 mb-1.5">Contenu</label>
        <textarea
          value={contenu}
          onChange={(e) => setContenu(e.target.value)}
          required
          rows={5}
          maxLength={4000}
          placeholder="Rédigez votre message ici…"
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white text-gray-900 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-y"
        />
        <p className="text-right text-xs text-gray-300 mt-0.5">
          {contenu.length}/4000
        </p>
      </div>

      {/* Erreur */}
      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      {/* Bouton d'envoi */}
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={isPending || (canal === "departement" && departements.length === 0)}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#007A3D] text-white text-sm font-semibold hover:bg-[#006030] disabled:opacity-60 transition-colors"
        >
          {isPending ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Send size={14} />
          )}
          {isPending ? "Envoi en cours…" : "Envoyer le message"}
        </button>
      </div>
    </form>
  );
}
