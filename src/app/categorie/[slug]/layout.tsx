import type { Metadata } from "next";
import { CAT_META } from "./catMeta";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const meta = CAT_META[slug];

  if (!meta) {
    return {
      title: "Catégorie introuvable — Écoles237",
      description: "Cette catégorie n'existe pas sur Écoles237.",
    };
  }

  const title = meta.label;
  const description = meta.description;

  return {
    title,
    description,
    alternates: {
      canonical: `/categorie/${slug}`,
    },
    openGraph: {
      title,
      description,
      type: "website",
      locale: "fr_CM",
      siteName: "Écoles237",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export default function CategoryLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
