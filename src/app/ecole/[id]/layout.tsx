import type { Metadata } from "next";
import { supabase } from "@/lib/supabase";
import { formatSchoolLocation } from "@/lib/formatSchoolLocation";

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");

async function fetchSchool(id: string) {
  const { data } = await supabase
    .from("establishments")
    .select("name, city, region, neighborhood, address, phone, main_category, description, cover_image_url, latitude, longitude")
    .eq("id", id)
    .single();
  return data;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const data = await fetchSchool(id);

  if (!data) {
    return {
      title: "École introuvable — Écoles237",
      description: "Cet établissement n'existe pas sur Écoles237.",
    };
  }

  const location = formatSchoolLocation({ city: data.city, region: data.region });
  const title = location ? `${data.name} — ${location} | Écoles237` : `${data.name} | Écoles237`;
  const description = data.description
    ? data.description.slice(0, 155)
    : location
      ? `Découvrez ${data.name}, établissement ${data.main_category} à ${location}. Préinscription en ligne sur Écoles237.`
      : `Découvrez ${data.name}, établissement ${data.main_category} référencé sur Écoles237. Préinscription en ligne.`;

  return {
    title,
    description,
    alternates: {
      canonical: `/ecole/${id}`,
    },
    openGraph: {
      title,
      description,
      type: "website",
      locale: "fr_CM",
      siteName: "Écoles237",
      ...(data.cover_image_url ? { images: [{ url: data.cover_image_url }] } : {}),
    },
    twitter: {
      card: data.cover_image_url ? "summary_large_image" : "summary",
      title,
      description,
      ...(data.cover_image_url ? { images: [data.cover_image_url] } : {}),
    },
  };
}

export default async function SchoolLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await fetchSchool(id);

  if (!data) {
    return <>{children}</>;
  }

  const schoolJsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "School",
    name: data.name,
    url: `${SITE_URL}/ecole/${id}`,
    ...(data.description ? { description: data.description } : {}),
    ...(data.phone ? { telephone: data.phone } : {}),
    ...(data.cover_image_url ? { image: data.cover_image_url } : {}),
    address: {
      "@type": "PostalAddress",
      ...(data.city ? { addressLocality: data.city } : {}),
      addressCountry: "CM",
      ...(data.neighborhood ? { addressRegion: data.neighborhood } : {}),
      ...(data.address ? { streetAddress: data.address } : {}),
    },
    ...(data.latitude != null && data.longitude != null
      ? {
          geo: {
            "@type": "GeoCoordinates",
            latitude: data.latitude,
            longitude: data.longitude,
          },
        }
      : {}),
  };

  return (
    <>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schoolJsonLd) }}
      />
      {children}
    </>
  );
}
