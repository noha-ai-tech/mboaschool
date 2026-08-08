// Types du moteur de calcul de paie. Miroir volontaire du pattern de
// src/lib/timetable/types.ts (Mission 05) : fonction pure, testable,
// separee des routes API qui l'appellent.

export type ContractType = "temps_plein" | "temps_partiel" | "vacataire";

export interface ContractInput {
  type: ContractType;
  salaire: number | null;        // salaire mensuel fixe, si applicable
  tauxHoraire: number | null;    // taux horaire, si applicable (vacataire notamment)
}

export interface HeuresInput {
  heuresPrevues: number;
  heuresEffectuees: number;
  heuresSupplementaires: number;
}

export interface PrimeInput {
  libelle: string;
  montant: number;
}

export interface RetenueInput {
  libelle: string;
  montant: number;
}

export interface PayrollConfigInput {
  tauxHeureSupMultiplicateur: number;
}

export interface CalculateBulletinInput {
  contrat: ContractInput;
  heures: HeuresInput;
  primes: PrimeInput[];
  retenues: RetenueInput[];
  config: PayrollConfigInput;
}

export type LigneBulletinType = "salaire_base" | "heures_sup" | "prime" | "retenue";

export interface LigneBulletin {
  type: LigneBulletinType;
  libelle: string;
  montant: number;
  signe: "+" | "-";
}

export interface CalculateBulletinResult {
  salaireBase: number;
  montantHeuresSup: number;
  totalPrimes: number;
  totalRetenues: number;
  salaireBrut: number;
  salaireNet: number;
  lignes: LigneBulletin[];
  avertissements: string[];
}
