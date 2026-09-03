// CMS-F.3 — source unique des 7 clés de tarifs (table `fees`, une ligne par
// établissement). Déplacé depuis src/components/school/GeneralTab.tsx (un
// composant React) pour que les routes API (server-only) n'aient plus
// jamais besoin d'importer un fichier .tsx — GeneralTab.tsx réexporte
// désormais FEE_COLS depuis ce module au lieu de le déclarer localement,
// aucune valeur ni aucun libellé n'a changé.
export type FeeKey =
  | "registration_fee"
  | "tuition_fee"
  | "transport_fee"
  | "canteen_fee"
  | "uniform_fee"
  | "exam_fee"
  | "other_fees";

export const FEE_COLS: { key: FeeKey; label: string }[] = [
  { key: "registration_fee", label: "Inscription" },
  { key: "tuition_fee",      label: "Scolarité" },
  { key: "transport_fee",    label: "Transport" },
  { key: "canteen_fee",      label: "Cantine" },
  { key: "uniform_fee",      label: "Uniforme" },
  { key: "exam_fee",         label: "Examens" },
  { key: "other_fees",       label: "Autres frais" },
];

export const FEE_KEYS: FeeKey[] = FEE_COLS.map((f) => f.key);

export const ADDITIONAL_FEE_CATEGORIES = [
  "application",
  "uniform",
  "sports_uniform",
  "badge",
  "supplies",
  "insurance",
  "ape_parent_contribution",
  "exam",
  "activity",
  "transport",
  "canteen",
  "boarding",
  "other",
] as const;

export type AdditionalFeeCategory = (typeof ADDITIONAL_FEE_CATEGORIES)[number];

export type SchoolFeeInstallment = {
  label: string;
  position: number;
  amount: number;
  due_date: string | null;
  notes: string | null;
};

export type SchoolFeeSchedule = {
  academic_year: string;
  /** PRICING-01 — optional free-text cycle grouping (e.g. "Maternelle"). Never a fixed enum — every school system differs. */
  cycle: string | null;
  level_label: string;
  registration_fee: number | null;
  tuition_fee: number | null;
  currency: string;
  notes: string | null;
  position: number;
  installments: SchoolFeeInstallment[];
};

// PRICING-01 §10 — replaces the old boolean `mandatory`: "included" (covered
// by tuition, no separate charge — never a fake 0 FCFA) and "contact"
// (amount genuinely unpublished) are now expressible without lying.
export const ADDITIONAL_FEE_STATUSES = ["mandatory", "optional", "included", "contact"] as const;
export type AdditionalFeeStatus = (typeof ADDITIONAL_FEE_STATUSES)[number];

export type SchoolAdditionalFee = {
  academic_year: string;
  category: AdditionalFeeCategory;
  label: string;
  /** null only when status === "contact". */
  amount: number | null;
  status: AdditionalFeeStatus;
  frequency: string;
  notes: string | null;
  position: number;
};

export type SchoolPagePricing = Record<FeeKey, number | null> & {
  currency: string;
  legacy_amounts_qualified: boolean;
  schedules: SchoolFeeSchedule[];
  additional_fees: SchoolAdditionalFee[];
};

export type PricingResult =
  | { ok: true; value: SchoolPagePricing }
  | { ok: false; error: string };

const ACADEMIC_YEAR = /^\d{4}-\d{4}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_AMOUNT = 2_000_000_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nullableAmount(value: unknown, label: string): string | null {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > MAX_AMOUNT) {
    return `${label} doit être un entier positif ou null`;
  }
  return null;
}

function requiredAmount(value: unknown, label: string): string | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > MAX_AMOUNT) {
    return `${label} doit être un entier positif`;
  }
  return null;
}

function requiredText(value: unknown, label: string, max = 160): string | null {
  if (typeof value !== "string" || value.trim() === "" || value.length > max || /[<>]/.test(value)) {
    return `${label} est invalide`;
  }
  return null;
}

function nullableText(value: unknown, label: string, max = 1000): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || value.length > max || /[<>]/.test(value)) return `${label} est invalide`;
  return null;
}

export function normalizeSchoolPagePricing(raw: unknown): PricingResult {
  if (!isRecord(raw)) return { ok: false, error: "pricing doit être un objet" };
  const value = structuredClone(raw) as Record<string, unknown>;

  for (const key of FEE_KEYS) {
    // Legacy drafts may contain only the fee fields that existed when they
    // were saved. Missing flat keys mean "not renseigné", never zero.
    if (!(key in value)) value[key] = null;
    const error = nullableAmount(value[key], `pricing.${key}`);
    if (error) return { ok: false, error };
  }
  if (!("currency" in value)) value.currency = "FCFA";
  if (!("legacy_amounts_qualified" in value)) value.legacy_amounts_qualified = false;
  if (!("schedules" in value)) value.schedules = [];
  if (!("additional_fees" in value)) value.additional_fees = [];

  if (requiredText(value.currency, "pricing.currency", 8)) return { ok: false, error: "pricing.currency est invalide" };
  if (typeof value.legacy_amounts_qualified !== "boolean") {
    return { ok: false, error: "pricing.legacy_amounts_qualified doit être booléen" };
  }
  if (!Array.isArray(value.schedules) || value.schedules.length > 100) {
    return { ok: false, error: "pricing.schedules doit être une liste de 100 éléments maximum" };
  }
  if (!Array.isArray(value.additional_fees) || value.additional_fees.length > 200) {
    return { ok: false, error: "pricing.additional_fees doit être une liste de 200 éléments maximum" };
  }

  const schedulePositions = new Set<number>();
  for (let index = 0; index < value.schedules.length; index += 1) {
    const schedule = value.schedules[index];
    if (!isRecord(schedule)) return { ok: false, error: `pricing.schedules[${index}] doit être un objet` };
    if (typeof schedule.academic_year !== "string" || !ACADEMIC_YEAR.test(schedule.academic_year)) {
      return { ok: false, error: `pricing.schedules[${index}].academic_year doit suivre AAAA-AAAA` };
    }
    const yearStart = Number(schedule.academic_year.slice(0, 4));
    const yearEnd = Number(schedule.academic_year.slice(5));
    if (yearEnd !== yearStart + 1) return { ok: false, error: `pricing.schedules[${index}].academic_year est incohérente` };
    for (const [field, max] of [["level_label", 120], ["currency", 8]] as const) {
      const error = requiredText(schedule[field], `pricing.schedules[${index}].${field}`, max);
      if (error) return { ok: false, error };
    }
    if (!("cycle" in schedule)) schedule.cycle = null;
    const cycleError = nullableText(schedule.cycle, `pricing.schedules[${index}].cycle`, 60);
    if (cycleError) return { ok: false, error: cycleError };
    for (const field of ["registration_fee", "tuition_fee"] as const) {
      const error = nullableAmount(schedule[field], `pricing.schedules[${index}].${field}`);
      if (error) return { ok: false, error };
    }
    const notesError = nullableText(schedule.notes, `pricing.schedules[${index}].notes`);
    if (notesError) return { ok: false, error: notesError };
    if (typeof schedule.position !== "number" || !Number.isInteger(schedule.position) || schedule.position < 0 || schedulePositions.has(schedule.position)) {
      return { ok: false, error: `pricing.schedules[${index}].position est invalide ou dupliquée` };
    }
    schedulePositions.add(schedule.position);
    if (!Array.isArray(schedule.installments) || schedule.installments.length > 24) {
      return { ok: false, error: `pricing.schedules[${index}].installments doit être une liste de 24 éléments maximum` };
    }
    const installmentPositions = new Set<number>();
    for (let installmentIndex = 0; installmentIndex < schedule.installments.length; installmentIndex += 1) {
      const installment = schedule.installments[installmentIndex];
      if (!isRecord(installment)) return { ok: false, error: "Chaque tranche doit être un objet" };
      const prefix = `pricing.schedules[${index}].installments[${installmentIndex}]`;
      const labelError = requiredText(installment.label, `${prefix}.label`, 120);
      if (labelError) return { ok: false, error: labelError };
      const amountError = requiredAmount(installment.amount, `${prefix}.amount`);
      if (amountError) return { ok: false, error: amountError };
      if (installment.due_date !== null && (typeof installment.due_date !== "string" || !ISO_DATE.test(installment.due_date))) {
        return { ok: false, error: `${prefix}.due_date est invalide` };
      }
      const installmentNotesError = nullableText(installment.notes, `${prefix}.notes`);
      if (installmentNotesError) return { ok: false, error: installmentNotesError };
      if (typeof installment.position !== "number" || !Number.isInteger(installment.position) || installment.position < 0 || installmentPositions.has(installment.position)) {
        return { ok: false, error: `${prefix}.position est invalide ou dupliquée` };
      }
      installmentPositions.add(installment.position);
    }
  }

  const additionalPositions = new Set<number>();
  for (let index = 0; index < value.additional_fees.length; index += 1) {
    const fee = value.additional_fees[index];
    if (!isRecord(fee)) return { ok: false, error: `pricing.additional_fees[${index}] doit être un objet` };
    const prefix = `pricing.additional_fees[${index}]`;
    if (typeof fee.academic_year !== "string" || !ACADEMIC_YEAR.test(fee.academic_year)) return { ok: false, error: `${prefix}.academic_year est invalide` };
    if (Number(fee.academic_year.slice(5)) !== Number(fee.academic_year.slice(0, 4)) + 1) return { ok: false, error: `${prefix}.academic_year est incohérente` };
    if (typeof fee.category !== "string" || !ADDITIONAL_FEE_CATEGORIES.includes(fee.category as AdditionalFeeCategory)) return { ok: false, error: `${prefix}.category est invalide` };
    for (const [field, max] of [["label", 160], ["frequency", 80]] as const) {
      const error = requiredText(fee[field], `${prefix}.${field}`, max);
      if (error) return { ok: false, error };
    }
    if (typeof fee.status !== "string" || !ADDITIONAL_FEE_STATUSES.includes(fee.status as AdditionalFeeStatus)) {
      return { ok: false, error: `${prefix}.status est invalide` };
    }
    if (fee.status === "contact") {
      if (fee.amount !== null) return { ok: false, error: `${prefix}.amount doit être null quand status = "contact"` };
    } else {
      const amountError = requiredAmount(fee.amount, `${prefix}.amount`);
      if (amountError) return { ok: false, error: amountError };
    }
    const notesError = nullableText(fee.notes, `${prefix}.notes`);
    if (notesError) return { ok: false, error: notesError };
    if (typeof fee.position !== "number" || !Number.isInteger(fee.position) || fee.position < 0 || additionalPositions.has(fee.position)) {
      return { ok: false, error: `${prefix}.position est invalide ou dupliquée` };
    }
    additionalPositions.add(fee.position);
  }

  return { ok: true, value: value as SchoolPagePricing };
}

export function feeScheduleTotal(schedule: Pick<SchoolFeeSchedule, "registration_fee" | "tuition_fee">): number {
  return (schedule.registration_fee ?? 0) + (schedule.tuition_fee ?? 0);
}

export function installmentsTotal(installments: Pick<SchoolFeeInstallment, "amount">[]): number {
  return installments.reduce((sum, i) => sum + i.amount, 0);
}

// PRICING-01 §6 — "warn strongly but do not block": the CMS editor calls
// this to show a non-blocking warning when a schedule's installments don't
// sum to its tuition_fee. Publish is never blocked by this — a mismatch
// might be intentional (e.g. a discount applied only at the installment
// level) and the system must never silently "correct" the school's numbers.
export function installmentsMismatchTuition(schedule: Pick<SchoolFeeSchedule, "tuition_fee" | "installments">): boolean {
  if (schedule.tuition_fee === null || schedule.installments.length === 0) return false;
  return installmentsTotal(schedule.installments) !== schedule.tuition_fee;
}
