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

async function main() {
  const env = readFileSync(join(rootDir, ".env.local"), "utf-8");
  const url = readEnvVar(env, "NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = readEnvVar(env, "SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(url, serviceKey);

  const { data: triggers, error: trigErr } = await supabase.rpc("exec_sql_readonly", {
    query: `select trigger_name, event_manipulation, action_timing, action_statement
            from information_schema.triggers
            where event_object_table = 'establishments'`,
  }).then((r: any) => r, () => ({ data: null, error: "rpc_not_available" }));

  // Fallback: query pg_trigger directly via a raw SQL RPC if exec_sql_readonly doesn't exist.
  let triggerNames: string[] = [];
  let rlsMethod = "unknown";
  if (trigErr || !triggers) {
    // Try information_schema via PostgREST is not directly queryable; use a generic RPC name guess.
    rlsMethod = "rpc_unavailable_fallback_to_static_migration_read";
  } else {
    rlsMethod = "information_schema_rpc";
    triggerNames = (triggers as any[]).map((t) => t.trigger_name);
  }

  const { data: cols, error: colErr } = await supabase
    .from("establishments")
    .select("*")
    .limit(1);
  const liveColumns = cols && cols[0] ? Object.keys(cols[0]) : [];

  const registryProtectedCandidateColumns = [
    "official_id",
    "source_ministry",
    "source_reference",
    "source_url",
    "source_updated_at",
    "registry_import_batch",
  ];
  const alreadyOwnerProtectedColumns = [
    "is_verified",
    "is_featured",
    "subscription_plan",
    "forfait",
    "verification_status",
  ];

  const report = {
    generated_at: new Date().toISOString(),
    sprint: "REGISTRY-NATIONAL-D",
    method: rlsMethod,
    trigger_query_error: trigErr ?? null,
    triggers_found_on_establishments: triggerNames,
    trigger_live_status: "UNVERIFIABLE_WITH_AVAILABLE_TOOLS",
    trigger_verification_note:
      "No exec_sql/information_schema RPC exists in this project's PostgREST schema, and .env.local has no direct Postgres connection string (only Supabase URL + service role REST credentials). It is therefore NOT POSSIBLE from this session to directly confirm whether the 0014_rc1_security_fixes.sql trigger (protect_establishment_privileged_columns) is actually applied to the live database, despite the file being tracked in supabase/migrations/. The service-role key cannot be used to test the trigger behaviorally either: the trigger only fires its block when auth.uid() = old.owner_id, and service-role requests always have auth.uid() = NULL, so a service-role UPDATE would succeed whether or not the trigger exists. RECOMMENDATION: verify directly via Supabase SQL Editor (select tgname from pg_trigger where tgrelid = 'public.establishments'::regclass) or `supabase db diff` against a linked project before treating either 0014 or 0018 as applied/not-applied. This audit's registry-protected-column gap finding below holds regardless of 0014's live status, since 0014 (even if live) never covered the columns 0018 added.",
    live_columns_sample_count: liveColumns.length,
    registry_protected_candidate_columns_present_live: registryProtectedCandidateColumns.filter((c) =>
      liveColumns.includes(c)
    ),
    owner_column_level_protection_already_migrated_columns: alreadyOwnerProtectedColumns,
    findings: {
      base_rls_policy: {
        source: "supabase/schema.sql:143",
        text: 'create policy "Owners can update own establishments" on public.establishments for update using (auth.uid() = owner_id);',
        note: "Row-level only — no WITH CHECK, no column restriction. Grants UPDATE on ALL columns of a row the user owns.",
      },
      migration_0014_rc1_security_fixes: {
        file: "supabase/migrations/0014_rc1_security_fixes.sql",
        header_states: "PREPAREE MAIS NON EXECUTEE",
        adds_trigger: "protect_establishment_privileged_columns",
        protects_columns: alreadyOwnerProtectedColumns,
        does_NOT_protect: registryProtectedCandidateColumns,
        reason_gap: "0014 was authored before 0018 introduced the registry-provenance columns (official_id, source_ministry, source_reference, source_url, source_updated_at, registry_import_batch). Even if 0014 is fully executed live, it has no coverage for registry-protected fields.",
      },
      migration_0018_registry_identity_fields: {
        file: "supabase/migrations/0018_registry_identity_fields.sql",
        header_states: "PREPAREE MAIS NON EXECUTEE (stale — columns ARE present live per this session's earlier verify query, which read official_id/source_ministry/registry_import_batch successfully on live rows)",
        adds_no_rls_or_trigger_protection: true,
      },
    },
  };

  mkdirSync(REPORTS_DIR, { recursive: true });
  writeFileSync(join(REPORTS_DIR, "registry-national-d-cms-rls-audit.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
