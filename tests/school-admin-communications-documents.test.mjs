import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("annonces conserve school_announcements et garde class_announcements fermé", async () => {
  const page = await source("src/app/dashboard/ecole/annonces/page.tsx");
  assert.match(page, /\.from\("school_announcements"\)\.select\("\*"\)/);
  assert.match(page, /\.from\("school_announcements"\)\.insert\(\{ establishment_id: school\.id, title: form\.title, content: form\.content, is_important: form\.is_important \}\)/);
  assert.match(page, /\.from\("school_announcements"\)\.delete\(\)\.eq\("id", deleteTarget\.id\)/);
  assert.match(page, /SchoolAdminDialog/);
  assert.doesNotMatch(page, /class_announcements/);
});

test("messagerie conserve destinataires, API, payload et contexte", async () => {
  const [page, form] = await Promise.all([source("src/app/pro/messagerie/page.tsx"), source("src/components/pro/FormulaireMessage.tsx")]);
  assert.match(page, /requireActiveEstablishment\(supabase, user\.id, params\.school, "\/pro\/messagerie"\)/);
  assert.match(page, /\.from\("messages"\)/);
  assert.match(form, /"global" \| "departement"/);
  assert.match(form, /fetch\("\/api\/messagerie\/envoyer"/);
  assert.match(form, /departement_disciplinaire: canal === "departement" \? departement : undefined/);
  assert.match(form, /requestedEstablishmentId: establishmentId/);
  assert.match(form, /withEstablishmentQuery\("\/pro\/messagerie\?sent=1", establishmentId\)/);
  assert.doesNotMatch(form, /email|sms|attachment|piece_jointe/i);
});

test("documents conserve bucket, limite, upload, visibilité et suppression confirmée", async () => {
  const page = await source("src/app/dashboard/ecole/documents/page.tsx");
  assert.match(page, /const BUCKET = "school-documents"; const MAX_MB = 10/);
  assert.match(page, /picked\.size > MAX_MB \* 1024 \* 1024/);
  assert.match(page, /`\$\{school\.id\}\/\$\{Date\.now\(\)\}\.\$\{ext\}`/);
  assert.match(page, /\.from\(BUCKET\)\.upload\(path, file, \{ upsert: false \}\)/);
  assert.match(page, /\.from\(BUCKET\)\.getPublicUrl\(path\)/);
  assert.match(page, /storage_path: path/);
  assert.ok(page.indexOf(".from(BUCKET).remove([deleteTarget.storage_path])") < page.indexOf('.from("school_documents").delete()'));
  assert.match(page, /SchoolAdminDialog open=\{Boolean\(deleteTarget\)\}/);
  assert.doesNotMatch(page, /console\./);
});

test("centre documentaire utilise seulement les compteurs réels et les liens contextualisés", async () => {
  const page = await source("src/app/dashboard/ecole/centre-documentaire/page.tsx");
  assert.match(page, /\.from\("school_documents"\)\.select\("id", \{ count: "exact", head: true \}\)/);
  assert.match(page, /\.from\("school_images"\)\.select\("id", \{ count: "exact", head: true \}\)/);
  assert.match(page, /withEstablishmentQuery\(path, school\.id\)/);
  assert.match(page, /SchoolAdminLoadingState/);
  assert.doesNotMatch(page, /docCount === null \? ["']…/);
  assert.doesNotMatch(page, /upload\(|insert\(|delete\(/);
});
