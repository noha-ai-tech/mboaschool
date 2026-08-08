// Moteur de calcul de paie (Mission 06, Phase 6). Fonction pure : aucun
// acces reseau ni base de donnees ici - les routes API (src/app/api/payroll/*)
// chargent les entrees puis appellent cette fonction, exactement comme
// src/app/api/timetable/generate/route.ts appelle genererEmploiDuTemps
// (Mission 05).
//
// REGLES DE CALCUL - documentees ici car ce sont des choix de conception
// assumes, pas des evidences. Voir docs/payroll/03_PAYROLL_ENGINE.md pour
// la justification complete et les limites connues.
//
// 1. Contrat a salaire fixe (temps_plein/temps_partiel avec `salaire`
//    renseigne) : le salaire de base est verse integralement, independamment
//    des heures effectuees (hypothese : un salarie mensualise est paye
//    meme si son volume d'heures varie legerement d'une periode a l'autre -
//    les ecarts significatifs relevent d'une retenue/prime saisie
//    manuellement, pas d'un ajustement automatique).
// 2. Contrat a taux horaire (vacataire, ou salaire fixe absent) : le
//    salaire de base est `heuresEffectuees * tauxHoraire`.
// 3. Heures supplementaires : toujours payees en plus, au taux horaire du
//    contrat si connu, sinon a un taux horaire equivalent derive du salaire
//    fixe et des heures prevues (`salaire / heuresPrevues`) - simplification
//    assumee, signalee par un avertissement dans le resultat.
// 4. Primes et retenues : sommees telles quelles, aucune logique de
//    plafonnement ou de proportionnalite n'est appliquee.

import type { CalculateBulletinInput, CalculateBulletinResult, LigneBulletin } from "./types";

export function calculerBulletin(input: CalculateBulletinInput): CalculateBulletinResult {
  const { contrat, heures, primes, retenues, config } = input;
  const avertissements: string[] = [];
  const lignes: LigneBulletin[] = [];

  // 1-2. Salaire de base
  let salaireBase = 0;
  if (contrat.salaire != null && contrat.type !== "vacataire") {
    salaireBase = contrat.salaire;
  } else if (contrat.tauxHoraire != null) {
    salaireBase = heures.heuresEffectuees * contrat.tauxHoraire;
  } else {
    avertissements.push(
      "Aucun salaire ni taux horaire renseigne sur le contrat — salaire de base calcule a 0."
    );
  }
  lignes.push({ type: "salaire_base", libelle: "Salaire de base", montant: salaireBase, signe: "+" });

  // 3. Heures supplementaires
  let tauxHeureSupBase = contrat.tauxHoraire;
  if (tauxHeureSupBase == null && contrat.salaire != null && heures.heuresPrevues > 0) {
    tauxHeureSupBase = contrat.salaire / heures.heuresPrevues;
    avertissements.push(
      "Taux horaire absent du contrat — taux equivalent derive du salaire fixe et des heures prevues (approximation)."
    );
  }

  const montantHeuresSup =
    tauxHeureSupBase != null
      ? heures.heuresSupplementaires * tauxHeureSupBase * config.tauxHeureSupMultiplicateur
      : 0;

  if (montantHeuresSup > 0) {
    lignes.push({
      type: "heures_sup",
      libelle: `Heures supplementaires (${heures.heuresSupplementaires.toFixed(1)}h)`,
      montant: montantHeuresSup,
      signe: "+",
    });
  } else if (heures.heuresSupplementaires > 0) {
    avertissements.push(
      "Heures supplementaires detectees mais aucun taux horaire disponible pour les valoriser — montant non calcule."
    );
  }

  // 4. Primes / retenues
  const totalPrimes = primes.reduce((s, p) => s + p.montant, 0);
  for (const p of primes) {
    lignes.push({ type: "prime", libelle: p.libelle, montant: p.montant, signe: "+" });
  }

  const totalRetenues = retenues.reduce((s, r) => s + r.montant, 0);
  for (const r of retenues) {
    lignes.push({ type: "retenue", libelle: r.libelle, montant: r.montant, signe: "-" });
  }

  const salaireBrut = salaireBase + montantHeuresSup + totalPrimes;
  const salaireNet = salaireBrut - totalRetenues;

  if (salaireNet < 0) {
    avertissements.push("Salaire net negatif — les retenues depassent le brut. A verifier avant validation.");
  }

  return {
    salaireBase,
    montantHeuresSup,
    totalPrimes,
    totalRetenues,
    salaireBrut,
    salaireNet,
    lignes,
    avertissements,
  };
}
