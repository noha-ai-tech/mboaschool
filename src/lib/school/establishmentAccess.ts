import type { createClient } from "@/lib/supabase/server";
import { isValidEstablishmentId } from "./establishmentContext.ts";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type EstablishmentAccessSource = "owner" | "staff" | "responsibility" | "platform_admin";

export type EstablishmentCapability =
  | "pro:view"
  | "personnel:manage"
  | "teachers:manage"
  | "messaging:manage"
  | "payroll:manage"
  | "attendance:manage"
  | "timetable:manage";

export type AccessibleEstablishment = {
  id: string;
  name: string;
  city: string | null;
  neighborhood: string | null;
  phone: string | null;
  email: string | null;
  whatsapp: string | null;
  website: string | null;
  description: string | null;
  address: string | null;
  main_category: string;
  is_verified: boolean;
  subscription_plan: string;
  forfait: "gratuit" | "gere" | "pro";
  accessSources: EstablishmentAccessSource[];
};

export class EstablishmentAccessError extends Error {
  readonly code:
    | "UNAUTHENTICATED"
    | "INVALID_ESTABLISHMENT_ID"
    | "ESTABLISHMENT_FORBIDDEN"
    | "PRO_PLAN_REQUIRED"
    | "ACCESS_LOOKUP_FAILED";
  readonly status: 400 | 401 | 403 | 500;

  constructor(
    code:
      | "UNAUTHENTICATED"
      | "INVALID_ESTABLISHMENT_ID"
      | "ESTABLISHMENT_FORBIDDEN"
      | "PRO_PLAN_REQUIRED"
      | "ACCESS_LOOKUP_FAILED",
    status: 400 | 401 | 403 | 500,
    message: string
  ) {
    super(message);
    this.name = "EstablishmentAccessError";
    this.code = code;
    this.status = status;
  }
}

const SCHOOL_COLUMNS =
  "id, name, city, neighborhood, phone, email, whatsapp, website, description, address, main_category, is_verified, subscription_plan, forfait";

export async function requireEstablishmentAccess(input: {
  supabase: SupabaseServerClient;
  requestedEstablishmentId: unknown;
  capability: EstablishmentCapability;
  userId?: string;
}) {
  if (!isValidEstablishmentId(input.requestedEstablishmentId)) {
    throw new EstablishmentAccessError(
      "INVALID_ESTABLISHMENT_ID",
      400,
      "requestedEstablishmentId doit être un UUID valide"
    );
  }

  const {
    data: { user },
    error: authError,
  } = await input.supabase.auth.getUser();

  if (authError || !user || (input.userId && input.userId !== user.id)) {
    throw new EstablishmentAccessError("UNAUTHENTICATED", 401, "Non authentifié");
  }

  // PRO-03.1 conserve strictement la frontière owner actuelle. Les sources
  // staff/responsibility sont listées séparément mais ne donnent encore
  // aucune capacité métier tant que la matrice d'autorisation n'est pas validée.
  const { data: establishment, error } = await input.supabase
    .from("establishments")
    .select(SCHOOL_COLUMNS)
    .eq("id", input.requestedEstablishmentId)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (error) {
    throw new EstablishmentAccessError(
      "ACCESS_LOOKUP_FAILED",
      500,
      "Impossible de vérifier l'accès à l'établissement"
    );
  }
  if (!establishment) {
    throw new EstablishmentAccessError(
      "ESTABLISHMENT_FORBIDDEN",
      403,
      "Accès refusé pour cet établissement"
    );
  }
  if (establishment.forfait !== "pro") {
    throw new EstablishmentAccessError(
      "PRO_PLAN_REQUIRED",
      403,
      "Cette fonctionnalité nécessite le forfait Pro"
    );
  }

  return {
    establishment: establishment as Omit<AccessibleEstablishment, "accessSources">,
    accessSource: "owner" as const,
    capability: input.capability,
    user,
  };
}

export async function listAccessibleEstablishments(input: {
  supabase: SupabaseServerClient;
  userId: string;
}): Promise<{ establishments: AccessibleEstablishment[]; warnings: string[] }> {
  const warnings: string[] = [];
  const byId = new Map<string, AccessibleEstablishment>();

  const { data: owned, error: ownedError } = await input.supabase
    .from("establishments")
    .select(SCHOOL_COLUMNS)
    .eq("owner_id", input.userId)
    .order("created_at", { ascending: true });

  if (ownedError) {
    throw new EstablishmentAccessError(
      "ACCESS_LOOKUP_FAILED",
      500,
      "Impossible de lister les établissements possédés"
    );
  }

  for (const school of owned ?? []) {
    byId.set(school.id, { ...(school as any), accessSources: ["owner"] });
  }

  const { data: memberships, error: staffError } = await input.supabase
    .from("staff_members")
    .select(`etablissement_id, establishments(${SCHOOL_COLUMNS})`)
    .eq("user_id", input.userId)
    .eq("status", "actif");

  if (staffError) {
    // Safe degradation while legacy policies still depend on the scalar
    // current_establishment_id(): never widen access, preserve owner schools.
    warnings.push("STAFF_MEMBERSHIP_LOOKUP_UNAVAILABLE");
  } else {
    for (const membership of memberships ?? []) {
      const school = membership.establishments as unknown as Omit<AccessibleEstablishment, "accessSources"> | null;
      if (!school) continue;
      const existing = byId.get(school.id);
      if (existing) {
        if (!existing.accessSources.includes("staff")) existing.accessSources.push("staff");
      } else {
        byId.set(school.id, { ...school, accessSources: ["staff"] });
      }
    }
  }

  // Responsibilities are deliberately excluded until their business matrix
  // is approved. Platform admins use their paginated platform workflow.
  return { establishments: Array.from(byId.values()), warnings };
}

export function establishmentAccessErrorPayload(error: unknown): {
  status: number;
  body: { error: string; code: string };
} {
  if (error instanceof EstablishmentAccessError) {
    return { status: error.status, body: { error: error.message, code: error.code } };
  }
  return {
    status: 500,
    body: { error: "Erreur de validation de l'établissement", code: "ACCESS_LOOKUP_FAILED" },
  };
}
