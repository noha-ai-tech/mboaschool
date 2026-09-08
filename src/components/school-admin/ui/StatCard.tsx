import type { ReactNode } from "react";

type StatTone = "primary" | "warning" | "neutral";

const TONE_CLASSES: Record<StatTone, string> = {
  primary:
    "bg-[var(--school-admin-primary-soft)] text-[var(--school-admin-primary)]",
  warning:
    "bg-[var(--school-admin-warning-soft)] text-[var(--school-admin-warning-text)]",
  neutral:
    "bg-[var(--school-admin-surface-muted)] text-[var(--school-admin-text-muted)]",
};

type SchoolAdminStatCardProps = {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  detail?: ReactNode;
  tone?: StatTone;
};

export function SchoolAdminStatCard({
  label,
  value,
  icon,
  detail,
  tone = "primary",
}: SchoolAdminStatCardProps) {
  return (
    <div className="rounded-[var(--school-admin-radius-card)] border border-[var(--school-admin-border)] bg-[var(--school-admin-surface)] p-5 shadow-[var(--school-admin-shadow-sm)]">
      <div className="flex items-start gap-4">
        {icon ? (
          <div
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${TONE_CLASSES[tone]}`}
            aria-hidden="true"
          >
            {icon}
          </div>
        ) : null}
        <div className="min-w-0">
          <p className="text-2xl font-extrabold tabular-nums text-[var(--school-admin-text)]">
            {value}
          </p>
          <p className="mt-0.5 text-sm font-medium text-[var(--school-admin-text-muted)]">
            {label}
          </p>
          {detail ? (
            <div className="mt-2 text-xs text-[var(--school-admin-text-soft)]">
              {detail}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
