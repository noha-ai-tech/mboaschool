import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(testDirectory, "..");

async function source(relativePath) {
  return readFile(path.join(projectRoot, relativePath), "utf8");
}

// P0 AUTH LOGIN FLOW HOTFIX — reproduced reliably against a local
// production build (`next build && next start`), never against `next dev`:
// after a fully successful sign-in (Supabase token exchange succeeds,
// session cookies correctly set, role/establishment lookups both resolve
// with real data), `router.push(destination)` was called and returned
// with no error, yet the visible URL never changed — the user stayed
// stuck on the login form indefinitely with the button reading
// "Connexion…" forever. Confirmed NOT caused by the establishment lookup
// itself (it always resolved successfully in every reproduction) — this
// is a Next.js App Router client-navigation race specific to production's
// route prefetching, not an application logic bug. Fixed with a hard
// navigation, which cannot be silently swallowed the way a client-router
// transition can.

test("connexion page uses a hard navigation (window.location.href) for the resolved destination, not router.push", async () => {
  const src = await source("src/app/auth/connexion/page.tsx");
  assert.match(src, /window\.location\.href = destination;/);
  assert.doesNotMatch(src, /router\.push\(destination\)/, "must not regress to the client-router push that silently failed to navigate in production");
});

test("connexion page uses a hard navigation for the weak-password 'continuer' path too", async () => {
  const src = await source("src/app/auth/connexion/page.tsx");
  assert.match(src, /window\.location\.href = authenticatedDestination;/);
  assert.doesNotMatch(src, /router\.push\(authenticatedDestination\)/);
});

test("connexion page no longer imports useRouter (both navigation sites now use window.location.href)", async () => {
  const src = await source("src/app/auth/connexion/page.tsx");
  assert.doesNotMatch(src, /from "next\/navigation"/);
  assert.doesNotMatch(src, /useRouter\(\)/);
});

test("invalid credentials still show the existing error message and clear loading (unchanged)", async () => {
  const src = await source("src/app/auth/connexion/page.tsx");
  assert.match(src, /setError\("Email ou mot de passe incorrect\."\);/);
  const errorBranch = src.slice(src.indexOf("if (authError)"), src.indexOf("if (authError)") + 150);
  assert.match(errorBranch, /setLoading\(false\)/, "loading must terminate on known auth error");
});

test("establishment lookup failure is bounded and failure-safe: destination still resolves, no infinite loading", async () => {
  const src = await source("src/app/auth/connexion/page.tsx");
  // hasSchool defaults to true and the fetch is wrapped in try/catch, so a
  // failed/aborted lookup can never leave the login flow hanging — it
  // falls through to the same destination-then-navigate path as success.
  assert.match(src, /let hasSchool = true;/);
  assert.match(src, /try \{[\s\S]*?establishments\/accessible[\s\S]*?\} catch/);
  const catchBlockIndex = src.indexOf("} catch");
  const afterCatch = src.slice(catchBlockIndex, catchBlockIndex + 400);
  assert.match(afterCatch, /destination = hasSchool \? "\/dashboard\/ecole" : "\/revendiquer";/, "destination must still be computed after a caught fetch failure, not left unresolved");
});

test("role destinations remain correct: admin, teacher, and default owner/parent paths are all preserved", async () => {
  const src = await source("src/app/auth/connexion/page.tsx");
  assert.match(src, /profile\?\.role === "platform_admin"[\s\S]{0,40}destination = "\/dashboard\/admin"/);
  assert.match(src, /profile\?\.role === "teacher"[\s\S]{0,40}destination = "\/enseignant\/mon-espace"/);
  assert.match(src, /destination = hasSchool \? "\/dashboard\/ecole" : "\/revendiquer";/);
});

test("post-login navigation is always a relative path (never a hardcoded absolute host)", async () => {
  const src = await source("src/app/auth/connexion/page.tsx");
  const hrefAssignments = [...src.matchAll(/window\.location\.href = ([a-zA-Z.]+);/g)];
  assert.ok(hrefAssignments.length >= 2, "expected both hard-navigation call sites");
  for (const literal of ["mboaschool.vercel.app", "localhost", "vercel.app"]) {
    assert.ok(!src.includes(literal), `connexion page must never hardcode "${literal}" — navigation must stay relative to whatever host is actually serving the app`);
  }
});
