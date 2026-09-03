// Logo officiel Écoles237 — symbole épingle-é (SVG inline, couleurs de marque)
// + texte "École237" avec les chiffres colorés (vert/rouge/or), jamais du
// texte dupliqué à l'intérieur du symbole. Rendu en SVG inline (plutôt qu'une
// image raster) pour rester net à toute taille, y compris dans un header en
// position fixed dès le premier paint (LCP) — aucune dépendance à un fichier
// externe ni à l'optimiseur d'image.

import type { CSSProperties } from "react";

const HEIGHTS = { sm: 32, md: 48, lg: 72, header: 40, xl: 60 } as const;

export type LogoSize = keyof typeof HEIGHTS;
export type LogoVariant = "light" | "dark";

// Reflet "chromé/verni" façon logo historique (fichiers de marque
// public/branding/logo-*.png) : chaque segment du mot-mark porte un dégradé
// clair-sombre-clair qui simule une bande de lumière réfléchie, plus une
// légère lueur de la couleur de marque pour les chiffres — jamais une
// animation, un effet statique et sobre.
function glossyStyle(base: string, sheen: string, glow?: string): CSSProperties {
  return {
    backgroundImage: `linear-gradient(180deg, ${base} 0%, ${base} 36%, ${sheen} 50%, ${base} 64%, ${base} 100%)`,
    WebkitBackgroundClip: "text",
    backgroundClip: "text",
    color: "transparent",
    WebkitTextFillColor: "transparent",
    textShadow: glow ? `0 1px 1px rgba(11,59,46,0.35), 0 0 7px ${glow}` : "0 1px 1px rgba(11,59,46,0.25)",
  };
}

export function Logo({
  variant = "light",
  size = "md",
  priority = false,
  className = "",
}: {
  variant?: LogoVariant;
  size?: LogoSize;
  /** Conservé pour compatibilité d'API — un SVG inline n'a pas de chargement différé. */
  priority?: boolean;
  className?: string;
}) {
  const height = HEIGHTS[size];
  const markWidth = Math.round(height * (96 / 130));
  const ecoleStyle =
    variant === "dark"
      ? glossyStyle("rgba(255,255,255,0.88)", "#FFFFFF")
      : glossyStyle("#132019", "#6E7D74");

  return (
    <span
      className={`inline-flex items-center gap-2.5 ${className}`}
      style={{ height }}
      data-logo-priority={priority || undefined}
    >
      <svg
        viewBox="-8 -6 96 130"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        style={{ height, width: markWidth, flexShrink: 0 }}
      >
        <path
          d="M40 0 C16 0 -4 19 -4 44 C-4 78 40 116 40 116 C40 116 84 78 84 44 C84 19 64 0 40 0 Z"
          fill="#1F8A5D"
        />
        <circle cx="40" cy="44" r="28" fill="#ffffff" />
        <path
          d="M27 47 L53 47 Q53 37 40 37 Q28 37 28 49 Q28 61 41 61 Q49 61 53 55"
          fill="none"
          stroke="#1F8A5D"
          strokeWidth="6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M34 28 L46 28" stroke="#F2AE1F" strokeWidth="6" strokeLinecap="round" />
      </svg>
      <span
        className="font-[family-name:var(--font-fraunces)] font-bold leading-none whitespace-nowrap"
        style={{ fontSize: Math.round(height * 0.42) }}
      >
        <span style={ecoleStyle}>École</span>
        <span style={glossyStyle("#1F8A5D", "#C9F5DF", "rgba(31,138,93,0.6)")}>2</span>
        <span style={glossyStyle("#C8202F", "#FFD3D7", "rgba(200,32,47,0.55)")}>3</span>
        <span style={glossyStyle("#F2AE1F", "#FFF3CE", "rgba(242,174,31,0.6)")}>7</span>
      </span>
    </span>
  );
}
