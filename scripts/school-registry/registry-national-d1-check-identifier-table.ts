import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
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
  const anonKey = readEnvVar(env, "NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const serviceKey = readEnvVar(env, "SUPABASE_SERVICE_ROLE_KEY");
  const admin = createClient(url, serviceKey);

  const marker = `D1-IDTABLE-CHECK-${randomUUID().slice(0, 8)}`;
  const testEmail = `d1-idtable-check-${Date.now()}@ecoles237-internal-test.invalid`;
  const testPassword = `D1-test-${randomUUID()}-Aa1!`;
  let testUserId: string | null = null;
  let testEstablishmentId: string | null = null;
  let insertedIdentifierId: string | null = null;
  const log: any = { generated_at: new Date().toISOString(), marker };

  try {
    // Table existence + column shape (service role read).
    const { data: existing, error: existErr, count } = await admin
      .from("establishment_registry_identifiers")
      .select("*", { count: "exact" })
      .limit(1);
    log.table_exists_live = !existErr;
    log.total_row_count = count;
    log.sample_columns = existing && existing[0] ? Object.keys(existing[0]) : "table empty or error";

    const { data: createdUser, error: e1 } = await admin.auth.admin.createUser({ email: testEmail, password: testPassword, email_confirm: true });
    if (e1) throw e1;
    testUserId = createdUser.user.id;

    const { data: createdEst, error: e2 } = await admin
      .from("establishments")
      .insert({ name: `ZZZ_${marker}_DELETE_ME`, slug: `zzz-${marker.toLowerCase()}-delete-me`, main_category: "autres", owner_id: testUserId, is_verified: false, city: "TEST" })
      .select("id")
      .single();
    if (e2) throw e2;
    testEstablishmentId = createdEst.id;

    const userClient = createClient(url, anonKey);
    const { error: e3 } = await userClient.auth.signInWithPassword({ email: testEmail, password: testPassword });
    if (e3) throw e3;

    // Owner attempts INSERT into establishment_registry_identifiers for their OWN establishment.
    const { data: insData, error: insErr } = await userClient
      .from("establishment_registry_identifiers")
      .insert({
        establishment_id: testEstablishmentId,
        authority: "FAKE_AUTHORITY",
        registry: "FAKE_REGISTRY",
        identifier: `FAKE-${marker}`,
        verification_status: "CONFIRMED",
      })
      .select("id")
      .single();
    log.owner_insert_attempt = {
      succeeded: !insErr,
      error: insErr ? { code: insErr.code, message: insErr.message } : null,
    };
    if (insData?.id) insertedIdentifierId = insData.id;

    // Owner attempts SELECT (should also be blocked — platform_admin only).
    const { data: selData, error: selErr } = await userClient
      .from("establishment_registry_identifiers")
      .select("*")
      .eq("establishment_id", testEstablishmentId);
    log.owner_select_attempt = {
      rows_returned: selData?.length ?? 0,
      error: selErr ? { code: selErr.code, message: selErr.message } : null,
      note: "0 rows expected even if no error — RLS silently filters, doesn't necessarily throw",
    };

    // If insert somehow succeeded, verify via service role and attempt owner UPDATE/DELETE too.
    if (insertedIdentifierId) {
      const { error: updErr } = await userClient
        .from("establishment_registry_identifiers")
        .update({ verification_status: "CORROBORATED" })
        .eq("id", insertedIdentifierId);
      log.owner_update_attempt = { succeeded: !updErr, error: updErr ? { code: updErr.code, message: updErr.message } : null };

      const { error: delErr } = await userClient
        .from("establishment_registry_identifiers")
        .delete()
        .eq("id", insertedIdentifierId);
      log.owner_delete_attempt = { succeeded: !delErr, error: delErr ? { code: delErr.code, message: delErr.message } : null };
    } else {
      log.owner_update_attempt = "N/A — insert did not succeed, no row to attempt update on";
      log.owner_delete_attempt = "N/A — insert did not succeed, no row to attempt delete on";
    }

    log.conclusion = log.owner_insert_attempt.succeeded
      ? "VULNERABILITY: an authenticated owner can insert fabricated registry identifier rows for their own establishment."
      : "SAFE: establishment_registry_identifiers correctly rejects owner-level INSERT — RLS has no permissive policy for authenticated/anon roles, only service_role (which bypasses RLS) can write.";
  } finally {
    const cleanup: any = {};
    if (insertedIdentifierId) {
      const { error } = await admin.from("establishment_registry_identifiers").delete().eq("id", insertedIdentifierId);
      cleanup.leftover_identifier_deleted = !error;
    }
    if (testEstablishmentId) {
      const { error } = await admin.from("establishments").delete().eq("id", testEstablishmentId);
      cleanup.establishment_deleted = !error;
    }
    if (testUserId) {
      const { error } = await admin.auth.admin.deleteUser(testUserId);
      cleanup.user_deleted = !error;
    }
    log.cleanup = cleanup;
    mkdirSync(REPORTS_DIR, { recursive: true });
    writeFileSync(join(REPORTS_DIR, "registry-national-d1-identifier-table-security.json"), JSON.stringify(log, null, 2));
    console.log(JSON.stringify(log, null, 2));
  }
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
