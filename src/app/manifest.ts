import type { MetadataRoute } from "next";

// Branding V1, Phase 6. Icône unique : /branding/favicon.png.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Écoles237",
    short_name: "Écoles237",
    description:
      "Annuaire scolaire camerounais : trouvez, comparez et préinscrivez votre enfant dans les meilleures écoles du Cameroun.",
    start_url: "/",
    display: "standalone",
    background_color: "#FBF6F2",
    theme_color: "#0B3B2E",
    icons: [
      {
        src: "/branding/favicon.png",
        sizes: "any",
        type: "image/png",
      },
    ],
  };
}
