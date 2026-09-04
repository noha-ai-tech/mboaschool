// Logo horizontal officiel Écoles237 fourni et validé par le fondateur.
// Le favicon reste un asset distinct et n'est jamais utilisé ici.

import Image from "next/image";

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
  priority?: boolean;
  className?: string;
}) {
  const height = HEIGHTS[size];
  const width = Math.round(height * 1.5);

  return (
    <Image
      src={variant === "dark" ? "/branding/logo-dark.png" : "/branding/logo-light.png"}
      alt="Écoles237"
      width={width}
      height={height}
      priority={priority}
      className={`shrink-0 object-contain ${className}`}
      style={{ width, height }}
    />
  );
}
