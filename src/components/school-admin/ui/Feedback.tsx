import { AlertCircle, CheckCircle2, Info, TriangleAlert } from "lucide-react";
import type { HTMLAttributes, ReactNode } from "react";

type AlertTone = "success" | "warning" | "danger" | "info";

const ALERT_STYLES: Record<
  AlertTone,
  { classes: string; icon: typeof Info }
> = {
  success: {
    classes:
      "border-[var(--school-admin-success-border)] bg-[var(--school-admin-success-soft)] text-[var(--school-admin-success-text)]",
    icon: CheckCircle2,
  },
  warning: {
    classes:
      "border-[var(--school-admin-warning-border)] bg-[var(--school-admin-warning-soft)] text-[var(--school-admin-warning-text)]",
    icon: TriangleAlert,
  },
  danger: {
    classes:
      "border-[var(--school-admin-danger-border)] bg-[var(--school-admin-danger-soft)] text-[var(--school-admin-danger)]",
    icon: AlertCircle,
  },
  info: {
    classes:
      "border-[var(--school-admin-info-border)] bg-[var(--school-admin-info-soft)] text-[var(--school-admin-info)]",
    icon: Info,
  },
};

type SchoolAdminAlertProps = {
  tone?: AlertTone;
  title?: string;
  children: ReactNode;
};

export function SchoolAdminAlert({
  tone = "info",
  title,
  children,
}: SchoolAdminAlertProps) {
  const style = ALERT_STYLES[tone];
  const Icon = style.icon;

  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={`flex gap-3 rounded-[var(--school-admin-radius-control)] border p-4 text-sm ${style.classes}`}
    >
      <Icon size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
      <div className="min-w-0">
        {title ? <p className="font-bold">{title}</p> : null}
        <div className={title ? "mt-1 leading-6" : "leading-6"}>{children}</div>
      </div>
    </div>
  );
}

type StateProps = {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
};

function StateLayout({ title, description, icon, action }: StateProps) {
  return (
    <div className="flex min-h-52 flex-col items-center justify-center rounded-[var(--school-admin-radius-card)] border border-dashed border-[var(--school-admin-border-strong)] bg-[var(--school-admin-surface)] px-6 py-10 text-center">
      {icon ? (
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--school-admin-primary-soft)] text-[var(--school-admin-primary)]" aria-hidden="true">
          {icon}
        </div>
      ) : null}
      <h2 className="text-base font-bold text-[var(--school-admin-text)]">{title}</h2>
      {description ? (
        <p className="mt-2 max-w-lg text-sm leading-6 text-[var(--school-admin-text-muted)]">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function SchoolAdminEmptyState(props: StateProps) {
  return <StateLayout {...props} />;
}

export function SchoolAdminErrorState(props: StateProps) {
  return <StateLayout {...props} icon={props.icon ?? <AlertCircle size={22} />} />;
}

export function SchoolAdminSkeleton({
  className = "",
  label = "Chargement en cours",
  tone = "default",
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  label?: string;
  tone?: "default" | "inverse";
}) {
  const decorative = !label;
  return (
    <div
      role={decorative ? undefined : "status"}
      aria-label={decorative ? undefined : label}
      aria-hidden={decorative || undefined}
      className={`school-admin-skeleton rounded-lg ${tone === "inverse" ? "school-admin-skeleton-inverse" : ""} ${className}`}
      {...props}
    />
  );
}

export function SchoolAdminLoadingState({ label = "Chargement en cours" }: { label?: string }) {
  return (
    <div role="status" aria-label={label} className="space-y-4">
      <SchoolAdminSkeleton className="h-8 w-56" label={label} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-hidden="true">
        {Array.from({ length: 4 }, (_, index) => (
          <SchoolAdminSkeleton key={index} className="h-28" label="" />
        ))}
      </div>
      <SchoolAdminSkeleton className="h-64" label="" />
    </div>
  );
}
