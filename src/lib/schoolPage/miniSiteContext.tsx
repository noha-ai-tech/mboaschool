"use client";

import { createContext, useContext } from "react";
import type { MiniSiteRendererData } from "@/lib/schoolPage/miniSiteData";

// GUYSKULL-05 — the 5 mini-site views are now sibling routes under one
// layout (public: src/app/ecole/[id]/layout.tsx; CMS Preview:
// src/app/dashboard/ecole/etablissement/preview/layout.tsx). A Next.js
// layout does not remount across sibling route navigations, so fetching
// once here and handing it down via Context means each of the 5 routes is
// still a real, independent, refresh-safe URL, while the school is fetched
// exactly once per visit (not once per tab click, and not once per view —
// "no duplicated school fetch logic" from a single shared implementation).
export type MiniSiteContextValue = {
  data: MiniSiteRendererData | null;
  loading: boolean;
  /** Human-readable error, or "not found" state — each surface (public/preview) renders its own appropriate empty/error UI around the layout; this context only carries the resolved data. */
  error: string | null;
  baseHref: string;
};

const MiniSiteDataContext = createContext<MiniSiteContextValue | null>(null);

export function MiniSiteDataProvider({ value, children }: { value: MiniSiteContextValue; children: React.ReactNode }) {
  return <MiniSiteDataContext.Provider value={value}>{children}</MiniSiteDataContext.Provider>;
}

/** Throws if used outside a MiniSiteDataProvider — every one of the 5 view pages must be a descendant of the layout that provides it. */
export function useMiniSiteContext(): MiniSiteContextValue {
  const ctx = useContext(MiniSiteDataContext);
  if (!ctx) throw new Error("useMiniSiteContext must be used within MiniSiteDataProvider");
  return ctx;
}
