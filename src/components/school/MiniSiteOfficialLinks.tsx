import { Globe, ExternalLink, Landmark } from "lucide-react";
import { ministryLinksForCategory } from "@/lib/schoolPage/category";

// PUBLIC-SITE-01 §4F — official links & resources. "Notre établissement"
// only lists `website` (the only such column that exists on
// establishments — no facebook/e-learning/admissions-portal fields in
// schema). "Institutional resources" uses the category-aware ministry
// helper (§9) so it never shows every ministry regardless of category.
export function MiniSiteOfficialLinks({
  category,
  website,
}: {
  category: string | null;
  website: string | null;
}) {
  const ministries = ministryLinksForCategory(category);

  if (!website && ministries.length === 0) return null;

  return (
    <div id="ressources" className="bg-white border border-border rounded-card p-6 scroll-mt-20">
      <h2 className="font-bold text-sm mb-4">Liens & ressources</h2>
      <div className="grid sm:grid-cols-2 gap-6">
        {website && (
          <div>
            <p className="text-[10px] font-bold tracking-widest uppercase text-text-secondary mb-3">Notre établissement</p>
            <a
              href={website}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm font-semibold text-text-primary hover:text-primary transition-colors duration-base"
            >
              <Globe size={14} className="text-text-secondary shrink-0" />
              Site officiel
              <ExternalLink size={11} className="text-text-secondary/60" />
            </a>
          </div>
        )}
        {ministries.length > 0 && (
          <div>
            <p className="text-[10px] font-bold tracking-widest uppercase text-text-secondary mb-3">Ressources institutionnelles</p>
            <div className="space-y-2">
              {ministries.map((m) => (
                <a
                  key={m.shortLabel}
                  href={m.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm font-semibold text-text-primary hover:text-primary transition-colors duration-base"
                >
                  <Landmark size={14} className="text-text-secondary shrink-0" />
                  {m.shortLabel}
                  <ExternalLink size={11} className="text-text-secondary/60" />
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
