"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Plus, Loader2 } from "lucide-react";

export function FormulaireSalle({ etablissementId }: { etablissementId: string }) {
  const router = useRouter();
  const [nom, setNom] = useState("");
  const [capacite, setCapacite] = useState("");
  const [type, setType] = useState("classe");
  const [saving, setSaving] = useState(false);

  async function submit(e: { preventDefault(): void }) {
    e.preventDefault();
    if (!nom.trim()) return;
    setSaving(true);
    await supabase.from("salles").insert({
      etablissement_id: etablissementId,
      nom: nom.trim(),
      capacite: capacite ? Number(capacite) : null,
      type,
    });
    setSaving(false);
    setNom("");
    setCapacite("");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-2 bg-white border border-[#ebebeb] rounded-2xl p-4">
      <div>
        <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Nom</label>
        <input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Salle 12" className="border border-[#ddd] rounded-lg px-3 py-2 text-sm" />
      </div>
      <div>
        <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Capacité</label>
        <input value={capacite} onChange={(e) => setCapacite(e.target.value)} placeholder="40" className="border border-[#ddd] rounded-lg px-3 py-2 text-sm w-24" />
      </div>
      <div>
        <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Type</label>
        <select value={type} onChange={(e) => setType(e.target.value)} className="border border-[#ddd] rounded-lg px-3 py-2 text-sm bg-white">
          <option value="classe">Classe</option>
          <option value="laboratoire">Laboratoire</option>
          <option value="informatique">Informatique</option>
          <option value="sport">Sport</option>
        </select>
      </div>
      <button type="submit" disabled={saving} className="flex items-center gap-2 bg-[#0a0a0a] text-white px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50">
        {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
        Ajouter
      </button>
    </form>
  );
}
