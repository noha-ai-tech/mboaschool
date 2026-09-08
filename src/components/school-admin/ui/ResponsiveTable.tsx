import type { ReactNode } from "react";

type SchoolAdminResponsiveTableProps = {
  label: string;
  children: ReactNode;
  hint?: string;
  className?: string;
};

export function SchoolAdminResponsiveTable({
  label,
  children,
  hint = "Faites défiler horizontalement pour consulter toutes les colonnes.",
  className = "",
}: SchoolAdminResponsiveTableProps) {
  return (
    <div className={className}>
      <p className="sr-only" id={`${label.replace(/\s+/g, "-").toLowerCase()}-hint`}>
        {hint}
      </p>
      <div
        role="region"
        aria-label={label}
        aria-describedby={`${label.replace(/\s+/g, "-").toLowerCase()}-hint`}
        tabIndex={0}
        className="overflow-x-auto rounded-[var(--school-admin-radius-card)] border border-[var(--school-admin-border)] bg-[var(--school-admin-surface)] shadow-[var(--school-admin-shadow-sm)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--school-admin-focus)] focus-visible:ring-offset-2"
      >
        {children}
      </div>
    </div>
  );
}
