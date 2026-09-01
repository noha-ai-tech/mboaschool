# GUYSKULL-05E — GROUPED GALLERY AND OFFICE REPORT

Date: 2026-08-31  
Project: `Ecoles237` — `umcwwynrftidytxgqkwi`  
School: `guyskull` — `a4cc4966-0d85-4c63-9c24-0538b8d5133b`

## GALLERY ORGANIZATION

The flat gallery renderer was replaced locally with titled responsive mini-blocks:

- Campus & façade;
- Cour & espaces extérieurs;
- Salles de classe;
- Activités pédagogiques;
- Laboratoire informatique;
- Bibliothèque;
- Cantine;
- Sanitaires;
- Bureau & accueil;
- Jeux & motricité;
- Autres vues, as a safe fallback.

Classification is derived from the existing caption because `school_images` has no category column. Every image remains present exactly once; unknown captions are never assigned to a fabricated category.

## OFFICE VISUAL

- Generated with the built-in image-generation tool using the Guyskull campus master as an architecture/style reference.
- Workspace file: `public/images/guyskull/guyskull-office-reception-concept-v1.png`.
- SHA-256: `66c09cf339aec343103eebc300d6d4ad5dfbe485b77bc6b4cdf14f20e21b8e0b`.
- Caption: `Concept de bureau et d’accueil scolaire — équipement non confirmé par l’établissement.`
- Storage upload: **1**.
- `school_images` insert: **1**, `live`.
- Anonymous public image check: **HTTP 200, image/png, 2,043,859 bytes**.
- Gallery after publication: **13 rows** = 1 prior + 12 generated visuals.

## HERO

- Carousel maximum prepared locally: **5 images**.
- Selected order in production metadata: campus master, facade, courtyard, classroom, pedagogical activity.
- Office timestamp was inserted immediately after the fifth hero image, so it remains in the gallery without entering the selected five.
- Five-image display code deployed: **NO — awaiting separate deployment authorization**.

## SAFETY

- Existing gallery rows changed or deleted during office publication: **NO**.
- Other schools affected: **NO**.
- Exact office rollback evidence: **READY, not executed**.
- Exact hero-order rollback evidence: **READY, not executed**.
- Migration/schema changes: **0**.
- Push/deployment: **NO**.

## IMAGEGEN PROMPT SUMMARY

Photorealistic Guyskull administrative reception and director office in Douala, matching the ivory/navy/ochre campus identity, modest wooden desk and visitor area, warm natural light, no logo, claim, readable text, personal data or watermark. The campus master was used only as visual-reference input.
