import type { ReactNode } from "react";

// Carte "Pourquoi Écoles237" — forme graphique abstraite (jamais une grosse
// icône générique colorée), titre, description courte.
export function WhyCard({
  graphic,
  title,
  description,
}: {
  graphic: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="bg-white border border-border rounded-[20px] p-6 hover:-translate-y-0.5 transition-transform duration-base">
      <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4 text-primary">
        {graphic}
      </div>
      <p className="font-bold text-sm text-text-primary mb-1.5">{title}</p>
      <p className="text-xs text-text-secondary leading-relaxed">{description}</p>
    </div>
  );
}
