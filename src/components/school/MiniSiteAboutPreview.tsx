import Image from "next/image";
import Link from "next/link";
import { MapPin, Building2, CalendarDays, Users } from "lucide-react";

// PUBLIC-SITE-01 §4C / PUBLIC-SITE-02 §3 — homepage "about" teaser.
// GUYSKULL-06 §7 — redesigned as a compact card meant to sit in a 3-column
// homepage grid (À propos / Admissions or Résultats / Événements), not a
// full-width block — a small thumbnail on top, a 3-line clamp, and one CTA,
// per the mission's "avoid huge vertical cards" direction. All highlights
// still come from real establishments data — never a placeholder value.
export function MiniSiteAboutPreview({
  description,
  categoryLabel,
  city,
  neighborhood,
  imageUrl,
  foundingYear,
  studentCount,
  readMoreHref,
}: {
  description: string | null;
  categoryLabel: string | null;
  city: string | null;
  neighborhood: string | null;
  imageUrl: string | null;
  foundingYear?: number | null;
  studentCount?: number | null;
  /** GUYSKULL-05 — a real route (L'établissement view). */
  readMoreHref: string;
}) {
  const highlights = [
    categoryLabel ? { icon: Building2, text: categoryLabel } : null,
    city ? { icon: MapPin, text: neighborhood ? `${neighborhood}, ${city}` : city } : null,
    foundingYear != null ? { icon: CalendarDays, text: `Fondé en ${foundingYear}` } : null,
    studentCount != null ? { icon: Users, text: `${studentCount.toLocaleString("fr-FR")} élèves` } : null,
  ].filter(Boolean) as { icon: typeof Building2; text: string }[];

  return (
    <div id="etablissement-preview" className="h-full flex flex-col bg-white border border-border rounded-card overflow-hidden">
      {imageUrl && (
        <div className="relative w-full aspect-[16/9]">
          <Image src={imageUrl} alt="" fill sizes="(max-width: 1024px) 100vw, 33vw" className="object-cover" />
        </div>
      )}
      <div className="flex-1 flex flex-col p-5">
        <p className="text-[10px] font-bold tracking-widest uppercase mb-2" style={{ color: "var(--school-accent-gold, #C9A24B)" }}>À propos</p>
        <p className="text-sm text-text-secondary leading-relaxed mb-3 line-clamp-3">
          {description || "Cet établissement n'a pas encore renseigné de présentation."}
        </p>
        {highlights.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {highlights.slice(0, 2).map((h) => (
              <span key={h.text} className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-text-primary bg-muted px-2.5 py-1 rounded-full">
                <h.icon size={11} className="text-text-secondary" />
                {h.text}
              </span>
            ))}
          </div>
        )}
        <Link href={readMoreHref} className="mt-auto text-sm font-bold hover:opacity-80 transition-opacity duration-base" style={{ color: "var(--school-primary, #0F2A4A)" }}>
          Découvrir l&apos;établissement →
        </Link>
      </div>
    </div>
  );
}
