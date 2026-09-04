import Link from "next/link";
import { ClipboardList, Globe, Mail, MapPin, MessageCircle, Phone, ShieldCheck } from "lucide-react";
import type { MiniSiteRendererData } from "@/lib/schoolPage/miniSiteData";

export function SchoolQuickInfoAside({ data }: { data: MiniSiteRendererData }) {
  const school = data.establishment;
  const address = [school.address, school.neighborhood, school.city].filter(Boolean).join(", ");
  const mapsHref = school.latitude && school.longitude ? `https://www.google.com/maps?q=${school.latitude},${school.longitude}` : null;
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
          <Link href={data.preinscriptionHref} className="flex h-12 items-center justify-center gap-2 rounded-xl bg-emerald-600 text-sm font-bold text-white transition-colors hover:bg-emerald-700">
            <ClipboardList size={17} /> Inscrire mon enfant
          </Link>
        )}
        <div className="mt-2 grid gap-2">
          {school.phone && <a href={`tel:${school.phone}`} className="flex h-10 items-center justify-center gap-2 rounded-xl border border-border text-sm font-bold text-[var(--school-primary)] hover:bg-muted"><Phone size={15} /> Contacter l&apos;établissement</a>}
          {whatsappHref && <a href={whatsappHref} target="_blank" rel="noopener noreferrer" className="flex h-10 items-center justify-center gap-2 rounded-xl border border-border text-sm font-bold text-[var(--school-primary)] hover:bg-muted"><MessageCircle size={15} className="text-emerald-600" /> Écrire sur WhatsApp</a>}
        </div>
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
    </aside>
  );
}
