// Design System V2 — docs/03_DESIGN_SYSTEM/04_COMPONENTS.md §Badge
type Variant = "success" | "warning" | "danger" | "neutral" | "info";

const VARIANT_CLASSES: Record<Variant, string> = {
  success: "bg-primary-light text-primary",
  warning: "bg-warning/10 text-warning",
  danger: "bg-danger/10 text-danger",
  neutral: "bg-muted text-text-secondary",
  info: "bg-blue-50 text-blue-700",
};

export function Badge({
  variant = "neutral",
  className = "",
  children,
}: {
  variant?: Variant;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center h-6 px-2.5 rounded-full text-[11px] font-bold ${VARIANT_CLASSES[variant]} ${className}`}
    >
      {children}
    </span>
  );
}
