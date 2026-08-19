import type {
  EducationFamily,
  NormalizedStagingRecord,
  Ownership,
  RawSourceRecord,
  Subsystem,
} from "../types";

/**
 * Normalisation de nom pour le fingerprint de dédoublonnage.
 * Minuscules, accents retirés, préfixes/types d'établissement retirés,
 * ponctuation et espaces multiples réduits.
 */
export function normalizeName(raw: string): string {
  const COMBINING_DIACRITICS = /[̀-ͯ]/g;
  const withoutAccents = raw.normalize("NFD").replace(COMBINING_DIACRITICS, "");

  const lower = withoutAccents.toLowerCase();

  // Préfixes/types d'établissement fréquents au Cameroun — retirés uniquement
  // pour le calcul du fingerprint, jamais pour l'affichage (name_raw est conservé intact).
  const prefixes = [
    "ecole publique de",
    "ecole publique",
    "ecole privee laique de",
    "ecole privee laique",
    "ecole privee catholique de",
    "ecole privee catholique",
    "ecole privee protestante de",
    "ecole privee protestante",
    "ecole privee",
    "ecole",
    "groupe scolaire",
    "complexe scolaire",
    "institut",
    "college prive de",
    "college prive",
    "college public de",
    "college public",
    "college",
    "ces de",
    "ces",
    "cetic de",
    "cetic",
    "lycee bilingue de",
    "lycee bilingue",
    "lycee technique de",
    "lycee technique",
    "lycee classique de",
    "lycee classique",
    "lycee de",
    "lycee",
  ];

  let stripped = lower.trim();
  for (const prefix of prefixes) {
    if (stripped.startsWith(prefix + " ")) {
      stripped = stripped.slice(prefix.length).trim();
      break;
    }
  }

  return stripped
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Normalise une valeur de localisation textuelle (region, department, ...). Ne devine rien : null reste null. */
export function normalizeLocationPart(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  return trimmed
    .normalize("NFC")
    .replace(/\s+/g, " ")
    .replace(/^./, (c) => c.toUpperCase());
}

/**
 * Classification canonique du sous-système à partir du texte brut de la source.
 * Retourne 'unknown' plutôt que d'inventer une valeur — voir FIELD_MAPPING.md.
 */
export function classifySubsystem(raw: string | null): Subsystem {
  if (!raw) return "unknown";
  const v = raw.toLowerCase();
  if (v.includes("bilingue") || v.includes("bilingual")) return "bilingual";
  if (v.includes("francophone")) return "francophone";
  if (v.includes("anglophone")) return "anglophone";
  return "unknown";
}

/**
 * Classification canonique de la famille d'enseignement.
 * S'appuie sur le ministère source en premier lieu (signal le plus fiable),
 * puis affine avec l'indice textuel (`educationFamilyHint`) quand disponible.
 * Retourne null si aucune classification fiable n'est possible — ne jamais deviner.
 */
export function classifyEducationFamily(record: RawSourceRecord): EducationFamily | null {
  const hint = (record.educationFamilyHint ?? "").toLowerCase();
  const name = record.nameRaw.toLowerCase();

  switch (record.sourceMinistry) {
    case "MINEDUB":
      return "basic";
    case "MINESUP":
      return "higher_education";
    case "MINEFOP":
      return "vocational_training";
    case "MINSANTE":
      return "health_training";
    case "MINADER":
      return "agricultural_training";
    case "MINEPIA":
      return "livestock_fisheries_training";
    case "MINFOF":
      return "forestry_wildlife_training";
    case "MINESEC":
      // MINESEC couvre le secondaire général ET technique, ainsi que les
      // écoles normales d'instituteurs selon la source précise consultée.
      // Le répertoire ESG (voir SOURCE_CATALOG.md) ne couvre QUE le général —
      // toute donnée technique nécessitera une source MINESEC distincte,
      // non identifiée à ce stade.
      if (
        hint.includes("normal") ||
        hint.includes("instituteur") ||
        name.includes("normale") ||
        name.includes("instituteur")
      ) {
        return "teacher_training";
      }
      if (hint.includes("technique") || hint.includes("professionnel") || name.includes("technique")) {
        return "secondary_technical";
      }
      return "secondary_general";
    default:
      return null;
  }
}

/**
 * Indice de statut de propriété. Faible confiance par nature — voir
 * FIELD_MAPPING.md. Ne classe jamais "public" ou "private" sans indice
 * explicite ; retourne null en cas de doute plutôt que d'inventer.
 */
export function inferOwnership(record: RawSourceRecord): Ownership | null {
  const hint = (record.ownershipHint ?? "").toLowerCase();
  const name = record.nameRaw.toLowerCase();

  // SPRINT MINESUP-C — une source peut fournir la valeur DÉJÀ classifiée
  // directement (ex. la page IPES/Universités d'Etat de MINESUP distingue
  // structurellement les deux listes, sans ambiguïté) plutôt qu'un simple
  // indice textuel à interpréter. Vérifié en premier, additif — ne change
  // rien au comportement existant pour un ownershipHint qui n'est PAS une
  // de ces 4 valeurs exactes (ex. "fondateur"/"promoteur" MINESEC, inchangé).
  if (hint === "public" || hint === "private" || hint === "community" || hint === "other") return hint as Ownership;

  if (hint.includes("fondateur") || hint.includes("promoteur")) return "private";
  if (name.includes("communautaire")) return "community";
  if (name.startsWith("ecole publique") || name.includes(" public") || name.includes("publique")) {
    return "public";
  }
  if (name.includes("privé") || name.includes("prive") || name.includes("catholique") || name.includes("protestant")) {
    return "private";
  }
  return null;
}

/**
 * Calcule le fingerprint de dédoublonnage.
 * Priorité absolue au matricule officiel quand il existe (voir DEDUPLICATION_RULES.md).
 * Sinon, combinaison nom normalisé + région + arrondissement/localité.
 */
export function computeFingerprint(record: RawSourceRecord, nameNormalized: string): string {
  if (record.officialIdentifier && record.officialIdentifier.trim().length > 0) {
    return `matricule:${record.officialIdentifier.trim().toUpperCase()}`;
  }

  const region = normalizeLocationPart(record.region)?.toLowerCase() ?? "unknown-region";
  const geo =
    normalizeLocationPart(record.arrondissement)?.toLowerCase() ??
    normalizeLocationPart(record.locality)?.toLowerCase() ??
    "unknown-geo";

  return `name+geo:${nameNormalized}|${region}|${geo}`;
}

/**
 * Transforme un RawSourceRecord en NormalizedStagingRecord.
 * Ne fait AUCUN appel réseau ni accès base — fonction pure, testable.
 */
export function normalizeRecord(record: RawSourceRecord): NormalizedStagingRecord {
  const nameNormalized = normalizeName(record.nameRaw);
  const fingerprint = computeFingerprint(record, nameNormalized);

  const rejectionReason =
    !record.nameRaw || record.nameRaw.trim().length === 0
      ? "nom manquant"
      : !record.region && !record.arrondissement && !record.locality
        ? "aucune donnée de localisation exploitable"
        : null;

  return {
    ...record,
    region: normalizeLocationPart(record.region),
    department: normalizeLocationPart(record.department),
    arrondissement: normalizeLocationPart(record.arrondissement),
    commune: normalizeLocationPart(record.commune),
    locality: normalizeLocationPart(record.locality),
    city: normalizeLocationPart(record.city),
    quarter: normalizeLocationPart(record.quarter),
    nameNormalized,
    educationFamily: classifyEducationFamily(record),
    ownership: inferOwnership(record),
    subsystem: classifySubsystem(record.subsystemRaw),
    fingerprint,
    status: rejectionReason ? "rejected" : "normalized",
    duplicateOfIndex: null,
    rejectionReason,
  };
}
