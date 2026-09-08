import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ilikeOrGroup } from "@/lib/search/queryBuilder";
import { normalizeSearchText, serverSearchWordForms } from "@/lib/search/normalizeSearchText";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const raw = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 80);
  const normalized = normalizeSearchText(raw);
  if (normalized.length < 2) return NextResponse.json({ cities: [], schools: [] });

  try {
    const supabase = await createClient();
    const forms = serverSearchWordForms(normalized);
    const { data, error } = await supabase
      .from("establishments")
      .select("id, name, city, is_claimed")
      .or(ilikeOrGroup(["name", "city"], forms))
      .order("name", { ascending: true })
      .limit(12);

    if (error) throw error;
    const rows = data ?? [];
    const cities = Array.from(new Set(
      rows
        .map((row) => row.city?.trim())
        .filter((city): city is string => Boolean(city) && normalizeSearchText(city!).includes(normalized))
    )).slice(0, 4);
    const schools = rows
      .filter((row) => normalizeSearchText(row.name ?? "").includes(normalized))
      .slice(0, 6);

    return NextResponse.json({ cities, schools });
  } catch (error) {
    console.error("[/api/search-suggestions] Query failed:", error);
    return NextResponse.json({ cities: [], schools: [] });
  }
}
