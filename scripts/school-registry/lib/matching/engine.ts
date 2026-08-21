import type { MatchCandidate, MatchLevel, MatchResult, MatchTarget, RegistryIdentifier } from "./types";

/**
 * SPRINT REGISTRY-MULTI-A — moteur de matching partagé, multi-registre.
 *
 * Règles permanentes (§12-13 de la spec, non négociables) :
 *  - FUZZY MATCH != IDENTITY PROOF : aucun niveau autre qu'EXACT_IDENTIFIER/
 *    EXACT_IDENTITY n'autorise une fusion automatique.
 *  - Même `identifier` texte mais `registry` différent = coïncidence,
 *    jamais un signal d'identité (espaces de nommage distincts).
 *  - Même `(registry, identifier)` = signal extrêmement fort — mais reste
 *    un signal "déjà existant", pas une fusion silencieuse de deux fiches.
 *  - Le nom normalisé ne retire JAMAIS les mots signalant une catégorie
 *    (Lycée/Collège/Technique/Bilingue/CES/...) — "Lycée Technique d'Akwa"
 *    et "Lycée d'Akwa" ne doivent jamais se fondre en une seule clé
 *    (régression trouvée et corrigée pendant SPRINT R.3, voir historique
 *    git de scripts/school-registry/promote-major-cities-controlled.ts).
 */

const GENERIC_ARTICLES = new Set(["de", "du", "des", "la", "le", "les", "d", "l", "et", "a", "au", "aux"]);

/**
 * SPRINT MINESUP-B §18 — un même établissement peut être écrit avec un
 * chiffre arabe (source MINESUP : "Université de Yaoundé 1") ou romain
 * (fiche live : "Université de Yaoundé I"). Ne convertit QUE des tokens
 * qui sont EXACTEMENT un numéral romain isolé (I-X) — jamais une lettre
 * romaine à l'intérieur d'un autre mot — pour éviter toute transformation
 * arbitraire d'un mot ordinaire (§18 : "ne pas transformer arbitrairement
 * toute lettre romaine dans tous les noms"). `official_name` n'est jamais
 * modifié : cette normalisation ne sert qu'à la clé de matching.
 */
const ROMAN_NUMERAL_TO_ARABIC: Record<string, string> = {
  i: "1", ii: "2", iii: "3", iv: "4", v: "5", vi: "6", vii: "7", viii: "8", ix: "9", x: "10",
};

function normalizeInstitutionalNumeral(word: string): string {
  return ROMAN_NUMERAL_TO_ARABIC[word] ?? word;
}

/** Clé d'identité EXACTE — normalisation minimale, préserve les mots de catégorie. */
export function exactIdentityKey(name: string): string {
  return (name || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter((w) => !GENERIC_ARTICLES.has(w))
    .map(normalizeInstitutionalNumeral)
    .sort()
    .join(" ");
}

const FUZZY_STOPWORDS = new Set([
  ...GENERIC_ARTICLES,
  "college", "collège", "lycee", "lycée", "lyce", "ces", "cetic", "cetif", "ceti", "cegt", "cefti",
  "school", "secondary", "high", "bilingual", "bilingue", "prive", "privee", "privé", "private",
  "laic", "laique", "laïc", "institut", "complexe", "scolaire", "groupe", "ecole", "école",
  "polyvalent", "technique", "public", "comprehensive",
  // SPRINT MINESUP-E — vocabulaire générique de l'enseignement SUPÉRIEUR,
  // jamais couvert avant (la liste ci-dessus vient du travail MINESEC
  // primaire/secondaire). Bug réel trouvé sur données nationales : "Jagora
  // University" (fuzzyWords = ["jagora","university"]) produisait un
  // chevauchement à 50% contre SEPT institutions Nord-Ouest différentes
  // rien qu'en partageant le mot "university" — un mot structurel de type
  // d'établissement, jamais un signal d'identité, exactement comme
  // "lycée"/"institut" ci-dessus. Mêmes principe et prudence : on ne
  // retire QUE les mots de TYPE d'établissement (university/institute/
  // higher/polytechnic/supérieur), jamais un mot de spécialité
  // (science/technology/management/business) qui reste un signal réel de
  // différenciation entre deux établissements.
  "university", "universite", "université", "institute", "higher", "polytechnic", "polytechnique",
  "superieur", "supérieur", "superieure", "supérieure",
  // SPRINT MINSANTE-B §6-7 — vocabulaire générique santé/formation, jamais
  // couvert avant (liste ci-dessus centrée MINESEC/MINESUP). Chaque mot
  // ci-dessous est ajouté sur la base d'un FAUX POSITIF RÉEL observé dans
  // reports/registry/minsante-a1-matching-sample.csv (échantillon MINSANTE-A.1,
  // moteur EXÉCUTÉ TEL QUEL, aucune modification à l'époque) — jamais une
  // supposition théorique :
  //  - "centre" + "formation" : "CENTRE DE FORMATION DU PERSONNEL PARAMEDICAL
  //    (CFPP) DE YAOUNDE" (école de santé) -> PROBABLE_MATCH à 50% contre
  //    "Centre de Formation en Couture et Mode de Yaoundé" (école de
  //    COUTURE/MODE, aucun rapport avec la santé) — uniquement par
  //    "centre"+"formation"+"yaounde" partagés. "centre" est un mot de TYPE
  //    d'établissement (comme "ecole"/"institut"/"college" déjà retirés cf.
  //    ligne ~59), pas un signal d'identité. "formation" décrit l'ACTE de
  //    former, présent dans la quasi-totalité des noms MINSANTE/MINEFOP.
  //    Risque de sur-suppression : aucune institution du corpus ne s'appuie
  //    sur "centre" ou "formation" SEUL comme identifiant — toujours
  //    accompagné d'un nom propre/ville/sigle qui reste, lui, significatif.
  //  - "personnel"/"personnels" + "medico" + "sanitaire" : "COMPLEXE PRIVE DE
  //    FORMATION DU PERSONNEL MEDICO-SANITAIRE DE MBOUDA" (Ouest) ->
  //    PROBABLE_MATCH à 60% contre "Institut Supérieur du Personnel
  //    Médico-Sanitaire (ISPM)" (Centre, institution SANS RAPPORT, déjà
  //    affaibli en PROBABLE par le conflit géographique mais ne devrait même
  //    pas apparaître comme candidat). "personnel(s)" est un descripteur
  //    administratif ("staff") présent dans la quasi-totalité des noms
  //    MINSANTE ; "medico"/"sanitaire" nomment le DOMAINE (santé) entier,
  //    pas une institution précise. Risque de sur-suppression : aucun nom du
  //    corpus n'utilise "personnel"/"medico"/"sanitaire" seul(s) comme
  //    identifiant — un nom propre, un sigle ou une ville reste toujours
  //    disponible comme signal.
  //  - "sante"/"santé" : "ECOLE PRIVEE DE FORMATION DES PERSONNELS DE SANTE
  //    FONDATION EVA POUR LA SANTE A L'EST" (Est) -> PROBABLE_MATCH à 33%
  //    contre "Institut Supérieur de Santé" (Littoral, institution SANS
  //    RAPPORT, géographie contradictoire) — "santé" est le SEUL mot
  //    significatif restant de la cible une fois "institut"/"supérieur"
  //    retirés (SPRINT MINESUP-E), exactement le même problème que
  //    "university" pour Jagora University. "santé" nomme tout le domaine
  //    (education_family=health_training), jamais une institution
  //    spécifique. Risque de sur-suppression : même raisonnement que
  //    "university" — accepté par précédent direct.
  // Volontairement PAS ajoutés faute de faux positif réel documenté ce
  // sprint (§7 : "ne pas ajouter aveuglément chaque mot listé") :
  // "medical" (forme anglaise — "medico" du corpus FR suffit, jamais observé
  // séparément), "health"/"nursing"/"training" (aucun faux positif anglophone
  // observé dans l'échantillon MINSANTE-A.1 — seulement testé en régression
  // §8.E, pas ajouté en stopword sans preuve), "professionnel"/
  // "professionnelle" (le couple réel "PROFESSIONNELS DE LA SANTE" vs
  // "PERSONNELS DE LA SANTE" DE MEIGANGA reste correctement classé AMBIGUOUS
  // — pas une fusion automatique à corriger, "professionnels" n'est pas la
  // cause du problème).
  "centre", "formation", "personnel", "personnels", "sante", "santé", "sanitaire", "sanitaires", "medico", "médico",
  // SPRINT MINSANTE-G.1 §5 — "sanitaires" (pluriel) : "sanitaire" (singulier)
  // était déjà retiré en MINSANTE-B, mais son pluriel avait été omis — même
  // oubli de pluralisation que "personnel"/"personnels" (les DEUX formes
  // explicitement ajoutées ensemble en MINSANTE-B, ligne ci-dessus). Preuve
  // réelle (une des 7 paires signalées MINSANTE-G) : "COMPLEXE PRIVE DE
  // FORMATION DES PERSONNELS MEDICO-SANITAIRES ... DE DSCHANG" (staging_id
  // b92dd780-b05c-4b47-aaa4-e6d0b6783778, CLEAN_APPROVABLE) chevauchait via
  // le seul token "sanitaires" (issu de "MEDICO-SANITAIRES") contre
  // plusieurs cibles sans rapport. Pas une nouvelle décision de fond, une
  // correction de complétude d'un stopword déjà approuvé.
  // SPRINT MINSANTE-G.1 §5-§6 — "infirmier(s)"/"infirmière(s)" : vocabulaire
  // de RÔLE générique (= "nurse"), jamais un signal d'identité, exactement
  // le même statut que "santé"/"médico"/"personnel"/"sanitaire" ci-dessus.
  // Preuve réelle (une des 7 paires signalées MINSANTE-G, jamais théorique) :
  // "ECOLE DES INFIRMIERS DIPLOMES D'ETAT DE FOUMBAN" (staging_id
  // ba827d94-6542-40fd-b811-a0d964a8bceb, CLEAN_APPROVABLE) -> AVANT ce
  // sprint, PROBABLE_MATCH (chevauchement 25%) contre "INSTITUT TROPICAL DE
  // FORMATION EN PLAIES CHRONIQUES ET EN SOINS INFIRMIERS "MOULLEC" DE
  // BALEVENG" (staging_id 27a2a636-eced-4971-8f62-67d8d1028ab3,
  // CATEGORY_REVIEW) — deux établissements à Foumban et à Baleveng
  // (localités différentes une fois city enrichi §8-9 de ce sprint), fondés
  // par des entités distinctes ("MOULLEC" est un sigle/fondateur propre à la
  // seconde), sans AUCUN autre mot commun que "infirmiers". Même
  // raisonnement de sur-suppression que "santé" (SPRINT MINSANTE-B §6-7) :
  // "infirmier(s)/infirmière(s)" nomme la PROFESSION formée, présente dans
  // la quasi-totalité des noms d'écoles paramédicales du corpus MINSANTE —
  // jamais un identifiant d'établissement à lui seul. Un nom propre, un
  // sigle ou (désormais) une ville distincte reste toujours le signal réel.
  // Formes accentuées ET non-accentuées listées explicitement : exactIdentityKey
  // normalise déjà les accents en amont (NFD + strip diacritiques), donc
  // "infirmière"/"infirmières" produisent au moment du filtre les tokens
  // "infirmiere"/"infirmieres" (sans accent) — les deux formes accentuées
  // sont conservées ici pour lisibilité du code/de l'audit, mais seules les
  // formes SANS accent participent réellement à Set.has() après normalisation.
  "infirmier", "infirmiers", "infirmiere", "infirmieres", "infirmière", "infirmières",
  // SPRINT MINSANTE-G.1 §5-§6 — "fondation" : préfixe de STATUT juridique/
  // institutionnel ("Foundation X"), au même titre que "institut"/
  // "complexe"/"école" déjà retirés — jamais lui-même un nom propre. Preuve
  // réelle (une des 7 paires signalées MINSANTE-G, observée APRÈS retrait
  // du token de ville déjà dupliqué dans city, §8/§12 de ce sprint) :
  // "ECOLE PRIVEE FONDATION TCHUENTE DE BAFOUSSAM" (staging_id
  // 9c4b9a28-1aa2-4fc2-baa8-48d3919758f7, CLEAN_APPROVABLE) -> AMBIGUOUS à
  // 50% à égalité contre DEUX écoles de fondateurs totalement différents,
  // "ECOLE PRIVEE FONDATION JEUGEUVOU FOWANG DE BAFOUSSAM" (fondateur
  // "Jeugeuvou Fowang") ET "ECOLE PRIVEE DE FORMATION DES PERSONNELS DE
  // SANTE FONDATION SAINT MAURICE DE BAFOUSSAM" (fondateur "Saint Maurice")
  // — le seul mot partagé entre "Tchuente" et ces deux cibles était
  // "fondation", jamais le nom du fondateur lui-même. Risque de
  // sur-suppression : aucun nom du corpus ne s'appuie sur "fondation" SEUL
  // comme identifiant — le nom du fondateur/de la personnalité qui suit
  // reste toujours le signal réel et distinctif (Tchuente/Jeugeuvou
  // Fowang/Saint Maurice/Tsopjio et Takoudjou...), jamais retiré ici.
  "fondation",
]);

/**
 * SPRINT MINSANTE-G.2 §5-§9 — "sciences"/"science" : ni un STOPWORD (retrait
 * total, comme "santé"/"institut"), ni un mot NORMAL/DISTINCTIVE (comme
 * "Poola"/"Tchuente"/"Excellence") — un troisième statut, WEAK_GENERIC.
 *
 * Root cause exacte des 3 derniers blocages MINSANTE-G (pilote Ouest, après
 * G.1) : "sciences" est le SEUL mot restant dans fuzzyWords() une fois
 * "institut"/"supérieur"/"santé"/"école" (déjà stopwords) ET la ville
 * (retirée en aval par geoTokens, cf. matchCandidate ci-dessous) filtrés —
 * ex. "ECOLE DES SCIENCES DE LA SANTE DE L'INSTITUT SUPERIEUR DE BAFANG" ->
 * fuzzyWords ne laisse que ["bafang","sciences"], "bafang" étant lui-même la
 * ville structurée. Deux cibles sans AUCUN rapport ("... POOLA DE
 * BAFOUSSAM", "... ARGUS DE BANDJOUN") partageaient donc 100% de
 * chevauchement via CE SEUL mot, produisant un AMBIGUOUS bloquant.
 *
 * "sciences" NE PEUT PAS devenir un stopword global (interdit explicitement
 * §MINSANTE-G.2) : SPRINT MINESUP-E prouve le cas inverse — "Institut
 * Superieur Bamenda Excellence Sciences" vs "Ecole Superieure Bamenda
 * Excellence Sciences Appliquees" (matching.test.ts, "categoryMatch=true ...
 * reste un STRONG_MATCH normal") reste un signal réel, PARCE QUE "sciences"
 * s'y ajoute à DEUX autres mots distinctifs partagés ("bamenda"/"excellence")
 * — le retirer de fuzzyWords casserait ce STRONG_MATCH légitime en lui
 * retirant un tiers de son chevauchement. La solution n'est donc PAS de
 * retirer "sciences" du calcul, mais d'empêcher qu'il soit, À LUI SEUL (ou
 * accompagné d'autres mots eux aussi WEAK_GENERIC), suffisant pour produire
 * un niveau bloquant (STRONG_MATCH/PROBABLE_MATCH/AMBIGUOUS) — cf. le
 * "distinctive overlap gate" appliqué dans matchCandidate (§9 du brief).
 *
 * Audit §5 du brief (voir aussi reports/registry/minsante-g2-sciences-token-audit.json) :
 * TOKEN "sciences"/"science" est CONTEXT_DEPENDENT — jamais un stopword sûr
 * globalement (MINESUP-E), jamais un mot d'identité fiable seul (MINSANTE-G).
 * "science" (singulier) est ajouté par SYMÉTRIE avec "sciences" — même
 * racine sémantique (domaine académique générique), aucun test existant ne
 * distingue les deux formes via matchCandidate (seul fuzzyWords() est testé
 * directement sur la forme anglaise "Science and Technology", jamais une
 * décision de correspondance) — cohérent avec le principe de complétude de
 * pluralisation déjà appliqué en G.1 (sanitaire/sanitaires, infirmier(s)).
 *
 * IMPORTANT : ce Set est séparé de FUZZY_STOPWORDS. Un mot WEAK_GENERIC
 * reste dans la sortie de `fuzzyWords()` (le ratio de chevauchement le
 * compte toujours, comme avant — aucune régression de seuil/ratio) ; seule
 * la fonction `hasDistinctiveOverlap` ci-dessous l'ignore pour décider si UN
 * chevauchement est une preuve d'identité suffisante.
 */
/**
 * SPRINT TRANSPORT-A.1-T3 §13-§14 — vocabulaire générique AUTO-ÉCOLE.
 *
 * Root cause exacte du faux-positif trouvé (et laissé délibérément non
 * corrigé, read-only) en TRANSPORT-A.1 : "AUTO ECOLE LEO" (Tier 3, Yaoundé)
 * produisait un STRONG_MATCH à 100% de chevauchement contre la fiche seed
 * "Auto-École La Route Sûre" (Yaoundé, elle-même une donnée de seed/démo,
 * pas une source officielle — voir TRANSPORT_IMPORT_CONTRACT.md §13).
 * Rejoué ici : `fuzzyWords("AUTO ECOLE LEO")` = ["auto"] seulement — "ecole"
 * est déjà un stopword (ligne ~59), et "leo" (3 caractères) est éliminé par
 * le filtre de longueur >3 de `fuzzyWords()`. Il ne reste donc QU'UN SEUL
 * mot flou du côté candidat : "auto". Comme il apparaît aussi dans
 * "Auto-École La Route Sûre" (mots flous restants : auto/route/sure), le
 * ratio de chevauchement candidat atteint 100% alors qu'aucune identité
 * réelle n'est démontrée — exactement le même mécanisme que "sciences"
 * (SPRINT MINSANTE-G.2 ci-dessus), pas une coïncidence.
 *
 * "auto" NE PEUT PAS devenir un STOPWORD global à l'aveugle (interdiction
 * explicite du brief §13) : contrairement à "école"/"institut"/"formation",
 * il peut légitimement participer à un VRAI signal d'identité s'il
 * accompagne un autre mot distinctif partagé (ex. deux variantes du même
 * nom "AUTO ECOLE TURBO NKOMKANA" vs "AUTO-ECOLE TURBO NKOMKANA DOUALA" —
 * le retirer complètement romprait ce genre de correspondance légitime,
 * même si "nkomkana" seul suffirait déjà ici). La solution retenue est donc
 * la MÊME que pour "sciences" : `WEAK_GENERIC_TOKENS`, pas
 * `FUZZY_STOPWORDS` — "auto" reste dans la sortie de `fuzzyWords()` (le
 * ratio affiché ne change pas), mais ne peut plus, À LUI SEUL, produire un
 * niveau bloquant via le "distinctive overlap gate" déjà en place.
 *
 * "autoecole" (forme SANS séparateur, ex. une source qui écrit
 * "AUTOECOLE MONTHE" en un seul mot) est ajouté par le même raisonnement,
 * préventivement : le tokenizer (`exactIdentityKey`/`fuzzyWords`) ne scinde
 * QUE sur les caractères non alphanumériques (espace/tiret/apostrophe...),
 * donc "autoecole" écrit collé ne serait JAMAIS découpé en "auto"+"ecole"
 * et échapperait entièrement au stopword "ecole" existant — un candidat
 * "AUTOECOLE X" partagerait alors le seul mot "autoecole" avec un autre
 * "AUTOECOLE Y" sans rapport, exactement le même risque de faux-positif
 * que "auto" seul, avant même d'atteindre le filtre "ecole". Ajouté ici de
 * façon structurelle (même mécanisme, même preuve directe), pas comme une
 * supposition théorique séparée.
 *
 * Audit complet du vocabulaire auto-école demandé par le brief §13 (voir
 * aussi reports/registry/transport-tier3-matching-hardening-audit.json) :
 *   - "ecole"/"école"                -> STOPWORD (déjà présent, inchangé)
 *   - "formation"                    -> STOPWORD (déjà présent, inchangé)
 *   - "auto"                         -> WEAK_GENERIC (ajouté ce sprint, preuve directe ci-dessus)
 *   - "autoecole" (forme collée)     -> WEAK_GENERIC (ajouté ce sprint, même mécanisme structurel)
 *   - "auto-ecole" (forme à tiret)   -> N/A séparément : le tiret est déjà normalisé en espace par
 *                                       exactIdentityKey/fuzzyWords, donc cette forme se scinde
 *                                       automatiquement en "auto"+"ecole", chacun déjà couvert
 *                                       ci-dessus — aucune entrée de Set dédiée nécessaire.
 *   - "conduite"/"permis"/"route"    -> NON ajoutés ce sprint, volontairement — aucun faux positif
 *                                       RÉEL observé sur le corpus Transport disponible (17
 *                                       institutions, voir data/registry/normalized/transport-tier3-v1/),
 *                                       cohérent avec le principe déjà appliqué en MINSANTE-B/G.1/G.2
 *                                       ("ne pas ajouter aveuglément chaque mot générique plausible
 *                                       sans preuve — un nom propre/ville/sigle reste toujours le
 *                                       signal réel restant"). À RÉÉVALUER si un futur sprint de
 *                                       collecte réelle (TRANSPORT-A.2-T3 ou suivant) documente un
 *                                       faux positif concret impliquant l'un de ces trois mots.
 */
const WEAK_GENERIC_TOKENS = new Set(["sciences", "science", "auto", "autoecole"]);

/**
 * SPRINT MINSANTE-G.2 §9 — extraction d'un sigle/acronyme explicite entre
 * parenthèses (ex. "(BUIST)", "(IURB)", déjà présents dans des fiches réelles
 * du corpus — cf. matching.test.ts/minsante-g1-matching-after.csv) : preuve
 * de corroboration FORTE et STRUCTURELLE, indépendante du vocabulaire
 * (générique ou non). Un sigle EXACTEMENT identique des deux côtés reste un
 * signal d'identité même quand le seul mot flou partagé par ailleurs est
 * WEAK_GENERIC (§9 : "exact acronym" listé comme corroboration valable).
 *
 * Prudence délibérée pour éviter un FAUX signal de corroboration (le corpus
 * MINSANTE est très souvent intégralement en MAJUSCULES, donc "être en
 * majuscules" seul ne prouve rien) :
 *  - seulement un token ENTRE PARENTHÈSES (jamais un mot capitalisé isolé
 *    dans le corps du nom) ;
 *  - jamais un article/stopword déjà connu (ex. un nom de catégorie ou un
 *    mot générique écrit par erreur entre parenthèses) ;
 *  - jamais un token qui coïncide avec la ville/région STRUCTURÉE (`city`/
 *    `region`) de l'un OU l'autre côté — sinon une ville notée entre
 *    parenthèses ("... (Ngaoundéré)") serait prise à tort pour un sigle
 *    partagé entre deux établissements sans rapport situés dans la même
 *    ville.
 */
function extractParentheticalAcronym(name: string, geoTokens: Set<string>): string | null {
  const matches = Array.from((name || "").matchAll(/\(([A-Za-z0-9][A-Za-z0-9.\-]{1,9})\)/g));
  for (const m of matches) {
    const raw = m[1];
    const norm = normalizeGeo(raw);
    if (!norm || GENERIC_ARTICLES.has(norm) || FUZZY_STOPWORDS.has(norm) || WEAK_GENERIC_TOKENS.has(norm)) continue;
    if (geoTokens.has(norm)) continue;
    return raw.toUpperCase();
  }
  return null;
}

/** Mots significatifs pour le chevauchement flou (REVIEW uniquement, jamais une preuve d'identité). */
export function fuzzyWords(name: string): string[] {
  // SPRINT MINESUP-E — un token purement numérique (ex. "1"/"2", issu de
  // la normalisation romaine/arabe I->1/II->2) reste significatif même
  // sous le seuil de longueur >3 : sans cette exception, "Université de
  // Yaoundé I" et "Université de Yaoundé II" perdaient TOUTES DEUX leur
  // seul mot distinctif ("1"/"2", 1 caractère) et ne partageaient plus que
  // "yaounde", produisant un chevauchement à 100% entre deux universités
  // pourtant différentes (jamais un auto-merge — safeForAutoLink reste
  // false — mais une fausse ambiguïté évitable). Un mot alphabétique court
  // (ex. "de", déjà filtré par GENERIC_ARTICLES) n'est pas concerné.
  return exactIdentityKey(name).split(" ").filter((w) => (w.length > 3 || /^\d+$/.test(w)) && !FUZZY_STOPWORDS.has(w));
}

function normalizeGeo(v: string | null | undefined): string {
  return (v || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]/g, "");
}

/**
 * SPRINT MINSANTE-G.1 §11-§12 — remplace l'ancien calcul ad hoc
 * `candidateGeo = normalizeGeo(region) || normalizeGeo(city)` (RÉGION EN
 * PRIORITÉ, city en simple filet de secours) par une comparaison à
 * granularité explicite, généralisée à tous les registres (pas seulement
 * MINSANTE) :
 *
 *  1. Si LES DEUX côtés ont une `city` connue -> comparaison au niveau ville
 *     (le signal le plus spécifique disponible l'emporte toujours).
 *  2. Sinon, si LES DEUX côtés ont une `region` connue -> comparaison au
 *     niveau région (signal plus grossier, seulement utilisé quand la ville
 *     est indisponible d'au moins un côté).
 *  3. Sinon -> "UNKNOWN" — jamais un accord positif.
 *
 * Root cause corrigée (MINSANTE-G, pilote Ouest) : avec l'ancien ordre
 * `region || city`, `region` (presque toujours renseignée) court-circuitait
 * TOUJOURS `city` via `||` — la colonne `city`, même une fois enrichie
 * (§8-9 de ce sprint), n'était jamais réellement consultée par le moteur
 * tant que `region` était non vide. Deux écoles de Bafoussam et de Bafang
 * dans la même région 'Ouest' apparaissaient donc "géographiquement
 * cohérentes par défaut", sans jamais qu'un conflit de ville puisse être
 * détecté. §11 (sémantique NULL) reste garanti par construction : si les
 * DEUX villes sont NULL, l'étape 1 est ignorée (aucune città connue des
 * deux côtés) — un accord positif ne peut alors provenir QUE d'une région
 * réellement partagée à l'étape 2, jamais d'une paire NULL/NULL comptée
 * comme "MATCH" (ce cas retourne "UNKNOWN" à l'étape 3 si la région est
 * elle aussi inconnue des deux côtés).
 */
export type GeoAgreement = "MATCH" | "CONFLICT" | "UNKNOWN";

export function geoAgreement(aRegion: string | null | undefined, aCity: string | null | undefined, bRegion: string | null | undefined, bCity: string | null | undefined): GeoAgreement {
  const aCityN = normalizeGeo(aCity);
  const bCityN = normalizeGeo(bCity);
  if (aCityN && bCityN) return aCityN === bCityN ? "MATCH" : "CONFLICT";

  const aRegionN = normalizeGeo(aRegion);
  const bRegionN = normalizeGeo(bRegion);
  if (aRegionN && bRegionN) return aRegionN === bRegionN ? "MATCH" : "CONFLICT";

  return "UNKNOWN";
}

function wordOverlapRatio(a: string[], b: string[]): number {
  if (a.length === 0) return 0;
  const bSet = new Set(b);
  return a.filter((w) => bSet.has(w)).length / a.length;
}

/**
 * Deux identifiants "désignent le même acte" si registry + identifier
 * correspondent ET (au moins un des deux n'a pas de identifier_type, OU
 * les deux identifier_type correspondent). Absence de identifier_type
 * d'un côté = comportement historique permissif (cohérent avec la colonne
 * nullable de la migration 0021) — mais quand LES DEUX côtés précisent un
 * identifier_type différent, ce n'est PAS la même ligne (ex. un
 * "CREATION_ORDER" et une "OPENING_AUTHORIZATION" qui partagent la même
 * chaîne de texte brute, cas réel trouvé SPRINT MINESUP-B.1).
 */
function sameIdentifierClaim(a: RegistryIdentifier, b: RegistryIdentifier): boolean {
  if (a.registry !== b.registry) return false;
  if (a.identifier.trim().toUpperCase() !== b.identifier.trim().toUpperCase()) return false;
  if (a.identifierType && b.identifierType && a.identifierType !== b.identifierType) return false;
  return true;
}

function findIdentifierMatch(candidate: RegistryIdentifier[], target: MatchTarget): RegistryIdentifier | null {
  for (const ci of candidate) {
    const hit = target.identifiers.find((ti) => sameIdentifierClaim(ti, ci));
    if (hit) return hit;
  }
  return null;
}

/** true si le candidat mentionne un identifiant texte présent chez la cible, mais dans un AUTRE registre — coïncidence à ignorer explicitement, jamais un signal. */
function hasCrossRegistryCoincidence(candidate: RegistryIdentifier[], target: MatchTarget): boolean {
  for (const ci of candidate) {
    for (const ti of target.identifiers) {
      if (ti.registry !== ci.registry && ti.identifier.trim().toUpperCase() === ci.identifier.trim().toUpperCase()) return true;
    }
  }
  return false;
}

export interface MatchOptions {
  /** Seuil de chevauchement flou pour STRONG_MATCH (défaut 0.66 — même seuil que R.3.1). */
  strongOverlapThreshold?: number;
}

/**
 * Compare UN candidat à une liste de cibles (établissements live, ou autres
 * candidats du même lot pour la détection de doublons internes) et retourne
 * le MEILLEUR résultat trouvé, jamais une fusion.
 */
export function matchCandidate(candidate: MatchCandidate, targets: MatchTarget[], options: MatchOptions = {}): MatchResult {
  const threshold = options.strongOverlapThreshold ?? 0.66;

  // Niveau 1 — EXACT_IDENTIFIER : (registry, identifier) strictement identique.
  if (candidate.identifiers.length > 0) {
    const exactIdMatches = targets.map((t) => ({ target: t, hit: findIdentifierMatch(candidate.identifiers, t) })).filter((x) => x.hit);
    if (exactIdMatches.length === 1) {
      const { target, hit } = exactIdMatches[0];
      return {
        level: "EXACT_IDENTIFIER",
        target,
        alternativeTargets: [],
        reason: `identifiant (${hit!.registry}, ${hit!.identifier}) trouvé identique chez la cible — signal le plus fort possible, contrainte d'unicité (registry, identifier) à respecter.`,
        safeForAutoLink: false,
      };
    }
    if (exactIdMatches.length > 1) {
      // Collision réelle : le même (registry, identifier) est revendiqué par plusieurs cibles — anomalie de données, jamais résolue silencieusement.
      return {
        level: "AMBIGUOUS",
        target: null,
        alternativeTargets: exactIdMatches.map((x) => x.target),
        reason: `COLLISION — ${exactIdMatches.length} cibles distinctes revendiquent le même (registry, identifier). Violation de la contrainte d'unicité attendue — nécessite une revue humaine immédiate, jamais un choix automatique.`,
        safeForAutoLink: false,
      };
    }
  }

  const candidateKey = exactIdentityKey(candidate.name);

  // Niveau 2 — EXACT_IDENTITY : nom exact (mots de catégorie préservés) + géographie cohérente quand les deux sont connues.
  // §11/§12 SPRINT MINSANTE-G.1 — géographie évaluée via geoAgreement (city
  // en priorité, region en repli SEULEMENT si city inconnue d'un côté ou de
  // l'autre ; NULL/NULL ne compte jamais comme un accord).
  const exactNameTargets = targets.filter((t) => exactIdentityKey(t.name) === candidateKey);
  if (exactNameTargets.length > 0) {
    const exactNameWithGeo = exactNameTargets.map((t) => ({ t, geo: geoAgreement(candidate.region, candidate.city, t.region, t.city) }));
    const geoConsistent = exactNameWithGeo.filter((x) => x.geo !== "CONFLICT").map((x) => x.t);
    const geoConfirmed = exactNameWithGeo.filter((x) => x.geo === "MATCH").map((x) => x.t);
    if (geoConfirmed.length === 1) {
      return {
        level: "EXACT_IDENTITY",
        target: geoConfirmed[0],
        alternativeTargets: [],
        reason: "nom exact (mots de catégorie préservés) + géographie confirmée cohérente.",
        safeForAutoLink: false,
      };
    }
    if (geoConfirmed.length > 1) {
      return {
        level: "AMBIGUOUS",
        target: null,
        alternativeTargets: geoConfirmed,
        reason: `${geoConfirmed.length} cibles ont un nom exact ET une géographie cohérente — impossible de désigner une cible unique sans information supplémentaire.`,
        safeForAutoLink: false,
      };
    }
    if (geoConsistent.length === 1 && exactNameTargets.length === 1) {
      // Nom exact, mais géographie non vérifiable d'un côté ou de l'autre (ex. schéma d'identifiant sans géographie décodable) — pas un conflit, juste non confirmé.
      return {
        level: "STRONG_MATCH",
        target: geoConsistent[0],
        alternativeTargets: [],
        reason: "nom exact (mots de catégorie préservés), géographie non vérifiable d'un côté (jamais un conflit confirmé) — identité fortement probable, pas certaine.",
        safeForAutoLink: false,
      };
    }
    // Nom exact mais géographie CONTRADICTOIRE, ou plusieurs cibles sans confirmation univoque.
    return {
      level: "AMBIGUOUS",
      target: null,
      alternativeTargets: exactNameTargets,
      reason: "nom exact trouvé mais géographie contradictoire ou correspondance multiple non résolue — revue humaine requise.",
      safeForAutoLink: false,
    };
  }

  // Niveau 3/4 — chevauchement flou (STRONG_MATCH / PROBABLE_MATCH), jamais une preuve d'identité.
  const candWordsBase = fuzzyWords(candidate.name);
  if (candWordsBase.length === 0) {
    return { level: "NO_MATCH", target: null, alternativeTargets: [], reason: "nom candidat sans mot significatif exploitable.", safeForAutoLink: false };
  }

  const scored = targets
    .map((t) => {
      const geo = geoAgreement(candidate.region, candidate.city, t.region, t.city);
      const geoMatch = geo === "MATCH" ? true : geo === "UNKNOWN" ? null : false; // null = non vérifiable — conservé pour compat texte de `reason` ci-dessous
      const geoConflict = geo === "CONFLICT";
      const categoryMatch = candidate.category && t.category ? candidate.category === t.category : null;
      // SPRINT MINSANTE-G.1 §8/§12 — un nom de LOCALITÉ qui figure DÉJÀ dans
      // le champ structuré city/region (des deux côtés, une fois enrichi
      // §8-9) ne doit pas ÉGALEMENT compter comme un mot "distinctif" du
      // chevauchement flou : c'est une double comptabilisation du même
      // signal géographique, pas une preuve d'identité supplémentaire.
      // Root cause exacte observée ce sprint (pilote Ouest, une fois
      // "infirmiers" retiré et city enrichi) : PLUSIEURS écoles réelles et
      // DISTINCTES de Bafoussam restaient à égalité de chevauchement (33%,
      // 50%...) simplement parce qu'elles partagent le token "bafoussam" —
      // qui est exactement le contenu de leur `city` déjà comparé par
      // geoAgreement ci-dessus. Retirer ce token du ratio flou force le
      // chevauchement à reposer sur un VRAI mot distinctif (nom propre,
      // sigle, fondateur) — jamais sur la ville seule, qu'il y ait accord ou
      // conflit géographique. N'affecte JAMAIS geoAgreement lui-même (le
      // signal géographique structuré reste calculé séparément ci-dessus).
      const geoTokens = new Set([normalizeGeo(candidate.city), normalizeGeo(candidate.region), normalizeGeo(t.city), normalizeGeo(t.region)].filter((v) => v.length > 0));
      const candWords = candWordsBase.filter((w) => !geoTokens.has(w));
      const targetWordsRaw = fuzzyWords(t.name).filter((w) => !geoTokens.has(w));
      const ratio = candWords.length > 0 ? wordOverlapRatio(candWords, targetWordsRaw) : 0;
      // SPRINT MINSANTE-G.2 §7-§9 — "distinctive token evidence" : les mots
      // PARTAGÉS qui pilotent réellement le ratio ci-dessus, séparés en
      // WEAK_GENERIC (ex. "sciences") vs le reste (nom propre, sigle,
      // fondateur, spécialité réelle...). Un chevauchement composé
      // UNIQUEMENT de mots WEAK_GENERIC n'est jamais, à lui seul, une preuve
      // d'identité (§9 : "shared generic words alone must not create a
      // promotion blocker") — sauf corroboration structurelle plus forte
      // (sigle exact identique des deux côtés, §9).
      const targetWordsSet = new Set(targetWordsRaw);
      const overlapWords = candWords.filter((w) => targetWordsSet.has(w));
      const hasDistinctiveOverlap = overlapWords.some((w) => !WEAK_GENERIC_TOKENS.has(w));
      const candAcronym = extractParentheticalAcronym(candidate.name, geoTokens);
      const targetAcronym = extractParentheticalAcronym(t.name, geoTokens);
      const acronymCorroboration = !!candAcronym && !!targetAcronym && candAcronym === targetAcronym;
      return { target: t, ratio, geo, geoMatch, geoConflict, categoryMatch, hasDistinctiveOverlap, acronymCorroboration };
    })
    // SPRINT MINESUP-C — categoryMatch === false (les deux catégories sont
    // CONNUES et DIFFÉRENTES) exclut la cible du chevauchement flou. Bug réel
    // trouvé sur données réelles : un candidat higher_education ("Bamenda
    // University Institute of Science and Technology") chevauchait à 17%
    // plusieurs "Lycée Bilingue de BAMENDA" (secondaire) par le seul nom de
    // ville partagé "Bamenda" — un nom de ville n'est jamais un signal
    // d'identité entre deux catégories d'établissement explicitement
    // différentes. categoryMatch===null (au moins une catégorie inconnue)
    // reste permissif, comme pour geoConflict — jamais un blocage sur une
    // absence d'information.
    //
    // SPRINT MINSANTE-G.2 §9 — "distinctive overlap gate" : en plus des
    // filtres existants, une cible dont le SEUL chevauchement provient de
    // mot(s) WEAK_GENERIC (ex. "sciences") ET qui n'a AUCUNE corroboration
    // structurelle (sigle exact partagé) est écartée ICI, au même titre
    // qu'un ratio nul — ce n'est jamais un candidat de doublon viable, donc
    // jamais un gagnant ni un participant à une égalité AMBIGUOUS. Ne
    // retire RIEN de `fuzzyWords()`/du ratio affiché par ailleurs — change
    // seulement quelles cibles peuvent produire un niveau bloquant.
    .filter((s) => s.ratio > 0 && s.categoryMatch !== false && (s.hasDistinctiveOverlap || s.acronymCorroboration))
    .sort((a, b) => b.ratio - a.ratio);

  if (scored.length === 0) {
    // SPRINT MINSANTE-G.2 — message de `reason` précis : ne prétendre
    // "chevauchement WEAK_GENERIC uniquement" QUE si c'est réellement la
    // cause de l'exclusion (même filtre ratio>0 && categoryMatch!==false
    // que `scored` ci-dessus — sinon un candidat exclu par catégorie
    // incompatible, ou sans aucun mot commun, afficherait à tort le même
    // texte que le cas WEAK_GENERIC, ce qui tromperait un audit humain).
    const excludedOnlyByWeakGate = targets.some((t) => {
      const geo = geoAgreement(candidate.region, candidate.city, t.region, t.city);
      const categoryMatch = candidate.category && t.category ? candidate.category === t.category : null;
      if (categoryMatch === false) return false;
      const geoTokens = new Set([normalizeGeo(candidate.city), normalizeGeo(candidate.region), normalizeGeo(t.city), normalizeGeo(t.region)].filter((v) => v.length > 0));
      const candWords = candWordsBase.filter((w) => !geoTokens.has(w));
      const targetWords = fuzzyWords(t.name).filter((w) => !geoTokens.has(w));
      const targetWordsSet = new Set(targetWords);
      const overlap = candWords.filter((w) => targetWordsSet.has(w));
      return overlap.length > 0 && overlap.every((w) => WEAK_GENERIC_TOKENS.has(w));
    });
    return {
      level: "NO_MATCH",
      target: null,
      alternativeTargets: [],
      reason: excludedOnlyByWeakGate
        ? 'chevauchement uniquement composé de vocabulaire générique/faible (ex. "sciences") sans mot distinctif partagé ni corroboration (sigle exact identique) — signal insuffisant pour un doublon potentiel (SPRINT MINSANTE-G.2 §9).'
        : "aucun mot significatif commun avec une cible.",
      safeForAutoLink: false,
    };
  }

  // SPRINT MINSANTE-G.1 §6/§7.D/§12 — une cible en CONFLIT géographique
  // explicite (ville ou région CONNUES et DIFFÉRENTES des deux côtés) ne
  // doit jamais l'emporter sur, ni faire égalité avec, une cible SANS
  // conflit au même ratio de chevauchement : "different explicit cities ->
  // strong negative signal" (§7.D). Root cause exacte du blocage MINSANTE-G
  // (7/8 candidats du pilote AMBIGUOUS/PROBABLE_MATCH) : l'ancien tri ne
  // triait QUE par `ratio`, jamais par géographie — deux cibles à égalité de
  // mots génériques partagés ("sciences", "infirmiers"...) restaient
  // TOUJOURS à égalité même quand l'une était dans la bonne ville et l'autre
  // dans une ville différente. Correction : si au moins une cible SANS
  // conflit existe, le pool de désambiguïsation se limite à ces cibles-là ;
  // les cibles en conflit ne sont ni gagnantes ni décomptées comme égalité
  // (mais restent visibles ailleurs si besoin — jamais supprimées des
  // `targets` en entrée, seulement écartées de CE choix de meilleur/égalité).
  // Si TOUTES les cibles à égalité sont en conflit géographique, aucune n'est
  // préférée arbitrairement : on retombe sur le comportement historique
  // (AMBIGUOUS sur l'ensemble complet) — ce correctif ne fabrique jamais un
  // gagnant depuis un pool entièrement contradictoire.
  const nonConflicting = scored.filter((s) => !s.geoConflict);
  const pool = nonConflicting.length > 0 ? nonConflicting : scored;

  const best = pool[0];
  const runnerUp = pool[1];
  if (runnerUp && runnerUp.ratio === best.ratio && runnerUp.target.id !== best.target.id) {
    return {
      level: "AMBIGUOUS",
      target: null,
      alternativeTargets: pool.filter((s) => s.ratio === best.ratio).map((s) => s.target),
      reason: `plusieurs cibles à égalité de chevauchement (${Math.round(best.ratio * 100)}%) — pas de gagnant clair.`,
      safeForAutoLink: false,
    };
  }

  if (best.ratio >= threshold && best.geoConflict !== true) {
    return {
      level: "STRONG_MATCH",
      target: best.target,
      alternativeTargets: [],
      reason: `chevauchement de mots fort (${Math.round(best.ratio * 100)}%)${best.geoMatch ? " + géographie cohérente" : best.geoMatch === null ? ", géographie non vérifiable (pas de conflit connu)" : ""}.`,
      safeForAutoLink: false,
    };
  }

  return {
    level: "PROBABLE_MATCH",
    target: best.target,
    alternativeTargets: [],
    reason: best.geoConflict
      ? `chevauchement de mots (${Math.round(best.ratio * 100)}%) mais géographie CONTRADICTOIRE — signal affaibli, revue requise.`
      : `chevauchement de mots partiel (${Math.round(best.ratio * 100)}%), insuffisant pour STRONG_MATCH.`,
    safeForAutoLink: false,
  };
}

/**
 * §13 — vrai uniquement si deux cibles revendiquent le même
 * (registry, identifier_type, identifier), jamais résolu automatiquement.
 * Une ligne sans identifier_type reste comparée par (registry, identifier)
 * seul — même logique permissive que `sameIdentifierClaim` (cohérent avec
 * la colonne nullable de la migration 0021).
 */
export function findIdentifierCollisions(all: MatchTarget[]): { registry: string; identifierType: string | null; identifier: string; targets: MatchTarget[] }[] {
  const byKey = new Map<string, { registry: string; identifierType: string | null; identifier: string; targets: MatchTarget[] }>();
  for (const t of all) {
    for (const id of t.identifiers) {
      const key = `${id.registry}|${id.identifierType ?? ""}|${id.identifier.trim().toUpperCase()}`;
      if (!byKey.has(key)) byKey.set(key, { registry: id.registry, identifierType: id.identifierType ?? null, identifier: id.identifier, targets: [] });
      byKey.get(key)!.targets.push(t);
    }
  }
  const collisions: { registry: string; identifierType: string | null; identifier: string; targets: MatchTarget[] }[] = [];
  for (const entry of byKey.values()) {
    const uniqueTargetIds = new Set(entry.targets.map((t) => t.id));
    if (uniqueTargetIds.size > 1) collisions.push(entry);
  }
  return collisions;
}

export { hasCrossRegistryCoincidence };
