// Logo officiel Écoles237 (Branding V1). Composant UNIQUE de rendu du logo —
// plus aucun autre logo (ancien pictogramme tricolore codé en dur, imports
// directs de fichiers) ne doit exister ailleurs dans le dépôt.
//
// `next/image` (import statique) n'est volontairement pas utilisé ici : les
// dimensions réelles du fichier officiel /branding/logo.png (logo horizontal)
// ne sont pas connues à l'écriture de ce composant. Un <img> classique avec
// hauteur fixe et largeur automatique préserve le ratio réel du fichier quel
// qu'il soit, sans risque de déformation ou de recadrage inattendu.

const HEIGHTS = { sm: 22, md: 32, lg: 48 } as const;

export type LogoSize = keyof typeof HEIGHTS;

export function Logo({
  size = "md",
  priority = false,
  className = "",
}: {
  size?: LogoSize;
  priority?: boolean;
  className?: string;
}) {
  const height = HEIGHTS[size];
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/branding/logo.png"
      alt="Écoles237"
      height={height}
      style={{ height, width: "auto" }}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : undefined}
      className={className}
    />
  );
}
