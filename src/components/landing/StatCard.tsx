import type { LucideIcon } from "lucide-react";

// Carte KPI de la section Statistiques — chiffre réel en grand (Fraunces),
// titre, description courte. Pas d'icône répétée dans un cercle sur chaque
// carte (voir references/anti-ai-tells.md du skill de design : ce pattern
// "icône-dans-cercle identique" est le signe le plus classique d'un écran
// généré) — la donnée elle-même porte l'information, pas un pictogramme.
//
// Trois variantes :
// - "card" (par défaut) : bloc autonome avec sa propre bordure/son propre
//   arrondi (usage isolé, sur fond clair).
// - "cell" : cellule claire d'une grille "sans couture" (le parent dessine
//   les filets de séparation via un fond de couleur + gap de 1px) — pas de
//   bordure/arrondi propres.
// - "cell-dark" : même principe de grille sans couture, mais posée sur une
//   section à fond vert foncé (ex. "Notre engagement") — jamais un texte
//   sombre sur fond sombre.
export function StatCard({
  icon: Icon,
  value,
  label,
  description,
  variant = "card",
}: {
  /** Conservé pour compatibilité d'API ; volontairement inutilisé sur cette carte. */
  icon?: LucideIcon;
  value: string;
  label: string;
  description: string;
  variant?: "card" | "cell" | "cell-dark";
}) {
  void Icon;
  if (variant === "cell-dark") {
    return (
      <div className="bg-[#0F4736] p-5 lg:p-6">
        <p className="font-[family-name:var(--font-fraunces)] text-[32px] leading-none font-semibold text-white tabular-nums">
          {value}
        </p>
        <p className="text-sm font-bold text-[#F2AE1F] mt-2.5">{label}</p>
        <p className="text-xs text-white/55 mt-1 leading-relaxed">{description}</p>
      </div>
    );
  }
  const isCell = variant === "cell";
  return (
    <div className={isCell ? "bg-white p-5 lg:p-6" : "bg-white border border-[#E7E0D7] rounded-[18px] p-5"}>
      <p className="font-[family-name:var(--font-fraunces)] text-[32px] leading-none font-semibold text-[#0B3B2E] tabular-nums">
        {value}
      </p>
      <p className="text-sm font-bold text-[#132019] mt-2.5">{label}</p>
      <p className="text-xs text-[#5A695F] mt-1 leading-relaxed">{description}</p>
    </div>
  );
}
