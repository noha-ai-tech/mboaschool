import type { Metadata } from "next";

// Même raison que src/app/preinscription/layout.tsx : suivi-admission/page.tsx
// est un composant client, sans metadata propre avant ce correctif (audit RC1,
// Phase 6). La page ne révèle aucune donnée personnelle tant qu'un code +
// téléphone n'est pas soumis (rendu entièrement côté client) — l'indexation
// du formulaire lui-même ne pose pas de risque.
export const metadata: Metadata = {
  title: "Suivi de préinscription — Écoles237",
  description: "Suivez l'avancement de votre dossier de préinscription avec votre code de suivi et votre numéro de téléphone.",
  alternates: {
    canonical: "/suivi-admission",
  },
  openGraph: {
    title: "Suivi de préinscription — Écoles237",
    description: "Suivez l'avancement de votre dossier de préinscription avec votre code de suivi et votre numéro de téléphone.",
    type: "website",
    locale: "fr_CM",
    siteName: "Écoles237",
  },
};

export default function SuiviAdmissionLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
