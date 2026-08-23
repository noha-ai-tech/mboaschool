import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
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

const PHASE = process.argv[2]; // "before" | "after"
if (PHASE !== "before" && PHASE !== "after") {
  console.error("Usage: registry-national-d1-owner-write-repro.ts <before|after>");
  process.exit(1);
}

async function main() {
  const env = readFileSync(join(rootDir, ".env.local"), "utf-8");
  const url = readEnvVar(env, "NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = readEnvVar(env, "NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const serviceKey = readEnvVar(env, "SUPABASE_SERVICE_ROLE_KEY");
  const admin = createClient(url, serviceKey);

  const marker = `D1-SECURITY-TEST-${randomUUID().slice(0, 8)}`;
  const testEmail = `d1-security-test-${Date.now()}@ecoles237-internal-test.invalid`;
  const testPassword = `D1-test-${randomUUID()}-Aa1!`;

  let testUserId: string | null = null;
  let testEstablishmentId: string | null = null;
  const log: any = { phase: PHASE, marker, generated_at: new Date().toISOString() };

  try {
    // ── 1. Create a throwaway auth user (service role) ──
    const { data: createdUser, error: createUserErr } = await admin.auth.admin.createUser({
      email: testEmail,
      password: testPassword,
      email_confirm: true,
    });
    if (createUserErr) throw createUserErr;
    testUserId = createdUser.user.id;
    log.test_user_id = testUserId;

    // ── 2. Create a throwaway establishment row owned by that user (service role, clearly-marked test data) ──
    const { data: createdEst, error: createEstErr } = await admin
      .from("establishments")
      .insert({
        name: `ZZZ_${marker}_DO_NOT_USE_DELETE_ME`,
        slug: `zzz-${marker.toLowerCase()}-delete-me`,
        main_category: "autres",
        owner_id: testUserId,
        is_verified: false,
        city: "TEST",
        official_id: null,
        source_ministry: null,
      })
      .select("id, name, official_id, source_ministry, registry_import_batch")
      .single();
    if (createEstErr) throw createEstErr;
    testEstablishmentId = createdEst.id;
    log.test_establishment_id = testEstablishmentId;
    log.test_establishment_initial_state = createdEst;

    // ── 3. Sign in as the test user with the ANON key (real RLS-subject client, not service role) ──
    const userClient = createClient(url, anonKey);
    const { data: signInData, error: signInErr } = await userClient.auth.signInWithPassword({
      email: testEmail,
      password: testPassword,
    });
    if (signInErr) throw signInErr;
    log.signed_in_as_test_user = !!signInData.session;

    // ── 4a. Attempt a LEGITIMATE content-field update (expected: ALLOWED, both before and after) ──
    const { data: legitUpdate, error: legitErr } = await userClient
      .from("establishments")
      .update({ description: `legit update by owner — ${marker}` })
      .eq("id", testEstablishmentId)
      .select("description")
      .single();
    log.legitimate_content_update = {
      attempted_field: "description",
      succeeded: !legitErr && legitUpdate?.description === `legit update by owner — ${marker}`,
      error: legitErr ? { code: legitErr.code, message: legitErr.message } : null,
    };

    // ── 4b. Attempt to modify each registry-protected field (expected: BLOCKED before AND after fix) ──
    const protectedFieldAttempts: Record<string, any> = {};
    for (const [field, value] of Object.entries({
      source_ministry: "MINESUP",
      official_id: `FAKE-${marker}`,
      registry_import_batch: `fake-batch-${marker}`,
      source_reference: `fake-ref-${marker}`,
      source_url: `https://fake.example/${marker}`,
    })) {
      const { data: upd, error: err } = await userClient
        .from("establishments")
        .update({ [field]: value })
        .eq("id", testEstablishmentId)
        .select(field)
        .single();
      protectedFieldAttempts[field] = {
        attempted_value: value,
        write_succeeded: !err && (upd as any)?.[field] === value,
        error: err ? { code: err.code, message: err.message } : null,
        row_after_attempt: upd,
      };
    }
    log.protected_field_write_attempts = protectedFieldAttempts;

    // ── 5. Independent re-read via service role to confirm true DB state ──
    const { data: finalState } = await admin
      .from("establishments")
      .select("id, description, official_id, source_ministry, registry_import_batch, source_reference, source_url")
      .eq("id", testEstablishmentId)
      .single();
    log.final_state_service_role_read = finalState;

    log.summary = {
      legitimate_update_allowed: log.legitimate_content_update.succeeded,
      any_protected_field_write_succeeded: Object.values(protectedFieldAttempts).some((a: any) => a.write_succeeded),
      protected_fields_blocked: Object.fromEntries(
        Object.entries(protectedFieldAttempts).map(([f, a]: [string, any]) => [f, !a.write_succeeded])
      ),
    };
  } finally {
    // ── Cleanup — always, regardless of outcome ──
    const cleanup: any = {};
    if (testEstablishmentId) {
      const { error } = await admin.from("establishments").delete().eq("id", testEstablishmentId);
      cleanup.establishment_deleted = !error;
      cleanup.establishment_delete_error = error?.message ?? null;
    }
    if (testUserId) {
      const { error } = await admin.auth.admin.deleteUser(testUserId);
      cleanup.user_deleted = !error;
      cleanup.user_delete_error = error?.message ?? null;
    }
    log.cleanup = cleanup;

    mkdirSync(REPORTS_DIR, { recursive: true });
    const outPath = join(REPORTS_DIR, `registry-national-d1-owner-write-reproduction-${PHASE}.json`);
    writeFileSync(outPath, JSON.stringify(log, null, 2));
    console.log(JSON.stringify(log, null, 2));
  }
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
