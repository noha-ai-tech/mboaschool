import { ChevronDown } from "lucide-react";
import { FEE_COLS, feeScheduleTotal, type SchoolPagePricing } from "@/lib/schoolPage/pricing";

const CATEGORY_LABELS: Record<string, string> = {
  application: "Frais de dossier / candidature",
  uniform: "Uniforme", sports_uniform: "Tenue de sport", badge: "Badge / carte",
  supplies: "Fournitures", insurance: "Assurance", ape_parent_contribution: "Contribution APE",
  exam: "Examens", activity: "Activités", transport: "Transport", canteen: "Cantine",
  boarding: "Internat", other: "Autre",
};

function money(value: number | null, currency: string) {
  return value === null ? "—" : `${value.toLocaleString("fr-FR")} ${currency}`;
}

export function hasDisplayablePricing(pricing: SchoolPagePricing | null, mode: "public" | "admin" = "public") {
  if (!pricing) return false;
  if (pricing.schedules.length > 0 || pricing.additional_fees.length > 0) return true;
  const hasLegacy = FEE_COLS.some(({ key }) => (pricing[key] ?? 0) > 0);
  return hasLegacy && (pricing.legacy_amounts_qualified || mode === "admin");
}

export function StructuredPricing({ pricing, mode = "public" }: { pricing: SchoolPagePricing; mode?: "public" | "admin" }) {
  const legacyRows = FEE_COLS.filter(({ key }) => (pricing[key] ?? 0) > 0);

  return (
    <div id="tarifs" className="bg-white border border-border rounded-card p-4 sm:p-6 scroll-mt-20 min-w-0 overflow-hidden">
      <h2 className="font-bold text-sm mb-4">Tarifs</h2>

      {pricing.schedules.length > 0 && (
        <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
          <table className="w-full min-w-[560px] text-sm">
            <thead><tr className="border-b border-border text-left text-xs text-text-secondary">
              <th className="py-2 pr-3">Niveau / classe</th><th className="py-2 px-3">Inscription</th>
              <th className="py-2 px-3">Scolarité</th><th className="py-2 pl-3 text-right">Total</th>
            </tr></thead>
            <tbody>{pricing.schedules.map((schedule) => (
              <tr key={`${schedule.academic_year}-${schedule.position}`} className="border-b border-border/70 last:border-0">
                <td className="py-3 pr-3 font-semibold"><span className="block">{schedule.level_label}</span><span className="text-[11px] font-normal text-text-secondary">{schedule.academic_year}</span></td>
                <td className="py-3 px-3 whitespace-nowrap">{money(schedule.registration_fee, schedule.currency)}</td>
                <td className="py-3 px-3 whitespace-nowrap">{money(schedule.tuition_fee, schedule.currency)}</td>
                <td className="py-3 pl-3 text-right font-bold whitespace-nowrap">{money(feeScheduleTotal(schedule), schedule.currency)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      {pricing.schedules.some((schedule) => schedule.notes) && (
        <div className="mt-3 space-y-1">
          {pricing.schedules.filter((schedule) => schedule.notes).map((schedule) => (
            <p key={`schedule-note-${schedule.academic_year}-${schedule.position}`} className="text-xs text-text-secondary italic">
              {schedule.notes}
            </p>
          ))}
        </div>
      )}

      <div className="space-y-2 mt-4">
        {pricing.schedules.filter((schedule) => schedule.installments.length > 0).map((schedule) => (
          <details key={`installments-${schedule.academic_year}-${schedule.position}`} className="border border-border rounded-xl p-3 group">
            <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-semibold">
              Modalités — {schedule.level_label}<ChevronDown size={14} className="group-open:rotate-180 transition-transform" />
            </summary>
            <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[460px] text-xs">
              <thead><tr className="text-left text-text-secondary"><th className="pb-2">Tranche</th><th className="pb-2">Montant</th><th className="pb-2">Échéance</th><th className="pb-2">Notes</th></tr></thead>
              <tbody>{schedule.installments.map((part) => <tr key={part.position} className="border-t border-border/60">
                <td className="py-2 font-semibold">{part.label}</td><td className="py-2 whitespace-nowrap">{money(part.amount, schedule.currency)}</td>
                <td className="py-2 whitespace-nowrap">{part.due_date ? new Date(`${part.due_date}T00:00:00`).toLocaleDateString("fr-FR") : "—"}</td><td className="py-2">{part.notes ?? "—"}</td>
              </tr>)}</tbody>
            </table></div>
          </details>
        ))}
      </div>

      {pricing.additional_fees.length > 0 && <div className="mt-6">
        <h3 className="text-xs font-bold tracking-wider uppercase mb-3">Autres frais</h3>
        <div className="space-y-2">{pricing.additional_fees.map((fee) => <div key={`${fee.academic_year}-${fee.position}`} className="grid gap-1 sm:grid-cols-[1fr_auto_auto] sm:items-center bg-muted rounded-xl p-3 text-sm">
          <div><p className="font-semibold">{fee.label}</p><p className="text-xs text-text-secondary">{CATEGORY_LABELS[fee.category] ?? fee.category} · {fee.frequency}{fee.notes ? ` · ${fee.notes}` : ""}</p></div>
          <span className="font-bold whitespace-nowrap">{money(fee.amount, pricing.currency)}</span>
          <span className={`text-[11px] font-semibold px-2 py-1 rounded-full w-fit ${fee.mandatory ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}>{fee.mandatory ? "Obligatoire" : "Facultatif"}</span>
        </div>)}</div>
      </div>}

      {pricing.schedules.length === 0 && pricing.additional_fees.length === 0 && legacyRows.length > 0 && pricing.legacy_amounts_qualified && (
        <div className="divide-y divide-border">{legacyRows.map((fee) => <div key={fee.key} className="flex justify-between py-3 text-sm"><span className="text-text-secondary">{fee.label}</span><strong>{money(pricing[fee.key], pricing.currency)}</strong></div>)}</div>
      )}
      {pricing.schedules.length === 0 && pricing.additional_fees.length === 0 && legacyRows.length > 0 && !pricing.legacy_amounts_qualified && mode === "admin" && (
        <div className="space-y-2">{legacyRows.map((fee) => <p key={fee.key} className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-sm font-semibold text-amber-900">Montant existant à qualifier — {money(pricing[fee.key], pricing.currency)}</p>)}</div>
      )}
      {!hasDisplayablePricing(pricing, mode) && <p className="text-sm text-text-secondary">Tarifs non renseignés par l&apos;établissement.</p>}
    </div>
  );
}
