// Logo officiel Écoles237 (Branding Final V1). Composant UNIQUE de rendu du
// logo — deux variantes fournies séparément (pas de recoloration CSS d'un
// seul fichier) : logo-light.png pour les fonds clairs, logo-dark.png pour
// les fonds sombres.
//
// `next/image` (import statique) n'est volontairement pas utilisé ici : les
// dimensions réelles des fichiers officiels (logos horizontaux) ne sont pas
// connues à l'écriture de ce composant. Un <img> classique avec hauteur fixe
// et largeur automatique préserve le ratio réel du fichier quel qu'il soit.

const HEIGHTS = { sm: 28, md: 44, lg: 64 } as const;

export type LogoSize = keyof typeof HEIGHTS;
export type LogoVariant = "light" | "dark";

const SOURCES: Record<LogoVariant, string> = {
  light: "/branding/logo-light.png",
  dark: "/branding/logo-dark.png",
};

export function Logo({
  variant = "light",
  size = "md",
  priority = false,
  className = "",
}: {
  variant?: LogoVariant;
  size?: LogoSize;
  priority?: boolean;
  className?: string;
}) {
  const height = HEIGHTS[size];
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={SOURCES[variant]}
      alt="Écoles237"
      height={height}
      style={{ height, width: "auto" }}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : undefined}
      className={className}
    />
  );
}
