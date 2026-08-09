// Modèle de permissions du Platform Operating Center (Mission 08, Phase 2).
//
// Le middleware (src/middleware.ts) applique déjà la barrière large :
// role === 'platform_admin' pour tout /dashboard/admin/*. Cette barrière
// n'est PAS modifiée dans cette mission (elle protège correctement les
// écoles et les enseignants, voir Phase 11). Ce module ajoute une seconde
// couche, plus fine, à l'intérieur même du POC : quel admin_role peut faire
// quoi. Vérifiée côté client (masquer/désactiver) ET côté serveur dans
// chaque route API sensible (autorité réelle) — jamais côté client seul.

export type PlatformAdminRole = "super_admin" | "platform_admin" | "operations_admin";

export type PlatformPermission =
  | "manage_admins"        // créer/modifier le rôle d'un autre administrateur
  | "manage_schools"       // suspendre/réactiver/vérifier/changer le plan
  | "manage_crm"
  | "manage_subscriptions"
  | "view_payments"
  | "manage_support"
  | "view_audit_log"
  | "view_statistics";

// super_admin > platform_admin > operations_admin, mais pas une simple
// hiérarchie numérique : operations_admin est volontairement restreint aux
// tâches de terrain (écoles, CRM, support) sans visibilité commerciale
// (abonnements/paiements) ni sur le journal d'audit. Seul super_admin gère
// les autres administrateurs.
const PERMISSIONS: Record<PlatformAdminRole, PlatformPermission[]> = {
  super_admin: [
    "manage_admins", "manage_schools", "manage_crm", "manage_subscriptions",
    "view_payments", "manage_support", "view_audit_log", "view_statistics",
  ],
  platform_admin: [
    "manage_schools", "manage_crm", "manage_subscriptions",
    "view_payments", "manage_support", "view_audit_log", "view_statistics",
  ],
  operations_admin: [
    "manage_schools", "manage_crm", "manage_support", "view_statistics",
  ],
};

export function can(adminRole: PlatformAdminRole | null | undefined, permission: PlatformPermission): boolean {
  if (!adminRole) return false;
  return PERMISSIONS[adminRole]?.includes(permission) ?? false;
}

export const ADMIN_ROLE_LABELS: Record<PlatformAdminRole, string> = {
  super_admin: "Super Admin",
  platform_admin: "Platform Admin",
  operations_admin: "Operations Admin",
};
