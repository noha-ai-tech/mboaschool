// Logo officiel Écoles237 (retour au logo horizontal complet — icône +
// texte "Écoles237" déjà intégré à l'image, deux variantes fournies :
// logo-light.png pour les fonds clairs (texte foncé), logo-dark.png pour
// les fonds sombres (texte blanc). Le badge carré favicon.png reste
// réservé à l'onglet du navigateur (voir Favicon.tsx) — plus utilisé ici.
//
// `next/image` n'est volontairement pas utilisé ici : les dimensions
// réelles du fichier horizontal ne sont pas fixes, et ce composant est
// rendu dans des headers en position fixed dès le premier paint (LCP) —
// un <img> classique avec hauteur fixe/largeur auto évite toute
// dépendance à l'optimiseur d'image tout en préservant le ratio réel.

const HEIGHTS = { sm: 32, md: 48, lg: 72, header: 40, xl: 60 } as const;

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
