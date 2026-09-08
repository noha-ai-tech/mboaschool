"use client";

import { Plus, Trash2, AlertTriangle } from "lucide-react";
import { ADDITIONAL_FEE_CATEGORIES, ADDITIONAL_FEE_STATUSES, installmentsMismatchTuition, installmentsTotal, type AdditionalFeeStatus, type SchoolPagePricing } from "@/lib/schoolPage/pricing";

const field = "w-full rounded-lg border border-border bg-white px-3 py-2 text-sm";
const asAmount = (value: string) => value === "" ? null : Number(value);
const STATUS_LABELS: Record<AdditionalFeeStatus, string> = { mandatory: "Obligatoire", optional: "Optionnel", included: "Inclus", contact: "Nous contacter" };

// PRICING-01 §12 — extends the existing per-level card editor (kept — it
// already matches the mission's own suggested UX) with: cycle grouping,
// a non-blocking tuition/installments mismatch warning (§6 — "warn
// strongly but do not block"), and additional-fee status (replacing the
// old mandatory boolean so "included"/"contact" can be expressed without
// a fake 0 FCFA or an invented amount).
export function StructuredPricingEditor({ value, onChange }: { value: SchoolPagePricing; onChange: (value: SchoolPagePricing) => void }) {
  const update = (patch: Partial<SchoolPagePricing>) => onChange({ ...value, ...patch });
  return <div className="space-y-5">
    <label className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">
      <input type="checkbox" checked={value.legacy_amounts_qualified} onChange={(event) => update({ legacy_amounts_qualified: event.target.checked })} />
      Confirmer que les montants historiques sont correctement qualifiés avant leur affichage public.
    </label>
    <section className="space-y-3">
      <div className="flex items-center justify-between"><h3 className="text-sm font-bold">Tarifs par niveau</h3><button type="button" onClick={() => update({ schedules: [...value.schedules, { academic_year: "", cycle: null, level_label: "", registration_fee: null, tuition_fee: null, currency: value.currency, notes: null, position: value.schedules.length, installments: [] }] })} className="text-xs font-bold text-primary inline-flex gap-1"><Plus size={14}/>Ajouter</button></div>
      {value.schedules.map((schedule, index) => {
        const mismatch = installmentsMismatchTuition(schedule);
        return <div key={index} className="space-y-2 rounded-xl border border-border p-3">
        <div className="grid grid-cols-2 gap-2"><input className={field} placeholder="Année 2026-2027" value={schedule.academic_year} onChange={(e) => updateSchedule(index, { academic_year: e.target.value })}/><input className={field} placeholder="Cycle (optionnel, ex. Maternelle)" value={schedule.cycle ?? ""} onChange={(e) => updateSchedule(index, { cycle: e.target.value || null })}/></div>
        <input className={field} placeholder="Niveau / classe" value={schedule.level_label} onChange={(e) => updateSchedule(index, { level_label: e.target.value })}/>
        <div className="grid grid-cols-2 gap-2"><input className={field} type="number" min={0} placeholder="Inscription" value={schedule.registration_fee ?? ""} onChange={(e) => updateSchedule(index, { registration_fee: asAmount(e.target.value) })}/><input className={field} type="number" min={0} placeholder="Scolarité" value={schedule.tuition_fee ?? ""} onChange={(e) => updateSchedule(index, { tuition_fee: asAmount(e.target.value) })}/></div>
        <input className={field} placeholder="Notes (optionnel)" value={schedule.notes ?? ""} onChange={(e) => updateSchedule(index, { notes: e.target.value || null })}/>
        {schedule.installments.map((part, partIndex) => <div key={partIndex} className="grid grid-cols-2 sm:grid-cols-4 gap-2 rounded-lg bg-muted p-2"><input className={field} placeholder="Tranche" value={part.label} onChange={(e) => updateInstallment(index, partIndex, { label: e.target.value })}/><input className={field} type="number" min={0} placeholder="Montant" value={part.amount} onChange={(e) => updateInstallment(index, partIndex, { amount: Number(e.target.value) })}/><input className={field} type="date" value={part.due_date ?? ""} onChange={(e) => updateInstallment(index, partIndex, { due_date: e.target.value || null })}/><button type="button" aria-label="Supprimer la tranche" onClick={() => updateSchedule(index, { installments: schedule.installments.filter((_, i) => i !== partIndex).map((p, i) => ({ ...p, position: i })) })}><Trash2 size={14}/></button></div>)}
        {mismatch && (
          <p className="flex items-start gap-1.5 rounded-lg bg-amber-50 border border-amber-200 px-2.5 py-2 text-xs text-amber-900">
            <AlertTriangle size={13} className="shrink-0 mt-0.5" />
            Le total des tranches ({installmentsTotal(schedule.installments).toLocaleString("fr-FR")} {schedule.currency}) ne correspond pas au montant de la scolarité ({(schedule.tuition_fee ?? 0).toLocaleString("fr-FR")} {schedule.currency}).
          </p>
        )}
        <div className="flex justify-between"><button type="button" className="text-xs font-semibold text-primary" onClick={() => updateSchedule(index, { installments: [...schedule.installments, { label: "", amount: 0, due_date: null, notes: null, position: schedule.installments.length }] })}>+ Ajouter une tranche</button><button type="button" className="text-xs text-red-600" onClick={() => update({ schedules: value.schedules.filter((_, i) => i !== index).map((s, i) => ({ ...s, position: i })) })}>Supprimer le tarif</button></div>
      </div>;
      })}
    </section>
    <section className="space-y-3">
      <div className="flex items-center justify-between"><h3 className="text-sm font-bold">Autres frais</h3><button type="button" onClick={() => update({ additional_fees: [...value.additional_fees, { academic_year: "", category: "other", label: "", amount: 0, status: "mandatory", frequency: "Une fois", notes: null, position: value.additional_fees.length }] })} className="text-xs font-bold text-primary inline-flex gap-1"><Plus size={14}/>Ajouter</button></div>
      {value.additional_fees.map((fee, index) => <div key={index} className="grid grid-cols-2 gap-2 rounded-xl border border-border p-3">
        <input className={field} placeholder="Année 2026-2027" value={fee.academic_year} onChange={(e) => updateAdditional(index, { academic_year: e.target.value })}/><select className={field} value={fee.category} onChange={(e) => updateAdditional(index, { category: e.target.value as typeof fee.category })}>{ADDITIONAL_FEE_CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select>
        <input className={field} placeholder="Libellé" value={fee.label} onChange={(e) => updateAdditional(index, { label: e.target.value })}/>
        <select
          className={field}
          value={fee.status}
          onChange={(e) => {
            const status = e.target.value as AdditionalFeeStatus;
            updateAdditional(index, status === "contact" ? { status, amount: null } : { status, amount: fee.amount ?? 0 });
          }}
        >
          {ADDITIONAL_FEE_STATUSES.map((status) => <option key={status} value={status}>{STATUS_LABELS[status]}</option>)}
        </select>
        {fee.status === "contact" ? (
          <p className="col-span-2 rounded-lg bg-muted px-3 py-2 text-xs text-text-secondary">Montant non renseigné — affiché publiquement comme « Nous contacter ».</p>
        ) : (
          <input className={field} type="number" min={0} placeholder="Montant" value={fee.amount ?? ""} onChange={(e) => updateAdditional(index, { amount: asAmount(e.target.value) })}/>
        )}
        <input className={field} placeholder="Fréquence / périodicité (ex. par mois)" value={fee.frequency} onChange={(e) => updateAdditional(index, { frequency: e.target.value })}/>
        <button type="button" className="col-span-2 text-right text-xs text-red-600" onClick={() => update({ additional_fees: value.additional_fees.filter((_, i) => i !== index).map((f, i) => ({ ...f, position: i })) })}>Supprimer</button>
      </div>)}
    </section>
  </div>;

  function updateSchedule(index: number, patch: Partial<SchoolPagePricing["schedules"][number]>) {
    update({ schedules: value.schedules.map((schedule, i) => i === index ? { ...schedule, ...patch } : schedule) });
  }
  function updateInstallment(scheduleIndex: number, index: number, patch: Partial<SchoolPagePricing["schedules"][number]["installments"][number]>) {
    const schedule = value.schedules[scheduleIndex];
    updateSchedule(scheduleIndex, { installments: schedule.installments.map((part, i) => i === index ? { ...part, ...patch } : part) });
  }
  function updateAdditional(index: number, patch: Partial<SchoolPagePricing["additional_fees"][number]>) {
    update({ additional_fees: value.additional_fees.map((fee, i) => i === index ? { ...fee, ...patch } : fee) });
  }
}
