/**
 * SPRINT REGISTRY-MULTI-A — représentation canonique des autorités et
 * registres, pour remplacer les chaînes libres dispersées dans le code des
 * scripts de collecte/promotion.
 *
 * Distinction volontaire entre deux concepts que le projet a jusqu'ici
 * confondus sous un seul champ (`source_ministry`) :
 *
 * - AUTHORITY : l'institution émettrice (ex. MINESEC, MINESUP). Correspond
 *   à l'enum Postgres existant `registry_source_ministry`
 *   (`supabase/migrations/0006_national_registry_staging.sql`) — pas
 *   dupliqué ici, réutilisé comme source de vérité côté DB.
 * - REGISTRY (namespace) : un système d'identifiants PRÉCIS au sein d'une
 *   autorité. SPRINT MINESEC V1.1 a prouvé qu'une seule autorité (MINESEC)
 *   opère au moins deux registres incompatibles : le format ESG à 17
 *   caractères de MINESEC V1, et le format cartescolaire.cm (préfixe
 *   régional 2 lettres ou préfixe numérique non décodé). `source_ministry`
 *   seul ne peut pas représenter cette distinction — d'où ce module.
 *
 * L'unicité d'un identifiant se pense donc au niveau du REGISTRY, jamais de
 * l'AUTHORITY seule et jamais globalement : `UNIQUE(registry, identifier)`.
 */

/**
 * Miroir de l'enum Postgres `registry_source_ministry`
 * (supabase/migrations/0006_national_registry_staging.sql). Tenu manuellement
 * synchronisé — pas de génération automatique de types Postgres dans ce
 * projet à ce jour. Toute divergence doit être corrigée ici en premier,
 * jamais supposée résolue côté DB.
 *
 * MINTRANSPORT n'existe PAS encore dans l'enum Postgres — ajouté ici
 * uniquement comme constante interne stable pour que le code applicatif
 * puisse s'y référer par avance (§10 de la spec : "utiliser une constante
 * interne stable si nécessaire, mais ne pas prétendre connaître un registre
 * officiel spécifique avant son audit"). Une migration `ALTER TYPE
 * registry_source_ministry ADD VALUE 'MINTRANSPORT'` sera nécessaire avant
 * toute écriture réelle avec cette valeur — non préparée dans ce sprint,
 * aucune collecte Transport prévue avant son propre sprint d'audit.
 */
export const AUTHORITIES = [
  "MINEDUB",
  "MINESEC",
  "MINESUP",
  "MINEFOP",
  "MINSANTE",
  "MINADER",
  "MINEPIA",
  "MINFOF",
  "MINTRANSPORT", // pas encore dans l'enum Postgres — voir commentaire ci-dessus
  "OTHER",
] as const;
export type Authority = (typeof AUTHORITIES)[number];

/** Sous-ensemble de AUTHORITIES réellement présent dans l'enum Postgres aujourd'hui — vérifié en direct §4 de ce sprint. */
export const AUTHORITIES_IN_DATABASE_ENUM: readonly Authority[] = [
  "MINEDUB",
  "MINESEC",
  "MINESUP",
  "MINEFOP",
  "MINSANTE",
  "MINADER",
  "MINEPIA",
  "MINFOF",
  "OTHER",
];

export function isAuthorityInDatabaseEnum(authority: string): authority is Authority {
  return (AUTHORITIES_IN_DATABASE_ENUM as readonly string[]).includes(authority);
}

/**
 * Registres connus à ce jour — volontairement une liste OUVERTE (`string`
 * accepté en plus des valeurs connues), pas un enum fermé. §6 de la spec :
 * "ne pas inventer les vrais noms de registres futurs si nous ne les
 * connaissons pas encore. Prévoir un mécanisme extensible." Un registre
 * MINESUP/MINEFOP/MINSANTE/MINTRANSPORT réel ne sera nommé qu'après l'audit
 * de sa propre source (SPRINT MINESUP-A etc.), jamais deviné ici.
 */
export const KNOWN_REGISTRIES = [
  "MINESEC_ESG", // scripts/school-registry/sources/minesec.ts — table ESG scrapée, MINESEC V1
  "MINESEC_CARTESCOLAIRE", // cartescolaire.cm/minesec — portail officiel MINESEC, corroboration (SPRINT MINESEC V1.1/R.3.2)
  "DISCOVERY_OTHER", // sources tierces de découverte (Osidimbea, InovEdu, ecolesaucameroun.com...) — jamais un registre officiel, jamais utilisé pour un identifiant "officiel"
] as const;
export type KnownRegistry = (typeof KNOWN_REGISTRIES)[number];
export type Registry = KnownRegistry | (string & {});

export interface RegistryDescriptor {
  registry: Registry;
  authority: Authority;
  /** Format observé/attendu du matricule dans ce registre — documentaire, jamais utilisé pour valider/rejeter une valeur (§ ne jamais inventer une règle non confirmée). */
  identifierFormatNote: string;
  /** Le registre expose-t-il une géographie (région/ville) directement décodable depuis l'identifiant lui-même ? Confirmé empiriquement, jamais supposé — voir SPRINT MINESEC V1.1. */
  identifierEncodesGeography: boolean;
}

export const REGISTRY_DESCRIPTORS: Record<KnownRegistry, RegistryDescriptor> = {
  MINESEC_ESG: {
    registry: "MINESEC_ESG",
    authority: "MINESEC",
    identifierFormatNote: "17 caractères, ex. \"5EM1GSFD112245109\" — 1er chiffre = région (0-9), confirmé à 100% contre 1941 lignes connues.",
    identifierEncodesGeography: true,
  },
  MINESEC_CARTESCOLAIRE: {
    registry: "MINESEC_CARTESCOLAIRE",
    authority: "MINESEC",
    identifierFormatNote:
      "Deux sous-schémas coexistants, non fusionnables : ALPHA_PREFIX (2 lettres = code région, 8 des 10 confirmés par correspondance directe) et DIGIT_PREFIX (préfixe numérique NON décodable — tous commencent par le même chiffre, voir régression documentée dans collect-cartescolaire-national.ts). Ne jamais réutiliser le décodage MINESEC_ESG sur ce registre.",
    identifierEncodesGeography: false, // faux pour DIGIT_PREFIX, vrai partiellement pour ALPHA_PREFIX -- volontairement conservateur : false tant que les deux sous-schémas ne sont pas distingués par un champ dédié
  },
  DISCOVERY_OTHER: {
    registry: "DISCOVERY_OTHER",
    authority: "OTHER",
    identifierFormatNote: "Pas d'identifiant officiel — sources de découverte Tier 3 (annuaires privés, encyclopédies associatives). Jamais un official_id.",
    identifierEncodesGeography: false,
  },
};

/**
 * Un identifiant "officiel" ne peut provenir QUE d'un registre dont
 * l'autorité est une institution gouvernementale réelle — jamais d'une
 * source de découverte Tier 3. Utilisé par le moteur de matching pour
 * refuser de traiter un identifiant DISCOVERY_OTHER comme une preuve
 * d'identité forte (§12 : FUZZY MATCH != IDENTITY PROOF, et une source
 * Tier 3 n'est jamais une identité officielle même si elle porte un champ
 * qui ressemble à un identifiant).
 */
export function isOfficialRegistry(registry: Registry): boolean {
  const descriptor = REGISTRY_DESCRIPTORS[registry as KnownRegistry];
  if (!descriptor) return true; // registre futur inconnu : traité comme potentiellement officiel par défaut, jamais rejeté silencieusement — la décision revient au matching engine (REVIEW_REQUIRED), jamais une exclusion silencieuse.
  return descriptor.registry !== "DISCOVERY_OTHER";
}
