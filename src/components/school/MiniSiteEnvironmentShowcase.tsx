import Link from "next/link";
import Image from "next/image";
import { ArrowRight } from "lucide-react";

// GUYSKULL-06C §16 — homepage "second act": a strong editorial photo
// mosaic (max 5 images — never the full gallery) instead of the flat
// horizontal strip, so the homepage keeps building after the first
// editorial row. Generic — takes whatever images the caller passes
// (already resolved from the establishment's own live gallery).
export function MiniSiteEnvironmentShowcase({
  images,
  seeAllHref,
}: {
  images: { id: string; url: string; caption?: string | null }[];
  seeAllHref: string;
}) {
  if (images.length === 0) return null;
  const selection = images.slice(0, 5);
  const [feature, ...rest] = selection;

  return (
    <section>
      <div className="flex items-end justify-between mb-4 gap-4">
        <div>
          <p className="text-[10px] font-bold tracking-widest uppercase mb-1.5" style={{ color: "var(--school-accent-gold, #C9A24B)" }}>
            L&apos;environnement
          </p>
          <h2 className="text-xl font-black tracking-tight text-text-primary">Découvrez notre environnement</h2>
        </div>
        <Link
          href={seeAllHref}
          className="group hidden sm:inline-flex items-center shrink-0 text-sm font-bold hover:opacity-80 transition-opacity duration-base"
          style={{ color: "var(--school-primary, #0F2A4A)" }}
        >
          Explorer la galerie
          <ArrowRight size={15} className="ml-1.5 transition-transform duration-base group-hover:translate-x-0.5" />
        </Link>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 lg:grid-rows-2 gap-3 lg:h-[420px]">
        <ShowcaseTile image={feature} className="col-span-2 row-span-2 aspect-[4/3] lg:aspect-auto" />
        {rest.map((img) => (
          <ShowcaseTile key={img.id} image={img} className="aspect-square lg:aspect-auto" />
        ))}
      </div>

      <Link
        href={seeAllHref}
        className="sm:hidden mt-4 inline-flex items-center text-sm font-bold"
        style={{ color: "var(--school-primary, #0F2A4A)" }}
      >
        Explorer la galerie
        <ArrowRight size={15} className="ml-1.5" />
      </Link>
    </section>
  );
}

function ShowcaseTile({ image, className }: { image: { id: string; url: string; caption?: string | null }; className: string }) {
  return (
    <div className={`group relative overflow-hidden rounded-card bg-muted ${className}`}>
      <Image
        src={image.url}
        alt={image.caption ?? ""}
        fill
        sizes="(max-width: 1024px) 50vw, 320px"
        className="object-cover transition-transform duration-slow ease-out group-hover:scale-[1.04] motion-reduce:group-hover:scale-100"
      />
    </div>
  );
}
