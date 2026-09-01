import Image from "next/image";
import Link from "next/link";
import { MapPin, Building2, CalendarDays, Users } from "lucide-react";

// PUBLIC-SITE-01 §4C / PUBLIC-SITE-02 §3 — homepage "about" teaser. All
// highlights come from real establishments data — category/location
// (existing), founding year / student count (new PUBLIC-SITE-02 CMS
// fields) — never a placeholder.
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
    <div id="etablissement-preview" className="bg-white border border-border rounded-card p-6 grid sm:grid-cols-[220px_1fr] gap-6 items-center">
      {imageUrl && (
        <div className="relative w-full aspect-[4/3] rounded-[16px] overflow-hidden bg-muted">
          <Image src={imageUrl} alt="" fill sizes="220px" className="object-cover" />
        </div>
      )}
      <div>
        <p className="text-[10px] font-bold tracking-widest uppercase text-primary mb-2">À propos</p>
        <p className="text-sm text-text-secondary leading-relaxed mb-4">
          {description || "Cet établissement n'a pas encore renseigné de présentation."}
        </p>
        {highlights.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {highlights.map((h) => (
              <span key={h.text} className="inline-flex items-center gap-1.5 text-xs font-semibold text-text-primary bg-muted px-3 py-1.5 rounded-full">
                <h.icon size={12} className="text-text-secondary" />
                {h.text}
              </span>
            ))}
          </div>
        )}
        <Link href={readMoreHref} className="text-sm font-bold text-primary hover:opacity-80 transition-opacity duration-base">
          Découvrir l&apos;établissement →
        </Link>
      </div>
    </div>
  );
}
