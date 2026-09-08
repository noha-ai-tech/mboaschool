// GUYSKULL-05B — minimal service-role client for the explicitly authorized
// Guyskull visual publication. Secrets are read locally and never printed.
const fs = require("fs");
const path = require("path");
const https = require("https");

function readEnvVar(key) {
  const envPath = path.join(__dirname, "..", "..", "..", ".env.local");
  const env = fs.readFileSync(envPath, "utf8");
  const match = env.match(new RegExp(`^${key}=(.*)$`, "m"));
  if (!match || !match[1]) throw new Error(`${key} introuvable dans .env.local`);
  return match[1].trim();
}

const SUPABASE_URL = readEnvVar("NEXT_PUBLIC_SUPABASE_URL").replace(/\/$/, "");
const SERVICE_ROLE_KEY = readEnvVar("SUPABASE_SERVICE_ROLE_KEY");

function request(pathname, { method = "GET", body = null, contentType = "application/json", prefer, extraHeaders = {} } = {}) {
  const url = new URL(pathname, `${SUPABASE_URL}/`);
  const binaryBody = body === null ? null : Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body));
  const headers = {
    apikey: SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    ...(prefer ? { Prefer: prefer } : {}),
    ...(binaryBody ? { "Content-Type": contentType, "Content-Length": binaryBody.length } : {}),
    ...extraHeaders,
  };

  return new Promise((resolve, reject) => {
    const req = https.request(url, { method, headers }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        let parsed = raw;
        try { parsed = raw ? JSON.parse(raw) : null; } catch {}
        resolve({ status: res.statusCode, body: parsed, headers: res.headers });
      });
    });
    req.on("error", reject);
    if (binaryBody) req.write(binaryBody);
    req.end();
  });
}

function rest(pathAndQuery, options = {}) {
  return request(`rest/v1/${pathAndQuery}`, { prefer: "return=representation", ...options });
}

function getBucket(bucket) {
  return request(`storage/v1/bucket/${encodeURIComponent(bucket)}`);
}

function uploadObject(bucket, objectPath, bytes, contentType) {
  const encodedPath = objectPath.split("/").map(encodeURIComponent).join("/");
  return request(`storage/v1/object/${encodeURIComponent(bucket)}/${encodedPath}`, {
    method: "POST",
    body: bytes,
    contentType,
    extraHeaders: { "x-upsert": "false" },
  });
}

function removeObjects(bucket, prefixes) {
  return request(`storage/v1/object/${encodeURIComponent(bucket)}`, {
    method: "DELETE",
    body: { prefixes },
  });
}

module.exports = { SUPABASE_URL, rest, getBucket, uploadObject, removeObjects };
