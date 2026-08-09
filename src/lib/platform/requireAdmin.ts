import { createClient } from "@/lib/supabase/server";
import { can, type PlatformPermission } from "./permissions";

// Vérification serveur commune à toutes les routes /api/admin/* de cette
// mission — même rôle que le bloc dupliqué dans
// src/app/api/admin/claims/[id]/approve/route.ts (Mission 02), factorisé
// ici car le POC en a besoin dans une dizaine de routes. Vérifie d'abord
// role='platform_admin' (barrière large, comme avant), puis — si une
// permission est demandée — admin_role via la matrice de permissions
// (Mission 08, Phase 2). C'est l'autorité réelle : les vérifications
// côté client (layout, boutons masqués) ne sont qu'une aide visuelle.
export async function requireAdmin(permission?: PlatformPermission) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Non authentifié" as const, status: 401 as const, user: null, adminRole: null, supabase };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, admin_role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "platform_admin") {
    return { error: "Accès refusé" as const, status: 403 as const, user: null, adminRole: null, supabase };
  }

  if (permission && !can(profile.admin_role, permission)) {
    return { error: "Votre rôle administrateur ne permet pas cette action" as const, status: 403 as const, user: null, adminRole: null, supabase };
  }

  return { error: null, status: 200 as const, user, adminRole: profile.admin_role, supabase };
}
