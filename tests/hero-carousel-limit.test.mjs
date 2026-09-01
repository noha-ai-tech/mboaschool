import test from "node:test";
import assert from "node:assert/strict";
import { MAX_HERO_CAROUSEL_SLIDES, resolveHeroSlides } from "../src/lib/school/heroMode.ts";

const slides = Array.from({ length: 11 }, (_, index) => ({ id: `slide-${index + 1}`, image: `/image-${index + 1}.png` }));

test("hero carousel displays at most five images while preserving gallery order", () => {
  assert.equal(MAX_HERO_CAROUSEL_SLIDES, 5);
  assert.deepEqual(resolveHeroSlides(slides, "carousel"), slides.slice(0, 5));
  assert.deepEqual(resolveHeroSlides(slides, null), slides.slice(0, 5));
});

test("single-image and disabled hero modes keep their existing behavior", () => {
  assert.deepEqual(resolveHeroSlides(slides, "image"), slides.slice(0, 1));
  assert.deepEqual(resolveHeroSlides(slides, "none"), []);
});
