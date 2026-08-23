import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..", "..");
const REPORTS_DIR = join(rootDir, "reports", "release");

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

  const marker = `RELEASE-A-STORAGE-${randomUUID().slice(0, 8)}`;
  const testEmail = `release-a-storage-${Date.now()}@ecoles237-internal-test.invalid`;
  const testPassword = `RA-test-${randomUUID()}-Aa1!`;
  let testUserId: string | null = null;
  const testEstablishmentIds: string[] = [];
  const log: any = { generated_at: new Date().toISOString(), marker };

  try {
    const { data: bucketsList } = await admin.storage.listBuckets();
    log.buckets_present = (bucketsList ?? []).map((b) => b.name);
    log.school_images_bucket_exists = (bucketsList ?? []).some((b) => b.name === "school-images");

    const { data: createdUser, error: e1 } = await admin.auth.admin.createUser({ email: testEmail, password: testPassword, email_confirm: true });
    if (e1) throw e1;
    testUserId = createdUser.user.id;

    // Create TWO establishments owned by the SAME user — this is exactly the scenario 0025 fixes.
    for (let i = 0; i < 2; i++) {
      const { data: est, error } = await admin
        .from("establishments")
        .insert({ name: `ZZZ_${marker}_${i}_DELETE_ME`, slug: `zzz-${marker.toLowerCase()}-${i}-delete-me`, main_category: "autres", owner_id: testUserId, is_verified: false, city: "TEST" })
        .select("id")
        .single();
      if (error) throw error;
      testEstablishmentIds.push(est.id);
    }
    log.owner_has_multiple_establishments = testEstablishmentIds.length === 2;

    if (!log.school_images_bucket_exists) {
      log.conclusion = "school-images bucket does not exist live — cannot test the multi-school storage bug at all. This is separate from the 0007/0025 policy question.";
    } else {
      const userClient = createClient(url, anonKey);
      const { error: signInErr } = await userClient.auth.signInWithPassword({ email: testEmail, password: testPassword });
      if (signInErr) throw signInErr;

      const testFile = new Blob(["test content"], { type: "text/plain" });
      const path = `${testEstablishmentIds[0]}/test-${marker}.txt`;
      const { error: uploadErr } = await userClient.storage.from("school-images").upload(path, testFile);

      log.multi_school_owner_upload_attempt = {
        target_path: path,
        succeeded: !uploadErr,
        error: uploadErr ? { message: uploadErr.message, name: uploadErr.name } : null,
      };
      log.bug_reproduced_live = !!uploadErr && /more than one row|subquery/i.test(uploadErr.message ?? "");
      log.conclusion = log.bug_reproduced_live
        ? "CONFIRMED LIVE — the scalar-subquery bug from 0007 is real and currently breaks uploads for any owner with 2+ establishments, exactly as 0025's header describes."
        : uploadErr
        ? `Upload failed but with a DIFFERENT error than the documented bug — needs manual review: ${uploadErr.message}`
        : "Upload SUCCEEDED — either 0007's buggy policy is not live, or Postgres/PostgREST handled the scalar subquery differently than expected. Needs manual review before trusting 0025's problem statement blindly.";

      if (!uploadErr) {
        await admin.storage.from("school-images").remove([path]);
      }
    }
  } finally {
    const cleanup: any = {};
    if (testEstablishmentIds.length) {
      const { error } = await admin.from("establishments").delete().in("id", testEstablishmentIds);
      cleanup.establishments_deleted = !error;
    }
    if (testUserId) {
      const { error } = await admin.auth.admin.deleteUser(testUserId);
      cleanup.user_deleted = !error;
    }
    log.cleanup = cleanup;
    mkdirSync(REPORTS_DIR, { recursive: true });
    writeFileSync(join(REPORTS_DIR, "release-integration-a-storage-security.json"), JSON.stringify(log, null, 2));
    console.log(JSON.stringify(log, null, 2));
  }
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
