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

  const marker = `D1-FULLCHECK-${randomUUID().slice(0, 8)}`;
  const testEmail = `d1-fullcheck-${Date.now()}@ecoles237-internal-test.invalid`;
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
      .select("id")
      .single();
    if (e2) throw e2;
    testEstablishmentId = createdEst.id;

    const userClient = createClient(url, anonKey);
    const { error: e3 } = await userClient.auth.signInWithPassword({ email: testEmail, password: testPassword });
    if (e3) throw e3;

    // 1. The 6th registry-protected field not covered by the earlier repro test.
    const { error: sourceUpdatedAtErr } = await userClient
      .from("establishments")
      .update({ source_updated_at: new Date().toISOString() })
      .eq("id", testEstablishmentId);
    log.source_updated_at_blocked = !!sourceUpdatedAtErr;
    log.source_updated_at_error = sourceUpdatedAtErr ? { code: sourceUpdatedAtErr.code, message: sourceUpdatedAtErr.message } : null;

    // 2. Confirm the PRE-EXISTING 0014 trigger still independently works (coexistence check).
    const { error: isVerifiedErr } = await userClient
      .from("establishments")
      .update({ is_verified: true })
      .eq("id", testEstablishmentId);
    log.is_verified_still_blocked_by_0014 = !!isVerifiedErr;
    log.is_verified_error = isVerifiedErr ? { code: isVerifiedErr.code, message: isVerifiedErr.message } : null;

    // 3. Legitimate multi-field content update still works (name + description + phone together).
    const { data: multiUpd, error: multiErr } = await userClient
      .from("establishments")
      .update({ description: `multi-field legit update ${marker}`, phone: "+237600000000", city: "Yaoundé" })
      .eq("id", testEstablishmentId)
      .select("description, phone, city")
      .single();
    log.legitimate_multi_field_update = { succeeded: !multiErr, result: multiUpd, error: multiErr ? multiErr.message : null };

    // 4. A single UPDATE mixing ONE legitimate field + ONE protected field must be rejected atomically
    //    (the whole statement fails — the legitimate field must NOT be silently applied while ignoring the protected one).
    const { error: mixedErr } = await userClient
      .from("establishments")
      .update({ description: "should NOT be applied", official_id: "SHOULD-BLOCK-EVERYTHING" })
      .eq("id", testEstablishmentId);
    const { data: afterMixed } = await admin.from("establishments").select("description, official_id").eq("id", testEstablishmentId).single();
    log.mixed_update_atomicity = {
      update_call_errored: !!mixedErr,
      description_after: afterMixed?.description,
      official_id_after: afterMixed?.official_id,
      correct_atomic_rejection: afterMixed?.description !== "should NOT be applied" && afterMixed?.official_id === null,
    };

    // 5. Service-role (trusted pipeline) can still write registry fields freely on this same row.
    const { error: serviceErr } = await admin
      .from("establishments")
      .update({ official_id: "SERVICE-ROLE-OK", source_ministry: "MINTRANSPORT" })
      .eq("id", testEstablishmentId);
    const { data: afterService } = await admin.from("establishments").select("official_id, source_ministry").eq("id", testEstablishmentId).single();
    log.service_role_pipeline_unaffected = {
      update_call_errored: !!serviceErr,
      result: afterService,
      correct: !serviceErr && afterService?.official_id === "SERVICE-ROLE-OK" && afterService?.source_ministry === "MINTRANSPORT",
    };

    log.overall_conclusion =
      log.source_updated_at_blocked &&
      log.is_verified_still_blocked_by_0014 &&
      log.legitimate_multi_field_update.succeeded &&
      log.mixed_update_atomicity.correct_atomic_rejection &&
      log.service_role_pipeline_unaffected.correct
        ? "ALL POST-MIGRATION CHECKS PASS"
        : "AT LEAST ONE CHECK FAILED — review individual fields above";
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
    writeFileSync(join(REPORTS_DIR, "registry-national-d1-post-migration-full-check.json"), JSON.stringify(log, null, 2));
    console.log(JSON.stringify(log, null, 2));
  }
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
