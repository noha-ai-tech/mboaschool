// Icône officielle Écoles237 (Branding V1). Pour l'onglet du navigateur, le
// favicon est déclaré une seule fois via metadata.icons (src/app/layout.tsx)
// et src/app/manifest.ts — ce composant sert aux endroits où l'icône (carrée,
// contrairement au logo horizontal) doit être affichée directement dans une
// page (ex. aperçu de marque, avatar par défaut).

const SIZES = { sm: 16, md: 24, lg: 32 } as const;

export type FaviconSize = keyof typeof SIZES;

export function Favicon({
  size = "md",
  className = "",
}: {
  size?: FaviconSize;
  className?: string;
}) {
  const px = SIZES[size];
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/branding/favicon.png"
      alt="Écoles237"
      width={px}
      height={px}
      className={className}
    />
  );
}
