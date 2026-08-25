import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { createClient } from "./server";
import {
  ACTIVE_SCHOOL_COOKIE,
  resolveEstablishmentContext,
} from "@/lib/school/establishmentContext";

// Partagé avec src/lib/school/SchoolContext.tsx (côté client) — une seule
// source de vérité pour le nom du cookie de préférence d'établissement actif.
export { ACTIVE_SCHOOL_COOKIE };

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
 * établissements dont owner_id = userId. Avec plusieurs écoles et aucun
 * contexte valide, une sélection explicite est obligatoire.
 */
export async function getActiveEstablishment(
  supabase: SupabaseServerClient,
  userId: string,
  requestedEstablishmentId?: string | null,
  options?: { requireProForfait?: boolean }
): Promise<ActiveEstablishment | null> {
  // Par défaut (les 16 pages /pro/**) : forfait='pro' obligatoire, comportement
  // inchangé. Le CMS (dashboard/ecole, tous forfaits) désactive ce filtre
  // explicitement plutôt que de dupliquer la résolution — voir authorizeSchoolMutation.ts.
  const requireProForfait = options?.requireProForfait ?? true;
  let query = supabase.from("establishments").select("id").eq("owner_id", userId);
  if (requireProForfait) {
    query = query.eq("forfait", "pro");
  }
  const { data: owned } = await query.order("created_at", { ascending: true });

  if (!owned || owned.length === 0) return null;

  const cookieStore = await cookies();
  const resolution = resolveEstablishmentContext({
    explicitId: requestedEstablishmentId,
    cookieId: cookieStore.get(ACTIVE_SCHOOL_COOKIE)?.value ?? null,
    accessibleIds: owned.map((school) => school.id),
  });

  if (!resolution.establishmentId) return null;
  return { id: resolution.establishmentId };
}

export async function requireActiveEstablishment(
  supabase: SupabaseServerClient,
  userId: string,
  requestedEstablishmentId: string | null | undefined,
  returnPath: string
): Promise<ActiveEstablishment> {
  const establishment = await getActiveEstablishment(
    supabase,
    userId,
    requestedEstablishmentId
  );
  if (!establishment) {
    redirect(`/pro/selection-etablissement?next=${encodeURIComponent(returnPath)}`);
  }
  return establishment;
}
