import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

export type SchoolMutationContext = {
  supabase: SupabaseClient;
  userId: string;
  establishmentId: string;
};

export type AuthorizeResult =
  | { ok: true; context: SchoolMutationContext }
  | { ok: false; status: number; error: string };

// Helper central pour toute mutation CMS-B — un school_id envoyé par le
// navigateur n'est JAMAIS une autorisation (CMS-A §15). L'établissement
// autorisé est recalculé côté serveur à partir de la session uniquement.
// Le client Supabase retourné reste lié à la session de l'utilisateur (pas
// de service role) : la RLS s'applique toujours en plus de ces contrôles —
// double protection, jamais de contournement RLS (CMS-B.2 §6).
export async function authorizeSchoolMutation(): Promise<AuthorizeResult> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, status: 401, error: "Non authentifié" };
  }

  const { data: establishment } = await supabase
    .from("establishments")
    .select("id")
    .eq("owner_id", user.id)
    .maybeSingle();

  if (!establishment) {
    return { ok: false, status: 403, error: "Aucun établissement autorisé pour cet utilisateur" };
  }

  return { ok: true, context: { supabase, userId: user.id, establishmentId: establishment.id } };
}
