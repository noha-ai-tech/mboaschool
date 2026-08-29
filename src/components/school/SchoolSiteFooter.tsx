import Link from "next/link";
import { Phone, Mail, MapPin, Globe, MessageCircle } from "lucide-react";

// PUBLIC-SITE-01 §4H — school-specific footer. Deliberately NOT the full
// Écoles237 SiteFooter (§2) — only a discreet "Propulsé par Écoles237"
// mention remains, per the mission's explicit wording.
export function SchoolSiteFooter({
  name,
  motto,
  description,
  address,
  phone,
  whatsapp,
  email,
  website,
}: {
  name: string;
  motto?: string | null;
  description: string | null;
  address: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  website: string | null;
}) {
  const hasContact = !!(address || phone || email || website);

  return (
    <footer className="bg-[#F4F4F2] border-t border-border">
      <div className="max-w-[1280px] mx-auto px-4 lg:px-6 py-10 grid sm:grid-cols-2 gap-8">
        <div>
          <p className="font-black text-text-primary">{name}</p>
          {motto && <p className="text-xs text-text-secondary italic mt-1">{motto}</p>}
          {description && (
            <p className="text-sm text-text-secondary mt-3 leading-relaxed max-w-[420px] line-clamp-3">{description}</p>
          )}
        </div>

        {hasContact && (
          <div className="sm:text-right space-y-2">
            {address && (
              <p className="flex items-center sm:justify-end gap-2 text-sm text-text-secondary">
                <MapPin size={13} className="shrink-0" /> {address}
              </p>
            )}
            {phone && (
              <a href={`tel:${phone}`} className="flex items-center sm:justify-end gap-2 text-sm text-text-secondary hover:text-text-primary">
                <Phone size={13} className="shrink-0" /> {phone}
              </a>
            )}
            {whatsapp && (
              <a
                href={`https://wa.me/${whatsapp.replace(/\D/g, "")}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center sm:justify-end gap-2 text-sm text-text-secondary hover:text-text-primary"
              >
                <MessageCircle size={13} className="shrink-0" /> WhatsApp
              </a>
            )}
            {email && (
              <a href={`mailto:${email}`} className="flex items-center sm:justify-end gap-2 text-sm text-text-secondary hover:text-text-primary">
                <Mail size={13} className="shrink-0" /> {email}
              </a>
            )}
            {website && (
              <a href={website} target="_blank" rel="noopener noreferrer" className="flex items-center sm:justify-end gap-2 text-sm text-text-secondary hover:text-text-primary">
                <Globe size={13} className="shrink-0" /> Site officiel
              </a>
            )}
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
