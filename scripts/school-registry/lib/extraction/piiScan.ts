/**
 * SPRINT MINSANTE-I §14 — scan PII générique, réutilisé par
 * `extract-minsante-a2.ts` et testé indépendamment. Le modèle
 * école×filière MINSANTE ne devrait jamais contenir de données
 * personnelles (matricule, nom d'étudiant, résultat individuel, téléphone,
 * email) — ce module le PROUVE plutôt que de le supposer.
 */

export interface PiiHit {
  field: "email" | "phone" | "matricule";
  sample: string;
}

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
const MATRICULE_RE = /\bmatricule\b/i;

/**
 * Détection téléphone robuste au GROUPEMENT DE CHIFFRES : les numéros
 * camerounais s'écrivent avec des séparateurs à des positions variables
 * (ex. "677 12 34 56" en 3-2-2-2, ou "677123456" en un bloc) — une regex
 * exigeant un groupement fixe (ex. 3-3-3) rate silencieusement les autres
 * groupements pourtant réels. On retire d'abord tout séparateur, puis on
 * teste la FORME résultante (indicatif +237 optionnel, préfixe 2 ou 6,
 * 9 chiffres au total).
 */
const PHONE_DIGITS_RE = /(237)?[26]\d{8}\b/;

export function piiScan(strings: string[]): PiiHit[] {
  const hits: PiiHit[] = [];
  for (const s of strings) {
    if (EMAIL_RE.test(s)) hits.push({ field: "email", sample: s });
    else if (PHONE_DIGITS_RE.test(s.replace(/[\s.\-()]/g, ""))) hits.push({ field: "phone", sample: s });
    else if (MATRICULE_RE.test(s)) hits.push({ field: "matricule", sample: s });
  }
  return hits;
}
