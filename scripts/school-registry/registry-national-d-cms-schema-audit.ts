import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..", "..");
const REPORTS_DIR = join(rootDir, "reports", "registry");

function readEnvVar(env: string, key: string): string {
  const match = env.match(new RegExp(`^${key}=(.*)$`, "m"));
  const value = match?.[1]?.trim();
  if (!value) throw new Error(`${key} introuvable dans .env.local`);
  return value;
}

const REGISTRY_PROTECTED = new Set([
  "id", "official_id", "source_ministry", "source_reference", "source_url",
  "source_updated_at", "registry_import_batch",
]);
const ADMIN_ONLY = new Set([
  "is_verified", "is_featured", "subscription_plan", "forfait", "verification_status", "owner_id",
]);
const REGISTRY_TABLE_PROTECTED = "establishment_registry_identifiers.* (separate table, platform_admin RLS only per 0021)";

// Potential owner-editable CMS content areas per REGISTRY-NATIONAL-D §27.
const CONTENT_AREA_MAP: Record<string, string[]> = {
  description: ["description"],
  public_phone: ["phone", "whatsapp"],
  public_email: ["email"],
  website: ["website"],
  address_display: ["address", "city", "neighborhood", "quartier", "region", "latitude", "longitude"],
  opening_hours: [],
  social_links: [],
  logo: ["emoji_logo", "couleur_primaire", "couleur_secondaire"],
  cover_image: ["cover_image_url"],
  gallery: [],
  programs: [],
  courses: [],
  admission_info: [],
  tuition_info: [],
  facilities: [],
};

async function main() {
  const env = readFileSync(join(rootDir, ".env.local"), "utf-8");
  const url = readEnvVar(env, "NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = readEnvVar(env, "SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(url, serviceKey);

  const { data, error } = await supabase.from("establishments").select("*").limit(1);
  if (error) throw error;
  const liveColumns: string[] = data && data[0] ? Object.keys(data[0]) : [];

  // Related tables that may back "gallery" / "fees" / "infrastructure" content areas.
  const relatedTableProbe: Record<string, boolean> = {};
  for (const t of ["establishment_images", "school_fees", "school_infrastructures", "school_programs", "school_courses"]) {
    const { error: e } = await supabase.from(t).select("*", { count: "exact", head: true });
    relatedTableProbe[t] = !e;
  }

  const columnClassification = liveColumns.map((col) => {
    let cls = "EXISTS_AND_OWNER_EDITABLE";
    if (REGISTRY_PROTECTED.has(col)) cls = "REGISTRY_PROTECTED";
    else if (ADMIN_ONLY.has(col)) cls = "ADMIN_ONLY";
    else if (["id", "created_at", "slug"].includes(col)) cls = "EXISTS_BUT_NEEDS_POLICY";
    else if (["main_category", "sub_category", "education_family"].includes(col)) cls = "EXISTS_BUT_NEEDS_POLICY";
    return { column: col, classification: cls };
  });

  const contentAreaAudit = Object.entries(CONTENT_AREA_MAP).map(([area, cols]) => {
    const existing = cols.filter((c) => liveColumns.includes(c));
    const missing = cols.filter((c) => !liveColumns.includes(c));
    let status: string;
    if (cols.length === 0) status = "MISSING_SCHEMA";
    else if (existing.length === cols.length) status = "EXISTS_AND_OWNER_EDITABLE";
    else if (existing.length > 0) status = "EXISTS_BUT_NEEDS_POLICY";
    else status = "MISSING_SCHEMA";
    return { content_area: area, backing_columns_found: existing, backing_columns_missing: missing, status };
  });

  const report = {
    sprint: "REGISTRY-NATIONAL-D",
    generated_at: new Date().toISOString(),
    method: "Live query of establishments (1 row, all columns) + head-count probes of related tables. Schema not assumed.",
    live_column_count: liveColumns.length,
    live_columns: liveColumns,
    column_classification: columnClassification,
    related_tables_present: relatedTableProbe,
    content_area_audit: contentAreaAudit.map((c) => ({
      ...c,
      note:
        c.content_area === "gallery"
          ? `MISSING_SCHEMA on establishments itself, but establishment_images table exists (present=${relatedTableProbe["establishment_images"]}) — likely backs gallery separately, NEEDS_PRODUCT_DECISION on which table CMS-A should target.`
          : c.content_area === "programs" || c.content_area === "courses"
          ? `MISSING_SCHEMA — school_programs/school_courses table presence: programs=${relatedTableProbe["school_programs"]}, courses=${relatedTableProbe["school_courses"]}. NEEDS_PRODUCT_DECISION.`
          : c.content_area === "tuition_info"
          ? `MISSING_SCHEMA on establishments — school_fees table presence=${relatedTableProbe["school_fees"]}. NEEDS_PRODUCT_DECISION.`
          : c.content_area === "facilities"
          ? `MISSING_SCHEMA on establishments — school_infrastructures table presence=${relatedTableProbe["school_infrastructures"]}. NEEDS_PRODUCT_DECISION.`
          : c.content_area === "opening_hours" || c.content_area === "social_links" || c.content_area === "admission_info"
          ? "No column and no obviously-named related table found this sprint — genuinely MISSING_SCHEMA, would need a new migration. NEEDS_PRODUCT_DECISION on scope."
          : undefined,
    })),
  };

  mkdirSync(REPORTS_DIR, { recursive: true });
  writeFileSync(join(REPORTS_DIR, "registry-national-d-cms-schema-audit.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
