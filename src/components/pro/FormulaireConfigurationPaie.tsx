"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { Save, CheckCircle2, Loader2 } from "lucide-react";

type Config = {
  devise: string;
  frequence_paie: string;
  seuil_retard_minutes: number;
  taux_heure_sup_multiplicateur: number;
  jour_paie: number | null;
} | null;

export function FormulaireConfigurationPaie({ etablissementId, initial }: { etablissementId: string; initial: Config }) {
  const [form, setForm] = useState({
    devise: initial?.devise ?? "FCFA",
    frequence_paie: initial?.frequence_paie ?? "mensuelle",
    seuil_retard_minutes: initial?.seuil_retard_minutes ?? 10,
    taux_heure_sup_multiplicateur: initial?.taux_heure_sup_multiplicateur ?? 1.25,
    jour_paie: initial?.jour_paie ?? 28,
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save(e: { preventDefault(): void }) {
    e.preventDefault();
    setSaving(true);
    await supabase.from("payroll_config").upsert({
      etablissement_id: etablissementId,
      ...form,
      updated_at: new Date().toISOString(),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  return (
    <form onSubmit={save} className="bg-white border border-[#ebebeb] rounded-2xl p-6 space-y-4">
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Devise">
          <input value={form.devise} onChange={(e) => setForm({ ...form, devise: e.target.value })} />
        </Field>
        <Field label="Fréquence de paie">
          <select value={form.frequence_paie} onChange={(e) => setForm({ ...form, frequence_paie: e.target.value })}>
            <option value="mensuelle">Mensuelle</option>
            <option value="quinzaine">Quinzaine</option>
            <option value="hebdomadaire">Hebdomadaire</option>
          </select>
        </Field>
        <Field label="Seuil de retard (minutes)">
          <input type="number" value={form.seuil_retard_minutes} onChange={(e) => setForm({ ...form, seuil_retard_minutes: Number(e.target.value) })} />
        </Field>
        <Field label="Multiplicateur heures sup.">
          <input type="number" step="0.05" value={form.taux_heure_sup_multiplicateur} onChange={(e) => setForm({ ...form, taux_heure_sup_multiplicateur: Number(e.target.value) })} />
        </Field>
        <Field label="Jour de paie (1-28)">
          <input type="number" min={1} max={28} value={form.jour_paie ?? ""} onChange={(e) => setForm({ ...form, jour_paie: e.target.value ? Number(e.target.value) : null })} />
        </Field>
      </div>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={saving} className="flex items-center gap-2 bg-[#0a0a0a] text-white px-5 py-2.5 rounded-xl text-sm font-bold disabled:opacity-50">
          {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
          Enregistrer
        </button>
        {saved && <span className="flex items-center gap-1.5 text-sm text-emerald-700 font-semibold"><CheckCircle2 size={15} /> Enregistré</span>}
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">{label}</label>
      <div className="[&_input]:w-full [&_input]:border [&_input]:border-[#ddd] [&_input]:rounded-xl [&_input]:px-4 [&_input]:py-2.5 [&_input]:text-sm [&_select]:w-full [&_select]:border [&_select]:border-[#ddd] [&_select]:rounded-xl [&_select]:px-4 [&_select]:py-2.5 [&_select]:text-sm [&_select]:bg-white">
        {children}
      </div>
    </div>
  );
}
