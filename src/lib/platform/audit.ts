import { supabase } from "@/lib/supabase";

// Point d'appel unique pour journaliser une action sensible (Mission 08,
// Phase 9). Appelle la fonction security definer log_platform_action
// (migration 0013) qui vérifie elle-même que l'appelant est platform_admin
// et insère dans platform_audit_log — jamais d'écriture directe côté
// client sur cette table (aucune policy INSERT ne l'autorise).
export async function logPlatformAction(
  action: string,
  targetType: string,
  targetId: string,
  metadata: Record<string, unknown> = {}
): Promise<void> {
  await supabase.rpc("log_platform_action", {
    p_action: action,
    p_target_type: targetType,
    p_target_id: targetId,
    p_metadata: metadata,
  });
}
