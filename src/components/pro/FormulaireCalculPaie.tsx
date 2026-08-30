"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Calculator, Loader2 } from "lucide-react";
import { withEstablishmentQuery } from "@/lib/school/establishmentContext";

export function FormulaireCalculPaie({ staffMembers, establishmentId }: { staffMembers: { id: string; nom: string }[]; establishmentId: string }) {
  const router = useRouter();
  const [staffMemberId, setStaffMemberId] = useState(staffMembers[0]?.id ?? "");
  const today = new Date();
  const [periodeDebut, setPeriodeDebut] = useState(
    new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10)
  );
  const [periodeFin, setPeriodeFin] = useState(
    new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().slice(0, 10)
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function calculer(e: { preventDefault(): void }) {
    e.preventDefault();
    setSaving(true);
    setError("");
    const res = await fetch("/api/payroll/calculer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ staffMemberId, periodeDebut, periodeFin, requestedEstablishmentId: establishmentId }),
    });
    const body = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) { setError(body.error ?? "Echec du calcul"); return; }
    router.push(withEstablishmentQuery(`/pro/paie/${body.bulletinId}`, establishmentId));
  }

  if (staffMembers.length === 0) {
    return <p className="text-sm text-gray-400">Aucun membre du personnel avec un contrat actif.</p>;
  }

  return (
    <form onSubmit={calculer} className="flex flex-wrap items-end gap-3 bg-white border border-[#ebebeb] rounded-2xl p-4">
      <div>
        <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Personnel</label>
        <select value={staffMemberId} onChange={(e) => setStaffMemberId(e.target.value)} className="border border-[#ddd] rounded-lg px-3 py-2 text-sm bg-white">
          {staffMembers.map((s) => <option key={s.id} value={s.id}>{s.nom}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Debut periode</label>
        <input type="date" value={periodeDebut} onChange={(e) => setPeriodeDebut(e.target.value)} className="border border-[#ddd] rounded-lg px-3 py-2 text-sm" />
      </div>
      <div>
        <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Fin periode</label>
        <input type="date" value={periodeFin} onChange={(e) => setPeriodeFin(e.target.value)} className="border border-[#ddd] rounded-lg px-3 py-2 text-sm" />
      </div>
      {error && <p className="text-xs text-red-600 w-full">{error}</p>}
      <button type="submit" disabled={saving} className="flex items-center gap-2 bg-[#0a0a0a] text-white px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50">
        {saving ? <Loader2 size={14} className="animate-spin" /> : <Calculator size={14} />}
        Calculer
      </button>
    </form>
  );
}
