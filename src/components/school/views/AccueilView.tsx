"use client";

import { SchoolShowcase } from "@/components/school/SchoolShowcase";
import type { MiniSiteRendererData } from "@/lib/schoolPage/miniSiteData";

export function AccueilView({ data, baseHref }: { data: MiniSiteRendererData; baseHref: string }) {
  return <SchoolShowcase data={data} baseHref={baseHref} activeView="accueil" />;
}
