import type { ReactNode } from "react";

type SchoolAdminPageHeaderProps = {
  title: string;
  description?: string;
  eyebrow?: string;
  actions?: ReactNode;
  context?: ReactNode;
};

export function SchoolAdminPageHeader({
  title,
  description,
  eyebrow,
  actions,
  context,
}: SchoolAdminPageHeaderProps) {
  return (
    <header className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div className="min-w-0">
        {eyebrow ? (
          <p className="mb-1 text-xs font-bold uppercase tracking-[0.14em] text-[var(--school-admin-primary)]">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="text-2xl font-extrabold tracking-tight text-[var(--school-admin-text)] sm:text-3xl">
          {title}
        </h1>
        {description ? (
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--school-admin-text-muted)] sm:text-[15px]">
            {description}
          </p>
        ) : null}
        {context ? <div className="mt-3">{context}</div> : null}
      </div>
      {actions ? (
        <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto lg:justify-end">
          {actions}
        </div>
      ) : null}
    </header>
  );
}
