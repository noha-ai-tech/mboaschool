import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { redactPiiFromHtml } from "../piiRedaction";

/**
 * SPRINT MINESUP-C — régression pour un bug réel : 26/29 fiches détail du
 * pilote Nord-Ouest ont été sauvegardées AVEC un vrai nom de promoteur en
 * clair dans le HTML, sur le point d'être committées dans data/registry/raw/
 * avant que ce défaut soit repéré et corrigé.
 */

describe("redactPiiFromHtml", () => {
  test('redacte "Nom du promoteur" tout en conservant le label et la structure HTML', () => {
    // Nom fictif — jamais un vrai nom de promoteur dans un fixture de test, même pour prouver la redaction.
    const html = '<p><strong>Nom du promoteur</strong> :DOE Jean TESTFIXTURE<br />\n<strong>Région </strong>: North West<br /></p>';
    const result = redactPiiFromHtml(html);
    assert.ok(!result.includes("DOE Jean"));
    assert.ok(!result.includes("TESTFIXTURE"));
    assert.ok(result.includes("<strong>Nom du promoteur</strong>"));
    assert.ok(result.includes("[REDACTED"));
    assert.ok(result.includes("<strong>Région </strong>: North West"));
  });

  test('redacte "Nom du représentant légal" (avec ou sans accent)', () => {
    const html1 = "<strong>Nom du représentant légal</strong> : ROE Richard TESTFIXTURE<br />";
    const html2 = "<strong>Nom du representant legal</strong> : ROE Richard TESTFIXTURE<br />";
    assert.ok(!redactPiiFromHtml(html1).includes("ROE Richard"));
    assert.ok(!redactPiiFromHtml(html2).includes("ROE Richard"));
  });

  test("un champ vide reste vide-mais-redigé (idempotent), jamais d'erreur", () => {
    const html = "<strong>Nom du promoteur</strong> : <br />";
    const result = redactPiiFromHtml(html);
    assert.ok(result.includes("[REDACTED"));
  });

  test("un document sans champ PII reste inchangé", () => {
    const html = "<p><strong>Région</strong> : Nord-Ouest<br /><strong>Ville</strong> : Bamenda</p>";
    assert.equal(redactPiiFromHtml(html), html);
  });

  test("plusieurs occurrences dans le même document sont toutes rédigées", () => {
    const html = "<strong>Nom du promoteur</strong> : Personne A<br /><strong>Nom du représentant légal</strong> : Personne B<br />";
    const result = redactPiiFromHtml(html);
    assert.ok(!result.includes("Personne A"));
    assert.ok(!result.includes("Personne B"));
  });
});
