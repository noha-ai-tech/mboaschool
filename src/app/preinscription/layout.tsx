import type { Metadata } from "next";

// preinscription/page.tsx est un composant client ("use client") — il ne
// peut pas exporter generateMetadata/metadata lui-même. Sans ce layout, la
// page héritait uniquement du titre/description génériques du layout
// racine (trouvé lors de l'audit RC1, Phase 6).
export const metadata: Metadata = {
  title: "Préinscription — Écoles237",
  description: "Préinscrivez votre enfant dans l'établissement de votre choix sur Écoles237, sans créer de compte.",
  alternates: {
    canonical: "/preinscription",
  },
  openGraph: {
    title: "Préinscription — Écoles237",
    description: "Préinscrivez votre enfant dans l'établissement de votre choix sur Écoles237, sans créer de compte.",
    type: "website",
    locale: "fr_CM",
    siteName: "Écoles237",
  },
};

export default function PreinscriptionLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
