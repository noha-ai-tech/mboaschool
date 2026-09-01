import Link from "next/link";
import { Phone, Mail, MapPin, Globe } from "lucide-react";
import { GeneralTab } from "@/components/school/GeneralTab";
import { ContactRow } from "@/components/school/ContactRow";
import { computeMiniSiteFlags, type MiniSiteRendererData } from "@/lib/schoolPage/miniSiteData";
import { ViewShell, ViewContextMenu, EmptyViewNote } from "@/components/school/views/ViewShell";

// GUYSKULL-05 §5 — dedicated "L'établissement" view: Présentation,
// Histoire, Mission & Vision, Valeurs (embedded in Vision — no separate
// CMS field exists), Infrastructures, Contact. Unknown fields hide
// gracefully, never a fabricated placeholder.
export function EtablissementView({ data }: { data: MiniSiteRendererData }) {
  const { establishment: school, fees, infra } = data;
  const flags = computeMiniSiteFlags(data);
  const address = [school.address, school.neighborhood, school.city].filter(Boolean).join(", ");
  const hasLocation = !!(school.latitude && school.longitude);
  const mapsHref = hasLocation ? `https://www.google.com/maps?q=${school.latitude},${school.longitude}` : null;

  return (
    <ViewShell>
      <ViewContextMenu
        items={[
          flags.showPresentation ? { id: "presentation", label: "Présentation" } : null,
          school.history ? { id: "historique", label: "Historique" } : null,
          (school.mission || school.vision) ? { id: "mission-vision", label: "Mission & Vision" } : null,
          flags.showInfrastructure ? { id: "infrastructures", label: "Infrastructures" } : null,
          flags.showContact ? { id: "contact", label: "Contact" } : null,
        ]}
      />
      <div className="flex-1 w-full space-y-5 min-w-0">
        <h1 className="sr-only">{school.name} — L&apos;établissement</h1>
        {(flags.showPresentation || flags.showInfrastructure) && (
          <GeneralTab
            school={school}
            fees={fees}
            infra={infra}
            sections={{ presentation: flags.showPresentation, tarifs: false, infrastructures: flags.showInfrastructure }}
          />
        )}
        {school.history && (
          <div id="historique" className="bg-white border border-border rounded-card p-6 scroll-mt-20">
            <h2 className="font-bold text-sm mb-4">Historique</h2>
            <p className="text-text-secondary text-sm leading-relaxed whitespace-pre-wrap">{school.history}</p>
          </div>
        )}
        {(school.mission || school.vision) && (
          <div id="mission-vision" className="bg-white border border-border rounded-card p-6 scroll-mt-20 grid sm:grid-cols-2 gap-6">
            {school.mission && (
              <div>
                <h2 className="font-bold text-sm mb-2">Mission</h2>
                <p className="text-text-secondary text-sm leading-relaxed whitespace-pre-wrap">{school.mission}</p>
              </div>
            )}
            {school.vision && (
              <div>
                <h2 className="font-bold text-sm mb-2">Vision</h2>
                <p className="text-text-secondary text-sm leading-relaxed whitespace-pre-wrap">{school.vision}</p>
              </div>
            )}
          </div>
        )}
        {flags.showContact && (
          <div id="contact" className="bg-white border border-border rounded-card p-6 scroll-mt-20">
            <h2 className="font-bold text-sm mb-4">Contact</h2>
            {!school.phone && !school.email && !address ? (
              <p className="text-sm text-text-secondary">Coordonnées non renseignées par l&apos;établissement.</p>
            ) : (
              <div className="grid sm:grid-cols-2 gap-4">
                {school.phone && <ContactRow icon={Phone} label="Téléphone" value={school.phone} href={`tel:${school.phone}`} />}
                {school.email && <ContactRow icon={Mail} label="Email" value={school.email} href={`mailto:${school.email}`} />}
                {address && <ContactRow icon={MapPin} label="Adresse" value={address} href={mapsHref ?? undefined} />}
                {school.website && <ContactRow icon={Globe} label="Site web" value={school.website} href={school.website} />}
              </div>
            )}
            {data.mode === "public" && !school.owner_id && (
              <p className="text-xs text-text-secondary/70 mt-4 pt-4 border-t border-border">
                Vous représentez cet établissement ?{" "}
                <Link href={`/revendiquer/${school.id}`} className="font-semibold text-text-secondary hover:text-primary underline">
                  Revendiquez cette fiche
                </Link>
              </p>
            )}
          </div>
        )}
        {!flags.showPresentation && !flags.showInfrastructure && !flags.showContact && !school.history && !flags.hasIdentityText && <EmptyViewNote />}
      </div>
    </ViewShell>
  );
}
