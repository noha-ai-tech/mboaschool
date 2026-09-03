import Image from "next/image";
import Link from "next/link";
import { Phone, Mail, MapPin, Globe, Heart, BookOpen, Compass, ShieldCheck, Sprout, Users as UsersIcon } from "lucide-react";
import { GeneralTab } from "@/components/school/GeneralTab";
import { ContactRow } from "@/components/school/ContactRow";
import { computeMiniSiteFlags, type MiniSiteRendererData } from "@/lib/schoolPage/miniSiteData";
import { classifySchoolGalleryImage } from "@/lib/school/galleryGroups";
import { parseValuesFromText, stripValuesFromText } from "@/lib/school/parseValuesFromText";
import { ViewBanner } from "@/components/school/views/ViewBanner";
import { ViewShell, ViewContextMenu, EmptyViewNote } from "@/components/school/views/ViewShell";

const VALUE_ICONS = [Heart, BookOpen, Compass, ShieldCheck, Sprout, UsersIcon];

// GUYSKULL-06 §9 — dedicated "L'établissement" editorial page: a compact
// banner, then Présentation / Histoire / Mission & Vision / Valeurs /
// Infrastructures / Contact, alternating text/image where a representative
// visual-pack photo exists. Unknown fields hide gracefully, as before —
// only the presentation changed, never the underlying data model.
export function EtablissementView({ data }: { data: MiniSiteRendererData }) {
  const { establishment: school, fees, infra, images } = data;
  const flags = computeMiniSiteFlags(data);
  const address = [school.address, school.neighborhood, school.city].filter(Boolean).join(", ");
  const hasLocation = !!(school.latitude && school.longitude);
  const mapsHref = hasLocation ? `https://www.google.com/maps?q=${school.latitude},${school.longitude}` : null;

  const historyImage = images.find((img) => ["courtyard", "campus"].includes(classifySchoolGalleryImage(img)));
  const values = parseValuesFromText(school.vision);
  const visionText = values.length > 0 ? stripValuesFromText(school.vision) : school.vision;

  return (
    <>
      <ViewBanner
        eyebrow={school.name}
        title="L'établissement"
        subtitle={school.description}
        images={images}
        preferredGroups={["campus", "courtyard"]}
      />
      <ViewShell>
        <ViewContextMenu
          items={[
            flags.showPresentation ? { id: "presentation", label: "Présentation" } : null,
            school.history ? { id: "historique", label: "Historique" } : null,
            (school.mission || school.vision) ? { id: "mission-vision", label: "Mission & Vision" } : null,
            values.length > 0 ? { id: "valeurs", label: "Valeurs" } : null,
            flags.showInfrastructure ? { id: "infrastructures", label: "Infrastructures" } : null,
            flags.showContact ? { id: "contact", label: "Contact" } : null,
          ]}
        />
        <div className="flex-1 w-full space-y-5 min-w-0">
          {(flags.showPresentation || flags.showInfrastructure) && (
            <GeneralTab
              school={school}
              fees={fees}
              infra={infra}
              sections={{ presentation: flags.showPresentation, tarifs: false, infrastructures: flags.showInfrastructure }}
            />
          )}

          {school.history && (
            <div id="historique" className={`bg-white border border-border rounded-card overflow-hidden scroll-mt-20 ${historyImage ? "grid sm:grid-cols-[1fr_260px]" : ""}`}>
              <div className="p-6">
                <h2 className="font-bold text-sm mb-4">Historique</h2>
                <p className="text-text-secondary text-sm leading-relaxed whitespace-pre-wrap">{school.history}</p>
              </div>
              {historyImage && (
                <div className="relative min-h-[180px] sm:min-h-full">
                  <Image src={historyImage.url} alt={historyImage.caption ?? ""} fill sizes="260px" className="object-cover" />
                </div>
              )}
            </div>
          )}

          {(school.mission || visionText) && (
            <div id="mission-vision" className="grid sm:grid-cols-2 gap-4">
              {school.mission && (
                <div className="bg-white border border-border rounded-card p-6" style={{ borderTop: "3px solid var(--school-primary, #0F2A4A)" }}>
                  <h2 className="font-bold text-sm mb-2">Mission</h2>
                  <p className="text-text-secondary text-sm leading-relaxed whitespace-pre-wrap">{school.mission}</p>
                </div>
              )}
              {visionText && (
                <div className="bg-white border border-border rounded-card p-6" style={{ borderTop: "3px solid var(--school-accent-gold, #C9A24B)" }}>
                  <h2 className="font-bold text-sm mb-2">Vision</h2>
                  <p className="text-text-secondary text-sm leading-relaxed whitespace-pre-wrap">{visionText}</p>
                </div>
              )}
            </div>
          )}

          {values.length > 0 && (
            <div id="valeurs" className="rounded-card p-6 scroll-mt-20" style={{ backgroundColor: "var(--school-muted, #F4F3EF)" }}>
              <h2 className="font-bold text-sm mb-4">Nos valeurs</h2>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {values.map((v, i) => {
                  const Icon = VALUE_ICONS[i % VALUE_ICONS.length];
                  return (
                    <div key={v.label} className="flex items-start gap-3 rounded-xl bg-white p-3.5 border border-border/60">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: "var(--school-muted, #F4F3EF)", color: "var(--school-primary, #0F2A4A)" }}>
                        <Icon size={15} />
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-xs text-text-primary">{v.label}</p>
                        <p className="text-xs text-text-secondary leading-relaxed mt-0.5">{v.description}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {flags.showContact && (
            <div id="contact" className="rounded-card p-6 scroll-mt-20 text-white" style={{ backgroundColor: "var(--school-primary-dark, #0A0F0D)" }}>
              <h2 className="font-bold text-sm mb-4">Contact</h2>
              {!school.phone && !school.email && !address ? (
                <p className="text-sm text-white/60">Coordonnées non renseignées par l&apos;établissement.</p>
              ) : (
                <div className="grid sm:grid-cols-2 gap-4">
                  {school.phone && <ContactRow icon={Phone} label="Téléphone" value={school.phone} href={`tel:${school.phone}`} dark />}
                  {school.email && <ContactRow icon={Mail} label="Email" value={school.email} href={`mailto:${school.email}`} dark />}
                  {address && <ContactRow icon={MapPin} label="Adresse" value={address} href={mapsHref ?? undefined} dark />}
                  {school.website && <ContactRow icon={Globe} label="Site web" value={school.website} href={school.website} dark />}
                </div>
              )}
              {data.mode === "public" && !school.owner_id && (
                <p className="text-xs text-white/50 mt-4 pt-4 border-t border-white/10">
                  Vous représentez cet établissement ?{" "}
                  <Link href={`/revendiquer/${school.id}`} className="font-semibold text-white/80 hover:text-white underline">
                    Revendiquez cette fiche
                  </Link>
                </p>
              )}
            </div>
          )}
          {!flags.showPresentation && !flags.showInfrastructure && !flags.showContact && !school.history && !flags.hasIdentityText && <EmptyViewNote />}
        </div>
      </ViewShell>
    </>
  );
}
