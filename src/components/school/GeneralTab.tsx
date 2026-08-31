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
import { INFRASTRUCTURE_KEYS, INFRASTRUCTURE_LABELS, type InfrastructureKey } from "@/lib/schoolPage/infrastructure";
import { FEE_COLS as FEE_COLS_SHARED, type SchoolPagePricing } from "@/lib/schoolPage/pricing";
import { StructuredPricing } from "@/components/school/StructuredPricing";

// CMS-F.3 — les clés et libellés viennent désormais de
// src/lib/schoolPage/infrastructure.ts (source unique, réutilisée aussi par
// les routes API) ; seules les icônes, un détail purement visuel, restent
// déclarées ici.
const INFRA_ICONS: Record<InfrastructureKey, ElementType> = {
  library: BookOpen,
  laboratory: FlaskConical,
  computer_room: Monitor,
  sports_field: Dumbbell,
  canteen: Utensils,
  boarding: BedDouble,
  transport: Bus,
  security: ShieldCheck,
  wifi: Wifi,
  infirmary: HeartPulse,
};

export const INFRA_LABELS: Record<string, { label: string; icon: ElementType }> = Object.fromEntries(
  INFRASTRUCTURE_KEYS.map((key) => [key, { label: INFRASTRUCTURE_LABELS[key], icon: INFRA_ICONS[key] }])
);

// CMS-F.3 — réexporté depuis src/lib/schoolPage/pricing.ts (source unique,
// réutilisée aussi par les routes API) ; valeurs et libellés inchangés.
export const FEE_COLS: { key: string; label: string }[] = FEE_COLS_SHARED;

type SchoolGeneralInfo = {
  description: string | null;
  main_category: string | null;
  city: string | null;
  neighborhood: string | null;
  phone: string | null;
};

type SchoolInfrastructures = Record<string, boolean | null>;

export function GeneralTab({ school, fees, infra, sections, pricingMode = "public" }: {
  school: SchoolGeneralInfo;
  fees: SchoolPagePricing | null;
  infra: SchoolInfrastructures | null;
  pricingMode?: "public" | "admin";
  /** Isole un ou plusieurs blocs (éditeur CMS) — tous affichés par défaut, comme sur la fiche publique. */
  sections?: { presentation?: boolean; tarifs?: boolean; infrastructures?: boolean };
}) {
  const showPresentation = sections?.presentation ?? true;
  const showTarifs = sections?.tarifs ?? true;
  const showInfrastructures = sections?.infrastructures ?? true;

  const infraItems = Object.keys(INFRA_LABELS).filter((k) => infra?.[k] === true);
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
      fees ? <StructuredPricing pricing={fees} mode={pricingMode} /> : (
        <div id="tarifs" className="bg-white border border-border rounded-card p-6 scroll-mt-20">
          <h2 className="font-bold text-sm mb-4">Tarifs</h2>
          <p className="text-sm text-text-secondary">Tarifs non renseignés par l&apos;établissement.</p>
        </div>
      )
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
