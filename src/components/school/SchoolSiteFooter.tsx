import Link from "next/link";
import { Phone, Mail, MapPin, Globe, MessageCircle, ExternalLink } from "lucide-react";
import { MINISITE_VIEWS, buildMiniSiteViewHref } from "@/lib/schoolPage/miniSiteViews";
import { ministryLinksForCategory } from "@/lib/schoolPage/category";
import { schoolMonogram } from "@/lib/school/schoolMonogram";

// PUBLIC-SITE-01 §4H — school-specific footer. Deliberately NOT the full
// Écoles237 SiteFooter (§2) — only a discreet "Propulsé par Écoles237"
// mention remains, per the mission's explicit wording.
//
// GUYSKULL-06 §13 / GUYSKULL-06C §20 — 4 columns (identity / navigation /
// contact / resources) on a subtle dark-navy tonal surface (the school's
// own primary token, not the platform's), so the footer reads as a
// deliberate, memorable close rather than the same light-grey band as
// every other section — and unmistakably NOT the global Écoles237 footer.
// Generic for every school: navigation reuses the same 5 mini-site views,
// resources reuses the same category-aware ministry helper as
// MiniSiteOfficialLinks — no social-media links or opening hours are ever
// shown, since no such data exists on establishments.
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
    <footer className="text-white" style={{ backgroundColor: "var(--school-primary-dark, #0A0F0D)" }}>
      <div className="max-w-[1280px] mx-auto px-4 lg:px-6 py-14 grid sm:grid-cols-2 lg:grid-cols-[1.3fr_1fr_1fr_1fr] gap-10">
        <div>
          <div className="flex items-center gap-3 mb-3">
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center font-black text-sm shrink-0"
              style={{ backgroundColor: "var(--school-accent-gold, #C9A24B)", color: "var(--school-primary-dark, #0A0F0D)", fontFamily: "Georgia, 'Times New Roman', serif" }}
            >
              {schoolMonogram(name)}
            </div>
            <p className="font-black text-white">{name}</p>
          </div>
          {motto && <p className="text-xs text-white/60 italic">{motto}</p>}
          {description && (
            <p className="text-sm text-white/55 mt-3 leading-relaxed max-w-[300px] line-clamp-4">{description}</p>
          )}
        </div>

        <div>
          <p className="text-[10px] font-bold tracking-widest uppercase text-white/40 mb-3.5">Navigation</p>
          <div className="flex flex-col gap-2.5">
            {MINISITE_VIEWS.map((view) => (
              <Link key={view.key} href={buildMiniSiteViewHref(baseHref, view.key)} className="text-sm text-white/70 hover:text-white transition-colors duration-base">
                {view.label}
              </Link>
            ))}
          </div>
        </div>

        {hasContact && (
          <div>
            <p className="text-[10px] font-bold tracking-widest uppercase text-white/40 mb-3.5">Contact</p>
            <div className="space-y-2.5">
              {address && (
                <p className="flex items-center gap-2 text-sm text-white/70">
                  <MapPin size={13} className="shrink-0 text-white/40" /> {address}
                </p>
              )}
              {phone && (
                <a href={`tel:${phone}`} className="flex items-center gap-2 text-sm text-white/70 hover:text-white transition-colors duration-base">
                  <Phone size={13} className="shrink-0 text-white/40" /> {phone}
                </a>
              )}
              {whatsapp && (
                <a
                  href={`https://wa.me/${whatsapp.replace(/\D/g, "")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-white/70 hover:text-white transition-colors duration-base"
                >
                  <MessageCircle size={13} className="shrink-0 text-white/40" /> WhatsApp
                </a>
              )}
              {email && (
                <a href={`mailto:${email}`} className="flex items-center gap-2 text-sm text-white/70 hover:text-white transition-colors duration-base">
                  <Mail size={13} className="shrink-0 text-white/40" /> {email}
                </a>
              )}
              {website && (
                <a href={website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-white/70 hover:text-white transition-colors duration-base">
                  <Globe size={13} className="shrink-0 text-white/40" /> Site officiel
                </a>
              )}
            </div>
          </div>
        )}

        {ministries.length > 0 && (
          <div>
            <p className="text-[10px] font-bold tracking-widest uppercase text-white/40 mb-3.5">Ressources utiles</p>
            <div className="flex flex-col gap-2.5">
              {ministries.map((m) => (
                <a
                  key={m.shortLabel}
                  href={m.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-sm text-white/70 hover:text-white transition-colors duration-base"
                >
                  {m.shortLabel}
                  <ExternalLink size={11} className="text-white/40" />
                </a>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-white/10">
        <div className="max-w-[1280px] mx-auto px-4 lg:px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-white/40">
          <p>© {new Date().getFullYear()} {name}</p>
          <Link href="/" className="hover:text-white/70 transition-colors duration-base">
            Propulsé par Écoles237
          </Link>
        </div>
      </div>
    </footer>
  );
}
