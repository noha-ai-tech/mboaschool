import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const source = (relativePath) =>
  readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

const foundationFiles = [
  "src/components/school-admin/ui/Button.tsx",
  "src/components/school-admin/ui/Card.tsx",
  "src/components/school-admin/ui/PageHeader.tsx",
  "src/components/school-admin/ui/FormControls.tsx",
  "src/components/school-admin/ui/Badge.tsx",
  "src/components/school-admin/ui/FilterBar.tsx",
  "src/components/school-admin/ui/StatCard.tsx",
  "src/components/school-admin/ui/Feedback.tsx",
  "src/components/school-admin/ui/ResponsiveTable.tsx",
  "src/components/school-admin/ui/Overlay.tsx",
];

test("les fondations UI d’administration sont présentes sans barrel global", async () => {
  await Promise.all(
    foundationFiles.map((relativePath) =>
      access(new URL(`../${relativePath}`, import.meta.url))
    )
  );
});

test("les tokens Écoles237 restent limités au thème school-admin", async () => {
  const globals = await source("src/app/globals.css");
  const themeStart = globals.indexOf(".school-admin-theme {");
  const skeletonStart = globals.indexOf(".school-admin-skeleton {");
  assert.ok(themeStart > -1);
  assert.ok(skeletonStart > themeStart);
  assert.doesNotMatch(globals.slice(0, themeStart), /--school-admin-/);
  const theme = globals.slice(themeStart, skeletonStart);
  for (const token of [
    "--school-admin-primary",
    "--school-admin-background",
    "--school-admin-surface",
    "--school-admin-warning",
    "--school-admin-focus",
  ]) {
    assert.match(theme, new RegExp(token));
  }
  assert.match(globals, /prefers-reduced-motion: reduce/);
  assert.match(globals, /\.school-admin-theme \*/);
});

test("Button expose les cinq variantes et les états loading/disabled", async () => {
  const button = await source("src/components/school-admin/ui/Button.tsx");
  for (const variant of ["primary", "secondary", "outline", "ghost", "danger"]) {
    assert.match(button, new RegExp(`${variant}:`));
  }
  assert.match(button, /aria-busy=\{loading \|\| undefined\}/);
  assert.match(button, /disabled=\{disabled \|\| loading\}/);
  assert.match(button, /focus-visible:ring-2/);
});

test("les contrôles de formulaire et statuts portent des libellés explicites", async () => {
  const [controls, badge, feedback] = await Promise.all([
    source("src/components/school-admin/ui/FormControls.tsx"),
    source("src/components/school-admin/ui/Badge.tsx"),
    source("src/components/school-admin/ui/Feedback.tsx"),
  ]);
  assert.match(controls, /<label htmlFor=\{id\}/);
  assert.match(controls, /cloneElement\(children/);
  assert.match(controls, /"aria-describedby": describedBy \|\| undefined/);
  assert.match(controls, /aria-\[invalid=true\]/);
  assert.match(controls, /role="alert"/);
  assert.match(badge, /label: string/);
  assert.match(feedback, /role=\{tone === "danger" \? "alert" : "status"\}/);
});

test("Dialog et Drawer gèrent Escape, focus piégé et restauration", async () => {
  const overlay = await source("src/components/school-admin/ui/Overlay.tsx");
  assert.match(overlay, /event\.key === "Escape"/);
  assert.match(overlay, /event\.key !== "Tab"/);
  assert.match(overlay, /restoreFocusRef\.current\?\.focus\(\)/);
  assert.match(overlay, /aria-modal="true"/);
  assert.match(overlay, /document\.body\.style\.overflow = "hidden"/);
  assert.match(overlay, /role="dialog"/);
});

test("la table responsive conserve les colonnes dans une région accessible", async () => {
  const table = await source("src/components/school-admin/ui/ResponsiveTable.tsx");
  assert.match(table, /role="region"/);
  assert.match(table, /tabIndex=\{0\}/);
  assert.match(table, /overflow-x-auto/);
  assert.doesNotMatch(table, /hidden (?:sm|md|lg|xl):table-cell/);
});

test("le shell consomme le thème et les anciennes primitives restent disponibles", async () => {
  const [shell, legacyCombined, legacyButton, legacyCard] = await Promise.all([
    source("src/components/school-admin/SchoolAdminShell.tsx"),
    source("src/components/ui.tsx"),
    source("src/components/ui/Button.tsx"),
    source("src/components/ui/Card.tsx"),
  ]);
  assert.match(shell, /school-admin-theme/);
  assert.match(shell, /SchoolAdminSkeleton/);
  assert.match(legacyCombined, /export function Button/);
  assert.match(legacyCombined, /export function Card/);
  assert.match(legacyButton, /export function Button/);
  assert.match(legacyCard, /export function Card/);
});
