import { cookies } from "next/headers";
import type { createClient } from "./server";

// Partagé avec src/lib/school/SchoolContext.tsx (côté client) — une seule
// source de vérité pour le nom du cookie de préférence d'établissement actif.
export const ACTIVE_SCHOOL_COOKIE = "ecoles237_active_school";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type ActiveEstablishment = { id: string };

/**
 * Résout l'établissement actif d'un promoteur pour les pages serveur de
 * /pro/**. Remplace le `.from("establishments").select("id").eq("owner_id",
 * userId).single()` dupliqué dans 16 pages, qui plantait silencieusement
 * dès qu'un promoteur possédait 2+ établissements (PostgREST renvoie alors
 * data=null sur .single()).
 *
 * Règle de sécurité absolue : le cookie n'autorise rien par lui-même. On ne
 * retient l'id qu'il contient QUE s'il figure réellement parmi les
 * établissements dont owner_id = userId ; sinon on retombe sur le premier.
 */
export async function getActiveEstablishment(
  supabase: SupabaseServerClient,
  userId: string
): Promise<ActiveEstablishment | null> {
  const { data: owned } = await supabase
    .from("establishments")
    .select("id")
    .eq("owner_id", userId)
    .order("created_at", { ascending: true });

  if (!owned || owned.length === 0) return null;

  const cookieStore = await cookies();
  const requestedId = cookieStore.get(ACTIVE_SCHOOL_COOKIE)?.value;
  const match = requestedId ? owned.find((e) => e.id === requestedId) : undefined;
  return match ?? owned[0];
}
