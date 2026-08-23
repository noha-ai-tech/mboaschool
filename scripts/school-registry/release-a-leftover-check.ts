import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

function readEnvVar(env: string, key: string): string {
  const match = env.match(new RegExp("^" + key + "=(.*)$", "m"));
  const value = match?.[1]?.trim();
  if (!value) throw new Error(key + " introuvable");
  return value;
}

async function main() {
  const env = readFileSync(join(process.cwd(), ".env.local"), "utf-8");
  const url = readEnvVar(env, "NEXT_PUBLIC_SUPABASE_URL");
  const key = readEnvVar(env, "SUPABASE_SERVICE_ROLE_KEY");
  const admin = createClient(url, key);

  const { data: leftoverEst } = await admin
    .from("establishments")
    .select("id, name, created_at")
    .ilike("name", "%DELETE_ME%");
  console.log("Leftover ZZZ test establishments:", leftoverEst?.length ?? 0, leftoverEst);

  const { data: usersPage } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const testUsers = (usersPage?.users ?? []).filter((u) => u.email?.includes("ecoles237-internal-test.invalid"));
  console.log("Leftover test auth users:", testUsers.length, testUsers.map((u) => u.email));
}

main().catch((e) => { console.error(e); process.exit(1); });
