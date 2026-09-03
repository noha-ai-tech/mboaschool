import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(testDirectory, "..");

const passwordSecurity = await import(
  pathToFileURL(
    path.join(projectRoot, "src/lib/auth/passwordSecurity.ts")
  ).href
);

async function source(relativePath) {
  return readFile(path.join(projectRoot, relativePath), "utf8");
}

test("weak_password et AuthWeakPasswordError sont traités sans message brut", () => {
  const rawMessage = "internal provider detail that must not reach the browser";
  const byCode = passwordSecurity.getSignUpErrorMessage({
    code: "weak_password",
    message: rawMessage,
  });
  const byClass = passwordSecurity.getPasswordUpdateErrorMessage({
    name: "AuthWeakPasswordError",
    message: rawMessage,
  });

  assert.match(byCode, /compromis/);
  assert.match(byClass, /compromis/);
  assert.doesNotMatch(byCode, new RegExp(rawMessage));
  assert.doesNotMatch(byClass, new RegExp(rawMessage));
});

test("les autres erreurs Auth reçoivent des messages génériques non énumérants", () => {
  const signup = passwordSecurity.getSignUpErrorMessage({
    code: "user_already_exists",
    message: "User already registered",
  });
  const update = passwordSecurity.getPasswordUpdateErrorMessage({
    code: "unexpected_internal_error",
    message: "sensitive provider detail",
  });

  assert.doesNotMatch(signup, /already|existe déjà/i);
  assert.doesNotMatch(update, /sensitive|internal/i);
});

test("le signal weakPassword du SDK installé produit un avertissement non bloquant", () => {
  assert.equal(passwordSecurity.getWeakPasswordSignInMessage(null), null);
  assert.equal(passwordSecurity.getWeakPasswordSignInMessage(undefined), null);
  assert.match(
    passwordSecurity.getWeakPasswordSignInMessage({
      reasons: ["pwned"],
      message: "raw SDK message",
    }),
    /connexion a réussi/
  );
  assert.doesNotMatch(
    passwordSecurity.getWeakPasswordSignInMessage({ message: "raw SDK message" }),
    /raw SDK message/
  );
});

test("la validation locale impose égalité et minimum de huit caractères", () => {
  assert.match(
    passwordSecurity.validatePasswordPair("abcdefgh", "different"),
    /correspondent pas/
  );
  assert.match(
    passwordSecurity.validatePasswordPair("short", "short"),
    /au moins 8/
  );
  assert.equal(
    passwordSecurity.validatePasswordPair("a-secure-password", "a-secure-password"),
    null
  );
});

test("seul PASSWORD_RECOVERY ou son marqueur éphémère ouvre le formulaire", () => {
  const allowed = passwordSecurity.canUsePasswordRecovery;

  assert.equal(allowed("PASSWORD_RECOVERY", true, false), true);
  assert.equal(allowed("PASSWORD_RECOVERY", false, false), false);
  assert.equal(allowed("INITIAL_SESSION", true, true), true);
  assert.equal(allowed("INITIAL_SESSION", true, false), false);
  assert.equal(allowed("SIGNED_IN", true, true), false);
  assert.equal(allowed("SIGNED_IN", true, false), false);
});

test("l'inscription utilise le mapping sûr et reflète l'auto-confirmation", async () => {
  const content = await source("src/app/auth/inscription/page.tsx");

  assert.match(content, /getSignUpErrorMessage\(authError\)/);
  assert.doesNotMatch(content, /authError\.message/);
  assert.match(content, /Votre compte est prêt/);
  assert.doesNotMatch(content, /Vérifiez votre boîte email/);
});

test("la connexion lit précisément data.weakPassword avant la redirection", async () => {
  const content = await source("src/app/auth/connexion/page.tsx");

  assert.match(content, /getWeakPasswordSignInMessage\(data\.weakPassword\)/);
  assert.match(content, /Mot de passe à renforcer/);
  assert.match(content, /setAuthenticatedDestination\(destination\)/);
});

test("la récupération cible la nouvelle page et exige PASSWORD_RECOVERY", async () => {
  const requestPage = await source(
    "src/app/auth/mot-de-passe-oublie/page.tsx"
  );
  const recoveryPage = await source(
    "src/app/auth/reinitialiser-mot-de-passe/page.tsx"
  );

  assert.match(
    requestPage,
    /redirectTo: `\$\{window\.location\.origin\}\/auth\/reinitialiser-mot-de-passe`/
  );
  assert.match(recoveryPage, /onAuthStateChange/);
  assert.match(recoveryPage, /event === "PASSWORD_RECOVERY"/);
  assert.match(recoveryPage, /updateUser\(\{ password \}\)/);
  assert.match(recoveryPage, /sessionStorage\.removeItem/);
  assert.match(recoveryPage, /cleanUrl\.search = ""/);
  assert.match(recoveryPage, /cleanUrl\.hash = ""/);
  assert.doesNotMatch(recoveryPage, /updateError\.message/);
  assert.doesNotMatch(recoveryPage, /console\.(log|error|warn)/);
});
