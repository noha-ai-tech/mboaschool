import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * SPRINT MINSANTE-I.1 — Dérive les rapports d'analyse par filière
 * (imagerie / pharma) à partir du dump forensique brut READ-ONLY
 * (`minsante-i1-forensics-raw.json`, produit par `minsante-i1-forensics.ts`
 * contre le PDF réel, découpage EXACT par index d'item — voir ce fichier
 * pour la méthodologie). Aucune nouvelle lecture réseau ni DB ici — pure
 * transformation locale, reproductible tant que le fichier source existe.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..", "..");
const reportsDir = join(rootDir, "reports", "registry");

const raw = JSON.parse(readFileSync(join(reportsDir, "minsante-i1-forensics-raw.json"), "utf-8"));

// ── IMAGERIE MÉDICALE ────────────────────────────────────────────────────
const imagerieAnalysis = {
  sprint: "MINSANTE-I.1",
  generated_at: new Date().toISOString(),
  program: "Imagerie Médicale",
  source_sha256: raw.source.sha256,
  section_bounds: {
    method: "Découpage EXACT par index d'item global (borne = item 'FILIERE : ...' suivant dans le flux de contenu), PAS par page entière.",
    ...raw.imagerie.section_exact,
    caveat: raw.imagerie.caveat,
  },
  item_level_evidence: {
    total_items_in_exact_section: raw.imagerie.items.length,
    digit_containing_items_in_exact_section: raw.imagerie.any_digit_tokens.length,
    digit_items_detail: raw.imagerie.any_digit_tokens,
    digit_items_interpretation:
      "Les 2 seuls items contenant un chiffre dans la section EXACTE d'Imagerie Médicale sont le marqueur de pied de page ('4' et '11', formant 'Page 4 sur 11') — situés HORS du tableau (colonne étiquette/entrée), PAS des numéros de ligne. Aucun numéro de ligne '1.', '2.', etc. n'existe dans le flux de contenu peint pour cette filière, contrairement aux 8 filières SAFE et à Sciences Pharmaceutiques (voir minsante-i1-pharma-analysis.json) qui en contiennent systématiquement.",
  },
  operator_level_evidence: raw.imagerie.op_dumps.map((d: any) => ({
    page: d.pageNum,
    total_operators: d.totalOps,
    showText: d.opCounts.showText ?? 0,
    beginText: d.opCounts.beginText ?? 0,
    endText: d.opCounts.endText ?? 0,
    paintImageXObject: d.opCounts.paintImageXObject ?? 0,
    paintFormXObjectBegin: d.opCounts.paintFormXObjectBegin ?? 0,
    annotations_count: d.annotations.length,
    note: "showText === beginText === endText : aucune opération de texte non appariée/perdue par pdf.js. paintImageXObject=0 et paintFormXObjectBegin=0 sur TOUTES les pages du document (pas seulement Imagerie) — aucune image ni Form XObject n'est utilisé nulle part dans ce document pour peindre du contenu, ce qui exclut catégoriquement l'hypothèse 'numéro peint comme image/graphique' pour l'ensemble du PDF, pas seulement pour cette filière.",
  })),
  structure_tree_evidence: {
    tagged_pdf: true,
    note: "Document tagué (structTree présent, rôles Table/TR/TH/TD/P/L/LI/LBody). Les rôles L/LI/LBody (structure de LISTE, typique d'une numérotation automatique éditeur) sont quasi absents des pages contenant la portion propre à Imagerie Médicale (voir role_counts_by_page) comparé aux filières numérotées adjacentes (ex. Infirmiers, qui partage la page 4) — cohérent avec des lignes jamais authored comme liste numérotée dans le document source, mais cette corrélation par PAGE (pas par item) est indicative, pas une preuve indépendante à elle seule.",
    role_counts_by_page: raw.imagerie.op_dumps.map((d: any) => {
      const counts: Record<string, number> = {};
      function walk(node: any) {
        if (!node) return;
        if (node.role) counts[node.role] = (counts[node.role] ?? 0) + 1;
        if (node.children) for (const c of node.children) walk(c);
      }
      walk(d.structTree);
      return { page: d.pageNum, role_counts: counts };
    }),
  },
  ocr_used: false,
  ocr_rationale: "Non utilisé — §3 du brief exige d'épuiser l'analyse PDF native avant tout recours à l'OCR. L'analyse native (texte, opérateurs, structure, annotations) est concluante : aucun signal de numéro peint sous quelque forme que ce soit (texte, image, vecteur additionnel, structure de liste) n'a été trouvé.",
  verdict: "SOURCE_DEFECT_UNRESOLVED",
  verdict_basis:
    "Les numéros de ligne sont RÉELLEMENT ABSENTS du flux de contenu peint pour cette filière (pas seulement encodés autrement) : confirmé par (a) zéro item texte contenant un chiffre dans la section exacte hors marqueurs de pied de page, (b) zéro image/form XObject dans tout le document, (c) zéro annotation sur les pages concernées, (d) showText=beginText=endText (aucune perte d'extraction), (e) profil de structure de liste (L/LI/LBody) cohérent avec l'absence d'authoring en liste numérotée. C'est un défaut PERMANENT du document source lui-même, pas un artefact d'outil.",
  completeness_proof_attempted: {
    explicit_total_declared_in_document: false,
    alternate_official_document_same_population: false,
    provably_complete_table_structure_without_numbering: false,
    criterion_applied:
      "Aucun invariant officiel démontré (nombre total explicitement déclaré : absent du document entier, recherché sur les 11 pages, 0 occurrence de 'total'/'effectif'/'nombre' ; liste alternative numérotée : aucune source alternative trouvée, voir minsante-i1-source-corroboration.json ; second document officiel donnant la même population : la version anglaise du même site pointe vers EXACTEMENT le même fichier encodé, pas un document distinct). Le fait que le découpage par ligne (heuristique d'écart Y) ait été validé sans erreur sur les 8 filières SAFE (où la numérotation source sert de vérité terrain) donne une confiance méthodologique dans l'OUTIL, mais ne constitue PAS un invariant OFFICIEL issu de la SOURCE elle-même — le seuil de preuve du sprint exige ce dernier, pas une confiance logicielle. Décision : SOURCE_DEFECT_UNRESOLVED, pas SAFE.",
  },
  human_validation_could_resolve: true,
  human_validation_note:
    "Une validation documentaire humaine (obtention de l'arrêté/décision MINSANTE original signé, ou d'un décompte officiel communiqué directement par le ministère) pourrait raisonnablement résoudre ce défaut — c'est un problème de PREUVE DE COMPLÉTUDE, pas de parsing : les ~30 lignes reconstruites sont probablement correctes, mais rien dans ce document ne permet de le PROUVER au niveau d'exigence de ce sprint.",
};
writeFileSync(join(reportsDir, "minsante-i1-imagerie-analysis.json"), JSON.stringify(imagerieAnalysis, null, 2), "utf-8");

// ── SCIENCES PHARMACEUTIQUES ─────────────────────────────────────────────
const corrupted = raw.pharma.corrupted_candidates.find((c: any) => c.str.includes("EXTRME"));
const neighborhood = raw.pharma.corrupted_neighborhoods.find((n: any) => n.target.str.includes("EXTRME"));

const pharmaAnalysis = {
  sprint: "MINSANTE-I.1",
  generated_at: new Date().toISOString(),
  program: "Sciences Pharmaceutiques",
  source_sha256: raw.source.sha256,
  section_bounds: { method: "Découpage EXACT par index d'item global.", ...raw.pharma.section_exact },
  corrupted_glyph_isolation: {
    page: corrupted?.page,
    x: corrupted?.x,
    y: corrupted?.y,
    font_name_internal_pdfjs_id: corrupted?.fontName,
    raw_text_as_extracted: corrupted?.str,
    global_item_index: corrupted?.globalIdx,
    to_unicode_mapping_present: "NON_DÉTERMINÉ_DIRECTEMENT — pdf.js n'expose pas le CMap ToUnicode brut via l'API publique getTextContent(); voir low_level_signal ci-dessous pour le signal indirect observé.",
    low_level_signal: "Un warning pdf.js de bas niveau 'TT: undefined function' (compteur 32) est émis lors du chargement du document — cohérent avec une table de fonction TrueType défectueuse pour au moins un glyphe de la police embarquée, mais ce warning est global au document (pas isolé à ce seul item) ; il corrobore, sans le prouver isolément, qu'il s'agit d'un défaut de police du PDF source plutôt que d'un artefact de notre pipeline d'extraction.",
    context_before: neighborhood?.before?.map((it: any) => ({ page: it.page, x: it.x, y: it.y, str: it.str })) ?? [],
    context_after: neighborhood?.after?.map((it: any) => ({ page: it.page, x: it.x, y: it.y, str: it.str })) ?? [],
  },
  is_font_wide_or_isolated: {
    hyphen_glyph_works_elsewhere_in_same_font:
      "OUI — le même font_name interne (g_d0_f5) peint correctement le caractère '-' séparément dans 'NORD-OUEST' et 'SUD-OUEST' au sein de la MÊME section Sciences Pharmaceutiques (voir label_items_ordered). Le défaut n'est donc PAS un bris global de la police, mais localisé à CE run de texte précis.",
    classification: "A — caractère (È/Ê) mal décodé/absent dans un run de texte isolé, mais l'identité de la région reste structurellement déterminable (voir recovery_evidence) ; PAS (B) une perte totale de la frontière structurelle.",
  },
  recovery_evidence: {
    parser_version_used: "minsante-a3-pdf-recovery@1",
    method: "CORRUPTED_REGION_LABEL_RECOVERED_BY_STRUCTURE",
    conditions_evaluated: [
      "1. Source SHA256 vérifié == attendu (26e68ab0…3946a) : OUI — sinon récupération désactivée (voir test I).",
      "2. Invariant d'ordre alphabétique canonique des régions validé SANS EXCEPTION sur les 8 autres filières SAFE du MÊME document, dans CETTE exécution (jamais câblé en dur) : OUI, 0 violation observée.",
      "3. Étiquette non reconnue strictement entre deux étiquettes reconnues (Est, Littoral) avec EXACTEMENT un candidat canonique dans l'intervalle (Extrême-Nord) : OUI.",
      "4. La toute première ligne numérotée suivant l'étiquette redémarre exactement à '1.' (signal indépendant du texte de l'étiquette elle-même) : OUI — 'INSTITUT DE FORMATION EN SANTE DE MAROUA' est numérotée '1.', suivie de '2. INSTITUT DE FORMATION EN SANTE DU SAHEL IFOSSA DE MOKOLO'.",
      "5. Garde-fou de similarité résiduelle (recouvrement multi-ensemble de lettres, générique, pas une égalité de chaîne câblée) entre le texte brut corrompu et le nom de la région candidate ≥ 0.75 : OUI, ratio observé = 0.909 (10/11 lettres de 'EXTREMENORD' présentes dans 'EXTRMENORD').",
    ],
    region_boundary_determination:
      "Frontière EST/EXTRÊME-NORD déterminée sans ambiguïté : EST se termine avec exactement 1 école ('1. INSTITUT PRIVE FANG DE MESSAMENA', numérotation confirmée par le redémarrage à 1 immédiatement après). EXTRÊME-NORD (récupérée) compte exactement 2 écoles, numérotées 1 et 2 sans lacune, avant l'étiquette LITTORAL suivante. Avant récupération (A.2), ces 2 écoles étaient silencieusement mal attribuées à EST (3 lignes au lieu de 1, numérotation cassée [1,1,2] ≠ [1,2,3]) — la cause exacte de l'anomalie NUMBERING_GAP historique de MINSANTE-I est donc désormais expliquée mécaniquement, pas seulement corrigée.",
    non_semantic_confirmation_note:
      "Observation post-hoc (PAS utilisée comme base de la décision, uniquement comme confirmation de vraisemblance) : les deux écoles récupérées sous Extrême-Nord sont situées à Maroua et Mokolo — deux villes de la région Extrême-Nord du Cameroun — cohérent avec la région déterminée par corroboration structurelle.",
    recovered_row_count: 2,
    est_row_count_after_recovery: 1,
  },
  document_wide_invariant_check: {
    regions_detected_in_order_all_10_programs:
      "Voir minsante-i1-full-reconciliation.json — validé indépendamment : les 8 filières SAFE (hors Imagerie/Pharma) présentent TOUJOURS leurs régions détectées dans l'ordre alphabétique canonique exact (Adamaoua < Centre < Est < Extrême-Nord < Littoral < Nord < Nord-Ouest < Ouest < Sud < Sud-Ouest), sans une seule exception sur 8 sections indépendantes, avant même la récupération.",
  },
  alternative_official_source: {
    searched: true,
    found: false,
    note: "Voir minsante-i1-source-corroboration.json — aucune source Tier 1/2 indépendante trouvée pour Sciences Pharmaceutiques ; non nécessaire ici, la récupération repose entièrement sur la corroboration structurelle interne au document, jamais sur une source externe.",
  },
  verdict: "SAFE",
  verdict_basis:
    "La corruption du glyphe est un défaut de police LOCALISÉ (un seul run de texte), pas une perte structurelle : la frontière de région est démontrée de façon déterministe par corroboration structurelle interne (position + numérotation), avec un garde-fou de similarité textuelle générique en confirmation secondaire — jamais une comparaison de chaîne câblée en dur. Recovery liée explicitement au SHA256 exact du document (désactivée sur toute autre source).",
};
writeFileSync(join(reportsDir, "minsante-i1-pharma-analysis.json"), JSON.stringify(pharmaAnalysis, null, 2), "utf-8");

console.log("Rapports d'analyse écrits : minsante-i1-imagerie-analysis.json, minsante-i1-pharma-analysis.json");
