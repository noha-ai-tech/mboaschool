// GET /api/intelligence/daily?establishmentId=...&date=YYYY-MM-DD
//
// DAILY-INTELLIGENCE-01 — the only sanctioned way to read
// SchoolDailyIntelligence from the browser. Authorization goes through the
// same requireEstablishmentAccess used by every other Pro-scoped route
// (capability "intelligence:view") — an owner cannot request a school they
// don't own; the failure is an explicit 403, never a silently-zeroed
// result (mission §15/§55). No service_role, no arbitrary SQL: the
// repository (src/lib/intelligence/dailyIntelligence.ts) only ever runs
// server-side, using the caller's own authenticated session.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { authorizeEstablishmentRoute } from "@/lib/school/establishmentRoute";
import { getSchoolDailyIntelligence } from "@/lib/intelligence/dailyIntelligence";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const searchParams = req.nextUrl.searchParams;

  const access = await authorizeEstablishmentRoute({
    supabase,
    requestedEstablishmentId: searchParams.get("establishmentId"),
    capability: "intelligence:view",
  });
  if (!access.ok) return access.response;

  const dateParam = searchParams.get("date");
  if (dateParam !== null && !DATE_PATTERN.test(dateParam)) {
    return NextResponse.json(
      { error: "date doit être au format YYYY-MM-DD", code: "INVALID_DATE" },
      { status: 400 }
    );
  }

  try {
    const intelligence = await getSchoolDailyIntelligence({
      supabase,
      establishmentId: access.establishment.id,
      date: dateParam ?? undefined,
    });
    return NextResponse.json(intelligence);
  } catch (error) {
    // A repository failure must never look like a valid, empty result —
    // that would hide a real error behind the same shape as a legitimate
    // quiet day (mission §55/§56).
    console.error("[api/intelligence/daily]", error);
    return NextResponse.json(
      { error: "Impossible de calculer l'activité du jour", code: "INTELLIGENCE_COMPUTATION_FAILED" },
      { status: 500 }
    );
  }
}
