import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  establishmentAccessErrorPayload,
  listAccessibleEstablishments,
} from "@/lib/school/establishmentAccess";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      { error: "Non authentifié", code: "UNAUTHENTICATED" },
      { status: 401 }
    );
  }

  try {
    const result = await listAccessibleEstablishments({ supabase, userId: user.id });
    return NextResponse.json({
      establishments: result.establishments,
      warnings: result.warnings,
      user: { id: user.id, email: user.email ?? "" },
    });
  } catch (error) {
    const payload = establishmentAccessErrorPayload(error);
    return NextResponse.json(payload.body, { status: payload.status });
  }
}
