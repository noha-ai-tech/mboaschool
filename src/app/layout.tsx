import './globals.css'
import type { Metadata, Viewport } from 'next'
import { Manrope } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { SpeedInsights } from '@vercel/speed-insights/next'

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  display: "swap",
});

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");

export const viewport: Viewport = {
  themeColor: "#0B3B2E",
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Écoles237 — Trouver et inscrire dans une école au Cameroun",
    template: "%s | Écoles237",
  },
  description:
    "Annuaire scolaire camerounais : trouvez, comparez et préinscrivez votre enfant dans les meilleures écoles de Yaoundé, Douala et partout au Cameroun.",
  keywords: ["école cameroun", "inscription scolaire", "école yaoundé", "école douala", "préinscription", "annuaire scolaire"],
  alternates: {
    canonical: "/",
  },
  // Icône d'onglet/app : gérée par convention de fichiers Next.js
  // (src/app/icon.svg pour le favicon, src/app/apple-icon.png pour iOS) —
  // pas besoin de la déclarer ici, Next.js génère les balises <link> voulues.
  openGraph: {
    type: "website",
    locale: "fr_CM",
    siteName: "Écoles237",
    url: SITE_URL,
    title: "Écoles237 — Trouver et inscrire dans une école au Cameroun",
    description:
      "Annuaire scolaire camerounais : trouvez, comparez et préinscrivez votre enfant dans les meilleures écoles.",
    images: ["/branding/logo-light.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Écoles237",
    description: "Annuaire scolaire camerounais — Préinscription en ligne.",
    images: ["/branding/logo-light.png"],
  },
  robots: {
    index: true,
    follow: true,
  },
}

const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Écoles237",
  url: SITE_URL,
  description:
    "Annuaire scolaire camerounais : trouvez, comparez et préinscrivez votre enfant dans les meilleures écoles de Yaoundé, Douala et partout au Cameroun.",
};

const websiteJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "Écoles237",
  url: SITE_URL,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={manrope.variable}>
      <body>
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
        />
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }}
        />
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  )
}
