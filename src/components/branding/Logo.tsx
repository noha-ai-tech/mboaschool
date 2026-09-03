// Logo officiel Écoles237 — symbole épingle-é (SVG inline, couleurs de marque)
// + texte "École237" avec les chiffres colorés (vert/rouge/or), jamais du
// texte dupliqué à l'intérieur du symbole. Rendu en SVG inline (plutôt qu'une
// image raster) pour rester net à toute taille, y compris dans un header en
// position fixed dès le premier paint (LCP) — aucune dépendance à un fichier
// externe ni à l'optimiseur d'image.

const HEIGHTS = { sm: 32, md: 48, lg: 72, header: 40, xl: 60 } as const;

export type LogoSize = keyof typeof HEIGHTS;
export type LogoVariant = "light" | "dark";

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
  const textColor = variant === "dark" ? "#FFFFFF" : "#132019";

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
        className="font-[family-name:var(--font-fraunces)] font-semibold leading-none whitespace-nowrap"
        style={{ color: textColor, fontSize: Math.round(height * 0.42) }}
      >
        École
        <span style={{ color: "#1F8A5D" }}>2</span>
        <span style={{ color: "#C8202F" }}>3</span>
        <span style={{ color: "#F2AE1F" }}>7</span>
      </span>
    </span>
  );
}
