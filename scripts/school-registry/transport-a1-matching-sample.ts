import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { matchCandidate } from "./lib/matching/engine";
import type { MatchCandidate, MatchTarget } from "./lib/matching/types";

/**
 * SPRINT TRANSPORT-A.1 §12 — Échantillon de 10 institutions transport
 * réelles (noms trouvés par recherche web ce sprint, jamais une source
 * gouvernementale nominative officielle — voir
 * reports/registry/transport-a1-source-search.json pour la provenance
 * exacte et le tier de chaque nom), testé EN LECTURE SEULE contre la
 * production via le moteur de matching partagé (lib/matching/engine.ts,
 * INCHANGÉ ce sprint). AUCUNE écriture Supabase — clé ANON en lecture
 * seule, comme minsante-a1-matching-sample.ts. AUCUN auto-link.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..", "..");

function csvEscape(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

interface LiveEstablishment {
  id: string;
  name: string;
  city: string | null;
  region: string | null;
  main_category: string | null;
}

async function fetchLiveEstablishments(): Promise<LiveEstablishment[]> {
  const envPath = join(rootDir, ".env.local");
  const env = readFileSync(envPath, "utf-8");
  const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)?.[1]?.trim();
  const key = env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/)?.[1]?.trim();
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL / ANON_KEY introuvables dans .env.local");

  const all: LiveEstablishment[] = [];
  const pageSize = 1000;
  let offset = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const res = await fetch(`${url}/rest/v1/establishments?select=id,name,city,region,main_category&limit=${pageSize}&offset=${offset}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    if (!res.ok) throw new Error(`Supabase REST -> HTTP ${res.status} ${await res.text()}`);
    const page: LiveEstablishment[] = await res.json();
    all.push(...page);
    if (page.length < pageSize) break;
    offset += pageSize;
  }
  return all;
}

interface SampleCandidate {
  name: string;
  city: string | null;
  region: string | null;
  entityFamily: string;
  authority: string;
  source: string;
  sourceTier: string;
  identifier: string | null;
  crossMinistrySignal: string | null;
}

/**
 * Échantillon fixé manuellement — voir §7 du brief : 5 auto-écoles / 2
 * maritime / 2 aviation / 1 transport-logistique. Toutes les provenances
 * sont documentées dans transport-a1-source-search.json ; AUCUN nom n'est
 * une source gouvernementale nominative confirmée (tout est Tier 2/3 —
 * voir colonne sourceTier), documenté explicitement pour ne jamais être
 * confondu avec un registre officiel.
 */
const SAMPLE: SampleCandidate[] = [
  {
    name: "AUTO ECOLE ASTRALE",
    city: "Yaoundé",
    region: null,
    entityFamily: "TRAINING_ESTABLISHMENT (auto-école)",
    authority: "Aucune — nom trouvé via annuaire privé",
    source: "africannuaire.com (annuaire privé, éditeur SPHM Editions)",
    sourceTier: "3 (discovery, non gouvernemental)",
    identifier: null,
    crossMinistrySignal: null,
  },
  {
    name: "AUTO ECOLE FRANCAISE",
    city: "Douala",
    region: null,
    entityFamily: "TRAINING_ESTABLISHMENT (auto-école)",
    authority: "Aucune — nom trouvé via annuaire privé",
    source: "africannuaire.com (annuaire privé, éditeur SPHM Editions)",
    sourceTier: "3 (discovery, non gouvernemental)",
    identifier: null,
    crossMinistrySignal: null,
  },
  {
    name: "AUTO ECOLE GERMANIA",
    city: "Douala",
    region: null,
    entityFamily: "TRAINING_ESTABLISHMENT (auto-école)",
    authority: "Aucune — nom trouvé via annuaire privé",
    source: "africannuaire.com (annuaire privé, éditeur SPHM Editions)",
    sourceTier: "3 (discovery, non gouvernemental)",
    identifier: null,
    crossMinistrySignal: null,
  },
  {
    name: "AUTO ECOLE LEO",
    city: "Yaoundé",
    region: null,
    entityFamily: "TRAINING_ESTABLISHMENT (auto-école)",
    authority: "Aucune — nom trouvé via annuaire privé",
    source: "africannuaire.com (annuaire privé, éditeur SPHM Editions)",
    sourceTier: "3 (discovery, non gouvernemental)",
    identifier: null,
    crossMinistrySignal: null,
  },
  {
    name: "AUTO ECOLE TRECY",
    city: "Yaoundé",
    region: null,
    entityFamily: "TRAINING_ESTABLISHMENT (auto-école)",
    authority: "Aucune — nom trouvé via annuaire privé",
    source: "africannuaire.com (annuaire privé, éditeur SPHM Editions)",
    sourceTier: "3 (discovery, non gouvernemental)",
    identifier: null,
    crossMinistrySignal: null,
  },
  {
    name: "EMIPAC (École Maritime Industrielle et Portuaire de l'Afrique Centrale)",
    city: "Douala",
    region: null,
    entityFamily: "TRAINING_ESTABLISHMENT (maritime)",
    authority: "Aucune corroboration officielle MINT/DAMVN trouvée",
    source: "maritimafrica.com (site tiers, non gouvernemental)",
    sourceTier: "3 (discovery, non gouvernemental)",
    identifier: null,
    crossMinistrySignal: null,
  },
  {
    name: "IT2MIP (Institut des Technologies de la Marine Marchande et Industrie Portuaire)",
    city: "Douala",
    region: null,
    entityFamily: "TRAINING_ESTABLISHMENT (maritime)",
    authority: "MINEFOP (revendiqué par le site de l'institut, non vérifié directement dans un registre MINEFOP officiel)",
    source: "kamerpower.com (site tiers, non gouvernemental)",
    sourceTier: "3 (discovery, non gouvernemental)",
    identifier: null,
    crossMinistrySignal: "MINEFOP (revendiqué, non corroboré directement) — chevauchement contenu transport/tutelle MINEFOP, même pattern que Fleet Management Academy (TRANSPORT-A)",
  },
  {
    name: "École de Formation (EFO) — CCAA",
    city: "Yaoundé",
    region: null,
    entityFamily: "TRAINING_ESTABLISHMENT (aviation) — statut admission public/interne non tranché",
    authority: "CCAA (Cameroon Civil Aviation Authority)",
    source: "ccaa.aero (site officiel de l'autorité)",
    sourceTier: "2 (autorité officielle apparentée, pas une liste nominative d'ATO tiers)",
    identifier: null,
    crossMinistrySignal: null,
  },
  {
    name: "IRDSM Aviation",
    city: "Yaoundé",
    region: null,
    entityFamily: "TRAINING_ESTABLISHMENT (aviation, privé)",
    authority: "CCAA (agrément revendiqué par l'école elle-même, non confirmé sur une liste CCAA publiée)",
    source: "groupe-dsm.net/aviation (site de l'école, non gouvernemental)",
    sourceTier: "3 (discovery, auto-déclaration d'agrément non corroborée par une liste officielle)",
    identifier: null,
    crossMinistrySignal: null,
  },
  {
    name: "Fleet Management Academy",
    city: null,
    region: null,
    entityFamily: "TRAINING_ESTABLISHMENT (transport/logistique — conduite défensive)",
    authority: "MINEFOP",
    source: "TRANSPORT-A (site institutionnel MINEFOP, agrément N°000471 du 19-09-2022)",
    sourceTier: "2 (agrément MINEFOP cité par la source, non revérifié directement dans un registre MINEFOP consultable ce sprint)",
    identifier: "N°000471 (MINEFOP, 19-09-2022) — agrément conduite défensive, PAS un agrément MINT/DTT",
    crossMinistrySignal: "MINEFOP — contenu transport (conduite défensive) sous tutelle MINEFOP, pas MINT",
  },
];

async function main() {
  console.log("=== SPRINT TRANSPORT-A.1 — ÉCHANTILLON DE MATCHING (READ-ONLY) ===\n");
  console.log(`Échantillon fixe : ${SAMPLE.length} institution(s) — 5 auto-écoles / 2 maritime / 2 aviation / 1 transport-logistique (voir §12 du brief).`);
  console.log("AUCUN nom de cet échantillon n'est issu d'une source gouvernementale nominative officielle confirmée — voir sourceTier par ligne.\n");

  const live = await fetchLiveEstablishments();
  console.log(`${live.length} établissement(s) réel(s) chargé(s) en lecture seule (clé anon, toute la base).`);

  const targets: MatchTarget[] = live.map((e) => ({
    id: e.id,
    name: e.name,
    region: e.region,
    city: e.city,
    category: e.main_category,
    identifiers: [],
  }));

  const results = SAMPLE.map((c) => {
    const candidate: MatchCandidate = {
      name: c.name,
      region: c.region,
      city: c.city,
      category: null,
      identifiers: [],
    };
    const result = matchCandidate(candidate, targets);
    return { candidate: c, result };
  });

  const byLevel: Record<string, number> = {};
  for (const r of results) byLevel[r.result.level] = (byLevel[r.result.level] ?? 0) + 1;
  console.log(`Répartition des niveaux de match : ${JSON.stringify(byLevel)}`);

  const unsafeAutoLink = results.filter((r) => r.result.safeForAutoLink);
  console.log(`safeForAutoLink=true observé : ${unsafeAutoLink.length} (attendu : dépend du moteur — aucune fusion automatique ne sera exécutée par ce script quoi qu'il arrive, lecture seule)`);

  const reportsDir = join(rootDir, "reports", "registry");
  mkdirSync(reportsDir, { recursive: true });
  const header = "candidate_name,city,entity_family,authority,source,source_tier,identifier,cross_ministry_signal,match_level,matched_target_id,matched_target_name,matched_target_region,safe_for_auto_link,reason";
  const csv = [
    header,
    ...results.map((r) =>
      [
        r.candidate.name,
        r.candidate.city ?? "",
        r.candidate.entityFamily,
        r.candidate.authority,
        r.candidate.source,
        r.candidate.sourceTier,
        r.candidate.identifier ?? "",
        r.candidate.crossMinistrySignal ?? "",
        r.result.level,
        r.result.target?.id ?? "",
        r.result.target?.name ?? "",
        r.result.target?.region ?? "",
        r.result.safeForAutoLink ? "YES" : "NO",
        r.result.reason,
      ]
        .map(csvEscape)
        .join(",")
    ),
  ].join("\n");
  writeFileSync(join(reportsDir, "transport-a1-matching-sample.csv"), csv, "utf-8");
  console.log(`Rapport écrit : reports/registry/transport-a1-matching-sample.csv (${results.length} lignes)`);
  console.log(`\nAucune écriture Supabase effectuée par ce script (clé ANON, lecture seule). AUCUN auto-link.`);
}

main().catch((e) => {
  console.error("MATCHING SAMPLE FAILED:", e.message);
  process.exit(1);
});
