export type GalleryImageLike = { id: string; url: string; caption?: string | null };

export type SchoolGalleryGroupKey =
  | "campus"
  | "courtyard"
  | "classroom"
  | "pedagogy"
  | "computer"
  | "library"
  | "canteen"
  | "sanitary"
  | "office"
  | "play"
  | "other";

export const SCHOOL_GALLERY_GROUPS: readonly { key: SchoolGalleryGroupKey; label: string; pattern: RegExp }[] = [
  { key: "campus", label: "Campus & façade", pattern: /campus|façade|facade/i },
  { key: "courtyard", label: "Cour & espaces extérieurs", pattern: /\bcour\b|courtyard|extérieur/i },
  { key: "classroom", label: "Salles de classe", pattern: /salle de classe|classroom/i },
  { key: "pedagogy", label: "Activités pédagogiques", pattern: /activité pédagogique|vie scolaire|school life/i },
  { key: "computer", label: "Laboratoire informatique", pattern: /informatique|computer|numérique/i },
  { key: "library", label: "Bibliothèque", pattern: /bibliothèque|library|lecture/i },
  { key: "canteen", label: "Cantine", pattern: /cantine|cafétéria|cafeteria|réfectoire/i },
  { key: "sanitary", label: "Sanitaires", pattern: /sanitaire|toilette|toilet/i },
  { key: "office", label: "Bureau & accueil", pattern: /bureau|accueil|office|réception/i },
  { key: "play", label: "Jeux & motricité", pattern: /aire de jeux|salle de jeux|motricité|sport|playground/i },
];

export function classifySchoolGalleryImage(image: GalleryImageLike): SchoolGalleryGroupKey {
  const caption = image.caption?.trim() ?? "";
  return SCHOOL_GALLERY_GROUPS.find((group) => group.pattern.test(caption))?.key ?? "other";
}

export function groupSchoolGalleryImages(images: GalleryImageLike[]) {
  const buckets = new Map<SchoolGalleryGroupKey, GalleryImageLike[]>();
  for (const image of images) {
    const key = classifySchoolGalleryImage(image);
    buckets.set(key, [...(buckets.get(key) ?? []), image]);
  }

  const ordered = SCHOOL_GALLERY_GROUPS.flatMap((definition) => {
    const groupedImages = buckets.get(definition.key) ?? [];
    return groupedImages.length > 0 ? [{ key: definition.key, label: definition.label, images: groupedImages }] : [];
  });
  const otherImages = buckets.get("other") ?? [];
  if (otherImages.length > 0) ordered.push({ key: "other", label: "Autres vues", images: otherImages });
  return ordered;
}
