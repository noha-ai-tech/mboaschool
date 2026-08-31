import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getActiveEstablishment } from "@/lib/supabase/activeEstablishment";

export type SchoolMutationContext = {
  supabase: SupabaseClient;
  userId: string;
  establishmentId: string;
};

export type AuthorizeResult =
  | { ok: true; context: SchoolMutationContext }
  | { ok: false; status: number; error: string };

// Helper central pour toute mutation CMS-B — un school_id envoyé par le
// navigateur n'est JAMAIS une autorisation (CMS-A §15) : cette fonction ne
// lit donc jamais d'id d'établissement depuis la requête, uniquement depuis
// la session + la préférence active_school déjà résolue côté serveur (voir
// getActiveEstablishment, PRO-00B/PRO-03 — même moteur que /pro/**, pas de
// second mécanisme de résolution). Le CMS n'est pas réservé au forfait Pro
// (contrairement à /pro/**) : le filtre forfait='pro' de getActiveEstablishment
// est explicitement désactivé ici. Le client Supabase retourné reste lié à
// la session de l'utilisateur (pas de service role) : la RLS s'applique
// toujours en plus de ces contrôles — double protection, jamais de
// contournement RLS (CMS-B.2 §6).
export async function authorizeSchoolMutation(): Promise<AuthorizeResult> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, status: 401, error: "Non authentifié" };
  }

  const establishment = await getActiveEstablishment(supabase, user.id, null, {
    requireProForfait: false,
  });

  if (!establishment) {
    return { ok: false, status: 403, error: "Aucun établissement autorisé pour cet utilisateur" };
  }

  return { ok: true, context: { supabase, userId: user.id, establishmentId: establishment.id } };
}
