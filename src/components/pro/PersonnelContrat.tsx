"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Save, Loader2 } from "lucide-react";

type Contract = {
  id: string; type: string; salaire: number | null; taux_horaire: number | null;
  volume_hebdomadaire: number | null; date_debut: string; date_fin: string | null; statut: string;
};

export function PersonnelContrat({ staffMemberId, current }: { staffMemberId: string; current: Contract | null }) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    type: "temps_plein", salaire: "", taux_horaire: "", volume_hebdomadaire: "",
    date_debut: new Date().toISOString().slice(0, 10),
  });

  async function save(e: { preventDefault(): void }) {
    e.preventDefault();
    setSaving(true);
    setError("");
    const { error: err } = await supabase.from("staff_contracts").insert({
      staff_member_id: staffMemberId,
      type: form.type,
      salaire: form.salaire ? Number(form.salaire) : null,
      taux_horaire: form.taux_horaire ? Number(form.taux_horaire) : null,
      volume_hebdomadaire: form.volume_hebdomadaire ? Number(form.volume_hebdomadaire) : null,
      date_debut: form.date_debut,
      statut: "actif",
    });
    setSaving(false);
    if (err) { setError(err.message); return; }
    setShowForm(false);
    router.refresh();
  }

  if (current && !showForm) {
    return (
      <div className="space-y-2 text-sm">
        <Row label="Type" value={current.type} />
        {current.salaire && <Row label="Salaire mensuel" value={`${current.salaire.toLocaleString("fr-FR")} FCFA`} />}
        {current.taux_horaire && <Row label="Taux horaire" value={`${current.taux_horaire.toLocaleString("fr-FR")} FCFA/h`} />}
        {current.volume_hebdomadaire && <Row label="Volume hebdomadaire" value={`${current.volume_hebdomadaire} h`} />}
        <Row label="Début" value={new Date(current.date_debut).toLocaleDateString("fr-FR")} />
        <Row label="Statut" value={current.statut === "actif" ? "Actif" : "Terminé"} />
        <button onClick={() => setShowForm(true)} className="text-xs text-emerald-700 font-semibold mt-2">
          + Nouveau contrat
        </button>
      </div>
    );
  }

  if (!showForm) {
    return (
      <button
        onClick={() => setShowForm(true)}
        className="text-sm text-emerald-700 font-semibold"
      >
        + Ajouter un contrat
      </button>
    );
  }

  return (
    <form onSubmit={save} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="border border-[#ddd] rounded-lg px-3 py-2 text-sm">
          <option value="temps_plein">Temps plein</option>
          <option value="temps_partiel">Temps partiel</option>
          <option value="vacataire">Vacataire</option>
        </select>
        <input type="date" value={form.date_debut} onChange={(e) => setForm({ ...form, date_debut: e.target.value })} className="border border-[#ddd] rounded-lg px-3 py-2 text-sm" />
        <input placeholder="Salaire mensuel (FCFA)" value={form.salaire} onChange={(e) => setForm({ ...form, salaire: e.target.value })} className="border border-[#ddd] rounded-lg px-3 py-2 text-sm" />
        <input placeholder="Taux horaire (FCFA)" value={form.taux_horaire} onChange={(e) => setForm({ ...form, taux_horaire: e.target.value })} className="border border-[#ddd] rounded-lg px-3 py-2 text-sm" />
        <input placeholder="Volume hebdo (h)" value={form.volume_hebdomadaire} onChange={(e) => setForm({ ...form, volume_hebdomadaire: e.target.value })} className="border border-[#ddd] rounded-lg px-3 py-2 text-sm col-span-2" />
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={saving} className="flex items-center gap-2 bg-[#0a0a0a] text-white px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50">
          {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
          Enregistrer
        </button>
        <button type="button" onClick={() => setShowForm(false)} className="text-sm text-slate-500">Annuler</button>
      </div>
    </form>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-400">{label}</span>
      <span className="font-semibold text-[#0a0a0a]">{value}</span>
    </div>
  );
}
