import Image from "next/image";
import { MapPin, Building2 } from "lucide-react";

// PUBLIC-SITE-01 §4C — homepage "about" teaser. Uses only existing
// establishments columns (description, main_category, city, neighborhood) —
// no motto/history/mission fields exist yet (audited, none in schema.sql),
// so highlights are built from what is genuinely available rather than
// left as placeholders.
export function MiniSiteAboutPreview({
  description,
  categoryLabel,
  city,
  neighborhood,
  imageUrl,
  onReadMore,
}: {
  description: string | null;
  categoryLabel: string | null;
  city: string | null;
  neighborhood: string | null;
  imageUrl: string | null;
  onReadMore: () => void;
}) {
  const highlights = [
    categoryLabel ? { icon: Building2, text: categoryLabel } : null,
    city ? { icon: MapPin, text: neighborhood ? `${neighborhood}, ${city}` : city } : null,
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
        <button onClick={onReadMore} className="text-sm font-bold text-primary hover:opacity-80 transition-opacity duration-base">
          En savoir plus →
        </button>
      </div>
    </div>
  );
}
