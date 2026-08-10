// Design System V2 — docs/03_DESIGN_SYSTEM/04_COMPONENTS.md §Card
type Variant = "default" | "interactive" | "flat";

const VARIANT_CLASSES: Record<Variant, string> = {
  default: "bg-surface border border-border",
  interactive: "bg-surface border border-border hover:shadow-elevation-1 hover:-translate-y-0.5 transition-all duration-fast cursor-pointer",
  flat: "bg-muted",
};

export function Card({
  variant = "default",
  className = "",
  children,
}: {
  variant?: Variant;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`rounded-card p-6 ${VARIANT_CLASSES[variant]} ${className}`}>
      {children}
    </div>
  );
}
