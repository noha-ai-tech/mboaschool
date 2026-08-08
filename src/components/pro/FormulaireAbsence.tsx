"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Plus, Loader2 } from "lucide-react";

export function FormulaireAbsence({ staffMembers }: { staffMembers: { id: string; nom: string }[] }) {
  const router = useRouter();
  const [staffMemberId, setStaffMemberId] = useState(staffMembers[0]?.id ?? "");
  const [type, setType] = useState("absence");
  const [dateDebut, setDateDebut] = useState("");
  const [dateFin, setDateFin] = useState("");
  const [motif, setMotif] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: { preventDefault(): void }) {
    e.preventDefault();
    if (!staffMemberId || !dateDebut || !dateFin) return;
    setSaving(true);
    await supabase.from("absences").insert({
      staff_member_id: staffMemberId,
      type,
      date_debut: dateDebut,
      date_fin: dateFin,
      motif: motif || null,
    });
    setSaving(false);
    setMotif("");
    router.refresh();
  }

  if (staffMembers.length === 0) return null;

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-2 bg-white border border-[#ebebeb] rounded-2xl p-4">
      <div>
        <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Personnel</label>
        <select value={staffMemberId} onChange={(e) => setStaffMemberId(e.target.value)} className="border border-[#ddd] rounded-lg px-3 py-2 text-sm bg-white">
          {staffMembers.map((s) => <option key={s.id} value={s.id}>{s.nom}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Type</label>
        <select value={type} onChange={(e) => setType(e.target.value)} className="border border-[#ddd] rounded-lg px-3 py-2 text-sm bg-white">
          <option value="absence">Absence</option>
          <option value="conge">Congé</option>
          <option value="mission">Mission</option>
        </select>
      </div>
      <div>
        <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Début</label>
        <input type="date" value={dateDebut} onChange={(e) => setDateDebut(e.target.value)} className="border border-[#ddd] rounded-lg px-3 py-2 text-sm" />
      </div>
      <div>
        <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Fin</label>
        <input type="date" value={dateFin} onChange={(e) => setDateFin(e.target.value)} className="border border-[#ddd] rounded-lg px-3 py-2 text-sm" />
      </div>
      <div>
        <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Motif</label>
        <input value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="Optionnel" className="border border-[#ddd] rounded-lg px-3 py-2 text-sm" />
      </div>
      <button type="submit" disabled={saving} className="flex items-center gap-2 bg-[#0a0a0a] text-white px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50">
        {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
        Déclarer
      </button>
    </form>
  );
}
