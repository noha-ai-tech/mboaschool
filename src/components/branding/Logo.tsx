// Logo officiel Écoles237. Composant UNIQUE de rendu du logo — utilise
// désormais le badge carré (favicon.png) partout, sur fond clair comme
// sombre : les anciens fichiers horizontaux (logo-light.png/logo-dark.png)
// ne sont plus référencés. `variant` reste dans la signature pour ne pas
// casser les appels existants, mais les deux valeurs pointent vers le même
// fichier — le badge n'a qu'une seule version.
//
// `next/image` n'est volontairement pas utilisé ici : ce composant est
// rendu dans un header en position fixed dès le premier paint (LCP), un
// <img> classique évite toute dépendance à l'optimiseur d'image.

const SIZES = { sm: 32, md: 48, lg: 72, header: 40 } as const;

export type LogoSize = keyof typeof SIZES;
export type LogoVariant = "light" | "dark";

const SOURCE = "/branding/favicon.png";

export function Logo({
  variant: _variant = "light",
  size = "md",
  priority = false,
  className = "",
}: {
  variant?: LogoVariant;
  size?: LogoSize;
  priority?: boolean;
  className?: string;
}) {
  const px = SIZES[size];
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={SOURCE}
      alt="Écoles237"
      width={px}
      height={px}
      style={{ width: px, height: px }}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : undefined}
      className={`rounded-xl ${className}`}
    />
  );
}
