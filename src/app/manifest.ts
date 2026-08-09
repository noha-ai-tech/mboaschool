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
    background_color: "#f9f7f2",
    theme_color: "#059669",
    icons: [
      {
        src: "/branding/favicon.png",
        sizes: "any",
        type: "image/png",
      },
    ],
  };
}
