import type { ReactNode } from "react";

export type SchoolAdminStatusTone =
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "neutral";

const TONE_CLASSES: Record<SchoolAdminStatusTone, string> = {
  success:
    "bg-[var(--school-admin-success-soft)] text-[var(--school-admin-success-text)]",
  warning:
    "bg-[var(--school-admin-warning-soft)] text-[var(--school-admin-warning-text)]",
  danger:
    "bg-[var(--school-admin-danger-soft)] text-[var(--school-admin-danger)]",
  info: "bg-[var(--school-admin-info-soft)] text-[var(--school-admin-info)]",
  neutral:
    "bg-[var(--school-admin-surface-muted)] text-[var(--school-admin-text-muted)]",
};

type SchoolAdminBadgeProps = {
  tone?: SchoolAdminStatusTone;
  className?: string;
  children: ReactNode;
};

export function SchoolAdminBadge({
  tone = "neutral",
  className = "",
  children,
}: SchoolAdminBadgeProps) {
  return (
    <span
      className={`inline-flex min-h-6 items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${TONE_CLASSES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

type SchoolAdminStatusBadgeProps = {
  label: string;
  tone?: SchoolAdminStatusTone;
  icon?: ReactNode;
};

export function SchoolAdminStatusBadge({
  label,
  tone = "neutral",
  icon,
}: SchoolAdminStatusBadgeProps) {
  return (
    <SchoolAdminBadge tone={tone}>
      {icon ? (
        <span className="mr-1.5 inline-flex" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <span>{label}</span>
    </SchoolAdminBadge>
  );
}
