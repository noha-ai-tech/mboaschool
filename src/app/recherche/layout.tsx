import type { Metadata } from "next";

// RELEASE-CONSOLIDATION-08C §2 — /recherche is a "use client" page (live
// filtering via useSearchParams), so it can't export generateMetadata()
// itself. It was inheriting the root layout's canonical ("/"), pointing
// every visit — including from the homepage's own "Annuaire" nav link —
// back at the homepage instead of itself. Same server-layout-wraps-client-
// page pattern already used for /categorie/[slug].
//
// Canonical is the bare route, never a query-string variant: /recherche
// with q=/region=/ville=/page= is the same underlying directory search,
// and treating each combination as a separately indexable URL would
// create unbounded near-duplicate SEO surfaces. Google consolidates every
// filtered variant under this one canonical instead.
export const metadata: Metadata = {
  title: "Annuaire des écoles au Cameroun",
  description:
    "Recherchez et filtrez les établissements scolaires du Cameroun par catégorie, région et ville — annuaire complet et vérifié.",
  alternates: {
    canonical: "/recherche",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RechercheLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
