import type { LucideIcon } from "lucide-react";

// Carte KPI de la section Statistiques — icône discrète (un seul ton,
// jamais "grosse" ni multicolore), nombre, titre, description courte.
export function StatCard({
  icon: Icon,
  value,
  label,
  description,
}: {
  icon: LucideIcon;
  value: string;
  label: string;
  description: string;
}) {
  return (
    <div className="bg-white border border-border rounded-[20px] p-5 hover:-translate-y-0.5 transition-transform duration-base">
      <div className="w-9 h-9 rounded-full bg-primary-light flex items-center justify-center mb-3">
        <Icon size={16} className="text-primary" />
      </div>
      <p className="text-2xl font-black tracking-tight text-text-primary tabular-nums">{value}</p>
      <p className="text-sm font-semibold text-text-primary mt-1">{label}</p>
      <p className="text-xs text-text-secondary mt-0.5 leading-relaxed">{description}</p>
    </div>
  );
}
