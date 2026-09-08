import type { HTMLAttributes, ReactNode } from "react";

type SchoolAdminFilterBarProps = HTMLAttributes<HTMLDivElement> & {
  actions?: ReactNode;
};

export function SchoolAdminFilterBar({
  actions,
  className = "",
  children,
  ...props
}: SchoolAdminFilterBarProps) {
  return (
    <div
      className={`flex flex-col gap-3 rounded-[var(--school-admin-radius-card)] border border-[var(--school-admin-border)] bg-[var(--school-admin-surface)] p-3 shadow-[var(--school-admin-shadow-sm)] md:flex-row md:items-center md:justify-between ${className}`}
      {...props}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        {children}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}
