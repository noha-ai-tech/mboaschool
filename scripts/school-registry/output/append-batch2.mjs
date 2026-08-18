import { readFileSync, writeFileSync } from "node:fs";

const path = "data/registry/normalized/major-cities-secondary-completeness-v1.json";
const batch = JSON.parse(readFileSync(path, "utf-8"));

function add(city, region, name, hint, sourceName, sourceUrl) {
  batch.candidates.push({
    city, region, official_name: name, category_hint: hint,
    source_name: sourceName, source_url: sourceUrl,
    source_type: "tier3", discovery_source: "web_search",
  });
}

const GEN = "Recherche web générale";
const NOURL = "";

// Bafoussam (Ouest)
add("Bafoussam", "Ouest", "Collège de la Réunification Tankou", "college", GEN, NOURL);
add("Bafoussam", "Ouest", "Collège Polyvalent Bilingue Martin Luther King", "college_bilingue", GEN, NOURL);
add("Bafoussam", "Ouest", "Collège Saint-Thomas d'Aquin de Bafoussam", "college_confessionnel", GEN, NOURL);
add("Bafoussam", "Ouest", "Collège la Confiance de Bafoussam", "college", GEN, NOURL);
add("Bafoussam", "Ouest", "Lycée Classique de Bafoussam", "lycee_public", GEN, NOURL);
add("Bafoussam", "Ouest", "Lycée Technique de Bafoussam", "lycee_technique_public", GEN, NOURL);
add("Bafoussam", "Ouest", "Lycée de Bafoussam (Ndiengdam)", "lycee_public", GEN, NOURL);
add("Bafoussam", "Ouest", "Lycée Bilingue de Baleng", "lycee_public", GEN, NOURL);
add("Bafoussam", "Ouest", "Lycée Bilingue de Bafoussam", "lycee_public", GEN, NOURL);
add("Bafoussam", "Ouest", "Lycée Technique de Banengo", "lycee_technique_public", GEN, NOURL);
add("Bafoussam", "Ouest", "Complexe Polytechnique Bilingue Laïc Tama", "college_bilingue", GEN, NOURL);

// Bamenda (Nord-Ouest)
add("Bamenda", "Nord-Ouest", "Sacred Heart College Mankon (SAHECO)", "college_confessionnel", GEN, NOURL);
add("Bamenda", "Nord-Ouest", "Our Lady of Lourdes College Mankon", "college_confessionnel", GEN, NOURL);
add("Bamenda", "Nord-Ouest", "Presbyterian Secondary College Bamenda", "college_confessionnel", GEN, NOURL);
add("Bamenda", "Nord-Ouest", "Progressive Comprehensive School Bamenda", "college", GEN, NOURL);
add("Bamenda", "Nord-Ouest", "PSS Mankon (WTTC Mankon)", "college", GEN, NOURL);
add("Bamenda", "Nord-Ouest", "Government Bilingual High School Bamenda", "lycee_public", GEN, NOURL);
add("Bamenda", "Nord-Ouest", "Gospel Secondary School Bamenda", "college_confessionnel", GEN, NOURL);

// Buea (Sud-Ouest)
add("Buea", "Sud-Ouest", "St. Joseph's College Sasse", "college_confessionnel", GEN, NOURL);
add("Buea", "Sud-Ouest", "Lycée Bilingue de Buéa", "lycee_public", GEN, NOURL);
add("Buea", "Sud-Ouest", "Bishop Rogan College Soppo", "college_confessionnel", GEN, NOURL);
add("Buea", "Sud-Ouest", "Baptist High School Buea", "college_confessionnel", GEN, NOURL);

// Limbe (Sud-Ouest)
add("Limbe", "Sud-Ouest", "National Comprehensive High School Limbe", "lycee_public", GEN, NOURL);
add("Limbe", "Sud-Ouest", "Government Bilingual High School Limbe", "lycee_public", GEN, NOURL);
add("Limbe", "Sud-Ouest", "Saker Baptist College", "college_confessionnel", GEN, NOURL);
add("Limbe", "Sud-Ouest", "Government High School Limbe", "lycee_public", GEN, NOURL);
add("Limbe", "Sud-Ouest", "Enrichetta Comprehensive Secondary School", "college", GEN, NOURL);
add("Limbe", "Sud-Ouest", "Royal Bilingual College Isokolo", "college_bilingue", GEN, NOURL);
add("Limbe", "Sud-Ouest", "Hope High School Idenau", "college", GEN, NOURL);
add("Limbe", "Sud-Ouest", "Presbyterian Girls Secondary School Limbe", "college_confessionnel", GEN, NOURL);

// Kumba (Sud-Ouest)
add("Kumba", "Sud-Ouest", "Full Gospel Secondary School Kumba", "college_confessionnel", GEN, NOURL);
add("Kumba", "Sud-Ouest", "Cameroon College of Arts and Science Kumba (CCAS)", "college", GEN, NOURL);
add("Kumba", "Sud-Ouest", "Jemea Memorial College", "college", GEN, NOURL);
add("Kumba", "Sud-Ouest", "Kumba City College", "college", GEN, NOURL);
add("Kumba", "Sud-Ouest", "St. Francis College Fiango Kumba", "college_confessionnel", "ecolesaucameroun.com", "https://ecolesaucameroun.com/en/school.php?id=4853-st-francis-college-fiango-kumba");
add("Kumba", "Sud-Ouest", "Victory Comprehensive College Kumba", "college", "ecolesaucameroun.com", "https://ecolesaucameroun.com/en/school.php?id=4833-victory-comprehensive-college-kumba");
add("Kumba", "Sud-Ouest", "Presbyterian High School Kumba", "college_confessionnel", GEN, NOURL);
add("Kumba", "Sud-Ouest", "Denis Comprehensive College Kumba", "college", GEN, NOURL);

// Mamfe (Sud-Ouest)
add("Mamfe", "Sud-Ouest", "Government High School Mamfe", "lycee_public", GEN, NOURL);
add("Mamfe", "Sud-Ouest", "Union Comprehensive High School Mamfe", "college", GEN, NOURL);

// Kumbo (Nord-Ouest)
add("Kumbo", "Nord-Ouest", "Government Bilingual High School Kumbo", "lycee_public", GEN, NOURL);
add("Kumbo", "Nord-Ouest", "Christ The King College Kumbo", "college_confessionnel", GEN, NOURL);
add("Kumbo", "Nord-Ouest", "Presbyterian Comprehensive High School Kumbo", "college_confessionnel", GEN, NOURL);

// Garoua (Nord)
add("Garoua", "Nord", "Collège et Lycée Classique et Moderne de Garoua", "lycee_public", GEN, NOURL);
add("Garoua", "Nord", "Collège et Lycée Bilingue de Garoua", "lycee_public", GEN, NOURL);
add("Garoua", "Nord", "Collège et Lycée Technique de Garoua", "lycee_technique_public", GEN, NOURL);
add("Garoua", "Nord", "Collège et Lycée Polyvalent de Garoua", "lycee_public", GEN, NOURL);
add("Garoua", "Nord", "Complexe Scolaire Bilingue Lamido Aman Sa'aly", "college_bilingue", GEN, NOURL);
add("Garoua", "Nord", "Lycée Technique de Bibemiré", "lycee_technique_public", GEN, NOURL);
add("Garoua", "Nord", "Lycée de Garoua Djamboutou", "lycee_public", "ecolesaucameroun.com", "https://ecolesaucameroun.com/ecole.php?id=3042-lycee-de-garoua-djamboutou");
add("Garoua", "Nord", "Lycée Technique de Garoua Djamboutou", "lycee_technique_public", "ecolesaucameroun.com", "https://ecolesaucameroun.com/ecole.php?id=3056-lycee-technique-de-garoua-djamboutou-arrondissement-de-garoua-i");
add("Garoua", "Nord", "Lycée Bilingue de Garoua", "lycee_public", "ecolesaucameroun.com", "https://ecolesaucameroun.com/ecole.php?id=3064-lycee-bilingue-de-garoua");
add("Garoua", "Nord", "Lycée Technique Bilingue de Garoua", "lycee_technique_public", "ecolesaucameroun.com", "https://ecolesaucameroun.com/ecole.php?id=3068-lycee-technique-bilingue-de-garoua-arrondissement-de-garoua-ii");
add("Garoua", "Nord", "Collège Canard", "college", GEN, NOURL);
add("Garoua", "Nord", "Collège Lamido Hayatou", "college", GEN, NOURL);

// Maroua (Extrême-Nord)
add("Maroua", "Extrême-Nord", "Lycée Technique Bilingue de Maroua", "lycee_technique_public", "ecolesaucameroun.com", "https://ecolesaucameroun.com/ecole.php?id=2142-lycee-technique-bilingue-de-maroua");
add("Maroua", "Extrême-Nord", "Lycée de Maroua-Kongola", "lycee_public", "ecolesaucameroun.com", "https://ecolesaucameroun.com/ecole.php?id=2136-lycee-de-maroua-kongola");
add("Maroua", "Extrême-Nord", "Lycée Bilingue de Maroua", "lycee_public", "Wikipédia", "https://fr.wikipedia.org/wiki/Lyc%C3%A9e_bilingue_de_Maroua");

// Bertoua (Est)
add("Bertoua", "Est", "Collège Bilingue de l'Orient de Bertoua", "college_bilingue", "ecolesaucameroun.com", "https://ecolesaucameroun.com/ecole.php?id=2057-college-bilingue-de-lorient-de-bertoua-arrondissement-de-bertoua-ii");
add("Bertoua", "Est", "Collège Adventiste de Bertoua", "college_confessionnel", GEN, NOURL);

// Ebolowa (Sud)
add("Ebolowa", "Sud", "Lycée Classique et Moderne d'Ebolowa", "lycee_public", GEN, NOURL);

// Dschang (Ouest)
add("Dschang", "Ouest", "Lycée Bilingue de Dschang", "lycee_public", GEN, NOURL);
add("Dschang", "Ouest", "Collège Notre-Dame de Dschang", "college_confessionnel", GEN, NOURL);
add("Dschang", "Ouest", "Collège Menoua Espoir de Dschang", "college", GEN, NOURL);
add("Dschang", "Ouest", "Collège Albert Camus de Dschang", "college", GEN, NOURL);
add("Dschang", "Ouest", "Collège la Renaissance de Dschang", "college", GEN, NOURL);
add("Dschang", "Ouest", "Collège Bilingue Intelexi de Dschang", "college_bilingue", GEN, NOURL);
add("Dschang", "Ouest", "Lycée Technique de Dschang", "lycee_technique_public", GEN, NOURL);
add("Dschang", "Ouest", "CETIC de Dschang", "cetic_public", GEN, NOURL);
add("Dschang", "Ouest", "CES de Fonakeukeu", "ces_public", GEN, NOURL);

// Foumban (Ouest)
add("Foumban", "Ouest", "Lycée Bilingue Sultan Ibrahim Njoya de Foumban", "lycee_public", GEN, NOURL);
add("Foumban", "Ouest", "Collège de la Paix Foumban", "college", GEN, NOURL);

// Kousséri (Extrême-Nord)
add("Kousséri", "Extrême-Nord", "Lycée Mixte de Kousséri", "lycee_public", "ecolesaucameroun.com", "https://ecolesaucameroun.com/ecole.php?id=2171-lycee-mixte-de-kousseri-arrondissement-de-kousseri");

// Kribi (Sud)
add("Kribi", "Sud", "Lycée Bilingue de Kribi Urbain", "lycee_public", "Osidimbea — La Mémoire du Cameroun", "https://www.osidimbea-edu.cm/secondaire-1/sud/lycee-kribi-urbain/");
add("Kribi", "Sud", "Lycée Bilingue de Kribi", "lycee_public", "Osidimbea — La Mémoire du Cameroun", "https://www.osidimbea-edu.cm/secondaire-1/sud/lycee-bilingue-kribi/");

// Batouri (Est)
add("Batouri", "Est", "Lycée Bilingue de Batouri", "lycee_public", GEN, NOURL);
add("Batouri", "Est", "Lycée Technique de Batouri", "lycee_technique_public", GEN, NOURL);
add("Batouri", "Est", "Collège Bary", "college", GEN, NOURL);

// Mbouda (Ouest)
add("Mbouda", "Ouest", "Government Bilingual High School Mbouda", "lycee_public", GEN, NOURL);
add("Mbouda", "Ouest", "Government Bilingual Secondary School Banock", "lycee_public", GEN, NOURL);

// Bangangté (Ouest)
add("Bangangté", "Ouest", "Lycée de Bangangté", "lycee_public", GEN, NOURL);

console.log("Total candidates now:", batch.candidates.length);
writeFileSync(path, JSON.stringify(batch, null, 2));
