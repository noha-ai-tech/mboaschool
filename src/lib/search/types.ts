// SPRINT R.2-B §32 — Contrat partagé entre le client (/recherche, Landing) et
// la route serveur (/api/recherche). Un seul type pour éviter deux contrats
// qui divergent silencieusement.

/** Ce que le client envoie. */
export interface SchoolSearchParams {
  q: string;
  region: string | null;
  city: string | null;
  category: string | null;
  page: number;
  pageSize: number;
}

/**
 * Une ligne de résultat — uniquement des champs publics (§40), jamais
 * raw_data/owner_id/notes internes. fees/infrastructures/school_images
 * restent des jointures ciblées comme avant R.2-B (§29 — cartes inchangées),
 * mais désormais bornées à page_size lignes, jamais à la table entière.
 */
export interface SchoolSearchResult {
  id: string;
  name: string;
  main_category: string;
  sub_category: string | null;
  city: string | null;
  region: string | null;
  neighborhood: string | null;
  quartier: string | null;
  phone: string | null;
  cover_image_url: string | null;
  is_verified: boolean;
  is_claimed: boolean;
  accepts_online_payment: boolean;
  is_featured: boolean;
  couleur_primaire: string | null;
  couleur_secondaire: string | null;
  emoji_logo: string | null;
  latitude: number | null;
  longitude: number | null;
  fees: { registration_fee: number | null; tuition_fee: number | null }[];
  infrastructures: Record<string, boolean>[];
  school_images: { url: string }[];
}

/** Ce que la route serveur retourne — §4/§8, jamais plus de lignes que page_size. */
export interface SchoolSearchResponse {
  results: SchoolSearchResult[];
  total_count: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export const DEFAULT_PAGE_SIZE = 24;
export const MOBILE_PAGE_SIZE = 16;
export const MAX_PAGE_SIZE = 50;
export const MAX_QUERY_LENGTH = 200;
