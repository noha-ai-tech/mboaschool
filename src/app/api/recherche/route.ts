// GET /api/recherche — SPRINT R.2-B. Recherche publique côté serveur.
//
// Contrat (§4/§32) : le client envoie q/region/city/category/page/page_size,
// cette route retourne { results, total_count, page, page_size, total_pages }.
// Ne sélectionne que des colonnes publiques (§40) — jamais owner_id,
// raw_data, notes internes. Utilise le client anon (RLS "Public can read
// establishments" — voir supabase/schema.sql), jamais service-role (§6).
//
// §3 : ne charge JAMAIS toute la table pour répondre — `.range()` (LIMIT/
// OFFSET) et le COUNT exact Postgres (`count: "exact"`) garantissent un coût
// réseau proportionnel à page_size, pas au volume total de la table.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { categories } from "@/lib/categories";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, MAX_QUERY_LENGTH, type SchoolSearchResponse } from "@/lib/search/types";
import { cityForms, CITY_FALLBACK_COLUMNS, clampInt, ilikeOrGroup, queryWordGroups, resolveRegionFilter } from "@/lib/search/queryBuilder";

export const dynamic = "force-dynamic";

// §29 — mêmes données que les cartes existantes (fees/infrastructures/
// school_images inclus), mais désormais jointes pour au plus page_size
// lignes par requête — jamais pour la table entière comme avant R.2-B.
const PUBLIC_FIELDS = `
  id, name, main_category, sub_category,
  city, region, neighborhood, quartier, phone,
  cover_image_url, is_verified, is_claimed,
  accepts_online_payment, is_featured,
  couleur_primaire, couleur_secondaire, emoji_logo,
  latitude, longitude,
  fees(registration_fee, tuition_fee),
  infrastructures(library, laboratory, computer_room, sports_field, canteen, transport, wifi, boarding, security, infirmary),
  school_images(url)
`;

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;

  const qRaw = (searchParams.get("q") ?? "").slice(0, MAX_QUERY_LENGTH);
  const regionParam = searchParams.get("region");
  const cityParam = searchParams.get("city");
  const categoryParam = searchParams.get("category");
  // §39 — jamais confiance aveugle dans les searchParams bruts.
  const page = clampInt(searchParams.get("page"), 1, 1, 100000);
  const pageSize = clampInt(searchParams.get("page_size"), DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE);

  let supabase;
  try {
    supabase = await createClient();
  } catch (error) {
    console.error("[/api/recherche] Supabase client init failed:", error);
    return NextResponse.json({ error: "Impossible de charger les résultats." }, { status: 500 });
  }

  // Filtres (catégorie/région/ville/mots), sans order/range — factorisé pour
  // pouvoir reconstruire une requête de comptage seul si la page demandée
  // est hors limite (§47, voir plus bas). `supabase.from(...)` retourne un
  // nouveau constructeur à chaque appel, donc rappeler cette fonction est
  // sûr même après avoir déjà `await`é une requête précédente.
  function buildFilteredQuery() {
    // CMS-F.6 — filtre embarqué explicite : ne remonter que les photos
    // status='live' dans school_images(url) (défense en profondeur avec la
    // policy RLS publique, migration 0029 PRÉPARÉE NON EXÉCUTÉE). Un embed
    // PostgREST standard (sans !inner) filtre les lignes imbriquées sans
    // exclure l'établissement parent — une école sans photo live continue
    // d'apparaître, simplement avec school_images: [].
    let q = supabase!.from("establishments").select(PUBLIC_FIELDS, { count: "exact" }).eq("school_images.status", "live");

    // §18 — catégorie : réutilise la taxonomie existante, pas de valeur codée en dur.
    if (categoryParam && categoryParam !== "all" && categories.some((c) => c.key === categoryParam)) {
      q = q.eq("main_category", categoryParam);
    }

    const regionFilter = resolveRegionFilter(regionParam);
    if (regionFilter) {
      q = regionFilter.regions.length === 1 ? q.eq("region", regionFilter.regions[0]) : q.in("region", regionFilter.regions);
    }

    // §14/§15 — ville : repli sur les champs géographiques disponibles
    // (jamais city seul, sinon toute fiche city=NULL disparaîtrait du
    // filtre), plus les alias confirmés (cameroonMajorCities.ts).
    if (cityParam && cityParam !== "all") {
      q = q.or(ilikeOrGroup(CITY_FALLBACK_COLUMNS, cityForms(cityParam)));
    }

    // §12 — recherche mot-par-mot : chaque mot (ET logique entre mots, OU
    // entre ses variantes/colonnes) doit matcher au moins une colonne recherchable.
    for (const wordGroup of queryWordGroups(qRaw)) {
      q = q.or(wordGroup);
    }

    return q;
  }

  const offset = (page - 1) * pageSize;
  const { data, error, count } = await buildFilteredQuery()
    .order("is_featured", { ascending: false })
    .order("name", { ascending: true })
    .range(offset, offset + pageSize - 1);

  // §47 — une page hors limite (ex. filtres changés entre-temps, URL
  // obsolète) est un résultat VIDE légitime, pas une panne serveur —
  // PostgREST renvoie PGRST103 ("Requested range not satisfiable") dans ce
  // cas précis, distinct de toute autre erreur (§28 : celles-là restent des
  // pannes réelles, jamais maquillées en "0 résultat"). Le count n'est pas
  // renvoyé avec l'erreur de range — le récupérer séparément (une seule
  // ligne demandée, aucun coût réseau significatif) pour que total_pages
  // reste exact côté client.
  let total_count = count ?? 0;
  if (error) {
    if (error.code !== "PGRST103") {
      console.error("[/api/recherche] Supabase query failed:", error);
      return NextResponse.json({ error: "Impossible de charger les résultats." }, { status: 500 });
    }
    const { count: countOnly } = await buildFilteredQuery().range(0, 0);
    total_count = countOnly ?? 0;
  }
  const response: SchoolSearchResponse = {
    results: (data ?? []) as SchoolSearchResponse["results"],
    total_count,
    page,
    page_size: pageSize,
    total_pages: total_count === 0 ? 0 : Math.ceil(total_count / pageSize),
  };

  return NextResponse.json(response);
}
