import test from "node:test";
import assert from "node:assert/strict";
import { classifySchoolGalleryImage, groupSchoolGalleryImages } from "../src/lib/school/galleryGroups.ts";

const image = (id, caption) => ({ id, url: `/${id}.png`, caption });

test("gallery captions map to the requested mini-block titles", () => {
  assert.equal(classifySchoolGalleryImage(image("canteen", "Concept de cantine scolaire")), "canteen");
  assert.equal(classifySchoolGalleryImage(image("toilets", "Concept de sanitaires scolaires")), "sanitary");
  assert.equal(classifySchoolGalleryImage(image("class", "Visuel de salle de classe")), "classroom");
  assert.equal(classifySchoolGalleryImage(image("computer", "Concept de salle informatique")), "computer");
  assert.equal(classifySchoolGalleryImage(image("office", "Concept de bureau et d’accueil scolaire")), "office");
  assert.equal(classifySchoolGalleryImage(image("play", "Concept d’aire de jeux et de motricité")), "play");
});

test("grouping keeps every image exactly once and uses a safe fallback", () => {
  const images = [
    image("campus", "Visuel du campus Guyskull"),
    image("library", "Concept de bibliothèque"),
    image("unknown", null),
  ];
  const groups = groupSchoolGalleryImages(images);
  assert.deepEqual(groups.map((group) => group.label), ["Campus & façade", "Bibliothèque", "Autres vues"]);
  assert.deepEqual(groups.flatMap((group) => group.images.map((item) => item.id)), ["campus", "library", "unknown"]);
});
