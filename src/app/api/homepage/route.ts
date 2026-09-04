import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { categories } from "@/lib/categories";
import { getCameroonRegion, normalizeRegionCasing } from "@/lib/cameroonRegions";
import { dedupeInsensitive } from "@/lib/textSearch";

export const dynamic = "force-dynamic";

const GUYSKULL_ID = "a4cc4966-0d85-4c63-9c24-0538b8d5133b";
const FEATURED_LIMIT = 10;
const PAGE_SIZE = 1000;

const FEATURED_FIELDS = `
  id, name, main_category, sub_category,
  city, quartier, neighborhood, phone,
  cover_image_url, is_verified, is_claimed,
  accepts_online_payment, is_featured,
  couleur_primaire, couleur_secondaire, emoji_logo,
  latitude, longitude,
  fees(registration_fee, tuition_fee),
  infrastructures(library, laboratory, computer_room, sports_field, canteen, transport, wifi, boarding, security, infirmary),
  school_images(url)
`;

type RegistryRow = {
  main_category: string | null;
  city: string | null;
  region: string | null;
};

export async function GET() {
  try {
    const supabase = await createClient();
    const registry: RegistryRow[] = [];
    let total = 0;

    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error, count } = await supabase
        .from("establishments")
        .select("main_category, city, region", { count: from === 0 ? "exact" : undefined })
        .order("id", { ascending: true })
        .range(from, from + PAGE_SIZE - 1);

      if (error) throw error;
      if (from === 0) total = count ?? 0;
      const page = (data ?? []) as RegistryRow[];
      registry.push(...page);
      if (page.length < PAGE_SIZE) break;
    }

    const categoryCounts = Object.fromEntries(categories.map((category) => [category.key, 0]));
    for (const row of registry) {
      if (row.main_category && row.main_category in categoryCounts) {
        categoryCounts[row.main_category] += 1;
      }
    }

    const cities = dedupeInsensitive(registry.map((row) => row.city ?? ""));
    const regions = new Set(
      registry
        .map((row) => normalizeRegionCasing(row.region) ?? getCameroonRegion(row.city))
        .filter((region): region is string => Boolean(region))
    );
    const categoryCount = Object.values(categoryCounts).filter((count) => count > 0).length;

    const [{ data: selected, error: selectedError }, { data: generic, error: genericError }] = await Promise.all([
      supabase.from("establishments").select(FEATURED_FIELDS).eq("id", GUYSKULL_ID).eq("school_images.status", "live").maybeSingle(),
      supabase
        .from("establishments")
        .select(FEATURED_FIELDS)
        .eq("is_featured", true)
        .eq("school_images.status", "live")
        .order("name", { ascending: true })
        .limit(FEATURED_LIMIT),
    ]);

    if (selectedError) throw selectedError;
    if (genericError) throw genericError;

    // Guyskull is the deliberate public showcase school — it must always
    // link straight to its real minisite from "Établissements à la une",
    // never behind the claim/signup flow real unclaimed schools get
    // (RELEASE-CONSOLIDATION-07D §5: SchoolCard routes unclaimed schools to
    // /auth/inscription, which is correct for real listings but broke
    // Guyskull's featured card here since it's stored as unclaimed).
    const featured = [selected, ...(generic ?? [])]
      .filter((school): school is NonNullable<typeof school> => Boolean(school))
      .filter((school, index, list) => list.findIndex((candidate) => candidate.id === school.id) === index)
      .slice(0, FEATURED_LIMIT)
      .map((school) => school.id === GUYSKULL_ID ? { ...school, is_featured: true, is_claimed: true } : school);

    return NextResponse.json({
      stats: {
        establishments: total || registry.length,
        regions: regions.size,
        cities: cities.length,
        categories: categoryCount,
      },
      categoryCounts,
      featured,
    });
  } catch (error) {
    console.error("[/api/homepage] Homepage data query failed:", error);
    return NextResponse.json({ error: "Impossible de charger les données de la page d'accueil." }, { status: 500 });
  }
}
