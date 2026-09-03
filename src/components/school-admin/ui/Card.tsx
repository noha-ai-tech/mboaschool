import type { HTMLAttributes, ReactNode } from "react";

type CardVariant = "default" | "subtle" | "interactive";
type CardPadding = "none" | "sm" | "md" | "lg";

const VARIANT_CLASSES: Record<CardVariant, string> = {
  default:
    "border-[var(--school-admin-border)] bg-[var(--school-admin-surface)] shadow-[var(--school-admin-shadow-sm)]",
  subtle:
    "border-[var(--school-admin-border)] bg-[var(--school-admin-surface-muted)]",
  interactive:
    "border-[var(--school-admin-border)] bg-[var(--school-admin-surface)] shadow-[var(--school-admin-shadow-sm)] transition duration-150 hover:-translate-y-0.5 hover:shadow-[var(--school-admin-shadow-md)] motion-reduce:transform-none motion-reduce:transition-none",
};

const PADDING_CLASSES: Record<CardPadding, string> = {
  none: "",
  sm: "p-4",
  md: "p-5",
  lg: "p-6",
};

type SchoolAdminCardProps = HTMLAttributes<HTMLDivElement> & {
  variant?: CardVariant;
  padding?: CardPadding;
};

export function SchoolAdminCard({
  variant = "default",
  padding = "md",
  className = "",
  children,
  ...props
}: SchoolAdminCardProps) {
  return (
    <div
      className={`rounded-[var(--school-admin-radius-card)] border ${VARIANT_CLASSES[variant]} ${PADDING_CLASSES[padding]} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

type SchoolAdminSectionCardProps = HTMLAttributes<HTMLElement> & {
  title: string;
  description?: string;
  action?: ReactNode;
  contentClassName?: string;
};

export function SchoolAdminSectionCard({
  title,
  description,
  action,
  children,
  className = "",
  contentClassName = "",
  ...props
}: SchoolAdminSectionCardProps) {
  return (
    <section
      className={`overflow-hidden rounded-[var(--school-admin-radius-card)] border border-[var(--school-admin-border)] bg-[var(--school-admin-surface)] shadow-[var(--school-admin-shadow-sm)] ${className}`}
      {...props}
    >
      <div className="flex flex-col gap-3 border-b border-[var(--school-admin-border)] px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-base font-bold text-[var(--school-admin-text)]">
            {title}
          </h2>
          {description ? (
            <p className="mt-1 text-sm leading-6 text-[var(--school-admin-text-muted)]">
              {description}
            </p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className={`p-5 ${contentClassName}`}>{children}</div>
    </section>
  );
}
