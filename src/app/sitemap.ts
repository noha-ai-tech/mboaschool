import type { MetadataRoute } from "next";
import { supabase } from "@/lib/supabase";

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");

// Catégories fixes de l'annuaire — voir src/app/page.tsx (`categories`) et
// src/app/categorie/[slug]/page.tsx (`CAT_META`).
const CATEGORY_SLUGS = ["garderie", "primaire", "secondaire", "superieur", "autres"];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticEntries: MetadataRoute.Sitemap = [
    {
      url: SITE_URL,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1,
    },
    ...CATEGORY_SLUGS.map((slug) => ({
      url: `${SITE_URL}/categorie/${slug}`,
      lastModified: new Date(),
      changeFrequency: "daily" as const,
      priority: 0.8,
    })),
  ];

  const { data: schools } = await supabase
    .from("establishments")
    .select("id, updated_at")
    .order("updated_at", { ascending: false });

  const schoolEntries: MetadataRoute.Sitemap = (schools ?? []).map((school) => ({
    url: `${SITE_URL}/ecole/${school.id}`,
    lastModified: school.updated_at ? new Date(school.updated_at) : new Date(),
    changeFrequency: "weekly",
    priority: 0.6,
  }));

  return [...staticEntries, ...schoolEntries];
}
