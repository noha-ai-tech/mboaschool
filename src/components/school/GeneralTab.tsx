import type { ElementType } from "react";
import {
  BookOpen,
  FlaskConical,
  Monitor,
  Dumbbell,
  Utensils,
  BedDouble,
  Bus,
  ShieldCheck,
  Wifi,
  HeartPulse,
} from "lucide-react";

// Correspond aux colonnes réelles de la table infrastructures
export const INFRA_LABELS: Record<string, { label: string; icon: ElementType }> = {
  library:      { label: "Bibliothèque",      icon: BookOpen },
  laboratory:   { label: "Laboratoire",       icon: FlaskConical },
  computer_room:{ label: "Salle informatique",icon: Monitor },
  sports_field: { label: "Terrain de sport",  icon: Dumbbell },
  canteen:      { label: "Cantine scolaire",  icon: Utensils },
  boarding:     { label: "Internat",          icon: BedDouble },
  transport:    { label: "Transport scolaire",icon: Bus },
  security:     { label: "Sécurité",          icon: ShieldCheck },
  wifi:         { label: "Connexion Wi-Fi",   icon: Wifi },
  infirmary:    { label: "Infirmerie",        icon: HeartPulse },
};

// Frais fixes de la table fees (une ligne par école)
export const FEE_COLS: { key: string; label: string }[] = [
  { key: "registration_fee", label: "Inscription" },
  { key: "tuition_fee",      label: "Scolarité" },
  { key: "transport_fee",    label: "Transport" },
  { key: "canteen_fee",      label: "Cantine" },
  { key: "uniform_fee",      label: "Uniforme" },
  { key: "exam_fee",         label: "Examens" },
  { key: "other_fees",       label: "Autres frais" },
];

type SchoolGeneralInfo = {
  description: string | null;
  main_category: string | null;
  city: string | null;
  neighborhood: string | null;
  phone: string | null;
};

type SchoolFees = {
  currency?: string | null;
  [key: string]: string | number | null | undefined;
};

type SchoolInfrastructures = Record<string, boolean | null>;

export function GeneralTab({ school, fees, infra, sections }: {
  school: SchoolGeneralInfo;
  fees: SchoolFees | null;
  infra: SchoolInfrastructures | null;
  /** Isole un ou plusieurs blocs (éditeur CMS) — tous affichés par défaut, comme sur la fiche publique. */
  sections?: { presentation?: boolean; tarifs?: boolean; infrastructures?: boolean };
}) {
  const showPresentation = sections?.presentation ?? true;
  const showTarifs = sections?.tarifs ?? true;
  const showInfrastructures = sections?.infrastructures ?? true;

  const infraItems = Object.keys(INFRA_LABELS).filter((k) => infra?.[k] === true);
  const feeRows = fees
    ? FEE_COLS.filter((f) => fees[f.key] && Number(fees[f.key]) > 0)
    : [];
  const currency = fees?.currency ?? "FCFA";

  return (
    <div className="space-y-5">
      {showPresentation && (
      <div id="presentation" className="bg-white border border-border rounded-card p-6 scroll-mt-20">
        <h2 className="font-bold text-sm mb-4">Présentation</h2>
        <p className="text-text-secondary text-sm leading-relaxed">
          {school.description || "Aucune description disponible pour le moment."}
        </p>
        <div className="grid sm:grid-cols-2 gap-3 mt-6">
          {[
            { label: "Catégorie", value: school.main_category },
            { label: "Ville",     value: school.city },
            { label: "Quartier",  value: school.neighborhood },
            { label: "Téléphone", value: school.phone },
          ].filter((r) => r.value).map((row) => (
            <div key={row.label} className="bg-muted rounded-xl p-4">
              <p className="text-[10px] font-semibold text-text-secondary uppercase tracking-wider">{row.label}</p>
              <p className="font-bold text-text-primary mt-1 text-sm">{row.value}</p>
            </div>
          ))}
        </div>
      </div>
      )}

      {showTarifs && (
      <div id="tarifs" className="bg-white border border-border rounded-card p-6 scroll-mt-20">
        <h2 className="font-bold text-sm mb-4">Tarifs</h2>
        {feeRows.length === 0 ? (
          <p className="text-sm text-text-secondary">Tarifs non renseignés par l&apos;établissement.</p>
        ) : (
          <div className="divide-y divide-border">
            {feeRows.map((f) => (
              <div key={f.key} className="flex items-center justify-between py-3">
                <span className="text-sm text-text-secondary">{f.label}</span>
                <span className="text-sm font-bold text-text-primary">
                  {Number(fees![f.key]).toLocaleString("fr-FR")} {currency}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
      )}

      {showInfrastructures && (
      <div id="infrastructures" className="bg-white border border-border rounded-card p-6 scroll-mt-20">
        <h2 className="font-bold text-sm mb-4">Infrastructures</h2>
        {infraItems.length === 0 ? (
          <p className="text-sm text-text-secondary">Infrastructures non renseignées par l&apos;établissement.</p>
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">
            {infraItems.map((key) => {
              const item = INFRA_LABELS[key];
              const Icon = item.icon;
              return (
                <div key={key} className="flex items-center gap-3 bg-muted rounded-xl p-3">
                  <Icon size={15} className="text-primary shrink-0" />
                  <span className="text-sm font-semibold text-text-primary">{item.label}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
      )}
    </div>
  );
}
