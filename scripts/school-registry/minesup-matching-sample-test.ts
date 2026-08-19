import { readFileSync } from "node:fs";
import { matchCandidate } from "./lib/matching/engine";
import type { MatchTarget, MatchCandidate } from "./lib/matching/types";

/**
 * SPRINT MINESUP-A §23 — test READ-ONLY du moteur de matching partagé
 * contre les 9 établissements `main_category = 'superieur'` déjà en
 * production et un petit échantillon réel de candidats MINESUP découverts
 * pendant ce sprint (page officielle IPES + liste des universités d'État).
 * Aucune écriture — script de validation uniquement, pas un collecteur.
 */

interface LiveHigherEd {
  id: string;
  name: string;
  city: string | null;
  region: string | null;
}

const live: LiveHigherEd[] = JSON.parse(readFileSync(process.argv[2], "utf-8"));
const targets: MatchTarget[] = live.map((e) => ({ id: e.id, name: e.name, region: e.region, city: e.city, category: "superieur", identifiers: [] }));

// Échantillon réel — noms tels que trouvés sur minesup.gov.cm (nav "Institutions Universitaires" + page IPES/EST).
const candidates: (MatchCandidate & { note: string })[] = [
  { name: "Université de Douala", region: "Littoral", city: "Douala", category: "superieur", identifiers: [], note: "université d'État, nom MINESUP exact" },
  { name: "Université de Yaoundé 1", region: "Centre", city: "Yaoundé", category: "superieur", identifiers: [], note: "MINESUP dit \"Yaoundé 1\" (chiffre), live dit \"Yaoundé I\" (romain) potentiellement" },
  { name: "Université Catholique d'Afrique Centrale (UCAC)", region: "Centre", city: "Yaoundé", category: "superieur", identifiers: [], note: "variante avec sigle, à comparer à la fiche live existante" },
  { name: "Institut Supérieur d'Agronomie (ISA)", region: "Est", city: null, category: "superieur", identifiers: [], note: "IPES privé région EST, aucune correspondance live attendue" },
  { name: "Institut Universitaire Catholique de Bertoua (IUCAB)", region: "Est", city: "Bertoua", category: "superieur", identifiers: [], note: "IPES privé région EST, aucune correspondance live attendue" },
];

console.log("Cibles (établissements live main_category=superieur) :", targets.length);
console.log("Candidats testés :", candidates.length);
console.log();

for (const c of candidates) {
  const { note, ...candidate } = c;
  const result = matchCandidate(candidate, targets);
  console.log(`"${candidate.name}" (${note})`);
  console.log(`  -> ${result.level}${result.target ? ` : "${result.target.name}"` : ""}`);
  console.log(`  raison : ${result.reason}`);
  console.log(`  safeForAutoLink : ${result.safeForAutoLink}`);
  console.log();
}
