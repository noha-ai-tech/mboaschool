"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Download } from "lucide-react";
import { FEE_COLS, feeScheduleTotal, type AdditionalFeeStatus, type SchoolAdditionalFee, type SchoolFeeSchedule, type SchoolPagePricing } from "@/lib/schoolPage/pricing";
import { getPublishedDocumentCtas, type SchoolDocument } from "@/lib/schoolPage/documents";

const CATEGORY_LABELS: Record<string, string> = {
  application: "Frais de dossier / candidature",
  uniform: "Uniforme", sports_uniform: "Tenue de sport", badge: "Badge / carte",
  supplies: "Fournitures", insurance: "Assurance", ape_parent_contribution: "Contribution APE",
  exam: "Examens", activity: "Activités", transport: "Transport", canteen: "Cantine",
  boarding: "Internat", other: "Autre",
};

const STATUS_BADGE: Record<AdditionalFeeStatus, { label: string; className: string }> = {
  mandatory: { label: "Obligatoire", className: "bg-amber-100 text-amber-800" },
  optional: { label: "Optionnel", className: "bg-emerald-100 text-emerald-800" },
  included: { label: "Inclus", className: "bg-blue-100 text-blue-800" },
  contact: { label: "Nous contacter", className: "bg-white text-slate-700 ring-1 ring-inset ring-slate-300" },
};

function money(value: number | null, currency: string) {
  return value === null ? "—" : `${value.toLocaleString("fr-FR")} ${currency}`;
}
// PRICING-01 §10 — the status badge alone communicates "included"/"contact";
// the amount slot never repeats "Nous contacter" nor shows a misleading
// 0 FCFA for a covered service.
function amountOrContact(fee: Pick<SchoolAdditionalFee, "amount" | "status" | "frequency">, currency: string) {
  if (fee.status === "contact" || fee.status === "included") return null;
  return `${money(fee.amount, currency)}${fee.frequency ? ` / ${fee.frequency}` : ""}`;
}

export function hasDisplayablePricing(pricing: SchoolPagePricing | null, mode: "public" | "admin" = "public") {
  if (!pricing) return false;
  if (pricing.schedules.length > 0 || pricing.additional_fees.length > 0) return true;
  const hasLegacy = FEE_COLS.some(({ key }) => (pricing[key] ?? 0) > 0);
  return hasLegacy && (pricing.legacy_amounts_qualified || mode === "admin");
}

// PRICING-01 — generic Écoles237 dynamic fee matrix. Columns/sections are
// entirely derived from whatever the establishment actually published:
// no registration column when no schedule has one, N installment columns
// when N installments exist (never assumed to be 3), no canteen/transport
// section when no such fee exists. Transport (possibly several zones) and
// canteen render as their own labeled sub-sections rather than crowding
// the main matrix, per the mission's explicit "keep the main matrix
// readable" direction — each is just school_additional_fees rows grouped
// by category (0037's existing model, unextended for this).
export function StructuredPricing({ pricing, mode = "public", documents }: { pricing: SchoolPagePricing; mode?: "public" | "admin"; documents?: SchoolDocument[] }) {
  const legacyRows = FEE_COLS.filter(({ key }) => (pricing[key] ?? 0) > 0);

  const years = useMemo(
    () => Array.from(new Set(pricing.schedules.map((s) => s.academic_year))).sort().reverse(),
    [pricing.schedules]
  );
  const [selectedYear, setSelectedYear] = useState<string | null>(null);
  const activeYear = selectedYear ?? years[0] ?? null;

  const yearSchedules = useMemo(
    () => pricing.schedules.filter((s) => s.academic_year === activeYear).sort((a, b) => a.position - b.position),
    [pricing.schedules, activeYear]
  );
  const yearFees = useMemo(
    () => pricing.additional_fees.filter((f) => f.academic_year === activeYear).sort((a, b) => a.position - b.position),
    [pricing.additional_fees, activeYear]
  );

  const cycles = useMemo(() => Array.from(new Set(yearSchedules.map((s) => s.cycle).filter((c): c is string => !!c))), [yearSchedules]);
  const [selectedCycle, setSelectedCycle] = useState<string | "all">("all");
  const visibleSchedules = selectedCycle === "all" ? yearSchedules : yearSchedules.filter((s) => s.cycle === selectedCycle);

  // PRICING-01 §3 — columns are dynamic PER cycle group, not globally: a
  // Maternelle table with 3 tranches never grows 5 empty "—" columns just
  // because a different cycle (e.g. Secondaire) happens to have 5.
  const groups = useMemo(() => {
    const raw = cycles.length === 0
      ? [{ cycle: null as string | null, schedules: visibleSchedules }]
      : Array.from(
          visibleSchedules.reduce((byCycle, s) => {
            const key = s.cycle ?? null;
            byCycle.set(key, [...(byCycle.get(key) ?? []), s]);
            return byCycle;
          }, new Map<string | null, SchoolFeeSchedule[]>())
        ).map(([cycle, schedules]) => ({ cycle, schedules }));
    return raw.map((group) => ({
      ...group,
      hasRegistration: group.schedules.some((s) => s.registration_fee !== null),
      maxInstallments: Math.max(0, ...group.schedules.map((s) => s.installments.length)),
    }));
  }, [cycles, visibleSchedules]);

  const canteenFees = yearFees.filter((f) => f.category === "canteen");
  const transportFees = yearFees.filter((f) => f.category === "transport");
  const otherFees = yearFees.filter((f) => f.category !== "canteen" && f.category !== "transport");

  const mandatoryOther = otherFees.filter((f) => f.status === "mandatory");
  const optionalLabels = yearFees.filter((f) => f.status === "optional").map((f) => f.label);

  const tarifsDocument = documents ? getPublishedDocumentCtas(documents).find((d) => d.label.toLowerCase().includes("tarif")) : null;

  return (
    <div id="tarifs" className="bg-white border border-border rounded-card p-4 sm:p-6 scroll-mt-20 min-w-0 overflow-hidden print:border-none print:shadow-none" style={{ borderTop: "3px solid var(--school-primary, #0F2A4A)" }}>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <p className="text-[10px] font-bold tracking-widest uppercase mb-1" style={{ color: "var(--school-accent-gold, #C9A24B)" }}>Grille tarifaire</p>
          <h2 className="font-bold text-sm">Tarifs{activeYear ? ` — ${activeYear}` : ""}</h2>
        </div>
        <div className="flex items-center gap-2 print:hidden">
          {years.length > 1 && (
            <select
              aria-label="Année scolaire"
              value={activeYear ?? ""}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="text-xs font-semibold border border-border rounded-lg px-2.5 py-1.5 bg-white"
            >
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          )}
          {tarifsDocument && (
            <a href={tarifsDocument.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs font-bold hover:opacity-80 transition-opacity duration-base" style={{ color: "var(--school-primary, #0F2A4A)" }}>
              <Download size={13} /> Grille officielle
            </a>
          )}
        </div>
      </div>

      {cycles.length > 1 && (
        <div className="flex flex-wrap gap-1.5 mb-4 print:hidden">
          <button onClick={() => setSelectedCycle("all")} className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${selectedCycle === "all" ? "text-white border-transparent" : "border-border text-text-secondary"}`} style={selectedCycle === "all" ? { backgroundColor: "var(--school-primary, #0F2A4A)" } : undefined}>
            Tous les cycles
          </button>
          {cycles.map((cycle) => (
            <button key={cycle} onClick={() => setSelectedCycle(cycle)} className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${selectedCycle === cycle ? "text-white border-transparent" : "border-border text-text-secondary"}`} style={selectedCycle === cycle ? { backgroundColor: "var(--school-primary, #0F2A4A)" } : undefined}>
              {cycle}
            </button>
          ))}
        </div>
      )}

      {visibleSchedules.length > 0 && (
        <div className="space-y-6">
          {groups.map((group) => (
            <div key={group.cycle ?? "_"}>
              {group.cycle && <h3 className="text-xs font-bold tracking-wide uppercase text-text-secondary mb-2">{group.cycle}</h3>}

              {/* Desktop matrix — columns generated dynamically, never a fixed set. */}
              <div className="hidden sm:block overflow-x-auto rounded-xl border border-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-text-secondary" style={{ backgroundColor: "var(--school-muted, #F4F3EF)" }}>
                      <th className="sticky left-0 z-10 py-2.5 px-3" style={{ backgroundColor: "var(--school-muted, #F4F3EF)" }}>Niveau</th>
                      {group.hasRegistration && <th className="py-2.5 px-3">Inscription</th>}
                      {Array.from({ length: group.maxInstallments }).map((_, i) => <th key={i} className="py-2.5 px-3">{ordinalLabel(i + 1)} tranche</th>)}
                      <th className="py-2.5 px-3 text-right">Total scolarité</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.schedules.map((schedule, rowIndex) => (
                      <tr key={`${schedule.academic_year}-${schedule.position}`} className={`border-b border-border/70 last:border-0 ${rowIndex % 2 === 1 ? "bg-black/[0.015]" : ""}`}>
                        <td className="sticky left-0 z-10 py-3 px-3 font-semibold bg-white">{schedule.level_label}</td>
                        {group.hasRegistration && <td className="py-3 px-3 whitespace-nowrap">{money(schedule.registration_fee, schedule.currency)}</td>}
                        {Array.from({ length: group.maxInstallments }).map((_, i) => {
                          const part = schedule.installments[i];
                          return (
                            <td key={i} className="py-3 px-3 whitespace-nowrap">
                              {part ? (
                                <>
                                  {money(part.amount, schedule.currency)}
                                  {part.due_date && <span className="block text-[11px] text-text-secondary/70">{new Date(`${part.due_date}T00:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}</span>}
                                </>
                              ) : "—"}
                            </td>
                          );
                        })}
                        <td className="py-3 px-3 text-right font-bold whitespace-nowrap" style={{ color: "var(--school-primary, #0F2A4A)" }}>{money(feeScheduleTotal(schedule), schedule.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile — one card per level, never a shrunk table. */}
              <div className="sm:hidden space-y-3">
                {group.schedules.map((schedule) => (
                  <div key={`${schedule.academic_year}-${schedule.position}-m`} className="rounded-xl border border-border p-4">
                    <p className="font-bold text-sm mb-3">{schedule.level_label}</p>
                    <div className="space-y-1.5 text-sm">
                      {group.hasRegistration && (
                        <div className="flex justify-between"><span className="text-text-secondary">Inscription</span><span className="font-semibold">{money(schedule.registration_fee, schedule.currency)}</span></div>
                      )}
                      <div className="flex justify-between"><span className="text-text-secondary">Scolarité</span><span className="font-semibold">{money(schedule.tuition_fee, schedule.currency)}</span></div>
                    </div>
                    {schedule.installments.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-border">
                        <p className="text-[10px] font-bold tracking-widest uppercase text-text-secondary mb-2">Paiement</p>
                        <div className="space-y-1.5">
                          {schedule.installments.map((part) => (
                            <div key={part.position} className="flex justify-between text-sm">
                              <span className="text-text-secondary">{part.label}{part.due_date && <span className="block text-[11px] text-text-secondary/70">{new Date(`${part.due_date}T00:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}</span>}</span>
                              <span className="font-semibold whitespace-nowrap">{money(part.amount, schedule.currency)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="mt-3 pt-3 border-t border-border flex justify-between font-bold text-sm">
                      <span>Total scolarité</span>
                      <span style={{ color: "var(--school-primary, #0F2A4A)" }}>{money(feeScheduleTotal(schedule), schedule.currency)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {pricing.schedules.some((s) => s.notes) && (
        <div className="mt-3 space-y-1.5">
          {pricing.schedules.filter((s) => s.notes && s.academic_year === activeYear).map((s) => (
            <p key={`note-${s.academic_year}-${s.position}`} className="text-xs leading-relaxed rounded-lg px-3 py-2" style={{ backgroundColor: "var(--school-muted, #F4F3EF)", color: "var(--school-primary, #0F2A4A)" }}>
              {s.notes}
            </p>
          ))}
        </div>
      )}

      {(canteenFees.length > 0 || transportFees.length > 0 || otherFees.length > 0) && (
        <div className="mt-6 space-y-5">
          {canteenFees.length > 0 && (
            <FeeGroup title="Cantine" fees={canteenFees} currency={pricing.currency} />
          )}
          {transportFees.length > 0 && (
            <div id="transport">
              <FeeGroup title="Transport scolaire" fees={transportFees} currency={pricing.currency} />
            </div>
          )}
          {otherFees.length > 0 && (
            <div>
              <h3 className="text-xs font-bold tracking-wider uppercase mb-3">Autres frais</h3>
              <div className="space-y-2">
                {otherFees.map((fee) => (
                  <div key={`${fee.academic_year}-${fee.position}`} className="grid gap-1 sm:grid-cols-[1fr_auto_auto] sm:items-center rounded-xl p-3 text-sm" style={{ backgroundColor: "var(--school-muted, #F4F3EF)" }}>
                    <div><p className="font-semibold">{fee.label}</p><p className="text-xs text-text-secondary">{CATEGORY_LABELS[fee.category] ?? fee.category}{fee.notes ? ` · ${fee.notes}` : ""}</p></div>
                    <span className="font-bold whitespace-nowrap">{amountOrContact(fee, pricing.currency)}</span>
                    <span className={`text-[11px] font-semibold px-2 py-1 rounded-full w-fit ${STATUS_BADGE[fee.status].className}`}>{STATUS_BADGE[fee.status].label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {(mandatoryOther.length > 0 || optionalLabels.length > 0) && (
        <div className="mt-6 rounded-xl border border-border p-4 text-sm">
          {mandatoryOther.length > 0 && (
            <div className="mb-2">
              <p className="font-bold text-xs text-text-primary mb-1">Frais obligatoires supplémentaires (en plus de la scolarité)</p>
              <ul className="text-text-secondary text-xs space-y-0.5">
                {mandatoryOther.map((f) => <li key={f.label}>{f.label} — {amountOrContact(f, pricing.currency)}</li>)}
              </ul>
            </div>
          )}
          {optionalLabels.length > 0 && (
            <p className="text-xs text-text-secondary"><span className="font-bold text-text-primary">Options non incluses :</span> {optionalLabels.join(", ")}</p>
          )}
        </div>
      )}

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

function FeeGroup({ title, fees, currency }: { title: string; fees: SchoolAdditionalFee[]; currency: string }) {
  const [open, setOpen] = useState(fees.length <= 1);
  if (fees.length === 1) {
    const fee = fees[0];
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl p-3" style={{ backgroundColor: "var(--school-muted, #F4F3EF)" }}>
        <div><p className="font-semibold text-sm">{title}</p>{fee.notes && <p className="text-xs text-text-secondary">{fee.notes}</p>}</div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="font-bold text-sm whitespace-nowrap">{amountOrContact(fee, currency)}</span>
          <span className={`text-[11px] font-semibold px-2 py-1 rounded-full ${STATUS_BADGE[fee.status].className}`}>{STATUS_BADGE[fee.status].label}</span>
        </div>
      </div>
    );
  }
  const amounts = fees.filter((f) => f.status !== "contact" && f.amount !== null).map((f) => f.amount as number);
  const fromLabel = amounts.length > 0 ? `À partir de ${Math.min(...amounts).toLocaleString("fr-FR")} ${currency}` : "Voir le détail";
  return (
    <details open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)} className="rounded-xl border border-border p-3 group">
      <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-semibold">
        <span>{title} <span className="font-normal text-text-secondary">— {fromLabel}</span></span>
        <ChevronDown size={14} className="group-open:rotate-180 transition-transform shrink-0" />
      </summary>
      <div className="mt-3 space-y-2">
        {fees.map((fee) => (
          <div key={`${fee.academic_year}-${fee.position}`} className="grid gap-1 sm:grid-cols-[1fr_auto_auto] sm:items-center rounded-lg bg-white border border-border/60 p-2.5 text-sm">
            <div><p className="font-semibold">{fee.label}</p>{fee.notes && <p className="text-xs text-text-secondary">{fee.notes}</p>}</div>
            <span className="font-bold whitespace-nowrap">{amountOrContact(fee, currency)}</span>
            <span className={`text-[11px] font-semibold px-2 py-1 rounded-full w-fit ${STATUS_BADGE[fee.status].className}`}>{STATUS_BADGE[fee.status].label}</span>
          </div>
        ))}
      </div>
    </details>
  );
}

function ordinalLabel(n: number): string {
  return n === 1 ? "1re" : `${n}e`;
}
