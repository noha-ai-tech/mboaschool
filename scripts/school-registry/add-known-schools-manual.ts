import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Ajout manuel ponctuel de 3 établissements réels demandés explicitement
 * par Eddy (Collège Dauphine, Collège La Conquête, DU VAAL International
 * School — Douala), non présents dans le registre MINESEC ESG collecté.
 * Informations vérifiées via recherche web (sources multiples concordantes,
 * voir report). Pas de matricule/source_ministry — ce ne sont pas des
 * lignes du registre national, exactement comme les 48 fiches curées
 * d'origine (official_id/source_ministry restent NULL).
 *
 * Aucune donnée non confirmée n'est renseignée (pas d'adresse précise, pas
 * de photo, pas de coordonnées quand la source ne les donne pas).
 *
 * Usage : tsx add-known-schools-manual.ts --dry-run (défaut) | --commit
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..", "..");

function readEnvVar(env: string, key: string): string {
  const match = env.match(new RegExp(`^${key}=(.*)$`, "m"));
  const value = match?.[1]?.trim();
  if (!value) throw new Error(`${key} introuvable dans .env.local`);
  return value;
}
function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const SCHOOLS = [
  {
    name: "Collège Dauphine",
    city: "Douala",
    region: "Littoral",
    neighborhood: "Ndogbong",
    main_category: "secondaire",
    description:
      "Établissement secondaire privé fondé en 1997 (Ambroise Kamgue), situé dans l'arrondissement de Douala Ve. Donnée référencée, non vérifiée par l'établissement.",
    sourceNote: "Osidimbea (mémoire du Cameroun), ecolesaucameroun.com, PFOS Education",
  },
  {
    name: "Collège La Conquête",
    city: "Douala",
    region: "Littoral",
    neighborhood: "Makèpè",
    main_category: "secondaire",
    phone: "+237 242014390",
    email: "collegelaconquete95@yahoo.fr",
    description:
      "Établissement secondaire privé fondé en 1994 (Flaubert Pamen), quartier Makèpè. Donnée référencée, non vérifiée par l'établissement.",
    sourceNote: "Osidimbea, InovEdu, Cameroon Tribune",
  },
  {
    name: "DU VAAL International School",
    city: "Douala",
    region: "Littoral",
    neighborhood: "Beedi",
    main_category: "secondaire",
    website: "https://www.duvaalinternationalschool.com/en",
    description:
      "Groupe scolaire bilingue (crèche, primaire, secondaire), quartier Beedi, Douala Ve. Donnée référencée, non vérifiée par l'établissement.",
    sourceNote: "site officiel duvaalinternationalschool.com",
  },
];

async function main() {
  const commit = process.argv.includes("--commit");

  const env = readFileSync(join(rootDir, ".env.local"), "utf-8");
  const url = readEnvVar(env, "NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = readEnvVar(env, "SUPABASE_SERVICE_ROLE_KEY");

  // Anti-doublon live — jamais fondé sur un instantané.
  const liveRes = await fetch(`${url}/rest/v1/establishments?select=id,name,city`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
  });
  if (!liveRes.ok) throw new Error(`Lecture establishments -> HTTP ${liveRes.status}`);
  const live: { id: string; name: string; city: string | null }[] = await liveRes.json();

  const payload = SCHOOLS.map((s) => {
    const existing = live.find((e) => e.name.toLowerCase().trim() === s.name.toLowerCase().trim());
    return { school: s, existing, slug: slugify(s.name) };
  });

  console.log("=== DRY RUN — add-known-schools-manual.ts ===");
  for (const p of payload) {
    console.log(`${p.school.name} — ${p.existing ? `DÉJÀ EN BASE (${p.existing.id}), skip` : "à créer"}`);
  }

  const toInsert = payload.filter((p) => !p.existing);
  if (!commit) {
    console.log(`\nWould insert: ${toInsert.length}. Relancer avec --commit pour créer.`);
    return;
  }

  if (toInsert.length === 0) {
    console.log("\nRien à créer (tout existe déjà).");
    return;
  }

  const body = toInsert.map((p) => ({
    name: p.school.name,
    slug: p.slug,
    main_category: p.school.main_category,
    region: p.school.region,
    city: p.school.city,
    neighborhood: p.school.neighborhood,
    phone: "phone" in p.school ? p.school.phone : null,
    email: "email" in p.school ? p.school.email : null,
    website: "website" in p.school ? p.school.website : null,
    description: p.school.description,
    verification_status: "referenced",
    is_verified: false,
    is_claimed: false,
    subscription_plan: "free",
    forfait: "gratuit",
  }));

  const res = await fetch(`${url}/rest/v1/establishments`, {
    method: "POST",
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Insert -> HTTP ${res.status} — ${await res.text()}`);
  const created = await res.json();
  console.log(`\n${created.length} établissement(s) créé(s) :`);
  for (const c of created) console.log(`  ${c.name} (${c.id})`);

  writeFileSync(
    join(rootDir, "reports", "registry", "manual-additions-summary.json"),
    JSON.stringify({ timestamp: new Date().toISOString(), created: created.map((c: { id: string; name: string }) => ({ id: c.id, name: c.name })) }, null, 2),
    "utf-8"
  );
}

main().catch((error) => {
  console.error("Échec :", error);
  process.exit(1);
});
