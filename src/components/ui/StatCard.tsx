import type { ReactNode } from "react";

// Design System V2 — docs/03_DESIGN_SYSTEM/04_COMPONENTS.md §StatCard
export function StatCard({
  icon: Icon,
  label,
  value,
  trend,
}: {
  icon: React.ElementType;
  label: string;
  value: ReactNode;
  trend?: { value: string; positive: boolean };
}) {
  return (
    <div className="bg-surface border border-border rounded-card p-5">
      <div className="w-8 h-8 rounded-lg bg-primary-light flex items-center justify-center mb-3">
        <Icon size={16} className="text-primary" />
      </div>
      <p className="text-2xl font-extrabold text-text-primary tabular-nums">{value}</p>
      <div className="flex items-center gap-2 mt-1">
        <p className="text-xs text-text-secondary font-medium">{label}</p>
        {trend && (
          <span className={`text-[11px] font-bold ${trend.positive ? "text-primary" : "text-danger"}`}>
            {trend.positive ? "↑" : "↓"} {trend.value}
          </span>
        )}
      </div>
    </div>
  );
}
