// GUYSKULL-05 — the 5 mini-site views are now real, independently routed
// pages (not client-side tab state). This is the single source of truth
// for the view keys, their URL slugs, and the base-href-relative URL
// builder, shared by BOTH the public route tree (src/app/ecole/[id]/...)
// and the CMS Preview route tree (src/app/dashboard/ecole/etablissement/
// preview/...) so the two can never silently diverge on routing.
export type MiniSiteViewKey = "accueil" | "etablissement" | "admissions" | "vie" | "galerie";

export const MINISITE_VIEWS: { key: MiniSiteViewKey; label: string; slug: string }[] = [
  { key: "accueil", label: "Accueil", slug: "" },
  { key: "etablissement", label: "L'établissement", slug: "etablissement" },
  { key: "admissions", label: "Formations & Admissions", slug: "formations-admissions" },
  { key: "vie", label: "Vie & Résultats", slug: "vie-resultats" },
  { key: "galerie", label: "Galerie & Infos", slug: "galerie-infos" },
];

const SLUG_TO_KEY = new Map(MINISITE_VIEWS.filter((v) => v.slug).map((v) => [v.slug, v.key]));

/** `baseHref` never has a trailing slash (e.g. `/ecole/<id>` or `/dashboard/ecole/etablissement/preview`). */
export function buildMiniSiteViewHref(baseHref: string, view: MiniSiteViewKey): string {
  const slug = MINISITE_VIEWS.find((v) => v.key === view)?.slug ?? "";
  return slug ? `${baseHref}/${slug}` : baseHref;
}

/** Resolves the active view from a pathname relative to `baseHref` — e.g. pathname `/ecole/<id>/vie-resultats` with baseHref `/ecole/<id>` resolves to `"vie"`. Unknown/extra segments fall back to `"accueil"` rather than crashing. */
export function resolveMiniSiteView(pathname: string, baseHref: string): MiniSiteViewKey {
  if (pathname === baseHref || pathname === `${baseHref}/`) return "accueil";
  const rest = pathname.startsWith(`${baseHref}/`) ? pathname.slice(baseHref.length + 1) : "";
  const firstSegment = rest.split("/")[0];
  return SLUG_TO_KEY.get(firstSegment) ?? "accueil";
}
