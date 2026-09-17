"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { ClipboardList, Globe, Mail, MapPin, MessageCircle, Navigation, Phone, ShieldCheck } from "lucide-react";
import type { MiniSiteRendererData } from "@/lib/schoolPage/miniSiteData";

// MODIFICATION 6 — carte de localisation réelle (mêmes tuiles OpenStreetMap
// que /recherche), jamais la photo assombrie + punaise "aperçu illustratif"
// utilisée par la vitrine de démonstration Guyskull : ici la position vient
// des vraies coordonnées de l'établissement, pas d'une image décorative.
const LocalSchoolMap = dynamic(() => import("@/components/LocalSchoolMap"), {
  ssr: false,
  loading: () => <div className="w-full h-full bg-muted animate-pulse" />,
});

export function SchoolQuickInfoAside({ data }: { data: MiniSiteRendererData }) {
  const school = data.establishment;
  const address = [school.address, school.neighborhood, school.city].filter(Boolean).join(", ");
  const hasCoordinates = !!(school.latitude && school.longitude);
  const mapsHref = hasCoordinates ? `https://www.google.com/maps?q=${school.latitude},${school.longitude}` : null;
  const whatsappHref = school.whatsapp ? `https://wa.me/${school.whatsapp.replace(/\D/g, "")}` : null;

  const rows = [
    address ? { icon: MapPin, label: "Localisation", value: address, href: mapsHref } : null,
    school.phone ? { icon: Phone, label: "Téléphone", value: school.phone, href: `tel:${school.phone}` } : null,
    school.whatsapp ? { icon: MessageCircle, label: "WhatsApp", value: school.whatsapp, href: whatsappHref } : null,
    school.email ? { icon: Mail, label: "Email", value: school.email, href: `mailto:${school.email}` } : null,
    school.website ? { icon: Globe, label: "Site web", value: school.website, href: school.website } : null,
  ].filter(Boolean) as { icon: typeof MapPin; label: string; value: string; href: string | null }[];

  return (
    <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
      <div className="rounded-2xl border border-border bg-white p-4 shadow-[0_14px_34px_-24px_rgba(15,42,74,0.4)]">
        {data.mode === "public" && (
          <Link href={data.preinscriptionHref} className="flex h-14 items-center justify-center gap-2.5 rounded-[12px] bg-[#F2AE1F] text-base font-bold text-[#0B3B2E] transition-colors hover:bg-[#D6941A]">
            <ClipboardList size={19} /> Inscription
          </Link>
        )}
        {whatsappHref && (
          <div className="mt-2 grid gap-2">
            <a href={whatsappHref} target="_blank" rel="noopener noreferrer" className="flex h-10 items-center justify-center gap-2 rounded-xl border border-border text-sm font-bold text-[var(--school-primary)] hover:bg-muted"><MessageCircle size={15} className="text-emerald-600" /> Écrire sur WhatsApp</a>
          </div>
        )}
      </div>

      {rows.length > 0 && (
        <div className="rounded-2xl border border-border bg-white p-5 shadow-[0_14px_34px_-24px_rgba(15,42,74,0.4)]">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-black text-[var(--school-primary)]"><ShieldCheck size={17} className="text-emerald-600" /> Informations pratiques</h2>
          <dl className="space-y-3">
            {rows.map((row) => (
              <div key={row.label} className="grid grid-cols-[18px_86px_minmax(0,1fr)] items-start gap-2 text-xs">
                <row.icon size={14} className="mt-0.5 text-emerald-600" />
                <dt className="font-bold text-text-primary">{row.label}</dt>
                <dd className="min-w-0 break-words text-text-secondary">{row.href ? <a href={row.href} target={row.href.startsWith("http") ? "_blank" : undefined} rel={row.href.startsWith("http") ? "noopener noreferrer" : undefined} className="underline decoration-slate-300 underline-offset-2 hover:text-[var(--school-primary)]">{row.value}</a> : row.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {hasCoordinates && (
        <div className="overflow-hidden rounded-2xl border border-border bg-white shadow-[0_14px_34px_-24px_rgba(15,42,74,0.4)]">
          <h2 className="flex items-center gap-2 p-5 pb-3 text-sm font-black text-[var(--school-primary)]"><MapPin size={17} className="text-emerald-600" /> Localisation</h2>
          <div className="relative h-56 w-full">
            <LocalSchoolMap
              center={{ lat: school.latitude as number, lng: school.longitude as number }}
              userLocation={null}
              radiusKm={0}
              schools={[{ id: school.id, name: school.name, city: school.city, lat: school.latitude as number, lng: school.longitude as number }]}
            />
          </div>
          {mapsHref && (
            <a href={mapsHref} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 p-3 text-xs font-bold text-[var(--school-primary)] hover:bg-muted border-t border-border">
              <Navigation size={13} /> Ouvrir dans Google Maps
            </a>
          )}
        </div>
      )}
    </aside>
  );
}
