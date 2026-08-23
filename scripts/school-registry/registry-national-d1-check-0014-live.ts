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

  const marker = `D1-0014-CHECK-${randomUUID().slice(0, 8)}`;
  const testEmail = `d1-0014-check-${Date.now()}@ecoles237-internal-test.invalid`;
  const testPassword = `D1-test-${randomUUID()}-Aa1!`;
  let testUserId: string | null = null;
  let testEstablishmentId: string | null = null;
  const log: any = { generated_at: new Date().toISOString(), marker };

  try {
    const { data: createdUser, error: e1 } = await admin.auth.admin.createUser({ email: testEmail, password: testPassword, email_confirm: true });
    if (e1) throw e1;
    testUserId = createdUser.user.id;

    const { data: createdEst, error: e2 } = await admin
      .from("establishments")
      .insert({ name: `ZZZ_${marker}_DELETE_ME`, slug: `zzz-${marker.toLowerCase()}-delete-me`, main_category: "autres", owner_id: testUserId, is_verified: false, city: "TEST" })
      .select("id, is_verified")
      .single();
    if (e2) throw e2;
    testEstablishmentId = createdEst.id;

    const userClient = createClient(url, anonKey);
    const { error: e3 } = await userClient.auth.signInWithPassword({ email: testEmail, password: testPassword });
    if (e3) throw e3;

    const { data: upd, error: updErr } = await userClient
      .from("establishments")
      .update({ is_verified: true })
      .eq("id", testEstablishmentId)
      .select("is_verified")
      .single();

    log.attempted_field = "is_verified";
    log.attempted_value = true;
    log.write_succeeded = !updErr && upd?.is_verified === true;
    log.error = updErr ? { code: updErr.code, message: updErr.message } : null;

    const { data: finalState } = await admin.from("establishments").select("is_verified").eq("id", testEstablishmentId).single();
    log.final_state_service_role_read = finalState;
    log.conclusion = log.write_succeeded
      ? "0014_rc1_security_fixes.sql's trigger (protect_establishment_privileged_columns) is NOT live — owner successfully self-verified via direct REST."
      : "0014_rc1_security_fixes.sql's trigger IS live and correctly blocked the owner's attempt to self-verify.";
  } finally {
    const cleanup: any = {};
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
    writeFileSync(join(REPORTS_DIR, "registry-national-d1-0014-live-check.json"), JSON.stringify(log, null, 2));
    console.log(JSON.stringify(log, null, 2));
  }
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
