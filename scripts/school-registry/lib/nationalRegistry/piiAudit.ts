/**
 * SPRINT REGISTRY-NATIONAL-A §18 — audit PII, fonction pure.
 *
 * Détecte des signaux de données personnelles identifiables dans les champs
 * d'un candidat susceptible d'être publié. Conservateur par construction :
 * un faux positif occasionnel (ex. un nom d'établissement contenant
 * "Institut Saint Joseph" ne doit PAS être signalé comme un nom de
 * personne) est préférable à un faux négatif qui laisserait passer un vrai
 * PII dans un manifest public potentiel.
 *
 * Champs volontairement scannés : name, raw text blobs fournis par
 * l'appelant (ex. raw_data sérialisé) — jamais les IDs internes UUID.
 */

export interface PiiScanInput {
  name: string;
  extraText?: string[]; // ex. address, description, raw_data sérialisé
}

export interface PiiScanResult {
  piiDetected: boolean;
  fields: string[];
}

const PII_PATTERNS: { field: string; pattern: RegExp }[] = [
  { field: "nom_promoteur_ou_representant_legal", pattern: /nom\s+du\s+(promoteur|repr[eé]sentant\s+l[eé]gal|fondateur)\s*:/i },
  { field: "matricule_personnel", pattern: /\bmatricule\s+(personnel|individuel|de\s+l[' ]?agent)\b/i },
  { field: "telephone_personnel", pattern: /t[eé]l[eé]phone\s+personnel|num[eé]ro\s+personnel/i },
  { field: "email_personnel", pattern: /[a-z0-9._%+-]+@(gmail|yahoo|hotmail|outlook|icloud)\.[a-z]{2,}/i },
  { field: "date_naissance", pattern: /n[eé]\(?e?\)?\s+le\s+\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}|date\s+de\s+naissance/i },
  { field: "numero_piece_identite", pattern: /\b(CNI|carte\s+nationale\s+d'identit[eé])\s*n[°o]?\s*[:\-]?\s*\d/i },
  { field: "resultat_examen_individuel", pattern: /r[eé]sultat\s+individuel|note\s+obtenue\s+par|admis\(e\)\s+individuellement/i },
  { field: "numero_telephone_direct", pattern: /\b(?:\+237|237)?[\s.-]?6\d{2}(?:[\s.-]?\d{2}){3}\b/ },
];

export function scanCandidateForPii(input: PiiScanInput): PiiScanResult {
  const fields: string[] = [];
  const haystacks = [input.name, ...(input.extraText ?? [])].filter(Boolean);
  for (const { field, pattern } of PII_PATTERNS) {
    if (haystacks.some((h) => pattern.test(h))) fields.push(field);
  }
  return { piiDetected: fields.length > 0, fields };
}
