// Design System V2 — docs/03_DESIGN_SYSTEM/04_COMPONENTS.md §Skeleton
// Utilise l'animation "shimmer" définie dans globals.css (remplace animate-pulse).
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton-shimmer bg-muted rounded-lg ${className}`} />;
}
