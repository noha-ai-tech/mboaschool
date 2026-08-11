// Texture de fond du Hero — motif géométrique abstrait, en filigrane
// (opacité 3% maximum, jamais littéral, jamais envahissant). Ne doit
// jamais capter l'attention avant le contenu du Hero.
export function HeroBackground() {
  return (
    <svg
      aria-hidden="true"
      className="absolute inset-0 w-full h-full text-primary opacity-[0.03] pointer-events-none"
      preserveAspectRatio="xMidYMid slice"
    >
      <pattern id="hero-bg-texture" width="64" height="64" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="64" height="64" fill="none" />
        <path d="M32 0 L64 32 L32 64 L0 32 Z" fill="none" stroke="currentColor" strokeWidth="1" />
        <circle cx="32" cy="32" r="3" fill="currentColor" />
      </pattern>
      <rect width="100%" height="100%" fill="url(#hero-bg-texture)" />
    </svg>
  );
}
