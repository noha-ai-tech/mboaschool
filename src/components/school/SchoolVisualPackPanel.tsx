import Image from "next/image";
import Link from "next/link";
import { Eye, Images, LockKeyhole } from "lucide-react";
import type { SchoolVisualPack } from "@/lib/schoolPage/visualPacks";

const STATUS_LABEL = {
  demo: "Démonstration",
  facility_confirmation_required: "Équipement à confirmer",
  activity_confirmation_required: "Activité à confirmer",
} as const;

export function SchoolVisualPackPanel({ pack }: { pack: SchoolVisualPack }) {
  return (
    <section className="mb-5 rounded-card border border-amber-300 bg-amber-50/70 p-4" aria-labelledby="visual-pack-title">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-amber-100 p-2 text-amber-800">
          <Images size={17} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 id="visual-pack-title" className="text-sm font-bold text-text-primary">{pack.name}</h3>
            <span className="rounded-full bg-amber-200/70 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-900">
              Local uniquement
            </span>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-amber-950/75">{pack.notice}</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {pack.assets.map((asset) => (
          <figure key={asset.id} className="overflow-hidden rounded-xl border border-amber-200 bg-white">
            <div className="relative aspect-[4/3] bg-amber-100">
              <Image src={asset.src} alt={asset.alt} fill sizes="(max-width: 640px) 45vw, 180px" className="object-cover" />
            </div>
            <figcaption className="space-y-1.5 p-2">
              <p className="truncate text-[11px] font-bold text-text-primary" title={asset.label}>{asset.label}</p>
              <p className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wide text-amber-800">
                <LockKeyhole size={9} />
                {STATUS_LABEL[asset.status]}
              </p>
            </figcaption>
          </figure>
        ))}
      </div>

      <Link
        href={`/dashboard/ecole/etablissement/preview?visualPack=${encodeURIComponent(pack.slug)}`}
        className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-amber-900 px-4 py-2.5 text-xs font-bold text-white transition-opacity hover:opacity-90"
      >
        <Eye size={14} />
        Prévisualiser le pack sans le publier
      </Link>
    </section>
  );
}
