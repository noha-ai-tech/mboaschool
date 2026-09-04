import type { MetadataRoute } from "next";
import { supabase } from "@/lib/supabase";
import { paginateAll } from "@/lib/sitemap/paginate";

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");

// Catégories fixes de l'annuaire — voir src/app/page.tsx (`categories`) et
// src/app/categorie/[slug]/page.tsx (`CAT_META`).
const CATEGORY_SLUGS = ["garderie", "primaire", "secondaire", "superieur", "autres"];

// RELEASE-CONSOLIDATION-07C — PostgREST caps any unpaginated select() at
// 1000 rows by default. A bare .select() here silently dropped ~1255 of
// 2255 real schools from the sitemap. Paginate explicitly (paginateAll),
// ordered by the stable unique `id` column (never `updated_at`, which can
// tie across rows and would risk skipped/duplicated rows at a page
// boundary) — this scales automatically past 2255 without a hardcoded
// row-count assumption.
const PAGE_SIZE = 1000;

async function fetchAllEstablishments(): Promise<{ id: string; updated_at: string | null }[]> {
  return paginateAll(PAGE_SIZE, async (from, to) => {
    const { data } = await supabase
      .from("establishments")
      .select("id, updated_at")
      .order("id", { ascending: true })
      .range(from, to);
    return data ?? [];
  });
}

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

  const schools = await fetchAllEstablishments();

  const schoolEntries: MetadataRoute.Sitemap = schools.map((school) => ({
    url: `${SITE_URL}/ecole/${school.id}`,
    lastModified: school.updated_at ? new Date(school.updated_at) : new Date(),
    changeFrequency: "weekly",
    priority: 0.6,
  }));

  return [...staticEntries, ...schoolEntries];
}
