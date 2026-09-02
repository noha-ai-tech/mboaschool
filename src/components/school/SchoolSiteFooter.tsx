import Link from "next/link";
import { Phone, Mail, MapPin, Globe, MessageCircle, ExternalLink } from "lucide-react";
import { MINISITE_VIEWS, buildMiniSiteViewHref } from "@/lib/schoolPage/miniSiteViews";
import { ministryLinksForCategory } from "@/lib/schoolPage/category";

// PUBLIC-SITE-01 §4H — school-specific footer. Deliberately NOT the full
// Écoles237 SiteFooter (§2) — only a discreet "Propulsé par Écoles237"
// mention remains, per the mission's explicit wording.
//
// GUYSKULL-06 §13 — 4 columns (identity / navigation / contact /
// resources), generic for every school: navigation reuses the same 5
// mini-site views, resources reuses the same category-aware ministry
// helper as MiniSiteOfficialLinks — no social-media links or opening
// hours are ever shown, since no such data exists on establishments.
export function SchoolSiteFooter({
  name,
  motto,
  description,
  category,
  baseHref,
  address,
  phone,
  whatsapp,
  email,
  website,
}: {
  name: string;
  motto?: string | null;
  description: string | null;
  category: string | null;
  baseHref: string;
  address: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  website: string | null;
}) {
  const hasContact = !!(address || phone || email || website);
  const ministries = ministryLinksForCategory(category);

  return (
    <footer className="border-t border-border" style={{ backgroundColor: "var(--school-muted, #F4F4F2)" }}>
      <div className="max-w-[1280px] mx-auto px-4 lg:px-6 py-12 grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
        <div>
          <p className="font-black text-text-primary">{name}</p>
          {motto && <p className="text-xs text-text-secondary italic mt-1">{motto}</p>}
          {description && (
            <p className="text-sm text-text-secondary mt-3 leading-relaxed max-w-[280px] line-clamp-4">{description}</p>
          )}
        </div>

        <div>
          <p className="text-[10px] font-bold tracking-widest uppercase text-text-secondary mb-3">Navigation</p>
          <div className="flex flex-col gap-2">
            {MINISITE_VIEWS.map((view) => (
              <Link key={view.key} href={buildMiniSiteViewHref(baseHref, view.key)} className="text-sm text-text-secondary hover:text-text-primary transition-colors duration-base">
                {view.label}
              </Link>
            ))}
          </div>
        </div>

        {hasContact && (
          <div>
            <p className="text-[10px] font-bold tracking-widest uppercase text-text-secondary mb-3">Contact</p>
            <div className="space-y-2">
              {address && (
                <p className="flex items-center gap-2 text-sm text-text-secondary">
                  <MapPin size={13} className="shrink-0" /> {address}
                </p>
              )}
              {phone && (
                <a href={`tel:${phone}`} className="flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary">
                  <Phone size={13} className="shrink-0" /> {phone}
                </a>
              )}
              {whatsapp && (
                <a
                  href={`https://wa.me/${whatsapp.replace(/\D/g, "")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary"
                >
                  <MessageCircle size={13} className="shrink-0" /> WhatsApp
                </a>
              )}
              {email && (
                <a href={`mailto:${email}`} className="flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary">
                  <Mail size={13} className="shrink-0" /> {email}
                </a>
              )}
              {website && (
                <a href={website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary">
                  <Globe size={13} className="shrink-0" /> Site officiel
                </a>
              )}
            </div>
          </div>
        )}

        {ministries.length > 0 && (
          <div>
            <p className="text-[10px] font-bold tracking-widest uppercase text-text-secondary mb-3">Ressources utiles</p>
            <div className="flex flex-col gap-2">
              {ministries.map((m) => (
                <a
                  key={m.shortLabel}
                  href={m.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary transition-colors duration-base"
                >
                  {m.shortLabel}
                  <ExternalLink size={11} className="text-text-secondary/60" />
                </a>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-border">
        <div className="max-w-[1280px] mx-auto px-4 lg:px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-text-secondary/70">
          <p>© {new Date().getFullYear()} {name}</p>
          <Link href="/" className="hover:text-text-secondary transition-colors duration-base">
            Propulsé par Écoles237
          </Link>
        </div>
      </div>
    </footer>
  );
}
