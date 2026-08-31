import { NextResponse } from "next/server";
import type { createClient } from "@/lib/supabase/server";
import {
  establishmentAccessErrorPayload,
  requireEstablishmentAccess,
  type EstablishmentCapability,
} from "./establishmentAccess";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export async function authorizeEstablishmentRoute(input: {
  supabase: SupabaseServerClient;
  requestedEstablishmentId: unknown;
  capability: EstablishmentCapability;
}) {
  try {
    const access = await requireEstablishmentAccess(input);
    return { ok: true as const, ...access };
  } catch (error) {
    const payload = establishmentAccessErrorPayload(error);
    return {
      ok: false as const,
      response: NextResponse.json(payload.body, { status: payload.status }),
    };
  }
}
