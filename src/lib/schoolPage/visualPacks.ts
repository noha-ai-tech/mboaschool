export type SchoolVisualAssetStatus = "demo" | "facility_confirmation_required" | "activity_confirmation_required";

export type SchoolVisualAsset = {
  id: string;
  src: string;
  label: string;
  caption: string;
  alt: string;
  status: SchoolVisualAssetStatus;
};

export type SchoolVisualPack = {
  slug: string;
  establishmentId: string;
  name: string;
  notice: string;
  assets: readonly SchoolVisualAsset[];
};

const GUYSKULL_ESTABLISHMENT_ID = "a4cc4966-0d85-4c63-9c24-0538b8d5133b";

const GUYSKULL_VISUAL_PACK: SchoolVisualPack = {
  slug: "guyskull",
  establishmentId: GUYSKULL_ESTABLISHMENT_ID,
  name: "Pack visuel Guyskull",
  notice:
    "Visuels conceptuels de démonstration. Ils ne représentent pas des installations vérifiées et ne sont jamais ajoutés automatiquement à la galerie publiée.",
  assets: [
    {
      id: "guyskull-campus-master-v1",
      src: "/images/guyskull/guyskull-campus-master-v1.png",
      label: "Campus — image maîtresse",
      caption: "Visuel de démonstration du campus Guyskull — à valider par l’établissement.",
      alt: "Visualisation de démonstration du campus Guyskull à Douala",
      status: "demo",
    },
    {
      id: "guyskull-facade-v1",
      src: "/images/guyskull/guyskull-facade-v1.png",
      label: "Façade",
      caption: "Visuel de démonstration de la façade Guyskull — à valider par l’établissement.",
      alt: "Visualisation de démonstration de la façade Guyskull",
      status: "demo",
    },
    {
      id: "guyskull-courtyard-v1",
      src: "/images/guyskull/guyskull-courtyard-v1.png",
      label: "Cour intérieure",
      caption: "Visuel de démonstration de la cour intérieure Guyskull — à valider par l’établissement.",
      alt: "Visualisation de démonstration de la cour intérieure Guyskull",
      status: "demo",
    },
    {
      id: "guyskull-classroom-v1",
      src: "/images/guyskull/guyskull-classroom-v1.png",
      label: "Salle de classe",
      caption: "Visuel conceptuel de salle de classe Guyskull — à valider par l’établissement.",
      alt: "Visualisation conceptuelle d’une salle de classe Guyskull",
      status: "demo",
    },
    {
      id: "guyskull-pedagogical-activity-v1",
      src: "/images/guyskull/guyskull-pedagogical-activity-v1.png",
      label: "Activité pédagogique",
      caption: "Activité pédagogique de démonstration — à confirmer par l’établissement.",
      alt: "Visualisation de démonstration d’une activité pédagogique Guyskull",
      status: "activity_confirmation_required",
    },
    {
      id: "guyskull-computer-room-concept-v1",
      src: "/images/guyskull/guyskull-computer-room-concept-v1.png",
      label: "Salle informatique",
      caption: "Concept de salle informatique — équipement non confirmé par l’établissement.",
      alt: "Concept de salle informatique pour Guyskull",
      status: "facility_confirmation_required",
    },
    {
      id: "guyskull-library-concept-v1",
      src: "/images/guyskull/guyskull-library-concept-v1.png",
      label: "Bibliothèque",
      caption: "Concept de bibliothèque — équipement non confirmé par l’établissement.",
      alt: "Concept de bibliothèque et d’espace lecture pour Guyskull",
      status: "facility_confirmation_required",
    },
    {
      id: "guyskull-play-sport-concept-v1",
      src: "/images/guyskull/guyskull-play-sport-concept-v1.png",
      label: "Aire de jeux et motricité",
      caption: "Concept d’aire de jeux et de motricité — équipement non confirmé par l’établissement.",
      alt: "Concept d’aire de jeux et de motricité pour Guyskull",
      status: "facility_confirmation_required",
    },
    {
      id: "guyskull-school-life-concept-v1",
      src: "/images/guyskull/guyskull-school-life-concept-v1.png",
      label: "Vie scolaire",
      caption: "Scène de vie scolaire de démonstration — activité à confirmer par l’établissement.",
      alt: "Concept de vie scolaire et d’activité collective pour Guyskull",
      status: "activity_confirmation_required",
    },
    {
      id: "guyskull-sanitary-concept-v1",
      src: "/images/guyskull/guyskull-sanitary-concept-v1.png",
      label: "Sanitaires",
      caption: "Concept de sanitaires scolaires — équipement à confirmer par l’établissement.",
      alt: "Concept de sanitaires scolaires propres et adaptés aux enfants pour Guyskull",
      status: "facility_confirmation_required",
    },
    {
      id: "guyskull-canteen-concept-v1",
      src: "/images/guyskull/guyskull-canteen-concept-v1.png",
      label: "Cantine",
      caption: "Concept de cantine scolaire — équipement à confirmer par l’établissement.",
      alt: "Concept de cantine scolaire lumineuse pour Guyskull",
      status: "facility_confirmation_required",
    },
    {
      id: "guyskull-office-reception-concept-v1",
      src: "/images/guyskull/guyskull-office-reception-concept-v1.png",
      label: "Bureau & accueil",
      caption: "Concept de bureau et d’accueil scolaire — équipement non confirmé par l’établissement.",
      alt: "Concept de bureau administratif et d’accueil pour Guyskull",
      status: "facility_confirmation_required",
    },
  ],
};

const SCHOOL_VISUAL_PACKS: readonly SchoolVisualPack[] = [GUYSKULL_VISUAL_PACK];

export function getSchoolVisualPack(establishmentId: string | null | undefined, slug?: string | null): SchoolVisualPack | null {
  if (!establishmentId) return null;
  const pack = SCHOOL_VISUAL_PACKS.find((candidate) => candidate.establishmentId === establishmentId) ?? null;
  if (!pack || (slug && slug !== pack.slug)) return null;
  return pack;
}
