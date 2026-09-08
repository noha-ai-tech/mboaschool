// GUYSKULL-04A — self-contained service_role client for the population and
// rollback scripts in this directory. Reads NEXT_PUBLIC_SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY from the repo's own .env.local (never printed,
// never committed) so these scripts have no dependency outside the repo.
//
// service_role bypasses RLS entirely — this is the same maintenance path
// already validated as safe for production use in GUYSKULL-03's security
// matrix (tests #14/#15, "service_role maintenance path"). It is used here
// ONLY because no owner/admin session is available for Guyskull and
// publish_school_page_v2 has zero bypass for either (see GUYSKULL-04
// review). Every call site in guyskull04_populate.js/guyskull04_rollback.js
// scopes its target explicitly by establishment_id/id — never a bare
// unfiltered write.
const fs = require("fs");
const path = require("path");
const https = require("https");

function readEnvVar(key) {
  const envPath = path.join(__dirname, "..", "..", "..", ".env.local");
  const env = fs.readFileSync(envPath, "utf-8");
  const m = env.match(new RegExp(`^${key}=(.*)$`, "m"));
  if (!m || !m[1]) throw new Error(`${key} introuvable dans .env.local`);
  return m[1].trim();
}

const SUPABASE_URL = readEnvVar("NEXT_PUBLIC_SUPABASE_URL");
const SERVICE_ROLE_KEY = readEnvVar("SUPABASE_SERVICE_ROLE_KEY");

async function serviceRole(pathAndQuery, { method = "GET", body = null } = {}) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/${pathAndQuery}`);
  const headers = { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`, Prefer: "return=representation" };
  return new Promise((resolve, reject) => {
    const data = body !== null ? JSON.stringify(body) : null;
    const req = https.request(url, {
      method,
      headers: { ...headers, ...(data ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) } : {}) },
    }, (res) => {
      let raw = "";
      res.on("data", (c) => (raw += c));
      res.on("end", () => {
        let parsed = raw;
        try { parsed = JSON.parse(raw); } catch {}
        resolve({ status: res.statusCode, body: parsed });
      });
    });
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

module.exports = { serviceRole, SUPABASE_URL };
