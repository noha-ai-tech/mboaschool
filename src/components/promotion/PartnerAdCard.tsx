"use client";

// Annonces & partenaires — aucun modèle de données annonceurs réel n'existe
// encore côté Supabase (pas de migration créée pour ce sprint, comme
// demandé). Le panneau reste entièrement invisible tant que `ads` est vide :
// jamais de faux annonceur, jamais de sponsor inventé. Le label sponsorLabel
// ("Annonce" / "Partenaire") est obligatoire pour ne jamais masquer la
// nature sponsorisée du contenu quand une vraie donnée existera.
export type PartnerAd = {
  id: string;
  sponsorLabel: "Annonce" | "Partenaire";
  label: string;
  description: string;
  href: string;
  logo?: string | null;
};

export function PartnerAdCard({ ads }: { ads: PartnerAd[] }) {
  if (ads.length === 0) return null;

  return (
    <div className="bg-white border border-border rounded-[18px] overflow-hidden">
      <div className="px-4 py-3 border-b border-border">
        <h3 className="font-bold text-sm">Annonces &amp; partenaires</h3>
      </div>
      <div className="p-3 space-y-2">
        {ads.slice(0, 2).map((ad) => (
          <a
            key={ad.id}
            href={ad.href}
            className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-muted transition-colors duration-base"
          >
            {ad.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={ad.logo} alt="" className="w-8 h-8 rounded-lg object-cover shrink-0" />
            ) : (
              <div className="w-8 h-8 rounded-lg bg-muted shrink-0" aria-hidden="true" />
            )}
            <div className="min-w-0">
              <span className="inline-block text-[9px] font-bold uppercase tracking-wider text-text-secondary bg-muted px-1.5 py-0.5 rounded mb-1">
                {ad.sponsorLabel}
              </span>
              <p className="text-sm font-semibold truncate">{ad.label}</p>
              <p className="text-xs text-text-secondary line-clamp-1">{ad.description}</p>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
